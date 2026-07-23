"""Claude-backed SAMHSA grant application scoring — SPF-PFS and similar NOFOs."""
from __future__ import annotations

import os
import json
from pathlib import Path
from typing import Any

from .safe_review import extract_pdf_pages

SAMHSA_SYSTEM_PROMPT = """You are an independent federal grant peer reviewer for the Substance Abuse and Mental Health Services Administration (SAMHSA). Score only against the evaluation criteria in the NOFO. Use only application evidence; never invent facts, page numbers, findings, or data. Apply SAMHSA comment conventions: third person, present tense, section-specific findings, constructive language. Do not use outside knowledge. Every finding must cite application page numbers. This is a draft for human reviewer validation, not an award decision.

SAMHSA QUALITATIVE SCORING SCALE:
- Outstanding: All criteria thoroughly addressed, strongly developed, well supported. Extremely strong with insignificant weaknesses. Weaknesses will likely have NO impact on successful implementation.
- Very Good: Criteria thoroughly addressed with detail, clearly supported. Very strong with only minor weaknesses. Weaknesses will likely have MINOR impact on implementation.
- Acceptable: Criteria addressed but lacking detail/support. Some documentation deficient/missing. Some strengths but at least ONE MAJOR weakness. Weaknesses will likely have MODERATE impact.
- Marginal: Some criteria addressed without detail. Documentation missing/deficient. Few strengths, few major weaknesses. Weaknesses will LIKELY IMPACT implementation.
- Unacceptable: Few/no criteria addressed. Documentation missing. Very few strengths, numerous major weaknesses. Weaknesses will PREVENT implementation. OR response does not meet NOFO intent.

CRITICAL SCORING RULES:
- If you cannot identify ANY weaknesses for a section, it MUST be scored Outstanding.
- If identified weaknesses will PREVENT successful implementation, it MUST be scored Unacceptable.
- If the criteria do not meet the intent of the NOFO, it MUST be scored Unacceptable.

COMMENT FORMAT — SAMHSA OCT STYLE:
Each comment MUST be labeled with its section and question number (e.g., "A.1", "B.2").
Format: "A.1 [comment text]. Page #"
- Label every strength and weakness with the corresponding evaluation question number.
- Include the application page number(s) at the END of each comment.
- Strengths and weaknesses are entered in SEPARATE boxes per section.
- Each comment should be 1-3 concise sentences covering one substantive observation.
- Cite only the 1-3 most relevant application pages. Do NOT list broad page ranges.

SPECIAL RULE FOR SECTION B.2 (Required Activities):
If the applicant has NOT included ALL required activities, Section B can ONLY receive a MAXIMUM score of Acceptable.
If required activities are described but without sufficient detail, Section B CANNOT receive a rating higher than Acceptable.

FACTUAL ACCURACY — CRITICAL:
Before asserting any weakness, verify your claim against the cited application pages. Do NOT claim something is missing if it appears elsewhere in the application. If uncertain whether a weakness is factually supported, omit it. A false weakness is worse than a missed one.

Never use unexpanded acronyms — always write the full term first, followed by the acronym in parentheses on first use."""


def _application_text(path: Path, max_chars: int = 175_000) -> tuple[list[str], str]:
    """Extract application text with page markers."""
    pages = extract_pdf_pages(path)
    blocks, used = [], 0
    for number, page in enumerate(pages, 1):
        block = f"\n--- APPLICATION PAGE {number} ---\n{page.strip()}"
        if used + len(block) > max_chars:
            remaining = max_chars - used
            if remaining > 500:
                blocks.append(block[:remaining])
            break
        blocks.append(block)
        used += len(block)
    return pages, "".join(blocks)


