"""
Grant Application Reviewer — Railway Worker
Production FastAPI backend. All persistence via Supabase (DB + Storage).
No SQLite. No localhost file paths persisted between requests.
"""
from __future__ import annotations

import io
import json
import logging
import os
import sys
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# ---------------------------------------------------------------------------
# Scoring module path — added to sys.path but NOT imported at startup
# ---------------------------------------------------------------------------
sys.path.insert(0, str(Path(__file__).parent / "scoring"))

# Heavy imports (PyMuPDF, anthropic, python-docx) are loaded lazily in job handlers
# to keep startup fast and prevent container crash if a native dep is missing.

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ---------------------------------------------------------------------------
# Lazy imports for heavy dependencies (PyMuPDF, anthropic, python-docx)
# ---------------------------------------------------------------------------
def _lazy_scoring():
    from scoring.safe_review import extract_nofo_criteria, safe_extract_application_zip
    from scoring.anthropic_review import score_application_with_claude
    from scoring.worksheet_writer import populate_reviewer_worksheet
    return extract_nofo_criteria, safe_extract_application_zip, score_application_with_claude, populate_reviewer_worksheet

# Supabase client — only imported when needed
_supabase_client: Any = None

def get_supabase():
    global _supabase_client
    if _supabase_client is None:
        from supabase import create_client
        url = os.environ.get("SUPABASE_URL", "")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        _supabase_client = create_client(url, key)
    return _supabase_client

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
logger = logging.getLogger("grant_worker")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ALLOWED_ORIGINS_RAW = os.getenv("ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS: list[str] = [o.strip() for o in ALLOWED_ORIGINS_RAW.split(",") if o.strip()] or ["*"]

# Supabase Storage buckets
BUCKET_NOFO = "nofo-files"
BUCKET_APPS = "grant-applications"
BUCKET_WORKSHEETS = "worksheet-templates"
BUCKET_COMPLETED = "completed-worksheets"

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="Grant Application Reviewer Worker", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Supabase client defined above as lazy singleton

# ---------------------------------------------------------------------------
# Storage helpers
# ---------------------------------------------------------------------------

def _upload_bytes(sb: Client, bucket: str, path: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    """Upload raw bytes to Supabase Storage; return the storage path."""
    sb.storage.from_(bucket).upload(
        path=path,
        file=data,
        file_options={"content-type": content_type, "upsert": "true"},
    )
    return path


def _download_bytes(sb: Client, bucket: str, path: str) -> bytes:
    """Download a file from Supabase Storage as bytes."""
    return sb.storage.from_(bucket).download(path)


def _signed_url(sb: Client, bucket: str, path: str, expires_in: int = 3600) -> str:
    result = sb.storage.from_(bucket).create_signed_url(path, expires_in)
    return result["signedURL"]


def _delete_storage_prefix(sb: Client, bucket: str, prefix: str) -> None:
    """Delete all objects whose path starts with prefix."""
    try:
        items = sb.storage.from_(bucket).list(prefix)
        paths = [f"{prefix}/{item['name']}" for item in (items or []) if item.get("name")]
        if paths:
            sb.storage.from_(bucket).remove(paths)
    except Exception as exc:
        logger.warning("Storage cleanup error for %s/%s: %s", bucket, prefix, exc)


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def _insert(sb: Client, table: str, row: dict[str, Any]) -> dict[str, Any]:
    result = sb.table(table).insert(row).execute()
    return result.data[0] if result.data else row


def _update(sb: Client, table: str, match: dict[str, Any], values: dict[str, Any]) -> None:
    q = sb.table(table).update(values)
    for col, val in match.items():
        q = q.eq(col, val)
    q.execute()


def _select(sb: Client, table: str, match: dict[str, Any]) -> list[dict[str, Any]]:
    q = sb.table(table).select("*")
    for col, val in match.items():
        q = q.eq(col, val)
    return q.execute().data or []


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}

@app.get("/ready")
def ready():
    checks = {
        "supabase_configured": bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY),
        "anthropic_configured": bool(os.environ.get("ANTHROPIC_API_KEY")),
        "scoring_mode": "claude",
    }
    ready = all([checks["supabase_configured"], checks["anthropic_configured"]])
    return {"ready": ready, **checks}


