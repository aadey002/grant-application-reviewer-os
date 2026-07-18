"""
Search Engine for Grant Reviewer Application

Provides full-text search capabilities across documents, metadata,
and evaluation results using SQLite FTS (Full-Text Search).
"""

import sqlite3
import json
import re
from typing import Dict, List, Optional, Any
from database import DatabaseManager

class SearchEngine:
    """Full-text search engine for grant documents and evaluations."""
    
    def __init__(self, db_manager: DatabaseManager):
        self.db_manager = db_manager
        self.initialize_search_tables()
    
    def initialize_search_tables(self):
        """Initialize FTS tables for search functionality."""
        with self.db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            # Create FTS5 table for document content search
            cursor.execute('''
                CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
                    document_id UNINDEXED,
                    filename,
                    original_filename,
                    description,
                    content,
                    sections,
                    agency,
                    document_type,
                    tags
                )
            ''')
            
            # Create FTS5 table for evaluation results search
            cursor.execute('''
                CREATE VIRTUAL TABLE IF NOT EXISTS evaluations_fts USING fts5(
                    evaluation_id UNINDEXED,
                    document_id UNINDEXED,
                    evaluation_type,
                    results_content,
                    comments,
                    strengths,
                    weaknesses
                )
            ''')
            
            conn.commit()
    
    def index_document(self, document_id: int, processed_content: Dict[str, Any]):
        """Index a document for full-text search."""
        try:
            # Get document metadata
            document = self.db_manager.get_document(document_id)
            if not document:
                return
            
            # Extract searchable content
            content_text = processed_content.get('text_content', '')
            sections_text = self._extract_sections_text(processed_content.get('sections', {}))
            
            with self.db_manager.get_connection() as conn:
                cursor = conn.cursor()
                
                # Remove existing entry if it exists
                cursor.execute('DELETE FROM documents_fts WHERE document_id = ?', (document_id,))
                
                # Insert new entry
                cursor.execute('''
                    INSERT INTO documents_fts (
                        document_id, filename, original_filename, description,
                        content, sections, agency, document_type, tags
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    document_id,
                    document.get('filename', ''),
                    document.get('original_filename', ''),
                    document.get('description', ''),
                    content_text,
                    sections_text,
                    document.get('agency', ''),
                    document.get('document_type', ''),
                    document.get('tags', '')
                ))
                
                conn.commit()
                
        except Exception as e:
            print(f"Error indexing document {document_id}: {e}")
    
    def index_evaluation(self, evaluation_id: int, evaluation_results: Dict[str, Any]):
        """Index evaluation results for search."""
        try:
            # Get evaluation metadata
            evaluation = self.db_manager.get_evaluation(evaluation_id)
            if not evaluation:
                return
            
            # Extract searchable content from results
            results_content = self._extract_evaluation_content(evaluation_results)
            comments = self._extract_comments(evaluation_results)
            strengths = self._extract_strengths(evaluation_results)
            weaknesses = self._extract_weaknesses(evaluation_results)
            
            with self.db_manager.get_connection() as conn:
                cursor = conn.cursor()
                
                # Remove existing entry if it exists
                cursor.execute('DELETE FROM evaluations_fts WHERE evaluation_id = ?', (evaluation_id,))
                
                # Insert new entry
                cursor.execute('''
                    INSERT INTO evaluations_fts (
                        evaluation_id, document_id, evaluation_type,
                        results_content, comments, strengths, weaknesses
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (
                    evaluation_id,
                    evaluation.get('document_id'),
                    evaluation.get('evaluation_type', ''),
                    results_content,
                    comments,
                    strengths,
                    weaknesses
                ))
                
                conn.commit()
                
        except Exception as e:
            print(f"Error indexing evaluation {evaluation_id}: {e}")
    
    def search(self, query: str, agency: Optional[str] = None,
              document_type: Optional[str] = None, folder_id: Optional[int] = None,
              search_type: str = 'documents', limit: int = 50) -> List[Dict[str, Any]]:
        """Perform full-text search across documents and evaluations."""
        if not query.strip():
            return []
        
        if search_type == 'documents':
            return self._search_documents(query, agency, document_type, folder_id, limit)
        elif search_type == 'evaluations':
            return self._search_evaluations(query, limit)
        else:
            # Combined search
            doc_results = self._search_documents(query, agency, document_type, folder_id, limit//2)
            eval_results = self._search_evaluations(query, limit//2)
            return doc_results + eval_results
    
    def _search_documents(self, query: str, agency: Optional[str] = None,
                         document_type: Optional[str] = None, folder_id: Optional[int] = None,
                         limit: int = 50) -> List[Dict[str, Any]]:
        """Search within documents."""
        with self.db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            # Build FTS query
            fts_query = self._build_fts_query(query)
            
            # Base search query
            search_query = '''
                SELECT 
                    d.id, d.original_filename, d.description, d.agency, d.document_type,
                    d.created_at, f.name as folder_name, fts.rank,
                    snippet(documents_fts, 4, '<mark>', '</mark>', '...', 64) as snippet
                FROM documents_fts fts
                JOIN documents d ON fts.document_id = d.id
                LEFT JOIN folders f ON d.folder_id = f.id
                WHERE documents_fts MATCH ?
            '''
            
            params = [fts_query]
            
            # Add filters
            if agency:
                search_query += ' AND d.agency = ?'
                params.append(agency)
            
            if document_type:
                search_query += ' AND d.document_type = ?'
                params.append(document_type)
            
            if folder_id:
                search_query += ' AND d.folder_id = ?'
                params.append(folder_id)
            
            search_query += ' ORDER BY fts.rank LIMIT ?'
            params.append(limit)
            
            try:
                cursor.execute(search_query, params)
                results = []
                
                for row in cursor.fetchall():
                    result = dict(row)
                    result['search_type'] = 'document'
                    result['relevance_score'] = abs(result['rank'])  # FTS5 rank is negative
                    results.append(result)
                
                return results
                
            except sqlite3.OperationalError as e:
                # Fallback to simple LIKE search if FTS fails
                return self._fallback_document_search(query, agency, document_type, folder_id, limit)
    
    def _search_evaluations(self, query: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Search within evaluation results."""
        with self.db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            # Build FTS query
            fts_query = self._build_fts_query(query)
            
            search_query = '''
                SELECT 
                    e.id, e.evaluation_type, e.created_at, d.original_filename,
                    fts.rank, snippet(evaluations_fts, 3, '<mark>', '</mark>', '...', 64) as snippet
                FROM evaluations_fts fts
                JOIN evaluations e ON fts.evaluation_id = e.id
                JOIN documents d ON e.document_id = d.id
                WHERE evaluations_fts MATCH ?
                ORDER BY fts.rank
                LIMIT ?
            '''
            
            try:
                cursor.execute(search_query, [fts_query, limit])
                results = []
                
                for row in cursor.fetchall():
                    result = dict(row)
                    result['search_type'] = 'evaluation'
                    result['relevance_score'] = abs(result['rank'])
                    results.append(result)
                
                return results
                
            except sqlite3.OperationalError:
                # Fallback to simple search if FTS fails
                return self._fallback_evaluation_search(query, limit)
    
    def _build_fts_query(self, query: str) -> str:
        """Build FTS5 query from user input."""
        # Clean and prepare query
        query = re.sub(r'[^\w\s"-]', ' ', query)
        terms = query.strip().split()
        
        if not terms:
            return '""'
        
        # Build FTS query with OR logic for multiple terms
        if len(terms) == 1:
            return f'"{terms[0]}"*'
        else:
            # Use phrase search for multi-word queries
            return f'"{" ".join(terms)}"'
    
    def _extract_sections_text(self, sections: Dict[str, Any]) -> str:
        """Extract text content from document sections."""
        text_parts = []
        for section_name, section_data in sections.items():
            if isinstance(section_data, dict):
                content = section_data.get('content', '')
                text_parts.append(f"{section_name}: {content}")
            else:
                text_parts.append(str(section_data))
        
        return ' '.join(text_parts)
    
    def _extract_evaluation_content(self, evaluation_results: Dict[str, Any]) -> str:
        """Extract searchable content from evaluation results."""
        content_parts = []
        
        # Extract from various result sections
        for key in ['summary', 'overall_assessment', 'recommendations', 'analysis']:
            if key in evaluation_results:
                content_parts.append(str(evaluation_results[key]))
        
        return ' '.join(content_parts)
    
    def _extract_comments(self, evaluation_results: Dict[str, Any]) -> str:
        """Extract comments from evaluation results."""
        comments = []
        
        # Look for comment sections
        comment_keys = ['comments', 'reviewer_comments', 'feedback']
        for key in comment_keys:
            if key in evaluation_results:
                if isinstance(evaluation_results[key], dict):
                    for comment_type, comment_text in evaluation_results[key].items():
                        comments.append(str(comment_text))
                else:
                    comments.append(str(evaluation_results[key]))
        
        return ' '.join(comments)
    
    def _extract_strengths(self, evaluation_results: Dict[str, Any]) -> str:
        """Extract strengths from evaluation results."""
        strengths = evaluation_results.get('strengths', [])
        if isinstance(strengths, list):
            return ' '.join(str(s) for s in strengths)
        return str(strengths)
    
    def _extract_weaknesses(self, evaluation_results: Dict[str, Any]) -> str:
        """Extract weaknesses from evaluation results."""
        weaknesses = evaluation_results.get('weaknesses', [])
        if isinstance(weaknesses, list):
            return ' '.join(str(w) for w in weaknesses)
        return str(weaknesses)
    
    def _fallback_document_search(self, query: str, agency: Optional[str] = None,
                                 document_type: Optional[str] = None, 
                                 folder_id: Optional[int] = None,
                                 limit: int = 50) -> List[Dict[str, Any]]:
        """Fallback search using LIKE when FTS fails."""
        with self.db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            search_query = '''
                SELECT 
                    d.id, d.original_filename, d.description, d.agency, d.document_type,
                    d.created_at, f.name as folder_name
                FROM documents d
                LEFT JOIN folders f ON d.folder_id = f.id
                WHERE (d.original_filename LIKE ? OR d.description LIKE ?)
            '''
            
            like_query = f'%{query}%'
            params = [like_query, like_query]
            
            if agency:
                search_query += ' AND d.agency = ?'
                params.append(agency)
            
            if document_type:
                search_query += ' AND d.document_type = ?'
                params.append(document_type)
            
            if folder_id:
                search_query += ' AND d.folder_id = ?'
                params.append(folder_id)
            
            search_query += ' ORDER BY d.created_at DESC LIMIT ?'
            params.append(limit)
            
            cursor.execute(search_query, params)
            results = []
            
            for row in cursor.fetchall():
                result = dict(row)
                result['search_type'] = 'document'
                result['relevance_score'] = 1.0  # Default relevance
                result['snippet'] = result.get('description', '')[:100] + '...'
                results.append(result)
            
            return results
    
    def _fallback_evaluation_search(self, query: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Fallback evaluation search using LIKE."""
        with self.db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            search_query = '''
                SELECT 
                    e.id, e.evaluation_type, e.created_at, d.original_filename
                FROM evaluations e
                JOIN documents d ON e.document_id = d.id
                WHERE e.results LIKE ?
                ORDER BY e.created_at DESC
                LIMIT ?
            '''
            
            cursor.execute(search_query, [f'%{query}%', limit])
            results = []
            
            for row in cursor.fetchall():
                result = dict(row)
                result['search_type'] = 'evaluation'
                result['relevance_score'] = 1.0
                result['snippet'] = f"Evaluation of {result['original_filename']}"
                results.append(result)
            
            return results
    
    def remove_document(self, document_id: int):
        """Remove document from search index."""
        with self.db_manager.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM documents_fts WHERE document_id = ?', (document_id,))
            conn.commit()
    
    def remove_evaluation(self, evaluation_id: int):
        """Remove evaluation from search index."""
        with self.db_manager.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM evaluations_fts WHERE evaluation_id = ?', (evaluation_id,))
            conn.commit()
    
    def get_search_suggestions(self, partial_query: str, limit: int = 10) -> List[str]:
        """Get search suggestions based on partial query."""
        suggestions = []
        
        if len(partial_query) < 2:
            return suggestions
        
        with self.db_manager.get_connection() as conn:
            cursor = conn.cursor()
            
            # Get suggestions from document filenames and descriptions
            cursor.execute('''
                SELECT DISTINCT original_filename
                FROM documents
                WHERE original_filename LIKE ?
                ORDER BY original_filename
                LIMIT ?
            ''', (f'%{partial_query}%', limit//2))
            
            for row in cursor.fetchall():
                suggestions.append(row[0])
            
            # Get suggestions from agencies
            cursor.execute('''
                SELECT DISTINCT agency
                FROM documents
                WHERE agency LIKE ?
                ORDER BY agency
                LIMIT ?
            ''', (f'%{partial_query}%', limit//2))
            
            for row in cursor.fetchall():
                if row[0] not in suggestions:
                    suggestions.append(row[0])
        
        return suggestions[:limit]