def _score_samhsa_section(
    client, model: str, application_text: str, section: dict,
    agency: str, nofo_text: str, page_count: int, reviewer_notes: str = "",
) -> dict[str, Any]:
    """Score one SAMHSA section (A, B, C, or D)."""
    import logging
    logger = logging.getLogger("grant_worker")

    name = section["name"]
    letter = section.get("letter", name[0])
    max_score = int(section["points"])
    questions = section.get("questions", [])

    # Build question list for the prompt
    question_text = ""
    for q in questions:
        question_text += f"\n{q['id']}: {q['text']}"

    # Build tool schema
    strength_comment = {
        "type": "object", "additionalProperties": False,
        "required": ["question_id", "comment", "application_pages"],
        "properties": {
            "question_id": {"type": "string", "description": "The question label, e.g. A.1, B.2"},
            "comment": {"type": "string", "description": "1-3 sentence strength finding"},
            "application_pages": {"type": "array", "minItems": 1, "items": {"type": "integer", "minimum": 1}},
        }
    }
    weakness_comment = {
        "type": "object", "additionalProperties": False,
        "required": ["question_id", "comment", "application_pages"],
        "properties": {
            "question_id": {"type": "string", "description": "The question label, e.g. A.1, B.2"},
            "comment": {"type": "string", "description": "1-3 sentence weakness finding"},
            "application_pages": {"type": "array", "minItems": 1, "items": {"type": "integer", "minimum": 1}},
            "nofo_requirement": {"type": "string", "description": "The NOFO requirement the application falls short of"},
            "impact": {"type": "string", "description": "Impact on successful implementation"},
        }
    }
    requirement_assessment = {
        "type": "object", "additionalProperties": False,
        "required": ["question_id", "requirement_text", "nofo_pages", "response_status", "finding_type", "application_pages", "explanation"],
        "properties": {
            "question_id": {"type": "string", "description": "The question label, e.g. A.1, B.2"},
            "requirement_text": {"type": "string", "description": "The NOFO evaluation question being assessed"},
            "nofo_pages": {"type": "array", "items": {"type": "integer", "minimum": 1}},
            "response_status": {"type": "string", "enum": ["thoroughly_addressed", "addressed", "partially_addressed", "not_addressed"]},
            "finding_type": {"type": "string", "enum": ["strength", "met", "weakness"]},
            "application_pages": {"type": "array", "items": {"type": "integer", "minimum": 1}},
            "explanation": {"type": "string", "description": "1-3 sentence reviewer comment labeled with question ID"},
            "nofo_requirement": {"type": "string", "description": "For weaknesses: the NOFO requirement text"},
            "impact": {"type": "string", "description": "For weaknesses: impact on implementation"},
        }
    }

    tool = {
        "name": "score_section",
        "description": f"Submit SAMHSA score for Section {letter}: {name} (0-{max_score} points).",
        "input_schema": {
            "type": "object", "additionalProperties": False,
            "required": ["section_letter", "section_name", "max_score", "score", "qualitative_rating",
                         "score_rationale", "strengths", "weaknesses", "requirement_assessments"],
            "properties": {
                "section_letter": {"type": "string", "enum": [letter]},
                "section_name": {"type": "string"},
                "max_score": {"type": "integer", "enum": [max_score]},
                "score": {"type": "integer", "minimum": 0, "maximum": max_score},
                "qualitative_rating": {
                    "type": "string",
                    "enum": ["outstanding", "very_good", "acceptable", "marginal", "unacceptable"],
                    "description": "Overall qualitative assessment for this section",
                },
                "score_rationale": {"type": "string", "description": "1-2 sentence summary of overall assessment"},
                "strengths": {"type": "array", "items": strength_comment, "description": "All strength comments, labeled by question ID"},
                "weaknesses": {"type": "array", "items": weakness_comment, "description": "All weakness comments, labeled by question ID"},
                "requirement_assessments": {"type": "array", "items": requirement_assessment, "description": "One assessment per NOFO evaluation question"},
                "required_activities_complete": {
                    "type": "boolean",
                    "description": "For Section B only: whether ALL required activities are addressed",
                },
            },
        },
    }

    reviewer_note_text = ""
    if reviewer_notes:
        reviewer_note_text = f"\n\nREVIEWER NOTES (from Review Administrator):\n{reviewer_notes}"

    prompt = f"""Score this SAMHSA section using the qualitative scoring scale.

SECTION: {letter} — {name}
MAXIMUM SCORE: {max_score}
AGENCY: {agency}

EVALUATION QUESTIONS FOR THIS SECTION:{question_text}
{reviewer_note_text}

NOFO TEXT:
{nofo_text[:15000]}

APPLICATION:
{application_text}

INSTRUCTIONS:
1. For EACH evaluation question ({', '.join(q['id'] for q in questions)}), create one requirement_assessment entry.
2. Also create labeled strength and weakness comments for the Strengths and Weaknesses boxes.
3. Label every comment with the question ID (e.g., "A.1 The applicant clearly describes...").
4. Assign a qualitative_rating (outstanding/very_good/acceptable/marginal/unacceptable).
5. Assign a numeric score (0-{max_score}) consistent with the qualitative rating:
   - Outstanding: {int(max_score * 0.9)}-{max_score}
   - Very Good: {int(max_score * 0.75)}-{int(max_score * 0.89)}
   - Acceptable: {int(max_score * 0.5)}-{int(max_score * 0.74)}
   - Marginal: {int(max_score * 0.25)}-{int(max_score * 0.49)}
   - Unacceptable: 0-{int(max_score * 0.24)}
6. If NO weaknesses → rating MUST be Outstanding.
7. For Section B: check if ALL required activities are addressed. If not, max rating is Acceptable.
8. Include application page # at the end of each comment.
9. Each comment: 1-3 concise sentences. No unexpanded acronyms."""

    needed_tokens = 6000
    response = client.messages.create(
        model=model, max_tokens=needed_tokens, temperature=0,
        system=[{"type": "text", "text": SAMHSA_SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": [
            {"type": "text", "text": f"NOFO TEXT:\n{nofo_text[:15000]}\n\nAPPLICATION:\n{application_text}", "cache_control": {"type": "ephemeral"}},
            {"type": "text", "text": prompt.split("APPLICATION:")[0] + prompt.split(application_text)[-1] if application_text in prompt else prompt},
        ]}],
        tools=[tool], tool_choice={"type": "tool", "name": "score_section"},
    )

    tool_use = next((b for b in response.content if b.type == "tool_use"), None)
    if not tool_use:
        raise RuntimeError(f"Claude did not score section '{name}'")

    result = tool_use.input
    if isinstance(result, str):
        result = json.loads(result)

    # Map to common format for frontend compatibility
    result["name"] = f"Section {letter}: {name}"
    result["maximum_points"] = max_score
    result["classification"] = result.get("qualitative_rating", "")
    # Map strengths/weaknesses to standard format with 'mets' for compatibility
    mets = []
    for ra in result.get("requirement_assessments", []):
        if ra.get("finding_type") == "met":
            mets.append({
                "comment": f"{ra.get('question_id', '')} {ra.get('explanation', '')}",
                "application_pages": ra.get("application_pages", []),
            })
    result["mets"] = mets
    result["formula_version"] = "samhsa-qualitative-v1"

    logger.info("  Section %s: %s (%d/%d)", letter, result.get("qualitative_rating", "?"),
                result.get("score", 0), max_score)
    return result


