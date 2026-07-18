export interface Document {
  id: number;
  title: string;
  filename: string;
  file_size: number;
  agency: string;
  document_type: string;
  status: string;
  description?: string;
  tags?: string;
  created_at: string;
  updated_at: string;
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
  created_at: string;
  completed_at?: string;
  agency: string;
}

export interface ApiResponse<T> {
  data?: T;
  documents?: Document[];
  folders?: Folder[];
  evaluations?: Evaluation[];
  message?: string;
  error?: string;
}

export interface Statistics {
  total_documents: number;
  total_folders: number;
  total_evaluations: number;
  documents_by_agency: Record<string, number>;
  documents_by_status: Record<string, number>;
  recent_activity: Document[];
}
