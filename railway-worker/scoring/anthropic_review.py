"""Claude-backed, evidence-grounded grant application scoring."""
from __future__ import annotations

import os
import json
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from .safe_review import extract_pdf_pages

SYSTEM_PROMPT = """You are an independent federal grant merit reviewer applying the Equitable Federal Grant Scoring Formula v1. Score only against the approved review criteria supplied by the user. Use only application evidence; never invent facts, page numbers, findings, or budget amounts. Apply HRSA comment conventions: third person, present tense, criterion-specific findings, and constructive language. Do not use outside knowledge. Every substantive finding must cite application page numbers. This is a draft for human reviewer validation, not an award decision.

EQUITABLE SCORING FORMULA v1 — SCORING BANDS:
- Strength (multiplier 1.00): ALL requirements exceeded with documented above-and-beyond evidence. CRITICAL: Do not award Strength merely because no weakness was found. Strength requires explicit, documented evidence that the applicant went beyond what the NOFO requires.
- Met (multiplier 0.90): ALL requirements adequately addressed, no gaps, no exceedance. Met = 90%, NOT 100%. This is the expected baseline when the application fully satisfies all requirements.
- Minor weakness (multiplier 0.70): Most requirements addressed; limited gaps reduce reviewer confidence.
- Moderate weakness (multiplier 0.50): Multiple requirements partially addressed or missing.
- Major weakness (multiplier 0.25): A mandatory element is omitted or seriously deficient.
- Not addressed (multiplier 0.00): No responsive information found for this criterion.

Score = round_half_up(maximum_points × multiplier)

COMMENT FORMAT — HRSA ARMS STYLE:
Each finding should be 1-3 concise sentences (not a single sentence, not a full paragraph). Each finding covers one substantive observation. Limit to 2-4 findings per criterion or subcriterion — quality over quantity. Cite only the 1-3 most relevant application pages where the core evidence appears (e.g., "App p. 33, 34"). Do NOT list every page that tangentially mentions the topic — cite only the pages where the primary supporting evidence is found. Broad page ranges (5+ pages) weaken the citation.

Never use unexpanded acronyms — always write the full term first, followed by the acronym in parentheses on first use. Example: "Leadership Education in Neurodevelopmental and Related Disabilities (LEND)" then "LEND" thereafter.

STRENGTH LANGUAGE: Use professional superlatives that signal the finding exceeds the requirement — "comprehensive," "well-organized," "clearly articulates," "well-established," "well-integrated," "well-documented," "thoroughly demonstrates," "strong established partnerships." Do not use flat or generic language for strengths.

MET FINDINGS: If all requirements under a criterion are strengths, write "None" for Met. Only list Met findings when the application satisfies a requirement adequately without exceeding it.

WEAKNESS FINDINGS: If no material gaps exist, write "None" for Weakness. Only list weaknesses supported by a specific NOFO requirement citation.

REVIEWER VOICE RULE — CRITICAL: NEVER include any specific numbers, statistics, percentages, dollar amounts, counts, ratios, names of places, names of people, names of partner organizations, or data points from the application. Describe WHAT TYPE of evidence was provided and HOW WELL it supports the requirement — not the evidence itself.

WRONG: "The applicant documents 249 primary care Health Professional Shortage Areas and wait times exceeding six months at 25% of centers."
WRONG: "The applicant provides data showing 1 in 25 children aged 3-17 with autism and 3.1% of Ohio children with autism."
WRONG: "The applicant partners with Cincinnati Children's Hospital and the University of Cincinnati UCEDD."
WRONG: "The budget requests $734,000 annually with 30% Project Director effort."

RIGHT: "The applicant thoroughly documents workforce shortages across primary care and mental health disciplines using current federal Health Professional Shortage Area designations and regional specialty provider availability data."
RIGHT: "The application clearly demonstrates significant access barriers through national specialty center wait-time data and early diagnosis rate metrics."
RIGHT: "The applicant demonstrates strong established partnerships with regional academic medical centers, University Centers for Excellence in Developmental Disabilities, and Title V programs."
RIGHT: "The applicant requests funding precisely matching the Notice of Funding Opportunity tier ceiling, with appropriate personnel effort allocations."

The reviewer's job is to assess WHETHER evidence was provided and HOW STRONG it is — not to summarize the evidence itself. The application speaks for itself; the reviewer evaluates its quality.

WEAKNESS RULES: Every weakness MUST cite the specific NOFO requirement the application falls short of, with the exact NOFO page number(s). Include application page(s) showing the shortfall and explain the material impact. Do not identify weaknesses based on reviewer preference or outside knowledge — only against explicitly stated NOFO requirements. If a weakness cannot be supported by a specific NOFO requirement, omit it rather than lowering the score.

FACTUAL ACCURACY — CRITICAL:
Before asserting any weakness, RE-READ the cited application pages and verify your claim is factually correct:
- The APPLICANT ORGANIZATION is the entity that submitted the application (named on SF-424 / cover page). All personnel listed in the application are presumed to be employed by or affiliated with the applicant unless the application explicitly states otherwise.
- Do NOT claim a person is employed elsewhere unless the application explicitly says so. If the application names someone as Project Director, they are the applicant's PD.
- Do NOT confuse the applicant organization with partner organizations, subrecipients, or consortium members. The applicant is the lead entity.
- Do NOT assume a person lacks a qualification (faculty status, licensure, credentials) unless the application clearly omits it or states they lack it.
- If you are uncertain whether a weakness is factually supported by the application text, omit it. A false weakness is worse than a missed one."""


def _application_text(path: Path, max_chars: int = 175_000) -> tuple[list[str], str]:
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


