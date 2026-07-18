#!/usr/bin/env python3
"""
Simplified Grant Reviewer V2 Backend for Testing
"""

import os
import json
from datetime import datetime
from typing import Dict, List, Optional, Any
from fastapi import FastAPI, HTTPException, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

# Simple FastAPI application without complex dependencies
app = FastAPI(
    title="Grant Reviewer V2 API",
    description="Simplified backend for development",
    version="2.0.0-dev",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "https://*.minimax.io"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mock data store
mock_documents = [
    {
        "id": 1,
        "title": "Rural Health Initiative Proposal",
        "filename": "rural_health_initiative.pdf",
        "file_size": 2560000,
        "agency": "HRSA",
        "document_type": "application",
        "status": "reviewed",
        "description": "Comprehensive proposal for expanding rural health services",
        "tags": "rural health,primary care,telehealth",
        "created_at": "2025-01-15T09:30:00Z",
        "updated_at": "2025-01-20T14:30:00Z"
    },
    {
        "id": 2,
        "title": "Mental Health Services Grant",
        "filename": "mental_health_services.docx",
        "file_size": 1840000,
        "agency": "SAMHSA",
        "document_type": "application",
        "status": "under_review",
        "description": "Grant application for mental health and substance abuse programs",
        "tags": "mental health,substance abuse,treatment",
        "created_at": "2025-01-18T14:20:00Z",
        "updated_at": "2025-01-20T16:45:00Z"
    },
    {
        "id": 3,
        "title": "Community Health Center NOFO",
        "filename": "chc_expansion_nofo.pdf",
        "file_size": 3200000,
        "agency": "HRSA",
        "document_type": "nofo",
        "status": "published",
        "description": "Notice of Funding Opportunity for Community Health Centers",
        "tags": "NOFO,community health,infrastructure",
        "created_at": "2025-01-10T11:00:00Z",
        "updated_at": "2025-01-10T11:00:00Z"
    }
]

mock_evaluations = [
    {
        "id": 1,
        "document_id": 1,
        "evaluation_type": "comprehensive",
        "status": "completed",
        "overall_score": 85.5,
        "created_at": "2025-01-20T10:30:00Z",
        "completed_at": "2025-01-20T10:45:00Z",
        "agency": "HRSA"
    },
    {
        "id": 2,
        "document_id": 2,
        "evaluation_type": "scoring",
        "status": "in_progress",
        "created_at": "2025-01-20T11:15:00Z",
        "agency": "SAMHSA"
    }
]

mock_folders = [
    {
        "id": 1,
        "name": "HRSA Applications 2025",
        "description": "All HRSA grant applications for 2025",
        "parent_id": None,
        "created_at": "2025-01-01T00:00:00Z",
        "updated_at": "2025-01-01T00:00:00Z"
    },
    {
        "id": 2,
        "name": "SAMHSA Applications",
        "description": "SAMHSA grant applications",
        "parent_id": None,
        "created_at": "2025-01-01T00:00:00Z",
        "updated_at": "2025-01-01T00:00:00Z"
    }
]

# Health check endpoint
@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "version": "2.0.0-dev"}

# Document endpoints
@app.get("/api/documents")
async def get_documents(
    folder_id: int = None,
    agency: str = None,
    status: str = None,
    skip: int = 0,
    limit: int = 100
):
    documents = mock_documents.copy()
    
    # Apply filters
    if agency:
        documents = [d for d in documents if d["agency"] == agency]
    if status:
        documents = [d for d in documents if d["status"] == status]
    
    # Apply pagination
    documents = documents[skip:skip + limit]
    
    return {"documents": documents}

@app.get("/api/documents/{document_id}")
async def get_document(document_id: int):
    document = next((d for d in mock_documents if d["id"] == document_id), None)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"document": document}

