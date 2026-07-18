# Grant Reviewer Web Application

A comprehensive web interface for the Grant Reviewing Agent system that provides complete document management, evaluation workflows, and administrative capabilities for federal grant review processes.

## Features

### 🗂️ Document Management System
- Create and manage folder structures for organizing grant applications
- Upload PDF and Word documents with drag-and-drop interface
- File browser with metadata display and organization
- Document versioning and revision tracking
- Bulk operations (move, delete, categorize multiple files)

### 🔍 Advanced Search & Organization
- Full-text search across uploaded documents with highlighting
- Filter by agency (HRSA, SAMHSA), date ranges, evaluation status
- Tag system for categorizing applications
- Advanced search with multiple criteria
- Saved search templates and quick filters

### 📊 Grant Evaluation Interface
- Step-by-step evaluation workflow with progress tracking
- Side-by-side document viewer with evaluation form
- Real-time integration with Grant Reviewing MCP Agent tools
- Interactive scoring interface with criterion-based evaluation
- Comment generation and editing capabilities
- Automated worksheet completion with manual override options

### 📈 Dashboard & Analytics
- Overview dashboard showing all applications and their status
- Progress tracking for evaluation workflows
- Performance metrics (review times, scores distribution)
- Export capabilities for reports and worksheets
- Calendar view for deadlines and review schedules

## Technical Architecture

### Backend (Python Flask)
- **API Server**: RESTful API with comprehensive endpoints
- **Database**: SQLite for metadata storage and search indexing
- **File Storage**: Local filesystem for document management
- **MCP Integration**: Direct integration with existing Grant Reviewing MCP Agent
- **Search Engine**: Full-text search with SQLite FTS5

### Frontend (React + TypeScript)
- **Framework**: React 18 with TypeScript for type safety
- **Build Tool**: Vite for fast development and optimized builds
- **Styling**: Tailwind CSS for modern, responsive design
- **State Management**: React Context API and hooks
- **UI Components**: Custom components with professional design

## Quick Start

### Prerequisites
- Python 3.10 or higher
- Node.js 18 or higher
- npm or pnpm package manager

### Backend Setup

1. **Start the backend server**:
   ```bash
   chmod +x start_backend.sh
   ./start_backend.sh
   ```

   The backend will:
   - Install required Python dependencies
   - Set up SQLite database
   - Create storage directories
   - Start Flask development server on http://localhost:5000

### Frontend Setup

1. **Install frontend dependencies**:
   ```bash
   cd grant-reviewer-app
   npm install
   ```

2. **Start the development server**:
   ```bash
   npm run dev
   ```

   The frontend will be available at http://localhost:5173

### Full Application Access

- **Frontend**: http://localhost:5173 (React application)
- **Backend API**: http://localhost:5000 (Flask API server)
- **Health Check**: http://localhost:5000/api/health

## API Endpoints

### Document Management
- `GET /api/documents` - List documents with filtering
- `POST /api/documents/upload` - Upload new document
- `GET /api/documents/{id}` - Get document details
- `PUT /api/documents/{id}` - Update document metadata
- `DELETE /api/documents/{id}` - Delete document
- `GET /api/documents/{id}/download` - Download document file

### Folder Management
- `GET /api/folders` - List all folders with hierarchy
- `POST /api/folders` - Create new folder
- `PUT /api/folders/{id}` - Update folder details
- `DELETE /api/folders/{id}` - Delete folder

### Evaluation System
- `GET /api/evaluations` - List evaluations
- `POST /api/evaluations` - Start new evaluation
- `GET /api/evaluations/{id}` - Get evaluation details

### Search
- `GET /api/search?q={query}` - Search documents and evaluations

### Analytics
- `GET /api/stats` - Get application statistics

## Integration with Grant Reviewing MCP Agent

The web application seamlessly integrates with the existing Grant Reviewing MCP Agent:

### Document Processing
- Automatic document analysis using existing `DocumentProcessor`
- Section extraction and content parsing
- Metadata extraction and indexing

### Evaluation Capabilities
- **Comprehensive Evaluation**: Full application assessment
- **Scoring**: Agency-specific rubric scoring (HRSA, SAMHSA)
- **Comment Generation**: Professional reviewer comments
- **Worksheet Generation**: Complete evaluation worksheets
- **Validation**: Completeness checking against NOFO requirements

### Agency Support
- **HRSA**: Health Resources and Services Administration standards
- **SAMHSA**: Substance Abuse and Mental Health Services Administration criteria
- Extensible framework for additional agencies

## Security & Privacy

### Local Data Storage
- All documents stored locally on the server
- No external data transmission during evaluation
- SQLite database for metadata (local storage)
- File integrity checking with SHA-256 hashes

### Access Control
- Session-based authentication
- Document access controls
- Audit logging for all operations

## File Organization

```
grant-reviewer-app/
├── backend/
│   ├── app.py                 # Main Flask application
│   ├── database.py            # Database management
│   ├── file_manager.py        # File operations
│   ├── mcp_integration.py     # MCP Agent integration
│   ├── search_engine.py       # Full-text search
│   ├── start_backend.py       # Backend startup script
│   ├── requirements.txt       # Python dependencies
│   ├── data/                  # SQLite database
│   └── storage/               # Document storage
│       ├── documents/         # Uploaded documents
│       ├── temp/             # Temporary files
│       ├── thumbnails/       # Document previews
│       └── backups/          # File backups
├── src/                       # React frontend source
├── public/                    # Static assets
├── package.json              # Frontend dependencies
└── README.md                 # This file
```

## Development

### Backend Development
- Flask development server with auto-reload
- SQLite database with FTS5 for search
- Comprehensive error handling and logging
- RESTful API design with proper HTTP status codes

### Frontend Development
- Hot module replacement with Vite
- TypeScript for type safety
- Component-based architecture
- Responsive design with Tailwind CSS

## Production Deployment

### Backend
- Use production WSGI server (Gunicorn, uWSGI)
- Configure proper logging
- Set up database backups
- Implement file storage monitoring

### Frontend
- Build optimized production bundle: `npm run build`
- Serve static files with web server (Nginx, Apache)
- Configure API proxy for backend communication

## Troubleshooting

### Common Issues

1. **Backend won't start**:
   - Check Python version (3.10+ required)
   - Ensure all dependencies are installed
   - Check port 5000 availability

2. **File upload fails**:
   - Check storage directory permissions
   - Verify file size limits (100MB default)
   - Ensure supported file types (.pdf, .doc, .docx)

3. **MCP Agent integration issues**:
   - Verify grant-reviewer-mcp directory exists
   - Check Python path configuration
   - Review backend logs for integration errors

4. **Search not working**:
   - Check SQLite FTS5 support
   - Verify document indexing in database
   - Review search query syntax

### Logs and Debugging
- Backend logs: Check Flask console output
- Database queries: Enable SQLite query logging
- File operations: Check storage directory contents
- Frontend: Use browser developer tools

## License

This project follows standard open-source practices for grant review automation tools.

---

**Author**: MiniMax Agent  
**Version**: 1.0.0  
**Last Updated**: 2025-07-21
