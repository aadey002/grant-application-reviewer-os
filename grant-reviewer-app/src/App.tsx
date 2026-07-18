/**
 * Main Application Component
 * 
 * Root component that sets up the application layout and routing.
 */

import React, { useEffect } from 'react';
import { AppProvider } from './contexts/AppContext';
import { useFolderActions, useDocumentActions, useStatisticsActions } from './hooks/useAPI';
import AppLayout from './components/Layout/AppLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import './App.css';

// Main App component with providers
function AppContent() {
  const { loadFolders } = useFolderActions();
  const { loadDocuments } = useDocumentActions();
  const { loadStatistics } = useStatisticsActions();

  // Load initial data
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        await Promise.all([
          loadFolders(),
          loadDocuments(),
          loadStatistics(),
        ]);
      } catch (error) {
        console.error('Failed to load initial data:', error);
      }
    };

    loadInitialData();
  }, [loadFolders, loadDocuments, loadStatistics]);

  return <AppLayout />;
}

// Root App component
function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;