def _tool(criteria: list[dict[str, Any]]) -> dict[str, Any]:
    strength_met_finding = {
        "type": "object", "additionalProperties": False,
        "required": ["comment", "application_pages"],
        "properties": {
            "comment": {"type": "string"},
            "application_pages": {"type": "array", "minItems": 1, "items": {"type": "integer", "minimum": 1}}
        }
    }
    weakness_finding = {
        "type": "object", "additionalProperties": False,
        "required": ["comment", "application_pages", "nofo_requirement", "nofo_pages", "impact"],
        "properties": {
            "comment": {"type": "string"},
            "application_pages": {"type": "array", "minItems": 1, "items": {"type": "integer", "minimum": 1}},
            "nofo_requirement": {"type": "string", "description": "Exact or faithful paraphrase of the NOFO requirement the application falls short of"},
            "nofo_pages": {"type": "array", "minItems": 1, "items": {"type": "integer", "minimum": 1}},
            "impact": {"type": "string", "description": "Why the shortfall matters to this review criterion"}
        }
    }
    criterion = {"type": "object", "additionalProperties": False, "required": ["name", "score", "maximum_points", "score_rationale", "strengths", "mets", "weaknesses", "subcriteria"], "properties": {
        "name": {"type": "string"}, "score": {"type": "integer", "minimum": 0}, "maximum_points": {"type": "integer", "minimum": 0}, "score_rationale": {"type": "string"},
        "strengths": {"type": "array", "items": strength_met_finding}, "mets": {"type": "array", "items": strength_met_finding}, "weaknesses": {"type": "array", "items": weakness_finding},
        "subcriteria": {"type": "array", "items": {"type": "object", "additionalProperties": False, "required": ["name", "score", "maximum_points"], "properties": {"name": {"type": "string"}, "score": {"type": "integer", "minimum": 0}, "maximum_points": {"type": "integer", "minimum": 0}}}}}}
    overview_keys = ["applicant_information", "target_population", "project_description", "goals_objectives", "significant_findings", "other_information"]
    return {"name": "submit_grant_review", "description": "Submit the complete evidence-grounded grant review.", "input_schema": {"type": "object", "additionalProperties": False,
        "required": ["applicant_name", "application_number", "overview", "criteria", "budget", "overall_summary"], "properties": {
            "applicant_name": {"type": "string"}, "application_number": {"type": "string"},
            "overview": {"type": "object", "additionalProperties": False, "required": overview_keys, "properties": {key: {"type": "string"} for key in overview_keys}},
            "criteria": {"type": "array", "minItems": len(criteria), "maxItems": len(criteria), "items": criterion},
            "budget": {"type": "object", "additionalProperties": False, "required": ["recommendation", "annual_recommended_funding", "reduction_rationale"], "properties": {
                "recommendation": {"type": "string", "enum": ["as_requested", "as_reduced", "unable_to_determine"]},
                "annual_recommended_funding": {"type": "array", "items": {"type": ["number", "null"]}, "maxItems": 5}, "reduction_rationale": {"type": "string"}}},
            "overall_summary": {"type": "string"}}}}


def _validate(review: dict[str, Any], criteria: list[dict[str, Any]], page_count: int) -> dict[str, Any]:
    import logging
    logger = logging.getLogger("grant_worker")
    expected = {str(c["name"]).strip().lower(): int(c["points"]) for c in criteria}
    returned = {str(c.get("name", "")).strip().lower(): c for c in review.get("criteria", [])}
    if set(returned) != set(expected):
        # Try best-effort matching: map returned names to expected by substring containment
        logger.warning("Exact criterion name mismatch. Expected: %s — Got: %s", list(expected.keys()), list(returned.keys()))
        mapped: dict[str, Any] = {}
        unmatched_returned = dict(returned)
        for exp_name in expected:
            # Try exact match first
            if exp_name in unmatched_returned:
                mapped[exp_name] = unmatched_returned.pop(exp_name)
                continue
            # Try substring match (expected name contained in returned, or vice versa)
            match = None
            for ret_name in list(unmatched_returned):
                if exp_name in ret_name or ret_name in exp_name:
                    match = ret_name
                    break
            if match:
                mapped[exp_name] = unmatched_returned.pop(match)
                mapped[exp_name]["name"] = next(c["name"] for c in criteria if c["name"].strip().lower() == exp_name)
                continue
            # No match found — accept by position if counts align
        if len(mapped) == len(expected):
            returned = mapped
        elif len(review.get("criteria", [])) == len(criteria):
            logger.warning("Falling back to positional criterion matching")
            returned = {}
            for i, source in enumerate(criteria):
                item = review["criteria"][i]
                item["name"] = source["name"]
                returned[source["name"].strip().lower()] = item
        else:
            raise ValueError(f"Claude returned {len(review.get('criteria',[]))} criteria but rubric has {len(criteria)}: expected {list(expected.keys())}, got {[c.get('name','?') for c in review.get('criteria',[])]}")
    total, ordered = 0, []
    for source in criteria:
        item = returned[str(source["name"]).strip().lower()]
        maximum, score = int(source["points"]), int(item.get("score", -1))
        if not 0 <= score <= maximum:
            raise ValueError(f"Invalid score for {source['name']}: {score}/{maximum}")
        item["name"], item["maximum_points"] = source["name"], maximum
        for group in ("strengths", "mets"):
            for finding in item.get(group, []):
                pages = finding.get("application_pages", finding.get("pages", []))
                if not pages or any(not isinstance(p, int) or p < 1 or p > page_count for p in pages):
                    raise ValueError(f"Invalid evidence citation in {source['name']}")
        for finding in item.get("weaknesses", []):
            app_pages = finding.get("application_pages", finding.get("pages", []))
            if not app_pages or any(not isinstance(p, int) or p < 1 or p > page_count for p in app_pages):
                raise ValueError(f"Invalid application evidence citation in weakness for {source['name']}")
            if not finding.get("nofo_requirement"):
                raise ValueError(f"Weakness missing nofo_requirement in {source['name']}")
            nofo_pages = finding.get("nofo_pages", [])
            if not nofo_pages or not all(isinstance(p, int) and p >= 1 for p in nofo_pages):
                raise ValueError(f"Weakness missing valid nofo_pages in {source['name']}")
        # Equitable formula v1 validation
        multiplier = item.get("multiplier")
        valid_multipliers = [1.0, 0.9, 0.7, 0.5, 0.25, 0.0]
        if multiplier is not None and multiplier not in valid_multipliers:
            raise ValueError(f"Invalid multiplier {multiplier} for {source['name']} — must be one of {valid_multipliers}")
        calculated_score = item.get("calculated_score")
        if multiplier is not None and calculated_score is not None:
            import math
            expected_score = math.floor(maximum * multiplier + 0.5)  # round_half_up
            if abs(int(calculated_score) - expected_score) > 1:
                raise ValueError(f"calculated_score {calculated_score} does not match round_half_up({maximum} × {multiplier}) = {expected_score} for {source['name']}")
        # If classification is strength, at least one requirement must have status "exceeds"
        classification = item.get("classification")
        if classification == "strength":
            req_assessments = item.get("requirement_assessments", [])
            if req_assessments and not any(r.get("response_status") == "exceeds" for r in req_assessments):
                logger.warning("Strength classification for '%s' but no requirement has status 'exceeds'", source['name'])
        subs = item.get("subcriteria", [])
        if subs and (sum(int(s["maximum_points"]) for s in subs) != maximum or sum(int(s["score"]) for s in subs) != score):
            raise ValueError(f"Subcriterion totals do not reconcile for {source['name']}")
        if any(int(s["score"]) < 0 or int(s["score"]) > int(s["maximum_points"]) for s in subs):
            raise ValueError(f"Invalid subcriterion score for {source['name']}")
        total += score
        ordered.append(item)
    review.update({"criteria": ordered, "final_score": total, "maximum_score": sum(expected.values()), "review_status": "ai_draft_human_validation_required", "certification": "Claude-generated draft. A human reviewer must verify every finding, citation, score, and budget recommendation."})
    return review


