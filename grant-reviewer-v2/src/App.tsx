import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from 'react-error-boundary';
import { Toaster } from '@/components/ui/toaster';

import { AuthProvider } from '@/contexts/AuthContext';
import { AppProvider } from '@/contexts/AppContext';
import ProtectedRoute from '@/components/Auth/ProtectedRoute';
import Layout from '@/components/Layout/Layout';
import Dashboard from '@/components/Dashboard/Dashboard';
import DocumentManager from '@/components/Documents/DocumentManager';
import EvaluationManager from '@/components/Evaluations/EvaluationManager';
import EvaluationWorkspace from '@/components/Evaluations/EvaluationWorkspace';
import SearchView from '@/components/Search/SearchView';
import { GrantReviewWorkspace } from '@/components/Review/GrantReviewWorkspace';
import ErrorFallback from '@/components/ErrorFallback';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

function App() {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error, errorInfo) => {
        console.error('Application error:', error, errorInfo);
      }}
      onReset={() => window.location.reload()}
    >
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppProvider>
            <Router>
              <div className="min-h-screen bg-slate-50">
                <ProtectedRoute>
                  <Layout>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/documents" element={<GrantReviewWorkspace />} />
                      <Route path="/review" element={<GrantReviewWorkspace />} />
                      <Route path="/evaluations" element={<EvaluationManager />} />
                      <Route path="/evaluations/workspace/:documentId" element={<EvaluationWorkspace />} />
                      <Route 
                        path="/search" 
                        element={
                          <ProtectedRoute requiredPermission="read:statistics">
                            <SearchView />
                          </ProtectedRoute>
                        } 
                      />
                    </Routes>
                  </Layout>
                </ProtectedRoute>
                <Toaster />
              </div>
            </Router>
          </AppProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
