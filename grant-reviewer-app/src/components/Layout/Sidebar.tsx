/**
 * Sidebar Navigation Component
 * 
 * Provides navigation between different sections of the application
 * and displays folder hierarchy for document organization.
 */

import React, { useState } from 'react';
import {
  Home,
  FileText,
  ClipboardList,
  Search,
  Folder,
  FolderPlus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Settings,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useApp } from '../../contexts/AppContext';
import { useNavigation, useFolderActions } from '../../hooks/useAPI';
import { useFolders } from '../../contexts/AppContext';
import CreateFolderModal from '../Folders/CreateFolderModal';

const Sidebar: React.FC = () => {
  const { state } = useApp();
  const { currentView, sidebarCollapsed } = state;
  const { setCurrentView, toggleSidebar } = useNavigation();
  const { selectFolder } = useFolderActions();
  const { folders } = useFolders();
  
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());

  const navigationItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home, view: 'dashboard' as const },
    { id: 'documents', label: 'Documents', icon: FileText, view: 'documents' as const },
    { id: 'evaluations', label: 'Evaluations', icon: ClipboardList, view: 'evaluations' as const },
    { id: 'search', label: 'Search', icon: Search, view: 'search' as const },
  ];

  const toggleFolderExpansion = (folderId: number) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const handleFolderSelect = (folder: any) => {
    selectFolder(folder);
    if (currentView !== 'documents') {
      setCurrentView('documents');
    }
  };

  const renderFolder = (folder: any, level = 0) => {
    const hasChildren = folder.children && folder.children.length > 0;
    const isExpanded = expandedFolders.has(folder.id);

    return (
      <div key={folder.id}>
        <div
          className={cn(
            "flex items-center py-2 px-3 hover:bg-blue-50 cursor-pointer group rounded-md mx-2",
            state.selectedFolder?.id === folder.id && "bg-blue-100 text-blue-700"
          )}
          style={{ paddingLeft: `${12 + level * 16}px` }}
          onClick={() => handleFolderSelect(folder)}
        >
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFolderExpansion(folder.id);
              }}
              className="mr-1 p-0.5 hover:bg-blue-200 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          )}
          
          <Folder className={cn(
            "h-4 w-4 mr-2 flex-shrink-0",
            hasChildren ? "ml-0" : "ml-4"
          )} />
          
          {!sidebarCollapsed && (
            <>
              <span className="flex-1 text-sm truncate">{folder.name}</span>
              {folder.document_count > 0 && (
                <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full ml-2">
                  {folder.document_count}
                </span>
              )}
            </>
          )}
        </div>
        
        {hasChildren && isExpanded && (
          <div>
            {folder.children.map((child: any) => renderFolder(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className={cn(
        "bg-white border-r border-gray-200 flex flex-col transition-all duration-300 fixed left-0 top-0 h-full z-30",
        sidebarCollapsed ? "w-16" : "w-64"
      )}>
        {/* Header */}
        <div className={cn(
          "p-4 border-b border-gray-200 flex items-center justify-between",
          sidebarCollapsed && "px-2"
        )}>
          {!sidebarCollapsed && (
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Grant Reviewer</h1>
              <p className="text-xs text-gray-500">Document Management</p>
            </div>
          )}
          
          <button
            onClick={toggleSidebar}
            className="p-2 hover:bg-gray-100 rounded-md transition-colors"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4">
          {/* Main Navigation */}
          <div className="space-y-1 px-2">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.view;
              
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentView(item.view)}
                  className={cn(
                    "w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors",
                    isActive
                      ? "bg-blue-100 text-blue-700 border-r-2 border-blue-500"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <Icon className={cn(
                    "flex-shrink-0",
                    sidebarCollapsed ? "h-5 w-5" : "h-4 w-4 mr-3"
                  )} />
                  {!sidebarCollapsed && item.label}
                </button>
              );
            })}
          </div>

          {/* Folders Section */}
          {!sidebarCollapsed && (
            <div className="mt-6">
              <div className="flex items-center justify-between px-4 mb-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Folders
                </h3>
                <button
                  onClick={() => setShowCreateFolder(true)}
                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                  title="Create new folder"
                >
                  <FolderPlus className="h-4 w-4 text-gray-400" />
                </button>
              </div>
              
              <div className="space-y-1">
                {folders.map((folder) => renderFolder(folder))}
                
                {folders.length === 0 && (
                  <div className="px-4 py-2 text-sm text-gray-500">
                    No folders yet. Create one to organize your documents.
                  </div>
                )}
              </div>
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className={cn(
          "border-t border-gray-200 p-4",
          sidebarCollapsed && "px-2"
        )}>
          <button
            className={cn(
              "w-full flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors",
              sidebarCollapsed ? "justify-center" : "px-3 py-2"
            )}
            title={sidebarCollapsed ? 'Settings' : undefined}
          >
            <Settings className={cn(
              "flex-shrink-0",
              sidebarCollapsed ? "h-5 w-5" : "h-4 w-4 mr-3"
            )} />
            {!sidebarCollapsed && "Settings"}
          </button>
        </div>
      </div>

      {/* Create Folder Modal */}
      <CreateFolderModal
        isOpen={showCreateFolder}
        onClose={() => setShowCreateFolder(false)}
      />
    </>
  );
};

export default Sidebar;
