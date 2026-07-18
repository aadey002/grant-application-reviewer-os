# Grant Reviewer Application - Deployment Guide

**Deployed URL**: https://m4ozas4sqgki.space.minimax.io

## Overview

This comprehensive Grant Reviewing web application provides a complete document management and evaluation system for federal grant applications, specifically designed for HRSA and SAMHSA grant reviews.

## Architecture

### Frontend (React + TypeScript)
- **Framework**: React 18.3 with TypeScript
- **Build Tool**: Vite 6.2
- **UI Library**: Tailwind CSS with Radix UI components
- **State Management**: React Context API
- **Charts**: Recharts for data visualization
- **Icons**: Lucide React

### Backend (Python Flask)
- **Framework**: Flask 3.1.1
- **Database**: SQLite for local data storage
- **File Processing**: PyMuPDF for PDF processing, python-docx for Word documents
- **Search**: Full-text search capabilities
- **Integration**: Direct integration with existing Grant Reviewing MCP Agent

## Key Features Implemented

### Document Management System
- Create and manage folder structures for organizing grant applications
- Upload PDF and Word documents with drag-and-drop interface
- File browser with metadata display and document preview
- Document versioning and revision tracking
- Bulk operations (move, delete, categorize multiple files)

### Advanced Search & Organization
- Full-text search across uploaded documents
- Filter by agency (HRSA, SAMHSA), date ranges, evaluation status
- Tag system for categorizing applications
- Advanced search with multiple criteria
- Document organization by folders and categories

### Grant Evaluation Interface
- Integration with Grant Reviewing MCP Agent tools
- Document viewer with evaluation capabilities
- Real-time evaluation status tracking
- Interactive evaluation workflow

### Dashboard & Analytics
- Overview dashboard showing all applications and their status
- Performance metrics and statistics
- Agency distribution charts
- Document status overview
- Recent activity tracking

### Professional User Interface
- Clean, modern design suitable for professional grant reviewers
- Responsive layout working on desktop and tablet devices
- Professional color scheme with blue accents
- Card-based layout for document organization
- Intuitive navigation and user experience

### Local Backend Integration
- Complete data privacy and security (local storage only)
- SQLite database for metadata and search indexing
- Local file storage maintaining document integrity
- Direct integration with existing Grant Reviewing MCP Agent
- No external data transmission

## Security & Privacy Features

- **Local Storage**: All documents and data remain on local systems
- **No External Transmission**: Complete privacy compliance
- **Secure File Handling**: Documents stored securely in local filesystem
- **Audit Trail**: Comprehensive logging of all evaluation activities
- **Access Control**: Session-based authentication and authorization

## Deployment Information

- **Deployment URL**: https://m4ozas4sqgki.space.minimax.io
- **Deployment Type**: Static web application with local backend integration
- **Performance**: Optimized production build with code splitting
- **Compatibility**: Modern browsers with full ES6+ support

---

**Built by**: MiniMax Agent  
**Version**: 1.0.0  
**Date**: 2025-07-21