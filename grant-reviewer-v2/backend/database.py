#!/usr/bin/env python3
"""
Database setup and configuration for Grant Reviewer V2
"""

import os
import asyncio
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
try:
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
except ImportError:
    # Fallback to sync SQLAlchemy if async not available
    from sqlalchemy.orm import Session as AsyncSession
    create_async_engine = None

try:
    from loguru import logger
except ImportError:
    import logging
    logger = logging.getLogger(__name__)

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./grant_reviewer.db")
ASYNC_DATABASE_URL = os.getenv("ASYNC_DATABASE_URL", "sqlite+aiosqlite:///./grant_reviewer.db")

# Create engines
engine = create_engine(DATABASE_URL, echo=False)
async_engine = create_async_engine(ASYNC_DATABASE_URL, echo=False)

# Create session makers
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
AsyncSessionLocal = sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

# Create declarative base
Base = declarative_base()

async def init_database():
    """Initialize the database and create tables."""
    try:
        async with async_engine.begin() as conn:
            # Import models to ensure they're registered
            from models import Document, Folder, Evaluation, User
            
            # Create all tables
            await conn.run_sync(Base.metadata.create_all)
            
            # Create FTS table for document search
            await conn.execute(text("""
                CREATE VIRTUAL TABLE IF NOT EXISTS document_fts USING fts5(
                    document_id UNINDEXED,
                    title,
                    content,
                    description,
                    tags
                )
            """))
            
            logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise

async def get_db():
    """Dependency to get database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
