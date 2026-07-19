import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, BarChart3, Brain, CheckCircle2, Clock, Download, FileSearch,
  FileText, History, Loader2, LogOut, RefreshCw, Trash2, Upload, WifiOff, XCircle,
} from 'lucide-react';
import {
  deleteReview, extractRubric, ExtractedRubric, generateNofoBrief, getNofoBrief,
  getNofoBriefDownload, getReviewResults,
  getWorksheetUrl, JobStatus, NofoBrief, pollJobStatus, ReviewPackage,
  runSafeReviews, SafeReview,
} from '../services/api';
import { useAuth } from '../contexts/AuthContext';

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

type Step = 'upload' | 'rubric' | 'brief' | 'processing' | 'results' | 'history';

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------
const statusLabel: Record<AppProgress['status'], string> = {
  uploaded: 'Uploaded',
  queued: 'Queued',
  processing: 'Processing',
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

  // NOFO Brief state
  const [nofoBrief, setNofoBrief] = useState<NofoBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState('');
  const [briefAcknowledged, setBriefAcknowledged] = useState(false);
  const [briefExpandedSections, setBriefExpandedSections] = useState<Record<string, boolean>>({});
  // Track the nofo storage path so brief generation can reference it
  const [nofoStoragePath, setNofoStoragePath] = useState<string>('');
  const briefPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // History
  const [storedReviews, setStoredReviews] = useState<StoredReview[]>(loadStoredReviews);

  const current = reviews[selected];
  const scoreTotal = useMemo(() => current?.final_score ?? null, [current]);

  // ---------------------------------------------------------------------------
  // Route handling — respond to #/reviews/{id} on mount and hash changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleHash = () => {
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
    if (!stored) {
      setError('Review not found in history.');
      return;
    }
    setCurrentReviewId(reviewId);
    setAgency(stored.agency);
    setError('');

    // Try to get results first (may already be done)
    try {
      const fetched = await getReviewResults(reviewId);
      if (fetched.reviews?.length > 0) {
        setReviews(fetched.reviews);
        setSelected(0);
        setStep('results');
        updateStoredReviewStatus(reviewId, 'completed');
        setStoredReviews(loadStoredReviews());
        return;
      }
    } catch {
      // Results not ready or API unreachable — fall through to polling
    }

    // Resume polling
    if (stored.job_ids.length > 0) {
      const initial: AppProgress[] = stored.job_ids.map((id, i) => ({
        jobId: id,
        applicationName: stored.app_names[i] ?? 'Application ' + (i + 1),
        status: 'queued' as const,
        progress: 0,
        message: 'Resuming check...',
        score: null,
        errorMessage: null,
      }));
      setAppProgress(initial);
      setPolling(true);
      setStep('processing');
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
    setBusy(true);
    setError('');
    setBriefError('');
    setBriefAcknowledged(false);
    setNofoBrief(null);
    setBriefExpandedSections({});

    // If we already have a currentReviewId (e.g. resuming), use it; otherwise create a temp one
    // We'll create the review record now so we can check for an existing brief
    // Build a temporary review id to look up briefs — the real one comes from createReviewAndUpload later
    // For the brief step, we just need to show the brief UI
    setStep('brief');
    setBusy(false);

    // Try to find/generate a brief.
    // We need a review record first — but the actual review creation happens in `run`.
    // For the brief step, we generate using a pre-flight approach:
    // we'll call the worker endpoint with the nofo file data we already have.
    // Since we don't have a review_id yet, we create a placeholder record.
    await initBrief();
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
        const { supabase: _sb } = await import('../lib/supabase');
        // Import supabase directly for this operation
        const { createClient } = await import('@supabase/supabase-js');
        void createClient; // suppress unused
        // Use the already-imported supabase from api.ts through a re-export isn't clean;
        // instead, upload the NOFO now and create the grant_review record
        const prefix = userId + '/' + reviewId;
        const { error: upErr, data: upData } = await (await import('../lib/supabase')).supabase.storage
          .from('nofo-files')
          .upload(prefix + '/nofo/' + nofo.name, nofo, { upsert: true });
        if (upErr) throw new Error('NOFO upload failed: ' + upErr.message);
        nofoPath = prefix + '/nofo/' + nofo.name;

        const { error: reviewError } = await (await import('../lib/supabase')).supabase.from('grant_reviews').insert({
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
        // If we already have a review record from the brief step, pass the existing ID
        // createReviewAndUpload will create a new one if needed
        result = await runSafeReviews(item, rubric);
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
        setPolling(true);
        setStep('processing');
      } else {
        const fetched = await getReviewResults(result.review_id);
        setReviews(fetched.reviews);
        setSelected(0);
        setStep('results');
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
            setStep('results');
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

  // When all jobs reach terminal state, fetch results
  useEffect(() => {
    if (!polling || appProgress.length === 0) return;
    const allDone = appProgress.every(p => p.status === 'completed' || p.status === 'failed');
    if (allDone) {
      stopPolling();
      if (currentReviewId) {
        getReviewResults(currentReviewId)
          .then(fetched => {
            setReviews(fetched.reviews);
            setSelected(0);
            setStep('results');
            updateStoredReviewStatus(currentReviewId, 'completed');
            setStoredReviews(loadStoredReviews());
          })
          .catch(e => setError(e instanceof Error ? e.message : 'Failed to fetch results'));
      }
    }
  }, [appProgress, polling, currentReviewId, stopPolling]);

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
      const url = await getWorksheetUrl(currentReviewId, current.review_id);
      window.open(url, '_blank');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Worksheet download failed');
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
            <span className="flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-800">
              <CheckCircle2 size={16} /> AI System Ready
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

      {/* Step indicator (not shown on history) */}
      {step !== 'history' && (
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-7 text-sm font-semibold">
          <span className={step === 'upload' ? 'text-blue-700' : 'text-emerald-700'}>
            <Upload className="mr-2 inline" size={20} />Upload
          </span>
          <span className={step === 'rubric' ? 'text-blue-700' : (step === 'brief' || step === 'processing' || step === 'results') ? 'text-emerald-700' : 'text-slate-400'}>
            <BarChart3 className="mr-2 inline" size={20} />Rubric
          </span>
          <span className={step === 'brief' ? 'text-blue-700' : (step === 'processing' || step === 'results') ? 'text-emerald-700' : 'text-slate-400'}>
            <FileText className="mr-2 inline" size={20} />NOFO Brief
          </span>
          <span className={step === 'processing' ? 'text-blue-700' : step === 'results' ? 'text-emerald-700' : 'text-slate-400'}>
            <Loader2 className={'mr-2 inline' + (step === 'processing' ? ' animate-spin' : '')} size={20} />Processing
          </span>
          <span className={step === 'results' ? 'text-blue-700' : 'text-slate-400'}>
            <CheckCircle2 className="mr-2 inline" size={20} />Results
          </span>
        </div>
      )}

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
                <div key={i} className="grid gap-3 py-4 md:grid-cols-[80px_1fr_130px]">
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

            <div className="mt-6 flex justify-between">
              <button onClick={() => setStep('upload')} className="rounded-lg border px-5 py-3 font-semibold">
                Back
              </button>
              <button
                onClick={proceedToBrief}
                disabled={!rubric.approved || busy}
                className="flex items-center gap-2 rounded-xl bg-blue-700 px-7 py-3 font-bold text-white disabled:opacity-40"
              >
                {busy ? <Loader2 className="animate-spin" /> : <FileSearch />}
                {busy ? 'Loading…' : 'Continue to NOFO Brief'}
              </button>
            </div>
          </section>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* STEP: PROCESSING (async job status screen)                          */}
        {/* ------------------------------------------------------------------ */}
        {step === 'processing' && (
          <section className="rounded-2xl border bg-white p-8 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Applications being reviewed</h2>
                <p className="mt-1 text-slate-500">
                  {agency} · {totalJobs} application(s) · Review ID: <code className="text-xs bg-slate-100 px-1 rounded">{currentReviewId?.slice(0, 8)}…</code>
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-blue-700">{processingPct}%</p>
                <p className="text-xs text-slate-500">{completedJobs + failedJobs} of {totalJobs} done</p>
              </div>
            </div>

            {/* Overall progress bar */}
            <div className="mt-5 h-3 rounded-full bg-slate-100">
              <div
                className="h-3 rounded-full bg-blue-600 transition-all duration-700"
                style={{ width: processingPct + '%' }}
              />
            </div>

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
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-center justify-between">
              <button
                onClick={reset}
                className="flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
              >
                <XCircle size={16} /> Cancel Review
              </button>
              {polling && (
                <span className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 size={14} className="animate-spin" /> Polling every 5s…
                </span>
              )}
            </div>
          </section>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* STEP: RESULTS                                                       */}
        {/* ------------------------------------------------------------------ */}
        {step === 'results' && current && (
          <section>
            <div className="mb-6 flex items-end justify-between">
              <div>
                <h2 className="text-3xl font-bold">Application reviews</h2>
                <p className="text-slate-600">{agency} · {reviews.length} application(s) scored independently by Claude</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleDeleteAndReset}
                  className="flex items-center gap-2 rounded-lg border bg-white px-4 py-2 font-semibold text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={16} /> Delete Review
                </button>
                <button onClick={reset} className="rounded-lg border bg-white px-4 py-2 font-semibold">
                  New grant review
                </button>
              </div>
            </div>

            <div className="mb-6 flex flex-wrap gap-2">
              {reviews.map((r, i) => (
                <button
                  key={r.review_id}
                  onClick={() => setSelected(i)}
                  className={'rounded-lg border px-4 py-2 text-sm font-semibold ' + (selected === i ? 'border-blue-600 bg-blue-600 text-white' : 'bg-white')}
                >
                  {r.applicant_name || 'Application ' + (i + 1)}
                </button>
              ))}
            </div>

            {error && <div className="mb-4 rounded-lg bg-red-50 p-4 text-red-800">{error}</div>}

            <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
              <div className="space-y-4">
                {current.criteria.map(c => (
                  <article key={c.name} className="rounded-xl border bg-white p-6">
                    <div className="flex justify-between gap-3">
                      <div>
                        <h3 className="font-bold">{c.name}</h3>
                        <p className="mt-1 text-sm text-slate-600">{c.score_rationale}</p>
                      </div>
                      <div className="shrink-0 rounded-lg bg-blue-50 px-4 py-2 font-bold text-blue-800">
                        {c.score !== undefined && c.score !== null ? c.score : '—'} / {c.maximum_points}
                      </div>
                    </div>
                    {(['strengths', 'mets', 'weaknesses'] as const).map(group => (
                      <div key={group} className="mt-5">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{group}</p>
                        <div className="mt-2 space-y-2">
                          {(c[group] || []).length ? (
                            (c[group] || []).map((finding, fi) => (
                              <div key={fi} className="rounded-lg bg-slate-50 p-4">
                                <p className="text-sm leading-6">{finding.comment}</p>
                                <p className="mt-1 text-xs font-bold text-blue-700">
                                  Application page(s): {finding.pages.join(', ')}
                                </p>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-slate-400">None identified.</p>
                          )}
                        </div>
                      </div>
                    ))}
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
                    <div className="mt-3 flex items-center gap-1">
                      <Clock size={12} className="text-slate-400" />
                      <span className="text-xs text-slate-400">ID: {r.review_id.slice(0, 8)}…</span>
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
