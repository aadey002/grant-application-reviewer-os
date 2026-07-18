import React from 'react';
import { Folder, FolderOpen, ChevronRight, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FolderNode {
  id: number;
  name: string;
  description?: string;
  parent_id?: number;
  children?: FolderNode[];
  created_at: string;
  updated_at: string;
}

interface FolderTreeProps {
  folders: FolderNode[];
  selectedFolder?: FolderNode;
  onSelectFolder?: (folder: FolderNode) => void;
  onFolderSelect?: (folder: FolderNode) => void;
  onFolderCreate?: (parentId?: number) => void;
  loading?: boolean;
}

const FolderTree: React.FC<FolderTreeProps> = ({
  folders,
  selectedFolder,
  onSelectFolder,
  onFolderSelect,
  onFolderCreate,
  loading
}) => {
  const [expandedFolders, setExpandedFolders] = React.useState<Set<number>>(new Set());

  const toggleFolder = (folderId: number) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const renderFolder = (folder: FolderNode, depth: number = 0) => {
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = selectedFolder?.id === folder.id;
    const hasChildren = folder.children && folder.children.length > 0;

    return (
      <div key={folder.id}>
        <div
          className={`flex items-center space-x-2 p-2 rounded-md cursor-pointer hover:bg-gray-100 ${
            isSelected ? 'bg-blue-50 border border-blue-200' : ''
          }`}
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
          onClick={() => {
            console.log('🗂️ FolderTree: Folder clicked:', folder.name, 'ID:', folder.id);
            console.log('🗂️ FolderTree: onSelectFolder function exists:', !!onSelectFolder);
            console.log('🗂️ FolderTree: onFolderSelect function exists:', !!onFolderSelect);
            onSelectFolder?.(folder);
            onFolderSelect?.(folder);
            console.log('🗂️ FolderTree: Folder selection handlers called');
          }}
        >
          {hasChildren ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={(e) => {
                e.stopPropagation();
                toggleFolder(folder.id);
              }}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </Button>
          ) : (
            <div className="w-6" />
          )}
          
          {isExpanded ? (
            <FolderOpen className="h-4 w-4 text-blue-500" />
          ) : (
            <Folder className="h-4 w-4 text-gray-500" />
          )}
          
          <span className={`text-sm ${isSelected ? 'font-medium text-blue-700' : 'text-gray-700'}`}>
            {folder.name}
          </span>
        </div>
        
        {hasChildren && isExpanded && (
          <div>
            {folder.children?.map(child => renderFolder(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-gray-900">Folders</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onFolderCreate?.()}
          className="text-xs"
        >
          + New
        </Button>
      </div>
      
      {folders.length > 0 ? (
        folders.map(folder => renderFolder(folder))
      ) : (
        <p className="text-sm text-gray-500 p-2">No folders yet</p>
      )}
    </div>
  );
};

export default FolderTree;
