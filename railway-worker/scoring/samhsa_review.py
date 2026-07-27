"""Claude-backed SAMHSA grant application scoring — SPF-PFS and similar NOFOs."""
from __future__ import annotations

import os
import json
from pathlib import Path
from typing import Any

import re as _re

from .safe_review import extract_pdf_pages


def _extract_criteria_pages(nofo_text: str, max_chars: int = 50000) -> str:
    """Extract ONLY the evaluation criteria section from NOFO text.

    Looks for the Merit Review / Evaluation Criteria section (with point values)
    and returns just those pages. Falls back to full text if not found.
    This prevents Claude from citing Program Description pages (1-15) instead
    of actual criteria pages (typically 20-30).
    """
    # Split into pages using the marker format
    pages = _re.split(r'(--- NOFO PAGE \d+ ---)', nofo_text)

    # Find pages containing evaluation criteria headings with point values
    criteria_markers = [
        r'\(\s*\d+\s*points?\s*\)',  # "(35 points)" or "(30 points)"
        r'merit\s+review',
        r'evaluation\s+criteria',
        r'application\s+review',
    ]
    criteria_start = None
    criteria_pages = []

    for i, chunk in enumerate(pages):
        text_lower = chunk.lower()
        if any(_re.search(p, text_lower) for p in criteria_markers):
            if criteria_start is None:
                # Include the page marker before this chunk
                criteria_start = max(0, i - 1)
            criteria_pages.append(i)

    if criteria_start is not None and criteria_pages:
        # Include from first criteria page to end of criteria section (+ a few pages)
        last_criteria = max(criteria_pages)
        end = min(last_criteria + 4, len(pages))  # Include a few extra pages after
        extracted = "".join(pages[criteria_start:end])
        if len(extracted) > 500:  # Sanity check
            return extracted[:max_chars]

    # Fallback: return full text
    return nofo_text[:max_chars]

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
- NEVER embed weakness language inside a strength comment. If a criterion has both a strength
  and a weakness, create TWO SEPARATE entries — one strength finding and one weakness finding.
  WRONG: "A.1 The applicant thoroughly identifies the catchment area. A minor discrepancy exists..."
  RIGHT: Strength: "A.1 The applicant thoroughly identifies the catchment area with strong data."
         Weakness: "A.1 A minor discrepancy exists between veteran population figures in the narrative and Attachment 10."

SPECIAL RULE FOR SECTION B.2 (Required Activities):
If the applicant has NOT included ALL required activities, Section B can ONLY receive a MAXIMUM score of Acceptable.
If required activities are described but without sufficient detail, Section B CANNOT receive a rating higher than Acceptable.

SECTION PLACEMENT RULE — CRITICAL (SAMHSA STRICT ENFORCEMENT):
SAMHSA requires that each evaluation question (A.1, A.2, B.1, etc.) be answered in its CORRECT section of the Project Narrative. Reviewers will ONLY consider information included in the appropriate numbered section.
- If an applicant answers A.1 in Section B instead of Section A, it MUST be noted as a weakness for A.1: the information was not provided in the required section.
- If you find the answer in a different section, note it: "The applicant addresses this requirement in Section [X] rather than in the required Section [Y]. Per NOFO instructions, reviewers will only consider information included in the appropriate numbered criterion."
- Do NOT give credit for information placed in the wrong section. This is a scorable weakness.

R7 NO SPECULATIVE WEAKNESSES — CRITICAL:
Before writing ANY weakness, ask: "Does the NOFO evaluation criterion EXPLICITLY require this?"
If NO, do NOT include it. The following are NOT valid weaknesses — NEVER flag these:
  - Interventions described as "subject to change" or "pending Planning phase" — this is CORRECT SPF process
  - Conditional framing of intervention selection — the NOFO REQUIRES using the Planning phase to select interventions
  - Not naming specific evidence-based interventions when goals/objectives are detailed
  - Omitting allowable activities (optional, no score impact)
  - Not addressing potential cross-site evaluation (hypothetical future requirement)
  - Insufficient detail on post-award deliverables (needs assessment, eval plan due after award)
  - Absence of baseline-referenced outcome targets (developed during Planning, not pre-award)
  - Not specifying a community readiness assessment instrument (NOFO does not require naming a tool)
  - Participant enrollment targets missing from timeline (only requires dates, activities, staff)
  - B.3 "not linking specific activities to priorities" when the applicant DOES name activities under each priority — READ the actual text before claiming activities are missing
  - B.4 "no narrative content" when NOFO criterion B.4 itself says "In Attachment 4, provide..." — the criterion directs content to the attachment, so "SEE ATTACHMENT 4" is acceptable
