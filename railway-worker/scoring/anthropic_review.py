"""Claude-backed, evidence-grounded grant application scoring."""
from __future__ import annotations

import os
import json
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from .safe_review import extract_pdf_pages

SYSTEM_PROMPT = """You are an independent federal grant merit reviewer. Score only against the approved review criteria supplied by the user. Use only application evidence; never invent facts, page numbers, findings, or budget amounts. Apply HRSA comment conventions: third person, present tense, criterion-specific findings, and constructive language. A strength exceeds a criterion, a met finding satisfies it, and a weakness materially falls short. Do not use outside knowledge. Every substantive finding must cite application page numbers. Scores must be integers within each criterion maximum and reflect the significance of findings. This is a draft for human reviewer validation, not an award decision.

COMMENT FORMAT: Each finding comment MUST be a single concise sentence — not a paragraph. Be specific and direct. One finding = one observation. If a topic has multiple aspects, create separate findings. Never use unexpanded acronyms — always write the full term first, followed by the acronym in parentheses on first use. For example, write "Children and Youth with Special Health Care Needs (CYSHCN)" not "CYSHCN." Example strength: "The applicant provides comprehensive workforce data documenting a 40% shortage of developmental pediatricians statewide." Example met: "The training plan includes the required 300 clinical contact hours across three settings." Example weakness: "The evaluation plan does not specify measurable outcome targets for Year 2 performance indicators."

WEAKNESS RULES: Every weakness MUST cite the specific NOFO requirement the application falls short of, with the exact NOFO page number(s). Include application page(s) showing the shortfall and explain the material impact. Do not identify weaknesses based on reviewer preference or outside knowledge — only against explicitly stated NOFO requirements. If a weakness cannot be supported by a specific NOFO requirement, omit it rather than lowering the score."""


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

    strength_met = {"type": "object", "additionalProperties": False, "required": ["comment", "application_pages"], "properties": {"comment": {"type": "string"}, "application_pages": {"type": "array", "minItems": 1, "items": {"type": "integer", "minimum": 1}}}}
    weakness = {"type": "object", "additionalProperties": False, "required": ["comment", "application_pages", "nofo_requirement", "nofo_pages", "impact"], "properties": {"comment": {"type": "string"}, "application_pages": {"type": "array", "minItems": 1, "items": {"type": "integer", "minimum": 1}}, "nofo_requirement": {"type": "string"}, "nofo_pages": {"type": "array", "minItems": 1, "items": {"type": "integer", "minimum": 1}}, "impact": {"type": "string"}}}
    sub = {"type": "object", "additionalProperties": False, "required": ["name", "score", "maximum_points"], "properties": {"name": {"type": "string"}, "score": {"type": "integer", "minimum": 0}, "maximum_points": {"type": "integer", "minimum": 0}}}

    tool = {"name": "score_criterion", "description": f"Submit score for '{name}' ({points} points).", "input_schema": {"type": "object", "additionalProperties": False,
        "required": ["name", "score", "maximum_points", "score_rationale", "strengths", "mets", "weaknesses", "subcriteria"],
        "properties": {"name": {"type": "string", "enum": [name]}, "score": {"type": "integer", "minimum": 0, "maximum": points}, "maximum_points": {"type": "integer", "enum": [points]},
            "score_rationale": {"type": "string"}, "strengths": {"type": "array", "items": strength_met}, "mets": {"type": "array", "items": strength_met},
            "weaknesses": {"type": "array", "items": weakness}, "subcriteria": {"type": "array", "items": sub}}}}

    prompt = f"Score this single criterion:\n\nCRITERION: {name}\nMAXIMUM POINTS: {points}\nAGENCY: {agency}\n\nNOFO TEXT:\n{nofo_text[:20000]}\n\nAPPLICATION:\n{application_text}\n\nScore ONLY this criterion. Each finding comment must be one concise sentence with application page citations. Every weakness must cite the NOFO requirement and page."

    response = client.messages.create(model=model, max_tokens=4000, temperature=0, system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}], tools=[tool], tool_choice={"type": "tool", "name": "score_criterion"})

    tool_use = next((b for b in response.content if b.type == "tool_use"), None)
    if not tool_use:
        raise RuntimeError(f"Claude did not score criterion '{name}'")
    result = tool_use.input
    if isinstance(result, str):
        result = json.loads(result)
    result["name"] = name
    result["maximum_points"] = points
    logger.info("  Criterion '%s': %s/%s", name, result.get("score"), points)
    return result


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
        prompt = f"Agency: {agency}\n\nRUBRIC:\n{rubric_list}\n\nNOFO GUIDANCE:\n{nofo_text[:15000]}\n\nAPPLICATION:\n{application_text[:40000]}\n\nComplete the OVERVIEW PRESENTATION INFORMATION worksheet section and provide the budget recommendation."
        resp = client.messages.create(model=model, max_tokens=4000, temperature=0, system=overview_system,
            messages=[{"role": "user", "content": prompt}], tools=[overview_tool], tool_choice={"type": "tool", "name": "submit_overview"})
        tu = next((b for b in resp.content if b.type == "tool_use"), None)
        result = tu.input if tu else {}
        if isinstance(result, str):
            result = json.loads(result)
        return result

    with ThreadPoolExecutor(max_workers=7) as pool:
        # Submit all 6 criteria + 1 overview
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
                    logger.error("Criterion %d failed: %s", idx, exc)
                    errors.append(f"{criteria[idx]['name']}: {exc}")

    if errors:
        raise RuntimeError("Scoring failed: " + "; ".join(errors))

    # --- Assemble final review ---
    total = sum(c.get("score", 0) for c in scored_criteria)
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
        "review_status": "ai_draft_human_validation_required",
        "certification": "Claude-generated draft. A human reviewer must verify every finding, citation, score, and budget recommendation.",
    }
    logger.info("Review complete: %d/%d", total, max_total)
    return review
