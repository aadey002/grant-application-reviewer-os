#!/usr/bin/env python3
"""
Grant Reviewer V2 - Enhanced FastAPI Backend
Production-grade backend for federal grant review and document management.
"""

import os
import sys
from pathlib import Path
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from loguru import logger
import uvicorn

# Add the current directory to Python path
sys.path.insert(0, str(Path(__file__).parent))

# Import local modules
try:
    from database import init_database, get_db
    from models import Document, Folder, Evaluation
    from services import DocumentService, FolderService, EvaluationService, MCPService
    from utils import setup_logging
except ImportError as e:
    print(f"Import error: {e}")
    print(f"Current directory: {Path(__file__).parent}")
    print(f"Python path: {sys.path}")
    raise

# Setup logging
setup_logging()

# Application lifespan management
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application startup and shutdown."""
    logger.info("Starting Grant Reviewer V2 Backend")
    
    # Initialize database
    await init_database()
    
    # Initialize services
    app.state.document_service = DocumentService()
    app.state.folder_service = FolderService()
    app.state.evaluation_service = EvaluationService()
    app.state.mcp_service = MCPService()
    
    logger.info("Backend initialization complete")
    
    yield
    
    logger.info("Shutting down Grant Reviewer V2 Backend")

# Create FastAPI application
app = FastAPI(
    title="Grant Reviewer V2 API",
    description="Enhanced backend for federal grant review and document management",
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "https://*.minimax.io"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check endpoint
@app.get("/api/health")
async def health_check():
    """Health check endpoint for monitoring."""
    return {"status": "healthy", "version": "2.0.0"}

# Document endpoints
@app.post("/api/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    folder_id: int = Form(None),
    agency: str = Form("HRSA"),
    document_type: str = Form("application"),
    description: str = Form(""),
    tags: str = Form(""),
    db = Depends(get_db)
):
    """Upload a new document."""
    try:
        document_service = app.state.document_service
        document = await document_service.upload_document(
            db, file, folder_id, agency, document_type, description, tags
        )
        return {"success": True, "document": document}
    except Exception as e:
        logger.error(f"Document upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/documents")
async def get_documents(
    folder_id: int = None,
    agency: str = None,
    status: str = None,
    skip: int = 0,
    limit: int = 100,
    db = Depends(get_db)
):
    """Get documents with filtering."""
    try:
        document_service = app.state.document_service
        documents = await document_service.get_documents(
            db, folder_id=folder_id, agency=agency, status=status, skip=skip, limit=limit
        )
        return {"documents": documents}
    except Exception as e:
        logger.error(f"Failed to get documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/documents/{document_id}")
async def get_document(document_id: int, db = Depends(get_db)):
    """Get a specific document."""
    try:
        document_service = app.state.document_service
        document = await document_service.get_document(db, document_id)
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        return {"document": document}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get document: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/documents/{document_id}")
async def update_document(
    document_id: int,
    description: str = Form(None),
    tags: str = Form(None),
    status: str = Form(None),
    db = Depends(get_db)
):
    """Update document metadata."""
    try:
        document_service = app.state.document_service
        document = await document_service.update_document(
            db, document_id, description, tags, status
        )
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        return {"document": document}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update document: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/documents/{document_id}")
async def delete_document(document_id: int, db = Depends(get_db)):
    """Delete a document."""
    try:
        document_service = app.state.document_service
        success = await document_service.delete_document(db, document_id)
        if not success:
            raise HTTPException(status_code=404, detail="Document not found")
        return {"message": "Document deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete document: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Folder endpoints
@app.post("/api/folders")
async def create_folder(
    name: str = Form(...),
    description: str = Form(""),
    parent_id: int = Form(None),
    db = Depends(get_db)
):
    """Create a new folder."""
    try:
        folder_service = app.state.folder_service
        folder = await folder_service.create_folder(db, name, description, parent_id)
        return {"folder": folder}
    except Exception as e:
        logger.error(f"Failed to create folder: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/folders")
async def get_folders(parent_id: int = None, db = Depends(get_db)):
    """Get folders with hierarchy."""
    try:
        folder_service = app.state.folder_service
        folders = await folder_service.get_folders(db, parent_id=parent_id)
        return {"folders": folders}
    except Exception as e:
        logger.error(f"Failed to get folders: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/folders/{folder_id}")
async def delete_folder(folder_id: int, db = Depends(get_db)):
    """Delete a folder."""
    try:
        folder_service = app.state.folder_service
        success = await folder_service.delete_folder(db, folder_id)
        if not success:
            raise HTTPException(status_code=404, detail="Folder not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete folder: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Evaluation endpoints
@app.post("/api/evaluations")
async def create_evaluation(
    document_id: int = Form(...),
    nofo_document_id: int = Form(None),
    evaluation_type: str = Form("comprehensive"),
    evaluation_criteria: str = Form(""),
    db = Depends(get_db)
):
    """Create a new evaluation."""
    try:
        evaluation_service = app.state.evaluation_service
        evaluation = await evaluation_service.create_evaluation(
            db, document_id, nofo_document_id, evaluation_type, evaluation_criteria
        )
        return {"evaluation": evaluation}
    except Exception as e:
        logger.error(f"Failed to create evaluation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/evaluations")
async def get_evaluations(
    document_id: int = None,
    status: str = None,
    skip: int = 0,
    limit: int = 100,
    db = Depends(get_db)
):
    """Get evaluations with filtering."""
    try:
        evaluation_service = app.state.evaluation_service
        evaluations = await evaluation_service.get_evaluations(
            db, document_id=document_id, status=status, skip=skip, limit=limit
        )
        return {"evaluations": evaluations}
    except Exception as e:
        logger.error(f"Failed to get evaluations: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Statistics endpoint
@app.get("/api/statistics")
async def get_statistics(db = Depends(get_db)):
    """Get application statistics."""
    try:
        document_service = app.state.document_service
        folder_service = app.state.folder_service
        evaluation_service = app.state.evaluation_service
        
        doc_stats = await document_service.get_statistics(db)
        folder_stats = await folder_service.get_statistics(db)
        eval_stats = await evaluation_service.get_statistics(db)
        
        return {
            "total_documents": doc_stats.get("total", 0),
            "total_folders": folder_stats.get("total", 0),
            "total_evaluations": eval_stats.get("total", 0),
            "documents_by_agency": doc_stats.get("by_agency", {}),
            "documents_by_status": doc_stats.get("by_status", {}),
            "recent_activity": doc_stats.get("recent_activity", [])
        }
    except Exception as e:
        logger.error(f"Failed to get statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Search endpoint
@app.post("/api/search")
async def search_documents(
    query: str = Form(...),
    filters: str = Form("{}"),
    skip: int = Form(0),
    limit: int = Form(20),
    db = Depends(get_db)
):
    """Search documents."""
    try:
        document_service = app.state.document_service
        results = await document_service.search_documents(db, query, filters, skip, limit)
        return {"results": results, "total": len(results)}
    except Exception as e:
        logger.error(f"Search failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Review Sessions endpoints
@app.post("/api/review-sessions")
async def create_review_session(
    name: str = Form(...),
    application_id: int = Form(...),
    reference_documents: str = Form("[]"),  # JSON array as string
    db = Depends(get_db)
):
    """Create a new review session."""
    try:
        import json
        ref_docs = json.loads(reference_documents) if reference_documents else []
        
        # For now, create a simple review session (we'll add this to models later)
        session = {
            "id": f"session-{int(datetime.now().timestamp())}",
            "name": name,
            "application_id": application_id,
            "reference_documents": ref_docs,
            "status": "draft",
            "created_at": datetime.now().isoformat() + "Z",
            "updated_at": datetime.now().isoformat() + "Z"
        }
        
        return {"session": session}
    except Exception as e:
        logger.error(f"Failed to create review session: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/review-sessions")
async def get_review_sessions(db = Depends(get_db)):
    """Get all review sessions."""
    try:
        # Mock data for now - in a real implementation, this would query the database
        sessions = [
            {
                "id": "session-1",
                "name": "HRSA Sample Application Review",
                "application_id": 5,
                "reference_documents": [1, 2],
                "status": "in_progress",
                "created_at": "2025-07-21T00:00:00Z",
                "updated_at": "2025-07-21T00:30:00Z"
            }
        ]
        return {"sessions": sessions}
    except Exception as e:
        logger.error(f"Failed to get review sessions: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/review-sessions/{session_id}")
async def get_review_session(session_id: str, db = Depends(get_db)):
    """Get a specific review session."""
    try:
        # Mock response - in real implementation, query database
        session = {
            "id": session_id,
            "name": "HRSA Sample Application Review",
            "application_id": 5,
            "reference_documents": [1, 2],
            "status": "in_progress",
            "created_at": "2025-07-21T00:00:00Z",
            "updated_at": "2025-07-21T00:30:00Z"
        }
        return {"session": session}
    except Exception as e:
        logger.error(f"Failed to get review session: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/review-sessions/{session_id}")
async def update_review_session(
    session_id: str,
    updates: dict,
    db = Depends(get_db)
):
    """Update a review session."""
    try:
        # Mock response - in real implementation, update database
        session = {
            "id": session_id,
            "name": updates.get("name", "Updated Session"),
            "application_id": updates.get("application_id", 5),
            "reference_documents": updates.get("reference_documents", [1, 2]),
            "status": updates.get("status", "in_progress"),
            "created_at": "2025-07-21T00:00:00Z",
            "updated_at": datetime.now().isoformat() + "Z"
        }
        return {"session": session}
    except Exception as e:
        logger.error(f"Failed to update review session: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/review-sessions/{session_id}")
async def delete_review_session(session_id: str, db = Depends(get_db)):
    """Delete a review session."""
    try:
        # Mock response - in real implementation, delete from database
        return {"success": True}
    except Exception as e:
        logger.error(f"Failed to delete review session: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
