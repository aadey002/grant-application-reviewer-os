import React, { useState, useEffect } from 'react';
import { Upload, FileText, BarChart3, CheckCircle, AlertCircle, Loader2, Brain } from 'lucide-react';
import DocumentUpload from './DocumentUpload';
import AnalysisResults from './AnalysisResults';
import LoadingSpinner from './LoadingSpinner';
import { analyzeSimple, checkHealth, UploadResponse, AnalysisResponse } from '../services/api';

const GrantReviewerApp: React.FC = () => {
  const [uploadedFile, setUploadedFile] = useState<UploadResponse | null>(null);
  const [selectedAgency, setSelectedAgency] = useState<string>('');
  const [analysisData, setAnalysisData] = useState<AnalysisResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentStep, setCurrentStep] = useState<'upload' | 'analyze' | 'results'>('upload');
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [systemHealthy, setSystemHealthy] = useState<boolean>(false);

  const handleFileUploaded = (fileData: UploadResponse, agency: string) => {
    setUploadedFile(fileData);
    setSelectedAgency(agency);
    setCurrentStep('analyze');
    setAnalysisError(null);
  };

  const handleStartAnalysis = async () => {
    if (!uploadedFile) return;
    
    setIsAnalyzing(true);
    setAnalysisError(null);
    
    try {
      const result = await analyzeSimple(uploadedFile.file_id, selectedAgency);
      setAnalysisData(result);
      setCurrentStep('results');
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetApp = () => {
    setUploadedFile(null);
    setSelectedAgency('');
    setAnalysisData(null);
    setCurrentStep('upload');
    setIsAnalyzing(false);
    setAnalysisError(null);
  };

  useEffect(() => {
    const checkSystemHealth = async () => {
      try {
        await checkHealth();
        setSystemHealthy(true);
      } catch {
        setSystemHealthy(false);
      }
    };
    checkSystemHealth();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-blue-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Federal Grant Reviewer AI</h1>
                <p className="text-sm text-gray-600">Intelligent Analysis for HRSA & SAMHSA Applications</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium ${
                systemHealthy 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {systemHealthy ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                <span>{systemHealthy ? 'AI System Ready' : 'System Offline'}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Progress Indicator */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-center space-x-8 mb-8">
          <div className={`flex items-center space-x-2 ${
            currentStep === 'upload' ? 'text-blue-600' : 
            ['analyze', 'results'].includes(currentStep) ? 'text-green-600' : 'text-gray-400'
          }`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              currentStep === 'upload' ? 'bg-blue-100 border-2 border-blue-600' :
              ['analyze', 'results'].includes(currentStep) ? 'bg-green-100 border-2 border-green-600' : 'bg-gray-100 border-2 border-gray-300'
            }`}>
              <Upload className="w-4 h-4" />
            </div>
            <span className="font-medium">Upload Document</span>
          </div>
          
          <div className={`h-px w-16 ${
            ['analyze', 'results'].includes(currentStep) ? 'bg-green-600' : 'bg-gray-300'
          }`} />
          
          <div className={`flex items-center space-x-2 ${
            currentStep === 'analyze' ? 'text-blue-600' : 
            currentStep === 'results' ? 'text-green-600' : 'text-gray-400'
          }`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              currentStep === 'analyze' ? 'bg-blue-100 border-2 border-blue-600' :
              currentStep === 'results' ? 'bg-green-100 border-2 border-green-600' : 'bg-gray-100 border-2 border-gray-300'
            }`}>
              {isAnalyzing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <BarChart3 className="w-4 h-4" />
              )}
            </div>
            <span className="font-medium">AI Analysis</span>
          </div>
          
          <div className={`h-px w-16 ${
            currentStep === 'results' ? 'bg-green-600' : 'bg-gray-300'
          }`} />
          
          <div className={`flex items-center space-x-2 ${
            currentStep === 'results' ? 'text-green-600' : 'text-gray-400'
          }`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              currentStep === 'results' ? 'bg-green-100 border-2 border-green-600' : 'bg-gray-100 border-2 border-gray-300'
            }`}>
              <CheckCircle className="w-4 h-4" />
            </div>
            <span className="font-medium">Review Results</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {isAnalyzing && (
          <div className="mb-8">
            <LoadingSpinner message="AI is analyzing your grant application..." />
          </div>
        )}
        
        {analysisError && (
          <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-red-800">Analysis Error</h4>
              <p className="text-sm text-red-700 mt-1">{analysisError}</p>
            </div>
            <button
              onClick={() => setAnalysisError(null)}
              className="text-red-400 hover:text-red-600"
            >
              <AlertCircle className="w-4 h-4" />
            </button>
          </div>
        )}
        
        {currentStep === 'upload' && (
          <DocumentUpload onFileUploaded={handleFileUploaded} />
        )}
        
        {currentStep === 'analyze' && uploadedFile && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Ready for AI Analysis</h2>
              <p className="text-gray-600 mb-6">Your grant application is ready for comprehensive evaluation</p>
              
              <div className="bg-gray-50 rounded-lg p-6 mb-6 text-left max-w-2xl mx-auto">
                <h3 className="font-semibold text-gray-900 mb-4">Document Details:</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">File Name:</span>
                      <span className="font-medium text-right">{uploadedFile.filename}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">File Size:</span>
                      <span className="font-medium">{(uploadedFile.size / 1024).toFixed(1)} KB</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Agency:</span>
                      <span className="font-medium">{selectedAgency}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Document ID:</span>
                      <span className="font-medium">{uploadedFile.document_id}</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="bg-blue-50 rounded-lg p-4 mb-6 text-left max-w-2xl mx-auto">
                <h4 className="font-semibold text-blue-900 mb-2">AI Analysis Will Include:</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-blue-800">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-blue-600" />
                    <span>Comprehensive scoring</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-blue-600" />
                    <span>Strengths identification</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-blue-600" />
                    <span>Areas for improvement</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-blue-600" />
                    <span>Compliance verification</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-blue-600" />
                    <span>Funding recommendation</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-blue-600" />
                    <span>Detailed report generation</span>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-center space-x-4">
                <button
                  onClick={resetApp}
                  className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Upload Different File
                </button>
                <button
                  onClick={handleStartAnalysis}
                  disabled={isAnalyzing}
                  className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all transform hover:scale-105 font-medium flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                >
                  <Brain className="w-5 h-5" />
                  <span>Start AI Analysis</span>
                </button>
              </div>
            </div>
          </div>
        )}
        
        {currentStep === 'results' && analysisData && uploadedFile && (
          <AnalysisResults 
            data={analysisData} 
            fileName={uploadedFile.filename}
            agency={selectedAgency}
            onReset={resetApp} 
          />
        )}
      </main>
      
      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center text-gray-600">
            <p className="text-sm">Federal Grant Reviewer AI • Professional Grant Analysis Tool</p>
            <p className="text-xs mt-1">Powered by advanced AI for comprehensive grant evaluation</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default GrantReviewerApp;