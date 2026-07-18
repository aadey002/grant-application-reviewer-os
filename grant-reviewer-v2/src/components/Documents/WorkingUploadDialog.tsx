import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DocumentUploadRequest } from '@/types/api-responses';

interface WorkingUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (files: FileList, metadata: DocumentUploadRequest) => Promise<void>;
}

export function WorkingUploadDialog({ open, onOpenChange, onUpload }: WorkingUploadDialogProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    console.log('🎯 Files dropped:', files.map(f => f.name));
    setSelectedFiles(files);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleBrowseClick = () => {
    console.log('📁 Browse button clicked');
    fileInputRef.current?.click();
  };

  // Use a different approach for file selection - programmatic trigger
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('📁 Direct file input change detected');
    if (e.target.files) {
      const files = Array.from(e.target.files);
      console.log('📁 Files selected via input:', files.map(f => f.name));
      setSelectedFiles(files);
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      console.log('❌ No files selected');
      return;
    }

    setIsUploading(true);
    try {
      // Convert File[] back to FileList
      const fileList = {
        length: selectedFiles.length,
        item: (index: number) => selectedFiles[index] || null,
        [Symbol.iterator]: function* () {
          for (let i = 0; i < selectedFiles.length; i++) {
            yield selectedFiles[i];
          }
        }
      } as FileList;

      const metadata = {
        category: 'reference' as const,
        agency: 'HRSA' as any,
        sub_type: 'rubric',
        description: 'Uploaded document'
      };

      console.log('🚀 Starting upload with working method...');
      await onUpload(fileList, metadata);
      
      // Reset and close
      setSelectedFiles([]);
      onOpenChange(false);
    } catch (error) {
      console.error('❌ Upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Files (Working Version)</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.txt"
            onChange={handleFileInputChange}
            style={{ display: 'none' }}
          />

          {/* Drag & Drop Area */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              dragOver 
                ? 'border-blue-400 bg-blue-50' 
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onClick={handleBrowseClick}
          >
            <div className="space-y-2">
              <div className="text-gray-600">
                <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="text-sm font-medium text-gray-900">
                Click to browse or drag files here
              </div>
              <div className="text-xs text-gray-500">
                PDF, DOC, DOCX, TXT files
              </div>
            </div>
          </div>

          {/* Selected Files */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Selected Files:</h4>
              <div className="space-y-1">
                {selectedFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                    <span>{file.name}</span>
                    <span className="text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpload}
              disabled={selectedFiles.length === 0 || isUploading}
            >
              {isUploading ? 'Uploading...' : `Upload ${selectedFiles.length} file(s)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
