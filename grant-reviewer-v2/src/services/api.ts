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

// LocalStorage persistence functions
const STORAGE_KEY = 'grant-reviewer-data';

function saveToStorage(data: any) {
  try {
    // Before saving, ensure we preserve user uploads from existing storage
    const existingData = loadFromStorage();
    if (existingData && existingData.documents) {
      const existingUserUploads = existingData.documents.filter((doc: any) => doc.isUserUpload === true);
      const newNonUserDocs = data.documents.filter((doc: any) => doc.isUserUpload !== true);
      
      // Merge: remove duplicates and prefer user uploads
      const mergedDocs = [...newNonUserDocs];
      existingUserUploads.forEach((userDoc: any) => {
        const existsInNew = mergedDocs.find(doc => doc.id === userDoc.id);
        if (!existsInNew) {
          mergedDocs.push(userDoc);
        }
      });
      
      data.documents = mergedDocs;
      console.log('🔄 Merged documents during save:', existingUserUploads.length, 'user uploads preserved');
    }
    
    const dataString = JSON.stringify(data);
    localStorage.setItem(STORAGE_KEY, dataString);
    console.log('💾 Data saved to localStorage with', data.documents?.length || 0, 'documents');
    console.log('📋 Saved documents:', data.documents?.map((d: any) => ({ 
      id: d.id, 
      title: d.title, 
      folder_id: d.folder_id,
      isUserUpload: d.isUserUpload || false
    })) || []);
    console.log('🔍 Verifying save - localStorage item length:', dataString.length);
    
    // Verify the save worked
    const verification = localStorage.getItem(STORAGE_KEY);
    if (verification) {
      console.log('✅ Save verification successful');
    } else {
      console.error('❌ Save verification failed');
    }
  } catch (error) {
    console.error('❌ Failed to save to localStorage:', error);
  }
}

function loadFromStorage() {
  try {
    console.log('🔍 Checking localStorage for key:', STORAGE_KEY);
    const stored = localStorage.getItem(STORAGE_KEY);
    console.log('📦 Raw stored data:', stored);
    if (stored) {
      const data = JSON.parse(stored);
      console.log('📂 Data loaded from localStorage:', data);
      console.log('📋 Loaded documents count:', data.documents?.length || 0);
      return data;
    } else {
      console.log('📭 No data found in localStorage');
    }
  } catch (error) {
    console.error('❌ Failed to load from localStorage:', error);
  }
  return null;
}

// Initialize with sample data for testing
const defaultMockData = {
  statistics: {
    total_documents: 3,
    total_folders: 2,
    total_evaluations: 0,
    documents_by_agency: {
      'HRSA': 2,
      'SAMHSA': 1
    },
    documents_by_status: {
      'uploaded': 3
    },
    recent_activity: []
  },
  folders: [
    {
      id: 1,
      name: "HRSA Grant Applications",
      description: "Applications for HRSA funding opportunities",
      parent_id: null,
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date(Date.now() - 86400000).toISOString()
    },
    {
      id: 2,
      name: "Reference Documents",
      description: "Scoring rubrics and evaluation guidelines",
      parent_id: null,
      created_at: new Date(Date.now() - 43200000).toISOString(),
      updated_at: new Date(Date.now() - 43200000).toISOString()
    }
  ],
  documents: [
    {
      id: 1,
      title: "HRSA Community Health Grant Application",
      filename: "hrsa_community_health_app.pdf",
      file_size: 2456789,
      agency: "HRSA",
      document_type: "application",
      status: "uploaded",
      description: "Community health center grant application",
      tags: "hrsa,community,health",
      created_at: new Date(Date.now() - 72000000).toISOString(),
      updated_at: new Date(Date.now() - 72000000).toISOString(),
      category: "application" as const,
      sub_type: "grant_proposal",
      folder_id: 1,
      isUserUpload: false
    },
    {
      id: 2,
      title: "HRSA Scoring Rubric 2025",
      filename: "hrsa_scoring_rubric_2025.doc",
      file_size: 856432,
      agency: "HRSA",
      document_type: "reference",
      status: "uploaded",
      description: "Official HRSA scoring criteria and rubric",
      tags: "hrsa,scoring,rubric",
      created_at: new Date(Date.now() - 36000000).toISOString(),
      updated_at: new Date(Date.now() - 36000000).toISOString(),
      category: "reference" as const,
      sub_type: "rubric",
      folder_id: 2,
      isUserUpload: false
    },
    {
      id: 3,
      title: "SAMHSA Behavioral Health Proposal",
      filename: "samhsa_behavioral_health.pdf",
      file_size: 3248901,
      agency: "SAMHSA",
      document_type: "application",
      status: "uploaded",
      description: "Behavioral health services grant proposal",
      tags: "samhsa,behavioral,mental health",
      created_at: new Date(Date.now() - 18000000).toISOString(),
      updated_at: new Date(Date.now() - 18000000).toISOString(),
      category: "application" as const,
      sub_type: "service_proposal",
      folder_id: null,
      isUserUpload: false
    }
  ],
  evaluations: [],
  reviewSessions: []
};