def _score_single_criterion(client, model: str, application_text: str, criterion: dict, agency: str, nofo_text: str, page_count: int) -> dict[str, Any]:
    """Score one criterion in isolation. Called in parallel."""
    import logging
    logger = logging.getLogger("grant_worker")
    name = criterion["name"]
    points = int(criterion["points"])

    # Question-answer finding: answers a specific NOFO evaluation question
    question_answer = {"type": "object", "additionalProperties": False,
        "required": ["nofo_question", "answer", "application_pages", "assessment"],
        "properties": {
            "nofo_question": {"type": "string", "description": "The VERBATIM evaluation question or bullet copied exactly from the NOFO text. Do not paraphrase or invent."},
            "answer": {"type": "string", "description": "How the application addresses this question — one concise sentence"},
            "application_pages": {"type": "array", "minItems": 1, "items": {"type": "integer", "minimum": 1}},
            "assessment": {"type": "string", "enum": ["strength", "met", "weakness"], "description": "Whether the response exceeds (strength), satisfies (met), or falls short (weakness) of the requirement"},
            "nofo_requirement": {"type": "string", "description": "For weaknesses only: the exact NOFO requirement text"},
            "nofo_pages": {"type": "array", "items": {"type": "integer", "minimum": 1}, "description": "For weaknesses only: NOFO page numbers"},
            "impact": {"type": "string", "description": "For weaknesses only: material impact of the shortfall"},
        }}

    # Requirement-level assessment — primary output, one per NOFO bullet
    requirement_assessment = {
        "type": "object", "additionalProperties": False,
        "required": ["requirement_text", "nofo_pages", "response_status", "finding_type", "application_pages", "explanation"],
        "properties": {
            "requirement_text": {"type": "string", "description": "The NOFO requirement bullet or evaluation question being assessed"},
            "nofo_pages": {"type": "array", "items": {"type": "integer", "minimum": 1}},
            "response_status": {"type": "string", "enum": ["exceeds", "fully_addressed", "partially_addressed", "not_addressed", "unable_to_evaluate"]},
            "finding_type": {"type": "string", "enum": ["strength", "met", "weakness"], "description": "Whether this requirement is a strength (exceeds), met (adequately addressed), or weakness (falls short)"},
            "application_pages": {"type": "array", "items": {"type": "integer", "minimum": 1}},
            "explanation": {"type": "string", "description": "1-3 sentence reviewer comment describing how the applicant addressed this requirement"},
            "nofo_requirement": {"type": "string", "description": "For weaknesses only: the exact NOFO requirement text the application falls short of"},
            "impact": {"type": "string", "description": "For weaknesses only: material impact of the shortfall"},
        }
    }

    strength_met = {"type": "object", "additionalProperties": False, "required": ["comment", "application_pages"], "properties": {"comment": {"type": "string"}, "application_pages": {"type": "array", "minItems": 1, "items": {"type": "integer", "minimum": 1}}}}
    weakness = {"type": "object", "additionalProperties": False, "required": ["comment", "application_pages", "nofo_requirement", "nofo_pages", "impact"], "properties": {"comment": {"type": "string"}, "application_pages": {"type": "array", "minItems": 1, "items": {"type": "integer", "minimum": 1}}, "nofo_requirement": {"type": "string"}, "nofo_pages": {"type": "array", "minItems": 1, "items": {"type": "integer", "minimum": 1}}, "impact": {"type": "string"}}}
    sub = {"type": "object", "additionalProperties": False, "required": ["name", "score", "maximum_points"], "properties": {"name": {"type": "string"}, "score": {"type": "integer", "minimum": 0}, "maximum_points": {"type": "integer", "minimum": 0}}}

    tool = {"name": "score_criterion", "description": f"Submit equitable score for '{name}' ({points} points). classification determines score via multiplier.", "input_schema": {"type": "object", "additionalProperties": False,
        "required": ["name", "maximum_points", "classification", "multiplier", "calculated_score", "score_rationale", "strengths", "mets", "weaknesses"],
        "properties": {"name": {"type": "string", "enum": [name]}, "maximum_points": {"type": "integer", "enum": [points]},
            "classification": {"type": "string", "enum": ["strength", "met", "minor_weakness", "moderate_weakness", "major_weakness", "not_addressed"]},
            "multiplier": {"type": "number", "enum": [1.0, 0.9, 0.7, 0.5, 0.25, 0.0]},
            "calculated_score": {"type": "integer", "minimum": 0},
            "score_rationale": {"type": "string", "description": "1-2 sentence overall summary"},
            "strengths": {"type": "array", "items": strength_met}, "mets": {"type": "array", "items": strength_met},
            "weaknesses": {"type": "array", "items": weakness},
            "subcriteria": {"type": "array", "items": sub},
            "formula_version": {"type": "string", "enum": ["equitable-v1.2"]},
            "requirement_assessments": {"type": "array", "items": requirement_assessment},
            "question_responses": {"type": "array", "items": question_answer}}}}

    # Build subcriteria prompt if defined
    subcriteria_defs = criterion.get("subcriteria", [])
    if subcriteria_defs:
        sub_text = "\n".join(f"  {s['name']}: {s['points']} points" for s in subcriteria_defs)
        sub_instruction = f"\n\nSUBCRITERIA (score each individually — scores must sum to the parent criterion total):\n{sub_text}\n\nYou MUST return a subcriteria array with exact names and point allocations matching the list above. Each subcriterion score must be between 0 and its maximum. The sum of subcriterion scores must equal the parent criterion score.\n\nIMPORTANT: In requirement_assessments, prefix each explanation with the subcriterion name in brackets, e.g., '[Overall methodology] The applicant...' or '[Trainee recruitment and retention] The applicant...'. Group strengths, mets, and weaknesses by subcriterion as well."
        # Update tool schema to enforce subcriteria names
        sub_enum = {"type": "object", "additionalProperties": False, "required": ["name", "score", "maximum_points"], "properties": {
            "name": {"type": "string", "enum": [s["name"] for s in subcriteria_defs]},
            "score": {"type": "integer", "minimum": 0},
            "maximum_points": {"type": "integer", "enum": [int(s["points"]) for s in subcriteria_defs]}
        }}
        tool["input_schema"]["properties"]["subcriteria"] = {"type": "array", "minItems": len(subcriteria_defs), "maxItems": len(subcriteria_defs), "items": sub_enum}
    else:
        sub_instruction = ""

    prompt = f"""Score this single criterion using the Equitable Federal Grant Scoring Formula v1.

CRITERION: {name}
MAXIMUM POINTS: {points}
AGENCY: {agency}{sub_instruction}

NOFO TEXT (find the evaluation questions/bullets for this criterion):
{nofo_text[:15000]}

APPLICATION:
{application_text}

SCORING FORMULA (Equitable Formula v1):
- Strength (1.00): ALL requirements exceeded, documented above-and-beyond evidence
- Met (0.90): ALL requirements adequately addressed, no gaps, no exceedance
- Minor weakness (0.70): Most addressed, limited gaps reduce confidence
- Moderate weakness (0.50): Multiple partial/missing requirements
- Major weakness (0.25): Mandatory element omitted or seriously deficient
- Not addressed (0.00): No responsive information found

Score = round_half_up(maximum_points × multiplier)

CRITICAL SCORING CALIBRATION:
- Met (90%) is the expected score when all requirements are fully and adequately addressed. This is a strong score.
- Strength (100%) is earned when the applicant provides documented evidence of meaningfully exceeding the NOFO requirement — not merely addressing it thoroughly. Strength is legitimate when earned but should be justified by specific above-and-beyond evidence.
- "fully_addressed" is the correct requirement status when the applicant adequately addresses what was asked. "exceeds" requires the applicant to provide something the NOFO did not require that materially adds value.
- Do NOT award Strength merely because the writing is polished or no weakness was found. That is Met.
- Do NOT confuse thoroughness with exceedance. A complete, well-organized response to exactly what was asked is Met.

INSTRUCTIONS — WORKSHEET-ALIGNED OUTPUT:
The PRIMARY output is requirement_assessments. Create ONE entry for EACH NOFO evaluation bullet/requirement listed under this criterion. This is how the reviewer worksheet is structured — one row per NOFO requirement.

1. Find EVERY evaluation bullet listed under this criterion in the NOFO text. Each bullet that starts with a bullet point or describes what the panel will review becomes one requirement_assessment entry.
2. For EACH requirement bullet, assess:
   - requirement_text: Copy the NOFO bullet text (faithful paraphrase OK if very long)
   - response_status: exceeds / fully_addressed / partially_addressed / not_addressed / unable_to_evaluate
   - finding_type: strength (if exceeds), met (if fully_addressed), weakness (if partially/not addressed)
   - explanation: 1-3 sentence reviewer comment on how the applicant addressed this requirement
   - application_pages: 1-3 most relevant pages where evidence is found
   - nofo_pages: NOFO page(s) where this requirement appears
   - For weaknesses: include nofo_requirement (exact text) and impact
3. If this criterion has subcriteria, prefix each explanation with the subcriterion name in brackets (e.g., "[Overall methodology] The applicant...").
4. Classify the overall criterion (strength/met/minor_weakness/moderate_weakness/major_weakness/not_addressed).
5. Apply the corresponding multiplier (1.0/0.9/0.7/0.5/0.25/0.0).
6. For strengths, use professional superlative language — "thoroughly documents," "comprehensively addresses," "clearly demonstrates exceptional." Do not use generic language.
7. Calculate: calculated_score = round_half_up(maximum_points × multiplier). Set formula_version to "equitable-v1.2".
8. Also provide traditional strengths/mets/weaknesses lists for backward compatibility. Each finding in these lists should correspond to a requirement_assessment entry.
9. Look for EXPLICIT evaluation questions in the NOFO. Only include VERBATIM questions. If none exist, return an EMPTY question_responses array.
10. Give an overall score_rationale summarizing the criterion assessment.
11. Each comment must be one concise sentence. No unexpanded acronyms."""

    # Larger criteria (35 pts with subcriteria) need more output tokens
    needed_tokens = 8000 if points >= 25 or subcriteria_defs else 5000
    # Split prompt: cacheable blocks (app text, NOFO) + criterion-specific instruction
    criterion_instruction = prompt.split("APPLICATION:")[0] + prompt.split(application_text)[-1] if application_text in prompt else prompt
    response = client.messages.create(model=model, max_tokens=needed_tokens, temperature=0,
        system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": [
            {"type": "text", "text": f"NOFO TEXT:\n{nofo_text[:15000]}\n\nAPPLICATION:\n{application_text}", "cache_control": {"type": "ephemeral"}},
            {"type": "text", "text": criterion_instruction},
        ]}],
        tools=[tool], tool_choice={"type": "tool", "name": "score_criterion"})

    tool_use = next((b for b in response.content if b.type == "tool_use"), None)
    if not tool_use:
        raise RuntimeError(f"Claude did not score criterion '{name}'")
    result = tool_use.input
    if isinstance(result, str):
        result = json.loads(result)
    result["name"] = name
    result["maximum_points"] = points
    # If Claude didn't return the equitable fields, compute from what we have
    MULTIPLIER_MAP = {"strength": 1.0, "met": 0.9, "minor_weakness": 0.7, "moderate_weakness": 0.5, "major_weakness": 0.25, "not_addressed": 0.0}
    if not result.get("calculated_score") and result.get("classification"):
        mult = MULTIPLIER_MAP.get(result["classification"], 0.9)
        result["multiplier"] = mult
        result["calculated_score"] = round(points * mult)
        result["formula_version"] = "equitable-v1.2"
    elif not result.get("calculated_score") and result.get("score"):
        # Legacy: Claude returned a raw score — infer classification
        raw = result["score"]
        ratio = raw / points if points > 0 else 0
        if ratio >= 0.95: result["classification"] = "strength"
        elif ratio >= 0.75: result["classification"] = "met"
        elif ratio >= 0.55: result["classification"] = "minor_weakness"
        elif ratio >= 0.45: result["classification"] = "moderate_weakness"
        elif ratio >= 0.15: result["classification"] = "major_weakness"
        else: result["classification"] = "not_addressed"
        result["multiplier"] = MULTIPLIER_MAP[result["classification"]]
        result["calculated_score"] = round(points * result["multiplier"])
        result["formula_version"] = "equitable-v1.2"
    # Map calculated_score → score for backward compatibility with frontend/validate
    result["score"] = result.get("calculated_score", result.get("score", 0))
    logger.info("  Criterion '%s': %s/%s (multiplier=%s, classification=%s)",
                name, result.get("score"), points,
                result.get("multiplier"), result.get("classification"))
    return result


