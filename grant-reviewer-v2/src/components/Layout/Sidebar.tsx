import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FileText, 
  CheckSquare, 
  Search,
  Menu,
  Shield
} from 'lucide-react';
import { useApp } from '@/contexts/AppContext';

const Sidebar: React.FC = () => {
  const { state, dispatch } = useApp();
  const location = useLocation();

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard, view: 'dashboard' },
    { name: 'Documents', href: '/documents', icon: FileText, view: 'documents' },
    { name: 'Evaluations', href: '/evaluations', icon: CheckSquare, view: 'evaluations' },
    { name: 'Search', href: '/search', icon: Search, view: 'search' },
  ];

  return (
    <div className={`fixed inset-y-0 left-0 z-50 bg-navy-900 transition-all duration-300 ${
      state.sidebarCollapsed ? 'w-16' : 'w-64'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between h-16 px-4 bg-navy-800">
        <div className="flex items-center">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          {!state.sidebarCollapsed && (
            <div className="ml-3">
              <h1 className="text-white font-semibold text-sm">Grant Reviewer</h1>
              <p className="text-slate-400 text-xs">Federal Review System</p>
            </div>
          )}
        </div>
        
        <button
          onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
          className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-navy-700 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="mt-6 px-3">
        <ul className="space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            const Icon = item.icon;
            
            return (
              <li key={item.name}>
                <Link
                  to={item.href}
                  onClick={() => dispatch({ type: 'SET_CURRENT_VIEW', payload: item.view as any })}
                  className={`group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:text-white hover:bg-navy-800'
                  }`}
                >
                  <Icon className={`flex-shrink-0 w-5 h-5 ${
                    state.sidebarCollapsed ? 'mx-auto' : 'mr-3'
                  }`} />
                  {!state.sidebarCollapsed && item.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      {!state.sidebarCollapsed && (
        <div className="absolute bottom-4 left-4 right-4">
          <div className="bg-navy-800 rounded-lg p-3">
            <div className="flex items-center">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              <span className="ml-2 text-xs text-slate-300">System Online</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">v2.0.0</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sidebar;
