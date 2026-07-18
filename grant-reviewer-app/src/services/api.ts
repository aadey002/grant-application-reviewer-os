/**
 * API Service Layer for Grant Reviewer Application
 * 
 * Handles all communication with the Flask backend API.
 * Provides typed interfaces for all API operations.
 */

// API Configuration
const API_BASE_URL = 'http://localhost:5000/api';

// Types
export interface Document {
  id: number;
  filename: string;
  original_filename: string;
  file_path: string;
  file_size: number;
  folder_id?: number;
  folder_name?: string;
  agency: 'HRSA' | 'SAMHSA';
  document_type: 'application' | 'nofo' | 'supporting';
  description: string;
  tags?: string;
  status: 'uploaded' | 'processing' | 'processed' | 'evaluated' | 'archived';
  processed_content?: any;
  created_at: string;
  updated_at: string;
}

export interface Folder {
  id: number;
  name: string;
  parent_id?: number;
  description: string;
  document_count: number;
  children: Folder[];
  created_at: string;
  updated_at: string;
}

export interface Evaluation {
  id: number;
  document_id: number;
  document_name: string;
  nofo_document_id?: number;
  nofo_document_name?: string;
  evaluation_type: 'comprehensive' | 'scoring' | 'comments' | 'validation';
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  results?: any;
  created_at: string;
  updated_at: string;
}

export interface SearchResult {
  id: number;
  search_type: 'document' | 'evaluation';
  original_filename?: string;
  description?: string;
  agency?: string;
  document_type?: string;
  folder_name?: string;
  evaluation_type?: string;
  snippet: string;
  relevance_score: number;
  created_at: string;
}

export interface Statistics {
  total_documents: number;
  total_evaluations: number;
  total_folders: number;
  documents_by_agency: Record<string, number>;
  documents_by_status: Record<string, number>;
  recent_activity: Array<{
    type: string;
    name: string;
    timestamp: string;
  }>;
}

// API Error handling
export class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'APIError';
  }
}

// Generic API request handler
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const defaultOptions: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const config = { ...defaultOptions, ...options };
  
  // Remove Content-Type for FormData
  if (config.body instanceof FormData) {
    delete (config.headers as any)['Content-Type'];
  }

  try {
    const response = await fetch(url, config);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new APIError(response.status, errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(0, `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Health Check
export const healthCheck = async (): Promise<{ status: string; timestamp: string; version: string }> => {
  return apiRequest('/health');
};

// Document API
export const documentAPI = {
  // Get all documents with optional filtering
  getDocuments: async (params?: {
    folder_id?: number;
    agency?: string;
    status?: string;
    search?: string;
  }): Promise<{ documents: Document[] }> => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, value.toString());
        }
      });
    }
    
    const query = searchParams.toString();
    return apiRequest(`/documents${query ? `?${query}` : ''}`);
  },

  // Get single document
  getDocument: async (id: number): Promise<{ document: Document }> => {
    return apiRequest(`/documents/${id}`);
  },

  // Upload document
  uploadDocument: async (file: File, metadata: {
    folder_id?: number;
    agency?: string;
    document_type?: string;
    description?: string;
  }): Promise<{ document: Document }> => {
    const formData = new FormData();
    formData.append('file', file);
    
    Object.entries(metadata).forEach(([key, value]) => {
      if (value !== undefined) {
        formData.append(key, value.toString());
      }
    });

    return apiRequest('/documents/upload', {
      method: 'POST',
      body: formData,
    });
  },

  // Update document
  updateDocument: async (id: number, updates: Partial<Document>): Promise<{ document: Document }> => {
    return apiRequest(`/documents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  // Delete document
  deleteDocument: async (id: number): Promise<{ message: string }> => {
    return apiRequest(`/documents/${id}`, {
      method: 'DELETE',
    });
  },

  // Download document
  downloadDocument: async (id: number): Promise<Blob> => {
    const response = await fetch(`${API_BASE_URL}/documents/${id}/download`);
    if (!response.ok) {
      throw new APIError(response.status, 'Download failed');
    }
    return response.blob();
  },
};

// Folder API
export const folderAPI = {
  // Get all folders
  getFolders: async (): Promise<{ folders: Folder[] }> => {
    return apiRequest('/folders');
  },

  // Create folder
  createFolder: async (data: {
    name: string;
    parent_id?: number;
    description?: string;
  }): Promise<{ folder: Folder }> => {
    return apiRequest('/folders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Update folder
  updateFolder: async (id: number, updates: {
    name?: string;
    description?: string;
  }): Promise<{ folder: Folder }> => {
    return apiRequest(`/folders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  // Delete folder
  deleteFolder: async (id: number, force = false): Promise<{ message: string }> => {
    return apiRequest(`/folders/${id}?force=${force}`, {
      method: 'DELETE',
    });
  },
};

// Evaluation API
export const evaluationAPI = {
  // Get evaluations
  getEvaluations: async (document_id?: number): Promise<{ evaluations: Evaluation[] }> => {
    const query = document_id ? `?document_id=${document_id}` : '';
    return apiRequest(`/evaluations${query}`);
  },

  // Get single evaluation
  getEvaluation: async (id: number): Promise<{ evaluation: Evaluation }> => {
    return apiRequest(`/evaluations/${id}`);
  },

  // Create evaluation
  createEvaluation: async (data: {
    document_id: number;
    nofo_document_id?: number;
    evaluation_type: string;
  }): Promise<{ evaluation: Evaluation }> => {
    return apiRequest('/evaluations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// Search API
export const searchAPI = {
  // Search documents and evaluations
  search: async (params: {
    q: string;
    agency?: string;
    document_type?: string;
    folder_id?: number;
  }): Promise<{ results: SearchResult[] }> => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, value.toString());
      }
    });

    return apiRequest(`/search?${searchParams.toString()}`);
  },
};

// Statistics API
export const statsAPI = {
  // Get application statistics
  getStats: async (): Promise<{ stats: Statistics }> => {
    return apiRequest('/stats');
  },
};

// Export all APIs
export const api = {
  health: healthCheck,
  documents: documentAPI,
  folders: folderAPI,
  evaluations: evaluationAPI,
  search: searchAPI,
  stats: statsAPI,
};

export default api;
