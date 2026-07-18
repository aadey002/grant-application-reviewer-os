#!/usr/bin/env python3
"""
Grant Reviewer V2 - Production Backend Server
Simple backend server for deployment alongside the frontend.
"""

import os
import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any

try:
    from fastapi import FastAPI, HTTPException, UploadFile, File, Form
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles
    import uvicorn
except ImportError:
    print("FastAPI not available. Install with: pip install fastapi uvicorn python-multipart")
    exit(1)

# Initialize FastAPI app
app = FastAPI(
    title="Grant Reviewer V2 API",
    description="Production backend for grant review system",
    version="2.0.0",
    docs_url="/api/docs"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database setup
DATABASE_PATH = Path("grant_reviewer.db")
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

def init_database():
    """Initialize SQLite database."""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    # Create tables
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            parent_id INTEGER,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            filename TEXT NOT NULL,
            file_path TEXT,
            file_size INTEGER,
            agency TEXT DEFAULT 'HRSA',
            document_type TEXT DEFAULT 'application',
            status TEXT DEFAULT 'uploaded',
            description TEXT,
            tags TEXT,
            folder_id INTEGER,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            category TEXT DEFAULT 'application',
            sub_type TEXT
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS evaluations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            evaluation_type TEXT DEFAULT 'comprehensive',
            status TEXT DEFAULT 'pending',
            overall_score REAL,
            scores_data TEXT,
            comments_data TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Insert some initial data if tables are empty
    cursor.execute("SELECT COUNT(*) FROM folders")
    if cursor.fetchone()[0] == 0:
        folders = [
            ("HRSA Reference Materials", "HRSA scoring rubrics and evaluation guidelines", None),
            ("Grant Applications", "Grant proposals and applications to be reviewed", None),
            ("SAMHSA Materials", "SAMHSA-specific evaluation materials and guidelines", None),
            ("Reviewed Items", "Documents that have been evaluated", None)
        ]
        cursor.executemany("INSERT INTO folders (name, description, parent_id) VALUES (?, ?, ?)", folders)
    
    conn.commit()
    conn.close()

# Initialize database on startup
init_database()

# Helper functions
def get_db_connection():
    """Get database connection."""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def safe_filename(filename: str) -> str:
    """Create safe filename."""
    import re
    safe_name = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
    safe_name = re.sub(r'_+', '_', safe_name).strip('_')
    return safe_name or "document"

# API Endpoints

@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "version": "2.0.0"}

@app.get("/api/statistics")
async def get_statistics():
    """Get application statistics."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get document stats
    cursor.execute("SELECT COUNT(*) FROM documents")
    total_documents = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM folders")
    total_folders = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM evaluations")
    total_evaluations = cursor.fetchone()[0]
    
    cursor.execute("SELECT agency, COUNT(*) FROM documents GROUP BY agency")
    documents_by_agency = dict(cursor.fetchall())
    
    cursor.execute("SELECT status, COUNT(*) FROM documents GROUP BY status")
    documents_by_status = dict(cursor.fetchall())
    
    cursor.execute("SELECT id, title, agency, created_at FROM documents ORDER BY created_at DESC LIMIT 10")
    recent_activity = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    
    return {
        "total_documents": total_documents,
        "total_folders": total_folders,
        "total_evaluations": total_evaluations,
        "documents_by_agency": documents_by_agency or {"HRSA": 0},
        "documents_by_status": documents_by_status or {"uploaded": 0},
        "recent_activity": recent_activity
    }

@app.get("/api/folders")
async def get_folders(parent_id: Optional[int] = None):
    """Get folders."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    if parent_id is not None:
        cursor.execute("SELECT * FROM folders WHERE parent_id = ? ORDER BY name", (parent_id,))
    else:
        cursor.execute("SELECT * FROM folders WHERE parent_id IS NULL ORDER BY name")
    
    folders = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return {"folders": folders}

