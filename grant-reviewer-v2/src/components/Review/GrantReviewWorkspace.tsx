import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { FileText, Settings, Play, Database, Folder } from 'lucide-react';
import { api } from '@/services/api';
import type { DocumentsResponse, FoldersResponse, ReviewSession, ReviewSessionCreateRequest } from '@/types/api-responses';
import DocumentManager from '../Documents/DocumentManager';
import { ReviewSessionManager } from './ReviewSessionManager';
import { FolderManager } from '../Folders/FolderManager';

export function GrantReviewWorkspace() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('documents');

  // Fetch documents for the review session manager
  const { data: documentsResponse } = useQuery<DocumentsResponse>({
    queryKey: ['documents'],
    queryFn: () => api.documents.getAll(),
  });

  // Fetch folders
  const { data: foldersResponse } = useQuery<FoldersResponse>({
    queryKey: ['folders'],
    queryFn: () => api.folders.getAll(),
  });

  // Fetch review sessions
  const { 
    data: sessionsResponse, 
    isLoading: sessionsLoading 
  } = useQuery<{sessions: ReviewSession[]}>({
    queryKey: ['review-sessions'],
    queryFn: () => api.reviewSessions.getAll(),
  });

  // Create review session mutation
  const createSessionMutation = useMutation({
    mutationFn: (request: ReviewSessionCreateRequest) => api.reviewSessions.create(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-sessions'] });
    },
    onError: (error: any) => {
      console.error('Failed to create review session:', error);
    },
  });

  const handleCreateSession = async (request: ReviewSessionCreateRequest) => {
    await createSessionMutation.mutateAsync(request);
  };

  const handleStartSession = (sessionId: string) => {
    // Navigate to review interface
    console.log('Starting review session:', sessionId);
    // This would typically navigate to a dedicated review page
  };

  const documents = documentsResponse?.documents || [];
  const folders = foldersResponse?.folders || [];
  const sessions = sessionsResponse?.sessions || [];

  // Calculate tab badges
  const applications = documents.filter(doc => doc.category === 'application');
  const references = documents.filter(doc => doc.category === 'reference');
  const activeSessions = sessions.filter(session => session.status !== 'completed');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Grant Review Workspace
          </h1>
          <p className="text-lg text-gray-600">
            Comprehensive platform for managing grant applications and review processes
          </p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-8">
            <TabsTrigger value="documents" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              Document Library
              <Badge variant="secondary" className="ml-2">
                {documents.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="folders" className="flex items-center gap-2">
              <Folder className="h-4 w-4" />
              Folders
              <Badge variant="secondary" className="ml-2">
                {folders.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="review-sessions" className="flex items-center gap-2">
              <Play className="h-4 w-4" />
              Review Sessions
              <Badge variant="secondary" className="ml-2">
                {activeSessions.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Overview
            </TabsTrigger>
          </TabsList>

          {/* Document Library Tab */}
          <TabsContent value="documents" className="space-y-6">
            <DocumentManager />
          </TabsContent>

          {/* Folders Tab */}
          <TabsContent value="folders" className="space-y-6">
            <FolderManager />
          </TabsContent>

          {/* Review Sessions Tab */}
          <TabsContent value="review-sessions" className="space-y-6">
            <ReviewSessionManager
              documents={documents}
              sessions={sessions}
              onCreateSession={handleCreateSession}
              onStartSession={handleStartSession}
            />
          </TabsContent>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
              {/* Summary Cards */}
              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-blue-600" />
                  <div>
                    <p className="text-sm text-gray-600">Applications</p>
                    <p className="text-2xl font-bold">{applications.length}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="flex items-center gap-3">
                  <Settings className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="text-sm text-gray-600">Reference Materials</p>
                    <p className="text-2xl font-bold">{references.length}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="flex items-center gap-3">
                  <Folder className="h-8 w-8 text-yellow-600" />
                  <div>
                    <p className="text-sm text-gray-600">Folders</p>
                    <p className="text-2xl font-bold">{folders.length}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="flex items-center gap-3">
                  <Play className="h-8 w-8 text-orange-600" />
                  <div>
                    <p className="text-sm text-gray-600">Active Sessions</p>
                    <p className="text-2xl font-bold">{activeSessions.length}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border p-6">
                <div className="flex items-center gap-3">
                  <Database className="h-8 w-8 text-purple-600" />
                  <div>
                    <p className="text-sm text-gray-600">Total Documents</p>
                    <p className="text-2xl font-bold">{documents.length}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Start Guide */}
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h2 className="text-xl font-semibold mb-4">Quick Start Guide</h2>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <span className="flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-600 rounded-full text-sm font-semibold">1</span>
                  <div>
                    <h3 className="font-medium">Create Folders for Organization</h3>
                    <p className="text-sm text-gray-600">Set up folders to organize your documents by agency, project, or evaluation type.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-600 rounded-full text-sm font-semibold">2</span>
                  <div>
                    <h3 className="font-medium">Upload Reference Materials</h3>
                    <p className="text-sm text-gray-600">Upload scoring rubrics, guidelines, and evaluation templates to appropriate folders.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-600 rounded-full text-sm font-semibold">3</span>
                  <div>
                    <h3 className="font-medium">Upload Grant Applications</h3>
                    <p className="text-sm text-gray-600">Upload the grant proposals you need to review and categorize them properly.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-600 rounded-full text-sm font-semibold">4</span>
                  <div>
                    <h3 className="font-medium">Create Review Session</h3>
                    <p className="text-sm text-gray-600">Start a new review session by selecting an application and relevant reference materials.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-600 rounded-full text-sm font-semibold">5</span>
                  <div>
                    <h3 className="font-medium">Begin Evaluation</h3>
                    <p className="text-sm text-gray-600">Use the AI-powered evaluation tools to analyze and score the grant application.</p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
