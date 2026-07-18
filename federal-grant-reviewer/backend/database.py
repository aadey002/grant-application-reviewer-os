#!/usr/bin/env python3
"""
Database module for Grant Reviewer application
Handles SQLite database operations for document metadata, evaluations, and user data
"""

import sqlite3
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any
import logging

class DatabaseManager:
    """Manages SQLite database operations for the grant reviewer system."""
    
    def __init__(self, db_path: str = "grant_reviewer.db"):
        self.db_path = Path(db_path)
        self.logger = logging.getLogger(__name__)
        self.init_database()
    
    def init_database(self):
        """Initialize database with required tables."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Documents table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS documents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    file_id TEXT UNIQUE NOT NULL,
                    original_filename TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    file_size INTEGER NOT NULL,
                    file_type TEXT NOT NULL,
                    agency TEXT NOT NULL,
                    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    processed BOOLEAN DEFAULT FALSE
                )
            """)
            
            # Evaluations table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS evaluations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    document_id INTEGER NOT NULL,
                    agency TEXT NOT NULL,
                    overall_score REAL,
                    overall_rating TEXT,
                    recommendation TEXT,
                    evaluation_data TEXT, -- JSON blob
                    scoring_data TEXT, -- JSON blob
                    comments_data TEXT, -- JSON blob
                    worksheet_data TEXT, -- JSON blob
                    evaluation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (document_id) REFERENCES documents (id)
                )
            """)
            
            # Document processing results table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS document_processing (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    document_id INTEGER NOT NULL,
                    document_type TEXT,
                    total_pages INTEGER,
                    total_sections INTEGER,
                    total_tables INTEGER,
                    word_count INTEGER,
                    processing_data TEXT, -- JSON blob
                    processing_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (document_id) REFERENCES documents (id)
                )
            """)
            
            # User sessions table (for future use)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT UNIQUE NOT NULL,
                    user_data TEXT, -- JSON blob
                    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            conn.commit()
    
    def store_document(self, file_id: str, original_filename: str, file_path: str, 
                      file_size: int, file_type: str, agency: str) -> int:
        """Store document metadata and return document ID."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT INTO documents (file_id, original_filename, file_path, file_size, file_type, agency)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (file_id, original_filename, file_path, file_size, file_type, agency))
            
            document_id = cursor.lastrowid
            conn.commit()
            return document_id
    
    def get_document(self, file_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve document metadata by file ID."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT * FROM documents WHERE file_id = ?
            """, (file_id,))
            
            row = cursor.fetchone()
            return dict(row) if row else None
    
    def store_document_processing(self, document_id: int, processing_result: Dict[str, Any]) -> int:
        """Store document processing results."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            document_type = processing_result.get('document_type', '')
            total_pages = processing_result.get('total_pages', 0)
            sections = processing_result.get('sections', {})
            tables = processing_result.get('tables', [])
            
            # Calculate word count from sections
            word_count = sum(section.get('word_count', 0) for section in sections.values())
            
            cursor.execute("""
                INSERT INTO document_processing 
                (document_id, document_type, total_pages, total_sections, total_tables, word_count, processing_data)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                document_id, document_type, total_pages, len(sections), 
                len(tables), word_count, json.dumps(processing_result)
            ))
            
            processing_id = cursor.lastrowid
            
            # Mark document as processed
            cursor.execute("""
                UPDATE documents SET processed = TRUE WHERE id = ?
            """, (document_id,))
            
            conn.commit()
            return processing_id
    
    def store_evaluation(self, document_id: int, agency: str, evaluation_result: Dict[str, Any],
                        scoring_result: Dict[str, Any], comments_result: Dict[str, Any],
                        worksheet_result: Dict[str, Any]) -> int:
        """Store complete evaluation results."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            overall_score = scoring_result.get('overall_score', 0)
            overall_rating = scoring_result.get('overall_rating', '')
            recommendation = scoring_result.get('recommendation', '')
            
            cursor.execute("""
                INSERT INTO evaluations 
                (document_id, agency, overall_score, overall_rating, recommendation, 
                 evaluation_data, scoring_data, comments_data, worksheet_data)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                document_id, agency, overall_score, overall_rating, recommendation,
                json.dumps(evaluation_result), json.dumps(scoring_result),
                json.dumps(comments_result), json.dumps(worksheet_result)
            ))
            
            evaluation_id = cursor.lastrowid
            conn.commit()
            return evaluation_id
    
    def get_evaluation(self, document_id: int) -> Optional[Dict[str, Any]]:
        """Retrieve evaluation results for a document."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT * FROM evaluations WHERE document_id = ? ORDER BY evaluation_date DESC LIMIT 1
            """, (document_id,))
            
            row = cursor.fetchone()
            if not row:
                return None
            
            result = dict(row)
            
            # Parse JSON data
            try:
                result['evaluation_data'] = json.loads(result['evaluation_data']) if result['evaluation_data'] else {}
                result['scoring_data'] = json.loads(result['scoring_data']) if result['scoring_data'] else {}
                result['comments_data'] = json.loads(result['comments_data']) if result['comments_data'] else {}
                result['worksheet_data'] = json.loads(result['worksheet_data']) if result['worksheet_data'] else {}
            except json.JSONDecodeError as e:
                self.logger.error(f"Error parsing JSON data: {e}")
            
            return result
    
    def get_document_with_evaluation(self, file_id: str) -> Optional[Dict[str, Any]]:
        """Get document metadata along with its evaluation results."""
        document = self.get_document(file_id)
        if not document:
            return None
        
        evaluation = self.get_evaluation(document['id'])
        processing = self.get_document_processing(document['id'])
        
        return {
            'document': document,
            'evaluation': evaluation,
            'processing': processing
        }
    
    def get_document_processing(self, document_id: int) -> Optional[Dict[str, Any]]:
        """Retrieve document processing results."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT * FROM document_processing WHERE document_id = ? ORDER BY processing_date DESC LIMIT 1
            """, (document_id,))
            
            row = cursor.fetchone()
            if not row:
                return None
            
            result = dict(row)
            
            # Parse JSON data
            try:
                result['processing_data'] = json.loads(result['processing_data']) if result['processing_data'] else {}
            except json.JSONDecodeError as e:
                self.logger.error(f"Error parsing processing data: {e}")
            
            return result
    
    def list_documents(self, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        """List all documents with basic metadata."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT d.*, 
                       dp.total_pages, dp.word_count,
                       e.overall_score, e.overall_rating, e.recommendation
                FROM documents d
                LEFT JOIN document_processing dp ON d.id = dp.document_id
                LEFT JOIN evaluations e ON d.id = e.document_id
                ORDER BY d.upload_date DESC
                LIMIT ? OFFSET ?
            """, (limit, offset))
            
            return [dict(row) for row in cursor.fetchall()]
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get system statistics."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Total documents
            cursor.execute("SELECT COUNT(*) FROM documents")
            total_documents = cursor.fetchone()[0]
            
            # Processed documents
            cursor.execute("SELECT COUNT(*) FROM documents WHERE processed = TRUE")
            processed_documents = cursor.fetchone()[0]
            
            # Total evaluations
            cursor.execute("SELECT COUNT(*) FROM evaluations")
            total_evaluations = cursor.fetchone()[0]
            
            # Average score
            cursor.execute("SELECT AVG(overall_score) FROM evaluations WHERE overall_score IS NOT NULL")
            avg_score = cursor.fetchone()[0] or 0
            
            # Documents by agency
            cursor.execute("""
                SELECT agency, COUNT(*) as count 
                FROM documents 
                GROUP BY agency
            """)
            agency_stats = {row[0]: row[1] for row in cursor.fetchall()}
            
            return {
                'total_documents': total_documents,
                'processed_documents': processed_documents,
                'total_evaluations': total_evaluations,
                'average_score': round(avg_score, 1),
                'agency_distribution': agency_stats,
                'processing_rate': round((processed_documents / total_documents * 100), 1) if total_documents > 0 else 0
            }
    
    def cleanup_old_data(self, days_old: int = 30):
        """Clean up old data (documents and evaluations older than specified days)."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # Delete old evaluations
            cursor.execute("""
                DELETE FROM evaluations 
                WHERE evaluation_date < datetime('now', '-{} days')
            """.format(days_old))
            
            # Delete old document processing records
            cursor.execute("""
                DELETE FROM document_processing 
                WHERE processing_date < datetime('now', '-{} days')
            """.format(days_old))
            
            # Delete old documents (and their files)
            cursor.execute("""
                SELECT file_path FROM documents 
                WHERE upload_date < datetime('now', '-{} days')
            """.format(days_old))
            
            old_files = cursor.fetchall()
            
            # Remove physical files
            for (file_path,) in old_files:
                try:
                    Path(file_path).unlink(missing_ok=True)
                except Exception as e:
                    self.logger.error(f"Error deleting file {file_path}: {e}")
            
            # Delete database records
            cursor.execute("""
                DELETE FROM documents 
                WHERE upload_date < datetime('now', '-{} days')
            """.format(days_old))
            
            conn.commit()
            
            return {
                'files_deleted': len(old_files),
                'cleanup_date': datetime.now().isoformat()
            }