"""
File Manager for Grant Reviewer Application

Handles file uploads, storage, organization, and metadata extraction.
Manages local file system operations and maintains file integrity.
"""

import os
import shutil
import hashlib
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, List
from werkzeug.utils import secure_filename
from werkzeug.datastructures import FileStorage

class FileManager:
    """Manages file operations for the grant reviewer application."""
    
    def __init__(self, base_storage_path: str = '/workspace/grant-reviewer-app/backend/storage'):
        self.base_storage_path = Path(base_storage_path)
        self.base_storage_path.mkdir(parents=True, exist_ok=True)
        
        # Create subdirectories
        self.documents_path = self.base_storage_path / 'documents'
        self.temp_path = self.base_storage_path / 'temp'
        self.thumbnails_path = self.base_storage_path / 'thumbnails'
        
        for path in [self.documents_path, self.temp_path, self.thumbnails_path]:
            path.mkdir(parents=True, exist_ok=True)
    
    def save_uploaded_file(self, file: FileStorage, folder_id: Optional[int] = None) -> Dict[str, Any]:
        """Save uploaded file to storage with proper organization."""
        if not file or not file.filename:
            raise ValueError("No file provided")
        
        # Secure the filename
        original_filename = file.filename
        secure_name = secure_filename(original_filename)
        
        # Generate unique filename to prevent conflicts
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        file_extension = Path(secure_name).suffix
        unique_filename = f"{timestamp}_{secure_name}"
        
        # Organize by folder if specified
        if folder_id:
            storage_dir = self.documents_path / f'folder_{folder_id}'
        else:
            storage_dir = self.documents_path / 'unfiled'
        
        storage_dir.mkdir(parents=True, exist_ok=True)
        file_path = storage_dir / unique_filename
        
        # Save the file
        file.save(str(file_path))
        
        # Calculate file hash for integrity checking
        file_hash = self._calculate_file_hash(file_path)
        
        # Get file stats
        file_stats = file_path.stat()
        
        return {
            'filename': unique_filename,
            'original_filename': original_filename,
            'file_path': str(file_path),
            'file_size': file_stats.st_size,
            'file_hash': file_hash,
            'storage_dir': str(storage_dir),
            'created_at': datetime.fromtimestamp(file_stats.st_ctime).isoformat()
        }
    
    def move_file(self, current_path: str, new_folder_id: Optional[int] = None) -> str:
        """Move file to different folder organization."""
        current_path = Path(current_path)
        
        if not current_path.exists():
            raise FileNotFoundError(f"File not found: {current_path}")
        
        # Determine new location
        if new_folder_id:
            new_dir = self.documents_path / f'folder_{new_folder_id}'
        else:
            new_dir = self.documents_path / 'unfiled'
        
        new_dir.mkdir(parents=True, exist_ok=True)
        new_path = new_dir / current_path.name
        
        # Move the file
        shutil.move(str(current_path), str(new_path))
        
        return str(new_path)
    
    def delete_file(self, file_path: str) -> bool:
        """Delete file from storage."""
        try:
            file_path = Path(file_path)
            if file_path.exists():
                file_path.unlink()
                
                # Clean up empty directories
                parent = file_path.parent
                if parent != self.documents_path and not any(parent.iterdir()):
                    parent.rmdir()
                
                return True
            return False
        except Exception:
            return False
    
    def copy_file(self, source_path: str, destination_folder_id: Optional[int] = None) -> str:
        """Copy file to another location."""
        source_path = Path(source_path)
        
        if not source_path.exists():
            raise FileNotFoundError(f"Source file not found: {source_path}")
        
        # Determine destination
        if destination_folder_id:
            dest_dir = self.documents_path / f'folder_{destination_folder_id}'
        else:
            dest_dir = self.documents_path / 'unfiled'
        
        dest_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate unique name for copy
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        base_name = source_path.stem
        extension = source_path.suffix
        copy_name = f"{base_name}_copy_{timestamp}{extension}"
        
        dest_path = dest_dir / copy_name
        
        # Copy the file
        shutil.copy2(str(source_path), str(dest_path))
        
        return str(dest_path)
    
    def get_file_info(self, file_path: str) -> Dict[str, Any]:
        """Get detailed file information."""
        file_path = Path(file_path)
        
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        
        stats = file_path.stat()
        
        return {
            'filename': file_path.name,
            'file_path': str(file_path),
            'file_size': stats.st_size,
            'file_size_human': self._format_file_size(stats.st_size),
            'created_at': datetime.fromtimestamp(stats.st_ctime).isoformat(),
            'modified_at': datetime.fromtimestamp(stats.st_mtime).isoformat(),
            'file_extension': file_path.suffix.lower(),
            'file_hash': self._calculate_file_hash(file_path),
            'is_readable': os.access(file_path, os.R_OK),
            'is_writable': os.access(file_path, os.W_OK)
        }
    
    def validate_file_integrity(self, file_path: str, expected_hash: str) -> bool:
        """Validate file integrity using hash comparison."""
        try:
            current_hash = self._calculate_file_hash(Path(file_path))
            return current_hash == expected_hash
        except Exception:
            return False
    
    def cleanup_temp_files(self, max_age_hours: int = 24):
        """Clean up temporary files older than specified age."""
        import time
        current_time = time.time()
        max_age_seconds = max_age_hours * 3600
        
        for temp_file in self.temp_path.iterdir():
            if temp_file.is_file():
                file_age = current_time - temp_file.stat().st_mtime
                if file_age > max_age_seconds:
                    try:
                        temp_file.unlink()
                    except Exception:
                        pass  # Ignore errors during cleanup
    
    def get_storage_statistics(self) -> Dict[str, Any]:
        """Get storage usage statistics."""
        total_size = 0
        file_count = 0
        folder_stats = {}
        
        for root, dirs, files in os.walk(self.documents_path):
            root_path = Path(root)
            folder_name = root_path.name
            folder_size = 0
            folder_files = 0
            
            for file in files:
                file_path = root_path / file
                try:
                    size = file_path.stat().st_size
                    total_size += size
                    folder_size += size
                    file_count += 1
                    folder_files += 1
                except Exception:
                    pass
            
            if folder_files > 0:
                folder_stats[folder_name] = {
                    'file_count': folder_files,
                    'total_size': folder_size,
                    'total_size_human': self._format_file_size(folder_size)
                }
        
        return {
            'total_files': file_count,
            'total_size': total_size,
            'total_size_human': self._format_file_size(total_size),
            'folder_statistics': folder_stats,
            'storage_path': str(self.base_storage_path)
        }
    
    def _calculate_file_hash(self, file_path: Path) -> str:
        """Calculate SHA-256 hash of file for integrity checking."""
        hash_sha256 = hashlib.sha256()
        
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_sha256.update(chunk)
        
        return hash_sha256.hexdigest()
    
    def _format_file_size(self, size_bytes: int) -> str:
        """Format file size in human-readable format."""
        if size_bytes == 0:
            return "0 B"
        
        size_names = ['B', 'KB', 'MB', 'GB', 'TB']
        i = 0
        
        while size_bytes >= 1024 and i < len(size_names) - 1:
            size_bytes /= 1024.0
            i += 1
        
        return f"{size_bytes:.1f} {size_names[i]}"
    
    def create_backup(self, file_path: str) -> str:
        """Create a backup copy of a file."""
        source_path = Path(file_path)
        
        if not source_path.exists():
            raise FileNotFoundError(f"File not found: {source_path}")
        
        # Create backup directory
        backup_dir = self.base_storage_path / 'backups'
        backup_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate backup filename with timestamp
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_name = f"{source_path.stem}_backup_{timestamp}{source_path.suffix}"
        backup_path = backup_dir / backup_name
        
        # Create backup
        shutil.copy2(str(source_path), str(backup_path))
        
        return str(backup_path)
    
    def get_file_versions(self, base_filename: str) -> List[Dict[str, Any]]:
        """Get all versions of a file (including backups)."""
        versions = []
        base_name = Path(base_filename).stem
        
        # Search in main documents directory
        for file_path in self.documents_path.rglob(f"{base_name}*"):
            if file_path.is_file():
                versions.append(self.get_file_info(str(file_path)))
        
        # Search in backups directory
        backup_dir = self.base_storage_path / 'backups'
        if backup_dir.exists():
            for file_path in backup_dir.rglob(f"{base_name}*"):
                if file_path.is_file():
                    file_info = self.get_file_info(str(file_path))
                    file_info['is_backup'] = True
                    versions.append(file_info)
        
        # Sort by modification time (newest first)
        versions.sort(key=lambda x: x['modified_at'], reverse=True)
        
        return versions
