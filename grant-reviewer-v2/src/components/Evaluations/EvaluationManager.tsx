import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, 
  Play, 
  Pause, 
  CheckCircle, 
  XCircle, 
  Clock,
  TrendingUp,
  Award,
  FileCheck,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Eye
} from 'lucide-react';
import { api } from '@/services/api';
import type { EvaluationsResponse } from '@/types/api-responses';

interface Evaluation {
  id: number;
  document_id: number;
  evaluation_type: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  overall_score?: number;
  created_at: string;
  completed_at?: string;
  agency: string;
}

interface Document {
  id: number;
  title: string;
  filename: string;
  agency: string;
  status: string;
  created_at: string;
}

const EvaluationManager: React.FC = () => {
  const navigate = useNavigate();
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);

  // Fetch evaluations
  const { 
    data: evaluationsData, 
    isLoading: evaluationsLoading, 
    error: evaluationsError,
    refetch: refetchEvaluations
  } = useQuery({
    queryKey: ['evaluations', selectedFilter],
    queryFn: () => api.evaluations.getAll({ 
      status: selectedFilter !== 'all' ? selectedFilter : undefined 
    }),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch documents for creating new evaluations
  const { 
    data: documentsData, 
    isLoading: documentsLoading 
  } = useQuery({
    queryKey: ['documents'],
    queryFn: () => api.documents.getAll(),
  });

  const evaluations = (evaluationsData as any)?.evaluations || [];
  const documents = (documentsData as any)?.documents || [];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'in_progress':
        return <Clock className="h-4 w-4 text-blue-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Pause className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'default';
      case 'in_progress':
        return 'secondary';
      case 'failed':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const formatScore = (score: number) => {
    if (score >= 90) return { color: 'text-green-600', label: 'Outstanding' };
    if (score >= 80) return { color: 'text-blue-600', label: 'Very Good' };
    if (score >= 70) return { color: 'text-yellow-600', label: 'Good' };
    if (score >= 60) return { color: 'text-orange-600', label: 'Satisfactory' };
    return { color: 'text-red-600', label: 'Poor' };
  };

  const handleStartEvaluation = (document: Document) => {
    navigate(`/evaluations/workspace/${document.id}`);
  };

  const handleViewEvaluation = (evaluation: Evaluation) => {
    navigate(`/evaluations/workspace/${evaluation.document_id}`);
  };

  const filteredEvaluations = evaluations.filter(evaluation => {
    const matchesFilter = selectedFilter === 'all' || evaluation.status === selectedFilter;
    const matchesSearch = searchQuery === '' || 
      evaluation.agency.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const availableDocuments = documents.filter((doc: any) => 
    !evaluations.some((evaluation: any) => evaluation.document_id === doc.id && evaluation.status !== 'failed')
  );

  if (evaluationsLoading && documentsLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-500" />
          <p className="text-gray-600">Loading evaluations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Evaluation Manager</h1>
          <p className="text-gray-600">Manage and review grant application evaluations</p>
        </div>
        <div className="flex items-center space-x-3">
          <Button 
            variant="outline" 
            onClick={() => refetchEvaluations()}
            disabled={evaluationsLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${evaluationsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Filters</CardTitle>
            <div className="flex items-center space-x-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search evaluations..."
                  className="pl-10 pr-4 py-2 border rounded-md w-64"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2">
            {['all', 'pending', 'in_progress', 'completed', 'failed'].map((filter) => (
              <Button
                key={filter}
                variant={selectedFilter === filter ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedFilter(filter)}
              >
                {filter.replace('_', ' ').charAt(0).toUpperCase() + filter.replace('_', ' ').slice(1)}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Available Documents for Evaluation */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <Plus className="h-5 w-5 mr-2 text-green-500" />
              Start New Evaluation
            </CardTitle>
            <CardDescription>
              Documents ready for evaluation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {availableDocuments.length > 0 ? (
              availableDocuments.slice(0, 5).map((document) => (
                <div key={document.id} className="p-3 border rounded-lg hover:bg-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <FileText className="h-4 w-4 text-gray-500" />
                      <span className="text-sm font-medium">{document.title}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline" className="text-xs">{document.agency}</Badge>
                    </div>
                    <Button 
                      size="sm" 
                      onClick={() => handleStartEvaluation(document)}
                    >
                      <Play className="h-3 w-3 mr-1" />
                      Start
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                <FileText className="h-8 w-8 mx-auto mb-2" />
                <p className="text-sm">No documents available for evaluation</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Active Evaluations */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Active Evaluations</h2>
            <Badge variant="outline">{filteredEvaluations.length} evaluations</Badge>
          </div>
          
          {filteredEvaluations.length > 0 ? (
            <div className="space-y-3">
              {filteredEvaluations.map((evaluation) => {
                const document = documents.find(d => d.id === evaluation.document_id);
                return (
                  <Card key={evaluation.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <FileText className="h-4 w-4 text-gray-500" />
                            <span className="font-medium">{document?.title || 'Unknown Document'}</span>
                            {getStatusIcon(evaluation.status)}
                          </div>
                          <div className="flex items-center space-x-2 mb-2">
                            <Badge variant="outline">{evaluation.agency}</Badge>
                            <Badge variant={getStatusColor(evaluation.status) as any}>
                              {evaluation.status.replace('_', ' ')}
                            </Badge>
                            <Badge variant="secondary">{evaluation.evaluation_type}</Badge>
                          </div>
                          <div className="text-sm text-gray-600">
                            Started: {new Date(evaluation.created_at).toLocaleDateString()}
                            {evaluation.completed_at && (
                              <span> • Completed: {new Date(evaluation.completed_at).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          {evaluation.overall_score && (
                            <div className="text-right">
                              <div className={`text-lg font-bold ${formatScore(evaluation.overall_score).color}`}>
                                {evaluation.overall_score}%
                              </div>
                              <div className={`text-xs ${formatScore(evaluation.overall_score).color}`}>
                                {formatScore(evaluation.overall_score).label}
                              </div>
                            </div>
                          )}
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleViewEvaluation(evaluation)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            {evaluation.status === 'completed' ? 'View' : 'Continue'}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <Award className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No evaluations found</h3>
                <p className="text-gray-600 mb-4">
                  {selectedFilter === 'all' 
                    ? 'Start your first evaluation by selecting a document from the left panel.'
                    : `No evaluations with status "${selectedFilter}" found.`
                  }
                </p>
                {selectedFilter !== 'all' && (
                  <Button variant="outline" onClick={() => setSelectedFilter('all')}>
                    Show All Evaluations
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {evaluations.length}
            </div>
            <div className="text-sm text-gray-600">Total Evaluations</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {evaluations.filter(e => e.status === 'completed').length}
            </div>
            <div className="text-sm text-gray-600">Completed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">
              {evaluations.filter(e => e.status === 'in_progress').length}
            </div>
            <div className="text-sm text-gray-600">In Progress</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-gray-600">
              {Math.round(evaluations.filter(e => e.overall_score).reduce((acc, e) => acc + (e.overall_score || 0), 0) / 
                evaluations.filter(e => e.overall_score).length) || 0}%
            </div>
            <div className="text-sm text-gray-600">Average Score</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default EvaluationManager;