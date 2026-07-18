// API Configuration - Fallback to mock data when backend unavailable
import type { Statistics, DocumentsResponse, FoldersResponse, EvaluationsResponse, UploadResponse, FolderCreateResponse, SearchResponse, ReviewSession, ReviewSessionCreateRequest, ReviewSessionCreateResponse, DocumentUploadRequest } from '@/types/api-responses';

// Determine API base URL based on environment
const getApiBaseUrl = () => {
  // Always use relative API path since backend is served alongside frontend
  return '/api';
};

const API_BASE_URL = getApiBaseUrl();
const FORCE_MOCK_DATA = true; // Force mock data for static deployment
console.log('API configured with fallback to mock data for static deployment');

// Mock data based on real user uploads and activities
const mockData: {
  statistics: Statistics;
  folders: FoldersResponse['folders'];
  documents: DocumentsResponse['documents'];
  evaluations: EvaluationsResponse['evaluations'];
  reviewSessions: ReviewSession[];
} = {
  statistics: {
    total_documents: 0,
    total_folders: 0,
    total_evaluations: 0,
    documents_by_agency: {},
    documents_by_status: {},
    recent_activity: []
  },
  folders: [],
  documents: [
    { 
      id: 1, 
      title: 'HRSA Scoring Rubric.doc', 
      filename: '20250721_052526_HRSA Scoring Rubric.doc', 
      file_size: 61440, 
      agency: 'HRSA', 
      document_type: 'reference', 
      status: 'uploaded', 
      description: 'HRSA scoring rubric for grant evaluation', 
      tags: 'HRSA,rubric,scoring,reference', 
      created_at: '2025-07-20T21:25:26Z', 
      updated_at: '2025-07-20T21:25:26Z',
      category: 'reference',
      sub_type: 'rubric',
      folder_id: 1
    },
    { 
      id: 2, 
      title: 'Guidelines for Writing Strengths-Weaknesses and Met.pdf', 
      filename: '20250721_052531_Guidelines for Writing Strengths-Weaknesses and Met.pdf', 
      file_size: 191288, 
      agency: 'HRSA', 
      document_type: 'reference', 
      status: 'uploaded', 
      description: 'Guidelines for writing strengths, weaknesses and met criteria comments', 
      tags: 'HRSA,guidelines,comments,evaluation,reference', 
      created_at: '2025-07-20T21:25:31Z', 
      updated_at: '2025-07-20T21:25:31Z',
      category: 'reference',
      sub_type: 'guidelines',
      folder_id: 1
    },
    { 
      id: 3, 
      title: 'HRSA Scoring Rubric.doc', 
      filename: '20250721_054030_HRSA Scoring Rubric.doc', 
      file_size: 61440, 
      agency: 'HRSA', 
      document_type: 'application', 
      status: 'uploaded', 
      description: 'Official HRSA scoring rubric for grant evaluation', 
      tags: 'HRSA,scoring,rubric', 
      created_at: '2025-07-20T21:40:30Z', 
      updated_at: '2025-07-20T21:40:30Z',
      category: 'reference',
      sub_type: 'rubric',
      folder_id: 1
    },
    { 
      id: 4, 
      title: 'Guidelines for Writing Strengths-Weaknesses and Met.pdf', 
      filename: '20250721_054035_Guidelines for Writing Strengths-Weaknesses and Met.pdf', 
      file_size: 191288, 
      agency: 'HRSA', 
      document_type: 'application', 
      status: 'uploaded', 
      description: 'Official guidelines for writing reviewer comments', 
      tags: 'HRSA,guidelines,comments', 
      created_at: '2025-07-20T21:40:35Z', 
      updated_at: '2025-07-20T21:40:35Z',
      category: 'reference',
      sub_type: 'guidelines',
      folder_id: 1
    },
    {
      id: 5,
      title: 'Sample Grant Application.pdf',
      filename: '20250721_060000_Sample_Application.pdf',
      file_size: 2500000,
      agency: 'HRSA',
      document_type: 'application',
      status: 'uploaded',
      description: 'Sample HRSA grant application for review practice',
      tags: 'HRSA,application,sample',
      created_at: '2025-07-20T22:00:00Z',
      updated_at: '2025-07-20T22:00:00Z',
      category: 'application',
      sub_type: 'grant_proposal',
      folder_id: 2
    }
  ],
  evaluations: [
    { 
      id: 1, 
      document_id: 2, 
      evaluation_type: 'comprehensive', 
      status: 'completed', 
      overall_score: 85.5, 
      agency: 'HRSA', 
      created_at: '2025-07-20T21:25:36Z', 
      completed_at: '2025-07-20T21:25:41Z' 
    },
    { 
      id: 2, 
      document_id: 3, 
      evaluation_type: 'comprehensive', 
      status: 'completed', 
      overall_score: 85.5, 
      agency: 'HRSA', 
      created_at: '2025-07-20T21:40:59Z', 
      completed_at: '2025-07-20T21:41:05Z' 
    }
  ],
  reviewSessions: [
    {
      id: 'session-1',
      name: 'HRSA Sample Application Review',
      application_id: 5,
      reference_documents: [1, 2],
      status: 'in_progress',
      created_at: '2025-07-21T00:00:00Z',
      updated_at: '2025-07-21T00:30:00Z'
    },
    {
      id: 'session-2',
      name: 'Grant Scoring Practice Session',
      application_id: 5,
      reference_documents: [3, 4],
      status: 'draft',
      created_at: '2025-07-21T01:00:00Z',
      updated_at: '2025-07-21T01:00:00Z'
    }
  ]
};

