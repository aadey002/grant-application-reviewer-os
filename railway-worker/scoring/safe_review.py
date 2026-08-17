"""Evidence-first grant review workflow with traceable citations."""
from __future__ import annotations

import json
import re
import zipfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable

try:
    import fitz
except ImportError:  # pragma: no cover
    fitz = None

try:
    from docx import Document
except ImportError:  # pragma: no cover
    Document = None

DEFAULT_HRSA_CRITERIA = [
    {"name": "Statement of Need", "points": 20, "keywords": ["need", "population", "disparity", "data"]},
    {"name": "Project Description", "points": 20, "keywords": ["project", "approach", "activities", "services"]},
    {"name": "Goals and Objectives", "points": 15, "keywords": ["goal", "objective", "target", "measurable"]},
    {"name": "Methods and Work Plan", "points": 15, "keywords": ["method", "work plan", "timeline", "milestone"]},
    {"name": "Evaluation", "points": 15, "keywords": ["evaluation", "outcome", "measure", "baseline"]},
    {"name": "Organizational Capacity", "points": 10, "keywords": ["capacity", "experience", "staff", "qualification"]},
    {"name": "Budget and Budget Justification", "points": 5, "keywords": ["budget", "cost", "justification", "funds"]},
]

def safe_extract_application_zip(
    archive: Path, destination: Path, max_files: int = 100,
    max_uncompressed_bytes: int = 500 * 1024 * 1024,
) -> list[Path]:
    """Extract PDF applications while preventing zip-slip and zip bombs."""
    destination.mkdir(parents=True, exist_ok=True)
    extracted = []
    total_size = 0
    with zipfile.ZipFile(archive) as bundle:
        members = [item for item in bundle.infolist() if not item.is_dir()]
        pdf_members = [item for item in members if Path(item.filename).suffix.lower() == ".pdf"]
        if not pdf_members:
            raise ValueError("ZIP contains no PDF applications")
        if len(pdf_members) > max_files:
            raise ValueError(f"ZIP contains more than {max_files} PDF applications")
        for index, member in enumerate(pdf_members, start=1):
            if member.flag_bits & 0x1:
                raise ValueError("Encrypted ZIP files are not supported")
            total_size += member.file_size
            if total_size > max_uncompressed_bytes:
                raise ValueError("ZIP uncompressed contents exceed the safety limit")
            safe_name = Path(member.filename).name
            if not safe_name or safe_name in {".", ".."}:
                raise ValueError("ZIP contains an unsafe filename")
            target = destination / f"{index:03d}_{safe_name}"
            with bundle.open(member) as source, open(target, "wb") as output:
                while chunk := source.read(1024 * 1024):
                    output.write(chunk)
            with open(target, "rb") as candidate:
                if candidate.read(5) != b"%PDF-":
                    target.unlink()
                    raise ValueError(f"{safe_name} is not a valid PDF file")
            extracted.append(target)
    return extracted

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

def extract_document_pages(path: Path) -> list[str]:
    if path.suffix.lower() == ".pdf":
        return extract_pdf_pages(path)
    if path.suffix.lower() == ".docx" and Document:
        text = "\n".join(paragraph.text for paragraph in Document(path).paragraphs)
        return [text]
    raise ValueError("NOFO must be PDF or DOCX")