@app.post("/api/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    folder_id: int = Form(None),
    agency: str = Form("HRSA"),
    document_type: str = Form("application"),
    description: str = Form(""),
    tags: str = Form("")
):
    # Create new document
    new_doc = {
        "id": len(mock_documents) + 1,
        "title": file.filename,
        "filename": file.filename,
        "file_size": 1000000,  # Mock size
        "agency": agency,
        "document_type": document_type,
        "status": "uploaded",
        "description": description,
        "tags": tags,
        "created_at": datetime.utcnow().isoformat() + "Z",
        "updated_at": datetime.utcnow().isoformat() + "Z"
    }
    
    mock_documents.append(new_doc)
    return {"success": True, "document": new_doc}

# Folder endpoints
@app.get("/api/folders")
async def get_folders(parent_id: int = None):
    folders = mock_folders.copy()
    if parent_id is not None:
        folders = [f for f in folders if f["parent_id"] == parent_id]
    else:
        folders = [f for f in folders if f["parent_id"] is None]
    
    return {"folders": folders}

@app.post("/api/folders")
async def create_folder(
    name: str = Form(...),
    description: str = Form(""),
    parent_id: int = Form(None)
):
    new_folder = {
        "id": len(mock_folders) + 1,
        "name": name,
        "description": description,
        "parent_id": parent_id,
        "created_at": datetime.utcnow().isoformat() + "Z",
        "updated_at": datetime.utcnow().isoformat() + "Z"
    }
    
    mock_folders.append(new_folder)
    return {"folder": new_folder}

# Evaluation endpoints
@app.get("/api/evaluations")
async def get_evaluations(
    document_id: int = None,
    status: str = None,
    skip: int = 0,
    limit: int = 100
):
    evaluations = mock_evaluations.copy()
    
    if document_id is not None:
        evaluations = [e for e in evaluations if e["document_id"] == document_id]
    if status:
        evaluations = [e for e in evaluations if e["status"] == status]
    
    evaluations = evaluations[skip:skip + limit]
    return {"evaluations": evaluations}

@app.post("/api/evaluations")
async def create_evaluation(
    document_id: int = Form(...),
    nofo_document_id: int = Form(None),
    evaluation_type: str = Form("comprehensive"),
    evaluation_criteria: str = Form("")
):
    new_eval = {
        "id": len(mock_evaluations) + 1,
        "document_id": document_id,
        "evaluation_type": evaluation_type,
        "status": "pending",
        "created_at": datetime.utcnow().isoformat() + "Z",
        "agency": "HRSA"  # Default
    }
    
    mock_evaluations.append(new_eval)
    return {"evaluation": new_eval}

# Statistics endpoint
@app.get("/api/statistics")
async def get_statistics():
    total_docs = len(mock_documents)
    total_folders = len(mock_folders)
    total_evals = len(mock_evaluations)
    
    docs_by_agency = {}
    docs_by_status = {}
    
    for doc in mock_documents:
        agency = doc["agency"]
        status = doc["status"]
        docs_by_agency[agency] = docs_by_agency.get(agency, 0) + 1
        docs_by_status[status] = docs_by_status.get(status, 0) + 1
    
    return {
        "total_documents": total_docs,
        "total_folders": total_folders,
        "total_evaluations": total_evals,
        "documents_by_agency": docs_by_agency,
        "documents_by_status": docs_by_status,
        "recent_activity": mock_documents[-5:]  # Last 5 documents
    }

# Search endpoint
@app.post("/api/search")
async def search_documents(
    query: str = Form(...),
    filters: str = Form("{}"),
    skip: int = Form(0),
    limit: int = Form(20)
):
    # Simple text search
    results = []
    query_lower = query.lower()
    
    for doc in mock_documents:
        if (query_lower in doc["title"].lower() or 
            query_lower in doc.get("description", "").lower() or
            query_lower in doc.get("tags", "").lower()):
            results.append(doc)
    
    return {"results": results[skip:skip + limit], "total": len(results)}

if __name__ == "__main__":
    uvicorn.run(
        "simple_main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
