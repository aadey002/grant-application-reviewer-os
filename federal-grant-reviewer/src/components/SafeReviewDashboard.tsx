import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, BarChart3, Brain, CheckCircle2, Clock, Download, FileSearch,
  FileText, History, Loader2, LogOut, RefreshCw, Trash2, Upload, WifiOff, XCircle,
} from 'lucide-react';
import {
  deleteApplicantData, deleteReview, extractRubric, ExtractedRubric, generateNofoBrief,
  getApplicationViewUrl, getNofoBrief, getNofoViewUrl,
  getNofoBriefDownload, getReviewResults,
  getWorksheetUrl, JobStatus, NofoBrief, pollJobStatus, ReviewPackage,
  runSafeReviews, SafeReview, updateReviewValidation,
} from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const agencies = ['HRSA', 'SAMHSA', 'NIH', 'CDC'];
const agencyText: Record<string, string> = {
  HRSA: 'The scoring criteria will be extracted from the uploaded HRSA NOFO.',
  SAMHSA: 'The scoring criteria will be extracted from the uploaded SAMHSA NOFO.',
  NIH: 'The review criteria will be extracted from the uploaded NIH funding announcement.',
  CDC: 'The scoring criteria will be extracted from the uploaded CDC NOFO.',
};

// ---------------------------------------------------------------------------
// localStorage schema
// ---------------------------------------------------------------------------
interface StoredReview {
  review_id: string;
  job_ids: string[];
  agency: string;
  timestamp: string;       // ISO string
  nofo_name: string;
  app_names: string[];     // application file names for duplicate detection
  status: 'processing' | 'completed' | 'failed';
  scores?: Record<string, number | null>; // jobId -> score
}

const LS_KEY = 'active_reviews';

