#!/usr/bin/env python3
"""
Grant Reviewer Backend Startup Script

Handles dependency installation and starts the Flask development server.
"""

import os
import sys
import subprocess
from pathlib import Path

def install_dependencies():
    """Install required Python dependencies."""
    print("Installing Python dependencies...")
    
    backend_dir = Path(__file__).parent
    requirements_file = backend_dir / 'requirements.txt'
    
    if requirements_file.exists():
        subprocess.run([sys.executable, '-m', 'pip', 'install', '-r', str(requirements_file)], check=True)
    else:
        # Install essential packages
        packages = [
            'Flask==3.0.0',
            'Flask-CORS==4.0.0',
            'Werkzeug==3.0.1',
            'PyMuPDF==1.23.24',
            'python-docx==1.1.0',
            'pdfplumber==0.10.3',
            'pandas==2.1.4'
        ]
        
        for package in packages:
            subprocess.run([sys.executable, '-m', 'pip', 'install', package], check=True)

def setup_environment():
    """Set up the backend environment."""
    backend_dir = Path(__file__).parent
    
    # Create necessary directories
    directories = [
        backend_dir / 'data',
        backend_dir / 'storage' / 'documents',
        backend_dir / 'storage' / 'temp',
        backend_dir / 'storage' / 'thumbnails',
        backend_dir / 'storage' / 'backups'
    ]
    
    for directory in directories:
        directory.mkdir(parents=True, exist_ok=True)
    
    print(f"Backend environment set up in: {backend_dir}")

def start_server():
    """Start the Flask development server."""
    print("Starting Grant Reviewer Backend Server...")
    print("Server will be available at: http://localhost:5000")
    print("API Documentation: http://localhost:5000/api/health")
    print("\nPress Ctrl+C to stop the server\n")
    
    # Change to backend directory
    backend_dir = Path(__file__).parent
    os.chdir(backend_dir)
    
    # Start Flask app
    os.environ['FLASK_ENV'] = 'development'
    os.environ['FLASK_DEBUG'] = '1'
    
    from app import app
    app.run(host='0.0.0.0', port=5000, debug=True)

if __name__ == '__main__':
    try:
        print("Grant Reviewer Backend Setup")
        print("=" * 40)
        
        # Install dependencies
        install_dependencies()
        
        # Setup environment
        setup_environment()
        
        # Start server
        start_server()
        
    except KeyboardInterrupt:
        print("\nShutting down server...")
    except Exception as e:
        print(f"Error starting backend: {e}")
        sys.exit(1)
