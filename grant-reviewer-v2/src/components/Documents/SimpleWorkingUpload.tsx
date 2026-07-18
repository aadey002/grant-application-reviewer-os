import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DocumentUploadRequest } from '@/types/api-responses';

interface SimpleWorkingUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (files: FileList, metadata: DocumentUploadRequest) => Promise<any>;
}

export function SimpleWorkingUpload({ open, onOpenChange, onUpload }: SimpleWorkingUploadProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);



  // Handle file selection
  const addFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    setSelectedFiles(prev => [...prev, ...fileArray]);
  };

  // Click handler for file input
  const handleBrowseClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // File input change - handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      // Clear the input to allow selecting the same file again
      e.target.value = '';
    }
  };

  // Drag and drop handlers
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      addFiles(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  // Remove file
  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Upload files with error handling
  const handleUpload = async () => {
    if (typeof onUpload !== 'function') {
      alert('Upload function not available. Please refresh the page and try again.');
      return;
    }
    
    if (selectedFiles.length === 0) {
      alert('Please select files first!');
      return;
    }

    setIsUploading(true);

    try {
      // Create a proper FileList-like object
      const fileList = Object.assign(selectedFiles, {
        item: (index: number) => selectedFiles[index] || null,
        length: selectedFiles.length
      }) as any as FileList;

      const metadata: DocumentUploadRequest = {
        category: 'reference' as const,
        agency: 'HRSA' as any,
        sub_type: 'rubric',
        description: 'Uploaded document',
        folder_id: null // Will be overridden in DocumentManager
      };
      
      const uploadResult = await onUpload(fileList, metadata);
      
      // Reset state on success
      setSelectedFiles([]);
      onOpenChange(false);
      
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload failed: ' + (error as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  // Reset when dialog closes
  const handleClose = () => {
    if (!isUploading) {
      setSelectedFiles([]);
      onOpenChange(false);
    }
  };



  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Documents</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.txt"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          {/* Drop area */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragOver 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={handleBrowseClick}
          >
            <div className="space-y-3">
              <div className="text-4xl">📁</div>
              <div className="text-lg font-medium">
                Drop files here or click to browse
              </div>
              <div className="text-sm text-gray-500">
                PDF, DOC, DOCX, TXT files supported
              </div>
            </div>
          </div>

          {/* Selected files list */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium">Selected Files ({selectedFiles.length}):</h4>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {selectedFiles.map((file, index) => (
                  <div 
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm"
                  >
                    <div className="flex-1 truncate">
                      <span className="font-medium">{file.name}</span>
                      <span className="text-gray-500 ml-2">
                        ({(file.size / 1024 / 1024).toFixed(2)} MB)
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(index);
                      }}
                      className="text-red-500 hover:text-red-700 ml-2"
                      disabled={isUploading}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}



          {/* Actions */}
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              onClick={handleClose}
              disabled={isUploading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleUpload}
              disabled={selectedFiles.length === 0 || isUploading}
              className="flex-1"
              type="button"
            >
              {isUploading ? 'Uploading...' : `Upload ${selectedFiles.length} file(s)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
