/**
 * Create Folder Modal Component
 * 
 * Provides interface for creating new folders to organize documents.
 */

import React, { useState } from 'react';
import { X, Folder, FolderPlus, AlertCircle, CheckCircle } from 'lucide-react';
import { useFolderActions } from '../../hooks/useAPI';
import { useFolders } from '../../contexts/AppContext';

interface CreateFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  parentId?: number;
}

const CreateFolderModal: React.FC<CreateFolderModalProps> = ({
  isOpen,
  onClose,
  parentId,
}) => {
  const { createFolder } = useFolderActions();
  const { folders } = useFolders();
  
  const [formData, setFormData] = useState({
    name: '',
    parent_id: parentId,
    description: '',
  });
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const resetForm = () => {
    setFormData({
      name: '',
      parent_id: parentId,
      description: '',
    });
    setError(null);
    setSuccess(false);
  };

  const handleClose = () => {
    if (!isCreating) {
      resetForm();
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      setError('Folder name is required');
      return;
    }
    
    setIsCreating(true);
    setError(null);
    
    try {
      await createFolder({
        name: formData.name.trim(),
        parent_id: formData.parent_id,
        description: formData.description.trim(),
      });
      
      setSuccess(true);
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to create folder');
    } finally {
      setIsCreating(false);
    }
  };

  // Build folder hierarchy for parent selection
  const buildFolderOptions = (folders: any[], level = 0): JSX.Element[] => {
    const options: JSX.Element[] = [];
    
    folders.forEach((folder) => {
      const indent = '—'.repeat(level);
      options.push(
        <option key={folder.id} value={folder.id}>
          {indent} {folder.name}
        </option>
      );
      
      if (folder.children && folder.children.length > 0) {
        options.push(...buildFolderOptions(folder.children, level + 1));
      }
    });
    
    return options;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <FolderPlus className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Create New Folder
            </h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isCreating}
            className="p-2 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Folder Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Folder Name *
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter folder name..."
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isCreating}
                required
              />
              <Folder className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            </div>
          </div>

          {/* Parent Folder */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Parent Folder (Optional)
            </label>
            <select
              value={formData.parent_id || ''}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                parent_id: e.target.value ? parseInt(e.target.value) : undefined,
              }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isCreating}
            >
              <option value="">No parent (Root level)</option>
              {buildFolderOptions(folders)}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description (Optional)
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Brief description of this folder's purpose..."
              rows={3}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isCreating}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-start">
              <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 mr-2 flex-shrink-0" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-md p-3 flex items-start">
              <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 mr-2 flex-shrink-0" />
              <p className="text-sm text-green-800">Folder created successfully!</p>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={isCreating}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating || !formData.name.trim() || success}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {isCreating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Creating...
                </>
              ) : (
                <>
                  <FolderPlus className="h-4 w-4 mr-2" />
                  Create Folder
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateFolderModal;
