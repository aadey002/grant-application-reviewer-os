import { supabase } from '../lib/supabase';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Returns an Authorization header value if a session exists, otherwise null. */
async function getAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: 'Bearer ' + token } : {};
}

/** Normalize error responses from FastAPI into a readable string. */
function normalizeError(detail: unknown, fallback: string): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((item: any) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && item.msg) {
        const loc = Array.isArray(item.loc) ? item.loc.filter((s: any) => s !== 'body').join('.') : '';
        return loc ? `${loc}: ${item.msg}` : item.msg;
      }
      return JSON.stringify(item);
    }).join('; ');
  }
  if (detail && typeof detail === 'object' && 'msg' in (detail as any)) return (detail as any).msg;
  return fallback;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SafeEvidence { page: number; quote: string; matched_keywords: string[] }
export interface SafeCriterion {
  name: string; maximum_points: number; status: string;
  automated_points: number | null; final_points: number | null;
  human_review_required: boolean; evidence: SafeEvidence[];
  draft_strength: string | null; draft_weakness: string | null;
  score?: number; score_rationale?: string;
  strengths?: Array<{comment:string;pages:number[]}>;
  mets?: Array<{comment:string;pages:number[]}>;
  weaknesses?: Array<{comment:string;pages:number[]}>;
  subcriteria?: Array<{name:string;score:number;maximum_points:number}>;
}
export interface SafeReview {
  review_id: string; application_file: string; page_count: number; word_count: number;
  agency: string; application_index: number;
  review_status: string; final_score: number | null; certification: string;
  maximum_score?: number; applicant_name?: string; application_number?: string;
  completed_worksheet_url?: string | null;
  criteria: SafeCriterion[];
}

export interface ReviewPackage { applications: File[]; nofo: File; rubric: File | null; worksheet: File | null; agency:string }
export interface ExtractedCriterion { number:number; name:string; points:number; keywords:string[]; source_page:number; source_heading:string }
export interface ExtractedRubric { agency:string; criteria:ExtractedCriterion[]; total_points:number; status:string; warnings:string[]; approved?:boolean }

export interface JobStatus {
  job_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number;          // 0–100
  message?: string;
  review_id?: string;
}

export interface ReviewResults {
  review_id: string;
  reviews: SafeReview[];
}

// ---------------------------------------------------------------------------
// Supabase Storage helpers
// ---------------------------------------------------------------------------

async function uploadToStorage(
  bucket: string,
  path: string,
  file: File
): Promise<string> {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) throw new Error('Storage upload failed: ' + error.message);
  return path;
}

// ---------------------------------------------------------------------------
// API — rubric extraction
// ---------------------------------------------------------------------------

