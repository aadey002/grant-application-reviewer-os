/**
 * Document Viewer Component
 * 
 * Displays detailed information about a selected document
 * and provides actions like evaluation, download, and editing.
 */

import React, { useState } from 'react';
import {
  X,
  Download,
  Edit,
  Trash2,
  FileText,
  Calendar,
  User,
  Building,
  Tag,
  PlayCircle,
  ClipboardList,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useApp } from '../../contexts/AppContext';
import { useDocumentActions, useEvaluationActions } from '../../hooks/useAPI';
import { Document as DocumentType } from '../../services/api';

interface DocumentViewerProps {
  isOpen: boolean;
  onClose: () => void;
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({
  isOpen,
  onClose,
}) => {
  const { state } = useApp();
  const { downloadDocument, deleteDocument, updateDocument } = useDocumentActions();
  const { createEvaluation } = useEvaluationActions();
  const { selectedDocument } = state;
  
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    description: '',
    tags: '',
    status: '',
  });
  const [isStartingEvaluation, setIsStartingEvaluation] = useState(false);

  React.useEffect(() => {
    if (selectedDocument) {
      setEditData({
        description: selectedDocument.description || '',
        tags: selectedDocument.tags || '',
        status: selectedDocument.status,
      });
    }
  }, [selectedDocument]);

  if (!isOpen || !selectedDocument) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'uploaded':
        return 'bg-blue-100 text-blue-800';
      case 'processing':
        return 'bg-yellow-100 text-yellow-800';
      case 'processed':
        return 'bg-green-100 text-green-800';
      case 'evaluated':
        return 'bg-purple-100 text-purple-800';
      case 'archived':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatFileSize = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleDownload = async () => {
    try {
      await downloadDocument(selectedDocument);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const handleDelete = async () => {
    if (window.confirm(`Are you sure you want to delete "${selectedDocument.original_filename}"?`)) {
      try {
        await deleteDocument(selectedDocument.id);
        onClose();
      } catch (error) {
        console.error('Delete failed:', error);
      }
    }
  };

  const handleSaveEdit = async () => {
    try {
      await updateDocument(selectedDocument.id, {
        ...editData,
        status: editData.status as DocumentType['status']
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Update failed:', error);
    }
  };

  const handleStartEvaluation = async (evaluationType: string) => {
    setIsStartingEvaluation(true);
    try {
      await createEvaluation({
        document_id: selectedDocument.id,
        evaluation_type: evaluationType,
      });
      // Evaluation started successfully
    } catch (error) {
      console.error('Failed to start evaluation:', error);
    } finally {
      setIsStartingEvaluation(false);
    }
  };

  const hasProcessedContent = selectedDocument.processed_content && 
    !selectedDocument.processed_content.error;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <FileText className="h-6 w-6 text-blue-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900 truncate">
                {selectedDocument.original_filename}
              </h2>
              <p className="text-sm text-gray-500">
                {selectedDocument.folder_name || 'Unfiled'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={handleDownload}
              className="p-2 hover:bg-gray-100 rounded-md transition-colors"
              title="Download"
            >
              <Download className="h-4 w-4 text-gray-500" />
            </button>
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="p-2 hover:bg-gray-100 rounded-md transition-colors"
              title="Edit"
            >
              <Edit className="h-4 w-4 text-gray-500" />
            </button>
            <button
              onClick={handleDelete}
              className="p-2 hover:bg-gray-100 rounded-md transition-colors"
              title="Delete"
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-md transition-colors"
            >
              <X className="h-4 w-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Information */}
            <div className="lg:col-span-2 space-y-6">
              {/* Document Info */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-900 mb-3">Document Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Agency:</span>
                    <span className={cn(
                      "ml-2 inline-flex items-center px-2 py-1 rounded-md text-xs font-medium",
                      selectedDocument.agency === 'HRSA' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                    )}>
                      {selectedDocument.agency}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Type:</span>
                    <span className="ml-2 text-gray-900">
                      {selectedDocument.document_type.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Status:</span>
                    <span className={cn(
                      "ml-2 inline-flex items-center px-2 py-1 rounded-md text-xs font-medium",
                      getStatusColor(selectedDocument.status)
                    )}>
                      {selectedDocument.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Size:</span>
                    <span className="ml-2 text-gray-900">
                      {formatFileSize(selectedDocument.file_size)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">Description</h3>
                {isEditing ? (
                  <textarea
                    value={editData.description}
                    onChange={(e) => setEditData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Enter document description..."
                    rows={3}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                ) : (
                  <p className="text-gray-600 bg-gray-50 rounded-md p-3">
                    {selectedDocument.description || 'No description provided.'}
                  </p>
                )}
              </div>

              {/* Tags */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">Tags</h3>
                {isEditing ? (
                  <input
                    type="text"
                    value={editData.tags}
                    onChange={(e) => setEditData(prev => ({ ...prev, tags: e.target.value }))}
                    placeholder="Add tags separated by commas..."
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                ) : (
                  <div className="bg-gray-50 rounded-md p-3">
                    {selectedDocument.tags ? (
                      <div className="flex flex-wrap gap-2">
                        {selectedDocument.tags.split(',').map((tag, index) => (
                          <span
                            key={index}
                            className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800"
                          >
                            <Tag className="h-3 w-3 mr-1" />
                            {tag.trim()}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-500">No tags assigned.</span>
                    )}
                  </div>
                )}
              </div>

              {/* Processing Results */}
              {hasProcessedContent && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">Processing Results</h3>
                  <div className="bg-green-50 border border-green-200 rounded-md p-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Total Pages:</span>
                        <span className="ml-2 text-gray-900">
                          {selectedDocument.processed_content.total_pages || 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Sections Found:</span>
                        <span className="ml-2 text-gray-900">
                          {Object.keys(selectedDocument.processed_content.sections || {}).length}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Tables Found:</span>
                        <span className="ml-2 text-gray-900">
                          {(selectedDocument.processed_content.tables || []).length}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Processed:</span>
                        <span className="ml-2 text-green-600 font-medium">
                          ✓ Ready for evaluation
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Timestamps */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Timeline</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center text-gray-600">
                    <Calendar className="h-4 w-4 mr-2" />
                    <div>
                      <div className="font-medium">Created</div>
                      <div className="text-xs">{formatDate(selectedDocument.created_at)}</div>
                    </div>
                  </div>
                  <div className="flex items-center text-gray-600">
                    <User className="h-4 w-4 mr-2" />
                    <div>
                      <div className="font-medium">Modified</div>
                      <div className="text-xs">{formatDate(selectedDocument.updated_at)}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-3">Actions</h3>
                <div className="space-y-2">
                  {hasProcessedContent ? (
                    <>
                      <button
                        onClick={() => handleStartEvaluation('comprehensive')}
                        disabled={isStartingEvaluation}
                        className="w-full flex items-center justify-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                      >
                        <ClipboardList className="h-4 w-4 mr-2" />
                        {isStartingEvaluation ? 'Starting...' : 'Start Comprehensive Evaluation'}
                      </button>
                      <button
                        onClick={() => handleStartEvaluation('scoring')}
                        disabled={isStartingEvaluation}
                        className="w-full flex items-center justify-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                      >
                        <PlayCircle className="h-4 w-4 mr-2" />
                        Quick Score Evaluation
                      </button>
                    </>
                  ) : (
                    <div className="text-center p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                      <p className="text-sm text-yellow-800">
                        Document processing is required before evaluation can begin.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        {isEditing && (
          <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
            <button
              onClick={() => {
                setIsEditing(false);
                setEditData({
                  description: selectedDocument.description || '',
                  tags: selectedDocument.tags || '',
                  status: selectedDocument.status,
                });
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
            >
              Save Changes
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentViewer;
