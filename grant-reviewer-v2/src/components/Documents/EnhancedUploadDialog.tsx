import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DocumentUploadRequest } from '@/types/api-responses';

interface EnhancedUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (files: FileList, metadata: DocumentUploadRequest) => Promise<void>;
}

const AGENCIES = [
  { value: 'HRSA', label: 'HRSA (Health Resources and Services Administration)' },
  { value: 'SAMHSA', label: 'SAMHSA (Substance Abuse and Mental Health Services)' },
  { value: 'NIH', label: 'NIH (National Institutes of Health)' },
  { value: 'CDC', label: 'CDC (Centers for Disease Control and Prevention)' },
  { value: 'OTHER', label: 'Other Agency' }
];

const REFERENCE_TYPES = [
  { value: 'rubric', label: 'Scoring Rubric', description: 'Document defining scoring criteria and standards' },
  { value: 'guidelines', label: 'Evaluation Guidelines', description: 'Instructions for reviewing and evaluation' },
  { value: 'template', label: 'Template/Form', description: 'Standard forms and templates' },
  { value: 'policy', label: 'Policy Document', description: 'Agency policies and regulations' },
  { value: 'other', label: 'Other Reference', description: 'Other reference materials' }
];

const APPLICATION_TYPES = [
  { value: 'grant_proposal', label: 'Grant Proposal', description: 'Complete grant application to review' },
  { value: 'research_proposal', label: 'Research Proposal', description: 'Research-focused grant application' },
  { value: 'training_proposal', label: 'Training Proposal', description: 'Training or education grant application' },
  { value: 'service_proposal', label: 'Service Proposal', description: 'Service delivery grant application' },
  { value: 'other', label: 'Other Application', description: 'Other type of grant application' }
];

export function EnhancedUploadDialog({ open, onOpenChange, onUpload }: EnhancedUploadDialogProps) {
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Debug: Log state changes
  console.log('EnhancedUploadDialog render - selectedFiles:', selectedFiles, 'isUploading:', isUploading, 'buttonDisabled:', !selectedFiles || isUploading);

  // Reset file input when dialog opens
  useEffect(() => {
    if (open && fileInputRef.current) {
      console.log('🔄 Dialog opened, resetting file input');
      fileInputRef.current.value = '';
      setSelectedFiles(null);
    }
  }, [open]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('🔥 File input changed! Event:', e);
    console.log('🔥 Files from event:', e.target.files);
    console.log('🔥 Number of files:', e.target.files?.length);
    
    if (e.target.files && e.target.files.length > 0) {
      console.log('🔥 Files selected:', Array.from(e.target.files).map(f => f.name));
      setSelectedFiles(e.target.files);
      console.log('🔥 selectedFiles state updated with files');
    } else {
      console.log('🔥 No files selected or null');
      setSelectedFiles(null);
    }
  };

  const handleUpload = async () => {
    console.log('Simple upload button clicked');
    console.log('Selected files:', selectedFiles);
    console.log('Files length:', selectedFiles?.length);
    
    if (!selectedFiles || selectedFiles.length === 0) {
      console.log('No files selected');
      return;
    }

    console.log('Starting simple upload...');
    console.log('Files to upload:', Array.from(selectedFiles).map(f => f.name));
    setIsUploading(true);
    try {
      const metadata = {
        category: 'reference' as const,
        agency: 'HRSA' as any,
        sub_type: 'rubric',
        description: 'Uploaded document'
      };
      console.log('Upload metadata:', metadata);
      console.log('Calling onUpload function...');
      
      await onUpload(selectedFiles, metadata);
      
      console.log('🎉 Upload completed successfully');
      
      // Reset and close
      setSelectedFiles(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      onOpenChange(false);
    } catch (error) {
      console.error('Upload failed with error:', error);
      console.error('Error details:', error.message, error.stack);
    } finally {
      console.log('Setting isUploading to false');
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Files</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.txt"
              onChange={handleFileChange}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              id="file-upload-input"
            />
            {selectedFiles && (
              <p className="text-sm text-gray-600 mt-1">
                {selectedFiles.length} file(s) selected
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpload}
              disabled={!selectedFiles || isUploading}
            >
              {isUploading ? 'Uploading...' : 'Upload'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
