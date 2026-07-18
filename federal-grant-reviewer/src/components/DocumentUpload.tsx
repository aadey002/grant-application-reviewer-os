import React, { useState, useCallback } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, X, Info } from 'lucide-react';
import { uploadDocument } from '../services/api';

interface DocumentUploadProps {
  onFileUploaded: (fileData: any, agency: string) => void;
}

const DocumentUpload: React.FC<DocumentUploadProps> = ({ onFileUploaded }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedAgency, setSelectedAgency] = useState('HRSA');
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  }, [selectedAgency]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleFileUpload = async (file: File) => {
    setUploadError(null);
    
    // Validate file type
    const allowedTypes = ['.pdf', '.doc', '.docx', '.txt'];
    const fileName = file.name.toLowerCase();
    const isValidType = allowedTypes.some(type => fileName.endsWith(type));
    
    if (!isValidType) {
      setUploadError(`File type not supported. Please upload: ${allowedTypes.join(', ').toUpperCase()}`);
      return;
    }
    
    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File size exceeds 10MB limit. Please upload a smaller file.');
      return;
    }
    
    try {
      const result = await uploadDocument(file, selectedAgency);
      onFileUploaded(result, selectedAgency);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Upload className="w-8 h-8 text-blue-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Upload Grant Application</h2>
        <p className="text-gray-600">Upload your federal grant application for comprehensive AI-powered analysis and evaluation</p>
      </div>

      {/* Agency Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select Funding Agency
        </label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {['HRSA', 'SAMHSA', 'NIH', 'CDC'].map((agency) => (
            <button
              key={agency}
              onClick={() => setSelectedAgency(agency)}
              className={`px-4 py-3 rounded-lg border transition-all text-sm font-medium ${
                selectedAgency === agency
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300 hover:bg-blue-50'
              }`}
            >
              {agency}
            </button>
          ))}
        </div>
        {selectedAgency && (
          <div className="mt-3 p-3 bg-blue-50 rounded-lg flex items-start space-x-2">
            <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <strong>{selectedAgency}</strong> evaluation criteria will be applied:
              {selectedAgency === 'HRSA' && ' Program Design, Organizational Capacity, Evaluation Plan, Budget, Community Engagement, Sustainability'}
              {selectedAgency === 'SAMHSA' && ' Statement of Need, Project Description, Evaluation Plan, Staff Qualifications, Budget Narrative'}
              {selectedAgency === 'NIH' && ' Significance, Innovation, Approach, Environment, Investigators'}
              {selectedAgency === 'CDC' && ' Technical Approach, Evaluation Plan, Organizational Capacity, Budget Justification'}
            </div>
          </div>
        )}
      </div>

      {/* Upload Area */}
      <div
        className={`relative border-2 border-dashed rounded-xl p-8 transition-all ${
          isDragOver
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 hover:border-blue-300'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".pdf,.doc,.docx,.txt"
          onChange={handleFileSelect}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        
        <div className="text-center">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-900 mb-2">
            Drag and drop your grant application here, or click to browse
          </p>
          <p className="text-sm text-gray-600 mb-4">
            Supported formats: PDF, DOC, DOCX, TXT • Maximum size: 10MB
          </p>
          <button className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all transform hover:scale-105 font-medium shadow-lg">
            <Upload className="w-5 h-5 mr-2" />
            Choose File
          </button>
        </div>
      </div>

      {/* Error Display */}
      {uploadError && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-red-800">Upload Error</h4>
            <p className="text-sm text-red-700 mt-1">{uploadError}</p>
          </div>
          <button
            onClick={() => setUploadError(null)}
            className="text-red-400 hover:text-red-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Features */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex items-center space-x-3 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <span className="text-sm font-medium text-green-800">AI-Powered Scoring</span>
        </div>
        <div className="flex items-center space-x-3 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
          <CheckCircle className="w-5 h-5 text-blue-600" />
          <span className="text-sm font-medium text-blue-800">Comprehensive Analysis</span>
        </div>
        <div className="flex items-center space-x-3 p-4 bg-gradient-to-r from-purple-50 to-violet-50 rounded-lg border border-purple-200">
          <CheckCircle className="w-5 h-5 text-purple-600" />
          <span className="text-sm font-medium text-purple-800">Professional Reports</span>
        </div>
      </div>
    </div>
  );
};

export default DocumentUpload;