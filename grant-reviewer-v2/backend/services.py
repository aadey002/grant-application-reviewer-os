#!/usr/bin/env python3
"""
Business logic services for Grant Reviewer V2
"""

import os
import json
import shutil
import asyncio
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any
from fastapi import UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, text, func, desc
from loguru import logger

from models import Document, Folder, Evaluation, User
from utils import extract_document_content, generate_thumbnail, safe_filename

class DocumentService:
    """Service for document management operations."""
    
    def __init__(self):
        self.upload_dir = Path("uploads")
        self.upload_dir.mkdir(exist_ok=True)
    
    async def upload_document(
        self, 
        db: Session, 
        file: UploadFile, 
        folder_id: Optional[int] = None,
        agency: str = "HRSA",
        document_type: str = "application",
        description: str = "",
        tags: str = "",
        user_id: Optional[int] = None
    ) -> Document:
        """Upload and process a document."""
        try:
            # Generate safe filename
            safe_name = safe_filename(file.filename or "document")
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{timestamp}_{safe_name}"
            
            # Create file path
            file_path = self.upload_dir / filename
            
            # Save file
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            # Extract content for search
            content = await extract_document_content(str(file_path))
            
            # Create document record
            document = Document(
                title=file.filename or safe_name,
                filename=filename,
                file_path=str(file_path),
                file_size=file_path.stat().st_size,
                mime_type=file.content_type or "application/octet-stream",
                agency=agency,
                document_type=document_type,
                description=description,
                tags=tags,
                content_extracted=content,
                folder_id=folder_id,
                created_by=user_id
            )
            
            db.add(document)
            await db.commit()
            await db.refresh(document)
            
            # Add to FTS index
            await self._add_to_fts(db, document)
            
            logger.info(f"Document uploaded: {document.id} - {document.title}")
            return document
            
        except Exception as e:
            logger.error(f"Document upload failed: {e}")
            # Clean up file if document creation failed
            if 'file_path' in locals() and file_path.exists():
                file_path.unlink()
            raise
    
    async def get_documents(
        self, 
        db: Session, 
        folder_id: Optional[int] = None,
        agency: Optional[str] = None,
        status: Optional[str] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[Document]:
        """Get documents with filtering."""
        query = db.query(Document)
        
        if folder_id is not None:
            query = query.filter(Document.folder_id == folder_id)
        if agency:
            query = query.filter(Document.agency == agency)
        if status:
            query = query.filter(Document.status == status)
        
        query = query.order_by(desc(Document.created_at))
        return query.offset(skip).limit(limit).all()
    
    async def get_document(self, db: Session, document_id: int) -> Optional[Document]:
        """Get a single document by ID."""
        return db.query(Document).filter(Document.id == document_id).first()
    
    async def update_document(
        self, 
        db: Session, 
        document_id: int,
        description: Optional[str] = None,
        tags: Optional[str] = None,
        status: Optional[str] = None
    ) -> Optional[Document]:
        """Update document metadata."""
        document = await self.get_document(db, document_id)
        if not document:
            return None
        
        if description is not None:
            document.description = description
        if tags is not None:
            document.tags = tags
        if status is not None:
            document.status = status
        
        document.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(document)
        
        # Update FTS index
        await self._update_fts(db, document)
        
        return document
    
    async def delete_document(self, db: Session, document_id: int) -> bool:
        """Delete a document and its file."""
        document = await self.get_document(db, document_id)
        if not document:
            return False
        
        # Delete file
        if document.file_path and os.path.exists(document.file_path):
            os.unlink(document.file_path)
        
        # Remove from FTS
        await self._remove_from_fts(db, document_id)
        
        # Delete from database
        db.delete(document)
        await db.commit()
        
        return True
    
    async def search_documents(
        self, 
        db: Session, 
        query: str, 
        filters: str = "{}",
        skip: int = 0,
        limit: int = 20
    ) -> List[Document]:
        """Search documents using FTS."""
        try:
            filter_dict = json.loads(filters) if filters else {}
            
            # Build FTS query
            fts_query = text("""
                SELECT document_id, rank
                FROM document_fts
                WHERE document_fts MATCH :query
                ORDER BY rank
                LIMIT :limit OFFSET :offset
            """)
            
            result = await db.execute(fts_query, {
                "query": query,
                "limit": limit,
                "offset": skip
            })
            
            document_ids = [row[0] for row in result.fetchall()]
            
            if not document_ids:
                return []
            
            # Get full document records
            query = db.query(Document).filter(Document.id.in_(document_ids))
            
            # Apply additional filters
            if filter_dict.get("agency"):
                query = query.filter(Document.agency == filter_dict["agency"])
            if filter_dict.get("status"):
                query = query.filter(Document.status == filter_dict["status"])
            
            return query.all()
            
        except Exception as e:
            logger.error(f"Search failed: {e}")
            return []
    
    async def get_statistics(self, db: Session) -> Dict[str, Any]:
        """Get document statistics."""
        total = db.query(Document).count()
        
        # Documents by agency
        agency_stats = db.query(
            Document.agency, 
            func.count(Document.id)
        ).group_by(Document.agency).all()
        
        # Documents by status
        status_stats = db.query(
            Document.status,
            func.count(Document.id)
        ).group_by(Document.status).all()
        
        # Recent activity
        recent = db.query(Document).order_by(
            desc(Document.created_at)
        ).limit(10).all()
        
        return {
            "total": total,
            "by_agency": dict(agency_stats),
            "by_status": dict(status_stats),
            "recent_activity": [
                {
                    "id": doc.id,
                    "title": doc.title,
                    "agency": doc.agency,
                    "created_at": doc.created_at.isoformat()
                } for doc in recent
            ]
        }
    
    async def _add_to_fts(self, db: Session, document: Document):
        """Add document to FTS index."""
        try:
            insert_query = text("""
                INSERT INTO document_fts (document_id, title, content, description, tags)
                VALUES (:doc_id, :title, :content, :description, :tags)
            """)
            
            await db.execute(insert_query, {
                "doc_id": document.id,
                "title": document.title or "",
                "content": document.content_extracted or "",
                "description": document.description or "",
                "tags": document.tags or ""
            })
            await db.commit()
        except Exception as e:
            logger.error(f"FTS insert failed: {e}")
    
    async def _update_fts(self, db: Session, document: Document):
        """Update document in FTS index."""
        await self._remove_from_fts(db, document.id)
        await self._add_to_fts(db, document)
    
    async def _remove_from_fts(self, db: Session, document_id: int):
        """Remove document from FTS index."""
        try:
            delete_query = text("""
                DELETE FROM document_fts WHERE document_id = :doc_id
            """)
            await db.execute(delete_query, {"doc_id": document_id})
            await db.commit()
        except Exception as e:
            logger.error(f"FTS delete failed: {e}")

class FolderService:
    """Service for folder management operations."""
    
    async def create_folder(
        self, 
        db: Session, 
        name: str, 
        description: str = "",
        parent_id: Optional[int] = None
    ) -> Folder:
        """Create a new folder."""
        folder = Folder(
            name=name,
            description=description,
            parent_id=parent_id
        )
        
        db.add(folder)
        await db.commit()
        await db.refresh(folder)
        
        return folder
    
    async def get_folders(
        self, 
        db: Session, 
        parent_id: Optional[int] = None
    ) -> List[Folder]:
        """Get folders by parent."""
        query = db.query(Folder)
        
        if parent_id is not None:
            query = query.filter(Folder.parent_id == parent_id)
        else:
            query = query.filter(Folder.parent_id.is_(None))
        
        return query.order_by(Folder.name).all()
    
    async def delete_folder(self, db: Session, folder_id: int) -> bool:
        """Delete a folder."""
        folder = db.query(Folder).filter(Folder.id == folder_id).first()
        if not folder:
            return False
        
        # Check if folder has any documents
        document_count = db.query(Document).filter(Document.folder_id == folder_id).count()
        if document_count > 0:
            # Move documents to no folder (or you could implement a different policy)
            db.query(Document).filter(Document.folder_id == folder_id).update({Document.folder_id: None})
        
        # Delete the folder
        db.delete(folder)
        await db.commit()
        return True
    
    async def get_statistics(self, db: Session) -> Dict[str, Any]:
        """Get folder statistics."""
        total = db.query(Folder).count()
        return {"total": total}

class EvaluationService:
    """Service for evaluation operations."""
    
    async def create_evaluation(
        self, 
        db: Session,
        document_id: int,
        nofo_document_id: Optional[int] = None,
        evaluation_type: str = "comprehensive",
        evaluation_criteria: str = "",
        user_id: Optional[int] = None
    ) -> Evaluation:
        """Create a new evaluation."""
        evaluation = Evaluation(
            document_id=document_id,
            nofo_document_id=nofo_document_id,
            evaluation_type=evaluation_type,
            evaluation_criteria=evaluation_criteria,
            status="pending",
            created_by=user_id
        )
        
        db.add(evaluation)
        await db.commit()
        await db.refresh(evaluation)
        
        # Start evaluation process asynchronously
        asyncio.create_task(self._process_evaluation(db, evaluation.id))
        
        return evaluation
    
    async def get_evaluations(
        self, 
        db: Session,
        document_id: Optional[int] = None,
        status: Optional[str] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[Evaluation]:
        """Get evaluations with filtering."""
        query = db.query(Evaluation)
        
        if document_id is not None:
            query = query.filter(Evaluation.document_id == document_id)
        if status:
            query = query.filter(Evaluation.status == status)
        
        query = query.order_by(desc(Evaluation.created_at))
        return query.offset(skip).limit(limit).all()
    
    async def get_statistics(self, db: Session) -> Dict[str, Any]:
        """Get evaluation statistics."""
        total = db.query(Evaluation).count()
        
        # Evaluations by status
        status_stats = db.query(
            Evaluation.status,
            func.count(Evaluation.id)
        ).group_by(Evaluation.status).all()
        
        return {
            "total": total,
            "by_status": dict(status_stats)
        }
    
    async def _process_evaluation(self, db: Session, evaluation_id: int):
        """Process an evaluation using the MCP agent."""
        try:
            evaluation = db.query(Evaluation).filter(
                Evaluation.id == evaluation_id
            ).first()
            
            if not evaluation:
                return
            
            # Update status
            evaluation.status = "in_progress"
            evaluation.started_at = datetime.utcnow()
            await db.commit()
            
            # Get document and NOFO
            document = db.query(Document).filter(
                Document.id == evaluation.document_id
            ).first()
            
            nofo_document = None
            if evaluation.nofo_document_id:
                nofo_document = db.query(Document).filter(
                    Document.id == evaluation.nofo_document_id
                ).first()
            
            if not document:
                raise Exception("Document not found")
            
            # Process with MCP agent
            mcp_service = MCPService()
            result = await mcp_service.process_evaluation(
                document.file_path,
                nofo_document.file_path if nofo_document else None,
                document.agency,
                evaluation.evaluation_type
            )
            
            # Update evaluation with results
            evaluation.overall_score = result.get("overall_score")
            evaluation.scores_data = json.dumps(result.get("scores", {}))
            evaluation.comments_data = json.dumps(result.get("comments", {}))
            evaluation.worksheet_data = json.dumps(result.get("worksheet", {}))
            evaluation.status = "completed"
            evaluation.completed_at = datetime.utcnow()
            
            if evaluation.started_at:
                evaluation.processing_time = (
                    evaluation.completed_at - evaluation.started_at
                ).total_seconds()
            
            await db.commit()
            
            logger.info(f"Evaluation completed: {evaluation_id}")
            
        except Exception as e:
            logger.error(f"Evaluation processing failed: {e}")
            
            # Update evaluation with error
            evaluation = db.query(Evaluation).filter(
                Evaluation.id == evaluation_id
            ).first()
            
            if evaluation:
                evaluation.status = "failed"
                evaluation.error_message = str(e)
                evaluation.completed_at = datetime.utcnow()
                await db.commit()

class MCPService:
    """Service for interfacing with the Grant Reviewer MCP Agent."""
    
    def __init__(self):
        self.mcp_server_path = os.getenv(
            "MCP_SERVER_PATH", 
            "/workspace/grant-reviewer-mcp/run.sh"
        )
    
    async def process_evaluation(
        self, 
        application_path: str,
        nofo_path: Optional[str] = None,
        agency: str = "HRSA",
        evaluation_type: str = "comprehensive"
    ) -> Dict[str, Any]:
        """Process evaluation using MCP agent."""
        try:
            # For now, return mock data
            # In production, this would call the actual MCP server
            
            await asyncio.sleep(2)  # Simulate processing time
            
            return {
                "overall_score": 85.5,
                "scores": {
                    "relevance": 90,
                    "feasibility": 85,
                    "impact": 80,
                    "sustainability": 85,
                    "capacity": 90
                },
                "comments": {
                    "strengths": [
                        "The applicant organization demonstrates strong organizational capacity with experienced leadership team.",
                        "The proposed methodology is well-structured and evidence-based."
                    ],
                    "weaknesses": [
                        "The sustainability plan needs more detail regarding long-term funding sources.",
                        "The evaluation plan could benefit from more specific outcome measures."
                    ],
                    "met_criteria": [
                        "The applicant organization meets all eligibility requirements.",
                        "The project scope aligns with HRSA priorities."
                    ]
                },
                "worksheet": {
                    "recommendation": "Fund",
                    "priority_score": "High",
                    "summary": "Strong application with minor areas for improvement."
                }
            }
            
        except Exception as e:
            logger.error(f"MCP evaluation failed: {e}")
            raise