A weakness MUST cite a specific NOFO requirement the application fails to address. If you cannot point
to an explicit NOFO requirement, OMIT the weakness rather than lowering the score.

FACTUAL ACCURACY — CRITICAL:
Before asserting any weakness, verify your claim against the cited application pages. Do NOT claim something is missing if it appears elsewhere in the application — but DO note if it appears in the WRONG section. If uncertain whether a weakness is factually supported, omit it. A false weakness is worse than a missed one.

B.3 VERIFICATION RULE: Before claiming B.3 lacks specificity, RE-READ page 17 (or wherever B.3 appears).
If the applicant names specific activities under EACH of the five SAMHSA Strategic Priorities (evidence-based
practice, fiscal stewardship, partnership/coordination, prevention of substance misuse, emerging threats),
that IS a thorough response — score it as a Strength, not a weakness.

B.4 RULE: The NOFO criterion B.4 says "In Attachment 4, provide..." — it explicitly directs content to the
attachment, not the narrative. If the applicant writes "SEE ATTACHMENT 4" and Attachment 4 contains a
complete timeline with dates, activities, and staff, B.4 is adequately addressed. Do NOT penalize for
following the NOFO's own instruction to put the timeline in the attachment.

Never use unexpanded acronyms — always write the full term first, followed by the acronym in parentheses on first use."""


def _try_ocr_page(path: Path, page_index: int) -> str:
    """Attempt OCR on a single page that has images but no extractable text."""
    try:
        import fitz
        doc = fitz.open(path)
        page = doc[page_index]
        # Check if page has images
        if not page.get_images():
            return ""
        # Try fitz built-in OCR (requires tesseract)
        try:
            tp = page.get_textpage_ocr(language="eng")
            text = page.get_text("text", textpage=tp)
            if text and len(text.strip()) > 50:
                return text.strip()
        except Exception:
            pass
        return ""
    except Exception:
        return ""


def _application_text(path: Path, max_chars: int = 175_000) -> tuple[list[str], str]:
    """Extract application text with page markers. Falls back to OCR for scanned pages."""
    pages = extract_pdf_pages(path)

    # Detect and attempt OCR on pages that are likely scanned (have images but <50 chars text)
    for i, page_text in enumerate(pages):
        stripped = page_text.strip()
        # Page has a header but no body text — likely scanned
        if len(stripped) < 100 and stripped:
            ocr_text = _try_ocr_page(path, i)
            if ocr_text:
                pages[i] = ocr_text

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
            "application_pages": {"type": "array", "minItems": 1, "maxItems": 3, "items": {"type": "integer", "minimum": 1}, "description": "1-3 most relevant pages ONLY — do not list broad ranges"},
        }
    }
    weakness_comment = {
        "type": "object", "additionalProperties": False,
        "required": ["question_id", "comment", "application_pages"],
        "properties": {
            "question_id": {"type": "string", "description": "The question label, e.g. A.1, B.2"},
            "comment": {"type": "string", "description": "1-3 sentence weakness finding"},
            "application_pages": {"type": "array", "minItems": 1, "maxItems": 3, "items": {"type": "integer", "minimum": 1}, "description": "1-3 most relevant pages ONLY"},
            "nofo_requirement": {"type": "string", "description": "The NOFO requirement the application falls short of"},
            "impact": {"type": "string", "description": "Impact on successful implementation"},
        }
    }
    requirement_assessment = {
        "type": "object", "additionalProperties": False,
        "required": ["question_id", "requirement_text", "nofo_pages", "response_status", "finding_type", "application_pages", "explanation"],
        "properties": {
            "question_id": {"type": "string", "description": "The question label, e.g. A.1, B.2"},
            "requirement_text": {"type": "string", "description": "The NOFO evaluation question being assessed — use the EXACT text from the NOFO"},
            "nofo_pages": {"type": "array", "minItems": 1, "maxItems": 2, "items": {"type": "integer", "minimum": 1}, "description": "1-2 NOFO pages where this requirement appears"},
            "response_status": {"type": "string", "enum": ["thoroughly_addressed", "addressed", "partially_addressed", "not_addressed"]},
            "finding_type": {"type": "string", "enum": ["strength", "met", "weakness"]},
            "application_pages": {"type": "array", "minItems": 1, "maxItems": 3, "items": {"type": "integer", "minimum": 1}, "description": "1-3 most relevant application pages ONLY — no broad ranges"},
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

    # Section-specific rules injected into the prompt
    section_rules = ""
    if letter == "B":
        section_rules = """