export const extractRubric = async (nofo: File, agency: string): Promise<ExtractedRubric> => {
  const authHeader = await getAuthHeader();
  const { data: { user } } = await supabase.auth.getUser();
  const reviewId = crypto.randomUUID();

  // Upload NOFO to Supabase Storage
  let nofoStoragePath: string | null = null;
  if (user) {
    nofoStoragePath = await uploadToStorage(
      'nofo-files',
      user.id + '/' + reviewId + '/nofo.pdf',
      nofo
    );
  }

  const formData = new FormData();
  if (nofoStoragePath) {
    formData.append('nofo_storage_path', nofoStoragePath);
  } else {
    formData.append('nofo', nofo);
  }
  formData.append('agency', agency);

  const response = await fetch(API_BASE_URL + '/safe-reviews/extract-rubric', {
    method: 'POST',
    headers: authHeader,
    body: formData,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(normalizeError(body.detail, 'Rubric extraction failed'));
  return body.rubric;
};

// ---------------------------------------------------------------------------
// API — run reviews (returns job IDs for async polling)
// ---------------------------------------------------------------------------

export interface RunJobsResult {
  review_id: string;
  job_ids: string[];
}

export const runSafeReviews = async (
  item: ReviewPackage,
  criteria: ExtractedRubric,
  onUploadProgress?: (file: string, done: boolean) => void,
): Promise<RunJobsResult> => {
  const authHeader = await getAuthHeader();
  const { data: { user } } = await supabase.auth.getUser();
  const reviewId = crypto.randomUUID();
  const prefix = (user?.id || 'anonymous-test') + '/' + reviewId;

  // Upload NOFO directly to Supabase Storage
  onUploadProgress?.(item.nofo.name, false);
  const nofoPath = await uploadToStorage('nofo-files', prefix + '/nofo/' + item.nofo.name, item.nofo);
  onUploadProgress?.(item.nofo.name, true);

  // Upload applications directly to Supabase Storage
  const appPaths: string[] = [];
  for (let i = 0; i < item.applications.length; i++) {
    const f = item.applications[i];
    onUploadProgress?.(f.name, false);
    const path = await uploadToStorage('grant-applications', prefix + '/applications/' + i + '_' + f.name, f);
    appPaths.push(path);
    onUploadProgress?.(f.name, true);
  }

  // Upload optional rubric/worksheet
  let rubricPath: string | undefined;
  let worksheetPath: string | undefined;
  if (item.rubric) {
    onUploadProgress?.(item.rubric.name, false);
    rubricPath = await uploadToStorage('worksheet-templates', prefix + '/rubric/' + item.rubric.name, item.rubric);
    onUploadProgress?.(item.rubric.name, true);
  }
  if (item.worksheet) {
    onUploadProgress?.(item.worksheet.name, false);
    worksheetPath = await uploadToStorage('worksheet-templates', prefix + '/worksheet/' + item.worksheet.name, item.worksheet);
    onUploadProgress?.(item.worksheet.name, true);
  }

  // Lightweight enqueue call — metadata only, no file bytes
  const formData = new FormData();
  formData.append('application_storage_paths', JSON.stringify(appPaths));
  formData.append('nofo_storage_path', nofoPath);
  if (rubricPath) formData.append('rubric_storage_path', rubricPath);
  if (worksheetPath) formData.append('worksheet_storage_path', worksheetPath);
  formData.append('agency', item.agency);
  formData.append('approved_criteria', JSON.stringify(criteria.criteria));
  formData.append('review_id', reviewId);
  formData.append('user_id', prefix.split('/')[0]);

  const response = await fetch(API_BASE_URL + '/safe-reviews/enqueue', {
    method: 'POST',
    headers: authHeader,
    body: formData,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(normalizeError(body.detail, 'Review processing failed'));

  // API returns { review_id, job_ids } for async polling
  // Fallback: if API returns reviews directly (legacy), wrap them
  if (body.reviews) {
    return { review_id: reviewId, job_ids: [] };
  }
  return { review_id: body.review_id ?? reviewId, job_ids: body.job_ids ?? [] };
};

// ---------------------------------------------------------------------------
// Polling & results
// ---------------------------------------------------------------------------

export const pollJobStatus = async (jobId: string): Promise<JobStatus> => {
  const authHeader = await getAuthHeader();
  const response = await fetch(API_BASE_URL + '/jobs/' + jobId + '/status', {
    headers: authHeader,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(normalizeError(body.detail, 'Job status fetch failed'));
  return body as JobStatus;
};

export const getReviewResults = async (reviewId: string): Promise<ReviewResults> => {
  const authHeader = await getAuthHeader();
  const response = await fetch(API_BASE_URL + '/reviews/' + reviewId + '/results', {
    headers: authHeader,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(normalizeError(body.detail, 'Results fetch failed'));
  return body as ReviewResults;
};

export const getWorksheetUrl = async (reviewId: string, applicationId: string): Promise<string> => {
  const authHeader = await getAuthHeader();
  const response = await fetch(
    API_BASE_URL + '/reviews/' + reviewId + '/worksheet/' + applicationId,
    { headers: authHeader }
  );
  const body = await response.json();
  if (!response.ok) throw new Error(normalizeError(body.detail, 'Worksheet URL fetch failed'));
  return (body.url ?? body.signed_url ?? '') as string;
};

export const deleteReview = async (reviewId: string): Promise<void> => {
  const authHeader = await getAuthHeader();
  const response = await fetch(API_BASE_URL + '/reviews/' + reviewId, {
    method: 'DELETE',
    headers: authHeader,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail || 'Delete failed');
  }
};

// ---------------------------------------------------------------------------
// Legacy helpers (kept for backward compatibility)
// ---------------------------------------------------------------------------

export interface UploadResponse {
  success: boolean; file_id: string; document_id: number;
  filename: string; file_path: string; agency: string; size: number;
}
export interface DocumentInfo { type: string; pages: number; sections: number; tables: number; word_count?: number }
export interface AnalysisResponse {
  success: boolean; cached?: boolean;
  analysis: {
    document_info: DocumentInfo;
    evaluation: {
      evaluation_date: string; grant_agency: string; overall_assessment: string;
      completeness_score: number; strengths: string[]; concerns: string[];
      recommendations: string[]; missing_elements: string[];
    };
    scoring: {
      scoring_date: string; grant_agency: string; overall_score: number;
      total_possible: number; points_earned: number;
      criterion_scores: Record<string, unknown>; criterion_breakdown: string;
      recommendation: string; score_distribution: Record<string, number>;
    };
    comments: {
      generation_date: string; grant_agency: string; strengths: string;
      weaknesses: string; met_criteria: string; overview: string; total_references: number;
    };
    worksheet: { generation_date: string; content: string; pages_reviewed: number; criteria_count: number; reference_count: number };
    agency: string;
  };
}
export interface SystemStats {
  total_documents: number; processed_documents: number; total_evaluations: number;
  average_score: number; agency_distribution: Record<string, number>; processing_rate: number;
}

export const uploadDocument = async (file: File, agency = 'HRSA'): Promise<UploadResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('agency', agency);
  const response = await fetch(API_BASE_URL + '/upload', { method: 'POST', body: formData });
  if (!response.ok) throw new Error('Upload failed: ' + response.statusText);
  return response.json();
};

export const checkHealth = async () => {
  const response = await fetch(API_BASE_URL + '/health');
  if (!response.ok) throw new Error('Health check failed: ' + response.statusText);
  return response.json();
};

export const getStatistics = async (): Promise<SystemStats> => {
  const response = await fetch(API_BASE_URL + '/statistics');
  if (!response.ok) throw new Error('Statistics failed: ' + response.statusText);
  return response.json();
};

export const getDocuments = async (limit = 50, offset = 0) => {
  const response = await fetch(API_BASE_URL + '/documents?limit=' + limit + '&offset=' + offset);
  if (!response.ok) throw new Error('Documents list failed: ' + response.statusText);
  return response.json();
};

export const getDocumentDetails = async (fileId: string) => {
  const response = await fetch(API_BASE_URL + '/document/' + fileId);
  if (!response.ok) throw new Error('Document details failed: ' + response.statusText);
  return response.json();
};
