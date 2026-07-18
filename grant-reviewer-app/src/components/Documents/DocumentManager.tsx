/**
 * Document Manager Component
 * 
 * Main interface for managing grant application documents.
 * Provides document listing, filtering, upload, and organization features.
 */

import React, { useEffect, useState } from 'react';
import {
  Upload,
  Filter,
  Grid,
  List,
  Search,
  SortAsc,
  SortDesc,
  Plus,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useDocumentActions, useFolderActions } from '../../hooks/useAPI';
import { useDocuments, useFolders } from '../../contexts/AppContext';
import DocumentList from './DocumentList';
import DocumentFilters from './DocumentFilters';
import UploadDocumentModal from './UploadDocumentModal';
import DocumentViewer from './DocumentViewer';

type ViewMode = 'grid' | 'list';
type SortField = 'name' | 'date' | 'size' | 'agency';
type SortOrder = 'asc' | 'desc';

const DocumentManager: React.FC = () => {
  const { loadDocuments } = useDocumentActions();
  const { loadFolders } = useFolderActions();
  const { documents, selectedDocument, loading, error } = useDocuments();
  const { folders, selectedFolder } = useFolders();
  
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDocumentViewer, setShowDocumentViewer] = useState(false);
  
  const [filters, setFilters] = useState({
    agency: '',
    status: '',
    document_type: '',
  });

  // Load data on component mount
  useEffect(() => {
    loadFolders();
    loadDocuments();
  }, [loadFolders, loadDocuments]);

  // Reload documents when folder selection changes
  useEffect(() => {
    const filterParams = {
      ...filters,
      folder_id: selectedFolder?.id,
      search: searchQuery || undefined,
    };
    
    // Remove empty filters
    Object.keys(filterParams).forEach(key => {
      if (!filterParams[key as keyof typeof filterParams]) {
        delete filterParams[key as keyof typeof filterParams];
      }
    });
    
    loadDocuments(filterParams);
  }, [selectedFolder, filters, searchQuery, loadDocuments]);

  // Open document viewer when document is selected
  useEffect(() => {
    if (selectedDocument) {
      setShowDocumentViewer(true);
    }
  }, [selectedDocument]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleFilterChange = (newFilters: typeof filters) => {
    setFilters(newFilters);
  };

  // Sort documents
  const sortedDocuments = [...documents].sort((a, b) => {
    let aValue: any, bValue: any;
    
    switch (sortField) {
      case 'name':
        aValue = a.original_filename.toLowerCase();
        bValue = b.original_filename.toLowerCase();
        break;
      case 'date':
        aValue = new Date(a.created_at);
        bValue = new Date(b.created_at);
        break;
      case 'size':
        aValue = a.file_size;
        bValue = b.file_size;
        break;
      case 'agency':
        aValue = a.agency;
        bValue = b.agency;
        break;
      default:
        return 0;
    }
    
    if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const filteredDocuments = sortedDocuments.filter(doc => {
    if (searchQuery && !doc.original_filename.toLowerCase().includes(searchQuery.toLowerCase()) && 
        !doc.description.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            {/* Search */}
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Filters Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "flex items-center px-3 py-2 text-sm border rounded-md transition-colors",
                showFilters 
                  ? "bg-blue-50 border-blue-200 text-blue-700" 
                  : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
              )}
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </button>
            
            {/* View Mode Toggle */}
            <div className="flex border border-gray-300 rounded-md overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={cn(
                  "px-3 py-2 text-sm transition-colors",
                  viewMode === 'grid' 
                    ? "bg-blue-100 text-blue-700" 
                    : "bg-white text-gray-700 hover:bg-gray-50"
                )}
              >
                <Grid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  "px-3 py-2 text-sm border-l border-gray-300 transition-colors",
                  viewMode === 'list' 
                    ? "bg-blue-100 text-blue-700" 
                    : "bg-white text-gray-700 hover:bg-gray-50"
                )}
              >
                <List className="h-4 w-4" />
              </button>
            </div>
            
            {/* Upload Button */}
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4 mr-2" />
              Upload Document
            </button>
          </div>
        </div>
        
        {/* Sort Options */}
        <div className="flex items-center space-x-4 mt-4">
          <span className="text-sm text-gray-500">Sort by:</span>
          {(['name', 'date', 'size', 'agency'] as SortField[]).map((field) => (
            <button
              key={field}
              onClick={() => handleSort(field)}
              className={cn(
                "flex items-center text-sm transition-colors",
                sortField === field 
                  ? "text-blue-600" 
                  : "text-gray-600 hover:text-gray-900"
              )}
            >
              {field.charAt(0).toUpperCase() + field.slice(1)}
              {sortField === field && (
                sortOrder === 'asc' ? 
                  <SortAsc className="h-3 w-3 ml-1" /> : 
                  <SortDesc className="h-3 w-3 ml-1" />
              )}
            </button>
          ))}
          
          <span className="text-sm text-gray-500 ml-4">
            {filteredDocuments.length} of {documents.length} documents
          </span>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <DocumentFilters
          filters={filters}
          onFilterChange={handleFilterChange}
          onClose={() => setShowFilters(false)}
        />
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : error ? (
          <div className="p-6">
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-red-800">{error}</p>
            </div>
          </div>
        ) : (
          <DocumentList
            documents={filteredDocuments}
            viewMode={viewMode}
            onDocumentSelect={setShowDocumentViewer}
          />
        )}
      </div>

      {/* Modals */}
      <UploadDocumentModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        folderId={selectedFolder?.id}
      />
      
      <DocumentViewer
        isOpen={showDocumentViewer}
        onClose={() => setShowDocumentViewer(false)}
      />
    </div>
  );
};

export default DocumentManager;
