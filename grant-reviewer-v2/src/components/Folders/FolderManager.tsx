import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Folder, FileText, Plus, Settings, MoreVertical, Edit, Trash2 } from 'lucide-react';
import { api } from '@/services/api';
import type { FoldersResponse, DocumentsResponse, Document, Folder as FolderType } from '@/types/api-responses';
import CreateFolderModal from '../Documents/CreateFolderModal';

interface FolderCardProps {
  folder: FolderType;
  documents: Document[];
  onEdit: (folder: FolderType) => void;
  onDelete: (folder: FolderType) => void;
}

function FolderCard({ folder, documents, onEdit, onDelete }: FolderCardProps) {
  const folderDocuments = documents.filter(doc => doc.folder_id === folder.id);
  const referenceCount = folderDocuments.filter(doc => doc.category === 'reference').length;
  const applicationCount = folderDocuments.filter(doc => doc.category === 'application').length;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <Folder className="h-8 w-8 text-blue-600 mt-1" />
            <div className="flex-1">
              <CardTitle className="text-lg">{folder.name}</CardTitle>
              <CardDescription className="mt-1">
                {folder.description || 'No description available'}
              </CardDescription>
              <div className="flex gap-2 mt-3">
                <Badge variant="outline">
                  {folderDocuments.length} document{folderDocuments.length !== 1 ? 's' : ''}
                </Badge>
                {referenceCount > 0 && (
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    {referenceCount} reference{referenceCount !== 1 ? 's' : ''}
                  </Badge>
                )}
                {applicationCount > 0 && (
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                    {applicationCount} application{applicationCount !== 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onEdit(folder)}>
              <Edit className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDelete(folder)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      {folderDocuments.length > 0 && (
        <CardContent className="pt-0">
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-600 mb-2">Contents:</h4>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {folderDocuments.map((doc) => (
                <div key={doc.id} className="flex items-center gap-2 text-sm">
                  <FileText className="h-3 w-3 text-gray-400" />
                  <span className="flex-1 truncate">{doc.title}</span>
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${
                      doc.category === 'reference' 
                        ? 'bg-green-50 text-green-700 border-green-200' 
                        : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}
                  >
                    {doc.category === 'reference' ? (
                      <Settings className="h-2 w-2 mr-1" />
                    ) : (
                      <FileText className="h-2 w-2 mr-1" />
                    )}
                    {doc.category}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function FolderManager() {
  const queryClient = useQueryClient();
  const [showCreateFolder, setShowCreateFolder] = useState(false);

  // Fetch folders
  const { 
    data: foldersResponse, 
    isLoading: foldersLoading 
  } = useQuery<FoldersResponse>({
    queryKey: ['folders'],
    queryFn: () => api.folders.getAll(),
  });

  // Fetch documents
  const { 
    data: documentsResponse 
  } = useQuery<DocumentsResponse>({
    queryKey: ['documents'],
    queryFn: () => api.documents.getAll(),
  });

  // Delete folder mutation
  const deleteFolderMutation = useMutation({
    mutationFn: (folderId: number) => api.folders.delete(folderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (error: any) => {
      console.error('Failed to delete folder:', error);
    },
  });

  const handleEditFolder = (folder: FolderType) => {
    // TODO: Implement edit functionality
    console.log('Edit folder:', folder);
  };

  const handleDeleteFolder = (folder: FolderType) => {
    if (window.confirm(`Are you sure you want to delete the folder "${folder.name}"? This action cannot be undone.`)) {
      deleteFolderMutation.mutate(folder.id);
    }
  };

  const folders = foldersResponse?.folders || [];
  const documents = documentsResponse?.documents || [];

  // Organize documents by agency for better visualization
  const documentsByAgency = documents.reduce((acc, doc) => {
    if (!acc[doc.agency]) {
      acc[doc.agency] = [];
    }
    acc[doc.agency].push(doc);
    return acc;
  }, {} as Record<string, Document[]>);

  if (foldersLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading folders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Folder Management</h2>
          <p className="text-muted-foreground">
            Organize your documents into folders for better structure and access
          </p>
        </div>
        <Button onClick={() => setShowCreateFolder(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Folder
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Folder className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-base">Total Folders</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{folders.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-green-600" />
              <CardTitle className="text-base">Total Documents</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{documents.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-orange-600" />
              <CardTitle className="text-base">Agencies</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{Object.keys(documentsByAgency).length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Folders Grid */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Your Folders</h3>
        {folders.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {folders.map((folder) => (
              <FolderCard
                key={folder.id}
                folder={folder}
                documents={documents}
                onEdit={handleEditFolder}
                onDelete={handleDeleteFolder}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <Folder className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Folders Created</h3>
              <p className="text-muted-foreground mb-4">
                Create your first folder to organize your documents effectively.
              </p>
              <Button onClick={() => setShowCreateFolder(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Folder
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Agency Overview */}
      {Object.keys(documentsByAgency).length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Documents by Agency</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(documentsByAgency).map(([agency, docs]) => {
              const referenceCount = docs.filter(doc => doc.category === 'reference').length;
              const applicationCount = docs.filter(doc => doc.category === 'application').length;
              
              return (
                <Card key={agency}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{agency}</CardTitle>
                    <CardDescription>
                      {docs.length} document{docs.length !== 1 ? 's' : ''} total
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex gap-2">
                      {referenceCount > 0 && (
                        <Badge variant="secondary" className="bg-green-100 text-green-800">
                          {referenceCount} Reference{referenceCount !== 1 ? 's' : ''}
                        </Badge>
                      )}
                      {applicationCount > 0 && (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                          {applicationCount} Application{applicationCount !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Create Folder Modal */}
      <CreateFolderModal
        isOpen={showCreateFolder}
        onClose={() => setShowCreateFolder(false)}
        onCreateComplete={() => {
          queryClient.invalidateQueries({ queryKey: ['folders'] });
          setShowCreateFolder(false);
        }}
      />
    </div>
  );
}