@app.post("/api/folders")
async def create_folder(
    name: str = Form(...),
    description: str = Form(""),
    parent_id: Optional[int] = Form(None)
):
    """Create a new folder."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    now = datetime.now().isoformat() + "Z"
    cursor.execute(
        "INSERT INTO folders (name, description, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (name, description, parent_id, now, now)
    )
    
    folder_id = cursor.lastrowid
    cursor.execute("SELECT * FROM folders WHERE id = ?", (folder_id,))
    folder = dict(cursor.fetchone())
    
    conn.commit()
    conn.close()
    
    return {"folder": folder}

@app.delete("/api/folders/{folder_id}")
async def delete_folder(folder_id: int):
    """Delete a folder."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if folder exists
    cursor.execute("SELECT * FROM folders WHERE id = ?", (folder_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Folder not found")
    
    # Move documents out of folder
    cursor.execute("UPDATE documents SET folder_id = NULL WHERE folder_id = ?", (folder_id,))
    
    # Delete folder
    cursor.execute("DELETE FROM folders WHERE id = ?", (folder_id,))
    
    conn.commit()
    conn.close()
    
    return {"success": True}

@app.get("/api/documents")
async def get_documents(
    folder_id: Optional[int] = None,
    agency: Optional[str] = None,
    status: Optional[str] = None
):
    """Get documents with filtering."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = "SELECT * FROM documents WHERE 1=1"
    params = []
    
    if folder_id is not None:
        query += " AND folder_id = ?"
        params.append(folder_id)
    
    if agency:
        query += " AND agency = ?"
        params.append(agency)
    
    if status:
        query += " AND status = ?"
        params.append(status)
    
    query += " ORDER BY created_at DESC"
    
    cursor.execute(query, params)
    documents = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return {"documents": documents}

@app.post("/api/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    folder_id: Optional[int] = Form(None),
    agency: str = Form("HRSA"),
    document_type: str = Form("application"),
    description: str = Form(""),
    tags: str = Form(""),
    category: str = Form("application"),
    sub_type: str = Form("")
):
    """Upload a document."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    # Create safe filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = safe_filename(file.filename)
    filename = f"{timestamp}_{safe_name}"
    file_path = UPLOAD_DIR / filename
    
    # Save file
    with open(file_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)
    
    # Save to database
    conn = get_db_connection()
    cursor = conn.cursor()
    
    now = datetime.now().isoformat() + "Z"
    cursor.execute('''
        INSERT INTO documents 
        (title, filename, file_path, file_size, agency, document_type, status, description, tags, folder_id, category, sub_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        file.filename, filename, str(file_path), len(content),
        agency, document_type, "uploaded", description, tags, folder_id,
        category, sub_type, now, now
    ))
    
    doc_id = cursor.lastrowid
    cursor.execute("SELECT * FROM documents WHERE id = ?", (doc_id,))
    document = dict(cursor.fetchone())
    
    conn.commit()
    conn.close()
    
    return {"success": True, "document": document}

@app.delete("/api/documents/{document_id}")
async def delete_document(document_id: int):
    """Delete a document."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get document info
    cursor.execute("SELECT * FROM documents WHERE id = ?", (document_id,))
    doc = cursor.fetchone()
    
    if not doc:
        conn.close()
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Delete file if it exists
    if doc['file_path'] and Path(doc['file_path']).exists():
        Path(doc['file_path']).unlink()
    
    # Delete from database
    cursor.execute("DELETE FROM documents WHERE id = ?", (document_id,))
    
    conn.commit()
    conn.close()
    
    return {"success": True, "message": "Document deleted successfully"}

@app.get("/api/evaluations")
async def get_evaluations():
    """Get evaluations."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM evaluations ORDER BY created_at DESC")
    evaluations = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return {"evaluations": evaluations}

@app.post("/api/search")
async def search_documents(query: str = Form(...)):
    """Search documents."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Simple text search
    search_query = f"%{query}%"
    cursor.execute('''
        SELECT * FROM documents 
        WHERE title LIKE ? OR description LIKE ? OR tags LIKE ?
        ORDER BY created_at DESC
    ''', (search_query, search_query, search_query))
    
    results = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return {"results": results, "total": len(results)}

# Review sessions endpoints (simplified)
@app.get("/api/review-sessions")
async def get_review_sessions():
    """Get review sessions."""
    return {"sessions": []}

@app.post("/api/review-sessions")
async def create_review_session(
    name: str = Form(...),
    application_id: int = Form(...),
    reference_documents: str = Form("[]")
):
    """Create review session."""
    session = {
        "id": f"session-{int(datetime.now().timestamp())}",
        "name": name,
        "application_id": application_id,
        "reference_documents": json.loads(reference_documents),
        "status": "draft",
        "created_at": datetime.now().isoformat() + "Z",
        "updated_at": datetime.now().isoformat() + "Z"
    }
    return {"session": session}

# Serve static files (frontend)
app.mount("/", StaticFiles(directory="dist", html=True), name="static")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8002)
