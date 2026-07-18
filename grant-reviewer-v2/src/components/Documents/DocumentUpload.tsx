import React, { useState } from 'react';
import { Upload, FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/services/api';

interface DocumentUploadProps {
  isOpen?: boolean;
  onUpload?: (file: File) => void;
  onClose?: () => void;
  folderId?: number;
  onUploadComplete?: () => void;
}

const DocumentUpload: React.FC<DocumentUploadProps> = ({ 
  isOpen = false, 
  onUpload, 
  onClose, 
  folderId, 
  onUploadComplete 
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  
  // Don't render if not open
  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const files = Array.from(e.dataTransfer.files);
      setSelectedFiles(files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setSelectedFiles(files);
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    
    setIsUploading(true);
    
    try {
      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append('file', file);
        if (folderId) formData.append('folder_id', folderId.toString());
        formData.append('agency', 'HRSA'); // Default agency
        formData.append('document_type', 'application');
        formData.append('description', `Uploaded: ${file.name}`);
        
        const result = await api.documents.upload(formData);
        console.log('Upload successful:', result);
      }
      
      toast({
        title: "Upload Successful",
        description: `Successfully uploaded ${selectedFiles.length} file(s)`
      });
      
      setSelectedFiles([]);
      onUploadComplete?.();
      onClose?.();
      
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" style={{ zIndex: 9999 }}>
      <Card className="w-full max-w-2xl mx-auto m-4 relative">
        <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Upload Document</h3>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragActive 
              ? 'border-blue-500 bg-blue-50' 
              : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
          <p className="text-lg font-medium text-gray-900 mb-2">
            Drop files here or click to browse
          </p>
          <p className="text-sm text-gray-500 mb-4">
            Supports PDF, DOC, DOCX files up to 50MB
          </p>
          
          <input
            type="file"
            multiple
            accept=".pdf,.doc,.docx"
            onChange={handleFileSelect}
            className="hidden"
            id="file-upload"
          />
          
          <label htmlFor="file-upload">
            <Button variant="outline" className="cursor-pointer">
              Browse Files
            </Button>
          </label>
        </div>
        
        {selectedFiles.length > 0 && (
          <div className="mt-4">
            <h4 className="font-medium mb-2">Selected Files:</h4>
            <div className="space-y-2">
              {selectedFiles.map((file, index) => (
                <div key={index} className="flex items-center space-x-2 p-2 bg-gray-50 rounded">
                  <FileText className="h-4 w-4 text-gray-500" />
                  <span className="text-sm">{file.name}</span>
                  <span className="text-xs text-gray-500">
                    ({(file.size / 1024 / 1024).toFixed(2)} MB)
                  </span>
                </div>
              ))}
            </div>
            
            <div className="flex justify-end space-x-3 mt-4">
              <Button 
                variant="outline" 
                onClick={() => setSelectedFiles([])}
              >
                Clear
              </Button>
              <Button 
                onClick={handleUpload}
                disabled={isUploading}
              >
                {isUploading ? 'Uploading...' : `Upload ${selectedFiles.length} file(s)`}
              </Button>
            </div>
          </div>
        )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DocumentUpload;