# ---------------------------------------------------------------------------
# POST /safe-reviews/extract-rubric
# ---------------------------------------------------------------------------

@app.post("/safe-reviews/extract-rubric")
async def extract_rubric(
    nofo: UploadFile = File(...),
    agency: str = Form("HRSA"),
):
    """Accept a NOFO file upload and return extracted criterion rubric JSON."""
    nofo_bytes = await nofo.read()
    suffix = Path(nofo.filename or "nofo.pdf").suffix.lower() or ".pdf"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(nofo_bytes)
        tmp_path = Path(tmp.name)

    try:
        extract_nofo_criteria, *_ = _lazy_scoring()
        rubric = extract_nofo_criteria(tmp_path)
    except Exception as exc:
        logger.exception("extract_nofo_criteria failed")
        raise HTTPException(status_code=422, detail=str(exc))
    finally:
        tmp_path.unlink(missing_ok=True)

    return JSONResponse(content={"success": True, "rubric": rubric})


# ---------------------------------------------------------------------------
# POST /safe-reviews/enqueue — lightweight, accepts Supabase Storage paths only
# ---------------------------------------------------------------------------

@app.post("/safe-reviews/enqueue", status_code=202)
async def enqueue_review(
    background_tasks: BackgroundTasks,
    application_storage_paths: str = Form(...),
    nofo_storage_path: str = Form(...),
    rubric_storage_path: Optional[str] = Form(None),
    worksheet_storage_path: Optional[str] = Form(None),
    approved_criteria: str = Form(...),
    agency: str = Form("HRSA"),
    user_id: str = Form(...),
    review_id: str = Form(...),
):
    """Lightweight enqueue: files are already in Supabase Storage. Creates jobs and returns immediately."""
    sb = get_supabase()
    try:
        criteria = json.loads(approved_criteria)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid approved_criteria JSON: {exc}")
    try:
        app_paths = json.loads(application_storage_paths)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid application_storage_paths JSON: {exc}")

    prefix = f"{user_id}/{review_id}"
    job_records = []
    for idx, app_path in enumerate(app_paths):
        application_id = str(uuid.uuid4())
        job_id = str(uuid.uuid4())
        filename = app_path.rsplit("/", 1)[-1] if "/" in app_path else app_path
        _insert(sb, "applications", {
            "id": application_id, "review_id": review_id, "user_id": user_id,
            "filename": filename, "storage_path": app_path, "status": "queued",
            "agency": agency, "criteria": json.dumps(criteria),
            "nofo_storage_path": nofo_storage_path,
            "worksheet_storage_path": worksheet_storage_path or "",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        _insert(sb, "processing_jobs", {
            "id": job_id, "application_id": application_id, "review_id": review_id,
            "user_id": user_id, "status": "queued", "agency": agency,
            "criteria": json.dumps(criteria),
            "nofo_storage_path": nofo_storage_path,
            "worksheet_storage_path": worksheet_storage_path or "",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        job_records.append({"job_id": job_id, "application_id": application_id,
                           "filename": filename, "status": "queued"})
        background_tasks.add_task(
            _process_job, job_id, app_path, criteria, agency, review_id,
            nofo_storage_path, worksheet_storage_path or "",
        )
    return JSONResponse(status_code=202, content={
        "review_id": review_id, "jobs": job_records,
        "status": "queued", "message": f"{len(job_records)} application(s) queued for processing.",
    })


# ---------------------------------------------------------------------------
# POST /safe-reviews/run — legacy endpoint, accepts file uploads
# ---------------------------------------------------------------------------

@app.post("/safe-reviews/run")
async def run_review(
    background_tasks: BackgroundTasks,
    applications: list[UploadFile] = File(...),
    nofo: UploadFile = File(...),
    rubric: Optional[UploadFile] = File(None),
    worksheet: Optional[UploadFile] = File(None),
    approved_criteria: str = Form(...),          # JSON string
    agency: str = Form("HRSA"),
    user_id: str = Form(...),
    review_id: str = Form(...),
):
    """
    Accept uploaded files, store them to Supabase Storage, create DB records,
    and enqueue per-application scoring as background tasks.
    Returns immediately with job IDs.
    """
    sb = get_supabase()

    # -- Parse approved_criteria --
    try:
        criteria: list[dict[str, Any]] = json.loads(approved_criteria)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail=f"approved_criteria is not valid JSON: {exc}")

    prefix = f"{user_id}/{review_id}"

    # -- Upload NOFO --
    nofo_bytes = await nofo.read()
    nofo_filename = nofo.filename or "nofo.pdf"
    nofo_storage_path = f"{prefix}/nofo/{nofo_filename}"
    _upload_bytes(sb, BUCKET_NOFO, nofo_storage_path, nofo_bytes, "application/pdf")

    # -- Upload worksheet template (optional) --
    worksheet_storage_path: Optional[str] = None
    if worksheet and worksheet.filename:
        ws_bytes = await worksheet.read()
        ws_filename = worksheet.filename
        worksheet_storage_path = f"{prefix}/worksheet/{ws_filename}"
        _upload_bytes(sb, BUCKET_WORKSHEETS, worksheet_storage_path, ws_bytes,
                      "application/vnd.openxmlformats-officedocument.wordprocessingml.document")

    # -- Process each application (may include ZIPs) --
    job_records: list[dict[str, Any]] = []

    for upload in applications:
        app_bytes = await upload.read()
        original_name = upload.filename or "application.pdf"
        suffix = Path(original_name).suffix.lower()

        if suffix == ".zip":
            # Extract ZIP in a temp dir, then handle each PDF
            with tempfile.TemporaryDirectory() as tmpdir:
                zip_path = Path(tmpdir) / original_name
                zip_path.write_bytes(app_bytes)
                extract_dir = Path(tmpdir) / "extracted"
                try:
                    _, safe_extract_application_zip, *_ = _lazy_scoring()
                    pdf_paths = safe_extract_application_zip(zip_path, extract_dir)
                except ValueError as exc:
                    raise HTTPException(status_code=422, detail=f"ZIP error in {original_name}: {exc}")

                for pdf_path in pdf_paths:
                    job_rec = _create_application_job(
                        sb, pdf_path.read_bytes(), pdf_path.name,
                        prefix, criteria, agency, review_id, user_id,
                        nofo_storage_path, worksheet_storage_path,
                    )
                    job_records.append(job_rec)
                    background_tasks.add_task(
                        _process_job,
                        job_rec["job_id"],
                        job_rec["application_storage_path"],
                        criteria, agency, review_id,
                        nofo_storage_path, worksheet_storage_path,
                    )
        else:
            # Single PDF
            job_rec = _create_application_job(
                sb, app_bytes, original_name,
                prefix, criteria, agency, review_id, user_id,
                nofo_storage_path, worksheet_storage_path,
            )
            job_records.append(job_rec)
            background_tasks.add_task(
                _process_job,
                job_rec["job_id"],
                job_rec["application_storage_path"],
                criteria, agency, review_id,
                nofo_storage_path, worksheet_storage_path,
            )

    return JSONResponse(content={
        "review_id": review_id,
        "jobs": job_records,
        "status": "queued",
        "message": f"{len(job_records)} application(s) queued for processing.",
    })


def _create_application_job(
    sb: Client,
    pdf_bytes: bytes,
    filename: str,
    prefix: str,
    criteria: list[dict[str, Any]],
    agency: str,
    review_id: str,
    user_id: str,
    nofo_storage_path: str,
    worksheet_storage_path: Optional[str],
) -> dict[str, Any]:
    """Upload application PDF, insert application + processing_job rows, return job metadata."""
    application_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    app_storage_path = f"{prefix}/applications/{application_id}_{filename}"

    _upload_bytes(sb, BUCKET_APPS, app_storage_path, pdf_bytes, "application/pdf")

    # Insert application record
    _insert(sb, "applications", {
        "id": application_id,
        "review_id": review_id,
        "user_id": user_id,
        "filename": filename,
        "storage_path": app_storage_path,
        "status": "queued",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    # Insert processing_job record
    _insert(sb, "processing_jobs", {
        "id": job_id,
        "review_id": review_id,
        "application_id": application_id,
        "user_id": user_id,
        "status": "queued",
        "agency": agency,
        "criteria": json.dumps(criteria),
        "nofo_storage_path": nofo_storage_path,
        "worksheet_storage_path": worksheet_storage_path,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    return {
        "job_id": job_id,
        "application_id": application_id,
        "filename": filename,
        "application_storage_path": app_storage_path,
        "status": "queued",
    }


# ---------------------------------------------------------------------------
# Background: _process_job
# ---------------------------------------------------------------------------

async def _process_job(
    job_id: str,
    application_storage_path: str,
    criteria: list[dict[str, Any]],
    agency: str,
    review_id: str,
    nofo_storage_path: str,
    worksheet_storage_path: Optional[str],
) -> None:
    """
    Background task: download application from Storage, score with Claude,
    write results to DB, optionally populate worksheet, mark job complete.
    """
    sb = get_supabase()
    logger.info("Processing job %s", job_id)

    _update(sb, "processing_jobs", {"id": job_id}, {
        "status": "processing",
        "started_at": datetime.now(timezone.utc).isoformat(),
    })

    try:
        # -- Resolve application_id and storage path from DB --
        job_rows = _select(sb, "processing_jobs", {"id": job_id})
        if not job_rows:
            raise RuntimeError(f"Job {job_id} not found in DB")
        job_row = job_rows[0]
        application_id: str = job_row["application_id"]

        # Get actual storage path from applications table (application_storage_path arg may be UUID from retry)
        app_rows = _select(sb, "applications", {"id": application_id})
        actual_app_path = app_rows[0]["storage_path"] if app_rows else application_storage_path
        if not actual_app_path or len(actual_app_path) < 10:
            raise RuntimeError(f"No valid storage path for application {application_id}")

        # Also resolve nofo/worksheet paths from the application record if not passed
        if not nofo_storage_path and app_rows:
            nofo_storage_path = app_rows[0].get("nofo_storage_path", "")
        if not worksheet_storage_path and app_rows:
            worksheet_storage_path = app_rows[0].get("worksheet_storage_path", "")

        # -- Download application PDF --
        app_bytes = _download_bytes(sb, BUCKET_APPS, actual_app_path)

        # -- Download NOFO for guidance text --
        guidance_text = ""
        try:
            nofo_bytes = _download_bytes(sb, BUCKET_NOFO, nofo_storage_path)
            try:
                from scoring.document_processor import DocumentProcessor
                proc = DocumentProcessor()
            except ImportError:
                proc = None
            if proc is None:
                pass  # skip guidance extraction
            else:
                proc = DocumentProcessor()
            with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as ntmp:
                ntmp.write(nofo_bytes)
                ntmp_path = Path(ntmp.name)
            try:
                doc_result = proc.process_document(str(ntmp_path))
                guidance_text = doc_result.get("text_content", "")[:30000]
            finally:
                ntmp_path.unlink(missing_ok=True)
        except Exception as exc:
            logger.warning("Could not extract NOFO guidance text: %s", exc)

        # -- Score with Claude --
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as atmp:
            atmp.write(app_bytes)
            app_tmp_path = Path(atmp.name)

        try:
            _, _, score_application_with_claude, _ = _lazy_scoring()
            review_result = score_application_with_claude(
                application=app_tmp_path,
                criteria=criteria,
                agency=agency,
                guidance=guidance_text,
            )
        finally:
            app_tmp_path.unlink(missing_ok=True)

        # -- Write criterion_scores rows --
        for crit in review_result.get("criteria", []):
            _insert(sb, "criterion_scores", {
                "id": str(uuid.uuid4()),
                "review_id": review_id,
                "application_id": application_id,
                "job_id": job_id,
                "criterion_name": crit["name"],
                "score": crit.get("score"),
                "maximum_points": crit.get("maximum_points"),
                "score_rationale": crit.get("score_rationale", ""),
                "strengths": json.dumps(crit.get("strengths", [])),
                "mets": json.dumps(crit.get("mets", [])),
                "weaknesses": json.dumps(crit.get("weaknesses", [])),
                "subcriteria": json.dumps(crit.get("subcriteria", [])),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

        # -- Write review_findings rows (flattened per finding) --
        for crit in review_result.get("criteria", []):
            for finding_type in ("strengths", "mets", "weaknesses"):
                for finding in crit.get(finding_type, []):
                    _insert(sb, "review_findings", {
                        "id": str(uuid.uuid4()),
                        "review_id": review_id,
                        "application_id": application_id,
                        "job_id": job_id,
                        "criterion_name": crit["name"],
                        "finding_type": finding_type,
                        "comment": finding.get("comment", ""),
                        "pages": json.dumps(finding.get("pages", [])),
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    })

        # -- Populate reviewer worksheet (if template provided) --
        worksheet_doc_id: Optional[str] = None
        if worksheet_storage_path:
            try:
                ws_bytes = _download_bytes(sb, BUCKET_WORKSHEETS, worksheet_storage_path)
                ws_suffix = Path(worksheet_storage_path).suffix or ".docx"

                with tempfile.NamedTemporaryFile(suffix=ws_suffix, delete=False) as wstmp:
                    wstmp.write(ws_bytes)
                    ws_tmp_path = Path(wstmp.name)

                out_filename = f"{application_id}_completed{ws_suffix}"
                with tempfile.NamedTemporaryFile(suffix=ws_suffix, delete=False) as outtmp:
                    out_tmp_path = Path(outtmp.name)

                try:
                    _, _, _, populate_reviewer_worksheet = _lazy_scoring()
                    populated_path = populate_reviewer_worksheet(
                        template=ws_tmp_path,
                        output=out_tmp_path,
                        review=review_result,
                    )
                    completed_bytes = populated_path.read_bytes()
                    completed_storage_path = f"{application_id}/{out_filename}"
                    _upload_bytes(
                        sb, BUCKET_COMPLETED, completed_storage_path, completed_bytes,
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    )

                    # Insert generated_documents record
                    worksheet_doc_id = str(uuid.uuid4())
                    _insert(sb, "generated_documents", {
                        "id": worksheet_doc_id,
                        "review_id": review_id,
                        "application_id": application_id,
                        "job_id": job_id,
                        "document_type": "completed_worksheet",
                        "storage_bucket": BUCKET_COMPLETED,
                        "storage_path": completed_storage_path,
                        "filename": out_filename,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    })
                finally:
                    ws_tmp_path.unlink(missing_ok=True)
                    out_tmp_path.unlink(missing_ok=True)

            except Exception as ws_exc:
                logger.warning("Worksheet population failed for job %s: %s", job_id, ws_exc)

        # -- Update application status --
        _update(sb, "applications", {"id": application_id}, {
            "status": "completed",
            "final_score": review_result.get("final_score"),
            "maximum_score": review_result.get("maximum_score"),
            "review_status": review_result.get("review_status"),
            "applicant_name": review_result.get("applicant_name"),
            "application_number": review_result.get("application_number"),
            "overall_summary": review_result.get("overall_summary"),
            "full_result": json.dumps(review_result),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })

        # -- Mark job complete --
        _update(sb, "processing_jobs", {"id": job_id}, {
            "status": "completed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "worksheet_document_id": worksheet_doc_id,
        })

        logger.info("Job %s completed — score %s/%s", job_id,
                    review_result.get("final_score"), review_result.get("maximum_score"))

    except Exception as exc:
        logger.exception("Job %s failed: %s", job_id, exc)
        _update(sb, "processing_jobs", {"id": job_id}, {
            "status": "failed",
            "error_message": str(exc)[:2000],
            "completed_at": datetime.now(timezone.utc).isoformat(),
        })
        # Also mark the application as failed
        try:
            job_rows = _select(sb, "processing_jobs", {"id": job_id})
            if job_rows:
                _update(sb, "applications", {"id": job_rows[0]["application_id"]}, {
                    "status": "failed",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                })
        except Exception:
            pass


# ---------------------------------------------------------------------------
# POST /jobs/{job_id}/process  (internal trigger — idempotent re-run)
# ---------------------------------------------------------------------------

@app.post("/jobs/{job_id}/process")
async def trigger_process_job(job_id: str, background_tasks: BackgroundTasks):
    """
    Internal endpoint to (re-)trigger processing of a queued or failed job.
    Looks up job metadata from DB and enqueues the background task.
    """
    sb = get_supabase()
    job_rows = _select(sb, "processing_jobs", {"id": job_id})
    if not job_rows:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    job_row = job_rows[0]

    if job_row["status"] == "processing":
        return {"message": "Job is already processing", "job_id": job_id}

    criteria = json.loads(job_row.get("criteria") or "[]")

    # Look up actual storage path from applications table
    app_rows = _select(sb, "applications", {"id": job_row["application_id"]})
    app_storage_path = app_rows[0]["storage_path"] if app_rows else ""

    background_tasks.add_task(
        _process_job,
        job_id,
        app_storage_path,
        criteria,
        job_row.get("agency", "HRSA"),
        job_row["review_id"],
        job_row.get("nofo_storage_path", ""),
        job_row.get("worksheet_storage_path", ""),
    )
    return {"message": "Job re-queued", "job_id": job_id}


# ---------------------------------------------------------------------------
# GET /jobs/{job_id}/status
# ---------------------------------------------------------------------------

@app.get("/jobs/{job_id}/status")
def get_job_status(job_id: str):
    sb = get_supabase()
    rows = _select(sb, "processing_jobs", {"id": job_id})
    if not rows:
        raise HTTPException(status_code=404, detail="Job not found")
    row = rows[0]
    return {
        "job_id": job_id,
        "application_id": row.get("application_id"),
        "review_id": row.get("review_id"),
        "status": row.get("status"),
        "error_message": row.get("error_message"),
        "created_at": row.get("created_at"),
        "started_at": row.get("started_at"),
        "completed_at": row.get("completed_at"),
    }


# ---------------------------------------------------------------------------
# GET /reviews/{review_id}/results
# ---------------------------------------------------------------------------

@app.get("/reviews/{review_id}/results")
def get_review_results(review_id: str):
    """Return full scored results for all applications in a review."""
    sb = get_supabase()

    applications = _select(sb, "applications", {"review_id": review_id})
    if not applications:
        raise HTTPException(status_code=404, detail="Review not found or has no applications")

    results = []
    for app_row in applications:
        app_id = app_row["id"]
        scores = _select(sb, "criterion_scores", {"application_id": app_id})
        findings = _select(sb, "review_findings", {"application_id": app_id})
        docs = _select(sb, "generated_documents", {"application_id": app_id})

        criteria_out = []
        for s in scores:
            criteria_out.append({
                "criterion_name": s["criterion_name"],
                "score": s["score"],
                "maximum_points": s["maximum_points"],
                "score_rationale": s.get("score_rationale", ""),
                "strengths": json.loads(s.get("strengths") or "[]"),
                "mets": json.loads(s.get("mets") or "[]"),
                "weaknesses": json.loads(s.get("weaknesses") or "[]"),
                "subcriteria": json.loads(s.get("subcriteria") or "[]"),
            })

        results.append({
            "application_id": app_id,
            "filename": app_row.get("filename"),
            "status": app_row.get("status"),
            "final_score": app_row.get("final_score"),
            "maximum_score": app_row.get("maximum_score"),
            "review_status": app_row.get("review_status"),
            "applicant_name": app_row.get("applicant_name"),
            "application_number": app_row.get("application_number"),
            "overall_summary": app_row.get("overall_summary"),
            "criteria": criteria_out,
            "findings_count": len(findings),
            "documents": [
                {
                    "document_id": d["id"],
                    "document_type": d["document_type"],
                    "filename": d["filename"],
                }
                for d in docs
            ],
        })

    return {"review_id": review_id, "applications": results}


# ---------------------------------------------------------------------------
# DELETE /reviews/{review_id}
# ---------------------------------------------------------------------------

@app.delete("/reviews/{review_id}")
def delete_review(review_id: str):
    """Delete review, all associated DB records, and all storage files."""
    sb = get_supabase()

    # Gather application IDs first for storage cleanup
    applications = _select(sb, "applications", {"review_id": review_id})
    app_ids = [a["id"] for a in applications]

    # Delete generated documents + storage
    for app_id in app_ids:
        docs = _select(sb, "generated_documents", {"application_id": app_id})
        for doc in docs:
            try:
                sb.storage.from_(doc["storage_bucket"]).remove([doc["storage_path"]])
            except Exception as exc:
                logger.warning("Could not delete storage object %s: %s", doc["storage_path"], exc)
        sb.table("generated_documents").delete().eq("application_id", app_id).execute()

    # Delete review_findings, criterion_scores, processing_jobs, applications
    for app_id in app_ids:
        sb.table("review_findings").delete().eq("application_id", app_id).execute()
        sb.table("criterion_scores").delete().eq("application_id", app_id).execute()

    sb.table("processing_jobs").delete().eq("review_id", review_id).execute()
    sb.table("applications").delete().eq("review_id", review_id).execute()

    # Delete storage prefixes (best-effort, iterate by user_id prefix)
    # Attempt deletion by review_id suffix across buckets
    for bucket in (BUCKET_APPS, BUCKET_NOFO, BUCKET_WORKSHEETS):
        for app_row in applications:
            user_id = app_row.get("user_id", "")
            _delete_storage_prefix(sb, bucket, f"{user_id}/{review_id}")

    return {"deleted": True, "review_id": review_id, "applications_deleted": len(app_ids)}


# ---------------------------------------------------------------------------
# GET /reviews/{review_id}/worksheet/{application_id}
# ---------------------------------------------------------------------------

@app.get("/reviews/{review_id}/worksheet/{application_id}")
def get_worksheet_download_url(review_id: str, application_id: str):
    """Generate a signed 60-minute download URL for the completed worksheet."""
    sb = get_supabase()

    docs = (
        sb.table("generated_documents")
        .select("*")
        .eq("application_id", application_id)
        .eq("review_id", review_id)
        .eq("document_type", "completed_worksheet")
        .execute()
        .data
    )
    if not docs:
        raise HTTPException(
            status_code=404,
            detail="No completed worksheet found for this application",
        )

    doc = docs[0]
    try:
        signed = _signed_url(sb, doc["storage_bucket"], doc["storage_path"], expires_in=3600)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not generate download URL: {exc}")

    return {
        "document_id": doc["id"],
        "filename": doc["filename"],
        "download_url": signed,
        "expires_in_seconds": 3600,
    }