def _audit_nofo_citations(client, model: str, review: dict[str, Any], nofo_text: str) -> dict[str, Any]:
    """Post-scoring audit: verify every NOFO citation against actual NOFO pages.

    Collects all NOFO page citations from question_responses, requirement_assessments,
    and weaknesses, then asks Claude to verify each against the real NOFO page text.
    Strips or flags hallucinated citations.
    """
    import logging
    logger = logging.getLogger("grant_worker")

    if not nofo_text:
        logger.warning("No NOFO text available for citation audit — skipping")
        return review

    # --- Collect all NOFO citations to verify ---
    citations_to_verify = []
    for crit in review.get("criteria", []):
        crit_name = crit.get("name", "unknown")

        # question_responses
        for qr in (crit.get("question_responses") or []):
            if not isinstance(qr, dict):
                continue
            citations_to_verify.append({
                "criterion": crit_name,
                "source": "question_response",
                "claimed_text": qr.get("nofo_question", ""),
                "claimed_pages": qr.get("nofo_pages") or [],
                "field": "nofo_question",
            })

        # requirement_assessments
        for ra in (crit.get("requirement_assessments") or []):
            if not isinstance(ra, dict):
                continue
            citations_to_verify.append({
                "criterion": crit_name,
                "source": "requirement_assessment",
                "claimed_text": ra.get("requirement_text", ""),
                "claimed_pages": ra.get("nofo_pages", []),
                "field": "requirement_text",
            })

        # weaknesses
        for w in (crit.get("weaknesses") or []):
            if not isinstance(w, dict):
                continue
            if w.get("nofo_requirement"):
                citations_to_verify.append({
                    "criterion": crit_name,
                    "source": "weakness",
                    "claimed_text": w.get("nofo_requirement", ""),
                    "claimed_pages": w.get("nofo_pages", []),
                    "field": "nofo_requirement",
                })

    if not citations_to_verify:
        logger.info("No NOFO citations to audit")
        return review

    logger.info("Auditing %d NOFO citations", len(citations_to_verify))

    # --- Build citation list for Claude ---
    citation_lines = []
    for i, c in enumerate(citations_to_verify):
        pages_str = ", ".join(str(p) for p in c["claimed_pages"]) if c["claimed_pages"] else "none"
        citation_lines.append(
            "CITATION " + str(i) + ":\n"
            "  Criterion: " + c["criterion"] + "\n"
            "  Type: " + c["source"] + "\n"
            "  Claimed text: " + c["claimed_text"] + "\n"
            "  Claimed NOFO pages: " + pages_str
        )

    audit_tool = {
        "name": "submit_audit",
        "description": "Submit the NOFO citation audit results.",
        "input_schema": {
            "type": "object",
            "additionalProperties": False,
            "required": ["results"],
            "properties": {
                "results": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["citation_index", "verified", "corrected_pages", "explanation"],
                        "properties": {
                            "citation_index": {"type": "integer", "minimum": 0},
                            "verified": {"type": "boolean", "description": "true if the claimed text exists on or near the claimed NOFO pages"},
                            "corrected_pages": {"type": "array", "items": {"type": "integer", "minimum": 1}, "description": "Correct NOFO page numbers where this text actually appears, or empty if not found anywhere"},
                            "explanation": {"type": "string", "description": "Brief explanation of verification result"},
                        },
                    },
                },
            },
        },
    }

    audit_prompt = (
        "You are auditing NOFO citations from a grant review for accuracy.\n\n"
        "For each citation below, verify whether the claimed text actually appears "
        "(verbatim or as a close paraphrase) on the claimed NOFO pages. Check the "
        "actual NOFO page text provided.\n\n"
        "Rules:\n"
        "- A citation is VERIFIED if the text (or a close faithful paraphrase) appears on "
        "the claimed page or within 1-2 pages of it.\n"
        "- If the text exists but on different pages, mark verified=false and provide corrected_pages.\n"
        "- If the text does not exist anywhere in the NOFO, mark verified=false with empty corrected_pages.\n"
        "- Be strict: fabricated requirements that sound plausible but don't appear in the NOFO should fail.\n\n"
        "NOFO TEXT:\n" + nofo_text[:80000] + "\n\n"
        "CITATIONS TO VERIFY:\n" + "\n\n".join(citation_lines)
    )

    try:
        response = client.messages.create(
            model=model,
            max_tokens=4000,
            temperature=0,
            system="You are a precise citation auditor. Your only job is to verify whether claimed NOFO text exists on the claimed pages. Be strict and factual.",
            messages=[{"role": "user", "content": [
                {"type": "text", "text": "NOFO TEXT:\n" + nofo_text[:80000], "cache_control": {"type": "ephemeral"}},
                {"type": "text", "text": "CITATIONS TO VERIFY:\n" + "\n\n".join(citation_lines)},
            ]}],
            tools=[audit_tool],
            tool_choice={"type": "tool", "name": "submit_audit"},
        )
        tool_use = next((b for b in response.content if b.type == "tool_use"), None)
        if not tool_use:
            logger.warning("Audit did not return structured results — skipping")
            return review
        audit_results = tool_use.input
        if isinstance(audit_results, str):
            audit_results = json.loads(audit_results)
    except Exception as exc:
        logger.warning("NOFO citation audit failed: %s — returning review unmodified", exc)
        return review

    # --- Apply audit results ---
    failed_indices = set()
    corrections = {}
    for result in audit_results.get("results", []):
        idx = result.get("citation_index")
        if idx is None or idx < 0 or idx >= len(citations_to_verify):
            continue
        if not result.get("verified"):
            corrected = result.get("corrected_pages", [])
            if corrected:
                corrections[idx] = corrected
                logger.info("  Citation %d: page corrected to %s — %s", idx, corrected, result.get("explanation", ""))
            else:
                failed_indices.add(idx)
                logger.warning("  Citation %d FAILED audit: %s", idx, result.get("explanation", ""))

    if not failed_indices and not corrections:
        logger.info("All %d NOFO citations verified", len(citations_to_verify))
        review["audit_status"] = "all_citations_verified"
        return review

    # --- Strip or correct citations in the review ---
    # Build lookup: (criterion_name, source_type, claimed_text) -> citation index
    citation_lookup = {}
    for i, c in enumerate(citations_to_verify):
        citation_lookup[(c["criterion"], c["source"], c["claimed_text"])] = i

    for crit in review.get("criteria", []):
        crit_name = crit.get("name", "unknown")

        # Filter question_responses
        if isinstance(crit.get("question_responses"), list):
            filtered_qr = []
            for qr in crit["question_responses"]:
                if not isinstance(qr, dict):
                    continue
                key = (crit_name, "question_response", qr.get("nofo_question", ""))
                idx = citation_lookup.get(key)
                if idx in failed_indices:
                    logger.info("  Removing hallucinated question_response from %s: %s", crit_name, qr.get("nofo_question", "")[:80])
                    continue
                if idx in corrections:
                    qr["nofo_pages"] = corrections[idx]
                filtered_qr.append(qr)
            crit["question_responses"] = filtered_qr

        # Correct requirement_assessments pages (don't remove — they affect scoring)
        if isinstance(crit.get("requirement_assessments"), list):
            for ra in crit["requirement_assessments"]:
                if not isinstance(ra, dict):
                    continue
                key = (crit_name, "requirement_assessment", ra.get("requirement_text", ""))
                idx = citation_lookup.get(key)
                if idx in corrections:
                    ra["nofo_pages"] = corrections[idx]
                if idx in failed_indices:
                    ra["audit_flag"] = "nofo_citation_not_verified"

        # Correct weakness NOFO pages (don't remove — they affect scoring)
        if isinstance(crit.get("weaknesses"), list):
            for w in crit["weaknesses"]:
                if not isinstance(w, dict):
                    continue
                key = (crit_name, "weakness", w.get("nofo_requirement", ""))
                idx = citation_lookup.get(key)
                if idx in corrections:
                    w["nofo_pages"] = corrections[idx]
                if idx in failed_indices:
                    w["audit_flag"] = "nofo_citation_not_verified"

    removed = len(failed_indices)
    corrected = len(corrections)
    logger.info("Audit complete: %d citations removed, %d corrected, %d verified",
                removed, corrected, len(citations_to_verify) - removed - corrected)
    review["audit_status"] = "completed"
    review["audit_summary"] = {
        "total_citations": len(citations_to_verify),
        "verified": len(citations_to_verify) - removed - corrected,
        "corrected": corrected,
        "removed": removed,
    }
    return review


