#!/usr/bin/env python3
"""
Database models for Grant Reviewer V2
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Float
from sqlalchemy.orm import relationship
from database import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    full_name = Column(String)
    is_active = Column(Boolean, default=True)
    role = Column(String, default="reviewer")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    documents = relationship("Document", back_populates="created_by_user")
    evaluations = relationship("Evaluation", back_populates="created_by_user")

class Folder(Base):
    __tablename__ = "folders"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(Text)
    parent_id = Column(Integer, ForeignKey("folders.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    parent = relationship("Folder", remote_side=[id])
    children = relationship("Folder")
    documents = relationship("Document", back_populates="folder")

class Document(Base):
    __tablename__ = "documents"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    filename = Column(String)
    file_path = Column(String)
    file_size = Column(Integer)
    mime_type = Column(String)
    
    # Grant-specific fields
    agency = Column(String, index=True)  # HRSA, SAMHSA, etc.
    document_type = Column(String, index=True)  # application, nofo, supporting_doc
    status = Column(String, default="uploaded")  # uploaded, processing, reviewed, evaluated
    
    # Content and metadata
    description = Column(Text)
    tags = Column(String)  # JSON array as string
    content_extracted = Column(Text)  # Full text content for search
    metadata = Column(Text)  # JSON metadata as string
    
    # Foreign keys
    folder_id = Column(Integer, ForeignKey("folders.id"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    folder = relationship("Folder", back_populates="documents")
    created_by_user = relationship("User", back_populates="documents")
    evaluations = relationship("Evaluation", back_populates="document")

class Evaluation(Base):
    __tablename__ = "evaluations"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Document references
    document_id = Column(Integer, ForeignKey("documents.id"))
    nofo_document_id = Column(Integer, ForeignKey("documents.id"), nullable=True)
    
    # Evaluation details
    evaluation_type = Column(String)  # comprehensive, scoring, comments, worksheet
    status = Column(String, default="pending")  # pending, in_progress, completed, failed
    
    # Results
    overall_score = Column(Float, nullable=True)
    scores_data = Column(Text)  # JSON scores breakdown
    comments_data = Column(Text)  # JSON comments (strengths, weaknesses, met_criteria)
    worksheet_data = Column(Text)  # JSON worksheet content
    
    # Processing info
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    processing_time = Column(Float, nullable=True)  # in seconds
    error_message = Column(Text, nullable=True)
    
    # Metadata
    evaluation_criteria = Column(Text)  # JSON criteria used
    agency = Column(String)  # HRSA, SAMHSA, etc.
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    document = relationship("Document", foreign_keys=[document_id], back_populates="evaluations")
    nofo_document = relationship("Document", foreign_keys=[nofo_document_id])
    created_by_user = relationship("User", back_populates="evaluations")
