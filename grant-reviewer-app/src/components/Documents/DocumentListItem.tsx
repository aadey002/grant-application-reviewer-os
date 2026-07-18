/**
 * Document List Item Component
 * 
 * Displays a single document in list/table format.
 */

import React, { useState } from 'react';
import {
  FileText,
  Download,
  Eye,
  Trash2,
  MoreVertical,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Document } from '../../services/api';
import { useDocumentActions } from '../../hooks/useAPI';
import { useApp } from '../../contexts/AppContext';

interface DocumentListItemProps {
  document: Document;
  onClick: () => void;
}

const DocumentListItem: React.FC<DocumentListItemProps> = ({
  document,
  onClick,
}) => {
  const { selectDocument, downloadDocument, deleteDocument } = useDocumentActions();
  const [showActions, setShowActions] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
      month: 'short',
      day: 'numeric',
    });
  };

  const handleView = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectDocument(document);
    onClick();
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await downloadDocument(document);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete "${document.original_filename}"?`)) {
      setIsDeleting(true);
      try {
        await deleteDocument(document.id);
      } catch (error) {
        console.error('Delete failed:', error);
      } finally {
        setIsDeleting(false);
      }
    }
  };

  return (
    <div
      className={cn(
        "px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors relative group",
        isDeleting && "opacity-50 pointer-events-none"
      )}
      onClick={handleView}
    >
      <div className="grid grid-cols-12 gap-4 items-center">
        {/* Document Name */}
        <div className="col-span-4 flex items-center space-x-3">
          <FileText className="h-5 w-5 text-blue-600 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 truncate">
              {document.original_filename}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {document.description || 'No description'}
            </p>
          </div>
        </div>

        {/* Agency */}
        <div className="col-span-2">
          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">
            {document.agency}
          </span>
        </div>

        {/* Status */}
        <div className="col-span-2">
          <span className={cn(
            "inline-flex items-center px-2 py-1 rounded-md text-xs font-medium",
            getStatusColor(document.status)
          )}>
            {document.status.replace('_', ' ').toUpperCase()}
          </span>
        </div>

        {/* Size */}
        <div className="col-span-2">
          <span className="text-sm text-gray-900">
            {formatFileSize(document.file_size)}
          </span>
        </div>

        {/* Modified Date */}
        <div className="col-span-2 flex items-center justify-between">
          <span className="text-sm text-gray-500">
            {formatDate(document.updated_at)}
          </span>
          
          {/* Actions */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowActions(!showActions);
              }}
              className="p-1 rounded-md hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreVertical className="h-4 w-4 text-gray-400" />
            </button>
            
            {showActions && (
              <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                <button
                  onClick={handleView}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center"
                >
                  <Eye className="h-3 w-3 mr-2" />
                  View
                </button>
                <button
                  onClick={handleDownload}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center"
                >
                  <Download className="h-3 w-3 mr-2" />
                  Download
                </button>
                <button
                  onClick={handleDelete}
                  className="w-full text-left px-3 py-2 text-sm text-red-700 hover:bg-red-50 flex items-center"
                >
                  <Trash2 className="h-3 w-3 mr-2" />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentListItem;
