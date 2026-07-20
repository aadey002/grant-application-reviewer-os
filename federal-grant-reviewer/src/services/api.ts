import { supabase } from '../lib/supabase';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

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

export interface ReviewPackage { applications: File[]; nofo: File; rubric: File | null; worksheet: File | null; agency: string }
export interface ExtractedCriterion { number: number; name: string; points: number; keywords: string[]; source_page: number; source_heading: string }
export interface ExtractedRubric { agency: string; criteria: ExtractedCriterion[]; total_points: number; status: string; warnings: string[]; approved?: boolean }

export interface JobStatus {
  job_id: string;
  application_id: string;
  status: 'queued' | 'uploading' | 'uploaded' | 'extracting' | 'processing' | 'scoring' | 'generating_worksheet' | 'completed' | 'failed';
  progress?: number;
  message?: string;
  error_message?: string | null;
  review_id?: string;
}

export interface RunJobsResult {
  review_id: string;
  job_ids: string[];
}

export interface ReviewResults {
  review_id: string;
  reviews: SafeReview[];
}

// ---------------------------------------------------------------------------
// Supabase Storage helpers
// ---------------------------------------------------------------------------

async function uploadToStorage(bucket: string, path: string, file: File): Promise<string> {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) throw new Error('Storage upload failed: ' + error.message);
  return path;
}

// ---------------------------------------------------------------------------
// Rubric extraction — still uses Railway for PDF parsing
// ---------------------------------------------------------------------------

export const extractRubric = async (nofo: File, agency: string): Promise<ExtractedRubric> => {
  const formData = new FormData();
  formData.append('nofo', nofo);
  formData.append('agency', agency);
  const response = await fetch(API_BASE_URL + '/safe-reviews/extract-rubric', { method: 'POST', body: formData });
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Rubric extraction failed');
  return body.rubric;
};

// ---------------------------------------------------------------------------
// Supabase-first review submission
// ---------------------------------------------------------------------------