def _audit_weakness_facts(client, model: str, review: dict[str, Any], pages: list[str]) -> dict[str, Any]:
    """Post-scoring audit: verify each weakness claim is factually supported by the cited application pages.

    For each weakness, extracts the actual text from the cited application pages
    and asks Claude whether the claim is supported, contradicted, or unsupported.
    Removes findings that are contradicted by the evidence.
    """
    import logging
    logger = logging.getLogger("grant_worker")

    # Collect all weaknesses with their cited application page text
    weaknesses_to_verify = []
    for crit in review.get("criteria", []):
        crit_name = crit.get("name", "unknown")
        for wi, w in enumerate(crit.get("weaknesses") or []):
            if not isinstance(w, dict):
                continue
            app_pages = w.get("application_pages", w.get("pages", []))
            if not app_pages:
                continue

            # Extract the actual text from cited pages
            cited_text_blocks = []
            for p in app_pages:
                if isinstance(p, int) and 1 <= p <= len(pages):
                    cited_text_blocks.append("--- APPLICATION PAGE " + str(p) + " ---\n" + pages[p - 1].strip())
            if not cited_text_blocks:
                continue

            weaknesses_to_verify.append({
                "criterion": crit_name,
                "weakness_index": wi,
                "comment": w.get("comment", ""),
                "nofo_requirement": w.get("nofo_requirement", ""),
                "impact": w.get("impact", ""),
                "cited_app_pages": app_pages,
                "cited_text": "\n\n".join(cited_text_blocks),
            })

    if not weaknesses_to_verify:
        logger.info("No weaknesses to fact-check")
        return review

    logger.info("Fact-checking %d weakness findings against application text", len(weaknesses_to_verify))

    # Build the verification prompt
    weakness_entries = []
    for i, w in enumerate(weaknesses_to_verify):
        weakness_entries.append(
            "WEAKNESS " + str(i) + ":\n"
            "  Criterion: " + w["criterion"] + "\n"
            "  Claim: " + w["comment"] + "\n"
            "  NOFO requirement cited: " + w["nofo_requirement"] + "\n"
            "  Impact stated: " + w["impact"] + "\n"
            "  Application pages cited: " + ", ".join(str(p) for p in w["cited_app_pages"]) + "\n"
            "  ACTUAL TEXT FROM THOSE PAGES:\n" + w["cited_text"]
        )

    fact_check_tool = {
        "name": "submit_fact_check",
        "description": "Submit factual accuracy audit results for weakness findings.",
        "input_schema": {
            "type": "object",
            "additionalProperties": False,
            "required": ["results"],
            "properties": {
                "results": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["weakness_index", "verdict", "explanation"],
                        "properties": {
                            "weakness_index": {"type": "integer", "minimum": 0},
                            "verdict": {
                                "type": "string",
                                "enum": ["supported", "unsupported", "contradicted"],
                                "description": "supported = application text confirms the claim; unsupported = text doesn't address it; contradicted = text directly disproves the claim",
                            },
                            "explanation": {"type": "string", "description": "Brief explanation citing specific text from the application pages"},
                        },
                    },
                },
            },
        },
    }

    # Limit total text to avoid token overflow
    combined_entries = "\n\n".join(weakness_entries)
    if len(combined_entries) > 100000:
        combined_entries = combined_entries[:100000] + "\n\n[TRUNCATED]"

    try:
        response = client.messages.create(
            model=model,
            max_tokens=4000,
            temperature=0,
            system=(
                "You are a factual accuracy auditor for federal grant reviews. "
                "For each weakness finding, you are given the reviewer's claim AND the actual application text from the cited pages. "
                "Your job is to determine whether the application text SUPPORTS, does NOT SUPPORT, or CONTRADICTS the claim.\n\n"
                "Rules:\n"
                "- SUPPORTED: The application text on the cited pages confirms what the reviewer claimed.\n"
                "- UNSUPPORTED: The cited pages don't contain enough information to confirm or deny the claim. The reviewer may be inferring beyond what's written.\n"
                "- CONTRADICTED: The application text directly disproves the reviewer's claim. For example, the reviewer says a person lacks a qualification but the text shows they have it, "
                "or the reviewer says a person is employed elsewhere but the application identifies them as staff of the applicant organization.\n\n"
                "Be strict about CONTRADICTED — only use it when the text clearly disproves the claim. "
                "Pay special attention to:\n"
                "- Who the applicant organization is (the entity on the cover page / SF-424)\n"
                "- Whether named personnel are employed by the applicant vs. a partner\n"
                "- Whether qualifications (faculty status, licensure, etc.) are actually missing or just not mentioned in the cited pages\n"
                "- Whether the reviewer confused the applicant with a subrecipient or consortium member"
            ),
            messages=[{"role": "user", "content": [
                {"type": "text", "text": combined_entries, "cache_control": {"type": "ephemeral"}},
            ]}],
            tools=[fact_check_tool],
            tool_choice={"type": "tool", "name": "submit_fact_check"},
        )
        tool_use = next((b for b in response.content if b.type == "tool_use"), None)
        if not tool_use:
            logger.warning("Fact-check did not return structured results — skipping")
            return review
        fact_results = tool_use.input
        if isinstance(fact_results, str):
            fact_results = json.loads(fact_results)
    except Exception as exc:
        logger.warning("Weakness fact-check failed: %s — returning review unmodified", exc)
        return review

    # Apply results
    contradicted_keys = set()  # (criterion_name, weakness_index)
    unsupported_keys = set()
    for result in fact_results.get("results", []):
        idx = result.get("weakness_index")
        if idx is None or idx < 0 or idx >= len(weaknesses_to_verify):
            continue
        w_info = weaknesses_to_verify[idx]
        verdict = result.get("verdict", "")
        if verdict == "contradicted":
            contradicted_keys.add((w_info["criterion"], w_info["weakness_index"]))
            logger.warning("  Weakness %d (%s) CONTRADICTED by application text: %s",
                           idx, w_info["criterion"], result.get("explanation", ""))
        elif verdict == "unsupported":
            unsupported_keys.add((w_info["criterion"], w_info["weakness_index"]))
            logger.warning("  Weakness %d (%s) UNSUPPORTED by application text: %s",
                           idx, w_info["criterion"], result.get("explanation", ""))

    if not contradicted_keys and not unsupported_keys:
        logger.info("All %d weakness findings fact-checked — all supported", len(weaknesses_to_verify))
        if "audit_summary" not in review:
            review["audit_summary"] = {}
        review["audit_summary"]["weakness_fact_check"] = {
            "total": len(weaknesses_to_verify),
            "supported": len(weaknesses_to_verify),
            "unsupported": 0,
            "contradicted": 0,
        }
        return review

    # Remove contradicted weaknesses, flag unsupported ones
    for crit in review.get("criteria", []):
        crit_name = crit.get("name", "unknown")
        if not isinstance(crit.get("weaknesses"), list):
            continue
        filtered = []
        for wi, w in enumerate(crit["weaknesses"]):
            key = (crit_name, wi)
            if key in contradicted_keys:
                logger.info("  REMOVING contradicted weakness from %s: %s",
                            crit_name, (w.get("comment", ""))[:80])
                continue  # drop it
            if key in unsupported_keys:
                w["audit_flag"] = "claim_not_supported_by_cited_pages"
            filtered.append(w)
        crit["weaknesses"] = filtered

    removed = len(contradicted_keys)
    flagged = len(unsupported_keys)
    supported = len(weaknesses_to_verify) - removed - flagged
    logger.info("Fact-check complete: %d supported, %d unsupported (flagged), %d contradicted (removed)",
                supported, flagged, removed)
    if "audit_summary" not in review:
        review["audit_summary"] = {}
    review["audit_summary"]["weakness_fact_check"] = {
        "total": len(weaknesses_to_verify),
        "supported": supported,
        "unsupported": flagged,
        "contradicted": removed,
    }
    return review


