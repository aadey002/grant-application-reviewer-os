/**
 * Document Card Component
 * 
 * Displays a single document in card format with preview,
 * metadata, and action buttons.
 */

import React, { useState } from 'react';
import {
  FileText,
  Download,
  Eye,
  Edit,
  Trash2,
  MoreVertical,
  Clock,
  User,
  Calendar,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Document } from '../../services/api';
import { useDocumentActions } from '../../hooks/useAPI';
import { useApp } from '../../contexts/AppContext';

interface DocumentCardProps {
  document: Document;
  onClick: () => void;
  className?: string;
}

const DocumentCard: React.FC<DocumentCardProps> = ({
  document,
  onClick,
  className,
}) => {
  const { selectDocument, downloadDocument, deleteDocument } = useDocumentActions();
  const { dispatch } = useApp();
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

  const getAgencyColor = (agency: string) => {
    switch (agency) {
      case 'HRSA':
        return 'bg-blue-100 text-blue-800';
      case 'SAMHSA':
        return 'bg-green-100 text-green-800';
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
        "bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow cursor-pointer relative group",
        isDeleting && "opacity-50 pointer-events-none",
        className
      )}
      onClick={handleView}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            <div className="flex-shrink-0">
              <FileText className="h-8 w-8 text-blue-600" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-medium text-gray-900 truncate" title={document.original_filename}>
                {document.original_filename}
              </h3>
              <p className="text-xs text-gray-500 truncate mt-1" title={document.description}>
                {document.description || 'No description'}
              </p>
            </div>
          </div>
          
          {/* Actions Menu */}
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

      {/* Body */}
      <div className="p-4 space-y-3">
        {/* Status and Agency */}
        <div className="flex items-center justify-between">
          <span className={cn(
            "inline-flex items-center px-2 py-1 rounded-md text-xs font-medium",
            getStatusColor(document.status)
          )}>
            {document.status.replace('_', ' ').toUpperCase()}
          </span>
          
          <span className={cn(
            "inline-flex items-center px-2 py-1 rounded-md text-xs font-medium",
            getAgencyColor(document.agency)
          )}>
            {document.agency}
          </span>
        </div>
        
        {/* Metadata */}
        <div className="space-y-2 text-xs text-gray-500">
          <div className="flex items-center">
            <Calendar className="h-3 w-3 mr-2" />
            {formatDate(document.created_at)}
          </div>
          <div className="flex items-center">
            <User className="h-3 w-3 mr-2" />
            {formatFileSize(document.file_size)}
          </div>
          {document.folder_name && (
            <div className="flex items-center">
              <FileText className="h-3 w-3 mr-2" />
              {document.folder_name}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {document.document_type}
          </span>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={handleView}
              className="text-blue-600 hover:text-blue-700 text-xs font-medium"
            >
              View Details
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentCard;