export const createReviewAndUpload = async (
  item: ReviewPackage,
  criteria: ExtractedRubric,
  onProgress?: (stage: string, detail: string) => void,
): Promise<RunJobsResult> => {
  const userId = 'anonymous-test';
  const reviewId = crypto.randomUUID();
  const prefix = userId + '/' + reviewId;

  // STEP 1: Create grant_review in Supabase FIRST — before any uploads
  onProgress?.('creating', 'Creating review record...');
  const { error: reviewError } = await supabase.from('grant_reviews').insert({
    id: reviewId,
    user_id: userId,
    agency: item.agency,
    nofo_filename: item.nofo.name,
    nofo_storage_path: '',
    status: 'uploading',
    extracted_rubric: criteria,
    total_points: criteria.total_points,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (reviewError) throw new Error('Failed to create review: ' + reviewError.message);

  // STEP 2: Upload NOFO to Supabase Storage
  onProgress?.('uploading', 'Uploading NOFO: ' + item.nofo.name);
  const nofoPath = await uploadToStorage('nofo-files', prefix + '/nofo/' + item.nofo.name, item.nofo);

  // Update review with NOFO path
  await supabase.from('grant_reviews').update({
    nofo_storage_path: nofoPath,
    updated_at: new Date().toISOString(),
  }).eq('id', reviewId);

  // STEP 3: Upload optional worksheet
  let worksheetPath = '';
  if (item.worksheet) {
    onProgress?.('uploading', 'Uploading worksheet: ' + item.worksheet.name);
    worksheetPath = await uploadToStorage('worksheet-templates', prefix + '/worksheet/' + item.worksheet.name, item.worksheet);
    await supabase.from('grant_reviews').update({
      worksheet_storage_path: worksheetPath,
      updated_at: new Date().toISOString(),
    }).eq('id', reviewId);
  }

  // STEP 4: Upload each application + create DB records
  const jobIds: string[] = [];
  for (let i = 0; i < item.applications.length; i++) {
    const file = item.applications[i];
    const appId = crypto.randomUUID();
    const jobId = crypto.randomUUID();

    onProgress?.('uploading', `Uploading application ${i + 1}/${item.applications.length}: ${file.name}`);
    const appPath = await uploadToStorage('grant-applications', prefix + '/applications/' + i + '_' + file.name, file);

    // Create application row
    await supabase.from('applications').insert({
      id: appId,
      review_id: reviewId,
      user_id: userId,
      filename: file.name,
      storage_path: appPath,
      status: 'uploaded',
      agency: item.agency,
      criteria: JSON.stringify(criteria.criteria),
      nofo_storage_path: nofoPath,
      worksheet_storage_path: worksheetPath,
      created_at: new Date().toISOString(),
    });

    // Create processing_job row
    await supabase.from('processing_jobs').insert({
      id: jobId,
      application_id: appId,
      review_id: reviewId,
      user_id: userId,
      status: 'queued',
      agency: item.agency,
      criteria: JSON.stringify(criteria.criteria),
      nofo_storage_path: nofoPath,
      worksheet_storage_path: worksheetPath,
      created_at: new Date().toISOString(),
    });

    jobIds.push(jobId);
  }

  // STEP 5: Update review status
  await supabase.from('grant_reviews').update({
    status: 'processing',
    updated_at: new Date().toISOString(),
  }).eq('id', reviewId);

  // STEP 6: Notify the worker to start processing (fire-and-forget)
  onProgress?.('enqueuing', 'Starting review processing...');
  for (const jobId of jobIds) {
    fetch(API_BASE_URL + '/jobs/' + jobId + '/process', { method: 'POST' }).catch(() => {
      // Worker unavailable — job stays queued, user can retry later
    });
  }

  return { review_id: reviewId, job_ids: jobIds };
};

// Keep old name as alias
export const runSafeReviews = createReviewAndUpload;

// ---------------------------------------------------------------------------
// Poll job status — reads directly from Supabase
// ---------------------------------------------------------------------------

export const pollJobStatus = async (jobId: string): Promise<JobStatus> => {
  const { data, error } = await supabase
    .from('processing_jobs')
    .select('id, application_id, review_id, status, error_message, started_at, completed_at')
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw new Error('Poll error: ' + error.message);
  if (!data) return { job_id: jobId, application_id: '', status: 'failed', error_message: 'Job not found in database', review_id: '' };
  return {
    job_id: data.id,
    application_id: data.application_id,
    status: data.status as JobStatus['status'],
    error_message: data.error_message,
    review_id: data.review_id,
  };
};

// ---------------------------------------------------------------------------
// Get review results — reads directly from Supabase
// ---------------------------------------------------------------------------

export const getReviewResults = async (reviewId: string): Promise<ReviewResults> => {
  const { data: apps, error } = await supabase
    .from('applications')
    .select('*')
    .eq('review_id', reviewId)
    .eq('status', 'completed');
  if (error) throw new Error('Failed to fetch results: ' + error.message);

  const reviews: SafeReview[] = [];
  for (const app of (apps || [])) {
    const result = typeof app.full_result === 'string' ? JSON.parse(app.full_result) : app.full_result;
    if (!result) continue;
    reviews.push({
      review_id: result.review_id || app.review_id,
      application_file: app.filename,
      page_count: result.page_count || app.page_count || 0,
      word_count: result.word_count || app.word_count || 0,
      agency: app.agency || 'HRSA',
      application_index: result.application_index || 1,
      review_status: result.review_status || app.review_status || 'completed',
      final_score: result.final_score ?? app.final_score,
      certification: result.certification || '',
      maximum_score: result.maximum_score ?? app.maximum_score,
      applicant_name: result.applicant_name ?? app.applicant_name,
      application_number: result.application_number ?? app.application_number,
      completed_worksheet_url: null,
      criteria: result.criteria || [],
    });
  }
  return { review_id: reviewId, reviews };
};

// ---------------------------------------------------------------------------
// Get worksheet download URL — signed URL from Supabase Storage
// ---------------------------------------------------------------------------

export const getWorksheetUrl = async (reviewId: string, applicationId: string): Promise<string> => {
  const { data } = await supabase
    .from('generated_documents')
    .select('storage_path, storage_bucket')
    .eq('application_id', applicationId)
    .eq('document_type', 'completed_worksheet')
    .single();
  if (!data) throw new Error('Worksheet not found');
  const bucket = data.storage_bucket || 'completed-worksheets';
  const { data: urlData, error } = await supabase.storage.from(bucket).createSignedUrl(data.storage_path, 3600);
  if (error || !urlData) throw new Error('Failed to create download URL');
  return urlData.signedUrl;
};

// ---------------------------------------------------------------------------
// Delete review — removes from Supabase
// ---------------------------------------------------------------------------

export const deleteReview = async (reviewId: string): Promise<void> => {
  // Delete in correct order for FK constraints
  const { data: apps } = await supabase.from('applications').select('id').eq('review_id', reviewId);
  if (apps) {
    for (const app of apps) {
      await supabase.from('generated_documents').delete().eq('application_id', app.id);
      await supabase.from('review_findings').delete().eq('application_id', app.id);
      await supabase.from('criterion_scores').delete().eq('application_id', app.id);
      await supabase.from('processing_jobs').delete().eq('application_id', app.id);
    }
    await supabase.from('applications').delete().eq('review_id', reviewId);
  }
  await supabase.from('grant_reviews').delete().eq('id', reviewId);
};

// ---------------------------------------------------------------------------
// Retry a failed job — resets status and notifies worker
// ---------------------------------------------------------------------------

export const retryJob = async (jobId: string): Promise<void> => {
  await supabase.from('processing_jobs').update({
    status: 'queued',
    error_message: null,
    started_at: null,
    completed_at: null,
  }).eq('id', jobId);
  // Fire-and-forget to worker
  fetch(API_BASE_URL + '/jobs/' + jobId + '/process', { method: 'POST' }).catch(() => {});
};

// ---------------------------------------------------------------------------
// List all reviews from Supabase (for My Reviews page)
// ---------------------------------------------------------------------------

export interface StoredReviewFromDB {
  id: string;
  agency: string;
  nofo_filename: string;
  status: string;
  total_points: number | null;
  created_at: string;
  app_count: number;
  completed_count: number;
  failed_count: number;
}

export const listReviews = async (): Promise<StoredReviewFromDB[]> => {
  const { data: reviews, error } = await supabase
    .from('grant_reviews')
    .select('id, agency, nofo_filename, status, total_points, created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error('Failed to list reviews');

  const result: StoredReviewFromDB[] = [];
  for (const r of (reviews || [])) {
    const { count: appCount } = await supabase.from('applications').select('id', { count: 'exact', head: true }).eq('review_id', r.id);
    const { count: completedCount } = await supabase.from('applications').select('id', { count: 'exact', head: true }).eq('review_id', r.id).eq('status', 'completed');
    const { count: failedCount } = await supabase.from('applications').select('id', { count: 'exact', head: true }).eq('review_id', r.id).eq('status', 'failed');
    result.push({
      ...r,
      app_count: appCount || 0,
      completed_count: completedCount || 0,
      failed_count: failedCount || 0,
    });
  }
  return result;
};

// ---------------------------------------------------------------------------
// Check worker health
// ---------------------------------------------------------------------------

export const checkWorkerHealth = async (): Promise<boolean> => {
  try {
    const r = await fetch(API_BASE_URL + '/health', { signal: AbortSignal.timeout(5000) });
    return r.ok;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// NOFO Brief
// ---------------------------------------------------------------------------

export interface NofoBrief {
  id: string;
  review_id: string;
  generation_status: 'queued' | 'generating' | 'ready' | 'failed' | 'outdated';
  brief_json: any;
  docx_storage_path: string | null;
  generated_at: string | null;
  approved_at: string | null;
  error_message: string | null;
}

export const generateNofoBrief = async (reviewId: string, nofoStoragePath: string, agency: string, criteriaJson: string): Promise<string> => {
  const formData = new FormData();
  formData.append('review_id', reviewId);
  formData.append('nofo_storage_path', nofoStoragePath);
  formData.append('agency', agency);
  formData.append('criteria_json', criteriaJson);
  const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
  const response = await fetch(API_BASE + '/nofo-brief/generate', { method: 'POST', body: formData });
  const body = await response.json();
  if (!response.ok) throw new Error(body.detail || 'Brief generation failed');
  return body.brief_id;
};

export const getNofoBrief = async (reviewId: string): Promise<NofoBrief | null> => {
  const { data } = await supabase
    .from('nofo_briefs')
    .select('*')
    .eq('review_id', reviewId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
};

export const getNofoBriefDownload = async (briefId: string): Promise<string> => {
  const { data } = await supabase
    .from('nofo_briefs')
    .select('docx_storage_path')
    .eq('id', briefId)
    .single();
  if (!data?.docx_storage_path) throw new Error('No document available');
  const { data: urlData, error } = await supabase.storage.from('completed-worksheets').createSignedUrl(data.docx_storage_path, 3600);
  if (error) throw new Error('Download URL failed');
  return urlData.signedUrl;
};

// ---------------------------------------------------------------------------
// Delete applicant data — wipes application documents and scores, keeps NOFO
// ---------------------------------------------------------------------------

export const deleteApplicantData = async (reviewId: string, confirmation: string): Promise<any> => {
  const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
  const response = await fetch(API_BASE + '/reviews/' + reviewId + '/delete-applicant-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ review_id: reviewId, confirmation }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.detail || 'Deletion failed');
  return body;
};

// ---------------------------------------------------------------------------
// Secure application viewer — signed URL via Supabase Storage directly
// ---------------------------------------------------------------------------

export const getApplicationViewUrl = async (
  _reviewId: string,
  applicationId: string,
): Promise<{ url: string; filename: string; expires_in: number }> => {
  const { data: app } = await supabase
    .from('applications')
    .select('storage_path, filename')
    .eq('id', applicationId)
    .single();
  if (!app?.storage_path) throw new Error('Application not found');
  const { data, error } = await supabase.storage.from('grant-applications').createSignedUrl(app.storage_path, 3600);
  if (error) throw new Error('Failed to create view URL');
  return { url: data.signedUrl, filename: app.filename, expires_in: 3600 };
};
