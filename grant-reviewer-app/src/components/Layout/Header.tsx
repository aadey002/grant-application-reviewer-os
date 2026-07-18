/**
 * Header Component
 * 
 * Displays the current page title, breadcrumbs, and global actions
 * like search and user menu.
 */

import React, { useState } from 'react';
import {
  Search,
  Bell,
  User,
  Settings,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useApp } from '../../contexts/AppContext';
import { useNavigation } from '../../hooks/useAPI';

const Header: React.FC = () => {
  const { state } = useApp();
  const { setCurrentView } = useNavigation();
  const [searchQuery, setSearchQuery] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);

  const getPageTitle = () => {
    switch (state.currentView) {
      case 'dashboard':
        return 'Dashboard';
      case 'documents':
        return 'Document Management';
      case 'evaluations':
        return 'Grant Evaluations';
      case 'search':
        return 'Search Results';
      default:
        return 'Grant Reviewer';
    }
  };

  const getPageDescription = () => {
    switch (state.currentView) {
      case 'dashboard':
        return 'Overview of your grant review activities';
      case 'documents':
        return state.selectedFolder 
          ? `Documents in ${state.selectedFolder.name}`
          : 'Manage and organize grant applications';
      case 'evaluations':
        return 'Review and track grant application evaluations';
      case 'search':
        return 'Search across documents and evaluations';
      default:
        return 'Federal Grant Review Management System';
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // TODO: Implement search functionality
      setCurrentView('search');
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Page Title */}
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-gray-900">
            {getPageTitle()}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {getPageDescription()}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-4">
          {/* Search */}
          <form onSubmit={handleSearchSubmit} className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search documents and evaluations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 w-80 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </form>

          {/* Notifications */}
          <button className="relative p-2 text-gray-400 hover:text-gray-600 transition-colors">
            <Bell className="h-5 w-5" />
            <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full"></span>
          </button>

          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center space-x-2 p-2 text-gray-700 hover:text-gray-900 transition-colors"
            >
              <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="h-4 w-4 text-blue-600" />
              </div>
              <span className="text-sm font-medium">Grant Reviewer</span>
              <ChevronDown className="h-4 w-4" />
            </button>

            {/* User Dropdown */}
            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-50">
                <div className="py-1">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900">Grant Reviewer</p>
                    <p className="text-xs text-gray-500">reviewer@agency.gov</p>
                  </div>
                  
                  <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center">
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </button>
                  
                  <button className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center">
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Breadcrumbs */}
      {(state.selectedFolder || state.selectedDocument) && (
        <div className="mt-2 flex items-center text-sm text-gray-500">
          <button 
            onClick={() => {
              // Clear selections and go to documents
              setCurrentView('documents');
            }}
            className="hover:text-gray-700"
          >
            All Documents
          </button>
          
          {state.selectedFolder && (
            <>
              <span className="mx-2">/</span>
              <span className="text-gray-900">{state.selectedFolder.name}</span>
            </>
          )}
          
          {state.selectedDocument && (
            <>
              <span className="mx-2">/</span>
              <span className="text-gray-900 truncate max-w-xs">
                {state.selectedDocument.original_filename}
              </span>
            </>
          )}
        </div>
      )}
    </header>
  );
};

export default Header;
