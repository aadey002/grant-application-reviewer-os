import React, { useState } from 'react';
import { FileText, Calendar, User, AlertCircle, MoreVertical, Trash2, Edit, Eye } from 'lucide-react';
import type { Document } from '@/types/api-responses';

interface DocumentListProps {
  documents: Document[];
  viewMode: 'grid' | 'list';
  loading: boolean;
  error: any;
  onSelectDocument: (doc: Document) => void;
  selectedDocument: Document | null;
  onDeleteDocument?: (doc: Document) => void;
}

const DocumentList: React.FC<DocumentListProps> = ({
  documents,
  viewMode,
  loading,
  error,
  onSelectDocument,
  selectedDocument,
  onDeleteDocument
}) => {
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);

  const handleDeleteClick = (e: React.MouseEvent, doc: Document) => {
    e.stopPropagation();
    if (onDeleteDocument && window.confirm(`Are you sure you want to delete "${doc.title}"?`)) {
      onDeleteDocument(doc);
    }
    setActiveDropdown(null);
  };

  const handleDropdownClick = (e: React.MouseEvent, docId: number) => {
    e.stopPropagation();
    setActiveDropdown(activeDropdown === docId ? null : docId);
  };

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = () => setActiveDropdown(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);
  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="animate-pulse space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-slate-200 rounded-lg"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-200 rounded"></div>
                <div className="h-3 bg-slate-200 rounded w-3/4"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="text-center py-8">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-red-600">Failed to load documents</p>
        </div>
      </div>
    );
  }

  if (!documents.length) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">No documents found</h3>
          <p className="text-slate-500">Upload your first document to get started</p>
        </div>
      </div>
    );
  }

  const formatFileSize = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'uploaded': return 'bg-blue-100 text-blue-800';
      case 'processing': return 'bg-yellow-100 text-yellow-800';
      case 'processed': return 'bg-green-100 text-green-800';
      case 'evaluated': return 'bg-purple-100 text-purple-800';
      case 'archived': return 'bg-gray-100 text-gray-800';
      case 'error': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getAgencyColor = (agency: string) => {
    switch (agency) {
      case 'HRSA': return 'bg-blue-100 text-blue-800';
      case 'SAMHSA': return 'bg-green-100 text-green-800';
      case 'NIH': return 'bg-purple-100 text-purple-800';
      case 'CDC': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (viewMode === 'grid') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {documents.map((doc) => (
          <div
            key={doc.id}
            onClick={() => onSelectDocument(doc)}
            className={`bg-white rounded-lg border border-slate-200 p-4 cursor-pointer hover:shadow-md transition-shadow relative ${
              selectedDocument?.id === doc.id ? 'ring-2 ring-blue-500' : ''
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex items-center space-x-2">
                <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-md ${getStatusColor(doc.status)}`}>
                  {doc.status}
                </span>
                {onDeleteDocument && (
                  <div className="relative">
                    <button
                      onClick={(e) => handleDropdownClick(e, doc.id)}
                      className="p-1 hover:bg-slate-100 rounded-md transition-colors"
                    >
                      <MoreVertical className="w-4 h-4 text-slate-400" />
                    </button>
                    {activeDropdown === doc.id && (
                      <div className="absolute right-0 top-8 bg-white border border-slate-200 rounded-md shadow-lg z-10 min-w-[120px]">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectDocument(doc);
                            setActiveDropdown(null);
                          }}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 flex items-center space-x-2"
                        >
                          <Eye className="w-4 h-4" />
                          <span>View</span>
                        </button>
                        <button
                          onClick={(e) => handleDeleteClick(e, doc)}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center space-x-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <h3 className="font-medium text-slate-900 mb-1 truncate" title={doc.title}>
              {doc.title}
            </h3>
            
            <p className="text-sm text-slate-500 mb-3 line-clamp-2">
              {doc.description || 'No description available'}
            </p>
            
            <div className="flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center space-x-2">
                <span className={`inline-flex px-2 py-1 font-medium rounded-md ${getAgencyColor(doc.agency)}`}>
                  {doc.agency}
                </span>
                <span>{formatFileSize(doc.file_size)}</span>
              </div>
              <span>{formatDate(doc.created_at)}</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Document
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Agency
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Size
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                Date
              </th>
              {onDeleteDocument && (
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {documents.map((doc) => (
              <tr
                key={doc.id}
                onClick={() => onSelectDocument(doc)}
                className={`cursor-pointer hover:bg-slate-50 ${
                  selectedDocument?.id === doc.id ? 'bg-blue-50' : ''
                }`}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                      <FileText className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-900 truncate max-w-xs" title={doc.title}>
                        {doc.title}
                      </div>
                      <div className="text-sm text-slate-500 truncate max-w-xs">
                        {doc.description || 'No description'}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-md ${getAgencyColor(doc.agency)}`}>
                    {doc.agency}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-md ${getStatusColor(doc.status)}`}>
                    {doc.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  {formatFileSize(doc.file_size)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                  {formatDate(doc.created_at)}
                </td>
                {onDeleteDocument && (
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    <div className="relative">
                      <button
                        onClick={(e) => handleDropdownClick(e, doc.id)}
                        className="p-1 hover:bg-slate-100 rounded-md transition-colors"
                      >
                        <MoreVertical className="w-4 h-4 text-slate-400" />
                      </button>
                      {activeDropdown === doc.id && (
                        <div className="absolute right-0 top-8 bg-white border border-slate-200 rounded-md shadow-lg z-10 min-w-[120px]">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectDocument(doc);
                              setActiveDropdown(null);
                            }}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 flex items-center space-x-2"
                          >
                            <Eye className="w-4 h-4" />
                            <span>View</span>
                          </button>
                          <button
                            onClick={(e) => handleDeleteClick(e, doc)}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center space-x-2"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DocumentList;
