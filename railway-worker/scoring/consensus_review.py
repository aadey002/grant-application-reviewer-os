"""Committee Consensus Review — consolidates combined reviewer statements.

Reads a Combined Statements PDF (all reviewers' S/M/W findings merged),
validates each statement against NOFO reviewer worksheet questions, and
produces a consensus draft with KEEP / MERGE / REVISE / REMOVE actions.
Preserves verbatim wording and reviewer citations.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

from .safe_review import extract_pdf_pages

logger = logging.getLogger("grant_worker")

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------
CONSENSUS_SYSTEM_PROMPT = """You are the Summary Statement Operator (SSO) for an HRSA federal grant committee review. Your job is to consolidate the combined reviewer statements into a consensus draft.

RULES — follow exactly:

1. REVIEWER WORKSHEET is the controlling question-by-question validation framework. Every statement must be validated against the specific worksheet questions for that criterion.

2. A statement is RETAINED (KEEP) when it accurately answers ANY criterion question from the worksheet — even if it was originally placed under a different question.

3. True DUPLICATES addressing the SAME worksheet question from multiple reviewers are MERGED — keep the most complete version. State which statements were merged.

4. A statement is REMOVED only when it is factually incorrect per the NOFO requirements or the application content. Provide the specific NOFO page and requirement that contradicts it.

5. A statement is REVISED only when it is directionally correct but the wording is inaccurate or overstated. Provide the suggested revised wording in full.

6. WEAKNESSES are reviewed FIRST in each criterion before strengths (per HRSA committee review protocol).

7. Preserve ALL verbatim wording beginning with "The applicant…" — do NOT shorten, summarize, or paraphrase any statement. Output the full text exactly as written in the combined document.

8. Preserve the reviewer citation on every statement (e.g., "Reviewer A", "R-A, R-B"). This identifies the writer.

9. Preserve the page references or citation numbers that accompany each statement in the combined document (e.g., "pp. 8-9", "App p. 33"). These references identify which reviewer wrote the statement. Put them in the reviewer_references field exactly as written.

10. Do NOT add new findings that were not in the combined statements. You are consolidating, not reviewing.

10. Do NOT increase the budget recommendation. If reviewers recommend a reduction, the rationale must be provided.

11. Number all statements sequentially: W1, W2, W3... for weaknesses; S1, S2, S3... for strengths; M1, M2, M3... for mets. Numbers restart per criterion.

12. For the user's own statements (flagged in the input), mark them with is_mine: true so the UI can flag them.