def _score_cpp(client, model: str, application_text: str, nofo_text: str) -> dict[str, Any]:
    """Score the Confidentiality and Participant Protection section."""
    import logging
    logger = logging.getLogger("grant_worker")

    tool = {
        "name": "score_cpp",
        "description": "Submit Confidentiality and Participant Protection assessment.",
        "input_schema": {
            "type": "object", "additionalProperties": False,
            "required": ["fair_selection", "data_collection", "privacy_confidentiality", "overall_assessment"],
            "properties": {
                "fair_selection": {
                    "type": "object", "additionalProperties": False,
                    "required": ["rating", "comment"],
                    "properties": {
                        "rating": {"type": "string", "enum": ["adequate", "inadequate"]},
                        "comment": {"type": "string"},
                    },
                },
                "data_collection": {
                    "type": "object", "additionalProperties": False,
                    "required": ["rating", "comment"],
                    "properties": {
                        "rating": {"type": "string", "enum": ["adequate", "inadequate"]},
                        "comment": {"type": "string"},
                    },
                },
                "privacy_confidentiality": {
                    "type": "object", "additionalProperties": False,
                    "required": ["rating", "comment"],
                    "properties": {
                        "rating": {"type": "string", "enum": ["adequate", "inadequate"]},
                        "comment": {"type": "string"},
                    },
                },
                "overall_assessment": {
                    "type": "string",
                    "enum": ["adequate", "comment", "concern"],
                    "description": "Overall CPP assessment — must reflect the most serious level of any individual rating",
                },
                "overall_comment": {"type": "string"},
            },
        },
    }

    prompt = f"""Assess the Confidentiality and Participant Protection for this SAMHSA application.

Evaluate three areas:
1. Fair Selection of Participants — How the applicant will recruit/select participants, any exclusions and reasons
2. Data Collection — From whom data will be collected, procedures, sources
3. Privacy and Confidentiality — How identity will be kept private, where data stored, who has access

Rate each as Adequate or Inadequate.
Overall assessment must reflect the most serious level of any individual rating.

APPLICATION:
{application_text[:40000]}"""

    response = client.messages.create(
        model=model, max_tokens=2000, temperature=0,
        system="You are a SAMHSA peer reviewer assessing Confidentiality and Participant Protection. Be thorough but fair.",
        messages=[{"role": "user", "content": prompt}],
        tools=[tool], tool_choice={"type": "tool", "name": "score_cpp"},
    )

    tool_use = next((b for b in response.content if b.type == "tool_use"), None)
    if not tool_use:
        return {"fair_selection": {"rating": "adequate", "comment": ""}, "data_collection": {"rating": "adequate", "comment": ""}, "privacy_confidentiality": {"rating": "adequate", "comment": ""}, "overall_assessment": "adequate", "overall_comment": ""}

    result = tool_use.input
    if isinstance(result, str):
        result = json.loads(result)

    logger.info("  CPP: %s", result.get("overall_assessment", "?"))
    return result


