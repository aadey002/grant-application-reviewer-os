import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, BarChart3, Brain, CheckCircle2, Download, FileSearch,
  FileText, Loader2, LogOut, Trash2, Upload,
} from 'lucide-react';
import {
  deleteReview, extractRubric, ExtractedRubric, getReviewResults,
  getWorksheetUrl, JobStatus, pollJobStatus, ReviewPackage,
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
// Per-application polling state
// ---------------------------------------------------------------------------
interface AppProgress {
  jobId: string;
  applicationName: string;
  status: JobStatus['status'] | 'uploaded';
  progress: number;
  message: string;
}

const POLL_INTERVAL_MS = 3000;

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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const current = reviews[selected];
  const scoreTotal = useMemo(() => current?.final_score ?? 0, [current]);
  const step = reviews.length ? 'results' : rubric ? 'rubric' : 'upload';

  // ---------------------------------------------------------------------------
  // Step 1 — extract rubric
  // ---------------------------------------------------------------------------
  const process = async () => {
    if (!nofo || !applications.length) return;
    setBusy(true);
    setError('');
    try {
      setRubric(await extractRubric(nofo, agency));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Processing failed');
    } finally {
      setBusy(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Step 2 — run reviews (now async with job polling)
  // ---------------------------------------------------------------------------
  const run = async () => {
    if (!nofo || !rubric) return;
    setBusy(true);
    setError('');
    try {
      const item: ReviewPackage = { agency, nofo, applications, rubric: supportRubric, worksheet };
      const result = await runSafeReviews(item, rubric);
      setCurrentReviewId(result.review_id);

      if (result.job_ids.length > 0) {
        // Async path — poll for progress
        const initial: AppProgress[] = result.job_ids.map((jobId, i) => ({
          jobId,
          applicationName: applications[i]?.name ?? 'Application ' + (i + 1),
          status: 'uploaded',
          progress: 0,
          message: 'Uploaded',
        }));
        setAppProgress(initial);
        setPolling(true);
      } else {
        // Legacy sync path — API returned reviews directly, fetch them
        const fetched = await getReviewResults(result.review_id);
        setReviews(fetched.reviews);
        setSelected(0);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review failed');
    } finally {
      setBusy(false);
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
      setAppProgress(prev => {
        const pending = prev.filter(p => p.status !== 'completed' && p.status !== 'failed');
        if (pending.length === 0) return prev;
        return prev;
      });

      // Poll all non-terminal jobs
      setAppProgress(prev => {
        const pending = prev.filter(p => p.status !== 'completed' && p.status !== 'failed');
        if (pending.length === 0) return prev;
        return prev; // actual update happens in the async block below
      });

      let updatedProgress: AppProgress[] = [];
      setAppProgress(prev => {
        updatedProgress = prev;
        return prev;
      });

      const pending = updatedProgress.filter(
        p => p.status !== 'completed' && p.status !== 'failed'
      );
      if (pending.length === 0) {
        stopPolling();
        // All done — fetch full results
        if (currentReviewId) {
          try {
            const fetched = await getReviewResults(currentReviewId);
            setReviews(fetched.reviews);
            setSelected(0);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to fetch results');
          }
        }
        return;
      }

      const updates = await Promise.allSettled(
        pending.map(p => pollJobStatus(p.jobId))
      );

      setAppProgress(prev =>
        prev.map(p => {
          const idx = pending.findIndex(x => x.jobId === p.jobId);
          if (idx === -1) return p;
          const result = updates[idx];
          if (result.status === 'fulfilled') {
            return {
              ...p,
              status: result.value.status,
              progress: result.value.progress ?? p.progress,
              message: result.value.message ?? p.message,
            };
          }
          return p;
        })
      );
    };

    pollRef.current = setInterval(tick, POLL_INTERVAL_MS);
    return () => stopPolling();
  }, [polling, currentReviewId, stopPolling]);

  // When all jobs complete, fetch results
  useEffect(() => {
    if (!polling) return;
    const allDone = appProgress.length > 0 &&
      appProgress.every(p => p.status === 'completed' || p.status === 'failed');
    if (allDone) {
      stopPolling();
      if (currentReviewId) {
        getReviewResults(currentReviewId)
          .then(fetched => { setReviews(fetched.reviews); setSelected(0); })
          .catch(e => setError(e instanceof Error ? e.message : 'Failed to fetch results'));
      }
    }
  }, [appProgress, polling, currentReviewId, stopPolling]);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const updatePoints = (index: number, points: number) => {
    if (!rubric) return;
    const criteria = [...rubric.criteria];
    criteria[index] = { ...criteria[index], points };
    setRubric({ ...rubric, criteria, total_points: criteria.reduce((s, c) => s + c.points, 0) });
  };

  const reset = async () => {
    stopPolling();
    // Delete the review from backend if we have an ID
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
    setError('');
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

  // ---------------------------------------------------------------------------
  // Progress status label
  // ---------------------------------------------------------------------------
  const statusLabel: Record<AppProgress['status'], string> = {
    uploaded: 'Uploaded',
    queued: 'Queued',
    processing: 'Processing',
    completed: 'Completed',
    failed: 'Failed',
  };
  const statusColor: Record<AppProgress['status'], string> = {
    uploaded: 'bg-slate-200 text-slate-700',
    queued: 'bg-amber-100 text-amber-800',
    processing: 'bg-blue-100 text-blue-800',
    completed: 'bg-emerald-100 text-emerald-800',
    failed: 'bg-red-100 text-red-800',
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#f4f7fc] text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white">
              <Brain />
            </div>
            <div>
              <h1 className="text-xl font-bold">Federal Grant Reviewer AI</h1>
              <p className="text-sm text-slate-500">Evidence-grounded analysis for federal grant applications</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
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

      {/* Step indicator */}
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-7 text-sm font-semibold">
        <span className={step === 'upload' ? 'text-blue-700' : 'text-emerald-700'}>
          <Upload className="mr-2 inline" size={20} />Upload Documents
        </span>
        <span className={step === 'rubric' ? 'text-blue-700' : 'text-slate-400'}>
          <BarChart3 className="mr-2 inline" size={20} />Approve Rubric
        </span>
        <span className={step === 'results' ? 'text-blue-700' : 'text-slate-400'}>
          <CheckCircle2 className="mr-2 inline" size={20} />Review Results
        </span>
      </div>

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
                <AlertTriangle />{error}
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

            {/* Progress cards (shown while polling) */}
            {polling && appProgress.length > 0 && (
              <div className="mt-6 space-y-3">
                <p className="font-bold text-slate-700">Processing applications…</p>
                {appProgress.map(p => (
                  <div key={p.jobId} className="rounded-lg border bg-white p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold truncate max-w-xs">{p.applicationName}</span>
                      <span className={'text-xs font-bold rounded-full px-3 py-1 ' + statusColor[p.status]}>
                        {statusLabel[p.status]}
                      </span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-slate-100">
                      <div
                        className="h-2 rounded-full bg-blue-600 transition-all duration-500"
                        style={{ width: p.progress + '%' }}
                      />
                    </div>
                    {p.message && <p className="mt-1 text-xs text-slate-500">{p.message}</p>}
                  </div>
                ))}
              </div>
            )}

            {error && <div className="mt-5 rounded-lg bg-red-50 p-4 text-red-800">{error}</div>}

            <div className="mt-6 flex justify-between">
              <button onClick={() => setRubric(null)} className="rounded-lg border px-5 py-3 font-semibold">
                Back
              </button>
              <button
                onClick={run}
                disabled={!rubric.approved || busy || polling}
                className="flex items-center gap-2 rounded-xl bg-blue-700 px-7 py-3 font-bold text-white disabled:opacity-40"
              >
                {busy || polling ? <Loader2 className="animate-spin" /> : <FileSearch />}
                {busy || polling ? 'Reviewing applications…' : 'Review ' + applications.length + ' uploaded bundle(s)'}
              </button>
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
                        {c.score} / {c.maximum_points}
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
                  {scoreTotal}
                  <span className="text-lg text-slate-400">
                    {' / ' + (current.maximum_score || current.criteria.reduce((s, c) => s + c.maximum_points, 0))}
                  </span>
                </p>
                <p className="mt-4 text-xs leading-5 text-slate-300">{current.certification}</p>

                {/* Worksheet download via signed URL */}
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
      </main>
    </div>
  );
};

export default SafeReviewDashboard;
