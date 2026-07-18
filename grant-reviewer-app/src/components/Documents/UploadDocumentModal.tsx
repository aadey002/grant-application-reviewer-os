/**
 * Upload Document Modal Component
 * 
 * Provides interface for uploading new grant application documents
 * with drag-and-drop support and metadata input.
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  X,
  Upload,
  FileText,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useDocumentActions } from '../../hooks/useAPI';
import { useFolders } from '../../contexts/AppContext';

interface UploadDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  folderId?: number;
}

const UploadDocumentModal: React.FC<UploadDocumentModalProps> = ({
  isOpen,
  onClose,
  folderId,
}) => {
  const { uploadDocument } = useDocumentActions();
  const { folders } = useFolders();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  
  const [metadata, setMetadata] = useState({
    folder_id: folderId,
    agency: 'HRSA',
    document_type: 'application',
    description: '',
  });

  const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  const maxFileSize = 100 * 1024 * 1024; // 100MB

  const resetModal = () => {
    setSelectedFile(null);
    setIsDragOver(false);
    setIsUploading(false);
    setUploadError(null);
    setUploadSuccess(false);
    setMetadata({
      folder_id: folderId,
      agency: 'HRSA',
      document_type: 'application',
      description: '',
    });
  };

  const handleClose = () => {
    if (!isUploading) {
      resetModal();
      onClose();
    }
  };

  const validateFile = (file: File): string | null => {
    if (!allowedTypes.includes(file.type)) {
      return 'Please select a PDF or Word document (.pdf, .doc, .docx)';
    }
    
    if (file.size > maxFileSize) {
      return 'File size must be less than 100MB';
    }
    
    return null;
  };

  const handleFileSelect = (file: File) => {
    const error = validateFile(file);
    if (error) {
      setUploadError(error);
      return;
    }
    
    setSelectedFile(file);
    setUploadError(null);
    
    // Auto-fill description with filename if empty
    if (!metadata.description) {
      setMetadata(prev => ({
        ...prev,
        description: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
      }));
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, []);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    
    setIsUploading(true);
    setUploadError(null);
    
    try {
      await uploadDocument(selectedFile, {
        folder_id: metadata.folder_id,
        agency: metadata.agency,
        document_type: metadata.document_type,
        description: metadata.description,
      });
      
      setUploadSuccess(true);
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Upload Document
          </h2>
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="p-2 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* File Upload Area */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Document
            </label>
            
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                isDragOver
                  ? "border-blue-500 bg-blue-50"
                  : selectedFile
                  ? "border-green-500 bg-green-50"
                  : "border-gray-300 hover:border-gray-400"
              )}
              onDragEnter={handleDragIn}
              onDragLeave={handleDragOut}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              {selectedFile ? (
                <div className="flex items-center justify-center space-x-3">
                  <FileText className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatFileSize(selectedFile.size)}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedFile(null)}
                    className="p-1 hover:bg-green-100 rounded-md"
                  >
                    <X className="h-4 w-4 text-green-600" />
                  </button>
                </div>
              ) : (
                <div>
                  <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-sm text-gray-600 mb-2">
                    Drag and drop a document here, or click to select
                  </p>
                  <p className="text-xs text-gray-500">
                    Supports PDF, DOC, and DOCX files up to 100MB
                  </p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-4 inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Select File
                  </button>
                </div>
              )}
            </div>
            
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>

          {/* Metadata Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Folder */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Folder
              </label>
              <select
                value={metadata.folder_id || ''}
                onChange={(e) => setMetadata(prev => ({
                  ...prev,
                  folder_id: e.target.value ? parseInt(e.target.value) : undefined,
                }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">No folder (Unfiled)</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Agency */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Agency
              </label>
              <select
                value={metadata.agency}
                onChange={(e) => setMetadata(prev => ({ ...prev, agency: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="HRSA">HRSA</option>
                <option value="SAMHSA">SAMHSA</option>
                <option value="NIH">NIH</option>
                <option value="CDC">CDC</option>
              </select>
            </div>

            {/* Document Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Document Type
              </label>
              <select
                value={metadata.document_type}
                onChange={(e) => setMetadata(prev => ({ ...prev, document_type: e.target.value }))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="application">Grant Application</option>
                <option value="nofo">NOFO Document</option>
                <option value="supporting">Supporting Document</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description (Optional)
            </label>
            <textarea
              value={metadata.description}
              onChange={(e) => setMetadata(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Brief description of the document..."
              rows={3}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Error/Success Messages */}
          {uploadError && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-start">
              <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 mr-2 flex-shrink-0" />
              <p className="text-sm text-red-800">{uploadError}</p>
            </div>
          )}
          
          {uploadSuccess && (
            <div className="bg-green-50 border border-green-200 rounded-md p-3 flex items-start">
              <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 mr-2 flex-shrink-0" />
              <p className="text-sm text-green-800">Document uploaded successfully!</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!selectedFile || isUploading || uploadSuccess}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {isUploading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload Document
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadDocumentModal;
