/**
 * Main Application Layout
 * 
 * Provides the overall structure for the Grant Reviewer application
 * including sidebar navigation, header, and main content area.
 */

import React from 'react';
import { cn } from '../../lib/utils';
import { useApp } from '../../contexts/AppContext';
import Sidebar from './Sidebar';
import Header from './Header';
import Dashboard from '../Dashboard/Dashboard';
import DocumentManager from '../Documents/DocumentManager';
import EvaluationManager from '../Evaluations/EvaluationManager';
import SearchView from '../Search/SearchView';

const AppLayout: React.FC = () => {
  const { state } = useApp();
  const { currentView, sidebarCollapsed } = state;

  const renderMainContent = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'documents':
        return <DocumentManager />;
      case 'evaluations':
        return <EvaluationManager />;
      case 'search':
        return <SearchView />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      {/* Sidebar */}
      <Sidebar />
      
      {/* Main Content Area */}
      <div className={cn(
        "flex-1 flex flex-col overflow-hidden transition-all duration-300",
        sidebarCollapsed ? "ml-16" : "ml-64"
      )}>
        {/* Header */}
        <Header />
        
        {/* Main Content */}
        <main className="flex-1 overflow-auto bg-white">
          <div className="h-full">
            {renderMainContent()}
          </div>
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
