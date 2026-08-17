"""Claude-backed, evidence-grounded grant application scoring."""
from __future__ import annotations

import os
import json
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from .safe_review import extract_pdf_pages

HRSA_SYSTEM_PROMPT = """You are an independent federal grant merit reviewer applying the Equitable Federal Grant Scoring Formula v1. Score only against the approved review criteria supplied by the user. Use only application evidence; never invent facts, page numbers, findings, or budget amounts. Apply HRSA comment conventions: third person, present tense, criterion-specific findings, and constructive language. Do not use outside knowledge. Every substantive finding must cite application page numbers. This is a draft for human reviewer validation, not an award decision.

EQUITABLE SCORING FORMULA v1 — SCORING BANDS:
- Strength (multiplier 1.00): ALL requirements exceeded with documented above-and-beyond evidence. CRITICAL: Do not award Strength merely because no weakness was found. Strength requires explicit, documented evidence that the applicant went beyond what the NOFO requires.
- Met (multiplier 0.90): ALL requirements adequately addressed, no gaps, no exceedance. Met = 90%, NOT 100%. This is the expected baseline when the application fully satisfies all requirements.
- Minor weakness (multiplier 0.70): Most requirements addressed; limited gaps reduce reviewer confidence.
- Moderate weakness (multiplier 0.50): Multiple requirements partially addressed or missing.
- Major weakness (multiplier 0.25): A mandatory element is omitted or seriously deficient.
- Not addressed (multiplier 0.00): No responsive information found for this criterion.

Score = round_half_up(maximum_points × multiplier)

COMMENT FORMAT — HRSA ARMS STYLE:
Each finding is ONE concise evaluative statement — not a summary of what the application says. The reviewer EVALUATES, the application SPEAKS FOR ITSELF.

CONCISENESS RULES — CRITICAL:
- Maximum 1-2 sentences per finding. If you need multiple points, use bullet format: "• point one • point two"
- Do NOT repeat or restate application content. Do NOT describe what the applicant wrote, proposed, or included.
- DO state your evaluative judgment: how well, how thoroughly, how clearly the requirement was addressed.
- One finding per worksheet question. No padding, no filler, no restating the NOFO requirement in the comment.

CALIBRATION EXAMPLES — study these carefully. The RIGHT versions are the standard:

WRONG (50 words): "The applicant clearly articulates a well-established organizational foundation as a Federally Qualified Health Center with decades of rural service delivery, active federal grant management experience across multiple award types, and a patient-composed Board of Directors that embeds lived experience in governance — a structural feature that exceeds the standard demonstration of organizational capacity."
RIGHT (25 words): "The applicant exceeds the requirement as an established FQHC with decades of rural service, active multi-award federal grant management, and a patient-composed Board embedding lived experience in governance."

WRONG (49 words): "The applicant thoroughly demonstrates strong established partnerships with all three proposed consortium members, documenting prior working relationships, each partner's distinct role in the regional substance use disorder service continuum, and the rationale for partner selection based on geographic location within the rural service area and existing operational ties to the applicant."
RIGHT (30 words): "The applicant demonstrates established partnerships with all consortium members, documenting prior relationships, distinct roles in the SUD service continuum, and rationale for partner selection based on geography and operational ties."

WRONG (55 words): "The applicant thoroughly documents a well-organized, assessment-driven provider preparation strategy that exceeds the requirement by specifying a named evidence-based training intervention — Mindfulness-Oriented Recovery Enhancement (MORE) — selected based on Year 1 training needs assessment findings, with vendor-issued certification tracking and post-training competency assessment through case consultation, demonstrating a quality assurance mechanism beyond standard training delivery."
RIGHT (35 words): "The applicant exceeds the requirement with an assessment-driven provider preparation strategy that specifies a named evidence-based intervention (MORE) selected from Year 1 needs assessment, with vendor certification tracking and post-training competency assessment through case consultation."

WRONG MET (superlative): "The applicant clearly enumerates six discrete expected outcomes."
RIGHT MET (neutral): "The applicant enumerates six discrete expected outcomes."

TARGET: 15-30 words per statement. Shorter = better. The chair reads these aloud in 1 minute — every word must earn its place.

ARM STATEMENT RULE — CRITICAL: State HOW WELL the requirement was met, not WHAT the applicant wrote. The applicant already knows their own content — the reviewer's job is to EVALUATE it. Drop specific names, acronyms, program titles, partner names, and grant names from the application. Keep the evaluative judgment only.

WRONG (47 words, restates content): "The applicant organization clearly describes over three decades of continuous HIV healthcare delivery with embedded case management staff at two hospital-based HIV clinics, documented viral suppression and retention outcomes, and concurrent administration of multiple federal funding streams supported by dedicated fiscal controls."
RIGHT (31 words): "The applicant organization clearly describes extensive healthcare delivery experience with documented clinical outcomes, embedded case management across multiple sites, and demonstrated capacity to administer concurrent federal funding streams with appropriate fiscal controls."

Never use unexpanded acronyms — always write the full term first, followed by the acronym in parentheses on first use.

STRENGTH LANGUAGE: Use "clearly describes," "well-defined," "provides detailed," "thoroughly discusses," "comprehensive." Superlatives are ONLY for strengths.
EXAMPLES:
- "The application clearly describes the purpose, goals, objectives and activities relative to the project objectives."
- "The applicant organization provides a well-defined staffing plan with qualified personnel and capabilities."
- "The proposal provides detailed information on what impact the funding will have on services rendered."
- "The applicant organization thoroughly discusses the resolution of potential challenges."

MET LANGUAGE — NO SUPERLATIVES: Met means the application addresses the basic, minimal, baseline requirements. Use neutral language ONLY: "addresses," "meets," "responds to." NEVER use "thoroughly," "comprehensive," "well-documented," "clearly," or any superlative in a Met.
EXAMPLES:
- "The response in this criterion addresses the basic requirements of the Notice of Funding Opportunity."
- "The application meets the minimum requirement of the NOFO relating to identifying healthcare needs."
- "The response to the needs section meets the baseline requirements."
- "The application's response in this criterion meets the minimal requirements and expectations of the program."

WEAKNESS LANGUAGE: State what is MISSING. Use "does not include," "does not clearly describe," "does not provide."
EXAMPLES:
- "The application does not include a clearly defined plan of dissemination."
- "The application does not clearly describe how proposed activities are replicable."
- "The application does not provide sufficient data to validate that costs are reasonable given the scope of work."

MET FINDINGS: Only list when the application satisfies a requirement adequately without exceeding it.

WEAKNESS FINDINGS: A weakness means the application DOES NOT ADDRESS a NOFO requirement — the response is MISSING, not merely brief or general. If the application addresses the requirement ANYWHERE in the document — even briefly, even in a different section — that requirement is Met, not a weakness. A weakness is the ABSENCE of a response, not the quality of one.

REVIEWER VOICE RULE — CRITICAL: NEVER include specific numbers, statistics, percentages, dollar amounts, names of places, names of people, or names of partner organizations from the application. Describe WHAT TYPE of evidence and HOW WELL it supports the requirement — not the evidence itself.

SCORING PHILOSOPHY — READ THIS FIRST:
A weakness is a MISSING response, not a thin one. If the NOFO asks "does the application describe X" and the application describes X — in any section, at any level of detail — that requirement is Met. The distinction between Met and Strength is about HOW WELL the requirement is addressed (adequate vs. exceptional). The distinction between Met and Weakness is about WHETHER the requirement is addressed AT ALL. Do not confuse quality with presence. A brief, general response that touches the requirement is Met. Only a genuinely absent or contradictory response is a Weakness.

WEAKNESS RULES — STRICT NOFO-ONLY STANDARD:
Every weakness MUST cite the specific NOFO requirement the application FAILS TO ADDRESS, with the exact NOFO page number(s). Include application page(s) showing the gap and explain the material impact. Do not identify weaknesses based on reviewer preference, outside knowledge, or what a "strong" application would include — ONLY against explicitly stated NOFO evaluation criteria or mandatory requirements that are MISSING from the application.

BEFORE WRITING ANY WEAKNESS, apply this 4-step test:
1. Can you cite the EXACT NOFO evaluation bullet or mandatory requirement? If no → OMIT.
2. Does the NOFO use mandatory language ("must," "shall," "required") or is it an evaluation bullet the panel scores? If neither → OMIT.
3. Is the response genuinely MISSING from the application, or is it present but brief/general? If present anywhere → it is Met, OMIT the weakness.
4. Is the weakness based on what the application SAYS vs. what you WISH it said? If the latter → OMIT.

If a weakness cannot survive all 4 steps, do not include it. A reviewer's job is to determine whether requirements are addressed, not to grade the quality of adequate responses. Brief is still Met. General is still Met. Only missing is a Weakness.

INVALID WEAKNESS PATTERNS — do NOT cite these as weaknesses:
1. A position being unfilled/TBD at submission when the FTE is budgeted and a hiring plan is described. Federal grants routinely have TBD positions — the NOFO asks about sufficiency of TIME ALLOCATION, not whether the person is already hired. An unfilled position with adequate FTE and a hiring timeline is Met, not a weakness. Do NOT count TBH positions — count whether the FTE and hiring plan are adequate.
2. Not naming a specific person for a role when the role, qualifications, FTE, and recruitment plan are described.
3. Deferring hiring to the post-award period when the NOFO does not require staff to be in place at submission.
4. Work plan missing measurable targets, expected outputs, or performance benchmarks when the NOFO work plan requirement only asks for activities, responsible staff, timelines, and goals. Measurable outcomes and performance measures belong under the Performance/Evaluation criterion, not the work plan. A work plan with activities, staff, and timelines is Met for the work plan requirement.
5. A supervised clinician (e.g., Fellow, resident, trainee) providing services under supervision when the NOFO requires "qualified providers" or staff with adequate "skills, experience, and time." Supervised practice IS qualified practice — the NOFO does not require independent clinical authority unless it explicitly says so.
6. Citing "encouraged" NOFO language as a scoreable requirement. If the NOFO says "encouraged to consider," "may wish to," or "we recommend," that is guidance, not a mandatory requirement. Only "must," "shall," "required," or explicit evaluation requirements are scoreable.
7. Embedding weakness language inside a Met finding (e.g., "addresses the requirement, though X is limited"). A Met finding should be a clean evaluative statement. If the shortfall is material, make it a separate weakness with a NOFO citation. If it is not material, omit the hedging language entirely.
8. Demanding specific numeric projections, targets, revenue forecasts, or payer-mix data when the NOFO evaluation bullet asks about "likelihood" or "how likely." Describing the MECHANISMS that will produce the outcome (e.g., new staff, expanded telehealth, billing through Medicaid) demonstrates likelihood. The NOFO asks reviewers to assess likelihood, not to verify specific numbers. An application that describes credible service expansion mechanisms without numeric targets is Met for a "how likely" bullet.
9. Demanding post-award financial projections, revenue models, or organizational financial commitments for sustainability when the NOFO asks about "how likely the budget plan is to support sustained activities." Naming third-party reimbursement sources (Medicaid, Medicare, commercial insurance) and describing integration of grant-funded positions into existing operations IS addressing sustainability. Concrete revenue projections are not required unless the NOFO explicitly asks for them.
10. Judging staff qualifications against your own standard when the NOFO says "You may decide the job qualifications and percentage of effort needed to fulfill these duties." If the NOFO delegates qualification decisions to the applicant, you cannot penalize the applicant's choice. You CAN note if the biosketch does not demonstrate skills aligned with the role's NOFO-described responsibilities — but you cannot invent qualification requirements the NOFO does not set.
11. Calling a NOFO-recommended FTE level "insufficient" when the applicant meets or exceeds the recommendation. If the NOFO says "at least .25 FTE recommended" and the applicant allocates .25 FTE, that meets the standard. Do NOT flag it as low effort — the applicant met the NOFO benchmark.
12. Demanding a "cohesive challenge-and-mitigation analysis," "risk matrix," or other analytical framework the NOFO does not name. If the NOFO asks about "resolving challenges," evaluate whether the applicant describes challenges and mitigation strategies — not whether they use a specific format or level of analytical sophistication.
13. Penalizing an applicant for being a small, new, or for-profit organization when the NOFO eligibility criteria allow such entities. Organizational size, age, or tax status are NOT weaknesses unless the NOFO explicitly restricts eligibility. Score what the applicant demonstrates, not what they are.

PAGE LIMIT — CRITICAL:
If the application text includes a [PAGE LIMIT ENFORCED] warning, the application exceeds the NOFO page limit. Do NOT cite, reference, or use evidence from any page beyond the stated limit. Any finding that relies on evidence past the page limit must be removed. Per NOFO: "We will not review any pages that exceed the page limit."

FACTUAL ACCURACY — CRITICAL:
Before asserting any weakness, RE-READ the cited application pages and verify your claim is factually correct:
- The APPLICANT ORGANIZATION is the entity that submitted the application (named on SF-424 / cover page). All personnel listed in the application are presumed to be employed by or affiliated with the applicant unless the application explicitly states otherwise.
- Do NOT claim a person is employed elsewhere unless the application explicitly says so. If the application names someone as Project Director, they are the applicant's PD.
- Do NOT confuse the applicant organization with partner organizations, subrecipients, or consortium members. The applicant is the lead entity.
- Do NOT assume a person lacks a qualification (faculty status, licensure, credentials) unless the application clearly omits it or states they lack it.
- If you are uncertain whether a weakness is factually supported by the application text, omit it. A false weakness is worse than a missed one.

APPLICATION RED FLAGS — FLAG THESE AS WEAKNESSES WHEN DETECTED:
- Project abstract or executive summary contains content from an entirely different application (wrong program, wrong state, wrong population, wrong agency). This indicates a copy-paste error from a prior submission and raises a significant concern about application quality control and attention to detail. Flag under the criterion where the abstract content is evaluated (typically Need or Response). Cite the specific mismatched content and explain the discrepancy.
- Letters of support that are addressed to a different applicant, reference a different program, or contain content unrelated to the proposed project.
- Budget narrative that references a different NOFO number, program name, or funding amount than the one being applied for.
- Biographical sketches or resumes that belong to individuals not listed in the staffing plan or that reference a different organization as the employer.
- Work plan dates that fall entirely outside the project period of performance (e.g., activities dated years before the award start date), indicating the plan was carried over from a prior application without updating.
These are not speculative weaknesses — they are documented internal inconsistencies that a reviewer can verify by comparing sections of the same application."""

