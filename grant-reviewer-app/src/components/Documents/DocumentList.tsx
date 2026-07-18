/**
 * Document List Component
 * 
 * Displays documents in either grid or list view.
 * Supports selection and interaction with individual documents.
 */

import React from 'react';
import { FileText, Folder } from 'lucide-react';
import { Document } from '../../services/api';
import DocumentCard from './DocumentCard';
import DocumentListItem from './DocumentListItem';

interface DocumentListProps {
  documents: Document[];
  viewMode: 'grid' | 'list';
  onDocumentSelect: (show: boolean) => void;
}

const DocumentList: React.FC<DocumentListProps> = ({
  documents,
  viewMode,
  onDocumentSelect,
}) => {
  if (documents.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="h-16 w-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No documents found
          </h3>
          <p className="text-gray-500 mb-4">
            Get started by uploading your first grant application document.
          </p>
          <button className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">
            <FileText className="h-4 w-4 mr-2" />
            Upload Document
          </button>
        </div>
      </div>
    );
  }

  if (viewMode === 'grid') {
    return (
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {documents.map((document) => (
            <DocumentCard
              key={document.id}
              document={document}
              onClick={() => onDocumentSelect(true)}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {/* Table Header */}
        <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
          <div className="grid grid-cols-12 gap-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
            <div className="col-span-4">Document</div>
            <div className="col-span-2">Agency</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Size</div>
            <div className="col-span-2">Modified</div>
          </div>
        </div>
        
        {/* Table Body */}
        <div className="divide-y divide-gray-200">
          {documents.map((document) => (
            <DocumentListItem
              key={document.id}
              document={document}
              onClick={() => onDocumentSelect(true)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default DocumentList;