def _extract_evaluation_bullets(nearby_text: str, truncate_at_subheadings: bool = False) -> list[str]:
    """Extract individual evaluation bullet points from text following a criterion heading.

    Looks for bullets starting with bullet characters or 'How' / 'The' / 'Whether' patterns
    that typically begin NOFO evaluation sub-criteria. Returns each bullet as a complete,
    cleaned string — these are the exact texts that must appear verbatim in requirement_assessments.
    """
    # First, truncate at the next criterion heading to prevent bleeding into subsequent criteria
    next_criterion = re.search(r'(?i)\n\s*Criterion\s+\d', nearby_text)
    if next_criterion:
        nearby_text = nearby_text[:next_criterion.start()]

    # When extracting for a subcriterion, truncate at the next "Name (N points)" heading
    if truncate_at_subheadings:
        next_sub = re.search(r'\n\s*[A-Z][A-Za-z][A-Za-z,\-: ]{2,80}?\s*\(\s*\d+\s*points?\s*\)', nearby_text)
        if next_sub:
            nearby_text = nearby_text[:next_sub.start()]

    # Also truncate at "Strengths" / "Weaknesses" / "Mets" section headers (reviewer worksheet markers)
    section_break = re.search(r'(?i)\n\s*(?:Strengths|Weaknesses|Mets)\s*(?:\(|$|\n)', nearby_text)
    if section_break:
        nearby_text = nearby_text[:section_break.start()]

    bullets = []
    # Split on bullet markers: •, ·, -, *, or numbered patterns like "1."
    lines = re.split(r'\n\s*[•·\u2022\u25e6\u2023\u2043\-\*]\s*|\n\s*\d+\.\s+', nearby_text)

    # Also try splitting on the pattern "• How" or "• The" etc. if few results
    if len(lines) <= 2:
        bullet_pattern = re.compile(r'(?:^|\n)\s*(?:[•·\u2022\u25e6\-\*]\s*|(?=(?:How |The |Whether |Describes |Shows |Provides |Responds |Engages |Justifies )))')
        lines = bullet_pattern.split(nearby_text)

    for line in lines:
        cleaned = " ".join(line.split()).strip()
        if len(cleaned) < 20:
            continue
        # Stop if we hit another criterion heading
        if re.match(r'(?i)criterion\s+\d', cleaned):
            break
        # Only keep lines that look like evaluation bullets
        if re.match(r'(?i)(How |The |Whether |Describes |Shows |Provides |Responds |Engages |Justifies |Your |You |Proposed )', cleaned):
            cleaned = cleaned.rstrip('.')
            # Truncate at sentence boundaries that introduce non-bullet content
            for stop_phrase in ['. We do not', '. We will', '. HRSA ', '. See ', '. Note:', '. If ']:
                stop_idx = cleaned.find(stop_phrase)
                if stop_idx > 20:
                    cleaned = cleaned[:stop_idx]
                    break
            bullets.append(cleaned)

    return bullets


