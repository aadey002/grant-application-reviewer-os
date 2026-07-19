#!/usr/bin/env python3
"""
Grant Reviewer Backend
Full-stack backend interfacing with MCP Grant Reviewer Agent and database persistence
"""

import os
import sys
import uuid
import asyncio
import logging
from pathlib import Path
from typing import Dict, Any, Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Add the MCP agent and database to the path
mcp_path = Path(__file__).parent.parent.parent / "grant-reviewer-mcp" / "src"
sys.path.insert(0, str(mcp_path))

# Import database module
from database import DatabaseManager

# Try to import MCP components
try:
    from grant_reviewer.document_processor import DocumentProcessor
    from grant_reviewer.evaluator import GrantEvaluator
    from grant_reviewer.scoring_engine import ScoringEngine
    from grant_reviewer.comment_generator import CommentGenerator
    from grant_reviewer.report_generator import ReportGenerator
    from grant_reviewer.safe_review import extract_nofo_criteria, review_application, safe_extract_application_zip
    MCP_AVAILABLE = True
    logger.info("MCP Agent components loaded successfully")
except ImportError as e:
    logger.error(f"Failed to load MCP agent components: {e}")
    raise RuntimeError(f"MCP Agent not available: {e}")

# Initialize FastAPI app
app = FastAPI(
    title="Grant Reviewer API",
    description="Professional API for federal grant review and evaluation",
    version="2.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create uploads directory
UPLOADS_DIR = Path(__file__).parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

# Initialize database
db = DatabaseManager(str(Path(__file__).parent / "grant_reviewer.db"))

# Initialize MCP agent components
try:
    document_processor = DocumentProcessor()
    grant_evaluator = GrantEvaluator()
    scoring_engine = ScoringEngine()
    comment_generator = CommentGenerator()
    report_generator = ReportGenerator()
    logger.info("MCP Agent components initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize MCP components: {e}")
    raise

# Serve uploaded files
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

@app.post("/safe-reviews/extract-rubrics")
async def extract_safe_rubrics(nofos: list[UploadFile] = File(...)):
    if not 1 <= len(nofos) <= 3:
        raise HTTPException(status_code=400, detail="Upload between one and three NOFO files")
    rubrics = []
    for index, upload in enumerate(nofos, start=1):
        extension = Path(upload.filename or "").suffix.lower()
        if extension not in {".pdf", ".docx"}:
            raise HTTPException(status_code=400, detail=f"{upload.filename}: NOFO must be PDF or DOCX")
        directory = UPLOADS_DIR / f"grant-{index}"
        directory.mkdir(exist_ok=True)
        path = directory / f"nofo{extension}"
        with open(path, "wb") as handle:
            handle.write(await upload.read())
        rubric = extract_nofo_criteria(path)
        rubric["grant_index"] = index
        rubrics.append(rubric)
    return {"success": True, "rubrics": rubrics}

@app.post("/safe-reviews/run")
async def run_safe_reviews(
    applications: list[UploadFile] = File(...),
    nofos: list[UploadFile] = File(...),
    rubrics: list[UploadFile] | None = File(None),
    worksheets: list[UploadFile] | None = File(None),
    application_counts: str = Form(...),
    approved_criteria: str = Form(...),
):
    """Run multiple applications within each of exactly three grant competitions."""
    import json as json_mod
    try:
        counts = json_mod.loads(application_counts)
    except (json_mod.JSONDecodeError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid application counts")
    grant_count = len(counts)
    if not 1 <= grant_count <= 3 or any(not isinstance(count, int) or count < 1 for count in counts):
        raise HTTPException(status_code=400, detail="Provide one to three grants, each with at least one application")
    rubrics = rubrics or []
    worksheets = worksheets or []
    if len(applications) != sum(counts) or len(nofos) != grant_count or len(rubrics) not in {0, grant_count} or len(worksheets) not in {0, grant_count}:
        raise HTTPException(status_code=400, detail="The uploaded files do not match the active grant packages")
    try:
        criteria_sets = json_mod.loads(approved_criteria)
    except (json_mod.JSONDecodeError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid approved criteria")
    if len(criteria_sets) != grant_count or any(not item.get("approved") or not item.get("criteria") for item in criteria_sets):
        raise HTTPException(status_code=400, detail="Every active grant rubric must be approved before review")
    results = []
    allowed = {".pdf", ".doc", ".docx", ".txt"}
    application_offset = 0
    for grant_index in range(1, grant_count + 1):
        grant_dir = UPLOADS_DIR / f"grant-{grant_index}"
        grant_dir.mkdir(exist_ok=True)
        package_files = {}
        optional_groups = {"rubrics": rubrics, "worksheets": worksheets}
        for kind, items in {"nofos": nofos, **{k:v for k,v in optional_groups.items() if v}}.items():
            document = items[grant_index - 1]
            extension = Path(document.filename or "").suffix.lower()
            if extension not in allowed:
                raise HTTPException(status_code=400, detail=f"{document.filename}: unsupported file type")
            content = await document.read()
            if not content or len(content) > 75 * 1024 * 1024:
                raise HTTPException(status_code=400, detail=f"{document.filename}: invalid file size")
            path = grant_dir / f"{kind[:-1]}{extension}"
            with open(path, "wb") as handle:
                handle.write(content)
            package_files[kind[:-1]] = {"filename": document.filename, "path": str(path)}
        count = counts[grant_index - 1]
        grant_application_paths = []
        for upload_index in range(1, count + 1):
            upload = applications[application_offset]
            application_offset += 1
            extension = Path(upload.filename or "").suffix.lower()
            if extension not in {".pdf", ".zip"}:
                raise HTTPException(status_code=400, detail=f"{upload.filename}: application must be PDF or ZIP")
            content = await upload.read()
            if not content or len(content) > 250 * 1024 * 1024:
                raise HTTPException(status_code=400, detail=f"{upload.filename}: invalid file size")
            incoming = grant_dir / f"incoming-{upload_index}{extension}"
            with open(incoming, "wb") as handle:
                handle.write(content)
            if extension == ".zip":
                try:
                    grant_application_paths.extend(safe_extract_application_zip(incoming, grant_dir / f"zip-{upload_index}"))
                except (ValueError, OSError) as exc:
                    raise HTTPException(status_code=400, detail=f"{upload.filename}: {exc}")
            else:
                grant_application_paths.append(incoming)
        for application_index, source_path in enumerate(grant_application_paths, start=1):
            application_dir = grant_dir / f"application-{application_index}"
            application_dir.mkdir(exist_ok=True)
            path = application_dir / "application.pdf"
            with open(source_path, "rb") as source, open(path, "wb") as handle:
                while chunk := source.read(1024 * 1024):
                    handle.write(chunk)
            criteria = [{"name": item["name"], "points": item["points"], "keywords": item.get("keywords", [])}
                        for item in criteria_sets[grant_index - 1]["criteria"]]
            result = review_application(f"grant-{grant_index}-application-{application_index}", path, criteria)
            result["application_file"] = source_path.name
            result["grant_id"] = f"grant-{grant_index}"
            result["grant_index"] = grant_index
            result["application_index"] = application_index
            results.append(result)
    return {"success": True, "reviews": results}

async def perform_full_analysis(file_path: str, agency: str, document_id: int) -> Dict[str, Any]:
    """Perform complete grant analysis using MCP agent components."""
    try:
        logger.info(f"Starting analysis for document ID {document_id}")
        
        # Process document
        app_content = document_processor.process_document(file_path)
        logger.info(f"Document processed: {app_content.get('total_pages', 0)} pages, {len(app_content.get('sections', {}))} sections")
        
        # Store processing results
        db.store_document_processing(document_id, app_content)
        
        # Use default NOFO if available
        nofo_path = str(Path(__file__).parent.parent.parent / "user_input_files" / "HRSA Scoring Rubric.doc")
        nofo_content = {}
        if Path(nofo_path).exists():
            try:
                nofo_content = document_processor.process_document(nofo_path)
                logger.info("NOFO document processed successfully")
            except Exception as e:
                logger.warning(f"Could not process NOFO: {e}")
        
        # Generate initial evaluation
        evaluation_result = grant_evaluator.evaluate_application(
            app_content, nofo_content, agency, None
        )
        logger.info(f"Evaluation completed: {evaluation_result.get('completeness_score', 0)}% completeness")
        
        # Generate scores
        scoring_result = scoring_engine.score_application(
            app_content, nofo_content, agency, "detailed"
        )
        logger.info(f"Scoring completed: {scoring_result.get('overall_score', 0)}/100")
        
        # Generate comments
        comments_result = comment_generator.generate_comments(
            app_content, nofo_content, scoring_result, agency, "professional"
        )
        logger.info(f"Comments generated: {comments_result.get('total_references', 0)} references")
        
        # Generate worksheet
        worksheet = report_generator.generate_worksheet(
            app_content, nofo_content, scoring_result, comments_result, 
            agency, "comprehensive"
        )
        logger.info("Worksheet generated successfully")
        
        # Store evaluation results in database
        db.store_evaluation(
            document_id, agency, evaluation_result, 
            scoring_result, comments_result, worksheet
        )
        
        return {
            "document_info": {
                "type": app_content.get("document_type", "Unknown"),
                "pages": app_content.get("total_pages", 0),
                "sections": len(app_content.get("sections", [])),
                "tables": len(app_content.get("tables", [])),
                "word_count": sum(section.get('word_count', 0) for section in app_content.get('sections', {}).values())
            },
            "evaluation": evaluation_result,
            "scoring": scoring_result,
            "comments": comments_result,
            "worksheet": worksheet,
            "agency": agency
        }
        
    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        raise

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "message": "Grant Reviewer API is running", 
        "status": "healthy",
        "version": "2.0.0",
        "mcp_available": MCP_AVAILABLE
    }

@app.get("/health")
async def health_check():
    """Detailed health check"""
    try:
        # Test database connection
        stats = db.get_statistics()
        
        return {
            "status": "healthy",
            "version": "2.0.0",
            "mcp_agent": "available",
            "database": "connected",
            "uploads_dir": str(UPLOADS_DIR),
            "statistics": stats,
            "components": {
                "document_processor": "ready",
                "grant_evaluator": "ready",
                "scoring_engine": "ready",
                "comment_generator": "ready",
                "report_generator": "ready"
            }
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "error": str(e)
        }

@app.get("/statistics")
async def get_statistics():
    """Get system statistics"""
    try:
        return db.get_statistics()
    except Exception as e:
        logger.error(f"Statistics retrieval failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/documents")
async def list_documents(limit: int = 50, offset: int = 0):
    """List uploaded documents"""
    try:
        documents = db.list_documents(limit, offset)
        return {
            "documents": documents,
            "total": len(documents),
            "limit": limit,
            "offset": offset
        }
    except Exception as e:
        logger.error(f"Document listing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/document/{file_id}")
async def get_document_details(file_id: str):
    """Get detailed document information including evaluation results"""
    try:
        result = db.get_document_with_evaluation(file_id)
        if not result:
            raise HTTPException(status_code=404, detail="Document not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Document retrieval failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    agency: str = Form("HRSA")
):
    """Upload a grant application document with database persistence"""
    try:
        # Validate file type
        allowed_types = [".pdf", ".doc", ".docx", ".txt"]
        file_extension = Path(file.filename or "").suffix.lower()
        
        if file_extension not in allowed_types:
            raise HTTPException(
                status_code=400, 
                detail=f"File type {file_extension} not supported. Allowed types: {allowed_types}"
            )
        
        # Validate file size (50MB limit)
        content = await file.read()
        if len(content) > 50 * 1024 * 1024:
            raise HTTPException(
                status_code=400,
                detail="File size exceeds 50MB limit"
            )
        
        # Generate unique filename
        file_id = str(uuid.uuid4())
        filename = f"{file_id}_{file.filename}"
        file_path = UPLOADS_DIR / filename
        
        # Save file
        with open(file_path, "wb") as f:
            f.write(content)
        
        # Store in database
        document_id = db.store_document(
            file_id=file_id,
            original_filename=file.filename or "unknown",
            file_path=str(file_path),
            file_size=len(content),
            file_type=file_extension,
            agency=agency
        )
        
        logger.info(f"Document uploaded: {file.filename} (ID: {document_id})")
        
        return {
            "success": True,
            "file_id": file_id,
            "document_id": document_id,
            "filename": file.filename,
            "file_path": str(file_path),
            "agency": agency,
            "size": len(content)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@app.post("/analyze-simple")
async def analyze_simple(
    background_tasks: BackgroundTasks,
    file_id: str = Form(...),
    agency: str = Form("HRSA")
):
    """Analyze document with database integration and background processing"""
    try:
        # Get document from database
        document = db.get_document(file_id)
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Check if document exists on disk
        file_path = Path(document['file_path'])
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Document file not found on disk")
        
        # Check if analysis already exists
        existing_evaluation = db.get_evaluation(document['id'])
        if existing_evaluation:
            logger.info(f"Returning cached analysis for document {file_id}")
            return {
                "success": True,
                "cached": True,
                "analysis": {
                    "document_info": {
                        "type": existing_evaluation.get('evaluation_data', {}).get('document_type', 'Unknown'),
                        "pages": existing_evaluation.get('evaluation_data', {}).get('total_pages', 0),
                        "sections": existing_evaluation.get('evaluation_data', {}).get('total_sections', 0),
                        "tables": existing_evaluation.get('evaluation_data', {}).get('total_tables', 0)
                    },
                    "evaluation": existing_evaluation.get('evaluation_data', {}),
                    "scoring": existing_evaluation.get('scoring_data', {}),
                    "comments": existing_evaluation.get('comments_data', {}),
                    "worksheet": existing_evaluation.get('worksheet_data', {}),
                    "agency": agency
                }
            }
        
        # Perform analysis
        analysis_result = await perform_full_analysis(
            str(file_path), agency, document['id']
        )
        
        return {
            "success": True,
            "cached": False,
            "analysis": analysis_result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Analysis failed for {file_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.post("/analyze")
async def analyze_document(
    file_path: str = Form(...),
    agency: str = Form("HRSA"),
    nofo_path: Optional[str] = Form(None)
):
    """Direct document analysis endpoint"""
    try:
        # Check if file exists
        if not Path(file_path).exists():
            raise HTTPException(status_code=404, detail="File not found")
        
        # Get document ID from database if available
        file_id = Path(file_path).stem.split('_')[0]
        document = db.get_document(file_id)
        document_id = document['id'] if document else None
        
        # Perform analysis
        if document_id:
            analysis_result = await perform_full_analysis(file_path, agency, document_id)
        else:
            # Direct analysis without database storage
            app_content = document_processor.process_document(file_path)
            nofo_content = {}
            if nofo_path and Path(nofo_path).exists():
                nofo_content = document_processor.process_document(nofo_path)
            
            evaluation_result = grant_evaluator.evaluate_application(
                app_content, nofo_content, agency, None
            )
            scoring_result = scoring_engine.score_application(
                app_content, nofo_content, agency, "detailed"
            )
            comments_result = comment_generator.generate_comments(
                app_content, nofo_content, scoring_result, agency, "professional"
            )
            worksheet = report_generator.generate_worksheet(
                app_content, nofo_content, scoring_result, comments_result, 
                agency, "comprehensive"
            )
            
            analysis_result = {
                "document_info": {
                    "type": app_content.get("document_type", "Unknown"),
                    "pages": app_content.get("total_pages", 0),
                    "sections": len(app_content.get("sections", [])),
                    "tables": len(app_content.get("tables", []))
                },
                "evaluation": evaluation_result,
                "scoring": scoring_result,
                "comments": comments_result,
                "worksheet": worksheet,
                "agency": agency
            }
        
        return {
            "success": True,
            "analysis": analysis_result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.delete("/document/{file_id}")
async def delete_document(file_id: str):
    """Delete document and its associated data"""
    try:
        document = db.get_document(file_id)
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Delete physical file
        file_path = Path(document['file_path'])
        if file_path.exists():
            file_path.unlink()
        
        # Note: Database cleanup would need custom implementation
        # For now, we just mark as deleted or leave as is
        
        return {"success": True, "message": "Document deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Document deletion failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8081,
        reload=True,
        log_level="info"
    )
