import React, { useState } from 'react';
import { X, Folder } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/services/api';

interface CreateFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateFolder?: (name: string, description: string, parentId?: number) => void;
  parentId?: number;
  onCreateComplete?: () => void;
  parentFolder?: { id: number; name: string };
}

const CreateFolderModal: React.FC<CreateFolderModalProps> = ({
  isOpen,
  onClose,
  onCreateFolder,
  parentId,
  onCreateComplete,
  parentFolder
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast({
        title: "Error",
        description: "Folder name is required",
        variant: "destructive"
      });
      return;
    }

    setIsCreating(true);
    
    try {
      // Use centralized API service to create folder
      const folderData = {
        name: name.trim(),
        description: description.trim(),
        ...(parentId && { parent_id: parentId.toString() })
      };
      
      const result = await api.folders.create(folderData);
      console.log('Folder created:', result);
      
      toast({
        title: "Success",
        description: `Folder "${name}" created successfully`
      });
      
      // Reset form
      setName('');
      setDescription('');
      onCreateComplete?.();
      onClose();
    } catch (error) {
      console.error('Folder creation error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create folder",
        variant: "destructive"
      });
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" style={{ zIndex: 9999 }}>
      <Card className="w-full max-w-md mx-4 relative">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Folder className="h-5 w-5" />
              <span>Create New Folder</span>
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {parentFolder && (
              <div className="p-3 bg-blue-50 rounded-md">
                <p className="text-sm text-blue-800">
                  Creating folder inside: <strong>{parentFolder.name}</strong>
                </p>
              </div>
            )}
            
            <div>
              <label htmlFor="folder-name" className="block text-sm font-medium text-gray-700 mb-1">
                Folder Name *
              </label>
              <input
                id="folder-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter folder name"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            
            <div>
              <label htmlFor="folder-description" className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                id="folder-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            <div className="flex justify-end space-x-3 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={onClose}
                disabled={isCreating}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isCreating || !name.trim()}
              >
                {isCreating ? 'Creating...' : 'Create Folder'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreateFolderModal;
