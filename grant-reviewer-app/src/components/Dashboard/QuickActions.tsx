/**
 * Quick Actions Component
 * 
 * Provides shortcuts to common actions like uploading documents,
 * creating evaluations, and creating folders.
 */

import React, { useState } from 'react';
import {
  Upload,
  ClipboardList,
  FolderPlus,
  Search,
  Plus,
} from 'lucide-react';
import { useNavigation } from '../../hooks/useAPI';
import UploadDocumentModal from '../Documents/UploadDocumentModal';
import CreateFolderModal from '../Folders/CreateFolderModal';

const QuickActions: React.FC = () => {
  const { setCurrentView } = useNavigation();
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);

  const actions = [
    {
      title: 'Upload Document',
      description: 'Add a new grant application',
      icon: Upload,
      color: 'blue',
      onClick: () => setShowUploadModal(true),
    },
    {
      title: 'Create Evaluation',
      description: 'Start reviewing a document',
      icon: ClipboardList,
      color: 'green',
      onClick: () => setCurrentView('evaluations'),
    },
    {
      title: 'New Folder',
      description: 'Organize your documents',
      icon: FolderPlus,
      color: 'yellow',
      onClick: () => setShowCreateFolderModal(true),
    },
    {
      title: 'Search',
      description: 'Find documents and evaluations',
      icon: Search,
      color: 'purple',
      onClick: () => setCurrentView('search'),
    },
  ];

  const colorClasses = {
    blue: 'hover:bg-blue-50 hover:border-blue-200',
    green: 'hover:bg-green-50 hover:border-green-200',
    yellow: 'hover:bg-yellow-50 hover:border-yellow-200',
    purple: 'hover:bg-purple-50 hover:border-purple-200',
  };

  const iconColorClasses = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    yellow: 'text-yellow-600',
    purple: 'text-purple-600',
  };

  return (
    <>
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Quick Actions
          </h3>
          <Plus className="h-5 w-5 text-gray-400" />
        </div>
        
        <div className="space-y-3">
          {actions.map((action, index) => {
            const Icon = action.icon;
            return (
              <button
                key={index}
                onClick={action.onClick}
                className={`w-full text-left p-3 border border-gray-200 rounded-md transition-colors ${
                  colorClasses[action.color as keyof typeof colorClasses]
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    <Icon className={`h-5 w-5 ${
                      iconColorClasses[action.color as keyof typeof iconColorClasses]
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {action.title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {action.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Modals */}
      <UploadDocumentModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
      />
      
      <CreateFolderModal
        isOpen={showCreateFolderModal}
        onClose={() => setShowCreateFolderModal(false)}
      />
    </>
  );
};

export default QuickActions;