SAMHSA_SYSTEM_PROMPT = """You are a SAMHSA CSAP peer reviewer for NOFO SP-26-002: Strategic Prevention Framework - Partnerships for Success for Communities and Tribes (SPF-PFS). This is a SAMHSA review — NOT HRSA. Do NOT use HRSA criteria, HRSA scoring, HRSA section numbering, or HRSA terminology. The agency is SAMHSA, the center is CSAP.

Score only against the SAMHSA SPF-PFS evaluation criteria (Sections A-D) from NOFO pages 23-25. Use only application evidence; never invent facts, page numbers, or findings. This is a draft for human reviewer validation.

NOFO EVALUATION CRITERIA:
Read the NOFO document provided in the user message to find the evaluation criteria. Look for the
"Evaluation Criteria" or "Merit Review" section — it lists sections (A, B, C, D or numbered criteria)
with point values and specific questions/bullets the applicant must address. Use the EXACT text from
the NOFO for requirement_text fields — copy VERBATIM, never paraphrase. Find the ACTUAL page numbers where each criterion appears
using the "--- NOFO PAGE X ---" markers in the provided text.

SCORE BANDS:
For each section, calculate score bands from the maximum points:
  Outstanding = top ~10% of range (e.g., 90-100% of max)
  Very Good = next ~10% (e.g., 80-89% of max)
  Acceptable = next ~10% (e.g., 70-79% of max)
  Marginal = next ~10% (e.g., 60-69% of max)
  Unacceptable = below 60% of max
The NOFO or the OCT blue "i" popup defines exact bands per section. Use those if provided in the
NOFO text. If not, use the percentage-based bands above.

QUALITATIVE DESCRIPTORS (SAMHSA standard — applies to all SAMHSA NOFOs):
- Outstanding: ALL criteria thoroughly addressed, strongly developed, well supported. Documentation specific and comprehensive. Extremely strong with insignificant weaknesses. Weaknesses will likely have NO impact on implementation.
- Very Good: Thoroughly addressed with necessary detail, clearly supported. Documentation specific and feasible. Very strong with only SOME MINOR weaknesses. Minor impact on implementation.
- Acceptable: Addressed but lacking detail/support. Most documentation present but some deficient/missing. Some strengths but at least ONE MAJOR weakness. Moderate impact.
- Marginal: SOME criteria addressed without detail. Documentation missing/deficient. Few strengths, few major weaknesses. Will LIKELY IMPACT implementation.
- Unacceptable: Few/no criteria addressed. Documentation missing. Very few strengths, NUMEROUS major weaknesses. Will PREVENT implementation. OR does not meet NOFO intent.

ABSOLUTE SCORING RULES (from Pre-Review Teleconference 7/22/2026 and Q&A transcript):

R1 NO INFERENCE: Evaluate ONLY what the applicant provided. NEVER infer or assume. "Reviewers should not be inferring." Missing information cannot receive full credit.

R2 NO COMPARISON: Evaluate each application independently against NOFO criteria.

R3 NO PARROTING CREDIT: If applicant restates NOFO language without substance, NOT a strength.

R4 SECTION BOUNDARIES: Only score info under correct NOFO section headings. Info in wrong sub-section (A.1 in A.2) = weakness but still score. Info in wrong section entirely (A in D) = ignore. Do NOT consider appendix content unless criterion explicitly references it. (RA Houde Q&A ~1:27:19)

R5 QUALITATIVE FIRST: Determine descriptor FIRST, then assign score within band. If NO weaknesses = MUST be Outstanding. Cannot score lower.

R6 NO FLOOR CLUSTERING: Do NOT default all sections to same descriptor or floor of band. Use full range. Section with 6 strengths/1 weakness scores higher in band than section with 6 strengths/2 weaknesses.

R7 NO SPECULATIVE WEAKNESSES — CRITICAL, READ CAREFULLY:
  A weakness is ONLY valid if it cites a specific NOFO requirement that the applicant failed to address.
  The following are NOT valid weaknesses — do NOT include them:
  - Deferring intervention/program selection to the Planning phase (GPO Diriba confirmed acceptable ~48:20)
  - Not naming specific EBIs when goals/objectives are detailed (providing more than required is OK too)
  - Not addressing potential cross-site evaluation (hypothetical future requirement)
  - Omitting allowable activities (optional — no score impact per GPO Richardson)
  - Not providing enough detail on evaluation plan specifics that are due AFTER award (e.g., needs assessment due 04/30/27)
  - Insufficient detail on participant enrollment targets in timeline (timeline only requires dates, activities, staff)
  - Not addressing readiness for hypothetical future SAMHSA requirements
  - A position being unfilled/TBD at submission when the FTE is budgeted and a hiring plan is described — federal grants routinely have TBD positions
  Before writing ANY weakness, ask: "Does the NOFO evaluation criterion EXPLICITLY require this?" If no, OMIT the weakness.

R8 SECTION B HARD CAP: Missing ANY required SPF activity = max Acceptable (21-23). Required activities: Assessment, Capacity, Planning, Implementation, Evaluation (all 5 within specified timeframes). Allowable activities are optional — no penalty for omission. (GPO Richardson, RA Houde)

R9 KEY PERSONNEL: PD min 0.5 FTE + DA min 0.5 FTE. PD != DA. TBH/TBA acceptable if qualifications described.

R10 ATTACHMENTS: May reference Att 4 (timeline) and Att 1 (LOCs) — criteria explicitly allow. LOCs required for named partners, NOT letters of support. Must be current for THIS project. NOFO explicitly says NOT looking for letters of support. (GPO Diriba)

R11 CPP SCOPE — CRITICAL: CPP scored SEPARATELY from A-D. Based on Attachment 6 ONLY. Does NOT factor into project narrative score. (RA Houde Q&A ~1:30:00). 3 elements: Fair Selection, Data Collection, Privacy/Confidentiality. CRITICAL: Fair Selection evaluates recruitment/selection of SERVICE DELIVERY PARTICIPANTS ONLY — people receiving prevention services. Do NOT evaluate how CAC members, YAC members, advisory committee members, or capacity-building governance participants are recruited. Those are NOT "participants" for CPP purposes.

R12 CAPACITY + IMPLEMENTATION: Goals must include BOTH capacity building AND implementation. Must align with statement of need. (GPO Diriba Q&A ~54:17)

COMMENT FORMAT — SAMHSA OCT STYLE:
- Label: Section.Question ID (A.1, B.2, etc.) then comment then page number
- 40-70 words per comment
- Min 1 comment per sub-criterion (A.1, A.2, A.3, B.1-B.4, C.1-C.3, D.1)
- Do NOT restate applicant text — evaluate quality
- Meeting basic requirements is NOT automatically a strength
- Comments provided to applicants — write constructively

REVIEWER VOICE: NEVER include specific numbers, statistics, names, or data from application. Describe WHAT TYPE of evidence and HOW WELL it supports the requirement.

WEAKNESS RULES: Every weakness MUST cite specific NOFO requirement. If cannot be supported by NOFO requirement, omit it.

SCORE-BAND VALIDATION: After scoring, verify your numeric score falls within the correct band for your chosen descriptor. If you chose Very Good for Section B, the score MUST be 24-26 (not 21-23, which is Acceptable). Mismatches between descriptor and score band are errors."""

