"""Committee Consensus Review — consolidates combined reviewer statements.

Reads a Combined Statements PDF (all reviewers' S/M/W findings merged),
validates each statement against NOFO reviewer NOFO evaluation questions, and
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

1. The NOFO EVALUATION CRITERIA are the controlling question-by-question validation framework. Every statement must be validated against the specific NOFO evaluation questions for that criterion.

2. A statement is RETAINED (KEEP) when it accurately answers ANY criterion question from the NOFO — even if it was originally placed under a different question.

3. True DUPLICATES addressing the SAME NOFO evaluation question from multiple reviewers are MERGED — keep the most complete version. State which statements were merged.

4. A statement is REMOVED when:
   a. It is factually incorrect — the application text on the cited pages contradicts the claim. Cite the application page.
   b. It imposes a requirement the NOFO does not state — the weakness cites a gap that is NOT in any NOFO evaluation bullet. Cite the NOFO page and explain which bullets were checked.
   c. It belongs to a different criterion — the concern is valid but maps to a different criterion's evaluation questions, not this one.
   d. It duplicates a weakness already stated under a different criterion.

WEAKNESS VALIDATION — CRITICAL:
For EVERY weakness, you MUST perform this check:
   Step 1: Identify which NOFO evaluation bullet the weakness addresses. Copy the exact NOFO text.
   Step 2: Verify the NOFO actually requires what the weakness claims is missing. If the NOFO does not require it, the weakness is REVIEWER PREFERENCE — mark REMOVE.
   Step 3: If the NOFO does require it, check the application text to see if the applicant addressed it. If they did, the weakness is FACTUALLY INCORRECT — mark REMOVE and cite the application page.
   Step 4: Only if the NOFO requires it AND the application does not address it, mark KEEP.

Common invalid weakness patterns to catch:
   - Requiring county-level data when the NOFO says "across the service area"
   - Requiring social determinant analysis when the NOFO says "SUD-related needs"
   - Requiring specific methodology details when the NOFO says "effective plan"
   - Requiring prior program-specific experience when the NOFO says "organizational capabilities"
   - Requiring all partners committed when this is a planning grant building the network
   - Requiring contingency planning when the NOFO asks for "reasonable budget"
   - Requiring post-grant sustainability under a criterion that evaluates in-project activities
   - Placing FTE/effort concerns under Resources when they belong under Support Requested

In the rationale, always state: "NOFO p.XX requires: '[exact text]'. This weakness [does/does not] address that requirement because [reason]."

5. A statement is REVISED only when it is directionally correct but the wording is inaccurate or overstated. Provide the suggested revised wording in full.

6. WEAKNESSES are reviewed FIRST in each criterion before strengths (per HRSA committee review protocol).

7. Preserve ALL verbatim wording beginning with "The applicant…" — do NOT shorten, summarize, or paraphrase any statement. Output the full text exactly as written in the combined document.

8. Preserve the reviewer citation on every statement (e.g., "Reviewer A", "R-A, R-B"). This identifies the writer.

9. Preserve the page references or citation numbers that accompany each statement in the combined document (e.g., "pp. 8-9", "App p. 33"). These references identify which reviewer wrote the statement. Put them in the reviewer_references field exactly as written.

10. Do NOT add new findings that were not in the combined statements. You are consolidating, not reviewing.

11. Do NOT increase the budget recommendation. If reviewers recommend a reduction, the rationale must be provided.

12. Number all statements sequentially: W1, W2, W3... for weaknesses; S1, S2, S3... for strengths; M1, M2, M3... for mets. Numbers restart at 1 for EACH sub-criterion. For example: 2.1 Approach has S1, S2, M1; 2.2 Work Plan starts fresh at S1, M1; 2.3 Resolution starts fresh at S1, W1. Do NOT continue numbering across sub-criteria.

13. For the user's own statements (flagged in the input), mark them with is_mine: true so the UI can flag them.

NOFO REQUIREMENT REFERENCE — CRITICAL:
For EVERY statement, provide the verbatim NOFO requirement text that the statement addresses in the nofo_requirement_text field. Copy the exact NOFO language for the NOFO evaluation question this statement answers. Include the NOFO page number. This lets the Chair verify each statement against the actual NOFO language.

CROSS-QUESTION CONFLICT DETECTION — CRITICAL:
After mapping every statement to its NOFO evaluation question, check for CONFLICTS within each question:
- If a question has a STRENGTH from one reviewer and a WEAKNESS from another — this is a CONFLICT. Set is_conflict: true on both. The Chair must discuss.
- If a question has a MET from one reviewer and a WEAKNESS from another — this is a CONFLICT. A question cannot be both met and weak. Set is_conflict: true on both. Go to the NOFO requirement text and determine which assessment is correct. State in the rationale: "CONFLICT: [Reviewer] says met because [X], [Reviewer] says weakness because [Y]. NOFO p.XX requires: '[verbatim NOFO text]'. Chair should discuss."
- If a question has a STRENGTH from one reviewer and a MET from another — NOT a conflict. The STRENGTH supersedes the met. Mark the met as action MERGE into the strength.
- If a question has ONLY strengths, or ONLY mets, or ONLY weaknesses — no conflict.

STRENGTH vs MET vs WEAKNESS RESOLUTION:
- STRENGTH + MET on same question: Strength supersedes. MERGE the met into the strength.
- STRENGTH + WEAKNESS on same question: CONFLICT. Go back to NOFO. Check the actual requirement text. Then:
  a. If NOFO requirement is clearly met/exceeded, REMOVE the weakness. Cite NOFO page + requirement text.
  b. If NOFO requirement is genuinely not met, REMOVE the strength. Cite NOFO page + requirement text.
  c. If both have merit, KEEP both with is_conflict: true. Rationale: "CONFLICT: [details]. NOFO p.XX requires: '[verbatim]'. Chair should discuss."
- MET + WEAKNESS on same question: CONFLICT. A met means the requirement is satisfied — a weakness means it isn't. These cannot both be true. Set is_conflict: true. Resolve by checking NOFO requirement text. If the applicant addressed the requirement adequately, REMOVE the weakness. If not, REMOVE the met.
- Flag all conflict resolutions with "CONFLICT RESOLVED:" or "CONFLICT: Chair should discuss." in the rationale.

PAGE LIMIT ENFORCEMENT — CRITICAL:
If a page_limit is provided, any statement that cites or relies on evidence from pages BEYOND the page limit must be flagged with action REMOVE. The rationale must state: "PAGE LIMIT VIOLATION: This finding cites page(s) [X] which exceed the NOFO page limit of [N]. Per NOFO: 'We will not review any pages that exceed the page limit.'" Check the reviewer_references field for page numbers past the limit. If a statement cites both in-limit and over-limit pages, REVISE it to remove the over-limit citations and reword to only reference evidence within the page limit.

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
                "description": "Which reviewer NOFO evaluation question (Q1, Q2, etc.) this statement answers",
            },
            "subcriterion": {
                "type": "string",
                "description": "If this criterion has subcriteria (e.g. '2.1 Overview', '2.2 Network building'), state which subcriterion this statement belongs to. Use the exact subcriterion name from the NOFO. Empty string if no subcriteria.",
            },
            "nofo_requirement_text": {
                "type": "string",
                "description": "The VERBATIM NOFO requirement text for the NOFO evaluation question this statement answers. Copy the exact NOFO language. Include NOFO page number at the end, e.g. '...effectively served through this award. (NOFO p. 45)'",
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
            "is_conflict": {
                "type": "boolean",
                "description": "True if this statement was part of a strength/weakness conflict on the same NOFO evaluation question. Rationale should explain the conflict resolution.",
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
                        "missing_questions": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "additionalProperties": False,
                                "required": ["criterion", "question_id", "question_text"],
                                "properties": {
                                    "criterion": {"type": "string"},
                                    "question_id": {"type": "string", "description": "e.g. Q5"},
                                    "question_text": {"type": "string", "description": "The NOFO requirement text that no reviewer addressed"},
                                },
                            },
                            "description": "NOFO evaluation questions that NO reviewer provided feedback on. Empty array if all questions covered.",
                        },
                    },
                },
            },
        },
    }


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def _build_consensus_intelligence_context(
    budget_rules: dict | None = None,
    reviewer_intelligence: list | None = None,
) -> str:
    """Build context injection for consensus review from budget rules and reviewer intelligence."""
    parts = []

    if budget_rules and budget_rules.get("status") == "extracted":
        parts.append("\n\nNOFO BUDGET RULES (use to validate budget-related statements):")
        fp = budget_rules.get("funding_parameters", {})
        ps = budget_rules.get("personnel_salary_rules", {})
        idc = budget_rules.get("indirect_cost_rules", {})
        pts = budget_rules.get("participant_trainee_support", {})

        if fp.get("max_award_per_year"):
            parts.append(f"- Max award/year: ${fp['max_award_per_year']:,.0f} (NOFO p. {fp.get('max_award_per_year_nofo_page', '?')})")
        if ps.get("allowable_personnel") and ps["allowable_personnel"] != "N/A":
            parts.append(f"- Allowable personnel: {ps['allowable_personnel']} (NOFO p. {ps.get('allowable_personnel_nofo_page', '?')})")
        if ps.get("max_fte_pd") and ps["max_fte_pd"] != "N/A":
            parts.append(f"- PD max FTE: {ps['max_fte_pd']} (NOFO p. {ps.get('max_fte_pd_nofo_page', '?')})")
        if ps.get("salary_rate_cap"):
            parts.append(f"- Salary cap: {ps.get('salary_rate_cap_description', 'N/A')} (NOFO p. {ps.get('salary_rate_cap_nofo_page', '?')})")
        if not ps.get("other_staff_salary_allowed", True):
            parts.append(f"- Other staff salary: NOT ALLOWED (NOFO p. {ps.get('other_staff_salary_nofo_page', '?')})")
        if idc.get("idc_rate_cap") and idc["idc_rate_cap"] != "N/A":
            parts.append(f"- IDC: {idc['idc_rate_cap']} on {idc.get('idc_base_includes', 'N/A')} (NOFO p. {idc.get('idc_rate_cap_nofo_page', '?')})")

        unallowable = budget_rules.get("unallowable_costs", [])
        if unallowable:
            parts.append("- Unallowable costs:")
            for item in unallowable:
                parts.append(f'  * {item["cost_description"]}: "{item["nofo_text"]}" (NOFO p. {item["nofo_page"]})')

        parts.append("")
        parts.append("USE THESE RULES TO:")
        parts.append("- REMOVE any weakness claiming a budget violation that is actually compliant per these rules")
        parts.append("- REMOVE any strength claiming budget compliance for a rule that doesn't exist in this NOFO")
        parts.append("- VALIDATE budget-related statements against the actual NOFO constraints, not general federal rules")

        # Verb map
        verb_map = budget_rules.get("nofo_verb_map", [])
        if verb_map:
            parts.append("\n\nNOFO VERB MAP (use to validate demonstrate-vs-plan statements):")
            for entry in verb_map:
                parts.append(f"- {entry['criterion']}: {', '.join(entry['key_verbs'])} -> expects: {entry['expects']}")
            parts.append("")
            parts.append("USE THIS TO:")
            parts.append('- KEEP weaknesses that correctly flag "plan to" responses where the NOFO requires "demonstrates"')
            parts.append('- REMOVE weaknesses that demand past evidence where the NOFO only asks applicants to "describe how they will"')
            parts.append('- REMOVE strengths that praise "demonstrated" outcomes for criteria that only ask for a plan')

        # Prior experience signals
        prior = budget_rules.get("prior_experience_signals", {})
        if prior.get("asks_for_past_performance_data") or prior.get("references_current_recipients"):
            parts.append("\n\nPRIOR EXPERIENCE SIGNALS FROM NOFO:")
            if prior.get("asks_for_past_performance_data"):
                parts.append(f"- NOFO asks for past performance data: {prior.get('past_performance_detail', 'yes')}")
            if prior.get("references_current_recipients"):
                parts.append(f"- NOFO references current recipients: {prior.get('current_recipients_detail', 'yes')}")
            if prior.get("asks_for_track_record"):
                parts.append(f"- NOFO asks for track record: {prior.get('track_record_detail', 'yes')}")

    if reviewer_intelligence and isinstance(reviewer_intelligence, list):
        parts.append("\n\nREVIEWER INTELLIGENCE FINDINGS (from deep-read analysis — use to validate/refute statements):")
        for item in reviewer_intelligence:
            cat = item.get("category", "OTHER")
            finding = item.get("finding", "")
            detail = item.get("detail", "")
            parts.append(f"- [{cat}] {finding}")
            if detail:
                parts.append(f"  {detail}")
        parts.append("")
        parts.append("USE THESE TO:")
        parts.append("- REFUTE reviewer weaknesses that contradict verified intelligence findings")
        parts.append("- SUPPORT reviewer strengths that align with intelligence findings")
        parts.append("- FLAG gaps where no reviewer addressed a finding that the intelligence identified")
        parts.append("- Add missing_questions entries for NOFO requirements the intelligence flagged but no reviewer addressed")

    return "\n".join(parts) if parts else ""


def run_consensus_review(
    combined_statement_path: Path,
    nofo_text: str,
    criteria: list[dict[str, Any]],
    user_reviewer_name: str = "",
    user_review_fingerprints: list[str] | None = None,
    page_limit: int = 0,
    application_text: str = "",
    budget_rules: dict | None = None,
    reviewer_intelligence: list | None = None,
) -> dict[str, Any]:
    """Run the consensus review on a combined statements document.

    Args:
        combined_statement_path: Path to the combined statements PDF.
        nofo_text: Full NOFO text (already extracted).
        criteria: Extracted rubric criteria list.
        user_reviewer_name: The user's reviewer name for flagging (e.g. "Dr. T", "Reviewer B").
        user_review_fingerprints: First 80 chars of each finding from the user's stored AI review.
            Used to auto-detect which reviewer in the combined statement is the user.
        page_limit: NOFO page limit for the application. Findings citing pages past this are flagged.
        application_text: Extracted application text for fact-checking reviewer statements.
        budget_rules: Extracted NOFO budget rules dict (from extract_nofo_budget_rules).
        reviewer_intelligence: List of reviewer intelligence findings from the overview.

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
Set is_mine: true when ANY of these match:
1. The statement's reviewer citation contains "{user_reviewer_name}"
2. The statement's page references/citations contain "{user_reviewer_name}" (e.g., "AOR App p. 31" means this is {user_reviewer_name}'s statement)
3. The reviewer label that corresponds to statements with "{user_reviewer_name}" in their page citations