def score_application_with_claude(application: Path, criteria: list[dict[str, Any]], agency: str, guidance: str = "") -> dict[str, Any]:
    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured.")
    import anthropic, logging
    from concurrent.futures import ThreadPoolExecutor, as_completed
    logger = logging.getLogger("grant_worker")

    pages, application_text = _application_text(application)
    model = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5")
    client = anthropic.Anthropic(api_key=api_key, timeout=300.0)
    nofo_text = guidance or ""

    # --- All 7 calls in parallel: 6 criteria + 1 overview ---
    logger.info("Scoring %d criteria + overview in parallel with %s", len(criteria), model)
    scored_criteria = [None] * len(criteria)
    overview_data = {}
    errors = []

    def _get_overview():
        overview_tool = {"name": "submit_overview", "description": "Submit the OVERVIEW PRESENTATION INFORMATION and budget recommendation.", "input_schema": {"type": "object", "additionalProperties": False,
            "required": ["applicant_name", "application_number", "overview", "budget", "overall_summary"],
            "properties": {
                "applicant_name": {"type": "string", "description": "Full legal name of the applicant organization"},
                "application_number": {"type": "string", "description": "Application or grant number from SF-424 or cover page"},
                "overview": {"type": "object", "additionalProperties": False,
                    "required": ["applicant_information", "target_population", "project_description", "goals_objectives", "significant_findings", "other_information"],
                    "properties": {
                        "applicant_information": {"type": "string", "description": "Who the applicant is: organization type, location, mission, relevant experience. 2-3 sentences."},
                        "target_population": {"type": "string", "description": "Target population, service area, and appropriateness of the budget for the proposed scope. 2-3 sentences."},
                        "project_description": {"type": "string", "description": "Proposed project/program description: what is being proposed and how it will be accomplished. 2-3 sentences."},
                        "goals_objectives": {"type": "string", "description": "Major goals and objectives of the proposed project. 2-3 sentences."},
                        "significant_findings": {"type": "string", "description": "The most significant strength and/or weakness found in the application. 2-3 sentences citing specific evidence."},
                        "other_information": {"type": "string", "description": "Any other pertinent information relevant to the review. 1-2 sentences or 'None identified.'"},
                    }},
                "budget": {"type": "object", "additionalProperties": False, "required": ["recommendation", "annual_recommended_funding", "reduction_rationale"], "properties": {
                    "recommendation": {"type": "string", "enum": ["as_requested", "as_reduced", "unable_to_determine"]},
                    "annual_recommended_funding": {"type": "array", "items": {"type": ["number", "null"]}, "maxItems": 5},
                    "reduction_rationale": {"type": "string"}}},
                "overall_summary": {"type": "string", "description": "2-3 sentence overall assessment of the application's competitiveness."}}}}
        rubric_list = "\n".join(f"- {c['name']}: {int(c['points'])} points" for c in criteria)
        overview_system = """You are completing the OVERVIEW PRESENTATION INFORMATION section of an HRSA reviewer worksheet. This section provides a concise "big picture" of who the applicant is, what is being proposed, how it will be accomplished in view of the published program guidance and review criteria, and the most significant strength and/or weakness found in the application.

Each overview field should be 2-3 concise sentences. Never use unexpanded acronyms — always write the full term first, then the acronym in parentheses. Be factual and evidence-based. Do not speculate or use outside knowledge."""
        # Include beginning (cover/narrative) + end (budget pages) of application
        app_start = application_text[:40000]
        app_end = application_text[-25000:] if len(application_text) > 65000 else ""
        app_combined = app_start + ("\n\n[...middle pages omitted for brevity...]\n\n" + app_end if app_end else "")
        prompt = (f"Agency: {agency}\n\nRUBRIC:\n{rubric_list}\n\nNOFO GUIDANCE:\n{nofo_text[:15000]}\n\n"
                  f"APPLICATION (beginning + budget/end pages):\n{app_combined}\n\n"
                  "Complete the OVERVIEW PRESENTATION INFORMATION worksheet section and provide the budget recommendation.\n\n"
                  "BUDGET INSTRUCTIONS: Extract the EXACT annual budget amounts for ALL years of the project period from the SF-424A or budget justification. "
                  "The project period length is stated in the NOFO. If the NOFO says 5 years, you must provide 5 annual amounts. "
                  "Do NOT leave years as null unless the application truly omits them. Budget data is typically in the last pages of the application.")
        resp = client.messages.create(model=model, max_tokens=4000, temperature=0, system=overview_system,
            messages=[{"role": "user", "content": prompt}], tools=[overview_tool], tool_choice={"type": "tool", "name": "submit_overview"})
        tu = next((b for b in resp.content if b.type == "tool_use"), None)
        result = tu.input if tu else {}
        if isinstance(result, str):
            result = json.loads(result)
        return result

    # Score criteria in parallel (3 workers for Render Standard 1GB RAM)
    from concurrent.futures import ThreadPoolExecutor, as_completed
    with ThreadPoolExecutor(max_workers=3) as pool:
        criterion_futures = {
            pool.submit(_score_single_criterion, client, model, application_text, crit, agency, nofo_text, len(pages)): i
            for i, crit in enumerate(criteria)
        }
        overview_future = pool.submit(_get_overview)

        for future in as_completed(list(criterion_futures.keys()) + [overview_future]):
            if future == overview_future:
                try:
                    overview_data = future.result()
                    logger.info("  Overview extracted: %s", overview_data.get("applicant_name", "?"))
                except Exception as exc:
                    logger.error("Overview failed: %s", exc)
                    errors.append(f"Overview: {exc}")
            else:
                idx = criterion_futures[future]
                try:
                    scored_criteria[idx] = future.result()
                except Exception as exc:
                    logger.error("Criterion %d (%s) failed: %s", idx, criteria[idx]['name'], exc)
                    errors.append(f"{criteria[idx]['name']}: {exc}")

    # Overview handled in the parallel block above

    if errors:
        raise RuntimeError("Scoring failed: " + "; ".join(errors))

    # --- Assemble final review ---
    # Ensure each criterion has score mapped from calculated_score for backward compatibility
    for item in scored_criteria:
        if item is not None:
            item["score"] = item.get("calculated_score", item.get("score", 0))
    total = sum(c.get("calculated_score", c.get("score", 0)) for c in scored_criteria)
    max_total = sum(int(c["points"]) for c in criteria)

    review = {
        "applicant_name": overview_data.get("applicant_name", ""),
        "application_number": overview_data.get("application_number", ""),
        "overview": overview_data.get("overview", {}),
        "criteria": scored_criteria,
        "budget": overview_data.get("budget", {}),
        "overall_summary": overview_data.get("overall_summary", ""),
        "final_score": total,
        "maximum_score": max_total,
        "formula_version": "equitable-v1.2",
        "review_status": "ai_draft_human_validation_required",
        "certification": "Claude-generated draft. A human reviewer must verify every finding, citation, score, and budget recommendation.",
    }
    # --- Post-scoring audits ---
    logger.info("Running NOFO citation audit...")
    review = _audit_nofo_citations(client, model, review, nofo_text)

    logger.info("Running weakness factual accuracy audit...")
    review = _audit_weakness_facts(client, model, review, pages)

    logger.info("Review complete: %d/%d (formula: equitable-v1.2, audit: %s)", total, max_total, review.get("audit_status", "skipped"))
    return review
