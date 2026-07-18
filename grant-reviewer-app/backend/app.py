#!/usr/bin/env python3
"""
Grant Reviewer Web Application Backend

Flask API server that integrates with the Grant Reviewing MCP Agent.
Provides document management, evaluation workflows, and search capabilities.
"""

import os
import sys
import json
import uuid
import shutil
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename
from werkzeug.exceptions import RequestEntityTooLarge

# Add grant-reviewer-mcp to Python path
sys.path.insert(0, '/workspace/grant-reviewer-mcp/src')

from database import DatabaseManager
from file_manager import FileManager
from mcp_integration import MCPIntegration
from search_engine import SearchEngine

# Initialize Flask app
app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max file size
CORS(app)  # Enable CORS for frontend communication

# Initialize core components
db_manager = DatabaseManager()
file_manager = FileManager()
mcp_integration = MCPIntegration()
search_engine = SearchEngine(db_manager)

# Allowed file extensions
ALLOWED_EXTENSIONS = {'.pdf', '.doc', '.docx'}

def allowed_file(filename):
    """Check if file extension is allowed."""
    return Path(filename).suffix.lower() in ALLOWED_EXTENSIONS

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'version': '1.0.0'
    })

# Folder Management Endpoints
@app.route('/api/folders', methods=['GET'])
def get_folders():
    """Get all folders and their contents."""
    try:
        folders = db_manager.get_all_folders()
        return jsonify({'folders': folders})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/folders', methods=['POST'])
def create_folder():
    """Create a new folder."""
    try:
        data = request.get_json()
        name = data.get('name')
        parent_id = data.get('parent_id')
        description = data.get('description', '')
        
        if not name:
            return jsonify({'error': 'Folder name is required'}), 400
        
        folder_id = db_manager.create_folder(name, parent_id, description)
        folder = db_manager.get_folder(folder_id)
        
        return jsonify({'folder': folder})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/folders/<int:folder_id>', methods=['PUT'])
def update_folder(folder_id):
    """Update folder details."""
    try:
        data = request.get_json()
        name = data.get('name')
        description = data.get('description')
        
        db_manager.update_folder(folder_id, name, description)
        folder = db_manager.get_folder(folder_id)
        
        return jsonify({'folder': folder})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/folders/<int:folder_id>', methods=['DELETE'])
def delete_folder(folder_id):
    """Delete a folder and optionally its contents."""
    try:
        force = request.args.get('force', 'false').lower() == 'true'
        db_manager.delete_folder(folder_id, force)
        
        return jsonify({'message': 'Folder deleted successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Document Management Endpoints
@app.route('/api/documents', methods=['GET'])
def get_documents():
    """Get all documents with optional filtering."""
    try:
        folder_id = request.args.get('folder_id', type=int)
        agency = request.args.get('agency')
        status = request.args.get('status')
        search_query = request.args.get('search')
        
        documents = db_manager.get_documents(
            folder_id=folder_id,
            agency=agency,
            status=status,
            search_query=search_query
        )
        
        return jsonify({'documents': documents})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/documents/upload', methods=['POST'])
def upload_document():
    """Upload a new document."""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        folder_id = request.form.get('folder_id', type=int)
        agency = request.form.get('agency', 'HRSA')
        document_type = request.form.get('document_type', 'application')
        description = request.form.get('description', '')
        
        if not file or file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'File type not allowed'}), 400
        
        # Save file
        file_info = file_manager.save_uploaded_file(file, folder_id)
        
        # Process document with MCP Agent
        try:
            processed_content = mcp_integration.process_document(file_info['file_path'])
        except Exception as e:
            # If MCP processing fails, still save the document
            processed_content = {'error': f'Processing failed: {str(e)}'}
        
        # Save document metadata to database
        document_id = db_manager.create_document(
            filename=file_info['filename'],
            original_filename=file.filename,
            file_path=file_info['file_path'],
            file_size=file_info['file_size'],
            folder_id=folder_id,
            agency=agency,
            document_type=document_type,
            description=description,
            processed_content=processed_content
        )
        
        # Index document for search
        search_engine.index_document(document_id, processed_content)
        
        document = db_manager.get_document(document_id)
        return jsonify({'document': document})
        
    except RequestEntityTooLarge:
        return jsonify({'error': 'File too large'}), 413
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/documents/<int:document_id>', methods=['GET'])
def get_document(document_id):
    """Get document details."""
    try:
        document = db_manager.get_document(document_id)
        if not document:
            return jsonify({'error': 'Document not found'}), 404
        
        return jsonify({'document': document})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/documents/<int:document_id>/download', methods=['GET'])