PROCESS: First scan ALL statements to find which reviewer label uses "{user_reviewer_name}" in their page citations. Once identified (e.g., "Reviewer A" always has "AOR App p." citations), set is_mine: true on ALL statements from that reviewer — not just the ones with explicit page citations."""
    elif user_review_fingerprints:
        # Build fingerprint block for auto-detection
        fp_sample = user_review_fingerprints[:25]  # limit to keep prompt manageable
        fp_text = "\n".join(f"  - {fp}" for fp in fp_sample)
        user_flag_instruction = f"""

AUTO-DETECT USER'S REVIEWER IDENTITY:
The user's own review produced these findings (first 80 chars of each). Match them against the combined statements to determine which reviewer label (e.g., "Reviewer A", "Reviewer B", "CDH") belongs to the user. Once identified, set is_mine: true on ALL statements from that reviewer — not just the matched ones.

User's review fingerprints:
{fp_text}

PROCESS:
1. Compare each fingerprint against the verbatim text of every statement in the combined document.
2. The reviewer whose statements have the most matches is the user.
3. Once you identify the user's reviewer label, flag ALL statements with that label as is_mine: true."""

    # Build intelligence context from budget rules and reviewer intelligence
    intelligence_context = _build_consensus_intelligence_context(budget_rules, reviewer_intelligence)

    prompt = f"""Perform a Committee Consensus Review on the combined reviewer statements below.

CRITERIA:
{chr(10).join(criteria_desc)}

NOFO TEXT (use this to validate statements and identify NOFO evaluation questions per criterion):
{nofo_text[:30000]}{intelligence_context}

COMBINED REVIEWER STATEMENTS (preserve every statement verbatim — do NOT shorten):
{combined_text}
{f"""
APPLICATION TEXT (use this to FACT-CHECK reviewer statements — verify claims are accurate):
{application_text[:40000]}
""" if application_text else ""}
{user_flag_instruction}
{f"""
APPLICATION PAGE LIMIT: {page_limit}
Any statement citing evidence from pages beyond page {page_limit} must be REMOVED with rationale: "PAGE LIMIT VIOLATION: cites page(s) past the NOFO limit of {page_limit}." If a statement cites both in-limit and over-limit pages, REVISE it to reference only evidence within the limit.
""" if page_limit > 0 else ""}
INSTRUCTIONS:
1. For EACH criterion, first identify the NOFO evaluation questions (the NOFO evaluation questions) — these are the bullets under each criterion that say what "the panel will review."
2. Then go through EVERY statement in the combined document for that criterion IN THE SAME ORDER as the combined statement document. Do NOT reorder or rearrange. The HRSA combined statement has a specific structure — preserve it exactly.
3. For each statement:
   a. Map it to the NOFO evaluation question it answers (Q1, Q2, etc.)
   b. Determine the action: KEEP, MERGE, REVISE, or REMOVE
   c. State what needs to be done — the rationale should be an actionable instruction (e.g., "DELETE — duplicate of W1", "KEEP — accurately addresses Q2", "REVISE — remove reference to pages past 60")
   d. Preserve the FULL verbatim text — do not shorten or paraphrase
   e. Preserve the reviewer citation
4. Maintain the SAME ordering as the combined statement document: if HRSA lists strengths first then weaknesses, follow that order. If weaknesses first, follow that. Do NOT impose a different order.
5. Number statements sequentially within each type per criterion: W1, W2... S1, S2... M1, M2...
6. SUBCRITERIA: If a criterion has subcriteria (e.g., Response has "2.1 Overview", "2.2 Network building", "2.3 Assessment & action planning", "2.4 Service provider preparation"), tag each statement with its subcriterion name in the subcriterion field. Group statements by subcriterion within each finding type. Use the exact subcriterion name from the NOFO/combined statement.
6. Provide a suggested score range and budget recommendation.
7. Provide a summary with counts of each action type.
8. GAP CHECK: After mapping all statements to NOFO evaluation questions, check if ANY NOFO evaluation question has NO reviewer feedback at all. For each criterion, compare the list of NOFO evaluation questions (Q1, Q2, Q3...) against the questions actually addressed by statements. List any unanswered questions in the criterion's worksheet_questions array with a note. Also add unanswered questions to the missing_questions field in the summary."""

    # --- Call Claude ---
    client = anthropic.Anthropic()
    model = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6-20250620")
    tool = _consensus_tool(criteria)

    # Use streaming to handle large responses (required for >10 min operations)
    collected_blocks = []
    with client.messages.stream(
        model=model,
        max_tokens=20000,
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
                    "text": f"NOFO TEXT:\n{nofo_text[:30000]}\n\nCOMBINED STATEMENTS:\n{combined_text}" + (f"\n\nAPPLICATION TEXT:\n{application_text[:40000]}" if application_text else ""),
                    "cache_control": {"type": "ephemeral"},
                },
                {"type": "text", "text": prompt},
            ],
        }],
        tools=[tool],
        tool_choice={"type": "tool", "name": "submit_consensus_review"},
    ) as stream:
        response = stream.get_final_message()

    logger.info("Claude response: stop_reason=%s, usage=%s",
                 response.stop_reason,
                 {"input": response.usage.input_tokens, "output": response.usage.output_tokens})

    tool_use = next((b for b in response.content if b.type == "tool_use"), None)
    if not tool_use:
        for b in response.content:
            logger.error("Non-tool block type=%s: %s", b.type, str(b)[:500])
        raise RuntimeError("Claude did not return a consensus review result")

    result = tool_use.input
    if isinstance(result, str):
        result = json.loads(result)

    logger.info("Consensus result keys: %s, criteria count: %d",
                list(result.keys()), len(result.get("criteria", [])))

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