def extract_nofo_criteria(path: Path) -> dict[str, Any]:
    """Extract criterion headings, subcriteria, and point values with source-page provenance."""
    pages = extract_document_pages(path)

    # Main criteria patterns: "Criterion 1: Name (20 points)" (HRSA)
    main_patterns = [
        re.compile(r"(?i)criterion\s+(\d+)\s*[:.\-–—]?\s*([^\n(]{2,100}?)\s*\(\s*(\d+)\s*points?\s*\)"),
        re.compile(r"(?i)(?:review\s+)?criterion\s+(\d+)\s*[:.\-–—]\s*([^\n]{2,100}?)\s*[—–-]\s*(\d+)\s*points?"),
    ]

    # SAMHSA section patterns: "A: Population of focus (35 points ...)" or "A: Name (Up to 35 points ...)"
    samhsa_section_pattern = re.compile(
        r"\n\s*([A-D])\s*[:.\-–—]\s*([^\n(]{2,100}?)\s*\(\s*(?:Up\s+to\s+)?(\d+)\s*points?"
    )
    # SAMHSA sub-question patterns: "1. Describe..." or "A.1" numbered items within sections
    samhsa_question_pattern = re.compile(
        r"\n\s*(\d+)\.\s+([A-Z][^\n]{10,300})"
    )

    # Subcriterion patterns: numbered "2.1 Name (10 points)"
    sub_numbered_patterns = [
        re.compile(r"(?i)(?:criterion\s+)?(\d+)\.(\d+)\s*[:.\-–—]?\s*([^\n(]{2,100}?)\s*\(\s*(\d+)\s*points?\s*\)"),
    ]

    # Unnumbered subcriterion: "Overall methodology (10 points)" — no "Criterion" prefix
    # Match lines like "Name here (N points)" that don't start with "Criterion"
    # Allow colons, digits for headings like "High-level work plan: Attachment 7 (7 points)"
    sub_unnumbered_pattern = re.compile(r"\n\s*([A-Z][A-Za-z][A-Za-z0-9,\-: ]{2,80}?)\s*\(\s*(\d+)\s*points?\s*\)")

    found = []
    all_point_entries: list[dict] = []  # all entries with points, sorted by page/position
    seen = set()

    # Pass 1: Extract all main criteria
    for page_number, text in enumerate(pages, start=1):
        for pattern in main_patterns:
            for match in pattern.finditer(text):
                number, name, points = match.groups()
                name = " ".join(name.split()).strip(" :-–—")
                key = (int(number), name.lower())
                if key in seen:
                    continue
                seen.add(key)
                nearby = text[match.end():match.end() + 2500]
                keywords = [word.lower() for word in re.findall(r"[A-Za-z][A-Za-z-]{3,}", name) if word.lower() not in {"criterion", "review"}]
                # Extract individual evaluation bullets from the nearby text
                evaluation_bullets = _extract_evaluation_bullets(nearby)
                criterion = {"number": int(number), "name": name, "points": int(points),
                              "keywords": keywords or [name.lower()], "source_page": page_number,
                              "source_heading": " ".join(match.group(0).split()),
                              "context_preview": " ".join(nearby.split())[:1500],
                              "evaluation_bullets": evaluation_bullets,
                              "_pos": match.start(), "_page": page_number}
                found.append(criterion)

    found.sort(key=lambda item: (item.get("_page", 0), item.get("_pos", 0)))

    # Pass 2: Find unnumbered subcriteria between main criteria
    # Build a list of all "Name (N points)" entries that are NOT main criteria
    main_names = {c["name"].lower() for c in found}
    all_sub_candidates: list[dict] = []

    for page_number, text in enumerate(pages, start=1):
        # Numbered subcriteria (2.1, 5.2, etc.)
        for pattern in sub_numbered_patterns:
            for match in pattern.finditer(text):
                parent_num, sub_num, name, points = match.groups()
                name = " ".join(name.split()).strip(" :-–—")
                all_sub_candidates.append({
                    "name": name, "points": int(points), "parent_hint": int(parent_num),
                    "source_page": page_number, "_pos": match.start(),
                })

        # Unnumbered subcriteria
        for match in sub_unnumbered_pattern.finditer(text):
            name, points = match.groups()
            name = " ".join(name.split()).strip(" :-–—")
            pts = int(points)
            # Skip if name starts with "Criterion" — it's a main criterion heading
            if re.match(r"(?i)criterion\s+\d", name):
                continue
            # Skip if this IS a main criterion (same name AND same points)
            main_match = next((c for c in found if c["name"].lower() == name.lower() and c["points"] == pts), None)
            if main_match:
                continue
            if pts >= 30:  # likely a main criterion, not sub
                continue
            all_sub_candidates.append({
                "name": name, "points": pts, "parent_hint": None,
                "source_page": page_number, "_pos": match.start(),
            })

    # Pass 3: Assign subcriteria to parent criteria by page/position proximity
    for sub in all_sub_candidates:
        # Find the closest preceding main criterion
        best_parent = None
        if sub.get("parent_hint"):
            # Numbered sub explicitly says which parent (e.g. "2.1" -> parent 2)
            best_parent = next((ci for ci, c in enumerate(found) if c["number"] == sub["parent_hint"]), None)
        if best_parent is None:
            # Pick the last criterion that starts BEFORE this sub in document order
            # (same page + earlier position, or earlier page)
            sub_page = sub["source_page"]
            sub_pos = sub.get("_pos", 0)
            for ci, criterion in enumerate(found):
                c_page = criterion.get("_page", criterion["source_page"])
                c_pos = criterion.get("_pos", 0)
                if sub["points"] >= criterion["points"]:
                    continue  # sub can't have more points than parent
                if c_page < sub_page:
                    best_parent = ci
                elif c_page == sub_page and c_pos < sub_pos:
                    best_parent = ci
        if best_parent is not None:
            if "subcriteria" not in found[best_parent]:
                found[best_parent]["subcriteria"] = []
            # Avoid duplicates
            existing = {s["name"].lower() for s in found[best_parent]["subcriteria"]}
            if sub["name"].lower() not in existing:
                found[best_parent]["subcriteria"].append({
                    "name": sub["name"], "points": sub["points"], "source_page": sub["source_page"],
                })

    # Pass 4: Extract evaluation bullets for each subcriterion from its source page
    for criterion in found:
        for sub in criterion.get("subcriteria", []):
            sp = sub.get("source_page")
            if not sp or sp < 1 or sp > len(pages):
                continue
            # Find the subcriterion heading on its page and extract bullets after it
            page_text = pages[sp - 1]
            # Escape regex-special characters in subcriterion name
            escaped = re.escape(sub["name"])
            # Allow optional extra text (e.g. ": Attachment 7") between name and points
            heading_match = re.search(
                r"(?i)" + escaped + r"[^(\n]{0,40}\(\s*\d+\s*points?\s*\)",
                page_text,
            )
            if heading_match:
                nearby = page_text[heading_match.end():heading_match.end() + 2500]
                sub_bullets = _extract_evaluation_bullets(nearby, truncate_at_subheadings=True)
                if sub_bullets:
                    sub["evaluation_bullets"] = sub_bullets
                    sub["eval_source_page"] = sp

    # Clean up internal fields
    for c in found:
        c.pop("_pos", None)
        c.pop("_page", None)

    found.sort(key=lambda item: item["number"])

    # If HRSA patterns found nothing, try SAMHSA section patterns
    if not found:
        letter_to_number = {"A": 1, "B": 2, "C": 3, "D": 4, "E": 5}
        samhsa_sections: list[dict] = []
        seen_letters: set[str] = set()
        for page_number, text in enumerate(pages, start=1):
            for match in samhsa_section_pattern.finditer(text):
                letter, name, points = match.groups()
                letter = letter.upper()
                if letter in seen_letters:
                    continue
                seen_letters.add(letter)
                name = " ".join(name.split()).strip(" :-–—")
                # Extract sub-questions for this section
                # Look at text after this match until the next section header
                remaining = text[match.end():]
                # Truncate at next section header (e.g., "\nB:" or "\nC:")
                next_section = re.search(r"\n\s*[A-E]\s*[:.]", remaining)
                if next_section:
                    remaining = remaining[:next_section.start()]
                questions = []
                for qmatch in samhsa_question_pattern.finditer(remaining):
                    q_num = qmatch.group(1)
                    q_text = " ".join(qmatch.group(2).split()).strip()
                    questions.append({
                        "id": f"{letter}.{q_num}",
                        "text": q_text[:300],
                    })
                # Also check subsequent pages for questions belonging to this section
                for next_pg in range(page_number, min(page_number + 3, len(pages) + 1)):
                    if next_pg == page_number:
                        continue  # already processed
                    next_text = pages[next_pg - 1]
                    # Stop if next page has a new section header
                    if re.search(r"\n\s*[A-E]\s*[:.].*\(\s*(?:Up\s+to\s+)?\d+\s*points?", next_text):
                        break
                    for qmatch in samhsa_question_pattern.finditer(next_text):
                        q_num = qmatch.group(1)
                        q_text = " ".join(qmatch.group(2).split()).strip()
                        q_id = f"{letter}.{q_num}"
                        if not any(q["id"] == q_id for q in questions):
                            questions.append({"id": q_id, "text": q_text[:300]})

                samhsa_sections.append({
                    "number": letter_to_number.get(letter, 0),
                    "letter": letter,
                    "name": name,
                    "points": int(points),
                    "keywords": [w.lower() for w in re.findall(r"[A-Za-z]{4,}", name)],
                    "source_page": page_number,
                    "source_heading": " ".join(match.group(0).split()),
                    "questions": questions,
                })
        if samhsa_sections:
            samhsa_sections.sort(key=lambda s: s["number"])
            found = samhsa_sections

    found.sort(key=lambda item: item["number"])
    total = sum(item["points"] for item in found)
    return {
        "criteria": found, "total_points": total, "source_file": path.name,
        "status": "ready_for_approval" if found and total > 0 else "unable_to_extract",
        "warnings": ([] if total == 100 else [f"Extracted point total is {total}, not 100; reviewer verification required."]),
        "human_approval_required": True,
    }

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
    if not reviews:
        raise ValueError("The manifest must contain at least one review")
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