SECTION B SPECIFIC RULES:
- B.2: Interventions described as "subject to change" or "pending Planning phase" is CORRECT SPF
  process — do NOT flag as weakness. The NOFO requires using the Planning phase to select interventions.
- B.3: Before claiming the applicant does not link activities to SAMHSA Strategic Priorities, RE-READ
  the B.3 text. If the applicant names specific activities under EACH priority (e.g., fidelity monitoring
  for evidence-based practice, SPARS reporting for fiscal stewardship, CAC/YAC for partnerships,
  specific substances for prevention, surveillance data for emerging threats), that IS a thorough
  response and MUST be scored as a Strength. Do NOT claim "does not link specific activities" if
  activities ARE listed under each priority.
- B.4: The NOFO criterion says "In Attachment 4, provide..." — it directs content to the attachment.
  "SEE ATTACHMENT 4" is acceptable if the attachment is complete with dates, activities, and staff.
"""

    prompt = f"""Score this SAMHSA section using the qualitative scoring scale.

SECTION: {letter} — {name}
MAXIMUM SCORE: {max_score}
AGENCY: {agency}
{section_rules}
EVALUATION QUESTIONS FOR THIS SECTION:{question_text}
{reviewer_note_text}

NOFO TEXT:
{_extract_criteria_pages(nofo_text)}

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
9. Each comment: 1-3 concise sentences. No unexpanded acronyms.
10. NOFO PAGE CITATIONS: The evaluation criteria with point values appear in the NOFO text above.
    Use the page numbers shown in the "--- NOFO PAGE X ---" markers next to the section headings
    with point values (e.g., "A: Population of focus and need statement (35 points)").
    Do NOT cite pages from the Program Description section (typically pages 1-15)."""

    needed_tokens = 6000
    # Build clean message: NOFO criteria pages + application text + scoring instructions
    nofo_criteria = _extract_criteria_pages(nofo_text)
    # Strip application text from prompt to avoid duplication (it's in the cached block)
    instructions_only = prompt.split("APPLICATION:")[0] if "APPLICATION:" in prompt else prompt
    # Remove the NOFO TEXT block from instructions too (it's in the cached block)
    if "NOFO TEXT:" in instructions_only:
        instructions_only = instructions_only.split("NOFO TEXT:")[0] + instructions_only.split("INSTRUCTIONS:")[1] if "INSTRUCTIONS:" in instructions_only else instructions_only.split("NOFO TEXT:")[0]
        instructions_only = instructions_only.rstrip() + "\n\nINSTRUCTIONS:" + prompt.split("INSTRUCTIONS:")[-1] if "INSTRUCTIONS:" in prompt else instructions_only

    response = client.messages.create(
        model=model, max_tokens=needed_tokens, temperature=0,
        system=[{"type": "text", "text": SAMHSA_SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": [
            {"type": "text", "text": f"=== NOFO EVALUATION CRITERIA ===\n{nofo_criteria}\n\n=== GRANT APPLICATION (score THIS document) ===\n{application_text}", "cache_control": {"type": "ephemeral"}},
            {"type": "text", "text": instructions_only},
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


def _score_cpp(client, model: str, application_text: str, nofo_text: str, pages: list[str] = None) -> dict[str, Any]:
    """Score the Confidentiality and Participant Protection section.

    Uses full application text to ensure attachments (especially Attachment 6) are included.
    """
    import logging
    logger = logging.getLogger("grant_worker")

    # Build text focusing on attachment pages where CPP content lives
    # Include full app text or at minimum the last 40% where attachments are
    if pages and len(pages) > 10:
        # Include first 5 pages (cover/TOC) + last 40% of pages (attachments)
        attachment_start = max(5, int(len(pages) * 0.5))
        cpp_text_blocks = []
        for i in range(min(5, len(pages))):
            cpp_text_blocks.append(f"--- APPLICATION PAGE {i+1} ---\n{pages[i].strip()}")
        for i in range(attachment_start, len(pages)):
            cpp_text_blocks.append(f"--- APPLICATION PAGE {i+1} ---\n{pages[i].strip()}")
        cpp_app_text = "\n\n".join(cpp_text_blocks)
    else:
        cpp_app_text = application_text

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

    prompt = f"""Assess the Confidentiality and Participant Protection for this SAMHSA grant application.
