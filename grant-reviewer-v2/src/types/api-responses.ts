// API Response Types

export interface Document {
  id: number;
  title: string;
  filename: string;
  file_size: number;
  agency: string;
  document_type: string;
  status: string;
  description?: string;
  tags?: string | string[];
  created_at: string;
  updated_at: string;
  folder_id?: number;
  // Enhanced categorization fields
  category: 'reference' | 'application';
  sub_type: string;
  // Upload tracking and content storage
  isUserUpload?: boolean;
  fileContent?: string; // Base64 encoded file content
  contentType?: string; // MIME type
}

export interface Folder {
  id: number;
  name: string;
  description?: string;
  parent_id?: number;
  created_at: string;
  updated_at: string;
}

export interface Evaluation {
  id: number;
  document_id: number;
  evaluation_type: string;
  status: string;
  overall_score?: number;
  agency: string;
  created_at: string;
  completed_at?: string;
}

export interface RecentActivity {
  id: number;
  title: string;
  agency: string;
  created_at: string;
}

export interface Statistics {
  total_documents: number;
  total_folders: number;
  total_evaluations: number;
  documents_by_agency: Record<string, number>;
  documents_by_status: Record<string, number>;
  recent_activity: RecentActivity[];
}

export interface DocumentsResponse {
  documents: Document[];
}

export interface FoldersResponse {
  folders: Folder[];
}

export interface EvaluationsResponse {
  evaluations: Evaluation[];
}

export interface SearchResponse {
  results: Document[];
  total: number;
}

export interface UploadResponse {
  success: boolean;
  document: Document;
  documents?: Document[]; // Optional array for batch uploads
  message?: string;
}

export interface FolderCreateResponse {
  folder: Folder;
}

export interface EvaluationCreateResponse {
  evaluation: Evaluation;
}

// Enhanced types for the new review workflow
export interface ReviewSession {
  id: string;
  name: string;
  application_id: number;
  reference_documents: number[];
  status: 'draft' | 'in_progress' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface ReviewSessionCreateRequest {
  name: string;
  application_id: number;
  reference_documents: number[];
}

export interface ReviewSessionCreateResponse {
  session: ReviewSession;
}

// Enhanced upload request types
export interface DocumentUploadRequest {
  category: 'reference' | 'application';
  agency: 'HRSA' | 'SAMHSA' | 'NIH' | 'CDC' | 'OTHER';
  sub_type: string;
  description?: string;
  folder_id?: number | null;
}
