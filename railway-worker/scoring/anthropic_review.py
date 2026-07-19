"""Claude-backed, evidence-grounded grant application scoring."""
from __future__ import annotations

import os
import json
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from .safe_review import extract_pdf_pages

SYSTEM_PROMPT = """You are an independent federal grant merit reviewer. Score only against the approved review criteria supplied by the user. Use only application evidence; never invent facts, page numbers, findings, or budget amounts. Apply HRSA comment conventions: third person, present tense, criterion-specific findings, and constructive language. A strength exceeds a criterion, a met finding satisfies it, and a weakness materially falls short. Do not use outside knowledge. Every substantive finding must cite application page numbers. Scores must be integers within each criterion maximum and reflect the significance of findings. This is a draft for human reviewer validation, not an award decision."""


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
    finding = {"type": "object", "additionalProperties": False, "required": ["comment", "pages"], "properties": {"comment": {"type": "string"}, "pages": {"type": "array", "minItems": 1, "items": {"type": "integer", "minimum": 1}}}}
    criterion = {"type": "object", "additionalProperties": False, "required": ["name", "score", "maximum_points", "score_rationale", "strengths", "mets", "weaknesses", "subcriteria"], "properties": {
        "name": {"type": "string"}, "score": {"type": "integer", "minimum": 0}, "maximum_points": {"type": "integer", "minimum": 0}, "score_rationale": {"type": "string"},
        "strengths": {"type": "array", "items": finding}, "mets": {"type": "array", "items": finding}, "weaknesses": {"type": "array", "items": finding},
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
    expected = {str(c["name"]).strip().lower(): int(c["points"]) for c in criteria}
    returned = {str(c.get("name", "")).strip().lower(): c for c in review.get("criteria", [])}
    if set(returned) != set(expected):
        raise ValueError("Claude returned criteria that do not exactly match the approved rubric")
    total, ordered = 0, []
    for source in criteria:
        item = returned[str(source["name"]).strip().lower()]
        maximum, score = int(source["points"]), int(item.get("score", -1))
        if not 0 <= score <= maximum:
            raise ValueError(f"Invalid score for {source['name']}: {score}/{maximum}")
        item["name"], item["maximum_points"] = source["name"], maximum
        for group in ("strengths", "mets", "weaknesses"):
            for finding in item.get(group, []):
                pages = finding.get("pages", [])
                if not pages or any(not isinstance(p, int) or p < 1 or p > page_count for p in pages):
                    raise ValueError(f"Invalid evidence citation in {source['name']}")
        subs = item.get("subcriteria", [])
        if subs and (sum(int(s["maximum_points"]) for s in subs) != maximum or sum(int(s["score"]) for s in subs) != score):
            raise ValueError(f"Subcriterion totals do not reconcile for {source['name']}")
        if any(int(s["score"]) < 0 or int(s["score"]) > int(s["maximum_points"]) for s in subs):
            raise ValueError(f"Invalid subcriterion score for {source['name']}")
        total += score
        ordered.append(item)
    review.update({"criteria": ordered, "final_score": total, "maximum_score": sum(expected.values()), "review_status": "ai_draft_human_validation_required", "certification": "Claude-generated draft. A human reviewer must verify every finding, citation, score, and budget recommendation."})
    return review


def score_application_with_claude(application: Path, criteria: list[dict[str, Any]], agency: str, guidance: str = "") -> dict[str, Any]:
    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured.")
    pages, application_text = _application_text(application)
    rubric = "\n".join(f"- {c['name']}: {int(c['points'])} points" for c in criteria)
    prompt = f"Agency: {agency}\nAPPROVED RUBRIC:\n{rubric}\n\nNOFO/WORKSHEET GUIDANCE:\n{guidance[:30000]}\n\nAPPLICATION:\n{application_text}\n\nReturn one complete review. Criterion names and maximum points must exactly match the approved rubric. If guidance explicitly provides scored subcriteria, include them and ensure their scores and maximums sum to the parent criterion. Use an empty finding list when no support exists; do not fabricate evidence."
    payload = {"model": os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5"), "max_tokens": 12000, "temperature": 0, "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": prompt}], "tools": [_tool(criteria)], "tool_choice": {"type": "tool", "name": "submit_grant_review"}}
    request = urllib.request.Request("https://api.anthropic.com/v1/messages", data=json.dumps(payload).encode("utf-8"), headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try: detail = json.loads(raw).get("error", {}).get("message", raw[:500])
        except ValueError: detail = raw[:500]
        raise RuntimeError(f"Anthropic API error ({exc.code}): {detail}") from exc
    tool_use = next((block for block in body.get("content", []) if block.get("type") == "tool_use" and block.get("name") == "submit_grant_review"), None)
    if not tool_use:
        raise RuntimeError("Claude did not return a structured grant review")
    return _validate(tool_use["input"], criteria, len(pages))