BUDGET RECOMMENDATION (Step 8): Reviewers cannot recommend an increase. If a reduction is recommended, the committee must provide a rationale."""


def _consensus_tool(criteria: list[dict[str, Any]]) -> dict[str, Any]:
    """Build the Claude tool schema for consensus review output."""

    statement_action = {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "number", "type", "verbatim_text", "reviewer_citation",
            "worksheet_question", "action", "rationale",
        ],
        "properties": {
            "number": {
                "type": "string",
                "description": "Sequential ID: W1, W2, S1, S2, M1, etc.",
            },
            "type": {
                "type": "string",
                "enum": ["weakness", "strength", "met"],
            },
            "verbatim_text": {
                "type": "string",
                "description": "Full verbatim text of the statement exactly as written — do NOT shorten or paraphrase",
            },
            "reviewer_citation": {
                "type": "string",
                "description": "Reviewer attribution, e.g. 'Reviewer A', 'R-A, R-B, R-C', 'Dr. T'",
            },
            "reviewer_references": {
                "type": "string",
                "description": "The page references or citation numbers that accompanied this statement in the combined document (e.g. 'pp. 8-9', 'App p. 33, 34'). Preserve exactly as written — these identify the reviewer.",
            },
            "worksheet_question": {
                "type": "string",
                "description": "Which reviewer worksheet question (Q1, Q2, etc.) this statement answers",
            },
            "action": {
                "type": "string",
                "enum": ["KEEP", "MERGE", "REVISE", "REMOVE"],
            },
            "merge_target": {
                "type": "string",
                "description": "If action is MERGE, the target statement number (e.g. 'W1'). Null otherwise.",
            },
            "revised_text": {
                "type": "string",
                "description": "If action is REVISE, the full suggested revised wording. Null otherwise.",
            },
            "rationale": {
                "type": "string",
                "description": "Why this action was taken — for REMOVE, cite the NOFO page/requirement that contradicts it",
            },
            "is_mine": {
                "type": "boolean",
                "description": "True if this statement was written by the user (flagged in input)",
            },
        },
    }

    criterion_consensus = {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "criterion_name", "maximum_points", "worksheet_questions",
            "weaknesses", "strengths", "mets", "score_range",
        ],
        "properties": {
            "criterion_name": {"type": "string"},
            "maximum_points": {"type": "integer"},
            "worksheet_questions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["id", "text"],
                    "properties": {
                        "id": {"type": "string", "description": "Q1, Q2, etc."},
                        "text": {"type": "string", "description": "The NOFO evaluation question text"},
                    },
                },
            },
            "weaknesses": {"type": "array", "items": statement_action},
            "strengths": {"type": "array", "items": statement_action},
            "mets": {"type": "array", "items": statement_action},
            "score_range": {
                "type": "string",
                "description": "Suggested consensus score range, e.g. '18-20/20'",
            },
        },
    }

    return {
        "name": "submit_consensus_review",
        "description": "Submit the committee consensus review with actions for each combined statement.",
        "input_schema": {
            "type": "object",
            "additionalProperties": False,
            "required": [
                "applicant_name", "nofo_number", "criteria",
                "budget_recommendation", "summary",
            ],
            "properties": {
                "applicant_name": {"type": "string"},
                "nofo_number": {"type": "string"},
                "criteria": {
                    "type": "array",
                    "minItems": len(criteria),
                    "maxItems": len(criteria),
                    "items": criterion_consensus,
                },
                "budget_recommendation": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["recommendation", "rationale"],
                    "properties": {
                        "recommendation": {
                            "type": "string",
                            "enum": [
                                "no_reduction",
                                "reduction_recommended",
                                "unable_to_determine",
                            ],
                        },
                        "rationale": {"type": "string"},
                    },
                },
                "summary": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": [
                        "total_findings", "keep_count", "merge_count",
                        "revise_count", "remove_count",
                        "findings_after_consolidation",
                        "suggested_score_range", "motion",
                    ],
                    "properties": {
                        "total_findings": {"type": "integer"},
                        "keep_count": {"type": "integer"},
                        "merge_count": {"type": "integer"},
                        "revise_count": {"type": "integer"},
                        "remove_count": {"type": "integer"},
                        "findings_after_consolidation": {"type": "integer"},
                        "suggested_score_range": {"type": "string"},
                        "motion": {
                            "type": "string",
                            "enum": [
                                "recommend_approval",
                                "recommend_approval_with_conditions",
                                "not_recommend_approval",
                            ],
                        },
                    },
                },
            },
        },
    }


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_consensus_review(
    combined_statement_path: Path,
    nofo_text: str,
    criteria: list[dict[str, Any]],
    user_reviewer_name: str = "",
) -> dict[str, Any]:
    """Run the consensus review on a combined statements document.

    Args:
        combined_statement_path: Path to the combined statements PDF.
        nofo_text: Full NOFO text (already extracted).
        criteria: Extracted rubric criteria list.
        user_reviewer_name: The user's reviewer name for flagging (e.g. "Dr. T", "Reviewer B").

    Returns:
        Consensus review result dict.
    """
    import anthropic

    # --- Extract combined statement text ---
    pages = extract_pdf_pages(combined_statement_path)
    combined_text_parts = []
    for i, page in enumerate(pages, 1):
        text = page.strip()
        if text:
            combined_text_parts.append(f"\n--- COMBINED STATEMENT PAGE {i} ---\n{text}")
    combined_text = "".join(combined_text_parts)

    if not combined_text.strip():
        # Try OCR fallback for scanned PDFs
        try:
            from .safe_review import _try_ocr_page
            import fitz
            with fitz.open(combined_statement_path) as doc:
                ocr_parts = []
                for i, fitz_page in enumerate(doc, 1):
                    ocr_text = _try_ocr_page(fitz_page)
                    if ocr_text and ocr_text.strip():
                        ocr_parts.append(f"\n--- COMBINED STATEMENT PAGE {i} ---\n{ocr_text.strip()}")
                if ocr_parts:
                    combined_text = "".join(ocr_parts)
        except (ImportError, Exception) as e:
            logger.warning("OCR fallback failed: %s", e)

    if not combined_text.strip():
        raise RuntimeError("Could not extract text from combined statement PDF (empty after OCR attempt)")

    logger.info("Combined statement: %d pages, %d chars", len(pages), len(combined_text))

    # --- Build criteria context ---
    criteria_desc = []
    for c in criteria:
        subs = c.get("subcriteria", [])
        sub_text = ""
        if subs:
            sub_text = " | Subcriteria: " + ", ".join(
                s["name"] + " (" + str(s["points"]) + " pts)" for s in subs
            )
        criteria_desc.append(f"  {c['name']}: {c['points']} points{sub_text}")

    user_flag_instruction = ""
    if user_reviewer_name:
        user_flag_instruction = f"""

