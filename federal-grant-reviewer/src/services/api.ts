const API_BASE_URL = 'http://localhost:8000';

export interface UploadResponse {
  success: boolean;
  file_id: string;
  document_id: number;
  filename: string;
  file_path: string;
  agency: string;
  size: number;
}

export interface DocumentInfo {
  type: string;
  pages: number;
  sections: number;
  tables: number;
  word_count?: number;
}

export interface AnalysisResponse {
  success: boolean;
  cached?: boolean;
  analysis: {
    document_info: DocumentInfo;
    evaluation: {
      evaluation_date: string;
      grant_agency: string;
      overall_assessment: string;
      completeness_score: number;
      strengths: string[];
      concerns: string[];
      recommendations: string[];
      missing_elements: string[];
    };
    scoring: {
      scoring_date: string;
      grant_agency: string;
      overall_score: number;
      total_possible: number;
      points_earned: number;
      criterion_scores: Record<string, any>;
      criterion_breakdown: string;
      recommendation: string;
      score_distribution: Record<string, number>;
    };
    comments: {
      generation_date: string;
      grant_agency: string;
      strengths: string;
      weaknesses: string;
      met_criteria: string;
      overview: string;
      total_references: number;
    };
    worksheet: {
      generation_date: string;
      content: string;
      pages_reviewed: number;
      criteria_count: number;
      reference_count: number;
    };
    agency: string;
  };
}

export interface SystemStats {
  total_documents: number;
  processed_documents: number;
  total_evaluations: number;
  average_score: number;
  agency_distribution: Record<string, number>;
  processing_rate: number;
}

export const uploadDocument = async (file: File, agency: string = 'HRSA'): Promise<UploadResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('agency', agency);

  const response = await fetch(`${API_BASE_URL}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`);
  }

  return response.json();
};

export const analyzeSimple = async (fileId: string, agency: string = 'HRSA'): Promise<AnalysisResponse> => {
  const formData = new FormData();
  formData.append('file_id', fileId);
  formData.append('agency', agency);

  const response = await fetch(`${API_BASE_URL}/analyze-simple`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Analysis failed: ${response.statusText}`);
  }

  return response.json();
};

export const analyzeDocument = async (filePath: string, agency: string = 'HRSA', nofoPath?: string): Promise<AnalysisResponse> => {
  const formData = new FormData();
  formData.append('file_path', filePath);
  formData.append('agency', agency);
  if (nofoPath) {
    formData.append('nofo_path', nofoPath);
  }

  const response = await fetch(`${API_BASE_URL}/analyze`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Analysis failed: ${response.statusText}`);
  }

  return response.json();
};

export const checkHealth = async () => {
  const response = await fetch(`${API_BASE_URL}/health`);
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.statusText}`);
  }
  return response.json();
};

export const getStatistics = async (): Promise<SystemStats> => {
  const response = await fetch(`${API_BASE_URL}/statistics`);
  if (!response.ok) {
    throw new Error(`Statistics failed: ${response.statusText}`);
  }
  return response.json();
};

export const getDocuments = async (limit: number = 50, offset: number = 0) => {
  const response = await fetch(`${API_BASE_URL}/documents?limit=${limit}&offset=${offset}`);
  if (!response.ok) {
    throw new Error(`Documents list failed: ${response.statusText}`);
  }
  return response.json();
};

export const getDocumentDetails = async (fileId: string) => {
  const response = await fetch(`${API_BASE_URL}/document/${fileId}`);
  if (!response.ok) {
    throw new Error(`Document details failed: ${response.statusText}`);
  }
  return response.json();
};