// Load existing data with smart merging to preserve user uploads
const storedData = loadFromStorage();
console.log('📂 Checking stored data from localStorage');

let mockData: {
  statistics: Statistics;
  folders: FoldersResponse['folders'];
  documents: DocumentsResponse['documents'];
  evaluations: EvaluationsResponse['evaluations'];
  reviewSessions: ReviewSession[];
};

if (storedData && storedData.documents) {
  console.log('✅ Found stored data with', storedData.documents.length, 'documents');
  
  // Separate user uploads from default documents
  const userUploads = storedData.documents.filter((doc: any) => doc.isUserUpload === true);
  const defaultDocs = defaultMockData.documents.filter(doc => !userUploads.some((upload: any) => upload.id === doc.id));
  
  // Merge: default documents + user uploads (user uploads take priority)
  const mergedDocuments = [...defaultDocs, ...userUploads];
  
  console.log('📊 Merged data: ', defaultDocs.length, 'default +', userUploads.length, 'user uploads =', mergedDocuments.length, 'total');
  
  mockData = {
    ...defaultMockData,
    documents: mergedDocuments,
    statistics: {
      ...defaultMockData.statistics,
      total_documents: mergedDocuments.length,
      documents_by_agency: {
        ...defaultMockData.statistics.documents_by_agency,
        ...(storedData.statistics?.documents_by_agency || {})
      },
      documents_by_status: {
        ...defaultMockData.statistics.documents_by_status,
        ...(storedData.statistics?.documents_by_status || {})
      }
    }
  };
} else {
  console.log('💾 No stored data found, using default data only');
  mockData = { ...defaultMockData };
}