def download_document(document_id):
    """Download document file."""
    try:
        document = db_manager.get_document(document_id)
        if not document:
            return jsonify({'error': 'Document not found'}), 404
        
        file_path = document['file_path']
        if not os.path.exists(file_path):
            return jsonify({'error': 'File not found on disk'}), 404
        
        return send_file(
            file_path,
            as_attachment=True,
            download_name=document['original_filename']
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/documents/<int:document_id>', methods=['PUT'])
def update_document(document_id):
    """Update document metadata."""
    try:
        data = request.get_json()
        
        db_manager.update_document(
            document_id,
            folder_id=data.get('folder_id'),
            agency=data.get('agency'),
            document_type=data.get('document_type'),
            description=data.get('description'),
            tags=data.get('tags'),
            status=data.get('status')
        )
        
        document = db_manager.get_document(document_id)
        return jsonify({'document': document})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/documents/<int:document_id>', methods=['DELETE'])
def delete_document(document_id):
    """Delete a document."""
    try:
        document = db_manager.get_document(document_id)
        if not document:
            return jsonify({'error': 'Document not found'}), 404
        
        # Delete file from disk
        if os.path.exists(document['file_path']):
            os.remove(document['file_path'])
        
        # Remove from search index
        search_engine.remove_document(document_id)
        
        # Delete from database
        db_manager.delete_document(document_id)
        
        return jsonify({'message': 'Document deleted successfully'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Evaluation Endpoints
@app.route('/api/evaluations', methods=['GET'])
def get_evaluations():
    """Get all evaluations."""
    try:
        document_id = request.args.get('document_id', type=int)
        evaluations = db_manager.get_evaluations(document_id)
        
        return jsonify({'evaluations': evaluations})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/evaluations', methods=['POST'])
def create_evaluation():
    """Start a new evaluation."""
    try:
        data = request.get_json()
        document_id = data.get('document_id')
        nofo_document_id = data.get('nofo_document_id')
        evaluation_type = data.get('evaluation_type', 'comprehensive')
        
        if not document_id:
            return jsonify({'error': 'Document ID is required'}), 400
        
        # Get document details
        document = db_manager.get_document(document_id)
        if not document:
            return jsonify({'error': 'Document not found'}), 404
        
        nofo_document = None
        if nofo_document_id:
            nofo_document = db_manager.get_document(nofo_document_id)
        
        # Create evaluation record
        evaluation_id = db_manager.create_evaluation(
            document_id=document_id,
            nofo_document_id=nofo_document_id,
            evaluation_type=evaluation_type,
            status='in_progress'
        )
        
        # Start evaluation process asynchronously (simplified for now)
        try:
            if evaluation_type == 'comprehensive':
                result = mcp_integration.evaluate_comprehensive(
                    document['file_path'],
                    nofo_document['file_path'] if nofo_document else None,
                    document.get('agency', 'HRSA')
                )
            elif evaluation_type == 'scoring':
                result = mcp_integration.score_application(
                    document['file_path'],
                    nofo_document['file_path'] if nofo_document else None,
                    document.get('agency', 'HRSA')
                )
            else:
                result = {'error': 'Unknown evaluation type'}
            
            # Update evaluation with results
            db_manager.update_evaluation(
                evaluation_id,
                status='completed',
                results=result
            )
            
        except Exception as e:
            db_manager.update_evaluation(
                evaluation_id,
                status='failed',
                results={'error': str(e)}
            )
        
        evaluation = db_manager.get_evaluation(evaluation_id)
        return jsonify({'evaluation': evaluation})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/evaluations/<int:evaluation_id>', methods=['GET'])
def get_evaluation(evaluation_id):
    """Get evaluation details."""
    try:
        evaluation = db_manager.get_evaluation(evaluation_id)
        if not evaluation:
            return jsonify({'error': 'Evaluation not found'}), 404
        
        return jsonify({'evaluation': evaluation})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Search Endpoints
@app.route('/api/search', methods=['GET'])
def search_documents():
    """Search documents by content and metadata."""
    try:
        query = request.args.get('q', '')
        agency = request.args.get('agency')
        document_type = request.args.get('document_type')
        folder_id = request.args.get('folder_id', type=int)
        
        results = search_engine.search(
            query=query,
            agency=agency,
            document_type=document_type,
            folder_id=folder_id
        )
        
        return jsonify({'results': results})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Statistics and Dashboard Endpoints
@app.route('/api/stats', methods=['GET'])
def get_statistics():
    """Get application statistics for dashboard."""
    try:
        stats = {
            'total_documents': db_manager.count_documents(),
            'total_evaluations': db_manager.count_evaluations(),
            'total_folders': db_manager.count_folders(),
            'documents_by_agency': db_manager.get_documents_by_agency(),
            'documents_by_status': db_manager.get_documents_by_status(),
            'recent_activity': db_manager.get_recent_activity(limit=10)
        }
        
        return jsonify({'stats': stats})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    # Initialize database
    db_manager.initialize_database()
    
    # Start Flask development server
    app.run(host='0.0.0.0', port=5000, debug=True)
