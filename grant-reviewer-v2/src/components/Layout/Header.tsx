import React from 'react';
import { Bell, Settings } from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import UserMenu from './UserMenu';

const Header: React.FC = () => {
  const { state } = useApp();
  const { hasPermission } = useAuth();

  const getPageTitle = () => {
    switch (state.currentView) {
      case 'dashboard':
        return 'Dashboard Overview';
      case 'documents':
        return 'Document Management';
      case 'evaluations':
        return 'Grant Evaluations';
      case 'search':
        return 'Search & Analytics';
      default:
        return 'Grant Reviewer';
    }
  };

  const getPageDescription = () => {
    switch (state.currentView) {
      case 'dashboard':
        return 'Federal grant review system overview and statistics';
      case 'documents':
        return 'Upload, organize, and manage grant application documents';
      case 'evaluations':
        return 'Create and monitor comprehensive grant evaluations';
      case 'search':
        return 'Search documents and analyze evaluation results';
      default:
        return 'Professional federal grant review platform';
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {getPageTitle()}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {getPageDescription()}
          </p>
        </div>

        <div className="flex items-center space-x-4">
          {/* Status indicators */}
          <div className="flex items-center space-x-2">
            {state.loading.documents && (
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            )}
            {state.loading.evaluations && (
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            )}
          </div>

          {/* Action buttons */}
          <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors relative">
            <Bell className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full text-xs flex items-center justify-center text-white">
              3
            </span>
          </button>
          
          {hasPermission('manage:system') && (
            <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
              <Settings className="w-5 h-5" />
            </button>
          )}
          
          <UserMenu />
        </div>
      </div>
    </header>
  );
};

export default Header;