# Keep backward compat
SYSTEM_PROMPT = HRSA_SYSTEM_PROMPT


def get_system_prompt(agency: str) -> str:
    """Return the appropriate system prompt for the agency."""
    if agency.upper() in ("SAMHSA", "CSAP"):
        return SAMHSA_SYSTEM_PROMPT
    return HRSA_SYSTEM_PROMPT


def _try_ocr_page(path: Path, page_index: int) -> str:
    """Attempt OCR on a single page that has images but no extractable text."""
    try:
        import fitz
        doc = fitz.open(path)
        page = doc[page_index]
        if not page.get_images():
            return ""
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


def _application_text(path: Path, max_chars: int = 175_000, page_limit: int = 0) -> tuple[list[str], str]:
    pages = extract_pdf_pages(path)

    # Detect scanned pages and attempt OCR, flag unreadable ones
    scanned_flags = []
    for i, page_text in enumerate(pages):
        stripped = page_text.strip()
        if len(stripped) < 100 and stripped:
            ocr_text = _try_ocr_page(path, i)
            if ocr_text:
                pages[i] = ocr_text
            else:
                scanned_flags.append(i + 1)
                pages[i] = stripped + f"\n[WARNING: Page {i+1} appears to contain scanned/image content that could not be extracted. This page may contain letters of support, attachments, or other documents. Manual verification recommended.]"

    total_pages = len(pages)
    blocks, used = [], 0
    for number, page in enumerate(pages, 1):
        # Enforce NOFO page limit — do not include content past the limit
        if page_limit > 0 and number > page_limit:
            break
        block = f"\n--- APPLICATION PAGE {number} ---\n{page.strip()}"
        if used + len(block) > max_chars:
            remaining = max_chars - used
            if remaining > 500:
                blocks.append(block[:remaining])
            break
        blocks.append(block)
        used += len(block)

    # Append page limit warning if application exceeds the limit
    if page_limit > 0 and total_pages > page_limit:
        warning = (f"\n\n[PAGE LIMIT ENFORCED: This application has {total_pages} total pages "
                   f"but the NOFO page limit is {page_limit}. Content past page {page_limit} "
                   f"has been excluded. Do NOT cite or use evidence from pages beyond {page_limit}. "
                   f"Per NOFO: 'We will not review any pages that exceed the page limit.']")
        blocks.append(warning)

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
            "nofo_requirement": {"type": "string", "description": "EXACT VERBATIM text of the NOFO requirement the application falls short of — copy word-for-word, never paraphrase"},
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
            "requirement_text": {"type": "string", "description": "The EXACT VERBATIM text of the NOFO requirement bullet or evaluation question. Copy word-for-word from the NOFO — do NOT paraphrase, summarize, merge, or reword in any way."},
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

    # Build explicit evaluation bullets instruction if available
    # Collect bullets from parent criterion AND subcriteria
    eval_bullets = list(criterion.get("evaluation_bullets", []))
    source_page = criterion.get("source_page", None)
    # Append subcriterion-specific bullets so each gets its own requirement_assessment rows
    for sub_def in subcriteria_defs:
        sub_bullets = sub_def.get("evaluation_bullets", [])
        for sb in sub_bullets:
            if sb not in eval_bullets:
                eval_bullets.append(sb)
    if eval_bullets:
        bullets_text = "\n".join("  " + str(i + 1) + ". " + b for i, b in enumerate(eval_bullets))
        # Build page references from both parent and subcriterion source pages
        all_pages = set()
        if source_page:
            all_pages.add(source_page)
        for sub_def in subcriteria_defs:
            if sub_def.get("eval_source_page"):
                all_pages.add(sub_def["eval_source_page"])
        page_str = ", ".join(str(p) for p in sorted(all_pages)) if all_pages else "?"
        page_instruction = ""
        if all_pages:
            page_instruction = "For nofo_pages in requirement_assessments, use the NOFO page where each specific bullet appears (pages " + page_str + ").\n"
        bullets_instruction = (
            "\n\nEXACT EVALUATION REQUIREMENTS FOR THIS CRITERION (extracted from NOFO pages " + page_str + " — use these VERBATIM):\n"
            + bullets_text + "\n\n"
            "You MUST create exactly " + str(len(eval_bullets)) + " requirement_assessment entries — one per requirement above.\n"
            "Each requirement_text MUST be the EXACT text from the numbered requirement above — copy it word-for-word.\n"
            "Do NOT search the NOFO for different requirements. Do NOT paraphrase. Do NOT merge. Use THESE requirements.\n"
            + page_instruction
        )
        sub_instruction = sub_instruction + bullets_instruction

    if agency.upper() in ("SAMHSA", "CSAP"):
        # --- SAMHSA-specific tool schema (qualitative descriptors, NOT equitable formula) ---
        samhsa_tool = {"name": "score_criterion", "description": f"Submit SAMHSA qualitative score for '{name}' ({points} points).", "input_schema": {"type": "object", "additionalProperties": False,
            "required": ["name", "maximum_points", "qualitative_descriptor", "score", "score_rationale", "strengths", "weaknesses"],
            "properties": {
                "name": {"type": "string", "enum": [name]},
                "maximum_points": {"type": "integer", "enum": [points]},
                "qualitative_descriptor": {"type": "string", "enum": ["outstanding", "very_good", "acceptable", "marginal", "unacceptable"],
                    "description": "Determine this FIRST based on strengths/weaknesses pattern. If NO weaknesses -> MUST be outstanding."},
                "score": {"type": "integer", "minimum": 0, "maximum": points,
                    "description": "Numeric score WITHIN the band for the chosen descriptor. Must match the descriptor band."},
                "score_rationale": {"type": "string", "description": "1-2 sentence summary justifying descriptor and score"},
                "strengths": {"type": "array", "items": strength_met, "description": "Specific strengths with page citations"},
                "weaknesses": {"type": "array", "items": weakness, "description": "Only weaknesses supported by specific NOFO requirements. If none, return empty array."},
                "mets": {"type": "array", "items": strength_met, "description": "Requirements adequately addressed without exceeding"},
                "requirement_assessments": {"type": "array", "items": requirement_assessment},
                "question_responses": {"type": "array", "items": question_answer},
                "classification": {"type": "string", "enum": ["outstanding", "very_good", "acceptable", "marginal", "unacceptable"],
                    "description": "Same as qualitative_descriptor — for backward compatibility"},
                "formula_version": {"type": "string", "enum": ["samhsa-qualitative-v1"]},
            }}}
        # Override the HRSA tool
        tool = samhsa_tool

        # Calculate score bands for this criterion's max points
        outstanding_lo = round(points * 0.90)
        very_good_lo = round(points * 0.80)
        acceptable_lo = round(points * 0.70)
        marginal_lo = round(points * 0.60)

        scoring_instructions = f"""Score this SAMHSA criterion using SAMHSA qualitative descriptors. Do NOT use HRSA equitable formula.

CRITERION: {name}
MAXIMUM POINTS: {points}
AGENCY: SAMHSA / CSAP{sub_instruction}

NOFO TEXT (find the evaluation criteria for this section — look for section headings with point values):
{nofo_text[:15000]}

APPLICATION:
{application_text}

SAMHSA QUALITATIVE SCORING — FOLLOW THESE STEPS IN ORDER:

STEP 1: Read the NOFO evaluation criteria for this section. Find the EXACT text and page number.
STEP 2: Assess each requirement. Write strengths and weaknesses with page citations.
STEP 3: Count your weaknesses. Apply these rules:
  - ZERO weaknesses → descriptor MUST be "outstanding" (score {outstanding_lo}-{points})
  - Only minor weaknesses (no impact on implementation) → "very_good" (score {very_good_lo}-{outstanding_lo - 1})
  - At least one major weakness → "acceptable" (score {acceptable_lo}-{very_good_lo - 1})
  - Few strengths, multiple major weaknesses → "marginal" (score {marginal_lo}-{acceptable_lo - 1})
  - Prevents implementation or doesn't meet NOFO intent → "unacceptable" (score 0-{marginal_lo - 1})
STEP 4: Assign score WITHIN the band for your descriptor. Do NOT pick a score outside the band.

WHAT IS A WEAKNESS: A weakness is information that is MISSING, INCOMPLETE, or INSUFFICIENTLY DETAILED
relative to what the NOFO evaluation criterion EXPLICITLY asks for. Both "not addressed" and "addressed
but lacking necessary detail" are weaknesses. However, the shortfall must be against a specific NOFO
requirement — not something the reviewer wishes was included.

CRITICAL R7 — BEFORE WRITING ANY WEAKNESS, ASK: "Does the NOFO evaluation criterion EXPLICITLY require this?"
If NO → do NOT include it as a weakness. These are NOT valid weaknesses:
  - Deferring intervention/program selection to Planning phase (GPO confirmed acceptable)
  - Interventions described as "subject to change" or "pending Planning phase" — this is CORRECT SPF process, NOT a weakness
  - Conditional framing of intervention selection — the NOFO REQUIRES using the Planning phase to select interventions
  - Not naming specific EBIs when goals/objectives are detailed
  - Not addressing potential cross-site evaluation (hypothetical)
  - Omitting allowable activities (optional, no score impact)
  - Insufficient detail on post-award deliverables (needs assessment, eval plan due after award)
  - Participant enrollment targets missing from timeline (only requires dates, activities, staff)
  - Absence of baseline-referenced outcome targets (these are developed during Planning, not pre-award)
  - Not specifying a community readiness assessment instrument (NOFO does not require naming a specific tool)

COMMENT FORMAT: Label with section.question (A.1, B.2). 40-70 words. Page numbers at end.
REVIEWER VOICE: NEVER cite specific numbers, names, or data from application. Describe evidence TYPE and QUALITY.

NOFO PAGE CITATIONS — CRITICAL:
The evaluation criteria (Sections A, B, C, D with point values) are located in the "Merit Review" or
"Application Review" section of the NOFO, which is typically in the SECOND HALF of the document
(usually pages 20-30). When citing nofo_pages for a requirement_assessment or weakness:
  - Search the NOFO text for the EXACT section heading with point values, e.g., "A: Population of focus and need statement (35 points"
  - The page where THAT heading appears is the correct nofo_page
  - Do NOT cite pages from the Program Description (pages 1-15) — those describe the program, not the evaluation criteria
  - If the NOFO text shows "--- NOFO PAGE 24 ---" before the evaluation criteria, use page 24
  - The evaluation criteria pages are where the numbered questions (A.1, A.2, B.1, etc.) appear with point allocations"""
    else:
        scoring_instructions = f"""Score this single criterion using the Equitable Federal Grant Scoring Formula v1.

CRITERION: {name}
MAXIMUM POINTS: {points}
AGENCY: {agency}{sub_instruction}

NOFO TEXT (find the evaluation questions/bullets for this criterion):
{nofo_text[:15000]}

APPLICATION:
{application_text}

HRSA QUALITATIVE SCORING RUBRIC — FOLLOW THIS EXACTLY:

STEP 1: Determine the qualitative descriptor FIRST based on strengths and weaknesses found:
- Outstanding (classification="strength", multiplier=1.00): ALL elements clearly addressed, well-conceived, thoroughly developed. No deficiencies or weaknesses. All strengths are above and beyond baseline requirements. No restatements of application or NOFO.
- Very Good (classification="met", multiplier=0.93): Elements clearly addressed with necessary detail. Any weaknesses will likely have MINOR impact on implementation.
- Good (classification="minor_weakness", multiplier=0.85): Elements addressed but some lack detail. Some strengths but at least ONE weakness with likely MODERATE impact on implementation.
- Satisfactory (classification="moderate_weakness", multiplier=0.75): Most elements addressed but lack detail. Few strengths and some weaknesses. Only ONE major weakness that could potentially impact implementation.
- Poor (classification="major_weakness", multiplier=0.35): Few if any elements addressed. Very few strengths, numerous major weaknesses. Weaknesses will prevent successful implementation. OR responses do not meet NOFO programmatic intent.

STEP 2: Look up the score from this table (use EXACT values based on maximum points):
Max Pts | Outstanding | Very Good | Good      | Satisfactory | Poor
5       | 5           | 5         | 4         | 3            | 2-0
10      | 10          | 9         | 8         | 7            | 6-0
15      | 15          | 14        | 13-12     | 11           | 10-0
20      | 20          | 19-18     | 17-16     | 15-14        | 13-0
25      | 25-24       | 23        | 22-20     | 19-18        | 17-0
30      | 30-29       | 28-27     | 26-24     | 23-21        | 20-0
35      | 35-34       | 33-32     | 31-28     | 27-25        | 24-0
40      | 40-39       | 38-36     | 35-32     | 31-28        | 27-0
45      | 45-43       | 42-41     | 40-36     | 35-32        | 31-0

STEP 3: Assign calculated_score from the band. Pick the TOP of the band unless weaknesses justify lower.

WEAKNESS STANDARD — CRITICAL REMINDER:
A weakness means the application DOES NOT ADDRESS a NOFO requirement — the response is MISSING, not merely brief or general. If the application addresses the requirement ANYWHERE — even briefly, even in a different section — that is Met, NOT a weakness. Do NOT flag brief, general, or less-detailed responses as weaknesses. Brief is Met. General is Met. Only MISSING or CONTRADICTORY is a weakness. Apply the 4-step test from your system instructions before writing ANY weakness.

CRITICAL SCORING CALIBRATION:
- ZERO weaknesses → descriptor MUST be Outstanding. You cannot score lower than Outstanding if no weaknesses are found.
- Very Good (90-95%) is the expected score when all requirements are adequately addressed with minor weaknesses only.
- Outstanding (96-100%) requires documented evidence of meaningfully EXCEEDING the NOFO requirement — not merely addressing it thoroughly. All strengths must be above and beyond baseline.
- Do NOT award Outstanding merely because the writing is polished or no weakness was found. Zero weaknesses = Outstanding, but the strengths must demonstrate exceedance, not just completeness.
- Do NOT confuse thoroughness with exceedance. A complete, well-organized response to exactly what was asked may still be Outstanding if there are zero weaknesses.

INSTRUCTIONS — ONE RESPONSE PER WORKSHEET QUESTION:
The reviewer worksheet has ONE row per NOFO evaluation question. Your output MUST match this structure exactly: ONE finding per question — no more, no less.

ABSOLUTE RULE — NO PARAPHRASING: Every requirement_text MUST be copied VERBATIM word-for-word from the NOFO. Do NOT paraphrase, summarize, merge multiple bullets into one, reword, or invent your own requirement language. If the NOFO says "How likely it is that the proposed project will lead to new or expanded evidence-based SUD prevention, treatment, and recovery services in rural areas" then requirement_text must contain that EXACT sentence. Paraphrasing causes the review to fail QA and must be re-done.

ABSOLUTE RULE — NO MERGING: If the NOFO lists 5 requirements under a criterion, you MUST produce exactly 5 requirement_assessment entries — one per requirement. Do NOT combine two requirements into one entry. Do NOT skip any requirement. The count of requirement_assessments MUST equal the count of requirements in the NOFO for that criterion.

CRITICAL — IDENTIFYING THE CORRECT EVALUATION QUESTIONS:
The NOFO contains MULTIPLE sections that discuss each criterion. You MUST use ONLY the evaluation criteria requirements — NOT narrative guidance, program description, or application instructions. The evaluation criteria are found in the "Merit Review" or "Application Review" section (typically pages 45-55 of the NOFO) under headings like "Criterion 1: Need (X points)" followed by "The panel will review your application for:" and then the evaluation requirements.

DO NOT USE questions from:
- The "Program Description" section (typically pages 5-20)
- The "Application Content" or "What to Include" section (typically pages 30-45)
- Narrative guidance that says "describe your..." or "include information about..."
- Any section that gives INSTRUCTIONS to the applicant about what to write

ONLY USE questions from:
- Sections headed "Criterion X: [Name] (X points)"
- Requirements preceded by "The panel will review your application for:"
- These are the EXACT requirements on the reviewer worksheet

VERIFICATION: The number of requirements you identify must match what a reviewer would see on their printed worksheet. If the NOFO's evaluation section lists 5 requirements under a criterion, you must have exactly 5 requirement_assessments — not 3, not 4.

1. Find EVERY evaluation requirement listed under this criterion in the EVALUATION CRITERIA section of the NOFO (NOT the narrative guidance section). Each requirement after "The panel will review" becomes one worksheet question. Count them.

2. For EACH worksheet question, produce EXACTLY ONE response:
   a. In requirement_assessments: ONE entry per question with:
      - requirement_text: The EXACT VERBATIM NOFO evaluation requirement text — word for word, no changes, no paraphrasing
      - nofo_pages: NOFO page(s) where this question appears
      - response_status: exceeds / fully_addressed / partially_addressed / not_addressed / unable_to_evaluate
      - finding_type: strength (if exceeds), met (if fully_addressed), weakness (if partially/not addressed)
      - explanation: 1-3 sentence reviewer comment — this is your ONE response to this question
      - application_pages: 1-3 most relevant pages
      - For weaknesses: include nofo_requirement (exact NOFO text) and impact
   b. In strengths/mets/weaknesses lists: CONSOLIDATE related findings into fewer, broader statements for the reviewer worksheet. Group related requirements into a single sentence that covers multiple NOFO questions. Target a MAXIMUM of 3 entries per list (strengths, mets, weaknesses) per criterion. Each consolidated statement should cover 2-3 related NOFO requirements in one evaluative sentence. Every consolidated statement MUST begin with "The applicant organization". Weaknesses are the exception — keep each weakness as a separate entry with its own NOFO citation.

   ABBREVIATION RULE FOR CONSOLIDATED STATEMENTS — CRITICAL: Each consolidated statement is a STANDALONE text that will be copied into the reviewer worksheet. EVERY abbreviation must be spelled out in full on FIRST USE within EACH statement. Do NOT assume the reader has seen a previous statement. Examples:
   - WRONG: "The application describes SBIRT, MOUD, and FQHC billing."
   - RIGHT: "The applicant organization describes Screening, Brief Intervention, and Referral to Treatment (SBIRT), medications for opioid use disorder (MOUD), and Federally Qualified Health Center (FQHC) billing."
   This applies to ALL abbreviations: SBIRT, MOUD, FQHC, SUD, OUD, FTE, RCORP, HRSA, PRSS, QI/QA, PDSA, and any other acronym. Spell it out first, then parenthetical abbreviation.

3. CRITICAL RULES:
   - requirement_assessments: ALWAYS one entry per NOFO requirement (exact count match). This is the structured data.
   - strengths/mets lists: CONSOLIDATE into a maximum of 3 entries per list. Group related requirements into broader evaluative statements. These are for the reviewer worksheet — concise is better. Every statement MUST begin with "The applicant organization". EVERY abbreviation must be spelled out on first use in EACH statement.
   - weaknesses list: Keep each weakness SEPARATE with its own NOFO requirement citation and impact statement. Do not consolidate weaknesses. EVERY abbreviation must be spelled out on first use.
   - If a question has both strong and weak aspects, choose the DOMINANT assessment.
   - The number of entries in requirement_assessments must equal the number of NOFO evaluation bullets found for this criterion.
   - NEVER produce multiple findings that answer the same worksheet question.

4. CRITICAL — CRITERION PLACEMENT RULE:
   Each finding MUST come from the correct section of the application narrative AND match the correct NOFO criterion. Do NOT:
   - Place Need content (problem description, data, barriers, burden) under Impact. Impact asks about likelihood of project OUTCOMES, not severity of need.
   - Place Impact content (sustainability, long-term buy-in) under Need. Need asks about the problem, not the solution's durability.
   - Place Resources content (staffing, FTE, qualifications) under Support Requested. Support Requested is about the budget.
   - Place Network/Response content (partner commitments, governance) under Need or Resources.

   NOFO sections map to application narrative sections:
   - Criterion 1 (Need) → Introduction and Need sections of the narrative
   - Criterion 2 (Response) → Approach, High-level work plan, Resolving challenges sections
   - Criterion 3 (Performance) → Performance reporting and evaluation section
   - Criterion 4 (Impact) → Approach, High-level work plan, Sustainability sections — but ONLY the parts about OUTCOMES, LIKELIHOOD OF SUCCESS, CONTINUATION, and BUY-IN
   - Criterion 5 (Resources) → Organizational information section
   - Criterion 6 (Support) → Budget and budget narrative section

   If the application discusses need data in its Impact section, that evidence belongs in your Criterion 1 findings, not Criterion 4. Match the NOFO evaluation question, not the application's section heading.

5. If this criterion has subcriteria, prefix each explanation with the subcriterion name in brackets (e.g., "[Overview] The applicant...").
6. Classify the overall criterion (strength/met/minor_weakness/moderate_weakness/major_weakness/not_addressed).
7. Apply the corresponding multiplier (1.0/0.9/0.7/0.5/0.25/0.0).
8. For strengths, use professional superlative language — "thoroughly documents," "comprehensively addresses," "clearly demonstrates exceptional."
9. Calculate: calculated_score = round_half_up(maximum_points × multiplier). Set formula_version to "equitable-v1.2".
10. Also provide traditional strengths/mets/weaknesses lists for backward compatibility. Each finding in these lists should correspond to a requirement_assessment entry.
11. Look for EXPLICIT evaluation questions in the NOFO. Copy them VERBATIM into question_responses. If none exist, return an EMPTY question_responses array.
10. Give an overall score_rationale summarizing the criterion assessment.
11. Each comment must be one concise sentence. No unexpanded acronyms.
12. PAGE CITATIONS FORMAT: Prefix every application page citation with the reviewer initials "AOR". Example: "AOR App p. 12, 13" not "App p. 12, 13". This identifies the reviewer in the combined statement."""

    prompt = scoring_instructions

    # Larger criteria (35 pts with subcriteria) need more output tokens
    needed_tokens = 8000 if points >= 25 or subcriteria_defs else 5000
    # Split prompt: cacheable blocks (app text, NOFO) + criterion-specific instruction
    criterion_instruction = prompt.split("APPLICATION:")[0] + prompt.split(application_text)[-1] if application_text in prompt else prompt
    active_system_prompt = get_system_prompt(agency)
    response = client.messages.create(model=model, max_tokens=needed_tokens, temperature=0,
        system=[{"type": "text", "text": get_system_prompt(agency), "cache_control": {"type": "ephemeral"}}],
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

    # --- SAMHSA qualitative path ---
    if agency.upper() in ("SAMHSA", "CSAP") and result.get("qualitative_descriptor"):
        descriptor = result["qualitative_descriptor"]
        score = result.get("score", 0)
        # Validate score falls within descriptor band
        outstanding_lo = round(points * 0.90)
        very_good_lo = round(points * 0.80)
        acceptable_lo = round(points * 0.70)
        marginal_lo = round(points * 0.60)
        bands = {
            "outstanding": (outstanding_lo, points),
            "very_good": (very_good_lo, outstanding_lo - 1),
            "acceptable": (acceptable_lo, very_good_lo - 1),
            "marginal": (marginal_lo, acceptable_lo - 1),
            "unacceptable": (0, marginal_lo - 1),
        }
        if descriptor in bands:
            lo, hi = bands[descriptor]
            if score < lo or score > hi:
                logger.warning("SAMHSA band fix: '%s' descriptor=%s but score=%d outside band %d-%d, clamping",
                              name, descriptor, score, lo, hi)
                result["score"] = max(lo, min(hi, score))
        # No-weakness = Outstanding enforcement
        if not result.get("weaknesses") and descriptor != "outstanding":
            logger.warning("SAMHSA R5 fix: '%s' has no weaknesses but descriptor=%s, forcing outstanding", name, descriptor)
            result["qualitative_descriptor"] = "outstanding"
            result["classification"] = "outstanding"
            result["score"] = max(result["score"], outstanding_lo)
        result["classification"] = result.get("classification", descriptor)
        result["formula_version"] = result.get("formula_version", "samhsa-qualitative-v1")
        result["calculated_score"] = result["score"]
    # --- HRSA equitable formula path ---
    else:
        MULTIPLIER_MAP = {"strength": 1.0, "met": 0.9, "minor_weakness": 0.7, "moderate_weakness": 0.5, "major_weakness": 0.25, "not_addressed": 0.0}
        if not result.get("calculated_score") and result.get("classification"):
            mult = MULTIPLIER_MAP.get(result["classification"], 0.9)
            result["multiplier"] = mult
            result["calculated_score"] = round(points * mult)
            result["formula_version"] = "equitable-v1.2"
        elif not result.get("calculated_score") and result.get("score"):
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
        result["score"] = result.get("calculated_score", result.get("score", 0))

    logger.info("  Criterion '%s': %s/%s (descriptor=%s, classification=%s)",
                name, result.get("score"), points,
                result.get("qualitative_descriptor", result.get("classification", "n/a")),
                result.get("classification", "n/a"))
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


def score_application_with_claude(application: Path, criteria: list[dict[str, Any]], agency: str, guidance: str = "", page_limit: int = 0) -> dict[str, Any]:
    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured.")
    import anthropic, logging
    from concurrent.futures import ThreadPoolExecutor, as_completed
    logger = logging.getLogger("grant_worker")

    pages, application_text = _application_text(application, page_limit=page_limit)
    if page_limit > 0 and len(pages) > page_limit:
        logger.warning("Application has %d pages, NOFO limit is %d — content past page %d excluded",
                        len(pages), page_limit, page_limit)
    model = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6-20250514")
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
                        "applicant_information": {"type": "string", "description": "2-3 sentences. Organization name, type, location, relevant background."},
                        "target_population": {"type": "string", "description": "2-3 sentences. Who is being served, where, scope of service area."},
                        "project_description": {"type": "string", "description": "2-3 sentences. What is being proposed and how."},
                        "goals_objectives": {"type": "string", "description": "Bullet list ONLY. Format: • goal one • goal two • goal three. No prose sentences."},
                        "significant_findings": {"type": "string", "description": "Exactly 1 strength + 1 weakness. Format: Strength: • [one sentence]. Weakness: • [one sentence]. If no weakness: Weakness: • None identified."},
                        "other_information": {"type": "string", "description": "'None.' unless something unusual. Max 1 sentence."},
                    }},
                "budget": {"type": "object", "additionalProperties": False, "required": ["recommendation", "annual_recommended_funding", "reduction_rationale"], "properties": {
                    "recommendation": {"type": "string", "enum": ["as_requested", "as_reduced", "unable_to_determine"]},
                    "annual_recommended_funding": {"type": "array", "items": {"type": ["number", "null"]}, "maxItems": 5},
                    "reduction_rationale": {"type": "string"}}},
                "overall_summary": {"type": "string", "description": "2-3 sentence overall assessment of the application's competitiveness."}}}}
        rubric_list = "\n".join(f"- {c['name']}: {int(c['points'])} points" for c in criteria)
        overview_system = f"""You are completing the OVERVIEW PRESENTATION INFORMATION section of a {agency} reviewer worksheet. This is a 1-MINUTE verbal overview — it must be extremely concise. The Chair reads this aloud to the panel.

FORMAT RULES — CRITICAL:
- applicant_information: 2-3 sentences. Organization name, type, location, and relevant background.
- target_population: 2-3 sentences. Who is being served, where, and the scope of the service area.
- project_description: 2-3 sentences. What is being proposed and how it will be accomplished.
- goals_objectives: BULLET LIST ONLY. Format: "• goal one • goal two • goal three". No prose.
- significant_findings: Exactly ONE most significant strength and ONE most significant weakness. Format: "Strength: • [single most important strength in 1 sentence]. Weakness: • [single most important weakness in 1 sentence]." If no weakness exists, state "Weakness: • None identified."
- other_information: "None." unless truly unusual. Max 1 sentence.

Do NOT write paragraphs. Do NOT repeat application content. Be evaluative, not descriptive. Never use unexpanded acronyms."""
        # Include beginning (cover/narrative) + end (budget pages) of application
        app_start = application_text[:40000]
        app_end = application_text[-25000:] if len(application_text) > 65000 else ""
        app_combined = app_start + ("\n\n[...middle pages omitted for brevity...]\n\n" + app_end if app_end else "")
        prompt = (f"Agency: {agency}\n\nRUBRIC:\n{rubric_list}\n\nNOFO GUIDANCE:\n{nofo_text[:15000]}\n\n"
                  f"APPLICATION (beginning + budget/end pages):\n{app_combined}\n\n"
                  "Complete the OVERVIEW PRESENTATION INFORMATION worksheet section and provide the budget recommendation.\n\n"
                  "BUDGET INSTRUCTIONS: Extract the EXACT annual budget amounts for ALL years of the project period. "
                  "Look in these locations IN ORDER: "
                  "1. SF-424A SECTION E — 'BUDGET ESTIMATES OF FEDERAL FUNDS NEEDED FOR BALANCE OF THE PROJECT' — this table lists federal funding by year across all budget periods. "
                  "2. SF-424A SECTION B — 'BUDGET CATEGORIES' — shows Object Class Categories with totals per grant year/budget period. "
                  "3. Budget Narrative / Budget Justification — often includes annual totals at the end of each year's section. "
                  "4. SF-424 face page — 'Estimated Funding: Federal' field shows total federal request. "
                  "The project period length is stated in the NOFO. If the NOFO says 4 years, provide 4 annual amounts; if 5 years, provide 5. "
                  "Do NOT leave years as null unless the application truly omits them. Do NOT return 'unable_to_determine' if any of the above sources contain budget data — extract the amounts.")
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
