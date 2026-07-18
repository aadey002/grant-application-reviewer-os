import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  Maximize2, 
  Minimize2, 
  Save, 
  Download,
  Share,
  Settings,
  RefreshCw
} from 'lucide-react';
import { api } from '@/services/api';
import DocumentViewer from './DocumentViewer';
import EvaluationForm from './EvaluationForm';
import { useApp } from '@/contexts/AppContext';

interface Document {
  id: number;
  title: string;
  filename: string;
  file_size: number;
  agency: string;
  document_type: string;
  status: string;
  description?: string;
  created_at: string;
}

interface EvaluationWorkspaceProps {
  documentId?: number;
}

const EvaluationWorkspace: React.FC<EvaluationWorkspaceProps> = ({ documentId: propDocumentId }) => {
  const { documentId: paramDocumentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const { dispatch } = useApp();
  
  const documentId = propDocumentId || parseInt(paramDocumentId || '0');
  
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<'split' | 'document' | 'evaluation'>('split');
  const [evaluationResults, setEvaluationResults] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (documentId) {
      fetchDocument();
      dispatch({ type: 'SET_CURRENT_VIEW', payload: 'evaluations' });
    }
  }, [documentId, dispatch]);

  const fetchDocument = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await api.documents.getById(documentId) as any;
      setDocument(response.document);
    } catch (error) {
      console.error('Failed to fetch document:', error);
      setError('Failed to load document. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleEvaluationComplete = (results: any) => {
    setEvaluationResults(results);
  };

  const handleSaveEvaluation = async () => {
    if (!evaluationResults) return;
    
    try {
      setIsSaving(true);
      // Save evaluation results to backend
      // This would typically update the evaluation record with final results
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate save
      console.log('Evaluation saved:', evaluationResults);
    } catch (error) {
      console.error('Failed to save evaluation:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportResults = () => {
    if (!evaluationResults || !document) return;
    
    // Create a comprehensive evaluation report
    const report = {
      document: {
        title: document.title,
        agency: document.agency,
        evaluated_at: new Date().toISOString()
      },
      evaluation: evaluationResults,
      generated_by: 'Grant Reviewer v2',
      generated_at: new Date().toISOString()
    };
    
    // Download as JSON (in a real app, this would be a formatted PDF)
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `evaluation-${document.title.replace(/[^a-zA-Z0-9]/g, '-')}.json`;
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-500" />
          <p className="text-gray-600">Loading evaluation workspace...</p>
        </div>
      </div>
    );
  }

  if (error || !document) {
    return (
      <Card className="p-6">
        <CardContent className="text-center">
          <p className="text-red-600 mb-4">{error || 'Document not found'}</p>
          <Button onClick={() => navigate('/documents')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Documents
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button 
              variant="outline" 
              onClick={() => navigate('/evaluations')}
              className="flex items-center"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Evaluation Workspace</h1>
              <div className="flex items-center space-x-2 mt-1">
                <span className="text-sm text-gray-600">{document.title}</span>
                <Badge variant="outline">{document.agency}</Badge>
                <Badge variant="secondary">{document.document_type}</Badge>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Layout Controls */}
            <div className="flex items-center border rounded-lg">
              <Button
                variant={layoutMode === 'document' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setLayoutMode('document')}
                className="rounded-r-none"
              >
                Document
              </Button>
              <Button
                variant={layoutMode === 'split' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setLayoutMode('split')}
                className="rounded-none border-x"
              >
                Split
              </Button>
              <Button
                variant={layoutMode === 'evaluation' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setLayoutMode('evaluation')}
                className="rounded-l-none"
              >
                Evaluation
              </Button>
            </div>
            
            {evaluationResults && (
              <>
                <Button 
                  variant="outline" 
                  onClick={handleSaveEvaluation}
                  disabled={isSaving}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleExportResults}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Document Viewer */}
        <div className={`${
          layoutMode === 'evaluation' ? 'hidden' : 
          layoutMode === 'document' ? 'w-full' :
          'w-1/2'
        } border-r bg-white`}>
          <DocumentViewer document={document} />
        </div>
        
        {/* Evaluation Form */}
        <div className={`${
          layoutMode === 'document' ? 'hidden' : 
          layoutMode === 'evaluation' ? 'w-full' :
          'w-1/2'
        } bg-white`}>
          <EvaluationForm 
            documentId={document.id}
            documentTitle={document.title}
            agency={document.agency}
            onEvaluationComplete={handleEvaluationComplete}
          />
        </div>
      </div>

      {/* Status Bar */}
      <div className="bg-white border-t px-6 py-2">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <div className="flex items-center space-x-4">
            <span>Layout: {layoutMode}</span>
            <span>•</span>
            <span>Document: {document.filename}</span>
            <span>•</span>
            <span>Size: {(document.file_size / (1024 * 1024)).toFixed(1)} MB</span>
          </div>
          <div className="flex items-center space-x-4">
            {evaluationResults && (
              <>
                <span>Score: {evaluationResults.overall_score}%</span>
                <span>•</span>
                <span>Recommendation: {evaluationResults.recommendation}</span>
              </>
            )}
            <span>Ready</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EvaluationWorkspace;