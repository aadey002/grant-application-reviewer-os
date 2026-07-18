"""
Database Manager for Grant Reviewer Application

Handles SQLite database operations for document metadata, evaluations,
folder organization, and search indexing.
"""

import sqlite3
import json
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Any
from pathlib import Path

class DatabaseManager:
    """Manages SQLite database operations."""
    
    def __init__(self, db_path: str = '/workspace/grant-reviewer-app/backend/data/grant_reviewer.db'):
        self.db_path = db_path
        # Ensure data directory exists
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    
    def get_connection(self):
        """Get database connection with row factory."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn
    
    def initialize_database(self):
        """Initialize database with required tables."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            # Folders table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS folders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    parent_id INTEGER,
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (parent_id) REFERENCES folders (id)
                )
            ''')
            
            # Documents table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS documents (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    filename TEXT NOT NULL,
                    original_filename TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    file_size INTEGER,
                    folder_id INTEGER,
                    agency TEXT DEFAULT 'HRSA',
                    document_type TEXT DEFAULT 'application',
                    description TEXT,
                    tags TEXT,
                    status TEXT DEFAULT 'uploaded',
                    processed_content TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (folder_id) REFERENCES folders (id)
                )
            ''')
            
            # Evaluations table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS evaluations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    document_id INTEGER NOT NULL,
                    nofo_document_id INTEGER,
                    evaluation_type TEXT NOT NULL,
                    status TEXT DEFAULT 'pending',
                    results TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (document_id) REFERENCES documents (id),
                    FOREIGN KEY (nofo_document_id) REFERENCES documents (id)
                )
            ''')
            
            # Search index table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS search_index (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    document_id INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    section_name TEXT,
                    page_number INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (document_id) REFERENCES documents (id)
                )
            ''')
            
            # Create indexes for better performance
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_documents_agency ON documents(agency)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_evaluations_document ON evaluations(document_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_search_document ON search_index(document_id)')
            
            conn.commit()
    
    # Folder Management
    def create_folder(self, name: str, parent_id: Optional[int] = None, 
                     description: str = '') -> int:
        """Create a new folder."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO folders (name, parent_id, description)
                VALUES (?, ?, ?)
            ''', (name, parent_id, description))
            conn.commit()
            return cursor.lastrowid
    
    def get_folder(self, folder_id: int) -> Optional[Dict[str, Any]]:
        """Get folder by ID."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM folders WHERE id = ?', (folder_id,))
            row = cursor.fetchone()
            return dict(row) if row else None
    
    def get_all_folders(self) -> List[Dict[str, Any]]:
        """Get all folders with hierarchy."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT f.*, COUNT(d.id) as document_count
                FROM folders f
                LEFT JOIN documents d ON f.id = d.folder_id
                GROUP BY f.id
                ORDER BY f.parent_id, f.name
            ''')
            folders = [dict(row) for row in cursor.fetchall()]
            
            # Build hierarchy
            folder_map = {f['id']: f for f in folders}
            root_folders = []
            
            for folder in folders:
                folder['children'] = []
                if folder['parent_id'] is None:
                    root_folders.append(folder)
                else:
                    parent = folder_map.get(folder['parent_id'])
                    if parent:
                        parent['children'].append(folder)
            
            return root_folders
    
    def update_folder(self, folder_id: int, name: Optional[str] = None, 
                     description: Optional[str] = None):
        """Update folder details."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            updates = []
            values = []
            
            if name is not None:
                updates.append('name = ?')
                values.append(name)
            
            if description is not None:
                updates.append('description = ?')
                values.append(description)
            
            updates.append('updated_at = CURRENT_TIMESTAMP')
            values.append(folder_id)
            
            cursor.execute(f'''
                UPDATE folders 
                SET {', '.join(updates)}
                WHERE id = ?
            ''', values)
            conn.commit()
    
    def delete_folder(self, folder_id: int, force: bool = False):
        """Delete folder and optionally its contents."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            # Check if folder has documents
            cursor.execute('SELECT COUNT(*) FROM documents WHERE folder_id = ?', (folder_id,))
            doc_count = cursor.fetchone()[0]
            
            if doc_count > 0 and not force:
                raise ValueError('Folder contains documents. Use force=True to delete.')
            
            # Delete documents if force is True
            if force:
                cursor.execute('DELETE FROM documents WHERE folder_id = ?', (folder_id,))
            
            # Delete folder
            cursor.execute('DELETE FROM folders WHERE id = ?', (folder_id,))
            conn.commit()
    
    # Document Management
    def create_document(self, filename: str, original_filename: str, 
                       file_path: str, file_size: int, folder_id: Optional[int] = None,
                       agency: str = 'HRSA', document_type: str = 'application',
                       description: str = '', processed_content: Optional[Dict] = None) -> int:
        """Create a new document record."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO documents (
                    filename, original_filename, file_path, file_size, folder_id,
                    agency, document_type, description, processed_content
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                filename, original_filename, file_path, file_size, folder_id,
                agency, document_type, description, 
                json.dumps(processed_content) if processed_content else None
            ))
            conn.commit()
            return cursor.lastrowid
    
    def get_document(self, document_id: int) -> Optional[Dict[str, Any]]:
        """Get document by ID."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT d.*, f.name as folder_name
                FROM documents d
                LEFT JOIN folders f ON d.folder_id = f.id
                WHERE d.id = ?
            ''', (document_id,))
            row = cursor.fetchone()
            if row:
                doc = dict(row)
                if doc['processed_content']:
                    doc['processed_content'] = json.loads(doc['processed_content'])
                return doc
            return None
    
    def get_documents(self, folder_id: Optional[int] = None, agency: Optional[str] = None,
                     status: Optional[str] = None, search_query: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get documents with optional filtering."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            query = '''
                SELECT d.*, f.name as folder_name
                FROM documents d
                LEFT JOIN folders f ON d.folder_id = f.id
                WHERE 1=1
            '''
            params = []
            
            if folder_id is not None:
                query += ' AND d.folder_id = ?'
                params.append(folder_id)
            
            if agency:
                query += ' AND d.agency = ?'
                params.append(agency)
            
            if status:
                query += ' AND d.status = ?'
                params.append(status)
            
            if search_query:
                query += ' AND (d.original_filename LIKE ? OR d.description LIKE ?)'
                params.extend([f'%{search_query}%', f'%{search_query}%'])
            
            query += ' ORDER BY d.created_at DESC'
            
            cursor.execute(query, params)
            documents = []
            for row in cursor.fetchall():
                doc = dict(row)
                if doc['processed_content']:
                    try:
                        doc['processed_content'] = json.loads(doc['processed_content'])
                    except:
                        doc['processed_content'] = None
                documents.append(doc)
            
            return documents
    
    def update_document(self, document_id: int, **kwargs):
        """Update document metadata."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            allowed_fields = ['folder_id', 'agency', 'document_type', 'description', 'tags', 'status']
            updates = []
            values = []
            
            for field, value in kwargs.items():
                if field in allowed_fields and value is not None:
                    updates.append(f'{field} = ?')
                    values.append(value)
            
            if updates:
                updates.append('updated_at = CURRENT_TIMESTAMP')
                values.append(document_id)
                
                cursor.execute(f'''
                    UPDATE documents 
                    SET {', '.join(updates)}
                    WHERE id = ?
                ''', values)
                conn.commit()
    
    def delete_document(self, document_id: int):
        """Delete document record."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            # Delete related records first
            cursor.execute('DELETE FROM search_index WHERE document_id = ?', (document_id,))
            cursor.execute('DELETE FROM evaluations WHERE document_id = ? OR nofo_document_id = ?', (document_id, document_id))
            cursor.execute('DELETE FROM documents WHERE id = ?', (document_id,))
            conn.commit()
    
    # Evaluation Management
    def create_evaluation(self, document_id: int, evaluation_type: str,
                         nofo_document_id: Optional[int] = None, status: str = 'pending') -> int:
        """Create a new evaluation."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO evaluations (document_id, nofo_document_id, evaluation_type, status)
                VALUES (?, ?, ?, ?)
            ''', (document_id, nofo_document_id, evaluation_type, status))
            conn.commit()
            return cursor.lastrowid
    
    def get_evaluation(self, evaluation_id: int) -> Optional[Dict[str, Any]]:
        """Get evaluation by ID."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT e.*, d.original_filename as document_name,
                       nd.original_filename as nofo_document_name
                FROM evaluations e
                JOIN documents d ON e.document_id = d.id
                LEFT JOIN documents nd ON e.nofo_document_id = nd.id
                WHERE e.id = ?
            ''', (evaluation_id,))
            row = cursor.fetchone()
            if row:
                eval_data = dict(row)
                if eval_data['results']:
                    try:
                        eval_data['results'] = json.loads(eval_data['results'])
                    except:
                        eval_data['results'] = None
                return eval_data
            return None
    
    def get_evaluations(self, document_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get evaluations with optional filtering."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            query = '''
                SELECT e.*, d.original_filename as document_name,
                       nd.original_filename as nofo_document_name
                FROM evaluations e
                JOIN documents d ON e.document_id = d.id
                LEFT JOIN documents nd ON e.nofo_document_id = nd.id
            '''
            params = []
            
            if document_id is not None:
                query += ' WHERE e.document_id = ?'
                params.append(document_id)
            
            query += ' ORDER BY e.created_at DESC'
            
            cursor.execute(query, params)
            evaluations = []
            for row in cursor.fetchall():
                eval_data = dict(row)
                if eval_data['results']:
                    try:
                        eval_data['results'] = json.loads(eval_data['results'])
                    except:
                        eval_data['results'] = None
                evaluations.append(eval_data)
            
            return evaluations
    
    def update_evaluation(self, evaluation_id: int, status: Optional[str] = None,
                         results: Optional[Dict] = None):
        """Update evaluation status and results."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            updates = ['updated_at = CURRENT_TIMESTAMP']
            values = []
            
            if status is not None:
                updates.append('status = ?')
                values.append(status)
            
            if results is not None:
                updates.append('results = ?')
                values.append(json.dumps(results))
            
            values.append(evaluation_id)
            
            cursor.execute(f'''
                UPDATE evaluations 
                SET {', '.join(updates)}
                WHERE id = ?
            ''', values)
            conn.commit()
    
    # Statistics and Counts
    def count_documents(self) -> int:
        """Count total documents."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT COUNT(*) FROM documents')
            return cursor.fetchone()[0]
    
    def count_evaluations(self) -> int:
        """Count total evaluations."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT COUNT(*) FROM evaluations')
            return cursor.fetchone()[0]
    
    def count_folders(self) -> int:
        """Count total folders."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT COUNT(*) FROM folders')
            return cursor.fetchone()[0]
    
    def get_documents_by_agency(self) -> Dict[str, int]:
        """Get document count by agency."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT agency, COUNT(*) as count
                FROM documents
                GROUP BY agency
            ''')
            return {row['agency']: row['count'] for row in cursor.fetchall()}
    
    def get_documents_by_status(self) -> Dict[str, int]:
        """Get document count by status."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT status, COUNT(*) as count
                FROM documents
                GROUP BY status
            ''')
            return {row['status']: row['count'] for row in cursor.fetchall()}
    
    def get_recent_activity(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent activity across the system."""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT 'document' as type, original_filename as name, created_at as timestamp
                FROM documents
                UNION ALL
                SELECT 'evaluation' as type, 'Evaluation ' || id as name, created_at as timestamp
                FROM evaluations
                ORDER BY timestamp DESC
                LIMIT ?
            ''', (limit,))
            return [dict(row) for row in cursor.fetchall()]