def score_samhsa_application(
    application: Path,
    criteria: list[dict[str, Any]],
    agency: str,
    guidance: str = "",
    reviewer_notes: str = "",
) -> dict[str, Any]:
    """Score a SAMHSA application across all sections."""
    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured.")
    import anthropic
    import logging
    from concurrent.futures import ThreadPoolExecutor, as_completed

    logger = logging.getLogger("grant_worker")
    pages, application_text = _application_text(application)
    model = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5")
    client = anthropic.Anthropic(api_key=api_key, timeout=300.0)
    nofo_text = guidance or ""

    logger.info("Scoring %d SAMHSA sections + CPP in parallel with %s", len(criteria), model)

    scored_sections = [None] * len(criteria)
    cpp_result = {}
    errors = []

    # Score all sections + CPP in parallel
    with ThreadPoolExecutor(max_workers=3) as pool:
        section_futures = {
            pool.submit(
                _score_samhsa_section, client, model, application_text,
                crit, agency, nofo_text, len(pages), reviewer_notes,
            ): i
            for i, crit in enumerate(criteria)
        }
        cpp_future = pool.submit(_score_cpp, client, model, application_text, nofo_text)

        for future in as_completed(list(section_futures.keys()) + [cpp_future]):
            if future == cpp_future:
                try:
                    cpp_result = future.result()
                except Exception as exc:
                    logger.error("CPP scoring failed: %s", exc)
                    errors.append(f"CPP: {exc}")
            else:
                idx = section_futures[future]
                try:
                    scored_sections[idx] = future.result()
                except Exception as exc:
                    logger.error("Section %d (%s) failed: %s", idx, criteria[idx]['name'], exc)
                    errors.append(f"{criteria[idx]['name']}: {exc}")

    if errors:
        raise RuntimeError("Scoring failed: " + "; ".join(errors))

    # Assemble final review
    total_score = sum(s.get("score", 0) for s in scored_sections if s)
    max_total = sum(int(c["points"]) for c in criteria)

    review = {
        "applicant_name": "",  # Will be filled by overview
        "application_number": "",
        "criteria": scored_sections,
        "cpp": cpp_result,
        "final_score": total_score,
        "maximum_score": max_total,
        "formula_version": "samhsa-qualitative-v1",
        "review_status": "ai_draft_human_validation_required",
        "certification": "Claude-generated SAMHSA draft review. A human reviewer must verify every finding, score, and assessment before submission to IAR/OCT.",
        "agency": agency,
    }

    # Extract applicant name from first few pages
    first_pages = "\n".join(pages[:5])
    for line in first_pages.split("\n"):
        if "organization" in line.lower() or "applicant" in line.lower():
            # Simple heuristic — will be refined
            pass

    logger.info("SAMHSA review complete: %d/%d", total_score, max_total)
    return review
