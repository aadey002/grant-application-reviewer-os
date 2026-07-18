import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { FileText, Settings, Plus, Play, Clock, CheckCircle } from 'lucide-react';
import { Document, ReviewSession, ReviewSessionCreateRequest } from '@/types/api-responses';

interface ReviewSessionManagerProps {
  documents: Document[];
  sessions: ReviewSession[];
  onCreateSession: (request: ReviewSessionCreateRequest) => Promise<void>;
  onStartSession: (sessionId: string) => void;
}

interface NewSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documents: Document[];
  onCreateSession: (request: ReviewSessionCreateRequest) => Promise<void>;
}

function NewSessionDialog({ open, onOpenChange, documents, onCreateSession }: NewSessionDialogProps) {
  const [sessionName, setSessionName] = useState('');
  const [selectedApplication, setSelectedApplication] = useState<number | null>(null);
  const [selectedReferences, setSelectedReferences] = useState<number[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const applications = documents.filter(doc => doc.category === 'application');
  const references = documents.filter(doc => doc.category === 'reference');
  
  // Filter references by agency if application is selected
  const selectedApp = applications.find(app => app.id === selectedApplication);
  const relevantReferences = selectedApp 
    ? references.filter(ref => ref.agency === selectedApp.agency)
    : references;

  const handleReferenceToggle = (referenceId: number) => {
    setSelectedReferences(prev => 
      prev.includes(referenceId)
        ? prev.filter(id => id !== referenceId)
        : [...prev, referenceId]
    );
  };

  const handleCreateSession = async () => {
    if (!sessionName || !selectedApplication) return;

    setIsCreating(true);
    try {
      await onCreateSession({
        name: sessionName,
        application_id: selectedApplication,
        reference_documents: selectedReferences
      });
      
      // Reset form
      setSessionName('');
      setSelectedApplication(null);
      setSelectedReferences([]);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to create session:', error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Create New Review Session
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Session Name */}
          <div className="space-y-2">
            <Label htmlFor="session-name">Session Name</Label>
            <Input
              id="session-name"
              placeholder="e.g., Rural Health Initiative Review"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
            />
          </div>

          {/* Application Selection */}
          <div className="space-y-3">
            <Label>Select Application to Review</Label>
            <div className="grid gap-3">
              {applications.map((app) => (
                <Card 
                  key={app.id}
                  className={`cursor-pointer transition-all ${selectedApplication === app.id ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                  onClick={() => setSelectedApplication(app.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <FileText className="h-5 w-5 mt-1 text-blue-600" />
                        <div>
                          <CardTitle className="text-base">{app.title}</CardTitle>
                          <CardDescription className="mt-1">
                            {app.description || 'No description available'}
                          </CardDescription>
                          <div className="flex gap-2 mt-2">
                            <Badge variant="outline">{app.agency}</Badge>
                            <Badge variant="secondary">{app.sub_type}</Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
              {applications.length === 0 && (
                <Card>
                  <CardContent className="p-6 text-center text-muted-foreground">
                    No grant applications available. Upload applications first.
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Reference Materials Selection */}
          {selectedApplication && (
            <div className="space-y-3">
              <div>
                <Label>Reference Materials</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedApp && relevantReferences.length > 0 
                    ? `Select evaluation materials for ${selectedApp.agency}`
                    : 'No relevant reference materials found for this agency'
                  }
                </p>
              </div>
              <div className="grid gap-3 max-h-60 overflow-y-auto">
                {relevantReferences.map((ref) => (
                  <Card key={ref.id} className="hover:bg-muted/50">
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedReferences.includes(ref.id)}
                          onCheckedChange={() => handleReferenceToggle(ref.id)}
                        />
                        <Settings className="h-5 w-5 mt-1 text-green-600" />
                        <div className="flex-1">
                          <CardTitle className="text-base">{ref.title}</CardTitle>
                          <CardDescription className="mt-1">
                            {ref.description || 'No description available'}
                          </CardDescription>
                          <div className="flex gap-2 mt-2">
                            <Badge variant="outline">{ref.agency}</Badge>
                            <Badge variant="secondary">{ref.sub_type}</Badge>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
                {relevantReferences.length === 0 && (
                  <Card>
                    <CardContent className="p-4 text-center text-muted-foreground">
                      No reference materials available for {selectedApp?.agency}. 
                      Upload rubrics and guidelines first.
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* Create Button */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateSession}
              disabled={!sessionName || !selectedApplication || isCreating}
            >
              {isCreating ? 'Creating...' : 'Create Review Session'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ReviewSessionManager({ documents, sessions, onCreateSession, onStartSession }: ReviewSessionManagerProps) {
  const [showNewSessionDialog, setShowNewSessionDialog] = useState(false);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'in_progress':
        return <Play className="h-5 w-5 text-blue-600" />;
      default:
        return <Clock className="h-5 w-5 text-gray-600" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'in_progress':
        return 'In Progress';
      default:
        return 'Draft';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Review Sessions</h2>
          <p className="text-muted-foreground">
            Manage grant application review sessions with reference materials
          </p>
        </div>
        <Button onClick={() => setShowNewSessionDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Review Session
        </Button>
      </div>

      {/* Active Sessions */}
      <div className="grid gap-4">
        {sessions.map((session) => {
          const application = documents.find(doc => doc.id === session.application_id);
          const referenceCount = session.reference_documents.length;
          
          return (
            <Card key={session.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {getStatusIcon(session.status)}
                    <div>
                      <CardTitle className="text-lg">{session.name}</CardTitle>
                      <CardDescription className="mt-1">
                        Application: {application?.title || 'Unknown Application'}
                      </CardDescription>
                      <div className="flex gap-2 mt-2">
                        <Badge variant="outline">
                          {getStatusLabel(session.status)}
                        </Badge>
                        <Badge variant="secondary">
                          {referenceCount} reference{referenceCount !== 1 ? 's' : ''}
                        </Badge>
                        {application && (
                          <Badge variant="outline">{application.agency}</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => onStartSession(session.id)}
                    >
                      {session.status === 'completed' ? 'View' : 'Continue'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          );
        })}
        
        {sessions.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Review Sessions</h3>
              <p className="text-muted-foreground mb-4">
                Create your first review session to start evaluating grant applications with reference materials.
              </p>
              <Button onClick={() => setShowNewSessionDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Review Session
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* New Session Dialog */}
      <NewSessionDialog
        open={showNewSessionDialog}
        onOpenChange={setShowNewSessionDialog}
        documents={documents}
        onCreateSession={onCreateSession}
      />
    </div>
  );
}
