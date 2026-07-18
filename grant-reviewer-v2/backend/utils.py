#!/usr/bin/env python3
"""
Utility functions for Grant Reviewer V2
"""

import os
import re
import sys
import asyncio
from pathlib import Path
from typing import Optional
from loguru import logger

def setup_logging():
    """Configure logging for the application."""
    logger.remove()  # Remove default handler
    
    # Console logging
    logger.add(
        sys.stderr,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
        level="INFO"
    )
    
    # File logging
    logger.add(
        "logs/grant_reviewer.log",
        rotation="10 MB",
        retention="30 days",
        format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}",
        level="DEBUG"
    )
    
    # Create logs directory
    Path("logs").mkdir(exist_ok=True)

def safe_filename(filename: str) -> str:
    """Create a safe filename by removing/replacing unsafe characters."""
    # Remove or replace unsafe characters
    safe_name = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)
    
    # Remove consecutive underscores
    safe_name = re.sub(r'_+', '_', safe_name)
    
    # Remove leading/trailing underscores
    safe_name = safe_name.strip('_')
    
    # Ensure filename is not empty
    if not safe_name:
        safe_name = "document"
    
    return safe_name

async def extract_document_content(file_path: str) -> str:
    """Extract text content from a document for search indexing."""
    try:
        file_path = Path(file_path)
        
        if not file_path.exists():
            logger.warning(f"File not found: {file_path}")
            return ""
        
        # For now, return basic file info
        # In production, this would use actual document processing
        content = f"Document: {file_path.name}\n"
        content += f"Size: {file_path.stat().st_size} bytes\n"
        
        # Mock content extraction
        if file_path.suffix.lower() == '.pdf':
            content += "PDF document content extracted\n"
        elif file_path.suffix.lower() in ['.doc', '.docx']:
            content += "Word document content extracted\n"
        else:
            content += "Unknown document type\n"
        
        return content
        
    except Exception as e:
        logger.error(f"Content extraction failed for {file_path}: {e}")
        return ""

async def generate_thumbnail(file_path: str) -> Optional[str]:
    """Generate a thumbnail for a document."""
    try:
        # Mock thumbnail generation
        # In production, this would create actual thumbnails
        return f"thumbnail_{Path(file_path).stem}.jpg"
    except Exception as e:
        logger.error(f"Thumbnail generation failed for {file_path}: {e}")
        return None

def validate_file_type(filename: str, allowed_types: list = None) -> bool:
    """Validate file type based on extension."""
    if allowed_types is None:
        allowed_types = ['.pdf', '.doc', '.docx', '.txt']
    
    file_ext = Path(filename).suffix.lower()
    return file_ext in allowed_types

def format_file_size(size_bytes: int) -> str:
    """Format file size in human-readable format."""
    if size_bytes == 0:
        return "0 B"
    
    size_names = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    
    while size_bytes >= 1024 and i < len(size_names) - 1:
        size_bytes /= 1024.0
        i += 1
    
    return f"{size_bytes:.1f} {size_names[i]}"

def get_mime_type(filename: str) -> str:
    """Get MIME type based on file extension."""
    mime_types = {
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.txt': 'text/plain',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif'
    }
    
    file_ext = Path(filename).suffix.lower()
    return mime_types.get(file_ext, 'application/octet-stream')
