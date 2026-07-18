"""Evidence-first grant review workflow with traceable citations."""
from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable

try:
    import fitz
except ImportError:  # pragma: no cover
    fitz = None

DEFAULT_HRSA_CRITERIA = [
    {"name": "Statement of Need", "points": 20, "keywords": ["need", "population", "disparity", "data"]},
    {"name": "Project Description", "points": 20, "keywords": ["project", "approach", "activities", "services"]},
    {"name": "Goals and Objectives", "points": 15, "keywords": ["goal", "objective", "target", "measurable"]},
    {"name": "Methods and Work Plan", "points": 15, "keywords": ["method", "work plan", "timeline", "milestone"]},
    {"name": "Evaluation", "points": 15, "keywords": ["evaluation", "outcome", "measure", "baseline"]},
    {"name": "Organizational Capacity", "points": 10, "keywords": ["capacity", "experience", "staff", "qualification"]},
    {"name": "Budget and Budget Justification", "points": 5, "keywords": ["budget", "cost", "justification", "funds"]},
]

@dataclass
class Evidence:
    page: int
    quote: str
    matched_keywords: list[str]

def extract_pdf_pages(path: Path) -> list[str]:
    if fitz is None:
        raise RuntimeError("PyMuPDF is required: pip install pymupdf")
    with fitz.open(path) as document:
        return [page.get_text("text") for page in document]

def _sentences(text: str) -> Iterable[str]:
    for sentence in re.split(r"(?<=[.!?])\s+|\n+", text):
        cleaned = " ".join(sentence.split())
        if 30 <= len(cleaned) <= 500:
            yield cleaned

def find_evidence(pages: list[str], keywords: list[str], limit: int = 3) -> list[Evidence]:
    ranked = []
    normalized = [keyword.lower() for keyword in keywords]
    for page_number, page_text in enumerate(pages, start=1):
        for sentence in _sentences(page_text):
            lower = sentence.lower()
            matched = sorted({keyword for keyword in normalized if keyword in lower})
            if matched:
                ranked.append((len(matched), page_number, sentence, matched))
    ranked.sort(key=lambda item: (-item[0], item[1], item[2]))
    results, seen = [], set()
    for _, page, quote, matched in ranked:
        if (page, quote) in seen:
            continue
        seen.add((page, quote))
        results.append(Evidence(page, quote, matched))
        if len(results) == limit:
            break
    return results

def review_application(review_id: str, application: Path, criteria: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    criteria = criteria or DEFAULT_HRSA_CRITERIA
    pages = extract_pdf_pages(application)
    word_count = sum(len(page.split()) for page in pages)
    evaluable = bool(pages and word_count >= 250)
    criterion_results = []
    for criterion in criteria:
        evidence = find_evidence(pages, criterion.get("keywords", [])) if evaluable else []
        status = "evidence_found" if evidence else ("not_found" if evaluable else "unable_to_evaluate")
        criterion_results.append({
            "name": criterion["name"], "maximum_points": int(criterion["points"]),
            "status": status, "automated_points": 0 if status != "evidence_found" else None,
            "final_points": None, "human_review_required": True,
            "evidence": [asdict(item) for item in evidence],
            "draft_strength": None,
            "draft_weakness": f"The application does not provide identifiable information responsive to {criterion['name']}." if status == "not_found" else None,
        })
    return {
        "schema_version": "1.0", "review_id": review_id, "application_file": application.name,
        "page_count": len(pages), "word_count": word_count,
        "review_status": "draft_human_review_required" if evaluable else "unable_to_evaluate",
        "final_score": None,
        "certification": "Automated evidence map only; reviewer validation and scoring are required.",
        "criteria": criterion_results,
    }

def render_markdown(result: dict[str, Any]) -> str:
    lines = [f"# Grant Review Draft — {result['review_id']}", "", f"- Application: `{result['application_file']}`",
             f"- Pages: {result['page_count']}", f"- Status: **{result['review_status']}**", "",
             "> Automated evidence map only. A human reviewer must validate every finding and assign final scores.", ""]
    for criterion in result["criteria"]:
        lines += [f"## {criterion['name']}", "", f"Status: **{criterion['status']}**", ""]
        lines += [f"- Page {item['page']}: {item['quote']}" for item in criterion["evidence"]] or ["- No traceable application evidence identified."]
        lines += ["", f"Final score: ___ / {criterion['maximum_points']}", ""]
    return "\n".join(lines)

def run_manifest(manifest_path: Path, output_dir: Path) -> list[dict[str, Any]]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    reviews = manifest.get("reviews", [])
    if len(reviews) != 3:
        raise ValueError("The manifest must contain exactly three reviews")
    output_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for item in reviews:
        review_id = str(item["review_id"])
        application = (manifest_path.parent / item["application"]).resolve()
        result = review_application(review_id, application, item.get("criteria"))
        review_dir = output_dir / review_id
        review_dir.mkdir(parents=True, exist_ok=True)
        (review_dir / "review.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
        (review_dir / "review.md").write_text(render_markdown(result), encoding="utf-8")
        results.append(result)
    return results