USER'S REVIEWER IDENTITY: "{user_reviewer_name}"
When a statement's reviewer citation matches or contains "{user_reviewer_name}", set is_mine: true. Otherwise is_mine: false."""

    prompt = f"""Perform a Committee Consensus Review on the combined reviewer statements below.

CRITERIA:
{chr(10).join(criteria_desc)}

NOFO TEXT (use this to validate statements and identify worksheet questions per criterion):
{nofo_text[:50000]}

COMBINED REVIEWER STATEMENTS (preserve every statement verbatim — do NOT shorten):
{combined_text}
{user_flag_instruction}

INSTRUCTIONS:
1. For EACH criterion, first identify the NOFO evaluation questions (the worksheet questions) — these are the bullets under each criterion that say what "the panel will review."
2. Then go through EVERY statement in the combined document for that criterion.
3. For each statement:
   a. Map it to the worksheet question it answers (Q1, Q2, etc.)
   b. Determine the action: KEEP, MERGE, REVISE, or REMOVE
   c. Preserve the FULL verbatim text — do not shorten or paraphrase
   d. Preserve the reviewer citation
   e. Provide rationale for the action
4. Process WEAKNESSES FIRST, then STRENGTHS, then METS for each criterion.
5. Number statements sequentially within each criterion: W1, W2... S1, S2... M1, M2...
6. Provide a suggested score range and budget recommendation.
7. Provide a summary with counts of each action type."""

    # --- Call Claude ---
    client = anthropic.Anthropic()
    model = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")
    tool = _consensus_tool(criteria)

    response = client.messages.create(
        model=model,
        max_tokens=16000,
        temperature=0,
        system=[{
            "type": "text",
            "text": CONSENSUS_SYSTEM_PROMPT,
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": f"NOFO TEXT:\n{nofo_text[:50000]}\n\nCOMBINED STATEMENTS:\n{combined_text}",
                    "cache_control": {"type": "ephemeral"},
                },
                {"type": "text", "text": prompt},
            ],
        }],
        tools=[tool],
        tool_choice={"type": "tool", "name": "submit_consensus_review"},
    )

    tool_use = next((b for b in response.content if b.type == "tool_use"), None)
    if not tool_use:
        raise RuntimeError("Claude did not return a consensus review result")

    result = tool_use.input
    if isinstance(result, str):
        result = json.loads(result)

    # --- Validate ---
    expected_names = {c["name"].strip().lower() for c in criteria}
    returned_names = {c["criterion_name"].strip().lower() for c in result.get("criteria", [])}
    if not expected_names.issubset(returned_names):
        logger.warning(
            "Criterion mismatch: expected %s, got %s",
            expected_names, returned_names,
        )

    result["review_type"] = "committee_consensus"
    result["certification"] = (
        "Claude-generated consensus draft. The Committee Chair must verify "
        "every action, validate all KEEP/MERGE/REVISE/REMOVE decisions, "
        "and confirm the final summary statement before ARM entry."
    )

    logger.info(
        "Consensus review complete: %s findings, %s after consolidation",
        result.get("summary", {}).get("total_findings"),
        result.get("summary", {}).get("findings_after_consolidation"),
    )
    return result