console.log('🔄 Final data initialized with', mockData.documents.length, 'documents');
console.log('📋 Documents breakdown:', mockData.documents.map(d => ({ 
  id: d.id, 
  title: d.title, 
  folder_id: d.folder_id,
  isUserUpload: d.isUserUpload || false
})));

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
    try {
      // Add small delay to simulate network request
      await new Promise(resolve => setTimeout(resolve, 100));
      const response = await getMockResponse(endpoint, options) as T;
      console.log('Mock response generated for', endpoint, ':', response);
      return response;
    } catch (error) {
      console.error('Error generating mock response for', endpoint, ':', error);
      throw error;
    }
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
async function getMockResponse(endpoint: string, options: RequestInit = {}): Promise<any> {
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
      saveToStorage(mockData);
      return { folder: newFolder } as FolderCreateResponse;
    }
    
    if (method === 'DELETE') {
      // Handle DELETE requests for folders
      const folderId = parseInt(endpoint.split('/').pop() || '0');
      const folderIndex = mockData.folders.findIndex(folder => folder.id === folderId);
      if (folderIndex > -1) {
        mockData.folders.splice(folderIndex, 1);
        mockData.statistics.total_folders--;
        saveToStorage(mockData);
        return { success: true };
      }
      return { success: false, error: 'Folder not found' };
    }
    
    return { folders: mockData.folders } as FoldersResponse;
  }
  
  // Documents endpoints
  if (endpoint.startsWith('/documents')) {
    if (endpoint === '/documents/upload' && method === 'POST') {
      // Mock document upload - extract data from FormData
      const formData = options.body as FormData;
      const folderId = formData.get('folder_id') ? parseInt(formData.get('folder_id') as string) : null;
      const agency = formData.get('agency') as string || 'HRSA';
      const documentType = formData.get('document_type') as string || 'application';
      const description = formData.get('description') as string || 'Demo document uploaded in production';
      const file = formData.get('file') as File;
      
      const newDoc = {
        id: Date.now(),
        title: file ? file.name : 'Demo Document.pdf',
        filename: file ? `${Date.now()}_${file.name}` : `demo_${Date.now()}.pdf`,
        file_size: file ? file.size : 1024000,
        agency: agency,
        document_type: documentType,
        status: 'uploaded',
        description: description,
        tags: 'uploaded,document',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        category: documentType === 'application' ? 'application' as const : 'reference' as const,
        sub_type: documentType === 'application' ? 'grant_proposal' : 'reference_document',
        folder_id: folderId
      };
      mockData.documents.push(newDoc);
      mockData.statistics.total_documents++;
      
      // Update agency statistics
      if (!mockData.statistics.documents_by_agency[agency]) {
        mockData.statistics.documents_by_agency[agency] = 0;
      }
      mockData.statistics.documents_by_agency[agency]++;
      
      // Update status statistics
      if (!mockData.statistics.documents_by_status['uploaded']) {
        mockData.statistics.documents_by_status['uploaded'] = 0;
      }
      mockData.statistics.documents_by_status['uploaded']++;
      
      saveToStorage(mockData);
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
        saveToStorage(mockData);
        return { success: true, message: 'Document deleted successfully' };
      }
      return { success: false, message: 'Document not found' };
    }
    
    // Handle GET documents with query parameters
    const url = new URL(endpoint, 'http://localhost');
    const folderId = url.searchParams.get('folder_id');
    const sortBy = url.searchParams.get('sort_by') || 'created_at';
    const sortOrder = url.searchParams.get('sort_order') || 'desc';
    
    let filteredDocuments = [...mockData.documents];
    
    // Filter by folder_id if provided
    if (folderId) {
      const folderIdNum = parseInt(folderId);
      console.log('🔍 Filtering documents by folder_id:', folderIdNum);
      console.log('📂 Total documents before filtering:', filteredDocuments.length);
      filteredDocuments = filteredDocuments.filter(doc => doc.folder_id === folderIdNum);
      console.log('📂 Documents after filtering by folder:', filteredDocuments.length);
      console.log('📋 Filtered documents:', filteredDocuments.map(d => ({ id: d.id, title: d.title, folder_id: d.folder_id })));
    } else {
      console.log('📂 No folder filter applied, showing all documents:', filteredDocuments.length);
    }
    
    // Sort documents
    filteredDocuments.sort((a, b) => {
      const aValue = a[sortBy as keyof typeof a];
      const bValue = b[sortBy as keyof typeof b];
      
      if (sortOrder === 'desc') {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      } else {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      }
    });
    
    return { documents: filteredDocuments } as DocumentsResponse;
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
  
  // Enhanced upload endpoint with comprehensive debugging
  if (endpoint === '/documents/upload-enhanced' && method === 'POST') {
    console.log('🎯 API Enhanced upload endpoint called');
    console.log('🔍 API Request details:', { endpoint, method });
    console.log('📦 API Request body type:', typeof options.body);
    
    const formData = options.body as FormData;
    console.log('📋 API FormData received, extracting metadata...');
    
    const metadataString = formData.get('metadata') as string;
    console.log('📄 API Raw metadata string:', metadataString);
    
    const metadata = metadataString ? JSON.parse(metadataString) : {};
    console.log('📋 API Parsed metadata:', metadata);
    console.log('📁 API Folder ID from metadata:', metadata.folder_id);
    console.log('📂 API Category from metadata:', metadata.category);
    console.log('🏢 API Agency from metadata:', metadata.agency);
    
    // Get all files from the FormData
    const filesArray = formData.getAll('files') as File[];
    console.log('📂 API Files received count:', filesArray.length);
    console.log('📂 API Files details:', filesArray.map(f => ({ name: f.name, size: f.size, type: f.type })));
    
    if (filesArray.length === 0) {
      console.error('❌ API No files received in upload request');
      return { success: false, error: 'No files received' };
    }
    
    const uploadedDocs = [];
    console.log('🔄 API Processing files...');
    
    // Process each file with content storage
    for (let i = 0; i < filesArray.length; i++) {
      const file = filesArray[i];
      const docId = Date.now() + i; // Ensure unique IDs
      
      console.log(`📝 API Processing file ${i + 1}/${filesArray.length}: ${file.name}`);
      
      // Read file content as Base64 for storage
      let fileContent = '';
      try {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
        fileContent = btoa(binary);
        console.log(`📄 API File content read and encoded: ${fileContent.length} chars`);
      } catch (error) {
        console.warn('⚠️ API Could not read file content:', error);
        // For text files, try reading as text
        if (file.type.startsWith('text/')) {
          try {
            fileContent = btoa(await file.text());
          } catch (textError) {
            console.warn('⚠️ API Could not read as text either');
          }
        }
      }
      
      const newDoc = {
        id: docId,
        title: file.name,
        filename: `${docId}_${file.name}`,
        file_size: file.size,
        agency: metadata.agency || 'HRSA',
        document_type: metadata.category || 'reference',
        status: 'uploaded',
        description: metadata.description || `Uploaded document: ${file.name}`,
        tags: 'enhanced,uploaded,user',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        category: metadata.category || 'reference' as const,
        sub_type: metadata.sub_type || 'rubric',
        folder_id: metadata.folder_id || null,
        isUserUpload: true, // Mark as user upload for persistence
        fileContent: fileContent, // Store Base64 content for viewing
        contentType: file.type || 'application/octet-stream'
      };
      
      console.log('✅ API Created document object:', {
        id: newDoc.id,
        title: newDoc.title,
        folder_id: newDoc.folder_id,
        agency: newDoc.agency,
        category: newDoc.category,
        isUserUpload: newDoc.isUserUpload,
        hasContent: !!newDoc.fileContent
      });
      
      // Add to mock data
      mockData.documents.push(newDoc);
      uploadedDocs.push(newDoc);
      mockData.statistics.total_documents++;
      
      console.log('📊 API Updated document count:', mockData.documents.length);
      
      // Update agency statistics
      const agency = metadata.agency || 'HRSA';
      if (!mockData.statistics.documents_by_agency[agency]) {
        mockData.statistics.documents_by_agency[agency] = 0;
      }
      mockData.statistics.documents_by_agency[agency]++;
      
      // Update status statistics
      if (!mockData.statistics.documents_by_status['uploaded']) {
        mockData.statistics.documents_by_status['uploaded'] = 0;
      }
      mockData.statistics.documents_by_status['uploaded']++;
    }
    
    console.log('💾 API Saving to localStorage...');
    console.log('📊 API Total documents before save:', mockData.documents.length);
    console.log('📋 API All documents before save:', mockData.documents.map(d => ({ 
      id: d.id, 
      title: d.title, 
      folder_id: d.folder_id 
    })));
    
    saveToStorage(mockData);
    
    console.log('✅ API Successfully saved to localStorage');
    console.log('🎉 API Upload processing completed successfully');
    console.log('📊 API Uploaded documents count:', uploadedDocs.length);
    console.log('📋 API Uploaded documents:', uploadedDocs.map(d => ({ 
      id: d.id, 
      title: d.title, 
      folder_id: d.folder_id 
    })));
    
    // Return the full response
    const response = { 
      success: true, 
      document: uploadedDocs[0], // Return first document for compatibility
      documents: uploadedDocs, // Also return all uploaded documents
      message: `Successfully uploaded ${uploadedDocs.length} file(s)`
    } as UploadResponse;
    
    console.log('📦 API Returning response object:', response);
    console.log('✅ API Enhanced upload endpoint completed successfully');
    
    return response;
  }

  // Review Sessions endpoints
  if (endpoint.startsWith('/review-sessions')) {
    if (method === 'POST') {
      // Mock session creation
      const newSession = {
        id: `session-${Date.now()}`,
        name: 'New Review Session',
        application_id: 1,
        reference_documents: [],
        status: 'draft' as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      mockData.reviewSessions.push(newSession);
      saveToStorage(mockData);
      return { session: newSession } as ReviewSessionCreateResponse;
    }
    
    const sessionId = endpoint.split('/').pop();
    if (sessionId && sessionId !== 'review-sessions') {
      // Get specific session
      const session = mockData.reviewSessions.find(s => s.id === sessionId);
      return session ? { session } : { error: 'Session not found' };
    }
    
    return { sessions: mockData.reviewSessions };
  }

  // Health check
  if (endpoint === '/health') {
    console.log('Returning mock health check');
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
      console.log('🚀 API uploadEnhanced called');
      console.log('📋 API uploadEnhanced metadata:', metadata);
      console.log('📂 API uploadEnhanced files:', Array.from(files).map(f => ({ name: f.name, size: f.size })));
      console.log('📁 API uploadEnhanced folder_id:', metadata.folder_id);
      
      const formData = new FormData();
      Array.from(files).forEach((file, index) => {
        console.log(`📎 API Adding file ${index + 1}:`, file.name);
        formData.append(`files`, file);
      });
      
      const metadataString = JSON.stringify(metadata);
      console.log('📋 API Metadata string:', metadataString);
      formData.append('metadata', metadataString);
      
      console.log('🌐 API Making request to /documents/upload-enhanced');
      
      try {
        const result = await apiRequest<UploadResponse>('/documents/upload-enhanced', {
          method: 'POST',
          body: formData,
          headers: {}, // Let browser set content-type for FormData
        });
        
        console.log('✅ API uploadEnhanced successful');
        console.log('📦 API uploadEnhanced result:', result);
        return result;
      } catch (error) {
        console.error('❌ API uploadEnhanced failed:', error);
        throw error;
      }
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
      return apiRequest(`/documents/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    
    async delete(id: number) {
      return apiRequest(`/documents/${id}`, {
        method: 'DELETE',
      });
    },
  },

  // Folder endpoints
  folders: {
    async getAll(): Promise<FoldersResponse> {
      return apiRequest<FoldersResponse>('/folders');
    },
    
    async create(folderData: {name: string, description: string, parent_id?: string | number}): Promise<FolderCreateResponse> {
      const formData = new FormData();
      formData.append('name', folderData.name);
      formData.append('description', folderData.description);
      if (folderData.parent_id) {
        formData.append('parent_id', folderData.parent_id.toString());
      }
      
      return apiRequest<FolderCreateResponse>('/folders', {
        method: 'POST',
        body: formData,
        headers: {},
      });
    },
    
    async delete(id: number) {
      return apiRequest(`/folders/${id}`, {
        method: 'DELETE',
      });
    },
  },

  // Evaluation endpoints
  evaluations: {
    async getAll(params: Record<string, any> = {}): Promise<EvaluationsResponse> {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
      return apiRequest<EvaluationsResponse>(`/evaluations?${searchParams}`);
    },
    
    async create(evaluationData: {document_id: number, evaluation_type: string}) {
      return apiRequest('/evaluations', {
        method: 'POST',
        body: JSON.stringify(evaluationData),
      });
    },
    
    async getById(id: number) {
      return apiRequest(`/evaluations/${id}`);
    },
  },

  // Search endpoint
  search: {
    async query(query: string, filters: Record<string, any> = {}): Promise<SearchResponse> {
      const searchParams = new URLSearchParams();
      searchParams.append('q', query);
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
      return apiRequest<SearchResponse>(`/search?${searchParams}`);
    },
  },

  // Folder operations
  folder: {
    async create(folderData: {name: string, description: string}): Promise<FolderCreateResponse> {
      const formData = new FormData();
      formData.append('name', folderData.name);
      formData.append('description', folderData.description);
      
      return apiRequest<FolderCreateResponse>('/folders', {
        method: 'POST',
        body: formData,
        headers: {},
      });
    },
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
