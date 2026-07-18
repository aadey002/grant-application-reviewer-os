#!/usr/bin/env python3
"""
Extract data from the grant reviewer database to update mock data
"""
import sqlite3
import json
import os
from datetime import datetime

def extract_database_data():
    db_path = "/workspace/grant-reviewer-v2/backend/grant_reviewer.db"
    
    if not os.path.exists(db_path):
        print(f"Database not found: {db_path}")
        return None, None, None
    
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row  # Enable column access by name
        cursor = conn.cursor()
        
        # Get all tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        print("Available tables:", [table[0] for table in tables])
        
        # Extract folders
        folders = []
        try:
            cursor.execute("SELECT * FROM folders ORDER BY created_at")
            folder_rows = cursor.fetchall()
            for row in folder_rows:
                folders.append({
                    "id": row["id"],
                    "name": row["name"],
                    "description": row["description"] or "",
                    "parent_id": row["parent_id"],
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"]
                })
        except Exception as e:
            print(f"Error extracting folders: {e}")
        
        # Extract documents
        documents = []
        try:
            cursor.execute("SELECT * FROM documents ORDER BY created_at")
            doc_rows = cursor.fetchall()
            for row in doc_rows:
                documents.append({
                    "id": row["id"],
                    "title": row["title"],
                    "filename": row["filename"],
                    "file_size": row["file_size"],
                    "agency": row["agency"],
                    "document_type": row["document_type"],
                    "status": row["status"],
                    "description": row["description"] or "",
                    "tags": row["tags"] or "",
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"]
                })
        except Exception as e:
            print(f"Error extracting documents: {e}")
        
        # Extract evaluations
        evaluations = []
        try:
            cursor.execute("SELECT * FROM evaluations ORDER BY created_at")
            eval_rows = cursor.fetchall()
            for row in eval_rows:
                evaluations.append({
                    "id": row["id"],
                    "document_id": row["document_id"],
                    "evaluation_type": row["evaluation_type"],
                    "status": row["status"],
                    "overall_score": row["overall_score"],
                    "agency": row["agency"],
                    "created_at": row["created_at"],
                    "completed_at": row["completed_at"]
                })
        except Exception as e:
            print(f"Error extracting evaluations: {e}")
        
        conn.close()
        
        print(f"Extracted {len(folders)} folders, {len(documents)} documents, {len(evaluations)} evaluations")
        return folders, documents, evaluations
        
    except Exception as e:
        print(f"Database error: {e}")
        return None, None, None

if __name__ == "__main__":
    folders, documents, evaluations = extract_database_data()
    
    if folders is not None:
        print("\n=== FOLDERS ===")
        for folder in folders:
            print(f"- {folder['name']}: {folder['description']}")
        
        print("\n=== DOCUMENTS ===")
        for doc in documents:
            print(f"- {doc['title']} ({doc['agency']}) - {doc['status']}")
        
        print("\n=== EVALUATIONS ===") 
        for eval in evaluations:
            print(f"- Doc {eval['document_id']}: {eval['status']} - Score: {eval['overall_score']}")
        
        # Save to JSON for easy import
        data = {
            "folders": folders,
            "documents": documents, 
            "evaluations": evaluations,
            "extracted_at": datetime.now().isoformat()
        }
        
        with open("/workspace/extracted_db_data.json", "w") as f:
            json.dump(data, f, indent=2)
        
        print(f"\nData saved to /workspace/extracted_db_data.json")