function loadStoredReviews(): StoredReview[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveStoredReviews(reviews: StoredReview[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(reviews));
}

function upsertStoredReview(r: StoredReview) {
  const all = loadStoredReviews();
  const idx = all.findIndex(x => x.review_id === r.review_id);
  if (idx >= 0) all[idx] = r;
  else all.unshift(r);
  saveStoredReviews(all);
}

function updateStoredReviewStatus(reviewId: string, status: StoredReview['status']) {
  const all = loadStoredReviews();
  const idx = all.findIndex(x => x.review_id === reviewId);
  if (idx >= 0) { all[idx].status = status; saveStoredReviews(all); }
}

// ---------------------------------------------------------------------------
// Per-application polling state
// ---------------------------------------------------------------------------
interface AppProgress {
  jobId: string;
  applicationName: string;
  status: JobStatus['status'] | 'uploaded';
  progress: number;
  message: string;
  score: number | null;
  errorMessage: string | null;
}

const POLL_INTERVAL_MS = 5000;

type Step = 'upload' | 'rubric' | 'brief' | 'processing' | 'history';

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------
const statusLabel: Record<AppProgress['status'], string> = {
  uploaded: 'Uploaded',
  uploading: 'Uploading',
  queued: 'Queued',
  extracting: 'Extracting',
  processing: 'Processing',
  scoring: 'Scoring',
  generating_worksheet: 'Generating Worksheet',
  completed: 'Completed',
  failed: 'Failed',
};

function statusBadgeClass(status: AppProgress['status']): string {
  switch (status) {
    case 'queued':    return 'bg-slate-100 text-slate-600';
    case 'processing': return 'bg-blue-100 text-blue-800 animate-pulse';
    case 'completed': return 'bg-emerald-100 text-emerald-800';
    case 'failed':    return 'bg-red-100 text-red-800';
    default:          return 'bg-slate-100 text-slate-600';
  }
}

function statusSummary(reviews: StoredReview[]): string {
  const counts = { processing: 0, completed: 0, failed: 0 };
  for (const r of reviews) counts[r.status] = (counts[r.status] ?? 0) + 1;
  const parts: string[] = [];
  if (counts.completed) parts.push(counts.completed + ' completed');
  if (counts.processing) parts.push(counts.processing + ' processing');
  if (counts.failed) parts.push(counts.failed + ' failed');
  return parts.join(', ') || 'none';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const SafeReviewDashboard: React.FC = () => {
  const { user, signOut } = useAuth();

  // Upload state
  const [agency, setAgency] = useState('HRSA');
  const [applications, setApplications] = useState<File[]>([]);
  const [nofo, setNofo] = useState<File | null>(null);
  const [supportRubric, setSupportRubric] = useState<File | null>(null);
  const [worksheet, setWorksheet] = useState<File | null>(null);

  // Pipeline state
  const [rubric, setRubric] = useState<ExtractedRubric | null>(null);
  const [reviews, setReviews] = useState<SafeReview[]>([]);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Async job polling
  const [currentReviewId, setCurrentReviewId] = useState<string | null>(null);
  const [appProgress, setAppProgress] = useState<AppProgress[]>([]);
  const [polling, setPolling] = useState(false);
  const [connectionLost, setConnectionLost] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Step: upload | rubric | brief | processing | results | history
  const [step, setStep] = useState<Step>('upload');

  // Elapsed timer
  const [processingStartTime, setProcessingStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (!processingStartTime) { setElapsedSeconds(0); return; }
    const timer = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - processingStartTime) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [processingStartTime]);

  // NOFO Brief state
  const [nofoBrief, setNofoBrief] = useState<NofoBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState('');
  const [briefAcknowledged, setBriefAcknowledged] = useState(false);
  const [briefExpandedSections, setBriefExpandedSections] = useState<Record<string, boolean>>({});
  // Track the nofo storage path so brief generation can reference it
  const [nofoStoragePath, setNofoStoragePath] = useState<string>('');

  // Reviewer validation state: applicationId -> validation status
  const [validationStatus, setValidationStatus] = useState<Record<string, string>>({});
  const [validationBusy, setValidationBusy] = useState<Record<string, boolean>>({});
  const briefPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Findings filter
  const [findingsFilter, setFindingsFilter] = useState<'all' | 'strengths' | 'mets' | 'weaknesses'>('all');

  // History
  const [storedReviews, setStoredReviews] = useState<StoredReview[]>(loadStoredReviews);

  const current = reviews[selected] ?? reviews[0] ?? null;
  const scoreTotal = useMemo(() => current?.final_score ?? null, [current]);

  // Auto-select first review if current is null but reviews exist
  useEffect(() => {
    if (reviews.length > 0 && selected >= reviews.length) {
      setSelected(0);
    }
  }, [reviews, selected]);

  // Sync validation status from loaded reviews
  useEffect(() => {
    if (reviews.length === 0) return;
    setValidationStatus(prev => {
      const next = { ...prev };
      for (const r of reviews) {
        if (r.application_id && !next[r.application_id]) {
          const knownValidationStatuses = ['ai_draft', 'reviewer_validating', 'reviewer_approved', 'needs_revision'];
          if (r.review_status && knownValidationStatuses.includes(r.review_status)) {
            next[r.application_id] = r.review_status;
          }
        }
      }
      return next;
    });
  }, [reviews]);

  // ---------------------------------------------------------------------------
  // Route handling — respond to #/reviews/{id} on mount and hash changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleHash = () => {
      // Don't interrupt active processing
      if (step === 'processing' && polling) return;
      const hash = window.location.hash;
      const match = hash.match(/^#\/reviews\/([a-z0-9-]+)$/);
      if (match) {
        openReview(match[1]);
      } else if (hash === '#/reviews') {
        setStep('history');
        setStoredReviews(loadStoredReviews());
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // On mount: check localStorage for in-progress reviews
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const hash = window.location.hash;
    // If hash already handled above, skip
    if (hash.startsWith('#/reviews')) return;

    const all = loadStoredReviews();
    const inProgress = all.filter(r => r.status === 'processing');
    if (inProgress.length > 0) {
      // Auto-resume the most recent in-progress review
      const latest = inProgress[0];
      openReview(latest.review_id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // openReview — load a stored review by ID (resume polling or show results)
  // ---------------------------------------------------------------------------
  const openReview = useCallback(async (reviewId: string) => {
    const all = loadStoredReviews();
    const stored = all.find(r => r.review_id === reviewId);
    setCurrentReviewId(reviewId);
    if (stored) setAgency(stored.agency);
    setError('');
    setBusy(true);
    setStep('processing');
    window.location.hash = '#/reviews/' + reviewId;

    // Build initial appProgress from stored data so the screen is never blank
    if (stored && stored.job_ids.length > 0) {
      setAppProgress(stored.job_ids.map((id, i) => ({
        jobId: id,
        applicationName: stored.app_names[i] ?? 'Application ' + (i + 1),
        status: 'queued' as const,
        progress: 0,
        message: 'Loading...',
        score: null,
        errorMessage: null,
      })));
    }

    // Try to get results from Supabase (works even without localStorage)
    try {
      const fetched = await getReviewResults(reviewId);
      if (fetched.reviews?.length > 0) {
        setReviews(fetched.reviews);
        setSelected(0);
        // Build completed appProgress from the fetched reviews
        setAppProgress(fetched.reviews.map((r: SafeReview, i: number) => ({
          jobId: r.review_id ?? 'result-' + i,
          applicationName: r.applicant_name || stored?.app_names[i] || 'Application ' + (i + 1),
          status: 'completed' as const,
          progress: 100,
          message: 'Score: ' + (r.final_score ?? '—'),
          score: r.final_score ?? null,
          errorMessage: null,
        })));
        if (stored) {
          updateStoredReviewStatus(reviewId, 'completed');
          setStoredReviews(loadStoredReviews());
        }
        setBusy(false);
        // Stay on step='processing' — results render inline
        return;
      }
    } catch {
      // Results not ready or API unreachable — fall through to polling
    }
    setBusy(false);

    if (!stored) {
      setError('Review not found. It may still be processing — check My Reviews.');
      return;
    }

    // Resume polling for in-progress reviews
    if (stored.job_ids.length > 0) {
      setPolling(true); if (!processingStartTime) setProcessingStartTime(Date.now());
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Step 1 — extract rubric
  // ---------------------------------------------------------------------------
  const process = async () => {
    if (!nofo || !applications.length) return;
    setBusy(true);
    setError('');
    try {
      setRubric(await extractRubric(nofo, agency));
      setStep('rubric');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Processing failed';
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        setError('Cannot reach the review worker. The server may be restarting — try again in 30 seconds.');
      } else {
        setError('Rubric extraction failed: ' + msg);
      }
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Step 2a — after rubric approval, go to brief step
  // ---------------------------------------------------------------------------
  const proceedToBrief = async () => {
    if (!nofo || !rubric) return;
    // Clear any stale duplicate detection
    const all = loadStoredReviews().filter(r => r.status !== 'processing');
    saveStoredReviews(all);
    // Go directly to scoring
    await run();
  };

  // ---------------------------------------------------------------------------
  // initBrief — create a brief-only review record if needed, then trigger generation
  // ---------------------------------------------------------------------------
  const initBrief = async () => {
    if (!nofo || !rubric) return;
    setBriefLoading(true);
    setBriefError('');

    try {
      // Create a review record if we don't have one yet
      let reviewId = currentReviewId;
      let nofoPath = nofoStoragePath;

      if (!reviewId) {
        const userId = 'anonymous-test';
        reviewId = crypto.randomUUID();
        const prefix = userId + '/' + reviewId;

        // Upload NOFO to storage
        const { error: upErr } = await supabase.storage
          .from('nofo-files')
          .upload(prefix + '/nofo/' + nofo.name, nofo, { upsert: true });
        if (upErr) throw new Error('NOFO upload failed: ' + upErr.message);
        nofoPath = prefix + '/nofo/' + nofo.name;

        // Create grant_review record
        const { error: reviewError } = await supabase.from('grant_reviews').insert({
          id: reviewId,
          user_id: userId,
          agency,
          nofo_filename: nofo.name,
          nofo_storage_path: nofoPath,
          status: 'brief_pending',
          extracted_rubric: rubric,
          total_points: rubric.total_points,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        if (reviewError) throw new Error('Failed to create review record: ' + reviewError.message);

        setCurrentReviewId(reviewId);
        setNofoStoragePath(nofoPath);
      }

      // Check if a brief already exists
      const existing = await getNofoBrief(reviewId);
      if (existing && existing.generation_status !== 'failed') {
        setNofoBrief(existing);
        if (existing.generation_status !== 'ready') {
          startBriefPolling(reviewId);
        }
        setBriefLoading(false);
        return;
      }

      // Generate a new brief — fire and forget, then poll
      try {
        await generateNofoBrief(
          reviewId,
          nofoPath,
          agency,
          JSON.stringify(rubric.criteria),
        );
        // Start polling for brief completion
        startBriefPolling(reviewId);
      } catch (genErr) {
        // Worker unavailable — show graceful degradation
        const msg = genErr instanceof Error ? genErr.message : 'Unknown error';
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('fetch')) {
          setBriefError('Brief generation unavailable — the worker is offline. You can still proceed.');
        } else {
          setBriefError('Brief generation failed: ' + msg + '. You can still proceed.');
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setBriefError('Could not initialize brief: ' + msg);
    } finally {
      setBriefLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Poll for brief completion
  // ---------------------------------------------------------------------------
  const startBriefPolling = (reviewId: string) => {
    if (briefPollRef.current) clearInterval(briefPollRef.current);
    briefPollRef.current = setInterval(async () => {
      try {
        const brief = await getNofoBrief(reviewId);
        if (brief) {
          setNofoBrief(brief);
          if (brief.generation_status === 'ready' || brief.generation_status === 'failed') {
            if (briefPollRef.current) {
              clearInterval(briefPollRef.current);
              briefPollRef.current = null;
            }
          }
        }
      } catch {
        // Ignore poll errors
      }
    }, 5000);
  };

  // Clean up brief poll on unmount
  useEffect(() => {
    return () => {
      if (briefPollRef.current) clearInterval(briefPollRef.current);
    };
  }, []);

  const downloadBriefDocx = async () => {
    if (!nofoBrief) return;
    try {
      const url = await getNofoBriefDownload(nofoBrief.id);
      window.open(url, '_blank');
    } catch (e) {
      setBriefError(e instanceof Error ? e.message : 'Download failed');
    }
  };

  const toggleBriefSection = (key: string) => {
    setBriefExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // ---------------------------------------------------------------------------
  // Step 2b — run reviews (async with job polling) — called from brief step
  // ---------------------------------------------------------------------------
  const run = async () => {
    if (!nofo || !rubric) return;

    // Duplicate detection (only if we don't already have a currentReviewId from brief step)
    if (!currentReviewId && nofo && applications.length) {
      const all = loadStoredReviews();
      const dupe = all.find(r =>
        r.status === 'processing' &&
        r.nofo_name === nofo.name &&
        r.app_names.length === applications.length &&
        r.app_names.every((n, i) => n === applications[i]?.name)
      );
      if (dupe) {
        setError('This review is already in progress.');
        window.location.hash = '#/reviews/' + dupe.review_id;
        return;
      }
    }

    setBusy(true);
    setError('');
    setStep('processing');
    setAppProgress([{
      jobId: 'uploading',
      applicationName: 'Uploading documents...',
      status: 'uploaded' as const,
      progress: 0,
      message: 'Uploading files to secure storage',
      score: null,
      errorMessage: null,
    }]);

    // Stop brief polling if still running
    if (briefPollRef.current) {
      clearInterval(briefPollRef.current);
      briefPollRef.current = null;
    }

    let savedReviewId: string | null = currentReviewId;

    try {
      const item: ReviewPackage = { agency, nofo, applications, rubric: supportRubric, worksheet };

      let result: { review_id: string; job_ids: string[] } | null = null;

      try {
        result = await runSafeReviews(item, rubric, (stage, detail) => {
          setAppProgress([{
            jobId: 'uploading',
            applicationName: detail,
            status: 'uploaded' as const,
            progress: 0,
            message: stage,
            score: null,
            errorMessage: null,
          }]);
        });
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : '';
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('network')) {
          setConnectionLost(true);
          setError('Connection lost — checking server...');
          const all = loadStoredReviews();
          const recent = all.find(r =>
            r.nofo_name === nofo?.name &&
            r.app_names.length === applications.length &&
            r.app_names.every((n, i) => n === applications[i]?.name)
          );
          if (recent) {
            setConnectionLost(false);
            openReview(recent.review_id);
          } else {
            setError('Connection lost. The review may still be processing. Check "My Reviews" or refresh.');
          }
          setBusy(false);
          return;
        }
        throw fetchErr;
      }

      savedReviewId = result.review_id;
      setCurrentReviewId(result.review_id);
      window.location.hash = '#/reviews/' + result.review_id;

      const stored: StoredReview = {
        review_id: result.review_id,
        job_ids: result.job_ids,
        agency,
        timestamp: new Date().toISOString(),
        nofo_name: nofo?.name ?? '',
        app_names: applications.map(f => f.name),
        status: 'processing',
      };
      upsertStoredReview(stored);
      setStoredReviews(loadStoredReviews());

      if (result.job_ids.length > 0) {
        const initial: AppProgress[] = result.job_ids.map((jobId, i) => ({
          jobId,
          applicationName: applications[i]?.name ?? 'Application ' + (i + 1),
          status: 'queued' as const,
          progress: 0,
          message: 'Queued',
          score: null,
          errorMessage: null,
        }));
        setAppProgress(initial);
        setPolling(true); if (!processingStartTime) setProcessingStartTime(Date.now());
        // step is already 'processing'
      } else {
        const fetched = await getReviewResults(result.review_id);
        setReviews(fetched.reviews);
        setSelected(0);
        // Stay on processing — results render inline
        setAppProgress(fetched.reviews.map((r: SafeReview, i: number) => ({
          jobId: r.review_id ?? 'result-' + i,
          applicationName: r.applicant_name || applications[i]?.name || 'Application ' + (i + 1),
          status: 'completed' as const,
          progress: 100,
          message: 'Score: ' + (r.final_score ?? '—'),
          score: r.final_score ?? null,
          errorMessage: null,
        })));
        updateStoredReviewStatus(result.review_id, 'completed');
        setStoredReviews(loadStoredReviews());
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Review failed';
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        setConnectionLost(true);
        setError('Connection lost — checking server...');
        if (savedReviewId) {
          setTimeout(() => openReview(savedReviewId!), 2000);
        } else {
          setError('Connection lost. The review may still be processing. Check "My Reviews" or refresh.');
        }
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
      setConnectionLost(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Retry a failed job
  // ---------------------------------------------------------------------------
  const retryJob = async (jobId: string) => {
    try {
      const authHeader: Record<string, string> = {};
      await fetch(
        (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000') + '/jobs/' + jobId + '/process',
        { method: 'POST', headers: authHeader }
      );
      // Reset status in UI
      setAppProgress(prev =>
        prev.map(p =>
          p.jobId === jobId
            ? { ...p, status: 'queued', progress: 0, message: 'Retrying...', errorMessage: null }
            : p
        )
      );
      if (!polling) setPolling(true);
    } catch (e) {
      setError('Retry failed: ' + (e instanceof Error ? e.message : 'Unknown error'));
    }
  };

  // ---------------------------------------------------------------------------
  // Polling loop
  // ---------------------------------------------------------------------------
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPolling(false);
  }, []);

  useEffect(() => {
    if (!polling || !currentReviewId) return;

    const tick = async () => {
      let currentProgress: AppProgress[] = [];
      setAppProgress(prev => {
        currentProgress = prev;
        return prev;
      });

      const pending = currentProgress.filter(
        p => p.status !== 'completed' && p.status !== 'failed'
      );

      if (pending.length === 0) {
        stopPolling();
        const allDone = currentProgress.every(p => p.status === 'completed' || p.status === 'failed');
        if (allDone && currentReviewId) {
          try {
            const fetched = await getReviewResults(currentReviewId);
            setReviews(fetched.reviews);
            setSelected(0);
            // Stay on step='processing' — results render inline
            updateStoredReviewStatus(currentReviewId, 'completed');
            setStoredReviews(loadStoredReviews());
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to fetch results');
          }
        }
        return;
      }

      const updates = await Promise.allSettled(
        pending.map(p => pollJobStatus(p.jobId))
      );

      setConnectionLost(false);

      setAppProgress(prev =>
        prev.map(p => {
          const idx = pending.findIndex(x => x.jobId === p.jobId);
          if (idx === -1) return p;
          const result = updates[idx];
          if (result.status === 'fulfilled') {
            const val = result.value;
            return {
              ...p,
              status: val.status,
              progress: val.progress ?? p.progress,
              message: val.message ?? p.message,
              // Extract score from message if present (e.g. "Score: 89")
              score: val.status === 'completed'
                ? extractScoreFromMessage(val.message ?? '') ?? p.score
                : p.score,
              errorMessage: val.status === 'failed'
                ? (val.message ?? 'Processing failed')
                : p.errorMessage,
            };
          } else {
            // Network error during poll — don't kill status, just show warning
            setConnectionLost(true);
            return p;
          }
        })
      );
    };

    pollRef.current = setInterval(tick, POLL_INTERVAL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [polling, currentReviewId, stopPolling]);

  // When all jobs reach terminal state, fetch results automatically
  useEffect(() => {
    if (appProgress.length === 0) return;
    const allDone = appProgress.every(p => p.status === 'completed' || p.status === 'failed');
    if (!allDone) return;
    // All done — stop polling and fetch results
    if (polling) stopPolling();
    setProcessingStartTime(null);
    if (currentReviewId && reviews.length === 0) {
      getReviewResults(currentReviewId)
        .then(fetched => {
          if (fetched.reviews?.length > 0) {
            setReviews(fetched.reviews);
            setSelected(0);
            updateStoredReviewStatus(currentReviewId, 'completed');
            setStoredReviews(loadStoredReviews());
          }
        })
        .catch(e => setError(e instanceof Error ? e.message : 'Failed to fetch results'));
    }
  }, [appProgress, currentReviewId]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function extractScoreFromMessage(msg: string): number | null {
    const m = msg.match(/\b(\d{1,3})\s*\/\s*\d{1,3}\b/) ?? msg.match(/Score[:\s]+(\d{1,3})/i);
    return m ? parseInt(m[1], 10) : null;
  }

  const updatePoints = (index: number, points: number) => {
    if (!rubric) return;
    const criteria = [...rubric.criteria];
    criteria[index] = { ...criteria[index], points };
    setRubric({ ...rubric, criteria, total_points: criteria.reduce((s, c) => s + c.points, 0) });
  };

  const reset = async () => {
    stopPolling();
    if (briefPollRef.current) {
      clearInterval(briefPollRef.current);
      briefPollRef.current = null;
    }
    if (currentReviewId) {
      try { await deleteReview(currentReviewId); } catch { /* best-effort */ }
    }
    setApplications([]);
    setNofo(null);
    setSupportRubric(null);
    setWorksheet(null);
    setRubric(null);
    setReviews([]);
    setAppProgress([]);
    setCurrentReviewId(null);
    setNofoStoragePath('');
    setNofoBrief(null);
    setBriefError('');
    setBriefAcknowledged(false);
    setBriefExpandedSections({});
    setError('');
    setStep('upload');
  };

  const exportReview = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' })
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = current.review_id + '-review.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadWorksheet = async () => {
    if (!currentReviewId || !current) return;
    try {
      const url = await getWorksheetUrl(currentReviewId, current.application_id);
      window.open(url, '_blank');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Worksheet download failed');
    }
  };

  const handleValidationChange = async (applicationId: string, newStatus: string) => {
    setValidationBusy(prev => ({ ...prev, [applicationId]: true }));
    try {
      await updateReviewValidation(applicationId, newStatus);
      setValidationStatus(prev => ({ ...prev, [applicationId]: newStatus }));
      if (newStatus === 'reviewer_approved') {
        alert('Application marked as Approved. The AI draft has been validated.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Validation update failed');
    } finally {
      setValidationBusy(prev => ({ ...prev, [applicationId]: false }));
    }
  };

  const handleDeleteAndReset = async () => {
    if (!window.confirm('Delete this review? This cannot be undone.')) return;
    await reset();
  };

  const clearCompleted = () => {
    const remaining = loadStoredReviews().filter(r => r.status !== 'completed');
    saveStoredReviews(remaining);
    setStoredReviews(remaining);
  };

  // Progress derived values
  const totalJobs = appProgress.length;
  const completedJobs = appProgress.filter(p => p.status === 'completed').length;
  const failedJobs = appProgress.filter(p => p.status === 'failed').length;
  const processingPct = totalJobs > 0 ? Math.round(((completedJobs + failedJobs) / totalJobs) * 100) : 0;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#f4f7fc] text-slate-900">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setStep('upload'); window.location.hash = '#/app'; }}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white"
            >
              <Brain />
            </button>
            <div>
              <h1 className="text-xl font-bold">Federal Grant Reviewer AI</h1>
              <p className="text-sm text-slate-500">Evidence-grounded analysis for federal grant applications</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setStep('history'); setStoredReviews(loadStoredReviews()); window.location.hash = '#/reviews'; }}
              className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              <History size={16} /> My Reviews
            </button>
            <span className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
              connectionLost ? 'bg-red-100 text-red-800' :
              busy ? 'bg-blue-100 text-blue-800 animate-pulse' :
              'bg-emerald-100 text-emerald-800'
            }`}>
              {connectionLost ? <><WifiOff size={16} /> Connection Lost</> :
               busy ? <><Loader2 size={16} className="animate-spin" /> {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, '0')}</> :
               <><CheckCircle2 size={16} /> Ready</>}
            </span>
            {user && (
              <button
                onClick={signOut}
                title="Sign out"
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                <LogOut size={16} /> Sign out
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Global status/error bar */}
      {(error || connectionLost) && (
        <div className={`border-b px-6 py-3 ${connectionLost ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <div className="flex items-center gap-3">
              {connectionLost ? <WifiOff className="text-red-600 shrink-0" size={20} /> : <AlertTriangle className="text-amber-600 shrink-0" size={20} />}
              <div>
                <p className={`text-sm font-semibold ${connectionLost ? 'text-red-800' : 'text-amber-800'}`}>
                  {connectionLost ? 'Connection to review worker lost' : 'Attention'}
                </p>
                <p className={`text-sm ${connectionLost ? 'text-red-700' : 'text-amber-700'}`}>{error}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {connectionLost && (
                <button
                  onClick={() => { setConnectionLost(false); setError(''); window.location.reload(); }}
                  className="flex items-center gap-1 rounded-lg bg-white border px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw size={14} /> Retry
                </button>
              )}
              <button onClick={() => { setError(''); setConnectionLost(false); }} className="text-sm font-semibold underline text-slate-600">Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {/* Processing status bar — always visible when busy */}
      {busy && (
        <div className="border-b bg-blue-50 border-blue-200 px-6 py-2">
          <div className="mx-auto flex max-w-7xl items-center gap-3">
            <Loader2 className="animate-spin text-blue-600" size={16} />
            <p className="text-sm font-medium text-blue-800">
              {step === 'upload' ? 'Extracting NOFO scoring criteria...' :
               step === 'rubric' ? 'Uploading documents and submitting review...' :
               step === 'brief' ? 'Generating NOFO brief...' :
               step === 'processing' ? 'Claude is scoring the application...' :
               'Processing...'}
            </p>
          </div>
        </div>
      )}

      {/* Navigation bar — always visible */}
      <nav className="border-b bg-white">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex items-center gap-1 overflow-x-auto py-1">
            {([
              { id: 'upload' as Step, label: 'Upload', icon: Upload, enabled: true },
              { id: 'rubric' as Step, label: 'Rubric', icon: BarChart3, enabled: !!rubric },
              { id: 'processing' as Step, label: currentReviewId && reviews.length > 0 && !polling ? 'Results' : polling ? 'Processing' : 'Review', icon: currentReviewId && reviews.length > 0 && !polling ? CheckCircle2 : polling ? Loader2 : FileSearch, enabled: !!currentReviewId },
              { id: 'history' as Step, label: 'My Reviews', icon: History, enabled: true },
            ] as const).map(tab => {
              const isActive = step === tab.id || (tab.id === 'processing' && step === 'brief');
              const isCompleted = (tab.id === 'upload' && step !== 'upload') ||
                (tab.id === 'rubric' && (step === 'processing' || step === 'brief'));
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  disabled={!tab.enabled}
                  onClick={() => {
                    if (tab.id === 'history') {
                      setStep('history');
                      setStoredReviews(loadStoredReviews());
                      window.location.hash = '#/reviews';
                    } else if (tab.id === 'processing' && currentReviewId) {
                      setStep('processing');
                      window.location.hash = '#/reviews/' + currentReviewId;
                    } else if (tab.id === 'upload') {
                      setStep('upload');
                      window.location.hash = '#/app';
                    } else if (tab.id === 'rubric' && rubric) {
                      setStep('rubric');
                    }
                  }}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-blue-100 text-blue-800'
                      : isCompleted
                        ? 'text-emerald-700 hover:bg-emerald-50'
                        : tab.enabled
                          ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                          : 'text-slate-300 cursor-not-allowed'
                  }`}
                >
                  <Icon size={16} className={isActive && polling && tab.id === 'processing' ? 'animate-spin' : ''} />
                  {tab.label}
                  {tab.id === 'processing' && reviews.length > 0 && !polling && (
                    <span className="rounded-full bg-emerald-500 text-white text-xs px-1.5 py-0.5">{reviews.length}</span>
                  )}
                  {tab.id === 'processing' && polling && appProgress.length > 0 && (
                    <span className="rounded-full bg-blue-500 text-white text-xs px-1.5 py-0.5">
                      {appProgress.filter(p => p.status === 'completed').length}/{appProgress.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-6 pb-12">

        {/* ------------------------------------------------------------------ */}
        {/* STEP: UPLOAD                                                        */}
        {/* ------------------------------------------------------------------ */}
        {step === 'upload' && (
          <section className="rounded-2xl border bg-white p-8 shadow-lg md:p-10">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                <Upload size={32} />
              </div>
              <h2 className="mt-5 text-2xl font-bold">Upload Grant Competition</h2>
              <p className="mt-2 text-slate-600">
                One NOFO, with all applications assigned under that funding opportunity
              </p>
            </div>

            <div className="mt-8">
              <label className="text-sm font-bold">Select Funding Agency</label>
              <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
                {agencies.map(a => (
                  <button
                    key={a}
                    onClick={() => setAgency(a)}
                    className={'rounded-lg border px-4 py-3 font-semibold ' + (agency === a ? 'border-blue-600 bg-blue-600 text-white shadow' : 'bg-white hover:border-blue-400')}
                  >
                    {a}
                  </button>
                ))}
              </div>
              <div className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
                <b>{agency}</b> — {agencyText[agency]}
              </div>
            </div>

            <div className="mt-7 grid gap-4 md:grid-cols-2">
              <label className="cursor-pointer rounded-xl border-2 border-dashed border-slate-300 p-6 hover:border-blue-500">
                <input className="hidden" type="file" accept=".pdf,.docx" onChange={e => setNofo(e.target.files?.[0] || null)} />
                <FileText className="mb-4 text-blue-700" />
                <p className="font-bold">NOFO <span className="text-red-600">*</span></p>
                <p className="mt-1 truncate text-sm text-slate-500">{nofo?.name || 'Choose one NOFO'}</p>
              </label>
              <label className="cursor-pointer rounded-xl border-2 border-dashed border-slate-300 p-6 hover:border-blue-500">
                <input className="hidden" multiple type="file" accept=".pdf,.zip" onChange={e => setApplications(e.target.files ? Array.from(e.target.files) : [])} />
                <Upload className="mb-4 text-blue-700" />
                <p className="font-bold">Applications <span className="text-red-600">*</span></p>
                <p className="mt-1 text-sm text-slate-500">
                  {applications.length ? applications.length + ' PDF/ZIP bundle(s) selected' : 'Choose multiple PDFs or one ZIP'}
                </p>
              </label>
              <label className="cursor-pointer rounded-xl border-2 border-dashed border-slate-200 p-5 hover:border-blue-400">
                <input className="hidden" type="file" accept=".pdf,.doc,.docx,.txt" onChange={e => setSupportRubric(e.target.files?.[0] || null)} />
                <p className="font-semibold">Separate rubric <span className="font-normal text-slate-400">(optional)</span></p>
                <p className="mt-1 truncate text-xs text-slate-500">{supportRubric?.name || 'Used to validate NOFO extraction'}</p>
              </label>
              <label className="cursor-pointer rounded-xl border-2 border-dashed border-slate-200 p-5 hover:border-blue-400">
                <input className="hidden" type="file" accept=".pdf,.doc,.docx,.txt" onChange={e => setWorksheet(e.target.files?.[0] || null)} />
                <p className="font-semibold">Reviewer worksheet/instructions <span className="font-normal text-slate-400">(optional)</span></p>
                <p className="mt-1 truncate text-xs text-slate-500">{worksheet?.name || 'Upload if provided'}</p>
              </label>
            </div>

            {error && (
              <div className="mt-5 flex gap-2 rounded-lg bg-red-50 p-4 text-red-800">
                <AlertTriangle className="shrink-0 mt-0.5" size={18} />{error}
              </div>
            )}

            <div className="mt-7 flex justify-center">
              <button
                onClick={process}
                disabled={!nofo || !applications.length || busy}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-3 font-bold text-white shadow-lg disabled:opacity-40"
              >
                {busy ? <Loader2 className="animate-spin" /> : <FileSearch />}
                {busy ? 'Processing…' : 'Process Uploaded Documents'}
              </button>
            </div>
          </section>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* STEP: RUBRIC APPROVAL                                               */}
        {/* ------------------------------------------------------------------ */}
        {step === 'rubric' && rubric && (
          <section className="rounded-2xl border bg-white p-8 shadow-lg">
            <h2 className="text-2xl font-bold">Verify NOFO scoring rubric</h2>
            <p className="mt-2 text-slate-600">
              Confirm the extracted criteria against the cited NOFO pages before reviewing applications.
            </p>

            <div className="mt-6 divide-y">
              {rubric.criteria.map((c, i) => (
                <div key={i} className="py-4">
                  <div className="grid gap-3 md:grid-cols-[80px_1fr_130px]">
                    <span className="font-bold text-slate-500">#{c.number}</span>
                    <div>
                      <p className="font-bold">{c.name}</p>
                      <p className="text-sm text-slate-500">NOFO page {c.source_page}</p>
                    </div>
                    <label className="text-sm font-semibold">
                      Points{' '}
                      <input
                        className="ml-2 w-16 rounded border px-2 py-1"
                        type="number"
                        value={c.points}
                        min="0"
                        onChange={e => updatePoints(i, Number(e.target.value))}
                      />
                    </label>
                  </div>
                  {/* Subcriteria */}
                  {c.subcriteria && c.subcriteria.length > 0 && (
                    <div className="ml-20 mt-2 space-y-1">
                      {c.subcriteria.map((sub, si) => (
                        <div key={si} className="grid gap-3 md:grid-cols-[1fr_130px] text-sm">
                          <span className="text-slate-600">↳ {sub.name}</span>
                          <label className="font-semibold text-slate-500">
                            <input className="ml-2 w-14 rounded border px-2 py-0.5 text-sm" type="number" value={sub.points} min="0"
                              onChange={e => {
                                const next = { ...rubric };
                                const criteria = [...next.criteria];
                                const subs = [...(criteria[i].subcriteria || [])];
                                subs[si] = { ...subs[si], points: Number(e.target.value) };
                                criteria[i] = { ...criteria[i], subcriteria: subs };
                                next.criteria = criteria;
                                setRubric(next);
                              }}
                            /> pts
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Add subcriteria button */}
                  <button
                    onClick={() => {
                      const name = prompt('Subcriterion name (e.g., "Overall methodology"):');
                      if (!name) return;
                      const pts = prompt('Points:');
                      if (!pts) return;
                      const next = { ...rubric };
                      const criteria = [...next.criteria];
                      const subs = [...(criteria[i].subcriteria || [])];
                      subs.push({ name, points: Number(pts) });
                      criteria[i] = { ...criteria[i], subcriteria: subs };
                      next.criteria = criteria;
                      setRubric(next);
                    }}
                    className="ml-20 mt-1 text-xs text-blue-600 hover:underline"
                  >
                    + Add subcriterion
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-slate-50 p-5">
              <div>
                <p className="font-bold">Extracted total: {rubric.total_points} points</p>
                {rubric.warnings.map((w, i) => <p key={i} className="text-sm text-amber-700">{w}</p>)}
              </div>
              <label className="flex items-center gap-2 font-bold">
                <input
                  type="checkbox"
                  checked={!!rubric.approved}
                  onChange={e => setRubric({ ...rubric, approved: e.target.checked })}
                />
                I verified this rubric
              </label>
            </div>

            {error && <div className="mt-5 rounded-lg bg-red-50 p-4 text-red-800">{error}</div>}

            {/* Inline submission status */}
            {busy && (
              <div className="mt-5 rounded-xl bg-blue-50 border border-blue-200 p-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="animate-spin text-blue-600 shrink-0" size={24} />
                  <div>
                    <p className="font-bold text-blue-900">Submitting review...</p>
                    <p className="text-sm text-blue-700 mt-1">Uploading documents to secure storage and creating review jobs. This takes 15-30 seconds.</p>
                  </div>
                </div>
                <div className="mt-3 h-2 rounded-full bg-blue-100">
                  <div className="h-2 rounded-full bg-blue-500 animate-pulse" style={{width: '60%'}} />
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-between">
              <button onClick={() => setStep('upload')} disabled={busy} className="rounded-lg border px-5 py-3 font-semibold disabled:opacity-40">
                Back
              </button>
              <button
                onClick={proceedToBrief}
                disabled={!rubric.approved || busy}
                className="flex items-center gap-2 rounded-xl bg-blue-700 px-7 py-3 font-bold text-white disabled:opacity-40"
              >
                {busy ? <Loader2 className="animate-spin" /> : <FileSearch />}
                {busy ? 'Submitting...' : 'Run Application Review'}
              </button>
            </div>
          </section>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* STEP: NOFO BRIEF                                                    */}
        {/* ------------------------------------------------------------------ */}
        {step === 'brief' && (
          <section className="rounded-2xl border bg-white p-8 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">NOFO Brief</h2>
                <p className="mt-2 text-slate-600">
                  Review the AI-generated NOFO brief before scoring applications. This summary helps ensure reviewers apply criteria consistently.
                </p>
              </div>
              {nofoBrief?.generation_status === 'ready' && nofoBrief.docx_storage_path && (
                <button
                  onClick={downloadBriefDocx}
                  className="flex shrink-0 items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700"
                >
                  <Download size={16} /> Download DOCX
                </button>
              )}
            </div>

            {/* Loading state */}
            {briefLoading && (
              <div className="mt-8 flex flex-col items-center gap-3 py-10 text-slate-500">
                <Loader2 size={36} className="animate-spin text-blue-600" />
                <p className="font-semibold">Generating NOFO brief…</p>
                <p className="text-sm">This takes about 30–60 seconds</p>
              </div>
            )}

            {/* Error / unavailable state */}
            {!briefLoading && briefError && (
              <div className="mt-6 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={20} />
                <div>
                  <p className="font-semibold text-amber-800">Brief generation unavailable</p>
                  <p className="mt-1 text-sm text-amber-700">{briefError}</p>
                </div>
              </div>
            )}

            {/* Generating (worker accepted, now polling) */}
            {!briefLoading && !briefError && nofoBrief && nofoBrief.generation_status === 'generating' && (
              <div className="mt-8 flex flex-col items-center gap-3 py-10 text-slate-500">
                <Loader2 size={36} className="animate-spin text-blue-600" />
                <p className="font-semibold">Brief is being generated…</p>
                <p className="text-sm">Checking status every 5 seconds</p>
              </div>
            )}

            {/* Queued */}
            {!briefLoading && !briefError && nofoBrief && nofoBrief.generation_status === 'queued' && (
              <div className="mt-8 flex flex-col items-center gap-3 py-10 text-slate-500">
                <Clock size={36} className="text-blue-400" />
                <p className="font-semibold">Brief is queued for generation…</p>
              </div>
            )}

            {/* Failed */}
            {!briefLoading && !briefError && nofoBrief && nofoBrief.generation_status === 'failed' && (
              <div className="mt-6 flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
                <XCircle className="mt-0.5 shrink-0 text-red-600" size={20} />
                <div>
                  <p className="font-semibold text-red-800">Brief generation failed</p>
                  <p className="mt-1 text-sm text-red-700">{nofoBrief.error_message || 'Unknown error'}</p>
                </div>
              </div>
            )}

            {/* Ready — show brief content */}
            {!briefLoading && nofoBrief && nofoBrief.generation_status === 'ready' && nofoBrief.brief_json && (
              <div className="mt-6 space-y-3">
                {/* Executive Summary — always expanded */}
                {nofoBrief.brief_json.executive_summary && (
                  <div className="rounded-xl border border-blue-100 bg-blue-50">
                    <div className="px-5 py-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Executive Summary</p>
                      <p className="mt-2 text-sm leading-6 text-slate-800">{nofoBrief.brief_json.executive_summary}</p>
                    </div>
                  </div>
                )}

                {/* Scoring Criteria table */}
                {nofoBrief.brief_json.scoring_criteria && (
                  <div className="rounded-xl border">
                    <button
                      onClick={() => toggleBriefSection('scoring_criteria')}
                      className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold hover:bg-slate-50"
                    >
                      <span>Scoring Criteria</span>
                      <span className="text-slate-400">{briefExpandedSections['scoring_criteria'] ? '▲' : '▼'}</span>
                    </button>
                    {briefExpandedSections['scoring_criteria'] && (
                      <div className="border-t px-5 pb-4">
                        {Array.isArray(nofoBrief.brief_json.scoring_criteria) ? (
                          <table className="mt-3 w-full text-sm">
                            <thead>
                              <tr className="border-b text-left text-xs font-bold uppercase text-slate-500">
                                <th className="pb-2 pr-4">Criterion</th>
                                <th className="pb-2 pr-4">Points</th>
                                <th className="pb-2">Notes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {nofoBrief.brief_json.scoring_criteria.map((row: any, i: number) => (
                                <tr key={i} className="border-b last:border-0">
                                  <td className="py-2 pr-4 font-medium">{row.name || row.criterion}</td>
                                  <td className="py-2 pr-4">{row.points}</td>
                                  <td className="py-2 text-slate-600">{row.notes || row.description || ''}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="mt-3 text-sm text-slate-700">{JSON.stringify(nofoBrief.brief_json.scoring_criteria)}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Program Requirements */}
                {nofoBrief.brief_json.program_requirements && (
                  <div className="rounded-xl border">
                    <button
                      onClick={() => toggleBriefSection('program_requirements')}
                      className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold hover:bg-slate-50"
                    >
                      <span>Program Requirements</span>
                      <span className="text-slate-400">{briefExpandedSections['program_requirements'] ? '▲' : '▼'}</span>
                    </button>
                    {briefExpandedSections['program_requirements'] && (
                      <div className="border-t px-5 py-4">
                        {Array.isArray(nofoBrief.brief_json.program_requirements) ? (
                          <ul className="mt-1 space-y-1 text-sm text-slate-700">
                            {nofoBrief.brief_json.program_requirements.map((req: string, i: number) => (
                              <li key={i} className="flex gap-2"><span className="text-slate-400">•</span>{req}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-slate-700">{nofoBrief.brief_json.program_requirements}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Budget Requirements */}
                {nofoBrief.brief_json.budget_requirements && (
                  <div className="rounded-xl border">
                    <button
                      onClick={() => toggleBriefSection('budget_requirements')}
                      className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold hover:bg-slate-50"
                    >
                      <span>Budget Requirements</span>
                      <span className="text-slate-400">{briefExpandedSections['budget_requirements'] ? '▲' : '▼'}</span>
                    </button>
                    {briefExpandedSections['budget_requirements'] && (
                      <div className="border-t px-5 py-4">
                        {Array.isArray(nofoBrief.brief_json.budget_requirements) ? (
                          <ul className="mt-1 space-y-1 text-sm text-slate-700">
                            {nofoBrief.brief_json.budget_requirements.map((req: string, i: number) => (
                              <li key={i} className="flex gap-2"><span className="text-slate-400">•</span>{req}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-slate-700">{nofoBrief.brief_json.budget_requirements}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Reviewer Checklist */}
                {nofoBrief.brief_json.reviewer_checklist && (
                  <div className="rounded-xl border">
                    <button
                      onClick={() => toggleBriefSection('reviewer_checklist')}
                      className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold hover:bg-slate-50"
                    >
                      <span>Reviewer Checklist</span>
                      <span className="text-slate-400">{briefExpandedSections['reviewer_checklist'] ? '▲' : '▼'}</span>
                    </button>
                    {briefExpandedSections['reviewer_checklist'] && (
                      <div className="border-t px-5 py-4">
                        {Array.isArray(nofoBrief.brief_json.reviewer_checklist) ? (
                          <ul className="mt-1 space-y-2 text-sm text-slate-700">
                            {nofoBrief.brief_json.reviewer_checklist.map((item: string, i: number) => (
                              <li key={i} className="flex gap-2"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" />{item}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-slate-700">{nofoBrief.brief_json.reviewer_checklist}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Other sections — any keys not already rendered */}
                {Object.entries(nofoBrief.brief_json)
                  .filter(([key]) => !['executive_summary', 'scoring_criteria', 'program_requirements', 'budget_requirements', 'reviewer_checklist'].includes(key))
                  .map(([key, value]) => (
                    <div key={key} className="rounded-xl border">
                      <button
                        onClick={() => toggleBriefSection(key)}
                        className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold hover:bg-slate-50"
                      >
                        <span>{key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                        <span className="text-slate-400">{briefExpandedSections[key] ? '▲' : '▼'}</span>
                      </button>
                      {briefExpandedSections[key] && (
                        <div className="border-t px-5 py-4">
                          {Array.isArray(value) ? (
                            <ul className="mt-1 space-y-1 text-sm text-slate-700">
                              {(value as any[]).map((item: any, i: number) => (
                                <li key={i} className="flex gap-2"><span className="text-slate-400">•</span>{typeof item === 'string' ? item : JSON.stringify(item)}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-sm text-slate-700">{typeof value === 'string' ? value : JSON.stringify(value)}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                }
              </div>
            )}

            {/* Acknowledgment checkbox */}
            <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={briefAcknowledged}
                  onChange={e => setBriefAcknowledged(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
                />
                <span className="text-sm font-semibold leading-5">
                  I reviewed the NOFO brief and verified the scoring rubric
                  {(!nofoBrief || nofoBrief.generation_status !== 'ready') && !briefError && (
                    <span className="ml-1 font-normal text-slate-500">(or acknowledge the brief is not yet available)</span>
                  )}
                </span>
              </label>
            </div>

            {error && <div className="mt-4 rounded-lg bg-red-50 p-4 text-red-800">{error}</div>}

            <div className="mt-6 flex justify-between">
              <button onClick={() => setStep('rubric')} className="rounded-lg border px-5 py-3 font-semibold">
                Back
              </button>
              <button
                onClick={run}
                disabled={!briefAcknowledged || busy}
                className="flex items-center gap-2 rounded-xl bg-blue-700 px-7 py-3 font-bold text-white disabled:opacity-40"
              >
                {busy ? <Loader2 className="animate-spin" /> : <FileSearch />}
                {busy ? 'Submitting…' : 'Run Application Reviews (' + applications.length + ')'}
              </button>
            </div>
          </section>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* STEP: PROCESSING (async job status screen)                          */}
        {/* ------------------------------------------------------------------ */}
        {step === 'processing' && (
          <section className="rounded-2xl border bg-white p-8 shadow-lg">
            {/* Pipeline status bar — always visible */}
            <div className="mb-6 flex items-center gap-1">
              {['Uploading', 'Queued', 'Scoring', 'Worksheet', 'Complete'].map((label, i) => {
                const stages = appProgress.map(p => p.status);
                const hasCompleted = stages.includes('completed');
                const hasProcessing = stages.some(s => s === 'processing' || s === 'scoring');
                const hasQueued = stages.includes('queued');
                const isUploading = stages.includes('uploaded') || (busy && !hasQueued && !hasProcessing && !hasCompleted);
                let active = false;
                if (i === 0) active = isUploading;
                else if (i === 1) active = hasQueued && !hasProcessing;
                else if (i === 2) active = hasProcessing;
                else if (i === 3) active = stages.includes('generating_worksheet' as any);
                else if (i === 4) active = hasCompleted;
                const past = (i === 0 && !isUploading && (hasQueued || hasProcessing || hasCompleted))
                  || (i === 1 && (hasProcessing || hasCompleted))
                  || (i === 2 && hasCompleted)
                  || (i === 3 && hasCompleted);
                return (
                  <div key={label} className="flex-1">
                    <div className={`h-2 rounded-full transition-all duration-500 ${
                      active ? 'bg-blue-600 animate-pulse' :
                      past ? 'bg-emerald-500' :
                      'bg-slate-200'
                    }`} />
                    <p className={`mt-1 text-xs font-semibold text-center ${
                      active ? 'text-blue-700' : past ? 'text-emerald-700' : 'text-slate-400'
                    }`}>{label}</p>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">
                  {busy && completedJobs === 0 && failedJobs === 0 ? 'Submitting review...' :
                   reviews.length > 0 && completedJobs === totalJobs && totalJobs > 0
                     ? 'Review complete \u2014 ' + reviews.length + ' application' + (reviews.length === 1 ? '' : 's') + ' scored'
                     : completedJobs === totalJobs && totalJobs > 0 ? 'Review complete'
                     : totalJobs > 0 ? 'Processing ' + (completedJobs + failedJobs) + ' of ' + totalJobs + ' applications'
                     : 'Applications being reviewed'}
                </h2>
                <p className="mt-1 text-slate-500">
                  {currentReviewId
                    ? <>{agency} · {totalJobs} application(s) · <code className="text-xs bg-slate-100 px-1 rounded">{currentReviewId.slice(0, 8)}…</code></>
                    : <>{agency} · Preparing submission...</>
                  }
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-blue-700">{processingPct}%</p>
                <p className="text-xs text-slate-500">
                  {totalJobs === 0 ? 'Uploading files...' : `${completedJobs + failedJobs} of ${totalJobs} done`}
                </p>
              </div>
            </div>

            {/* Overall progress bar */}
            <div className="mt-5 h-3 rounded-full bg-slate-100">
              <div
                className={`h-3 rounded-full transition-all duration-700 ${
                  totalJobs === 0 ? 'bg-blue-400 animate-pulse w-1/3' : 'bg-blue-600'
                }`}
                style={totalJobs > 0 ? { width: processingPct + '%' } : undefined}
              />
            </div>

            {/* Estimated time */}
            {totalJobs > 0 && completedJobs < totalJobs && (
              <p className="mt-2 text-xs text-slate-400">
                Elapsed: {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, '0')}
                {' · '}Estimated: ~{(totalJobs - completedJobs - failedJobs) * 3} min remaining
                · Claude is scoring each application independently
              </p>
            )}

            {/* Connection lost banner */}
            {connectionLost && (
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-amber-800 text-sm">
                <WifiOff size={16} className="shrink-0" />
                Connection lost — checking server... Results will appear when reconnected.
              </div>
            )}

            {error && (
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-red-800 text-sm">
                <AlertTriangle size={16} className="shrink-0" />{error}
              </div>
            )}

            {/* Recovery: check for results button */}
            {currentReviewId && (totalJobs === 0 || (!polling && completedJobs === 0)) && (
              <div className="mt-4 rounded-xl bg-slate-50 border p-4">
                <p className="text-sm text-slate-600">Processing may have completed. Click to check Supabase for results.</p>
                <button
                  onClick={async () => {
                    if (!currentReviewId) return;
                    setBusy(true);
                    try {
                      const fetched = await getReviewResults(currentReviewId);
                      if (fetched.reviews?.length > 0) {
                        setReviews(fetched.reviews);
                        setSelected(0);
                        // Build completed appProgress from fetched reviews
                        setAppProgress(fetched.reviews.map((r: SafeReview, i: number) => ({
                          jobId: r.review_id ?? 'result-' + i,
                          applicationName: r.applicant_name || 'Application ' + (i + 1),
                          status: 'completed' as const,
                          progress: 100,
                          message: 'Score: ' + (r.final_score ?? '—'),
                          score: r.final_score ?? null,
                          errorMessage: null,
                        })));
                        updateStoredReviewStatus(currentReviewId, 'completed');
                        setStoredReviews(loadStoredReviews());
                      } else {
                        setError('No completed results yet. The review may still be processing.');
                      }
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Failed to check results');
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="mt-2 flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  <RefreshCw size={14} /> Check for Results
                </button>
              </div>
            )}

            {/* Per-application cards */}
            <div className="mt-6 space-y-3">
              {appProgress.map(p => (
                <div
                  key={p.jobId}
                  className={'rounded-xl border p-4 ' + (p.status === 'failed' ? 'border-red-200 bg-red-50' : 'bg-white')}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-sm truncate max-w-sm">{p.applicationName}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {p.status === 'completed' && p.score !== null && (
                        <span className="text-sm font-bold text-emerald-700">{p.score}/100</span>
                      )}
                      {p.status === 'processing' && (
                        <span className="text-sm text-slate-500">—</span>
                      )}
                      <span className={'text-xs font-bold rounded-full px-3 py-1 ' + statusBadgeClass(p.status)}>
                        {statusLabel[p.status]}
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {p.status !== 'failed' && (
                    <div className="mt-2 h-1.5 rounded-full bg-slate-100">
                      <div
                        className={'h-1.5 rounded-full transition-all duration-500 ' + (p.status === 'completed' ? 'bg-emerald-500' : 'bg-blue-500')}
                        style={{ width: (p.status === 'completed' ? 100 : p.progress) + '%' }}
                      />
                    </div>
                  )}

                  {/* Status message */}
                  {p.message && p.status !== 'failed' && (
                    <p className="mt-1 text-xs text-slate-500">{p.message}</p>
                  )}

                  {/* Error message + retry */}
                  {p.status === 'failed' && (
                    <div className="mt-2 flex items-start justify-between gap-2">
                      <p className="text-xs text-red-700">{p.errorMessage ?? 'Processing failed'}</p>
                      <button
                        onClick={() => retryJob(p.jobId)}
                        className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 shrink-0"
                      >
                        <RefreshCw size={12} /> Retry
                      </button>
                    </div>
                  )}

                  {/* Application access buttons — show for completed jobs that map to a review result */}
                  {p.status === 'completed' && (() => {
                    const matchedReview = reviews.find(
                      r => r.applicant_name === p.applicationName || r.review_id === p.jobId
                    );
                    const appId = matchedReview?.application_id;
                    if (!appId || !currentReviewId) return null;
                    return (
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={async () => {
                            try {
                              const { url } = await getApplicationViewUrl(currentReviewId!, appId);
                              window.open(url, '_blank');
                            } catch (e) { setError(e instanceof Error ? e.message : 'Failed to open application'); }
                          }}
                          className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                        >
                          <FileText size={14} /> View Application
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              const { url } = await getApplicationViewUrl(currentReviewId!, appId);
                              await navigator.clipboard.writeText(url);
                              alert('Secure link copied. Expires in 60 minutes.');
                            } catch (e) { setError(e instanceof Error ? e.message : 'Failed to copy link'); }
                          }}
                          className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          Copy Secure Link
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              const { url, filename } = await getApplicationViewUrl(currentReviewId!, appId);
                              const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
                            } catch (e) { setError(e instanceof Error ? e.message : 'Failed to download'); }
                          }}
                          className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          <Download size={14} /> Download PDF
                        </button>
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-center justify-between">
              <button
                onClick={reset}
                className="flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
              >
                <XCircle size={16} /> {reviews.length > 0 ? 'New Review' : 'Cancel Review'}
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleDeleteAndReset}
                  className="flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={16} /> Delete Review
                </button>
                {polling && (
                  <span className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 size={14} className="animate-spin" /> Polling every 5s…
                  </span>
                )}
              </div>
            </div>

            {/* ------------------------------------------------------------ */}
            {/* Completed results appear inline below the progress cards      */}
            {/* ------------------------------------------------------------ */}
            {reviews.length > 0 && !polling && completedJobs === totalJobs && totalJobs > 0 && (
              <div className="mt-6 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 flex items-center gap-3">
                <CheckCircle2 size={24} className="text-emerald-600 shrink-0" />
                <div>
                  <p className="font-bold text-emerald-800">All applications scored successfully</p>
                  <p className="text-sm text-emerald-700">Select an application below to view detailed results.</p>
                </div>
              </div>
            )}

            {reviews.length > 0 && current && (
              <div className="mt-8">
                <div className="mb-6 flex items-end justify-between">
                  <div>
                    <h2 className="text-3xl font-bold">Application reviews</h2>
                    <p className="text-slate-600">{agency} · {reviews.length} application(s) scored independently by Claude</p>
                  </div>
                </div>

                {/* NOFO Brief + Overview section */}
                {current.applicant_name && (
                  <div className="mb-6 rounded-xl border bg-slate-50 p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-bold text-lg">Overview Presentation Information</h3>
                      {currentReviewId && (
                        <button
                          onClick={async () => {
                            try {
                              const brief = await getNofoBrief(currentReviewId!);
                              if (brief?.docx_storage_path) {
                                const url = await getNofoBriefDownload(brief.id);
                                window.open(url, '_blank');
                              } else {
                                alert('NOFO Brief has not been generated yet for this review.');
                              }
                            } catch { /* brief not available — silent */ }
                          }}
                          className="flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                        >
                          <Download size={14} /> NOFO Brief
                        </button>
                      )}
                    </div>
                    <div className="grid gap-3 text-sm">
                      {current.applicant_name && <div><span className="font-semibold text-slate-500">Applicant:</span> {current.applicant_name}</div>}
                      {current.application_number && <div><span className="font-semibold text-slate-500">Application #:</span> {current.application_number}</div>}
                    </div>
                  </div>
                )}

                <div className="mb-6 flex flex-wrap gap-2">
                  {reviews.map((r, i) => (
                    <button
                      key={r.review_id}
                      onClick={() => { setSelected(i); setFindingsFilter('all'); }}
                      className={'rounded-lg border px-4 py-2 text-sm font-semibold ' + (selected === i ? 'border-blue-600 bg-blue-600 text-white' : 'bg-white')}
                    >
                      {r.applicant_name || 'Application ' + (i + 1)}
                    </button>
                  ))}
                </div>

                {error && <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-800">{error}</div>}

                <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
                  <div className="space-y-4">
                    {/* Review Scorecard */}
                    <div className="rounded-xl border bg-white p-5 mb-4">
                      <h3 className="font-bold text-lg mb-3">Review Scorecard</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border">
                          <thead>
                            <tr className="bg-slate-100">
                              <th className="text-left p-2 border">Criterion</th>
                              <th className="text-center p-2 border w-20">Score</th>
                              <th className="text-center p-2 border w-28">Classification</th>
                              <th className="text-center p-2 border w-14 bg-emerald-50 text-emerald-800">S</th>
                              <th className="text-center p-2 border w-14 bg-blue-50 text-blue-800">M</th>
                              <th className="text-center p-2 border w-14 bg-red-50 text-red-800">W</th>
                            </tr>
                          </thead>
                          <tbody>
                            {current.criteria.map((c: any, ci: number) => (
                              <React.Fragment key={ci}>
                                <tr className="border-t hover:bg-slate-50">
                                  <td className="p-2 border font-semibold"><button onClick={() => { setFindingsFilter('all'); setTimeout(() => document.getElementById('criterion-' + ci)?.scrollIntoView({behavior:'smooth'}), 50); }} className="text-blue-700 hover:underline cursor-pointer text-left">{c.name}</button></td>
                                  <td className="p-2 border text-center font-bold">{c.score ?? '—'}/{c.maximum_points}</td>
                                  <td className="p-2 border text-center">
                                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                                      c.classification === 'strength' ? 'bg-emerald-100 text-emerald-800' :
                                      c.classification === 'met' ? 'bg-blue-100 text-blue-800' :
                                      c.classification === 'minor_weakness' ? 'bg-amber-100 text-amber-800' :
                                      c.classification === 'moderate_weakness' ? 'bg-orange-100 text-orange-800' :
                                      c.classification === 'major_weakness' ? 'bg-red-100 text-red-800' :
                                      'bg-slate-100 text-slate-600'
                                    }`}>{(c.classification || '—').replace(/_/g, ' ')}</span>
                                  </td>
                                  <td className="p-2 border text-center">
                                    {(c.strengths?.length || 0) > 0 ? (
                                      <button onClick={() => { setFindingsFilter('strengths'); document.getElementById('criterion-' + ci)?.scrollIntoView({behavior:'smooth'}); }}
                                        className="text-emerald-700 font-bold hover:underline cursor-pointer">{c.strengths.length}</button>
                                    ) : <span className="text-slate-300">0</span>}
                                  </td>
                                  <td className="p-2 border text-center">
                                    {(c.mets?.length || 0) > 0 ? (
                                      <button onClick={() => { setFindingsFilter('mets'); document.getElementById('criterion-' + ci)?.scrollIntoView({behavior:'smooth'}); }}
                                        className="text-blue-700 font-bold hover:underline cursor-pointer">{c.mets.length}</button>
                                    ) : <span className="text-slate-300">0</span>}
                                  </td>
                                  <td className="p-2 border text-center">
                                    {(c.weaknesses?.length || 0) > 0 ? (
                                      <button onClick={() => { setFindingsFilter('weaknesses'); document.getElementById('criterion-' + ci)?.scrollIntoView({behavior:'smooth'}); }}
                                        className="text-red-700 font-bold hover:underline cursor-pointer">{c.weaknesses.length}</button>
                                    ) : <span className="text-slate-300">0</span>}
                                  </td>
                                </tr>
                                {(c.subcriteria || []).map((sub: any, si: number) => (
                                  <tr key={`${ci}-sub-${si}`} className="border-t bg-slate-50/50">
                                    <td className="p-2 border pl-8 text-xs"><button onClick={() => { setFindingsFilter('all'); setTimeout(() => document.getElementById('criterion-' + ci)?.scrollIntoView({behavior:'smooth'}), 50); }} className="text-blue-600 hover:underline cursor-pointer">↳ {sub.name}</button></td>
                                    <td className="p-2 border text-center text-xs font-semibold text-slate-700">{sub.score ?? '—'}/{sub.maximum_points}</td>
                                    <td className="p-2 border" colSpan={4}></td>
                                  </tr>
                                ))}
                              </React.Fragment>
                            ))}
                            <tr className="border-t-2 border-slate-400 bg-slate-100 font-bold">
                              <td className="p-2 border">Total</td>
                              <td className="p-2 border text-center">{current.criteria.reduce((s: number, c: any) => s + (c.score || 0), 0)}/{current.criteria.reduce((s: number, c: any) => s + c.maximum_points, 0)}</td>
                              <td className="p-2 border"></td>
                              <td className="p-2 border text-center text-emerald-700">{current.criteria.reduce((s: number, c: any) => s + (c.strengths?.length || 0), 0)}</td>
                              <td className="p-2 border text-center text-blue-700">{current.criteria.reduce((s: number, c: any) => s + (c.mets?.length || 0), 0)}</td>
                              <td className="p-2 border text-center text-red-700">{current.criteria.reduce((s: number, c: any) => s + (c.weaknesses?.length || 0), 0)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Findings Filter Bar */}
                    <div className="flex gap-2 mb-4">
                      {(['all', 'strengths', 'mets', 'weaknesses'] as const).map(f => (
                        <button key={f} onClick={() => setFindingsFilter(f)}
                          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                            findingsFilter === f
                              ? f === 'strengths' ? 'bg-emerald-600 text-white' :
                                f === 'mets' ? 'bg-blue-600 text-white' :
                                f === 'weaknesses' ? 'bg-red-600 text-white' :
                                'bg-slate-800 text-white'
                              : 'bg-white border text-slate-600 hover:bg-slate-50'
                          }`}>
                          {f === 'all' ? 'All Criteria' : f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                      ))}
                    </div>

                    {/* Findings summary table when a filter is active */}
                    {findingsFilter !== 'all' && current && (
                      <div className="rounded-xl border bg-white p-6">
                        <h3 className="font-bold text-lg mb-4">
                          {findingsFilter === 'strengths' ? 'All Strengths' : findingsFilter === 'mets' ? 'All Met Criteria' : 'All Weaknesses'}
                          {' \u2014 '}{current.applicant_name || 'Application'}
                        </h3>
                        <table className="w-full text-sm border">
                          <thead>
                            <tr className="bg-slate-100">
                              <th className="text-left p-2 border">Criterion</th>
                              <th className="text-left p-2 border">Finding</th>
                              <th className="text-left p-2 border w-28">App Pages</th>
                              {findingsFilter === 'weaknesses' && <th className="text-left p-2 border">NOFO Requirement</th>}
                              {findingsFilter === 'weaknesses' && <th className="text-left p-2 border">Impact</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {current.criteria.flatMap((c: any) =>
                              (c[findingsFilter] || []).map((finding: any, fi: number) => (
                                <tr key={c.name + fi} className="border-t">
                                  <td className="p-2 border align-top font-semibold text-slate-700">{c.name}<br/><span className="text-xs text-slate-400">{c.score}/{c.maximum_points}</span></td>
                                  <td className="p-2 border align-top">{finding.comment}</td>
                                  <td className="p-2 border align-top text-xs text-blue-700">p. {(finding.application_pages || finding.pages || []).join(', ')}</td>
                                  {findingsFilter === 'weaknesses' && <td className="p-2 border align-top text-xs">{finding.nofo_requirement || ''}<br/><span className="text-amber-600">NOFO p. {(finding.nofo_pages || []).join(', ')}</span></td>}
                                  {findingsFilter === 'weaknesses' && <td className="p-2 border align-top text-xs italic">{finding.impact || ''}</td>}
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                        {current.criteria.flatMap((c: any) => c[findingsFilter] || []).length === 0 && (
                          <p className="text-slate-400 text-sm mt-4">No {findingsFilter} identified.</p>
                        )}
                      </div>
                    )}

                    {/* Per-criterion cards — shown only when filter is 'all' */}
                    {findingsFilter === 'all' && current.criteria.map((c, ci) => (
                      <article key={c.name} id={'criterion-' + ci} className="rounded-xl border bg-white p-6 scroll-mt-4">
                        <div className="flex justify-between gap-3">
                          <div>
                            <h3 className="font-bold">{c.name}</h3>
                            <p className="mt-1 text-sm text-slate-600">{c.score_rationale}</p>
                          </div>
                          <div className="shrink-0 rounded-lg bg-blue-50 px-4 py-2 font-bold text-blue-800">
                            {c.score !== undefined && c.score !== null ? c.score : '—'} / {c.maximum_points}
                          </div>
                        </div>
                        {/* Requirement Assessment Table */}
                        {(c as any).requirement_assessments?.length > 0 && (
                          <div className="mt-4 overflow-x-auto">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Requirement Assessment</p>
                            <table className="w-full text-sm border">
                              <thead>
                                <tr className="bg-slate-100">
                                  <th className="text-left p-2 border">NOFO Requirement</th>
                                  <th className="text-left p-2 border">Application Response</th>
                                  <th className="text-left p-2 border w-32">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(c as any).requirement_assessments.map((ra: any, ri: number) => (
                                  <tr key={ri} className="border-t">
                                    <td className="p-2 border align-top">
                                      <p className="text-sm">{ra.requirement_text}</p>
                                      <p className="text-xs text-amber-600 mt-1">NOFO p. {(ra.nofo_pages || []).join(', ')}</p>
                                    </td>
                                    <td className="p-2 border align-top">
                                      <p className="text-sm">{ra.explanation}</p>
                                      <p className="text-xs text-blue-600 mt-1">App p. {(ra.application_pages || []).join(', ')}</p>
                                    </td>
                                    <td className="p-2 border align-top">
                                      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                                        ra.response_status === 'exceeds' ? 'bg-emerald-100 text-emerald-800' :
                                        ra.response_status === 'fully_addressed' ? 'bg-blue-100 text-blue-800' :
                                        ra.response_status === 'partially_addressed' ? 'bg-amber-100 text-amber-800' :
                                        ra.response_status === 'not_addressed' ? 'bg-red-100 text-red-800' :
                                        'bg-slate-100 text-slate-600'
                                      }`}>{(ra.response_status || '').replace(/_/g, ' ')}</span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {/* NOFO Question Responses */}
                        {(c as any).question_responses?.length > 0 && (
                          <div className="mt-5">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">NOFO Evaluation Questions</p>
                            <div className="space-y-3">
                              {(c as any).question_responses.map((qr: any, qi: number) => (
                                <div key={qi} className="rounded-lg border p-4">
                                  <p className="text-sm font-semibold text-slate-700">Q: {qr.nofo_question}</p>
                                  <p className="mt-2 text-sm leading-6">{qr.answer}</p>
                                  <div className="mt-2 flex items-center gap-3">
                                    <span className={'rounded-full px-2 py-0.5 text-xs font-bold ' + (
                                      qr.assessment === 'strength' ? 'bg-emerald-100 text-emerald-800' :
                                      qr.assessment === 'weakness' ? 'bg-red-100 text-red-800' :
                                      'bg-blue-100 text-blue-800'
                                    )}>{qr.assessment}</span>
                                    <span className="text-xs font-bold text-blue-700">Application p. {(qr.application_pages || []).join(', ')}</span>
                                  </div>
                                  {qr.assessment === 'weakness' && qr.nofo_requirement && (
                                    <div className="mt-2 rounded border-l-4 border-amber-400 bg-amber-50 p-2">
                                      <p className="text-xs text-amber-800"><span className="font-bold">NOFO:</span> {qr.nofo_requirement} <button onClick={async () => { try { const url = await getNofoViewUrl(currentReviewId!); window.open(url + '#page=' + (qr.nofo_pages?.[0] || 1), '_blank'); } catch {} }} className="font-bold text-amber-700 hover:underline cursor-pointer">(NOFO p. {(qr.nofo_pages || []).join(', ')})</button></p>
                                      {qr.impact && <p className="text-xs text-amber-700 mt-1"><span className="font-bold">Impact:</span> {qr.impact}</p>}
                                    </div>
                                  )}
                                  {(qr.application_pages || []).length > 0 && currentReviewId && current && (
                                    <button
                                      onClick={async () => {
                                        try {
                                          const { url } = await getApplicationViewUrl(currentReviewId!, current.application_id);
                                          window.open(url + '#page=' + (qr.application_pages || [])[0], '_blank');
                                        } catch (e) { setError(e instanceof Error ? e.message : 'Failed to open'); }
                                      }}
                                      className="text-xs font-bold text-blue-700 hover:underline cursor-pointer mt-1 block"
                                    >
                                      Application p. {(qr.application_pages || []).join(', ')}
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {(['strengths', 'mets', 'weaknesses'] as const).map(group => {
                          const findings = c[group] || [];
                          // Group findings by subcriterion tag [Name] in comment
                          const grouped: Record<string, any[]> = {};
                          const hasSubs = (c.subcriteria || []).length > 0;
                          findings.forEach((f: any) => {
                            const match = f.comment?.match(/^\[([^\]]+)\]\s*/);
                            const subName = match ? match[1] : (hasSubs ? 'General' : '');
                            if (!grouped[subName]) grouped[subName] = [];
                            grouped[subName].push({...f, comment: match ? f.comment.replace(match[0], '') : f.comment});
                          });
                          return (
                          <div key={group} className="mt-5">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{group}</p>
                            <div className="mt-2 space-y-2">
                              {findings.length ? (
                                Object.entries(grouped).map(([subName, subFindings]) => (
                                <div key={subName}>
                                  {subName && <p className="text-xs font-semibold text-indigo-700 mt-3 mb-1 border-b border-indigo-100 pb-1">{subName}</p>}
                                  {subFindings.map((finding: any, fi: number) => (
                                  <div key={fi} className="rounded-lg bg-slate-50 p-4">
                                    <p className="text-sm leading-6">{finding.comment}</p>
                                    {group === 'weaknesses' ? (
                                      <>
                                        {finding.nofo_requirement && (
                                          <div className="mt-2 rounded-lg border-l-4 border-amber-400 bg-amber-50 p-3">
                                            <p className="text-xs font-bold uppercase text-amber-700">NOFO Requirement</p>
                                            <p className="text-sm">{finding.nofo_requirement}</p>
                                            <button onClick={async () => { try { const url = await getNofoViewUrl(currentReviewId!); window.open(url + '#page=' + (finding.nofo_pages?.[0] || 1), '_blank'); } catch {} }} className="text-xs font-bold text-amber-600 mt-1 hover:underline cursor-pointer">NOFO p. {(finding.nofo_pages || []).join(', ')}</button>
                                          </div>
                                        )}
                                        <div className="mt-1">
                                          {(() => {
                                            const pages = finding.application_pages || finding.pages || [];
                                            return pages.length > 0 && currentReviewId && current ? (
                                              <button
                                                onClick={async () => {
                                                  try {
                                                    const { url } = await getApplicationViewUrl(currentReviewId!, current.application_id);
                                                    window.open(url + '#page=' + pages[0], '_blank');
                                                  } catch (e) { setError(e instanceof Error ? e.message : 'Failed to open'); }
                                                }}
                                                className="text-xs font-bold text-blue-700 hover:underline cursor-pointer"
                                              >
                                                Application p. {pages.join(', ')}
                                              </button>
                                            ) : (
                                              <p className="text-xs font-bold text-blue-700">
                                                Application p. {pages.join(', ')}
                                              </p>
                                            );
                                          })()}
                                        </div>
                                        {finding.impact && (
                                          <div className="mt-2 text-sm text-slate-600 italic">
                                            <span className="font-semibold not-italic">Impact: </span>{finding.impact}
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      (() => {
                                        const pages = finding.application_pages || finding.pages || [];
                                        return pages.length > 0 && currentReviewId && current ? (
                                          <button
                                            onClick={async () => {
                                              try {
                                                const { url } = await getApplicationViewUrl(currentReviewId!, current.application_id);
                                                window.open(url + '#page=' + pages[0], '_blank');
                                              } catch (e) { setError(e instanceof Error ? e.message : 'Failed to open'); }
                                            }}
                                            className="mt-1 text-xs font-bold text-blue-700 hover:underline cursor-pointer"
                                          >
                                            Application p. {pages.join(', ')}
                                          </button>
                                        ) : (
                                          <p className="mt-1 text-xs font-bold text-blue-700">
                                            Application p. {pages.join(', ')}
                                          </p>
                                        );
                                      })()
                                    )}
                                  </div>
                                ))}
                                </div>))
                              ) : (
                                <p className="text-sm text-slate-400">None identified.</p>
                              )}
                            </div>
                          </div>
                        )})}
                      </article>
                    ))}
                  </div>

                  <aside className="h-fit rounded-xl bg-slate-900 p-6 text-white lg:sticky lg:top-5">
                    <p className="text-slate-300">Claude draft score</p>
                    <p className="mt-2 text-4xl font-bold">
                      {scoreTotal !== null ? scoreTotal : '—'}
                      <span className="text-lg text-slate-400">
                        {' / ' + (current.maximum_score || current.criteria.reduce((s, c) => s + c.maximum_points, 0))}
                      </span>
                    </p>
                    <p className="mt-4 text-xs leading-5 text-slate-300">{current.certification}</p>

                    {/* Reviewer Validation Controls */}
                    {(() => {
                      const appId = current.application_id;
                      const vs = validationStatus[appId] || 'ai_draft';
                      const isBusy = validationBusy[appId] || false;
                      const badgeClass =
                        vs === 'reviewer_approved' ? 'bg-emerald-500 text-white' :
                        vs === 'reviewer_validating' ? 'bg-blue-500 text-white' :
                        vs === 'needs_revision' ? 'bg-amber-400 text-slate-900' :
                        'bg-slate-500 text-white';
                      const badgeLabel =
                        vs === 'reviewer_approved' ? '\u2713 Approved' :
                        vs === 'reviewer_validating' ? 'Validating' :
                        vs === 'needs_revision' ? 'Needs Revision' :
                        'AI Draft';
                      return (
                        <div className="mt-5">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Validation</p>
                            <span className={'text-xs font-bold rounded-full px-2.5 py-1 ' + badgeClass}>{badgeLabel}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            {([
                              { value: 'ai_draft', label: 'AI Draft' },
                              { value: 'reviewer_validating', label: 'Validating' },
                              { value: 'reviewer_approved', label: '\u2713 Approve' },
                              { value: 'needs_revision', label: 'Needs Revision' },
                            ] as const).map(opt => (
                              <button
                                key={opt.value}
                                disabled={isBusy || vs === opt.value}
                                onClick={() => handleValidationChange(appId, opt.value)}
                                className={'rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ' + (
                                  vs === opt.value
                                    ? opt.value === 'reviewer_approved' ? 'bg-emerald-500 text-white cursor-default'
                                      : opt.value === 'reviewer_validating' ? 'bg-blue-500 text-white cursor-default'
                                      : opt.value === 'needs_revision' ? 'bg-amber-400 text-slate-900 cursor-default'
                                      : 'bg-slate-500 text-white cursor-default'
                                    : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                                )}
                              >
                                {isBusy && vs !== opt.value ? '...' : opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {(current.completed_worksheet_url || currentReviewId) && (
                      <button
                        onClick={downloadWorksheet}
                        className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 py-3 font-bold text-slate-950"
                      >
                        <Download size={18} /> Download worksheet
                      </button>
                    )}

                    <button
                      onClick={exportReview}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 font-bold text-slate-900"
                    >
                      <Download size={18} /> Export JSON
                    </button>
                  </aside>
                </div>

                {/* Budget Summary */}
                {reviews.length > 0 && current && (() => {
                  const result = current as any;
                  const budget = result.budget || (result.criteria?.find((c: any) => c.name?.toLowerCase().includes('support'))?.budget);
                  if (!budget) return null;
                  const years = budget.annual_recommended_funding || [];
                  const total = years.reduce((s: number, v: number | null) => s + (v || 0), 0);
                  return (
                    <div className="mt-6 rounded-xl border bg-white p-6">
                      <h3 className="font-bold text-lg mb-4">Budget Recommendation</h3>
                      <div className="flex items-center gap-4 mb-4">
                        <span className={`rounded-full px-4 py-1.5 text-sm font-bold ${
                          budget.recommendation === 'as_requested' ? 'bg-emerald-100 text-emerald-800' :
                          budget.recommendation === 'as_reduced' ? 'bg-amber-100 text-amber-800' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {budget.recommendation === 'as_requested' ? 'Recommended as Requested' :
                           budget.recommendation === 'as_reduced' ? 'Recommended as Reduced' :
                           'Unable to Determine'}
                        </span>
                      </div>
                      {years.length > 0 && (
                        <table className="w-full text-sm border mb-4">
                          <thead>
                            <tr className="bg-slate-100">
                              {years.map((_: any, i: number) => <th key={i} className="p-2 border text-center">Year {i + 1}</th>)}
                              <th className="p-2 border text-center font-bold bg-slate-200">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              {years.map((amt: number | null, i: number) => (
                                <td key={i} className="p-2 border text-center">{amt != null ? '$' + amt.toLocaleString() : '—'}</td>
                              ))}
                              <td className="p-2 border text-center font-bold">${total.toLocaleString()}</td>
                            </tr>
                          </tbody>
                        </table>
                      )}
                      {budget.reduction_rationale && (
                        <div className="text-sm text-slate-700">
                          <p className="font-semibold text-slate-500 text-xs uppercase mb-1">Budget Rationale</p>
                          <p>{budget.reduction_rationale}</p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Delete Applicant Data — bottom of completed review */}
                {reviews.length > 0 && !polling && (
                  <div className="mt-8 rounded-xl border-2 border-red-200 bg-red-50 p-6">
                    <h3 className="font-bold text-red-800">Delete Applicant Data</h3>
                    <p className="mt-2 text-sm text-red-700">
                      Permanently deletes application documents, applicant identities, scores, findings, and completed worksheets.
                      The NOFO, approved rubric, and Reviewer NOFO Brief will be preserved.
                    </p>
                    <input
                      type="text"
                      placeholder="Type DELETE APPLICANT DATA to confirm"
                      className="mt-3 w-full rounded-lg border border-red-300 px-3 py-2 text-sm"
                      id="delete-confirm"
                    />
                    <button
                      onClick={async () => {
                        const input = (document.getElementById('delete-confirm') as HTMLInputElement)?.value;
                        if (input !== 'DELETE APPLICANT DATA') { setError('Type the exact confirmation phrase.'); return; }
                        try {
                          await deleteApplicantData(currentReviewId!, input);
                          setReviews([]);
                          setAppProgress([]);
                          setError('');
                          alert('Applicant data deleted. NOFO materials preserved.');
                        } catch (e) { setError(e instanceof Error ? e.message : 'Deletion failed'); }
                      }}
                      className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
                    >
                      Permanently Delete Applicant Data
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Fallback: no currentReviewId */}
            {!currentReviewId && appProgress.length === 0 && reviews.length === 0 && (
              <div className="mt-6 rounded-xl border bg-slate-50 p-8 text-center">
                <FileSearch size={32} className="mx-auto text-slate-400 mb-3" />
                <p className="text-slate-600 font-semibold">No active review</p>
                <button
                  onClick={() => { setStep('history'); setStoredReviews(loadStoredReviews()); window.location.hash = '#/reviews'; }}
                  className="mt-3 text-sm font-semibold text-blue-700 hover:underline"
                >
                  Go to My Reviews
                </button>
              </div>
            )}

            {/* Fallback: have reviewId but nothing loaded yet */}
            {currentReviewId && appProgress.length === 0 && reviews.length === 0 && !busy && (
              <div className="mt-6 rounded-xl border bg-slate-50 p-8 text-center">
                <Loader2 size={32} className="mx-auto text-blue-500 animate-spin mb-3" />
                <p className="text-slate-600 font-semibold">Loading review...</p>
                <button
                  onClick={() => openReview(currentReviewId)}
                  className="mt-3 text-sm font-semibold text-blue-700 hover:underline"
                >
                  Retry loading
                </button>
              </div>
            )}
          </section>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* STEP: HISTORY (My Reviews)                                          */}
        {/* ------------------------------------------------------------------ */}
        {step === 'history' && (
          <section>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold">My Reviews</h2>
                <p className="text-slate-500 mt-1">All reviews saved in this browser · {statusSummary(storedReviews)}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={clearCompleted}
                  className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Clear completed
                </button>
                <button
                  onClick={() => { setStep('upload'); window.location.hash = '#/app'; }}
                  className="flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-2 text-sm font-bold text-white"
                >
                  <Upload size={16} /> New Review
                </button>
              </div>
            </div>

            {storedReviews.length === 0 && (
              <div className="rounded-2xl border bg-white p-12 text-center shadow">
                <History size={40} className="mx-auto text-slate-300 mb-4" />
                <p className="text-slate-500">No reviews yet. Upload a NOFO and applications to get started.</p>
              </div>
            )}

            <div className="space-y-3">
              {storedReviews.map(r => {
                const date = new Date(r.timestamp);
                const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                return (
                  <div
                    key={r.review_id}
                    className="rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => { window.location.hash = '#/reviews/' + r.review_id; }}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold truncate">{r.nofo_name || 'Unnamed NOFO'}</span>
                          <span className={'text-xs font-bold rounded-full px-2.5 py-0.5 ' + (
                            r.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                            r.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                            'bg-red-100 text-red-800'
                          )}>
                            {r.status === 'processing' ? 'In progress' : r.status}
                          </span>
                        </div>
                        <p className="text-sm text-slate-500">
                          {r.agency} · {r.app_names.length} application(s)
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">{dateStr} at {timeStr}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="flex flex-col gap-1">
                          {r.app_names.slice(0, 3).map((n, i) => (
                            <span key={i} className="text-xs text-slate-400 truncate max-w-[200px]">{n}</span>
                          ))}
                          {r.app_names.length > 3 && (
                            <span className="text-xs text-slate-400">+{r.app_names.length - 3} more</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Clock size={12} className="text-slate-400" />
                        <span className="text-xs text-slate-400">ID: {r.review_id.slice(0, 8)}…</span>
                      </div>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!window.confirm('Delete this review and all its data?')) return;
                          try {
                            await deleteReview(r.review_id);
                            const remaining = loadStoredReviews().filter(x => x.review_id !== r.review_id);
                            saveStoredReviews(remaining);
                            setStoredReviews(remaining);
                          } catch (err) { setError(err instanceof Error ? err.message : 'Delete failed'); }
                        }}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-red-500 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

      </main>
    </div>
  );
};

export default SafeReviewDashboard;