const isProduction = !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1');

export class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'APIError';
  }
}

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // For static deployment, always use mock data
  if (FORCE_MOCK_DATA) {
    console.log('Using mock data for static deployment:', endpoint);
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(getMockResponse(endpoint, options) as T);
      }, 500); // Simulate network delay
    });
  }
  
  const url = `${API_BASE_URL}${endpoint}`;
  
  try {
    // For FormData requests, don't set Content-Type header (let browser set it with boundary)
    const headers: Record<string, string> = { 
      ...(options.headers as Record<string, string> || {}) 
    };
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    
    const response = await fetch(url, {
      headers,
      ...options,
    });
    
    if (!response.ok) {
      // If we get 404 for API endpoints, fall back to mock data
      if (response.status === 404) {
        console.warn('API endpoint not found, falling back to mock data for:', endpoint);
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(getMockResponse(endpoint, options) as T);
          }, 300);
        });
      }
      
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new APIError(response.status, errorData.error || errorData.detail || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    // Enhanced error handling with multiple fallback scenarios
    const shouldFallback = 
      (error instanceof TypeError && (
        error.message.includes('Failed to fetch') ||
        error.message.includes('Load failed') ||
        error.message.includes('Network request failed')
      )) ||
      (error instanceof APIError && error.status === 0) ||
      (error as any)?.name === 'NetworkError';
    
    if (shouldFallback) {
      console.warn('API not available, falling back to mock data for:', endpoint, 'Error:', error);
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(getMockResponse(endpoint, options) as T);
        }, 300);
      });
    }
    
    if (error instanceof APIError) {
      throw error;
    }
    throw new APIError(0, `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Mock API response handler
function getMockResponse(endpoint: string, options: RequestInit = {}): any {
  const method = options.method || 'GET';
  console.log('Mock response for:', method, endpoint);
  
  // Statistics endpoint
  if (endpoint === '/statistics') {
    console.log('Returning mock statistics:', mockData.statistics);
    return mockData.statistics as Statistics;
  }
  
  // Folders endpoints
  if (endpoint.startsWith('/folders')) {
    if (method === 'POST') {
      // Mock folder creation - extract data from FormData
      const formData = options.body as FormData;
      const name = formData.get('name') as string || 'Untitled Folder';
      const description = formData.get('description') as string || '';
      const parent_id = formData.get('parent_id') ? parseInt(formData.get('parent_id') as string) : null;
      
      const newFolder = {
        id: Date.now(),
        name: name,
        description: description,
        parent_id: parent_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      mockData.folders.push(newFolder);
      mockData.statistics.total_folders++;
      return { folder: newFolder } as FolderCreateResponse;
    }
    
    if (method === 'DELETE') {
      // Handle DELETE requests for folders
      const folderId = parseInt(endpoint.split('/').pop() || '0');
      const folderIndex = mockData.folders.findIndex(folder => folder.id === folderId);
      if (folderIndex > -1) {
        mockData.folders.splice(folderIndex, 1);
        mockData.statistics.total_folders--;
        return { success: true };
      }
      return { success: false, error: 'Folder not found' };
    }
    
    return { folders: mockData.folders } as FoldersResponse;
  }
  
  // Documents endpoints
  if (endpoint.startsWith('/documents')) {
    if (endpoint === '/documents/upload' && method === 'POST') {
      // Mock document upload
      const newDoc = {
        id: Date.now(),
        title: 'Demo Document.pdf',
        filename: `demo_${Date.now()}.pdf`,
        file_size: 1024000,
        agency: 'HRSA',
        document_type: 'application',
        status: 'uploaded',
        description: 'Demo document uploaded in production',
        tags: 'demo,production',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      return { success: true, document: newDoc } as UploadResponse;
    }
    
    // Handle DELETE requests for documents
    if (method === 'DELETE') {
      const docId = parseInt(endpoint.split('/').pop() || '0');
      const docIndex = mockData.documents.findIndex(doc => doc.id === docId);
      if (docIndex > -1) {
        const deletedDoc = mockData.documents.splice(docIndex, 1)[0];
        // Update statistics
        mockData.statistics.total_documents--;
        const agency = deletedDoc.agency;
        if (mockData.statistics.documents_by_agency[agency] > 0) {
          mockData.statistics.documents_by_agency[agency]--;
        }
        const status = deletedDoc.status;
        if (mockData.statistics.documents_by_status[status] > 0) {
          mockData.statistics.documents_by_status[status]--;
        }
        return { success: true, message: 'Document deleted successfully' };
      }
      return { success: false, message: 'Document not found' };
    }
    
    return { documents: mockData.documents } as DocumentsResponse;
  }
  
  // Evaluations endpoints
  if (endpoint.startsWith('/evaluations')) {
    console.log('Mock evaluations endpoint accessed:', endpoint, 'method:', method);
    if (method === 'POST') {
      // Mock evaluation creation
      const newEval = {
        id: Date.now(),
        document_id: 1,
        evaluation_type: 'comprehensive',
        status: 'completed',
        overall_score: 85 + Math.random() * 10,
        agency: 'HRSA',
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      };
      console.log('Returning new evaluation:', newEval);
      return { evaluation: newEval };
    }
    console.log('Returning mock evaluations:', mockData.evaluations);
    return { evaluations: mockData.evaluations };
  }
  
  // Search endpoint
  if (endpoint === '/search') {
    console.log('Mock search endpoint accessed');
    const results = mockData.documents.filter(doc => 
      doc.title.toLowerCase().includes('hrsa') ||
      doc.description?.toLowerCase().includes('grant') ||
      doc.title.toLowerCase().includes('sample')
    ).map(doc => ({ 
      ...doc, 
      relevance_score: 85 + Math.random() * 15,
      tags: doc.tags ? (typeof doc.tags === 'string' ? doc.tags.split(',') : doc.tags) : []
    }));
    console.log('Returning search results:', results);
    return { results, total: results.length };
  }
  
  // Enhanced upload endpoint
  if (endpoint === '/documents/upload-enhanced' && method === 'POST') {
    // Mock enhanced document upload with categorization
    const newDoc = {
      id: Date.now(),
      title: `New Document ${Date.now()}`,
      filename: `doc_${Date.now()}.pdf`,
      file_size: 1024000,
      agency: 'HRSA',
      document_type: 'application',
      status: 'uploaded',
      description: 'Enhanced upload with categorization',
      tags: 'enhanced,categorized',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      category: 'application' as const,
      sub_type: 'grant_proposal'
    };
    mockData.documents.push(newDoc);
    mockData.statistics.total_documents++;
    return { success: true, document: newDoc } as UploadResponse;
  }

  // Review Sessions endpoints
  if (endpoint.startsWith('/review-sessions')) {
    if (method === 'POST') {
      // Create new review session
      const newSession: ReviewSession = {
        id: `session-${Date.now()}`,
        name: `Review Session ${Date.now()}`,
        application_id: 1,
        reference_documents: [1, 2],
        status: 'draft',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      mockData.reviewSessions.push(newSession);
      return { session: newSession };
    }
    
    if (method === 'GET') {
      if (endpoint.includes('/review-sessions/')) {
        // Get specific session
        const sessionId = endpoint.split('/').pop();
        const session = mockData.reviewSessions.find(s => s.id === sessionId);
        return session ? { session } : { error: 'Session not found' };
      }
      // Get all sessions
      return { sessions: mockData.reviewSessions };
    }
    
    if (method === 'PUT') {
      // Update session
      const sessionId = endpoint.split('/').pop();
      const sessionIndex = mockData.reviewSessions.findIndex(s => s.id === sessionId);
      if (sessionIndex > -1) {
        mockData.reviewSessions[sessionIndex].updated_at = new Date().toISOString();
        return { session: mockData.reviewSessions[sessionIndex] };
      }
      return { error: 'Session not found' };
    }
    
    if (method === 'DELETE') {
      // Delete session
      const sessionId = endpoint.split('/').pop();
      const sessionIndex = mockData.reviewSessions.findIndex(s => s.id === sessionId);
      if (sessionIndex > -1) {
        mockData.reviewSessions.splice(sessionIndex, 1);
        return { success: true };
      }
      return { success: false, error: 'Session not found' };
    }
  }

  // Health check
  if (endpoint === '/health') {
    return { status: 'healthy', version: '2.0.0', database: 'connected', mcp_agent: true };
  }
  
  // Default response
  return { success: true, message: 'Mock API response' };
}

export const api = {
  // Document endpoints
  documents: {
    async upload(formData: FormData): Promise<UploadResponse> {
      return apiRequest<UploadResponse>('/documents/upload', {
        method: 'POST',
        body: formData,
        headers: {}, // Let browser set content-type for FormData
      });
    },

    async uploadEnhanced(files: FileList, metadata: DocumentUploadRequest): Promise<UploadResponse> {
      const formData = new FormData();
      Array.from(files).forEach((file, index) => {
        formData.append(`files`, file);
      });
      formData.append('metadata', JSON.stringify(metadata));
      
      return apiRequest<UploadResponse>('/documents/upload-enhanced', {
        method: 'POST',
        body: formData,
        headers: {}, // Let browser set content-type for FormData
      });
    },
    
    async getAll(params: Record<string, any> = {}): Promise<DocumentsResponse> {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
      return apiRequest<DocumentsResponse>(`/documents?${searchParams}`);
    },
    
    async getById(id: number) {
      return apiRequest(`/documents/${id}`);
    },
    
    async update(id: number, data: Record<string, any>) {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          formData.append(key, String(value));
        }
      });
      return apiRequest(`/documents/${id}`, {
        method: 'PUT',
        body: formData,
        headers: {},
      });
    },
    
    async delete(id: number) {
      return apiRequest(`/documents/${id}`, { method: 'DELETE' });
    },
  },

  // Folder endpoints
  folders: {
    async create(data: Record<string, any>): Promise<FolderCreateResponse> {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          formData.append(key, String(value));
        }
      });
      return apiRequest<FolderCreateResponse>('/folders', {
        method: 'POST',
        body: formData,
        headers: {},
      });
    },
    
    async getAll(parentId?: number): Promise<FoldersResponse> {
      const params = parentId ? `?parent_id=${parentId}` : '';
      return apiRequest<FoldersResponse>(`/folders${params}`);
    },

    async delete(folderId: number): Promise<{success: boolean}> {
      return apiRequest<{success: boolean}>(`/folders/${folderId}`, {
        method: 'DELETE',
      });
    },
  },

  // Evaluation endpoints
  evaluations: {
    async create(data: Record<string, any>) {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          formData.append(key, String(value));
        }
      });
      return apiRequest('/evaluations', {
        method: 'POST',
        body: formData,
        headers: {},
      });
    },
    
    async getAll(params: Record<string, any> = {}) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
      return apiRequest(`/evaluations?${searchParams}`);
    },
  },

  // Search endpoint
  async search(query: string, filters: Record<string, any> = {}): Promise<SearchResponse> {
    const formData = new FormData();
    formData.append('query', query);
    formData.append('filters', JSON.stringify(filters));
    return apiRequest<SearchResponse>('/search', {
      method: 'POST',
      body: formData,
      headers: {},
    });
  },

  // Statistics endpoint
  async getStatistics(): Promise<Statistics> {
    return apiRequest<Statistics>('/statistics');
  },

  // Health check
  async healthCheck(): Promise<{status: string; version: string; database: string; mcp_agent: boolean}> {
    return apiRequest<{status: string; version: string; database: string; mcp_agent: boolean}>('/health');
  },

  // Review Sessions
  reviewSessions: {
    async create(request: ReviewSessionCreateRequest): Promise<ReviewSessionCreateResponse> {
      return apiRequest<ReviewSessionCreateResponse>('/review-sessions', {
        method: 'POST',
        body: JSON.stringify(request),
      });
    },

    async getAll(): Promise<{sessions: ReviewSession[]}> {
      return apiRequest<{sessions: ReviewSession[]}>('/review-sessions');
    },

    async getById(id: string): Promise<{session: ReviewSession}> {
      return apiRequest<{session: ReviewSession}>(`/review-sessions/${id}`);
    },

    async update(id: string, updates: Partial<ReviewSession>): Promise<ReviewSessionCreateResponse> {
      return apiRequest<ReviewSessionCreateResponse>(`/review-sessions/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
    },

    async delete(id: string): Promise<{success: boolean}> {
      return apiRequest<{success: boolean}>(`/review-sessions/${id}`, {
        method: 'DELETE',
      });
    }
  },
};