Look in Attachment 6, Attachment 2, and Attachment 3 for CPP content.

"Participants" = people receiving PREVENTION SERVICES only. NOT advisory committee/CAC/YAC members.

NOTE: Some attachment pages may be scanned images that appear blank in the extracted text.
If a page shows only a header (e.g., "ATTACHMENT 6- CONFIDENTIALITY") with no body text,
the content may exist as a scanned image. Flag this: "Page X appears to contain scanned
content that could not be extracted. Manual verification recommended."

Three required elements:

1. FAIR SELECTION: How will service delivery participants be recruited/selected? Voluntary? Informed consent?
   INADEQUATE IF: No recruitment/selection process described.

2. DATA COLLECTION: Procedures and data sources described? Instruments in Attachment 2 (or web links)?
   INADEQUATE IF: No instruments or links in Attachment 2.

3. PRIVACY/CONFIDENTIALITY: Where is data stored? Who has access? How are identities protected?
   INADEQUATE IF: Storage, access, or identity protection not explained.

OVERALL: Adequate (all OK) / Comment (minor deficiency, can proceed) / Concern (inadequate element, cannot proceed).
Must reflect most serious individual rating.

CONCISENESS RULE: Each element rating should be 2-4 sentences max. State what was found, cite the
page, note any gaps. Do not repeat the full text of consent forms or procedures — summarize the key
protections. The overall comment should be 3-4 sentences max.

APPLICATION (including attachments):
{cpp_app_text[:60000]}"""

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

    # Ensure nested CPP objects are dicts, not JSON strings
    for key in ("fair_selection", "data_collection", "privacy_confidentiality"):
        val = result.get(key)
        if isinstance(val, str):
            try:
                result[key] = json.loads(val)
            except (json.JSONDecodeError, TypeError):
                result[key] = {"rating": "adequate", "comment": val}

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
    model = os.getenv("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
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
        cpp_future = pool.submit(_score_cpp, client, model, application_text, nofo_text, pages)

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
            pass

    # --- Post-scoring audits (same as HRSA) ---
    try:
        from .anthropic_review import _audit_nofo_citations, _audit_weakness_facts
        logger.info("Running NOFO citation audit...")
        review = _audit_nofo_citations(client, model, review, nofo_text)
        logger.info("Running weakness factual accuracy audit...")
        review = _audit_weakness_facts(client, model, review, pages)
    except Exception as audit_exc:
        logger.warning("Post-scoring audits failed (non-blocking): %s", audit_exc)

    logger.info("SAMHSA review complete: %d/%d (audit: %s)", total_score, max_total,
                review.get("audit_status", "skipped"))
    return review
