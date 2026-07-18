import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Upload, 
  FolderPlus, 
  Search, 
  Filter,
  Grid,
  List,
  SortAsc,
  SortDesc,
  RefreshCw
} from 'lucide-react';
import { api } from '@/services/api';
import { useApp } from '@/contexts/AppContext';
import type { DocumentsResponse, FoldersResponse, DocumentUploadRequest } from '@/types/api-responses';
import DocumentList from './DocumentList';
import DocumentUpload from './DocumentUpload';
import { SimpleWorkingUpload } from './SimpleWorkingUpload';
import FolderTree from './FolderTree';
import CreateFolderModal from './CreateFolderModal';


const DocumentManager: React.FC = () => {
  const { state, dispatch } = useApp();
  const queryClient = useQueryClient();
  
  // UI State
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgency, setSelectedAgency] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [sortBy, setSortBy] = useState<'created_at' | 'filename' | 'file_size'>('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    dispatch({ type: 'SET_CURRENT_VIEW', payload: 'documents' });
  }, [dispatch]);

  // Fetch documents
  const { 
    data: documentsResponse, 
    isLoading: documentsLoading, 
    error: documentsError,
    refetch: refetchDocuments
  } = useQuery<DocumentsResponse>({
    queryKey: ['documents', state.selectedFolder?.id, selectedAgency, selectedStatus, sortBy, sortOrder],
    queryFn: async () => {
      console.log('🔍 DocumentManager: Fetching documents for folder:', state.selectedFolder?.name, 'ID:', state.selectedFolder?.id);
      console.log('🔍 DocumentManager: Query parameters:', {
        folder_id: state.selectedFolder?.id,
        agency: selectedAgency || undefined,
        status: selectedStatus || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      const result = await api.documents.getAll({
        folder_id: state.selectedFolder?.id,
        agency: selectedAgency || undefined,
        status: selectedStatus || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      console.log('📊 DocumentManager: Fetched documents result:', result.documents?.length, 'documents');
      console.log('📋 DocumentManager: Document titles:', result.documents?.map(d => d.title));
      console.log('📂 DocumentManager: Document folder IDs:', result.documents?.map(d => ({ title: d.title, folder_id: d.folder_id })));
      return result;
    },
    enabled: true,
  });

  // Fetch folders
  const { 
    data: foldersResponse, 
    isLoading: foldersLoading 
  } = useQuery<FoldersResponse>({
    queryKey: ['folders'],
    queryFn: () => api.folders.getAll(),
  });

  // Update app state when data changes
  useEffect(() => {
    if (documentsResponse?.documents) {
      dispatch({ type: 'SET_DOCUMENTS', payload: documentsResponse.documents });
    }
  }, [documentsResponse, dispatch]);

  useEffect(() => {
    if (foldersResponse?.folders) {
      dispatch({ type: 'SET_FOLDERS', payload: foldersResponse.folders });
    }
  }, [foldersResponse, dispatch]);

  // Update loading states
  useEffect(() => {
    dispatch({ type: 'SET_LOADING', payload: { key: 'documents', value: documentsLoading } });
  }, [documentsLoading, dispatch]);

  // Delete document mutation
  const deleteMutation = useMutation({
    mutationFn: (documentId: number) => api.documents.delete(documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['statistics'] });
    },
    onError: (error: any) => {
      console.error('Failed to delete document:', error);
      // You could add a toast notification here
    },
  });

  // Enhanced upload mutation with comprehensive error handling
  const enhancedUploadMutation = useMutation({
    mutationFn: async ({ files, metadata }: { files: FileList; metadata: any }) => {
      try {
        const result = await api.documents.uploadEnhanced(files, metadata);
        return result;
      } catch (error) {
        console.error('Upload API call failed:', error);
        throw error;
      }
    },
    onSuccess: async (data, variables) => {
      try {
        // Clear all document-related queries immediately
        queryClient.removeQueries({ queryKey: ['documents'] });
        
        // Force immediate refetch
        const refetchResult = await refetchDocuments();
        
        // Update app state with all current documents
        if (refetchResult.data?.documents) {
          dispatch({ type: 'SET_DOCUMENTS', payload: refetchResult.data.documents });
        }
        
        // Also invalidate other related queries
        queryClient.invalidateQueries({ queryKey: ['statistics'] });
        queryClient.invalidateQueries({ queryKey: ['folders'] });
        
      } catch (refreshError) {
        console.error('Error during post-upload refresh:', refreshError);
      }
    },
    onError: (error: any) => {
      console.error('❌ DocumentManager: Upload mutation failed:', error);
      console.error('❌ DocumentManager: Error details:', {
        message: error?.message,
        stack: error?.stack,
        response: error?.response
      });
    },
  });

  // Handle search
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      // Implement search functionality
      console.log('Searching for:', query);
    }
  };

  // Handle sort change
  const handleSortChange = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  // Handle document deletion
  const handleDeleteDocument = (document: any) => {
    deleteMutation.mutate(document.id);
  };

  // Handle enhanced upload with validation
  const handleEnhancedUpload = async (files: FileList, metadata: DocumentUploadRequest) => {
    // Validate inputs
    if (!files || files.length === 0) {
      throw new Error('No files provided for upload');
    }
    
    if (!enhancedUploadMutation) {
      throw new Error('Upload mutation not available');
    }
    
    try {
      // Include the selected folder ID in the metadata
      const enhancedMetadata = {
        ...metadata,
        folder_id: state.selectedFolder?.id || null
      };
      
      const result = await enhancedUploadMutation.mutateAsync({ files, metadata: enhancedMetadata });
      return result;
      
    } catch (error) {
      console.error('Upload failed:', error);
      throw new Error(`Upload failed: ${error?.message || 'Unknown error'}`);
    }
  };

  // Filter documents based on search
  const filteredDocuments = React.useMemo(() => {
    if (!documentsResponse?.documents) return [];
    
    let filtered = documentsResponse.documents;
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(doc => 
        doc.filename.toLowerCase().includes(query) ||
        doc.description?.toLowerCase().includes(query) ||
        (typeof doc.tags === 'string' ? doc.tags.toLowerCase().includes(query) : false)
      );
    }
    
    return filtered;
  }, [documentsResponse?.documents, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Document Management</h1>
          <p className="text-slate-600">
            Upload, organize, and manage grant application documents
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowCreateFolder(true)}
            className="flex items-center px-3 py-2 bg-white border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <FolderPlus className="w-4 h-4 mr-2" />
            New Folder
          </button>
          
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload Document
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex flex-col lg:flex-row lg:items-center space-y-4 lg:space-y-0 lg:space-x-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Filters */}
          <div className="flex items-center space-x-3">
            <select
              value={selectedAgency}
              onChange={(e) => setSelectedAgency(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Agencies</option>
              <option value="HRSA">HRSA</option>
              <option value="SAMHSA">SAMHSA</option>
              <option value="NIH">NIH</option>
              <option value="CDC">CDC</option>
              <option value="Other">Other</option>
            </select>

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Status</option>
              <option value="uploaded">Uploaded</option>
              <option value="processing">Processing</option>
              <option value="processed">Processed</option>
              <option value="evaluated">Evaluated</option>
              <option value="archived">Archived</option>
              <option value="error">Error</option>
            </select>

            {/* View Mode Toggle */}
            <div className="flex items-center border border-slate-300 rounded-md">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 ${viewMode === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 ${viewMode === 'list' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => refetchDocuments()}
              className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sort Options */}
        <div className="flex items-center space-x-4 mt-3 pt-3 border-t border-slate-200">
          <span className="text-sm text-slate-600">Sort by:</span>
          
          {(['created_at', 'filename', 'file_size'] as const).map((field) => (
            <button
              key={field}
              onClick={() => handleSortChange(field)}
              className={`flex items-center text-sm ${
                sortBy === field ? 'text-blue-600 font-medium' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {field === 'created_at' ? 'Date' : field === 'filename' ? 'Name' : 'Size'}
              {sortBy === field && (
                sortOrder === 'asc' ? 
                <SortAsc className="w-3 h-3 ml-1" /> : 
                <SortDesc className="w-3 h-3 ml-1" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Folder Tree */}
        <div className="lg:col-span-1">
          <FolderTree 
            folders={state.folders}
            selectedFolder={state.selectedFolder}
            onSelectFolder={(folder) => dispatch({ type: 'SELECT_FOLDER', payload: folder })}
            loading={foldersLoading}
          />
        </div>

        {/* Document List */}
        <div className="lg:col-span-3">
          <DocumentList
            documents={filteredDocuments}
            viewMode={viewMode}
            loading={documentsLoading}
            error={documentsError}
            onSelectDocument={(doc) => dispatch({ type: 'SELECT_DOCUMENT', payload: doc })}
            selectedDocument={state.selectedDocument}
            onDeleteDocument={handleDeleteDocument}
          />
        </div>
      </div>

      {/* Modals */}
      <SimpleWorkingUpload
        open={showUploadModal}
        onOpenChange={setShowUploadModal}
        onUpload={handleEnhancedUpload}
      />

      <CreateFolderModal
        isOpen={showCreateFolder}
        onClose={() => setShowCreateFolder(false)}
        parentId={state.selectedFolder?.id}
        onCreateComplete={() => {
          queryClient.invalidateQueries({ queryKey: ['folders'] });
          setShowCreateFolder(false);
        }}
      />
    </div>
  );
};

export default DocumentManager;
