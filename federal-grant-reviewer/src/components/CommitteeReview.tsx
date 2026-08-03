import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, FileText, Flag, Loader2, Merge,
  Pencil, Printer, ShieldAlert, Trash2, Upload,
} from 'lucide-react';
import {
  ConsensusResult, ConsensusCriterion, ConsensusStatement,
  getConsensusResult, submitConsensusReview,
} from '../services/api';
import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Print styles — injected once into <head>
// ---------------------------------------------------------------------------
const PRINT_STYLE_ID = 'committee-review-print';
function ensurePrintStyles() {
  if (document.getElementById(PRINT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PRINT_STYLE_ID;
  style.textContent = `
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
      .print-break { page-break-before: always; }
      table { font-size: 11px; }
      td, th { padding: 4px 6px !important; }
      .rounded-xl, .rounded-lg, .rounded-2xl { border-radius: 0 !important; }
      .shadow, .shadow-sm, .shadow-lg, .shadow-2xl { box-shadow: none !important; }
    }
  `;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Action badge
// ---------------------------------------------------------------------------
function ActionBadge({ action }: { action: string }) {
  const styles: Record<string, string> = {
    KEEP: 'bg-emerald-100 text-emerald-800',
    MERGE: 'bg-amber-100 text-amber-800',
    REVISE: 'bg-blue-100 text-blue-800',
    REMOVE: 'bg-red-100 text-red-800',
  };
  const icons: Record<string, React.ReactNode> = {
    KEEP: <CheckCircle2 size={12} />,
    MERGE: <Merge size={12} />,
    REVISE: <Pencil size={12} />,
    REMOVE: <Trash2 size={12} />,
  };
  return (
    <span className={'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ' + (styles[action] || 'bg-slate-100 text-slate-800')}>
      {icons[action]} {action}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Statement table (shared for weaknesses / strengths / mets)
// ---------------------------------------------------------------------------
function StatementTable({ statements, headerColor }: { statements: ConsensusStatement[]; headerColor: string }) {
  if (statements.length === 0) return null;
  const bgMap: Record<string, string> = {
    red: 'bg-red-50', emerald: 'bg-emerald-50', slate: 'bg-slate-50',
  };
  const textMap: Record<string, string> = {
    red: 'text-red-900', emerald: 'text-emerald-900', slate: 'text-slate-700',
  };
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left">
        <thead className={bgMap[headerColor] || 'bg-slate-50'}>
          <tr>
            <th className={'px-3 py-2 text-xs font-bold ' + (textMap[headerColor] || '')}>#</th>
            <th className={'px-3 py-2 text-xs font-bold ' + (textMap[headerColor] || '')}>Combined Statement (verbatim)</th>
            <th className={'px-3 py-2 text-xs font-bold ' + (textMap[headerColor] || '')}>Reviewer</th>
            <th className={'px-3 py-2 text-xs font-bold ' + (textMap[headerColor] || '')}>Q</th>
            <th className={'px-3 py-2 text-xs font-bold ' + (textMap[headerColor] || '')}>Action</th>
            <th className={'px-3 py-2 text-xs font-bold ' + (textMap[headerColor] || '')}>Rationale</th>
          </tr>
        </thead>
        <tbody>
          {statements.map(s => (
            <tr key={s.number} className={'border-b last:border-0 ' + (s.action === 'REMOVE' ? 'bg-red-50/50' : s.action === 'MERGE' ? 'bg-amber-50/30' : '')}>
              <td className="px-3 py-3 align-top font-mono text-sm font-bold whitespace-nowrap">
                {s.number}
                {s.is_mine && (
                  <span className="ml-1 text-blue-600" title="Your statement">
                    <Flag size={14} className="inline" />
                  </span>
                )}
                {s.is_conflict && (
                  <span className="ml-1 text-orange-600" title="Conflict — strength vs weakness on same question">
                    <ShieldAlert size={14} className="inline" />
                  </span>
                )}
              </td>
              <td className="px-3 py-3 align-top text-sm leading-relaxed max-w-xl">
                <p className={s.action === 'REMOVE' ? 'line-through text-red-700' : ''}>
                  {s.verbatim_text}
                </p>
                {s.action === 'REVISE' && s.revised_text && (
                  <div className="mt-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-900 border border-blue-200">
                    <span className="font-semibold">Suggested revision: </span>
                    {s.revised_text}
                  </div>
                )}
                {s.action === 'MERGE' && s.merge_target && (
                  <p className="mt-1 text-xs text-amber-700 font-semibold">
                    Merge into {s.merge_target}
                  </p>
                )}
              </td>
              <td className="px-3 py-3 align-top text-sm text-slate-600">
                <div className="whitespace-nowrap font-semibold">{s.reviewer_citation}</div>
                {s.reviewer_references && (
                  <div className="text-xs text-slate-400 mt-0.5">{s.reviewer_references}</div>
                )}
              </td>
              <td className="px-3 py-3 align-top text-sm text-slate-500 whitespace-nowrap">{s.worksheet_question}</td>
              <td className="px-3 py-3 align-top"><ActionBadge action={s.action} /></td>
              <td className="px-3 py-3 align-top text-sm text-slate-600 max-w-xs">{s.rationale}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Criterion section
// ---------------------------------------------------------------------------
function CriterionSection({ crit }: { crit: ConsensusCriterion }) {
  return (
    <div className="mb-8 print-break">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold">
          {crit.criterion_name} ({crit.maximum_points} pts)
        </h3>
        <span className="text-sm font-semibold text-slate-500">
          Score range: {crit.score_range}
        </span>
      </div>

      {/* Worksheet questions */}
      <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm">
        <p className="font-semibold text-slate-700 mb-1">Reviewer Worksheet Questions:</p>
        {crit.worksheet_questions.map(q => (
          <p key={q.id} className="text-slate-600 ml-2">
            <span className="font-semibold">{q.id}:</span> {q.text}
          </p>
        ))}
      </div>

      {/* Weaknesses first per HRSA protocol */}
      {crit.weaknesses.length > 0 && (
        <div className="mb-4">
          <h4 className="font-bold text-red-800 mb-2 text-sm uppercase tracking-wide">
            Weaknesses ({crit.weaknesses.length})
          </h4>
          <StatementTable statements={crit.weaknesses} headerColor="red" />
        </div>
      )}

      {/* Strengths */}
      {crit.strengths.length > 0 && (
        <div className="mb-4">
          <h4 className="font-bold text-emerald-800 mb-2 text-sm uppercase tracking-wide">
            Strengths ({crit.strengths.length})
          </h4>
          <StatementTable statements={crit.strengths} headerColor="emerald" />
        </div>
      )}

      {/* Mets */}
      {crit.mets.length > 0 && (
        <div className="mb-4">
          <h4 className="font-bold text-slate-700 mb-2 text-sm uppercase tracking-wide">
            Met ({crit.mets.length})
          </h4>
          <StatementTable statements={crit.mets} headerColor="slate" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Criteria tabs — click a criterion to show only that one
// ---------------------------------------------------------------------------
function CriteriaTabs({ criteria }: { criteria: ConsensusCriterion[] }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const active = criteria[activeIdx];
  if (!active) return null;

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 mb-4 overflow-x-auto no-print">
        {criteria.map((crit, i) => {
          const totalFindings = crit.weaknesses.length + crit.strengths.length + crit.mets.length;
          const removals = [...crit.weaknesses, ...crit.strengths, ...crit.mets].filter(s => s.action === 'REMOVE').length;
          return (
            <button
              key={crit.criterion_name}
              onClick={() => setActiveIdx(i)}
              className={
                'shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ' +
                (i === activeIdx
                  ? 'bg-blue-700 text-white'
                  : 'bg-white border text-slate-600 hover:bg-slate-50')
              }
            >
              {crit.criterion_name}
              <span className="ml-1 text-xs opacity-70">
                ({totalFindings}{removals > 0 ? ', -' + removals : ''})
              </span>
            </button>
          );
        })}
      </div>

      {/* Active criterion */}
      <CriterionSection crit={active} />

      {/* Print: show all criteria */}
      <div className="hidden print:block">
        {criteria.filter((_, i) => i !== activeIdx).map(crit => (
          <CriterionSection key={crit.criterion_name} crit={crit} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component — standalone page (reads reviewId + applicationId from hash)
// ---------------------------------------------------------------------------
export default function CommitteeReview() {
  // Parse IDs from URL hash: #/consensus/{reviewId}/{applicationId}
  const hash = window.location.hash;
  const match = hash.match(/^#\/consensus\/([a-z0-9-]+)\/([a-z0-9-]+)$/);
  const reviewId = match?.[1] || '';
  const applicationId = match?.[2] || '';

  const [applicantName, setApplicantName] = useState('');
  const [agency, setAgency] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [reviewerName, setReviewerName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [result, setResult] = useState<ConsensusResult | null>(null);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Analysis phase — drives the status bar
  type Phase = 'uploading' | 'extracting' | 'validating' | 'consolidating' | 'complete';
  const [phase, setPhase] = useState<Phase>('uploading');

  // Elapsed timer — starts when polling starts, stops on result
  useEffect(() => {
    if (polling && !result) {
      setElapsedSec(0);
      const t = setInterval(() => setElapsedSec(s => s + 1), 1000);
      timerRef.current = t;
      return () => clearInterval(t);
    }
    if (timerRef.current) clearInterval(timerRef.current);
  }, [polling, result]);

  // Phase progression based on elapsed time (approximate)
  useEffect(() => {
    if (!polling) return;
    if (elapsedSec < 5) setPhase('uploading');
    else if (elapsedSec < 20) setPhase('extracting');
    else if (elapsedSec < 60) setPhase('validating');
    else setPhase('consolidating');
  }, [elapsedSec, polling]);

  useEffect(() => {
    if (result) setPhase('complete');
  }, [result]);

  // Inject print styles
  useEffect(() => { ensurePrintStyles(); }, []);

  // Load application metadata
  useEffect(() => {
    if (!applicationId || !reviewId) return;
    (async () => {
      const { data: app } = await supabase
        .from('applications')
        .select('filename')
        .eq('id', applicationId)
        .single();
      if (app?.filename) setApplicantName(app.filename.replace(/\.pdf$/i, ''));

      const { data: review } = await supabase
        .from('grant_reviews')
        .select('agency')
        .eq('id', reviewId)
        .single();
      if (review?.agency) setAgency(review.agency);
    })();
  }, [applicationId, reviewId]);

  // Poll for results
  const startPolling = useCallback((appId: string) => {
    setPolling(true);
    const poll = setInterval(async () => {
      try {
        const res = await getConsensusResult(appId);
        if (res.status === 'completed' && res.result) {
          setResult(res.result);
          setPolling(false);
          clearInterval(poll);
        } else if (res.status === 'failed') {
          setError(res.error || 'Consensus review failed');
          setPolling(false);
          clearInterval(poll);
        }
      } catch {
        // keep polling
      }
    }, 5000);
    pollRef.current = poll;
  }, []);

  // Check for existing result on mount
  useEffect(() => {
    if (!applicationId) return;
    (async () => {
      try {
        const res = await getConsensusResult(applicationId);
        if (res.status === 'completed' && res.result) {
          setResult(res.result);
        } else if (res.status === 'processing') {
          startPolling(applicationId);
        }
      } catch {
        // no existing result
      }
    })();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [applicationId, startPolling]);

  const handleSubmit = async () => {
    if (!file) return;
    setSubmitting(true);
    setError('');
    try {
      await submitConsensusReview(reviewId, applicationId, file, reviewerName);
      startPolling(applicationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  // No valid IDs
  if (!reviewId || !applicationId) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="bg-white rounded-xl p-8 shadow text-center">
          <AlertTriangle size={40} className="mx-auto text-amber-500 mb-4" />
          <h2 className="text-xl font-bold mb-2">Invalid URL</h2>
          <p className="text-slate-500">Missing review or application ID in the URL.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-white border-b px-8 py-5 flex items-center justify-between no-print">
        <div>
          <h1 className="text-2xl font-bold">Committee Consensus Review</h1>
          <p className="text-slate-500 mt-0.5">
            {applicantName || 'Loading...'} &middot; {agency}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {result && (
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              <Printer size={16} /> Print
            </button>
          )}
          <a
            href={'#/reviews/' + reviewId}
            className="rounded-lg border px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Back to Review
          </a>
        </div>
      </header>

      {/* Print-only header */}
      <div className="hidden print:block px-8 py-4 border-b">
        <h1 className="text-xl font-bold">Committee Consensus Review</h1>
        <p className="text-sm text-slate-600">
          {applicantName} &middot; {agency} &middot; {new Date().toLocaleDateString()}
        </p>
      </div>

      <main className="max-w-7xl mx-auto px-8 py-6">
        {/* Upload form — show if no result yet */}
        {!result && !polling && (
          <div className="max-w-xl mx-auto no-print">
            <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
              <FileText size={40} className="mx-auto text-slate-400 mb-4" />
              <h3 className="text-lg font-bold mb-2">Upload Combined Statements</h3>
              <p className="text-slate-500 text-sm mb-4">
                Upload the combined reviewer statements PDF for this application.
                The tool will validate each statement against the NOFO worksheet questions.
              </p>

              <div className="mb-4 text-left">
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Your reviewer name (for flagging your statements)
                </label>
                <input
                  type="text"
                  value={reviewerName}
                  onChange={e => setReviewerName(e.target.value)}
                  placeholder="e.g. Reviewer A, Dr. T"
                  className="w-full rounded-lg border px-4 py-2 text-sm"
                />
              </div>

              <div className="mb-4 text-left">
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Combined statement PDF
                </label>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                  className="w-full text-sm"
                />
                {file && (
                  <p className="mt-1 text-xs text-slate-500">{file.name} ({(file.size / 1024).toFixed(0)} KB)</p>
                )}
              </div>

              <button
                onClick={handleSubmit}
                disabled={!file || submitting}
                className="flex items-center gap-2 mx-auto rounded-xl bg-blue-700 px-6 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-40"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                {submitting ? 'Submitting...' : 'Run Consensus Review'}
              </button>
            </div>
          </div>
        )}

        {/* Status bar — visible during processing */}
        {(polling || submitting) && !result && (
          <div className="max-w-2xl mx-auto mb-8 no-print">
            <div className="rounded-xl bg-white border shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">Analyzing Combined Statements</h3>
                <span className="text-sm text-slate-500 font-mono">
                  {Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, '0')}
                </span>
              </div>

              {/* Step indicators */}
              <div className="flex gap-1 mb-4">
                {([
                  { key: 'uploading', label: 'Upload' },
                  { key: 'extracting', label: 'OCR & Extract' },
                  { key: 'validating', label: 'Validate vs NOFO' },
                  { key: 'consolidating', label: 'Consolidate' },
                  { key: 'complete', label: 'Complete' },
                ] as { key: Phase; label: string }[]).map((step, i, arr) => {
                  const currentIdx = arr.findIndex(s => s.key === phase);
                  const isPast = i < currentIdx;
                  const isActive = i === currentIdx;
                  return (
                    <div key={step.key} className="flex-1">
                      <div className={'h-2 rounded-full transition-all duration-500 ' + (
                        isActive ? 'bg-blue-600 animate-pulse' :
                        isPast ? 'bg-emerald-500' :
                        'bg-slate-200'
                      )} />
                      <p className={'mt-1 text-xs font-semibold text-center ' + (
                        isActive ? 'text-blue-700' :
                        isPast ? 'text-emerald-700' :
                        'text-slate-400'
                      )}>{step.label}</p>
                    </div>
                  );
                })}
              </div>

              {/* Status message */}
              <div className="flex items-center gap-3 text-sm text-slate-600">
                <Loader2 size={16} className="animate-spin text-blue-600 shrink-0" />
                {phase === 'uploading' && 'Uploading combined statement PDF...'}
                {phase === 'extracting' && 'Extracting text from combined statements (OCR if scanned)...'}
                {phase === 'validating' && 'Validating each statement against NOFO worksheet questions...'}
                {phase === 'consolidating' && 'Consolidating findings — identifying duplicates, weak statements...'}
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4 mb-6 flex items-start gap-3">
            <AlertTriangle size={20} className="text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-800">Error</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <div>
            {/* Summary cards */}
            <div className="grid grid-cols-6 gap-3 mb-6">
              <div className="rounded-xl bg-white p-4 text-center border">
                <p className="text-2xl font-bold">{result.summary.total_findings}</p>
                <p className="text-xs text-slate-500 font-semibold">Total</p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-4 text-center border border-emerald-200">
                <p className="text-2xl font-bold text-emerald-700">{result.summary.keep_count}</p>
                <p className="text-xs text-emerald-600 font-semibold">KEEP</p>
              </div>
              <div className="rounded-xl bg-amber-50 p-4 text-center border border-amber-200">
                <p className="text-2xl font-bold text-amber-700">{result.summary.merge_count}</p>
                <p className="text-xs text-amber-600 font-semibold">MERGE</p>
              </div>
              <div className="rounded-xl bg-blue-50 p-4 text-center border border-blue-200">
                <p className="text-2xl font-bold text-blue-700">{result.summary.revise_count}</p>
                <p className="text-xs text-blue-600 font-semibold">REVISE</p>
              </div>
              <div className="rounded-xl bg-red-50 p-4 text-center border border-red-200">
                <p className="text-2xl font-bold text-red-700">{result.summary.remove_count}</p>
                <p className="text-xs text-red-600 font-semibold">REMOVE</p>
              </div>
              <div className="rounded-xl bg-white p-4 text-center border">
                <p className="text-2xl font-bold">{result.summary.findings_after_consolidation}</p>
                <p className="text-xs text-slate-500 font-semibold">After consolidation</p>
              </div>
            </div>

            {/* Score + motion + budget */}
            <div className="flex items-center gap-4 mb-6 flex-wrap">
              <div className="rounded-xl bg-blue-700 text-white px-5 py-3">
                <p className="text-xs font-semibold opacity-80">Suggested Score</p>
                <p className="text-xl font-bold">{result.summary.suggested_score_range}</p>
              </div>
              <div className="rounded-xl border bg-white px-5 py-3">
                <p className="text-xs font-semibold text-slate-500">Motion</p>
                <p className="text-sm font-bold">
                  {result.summary.motion.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </p>
              </div>
              <div className="rounded-xl border bg-white px-5 py-3">
                <p className="text-xs font-semibold text-slate-500">Budget</p>
                <p className="text-sm font-bold">
                  {result.budget_recommendation.recommendation.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </p>
                {result.budget_recommendation.rationale && (
                  <p className="text-xs text-slate-500 mt-0.5">{result.budget_recommendation.rationale}</p>
                )}
              </div>
              <div className="flex items-center gap-3 ml-auto text-sm text-slate-500">
                <span className="flex items-center gap-1"><Flag size={14} className="text-blue-600" /> Your statement</span>
                <span className="flex items-center gap-1"><ShieldAlert size={14} className="text-orange-600" /> Conflict</span>
              </div>
            </div>

            {/* Criteria tabs */}
            <CriteriaTabs criteria={result.criteria} />

            {/* Footer */}
            <div className="mt-8 pt-6 border-t flex items-center justify-between">
              <p className="text-xs text-slate-400">
                {result.certification}
              </p>
              <button
                onClick={() => { setResult(null); setFile(null); setError(''); }}
                className="rounded-lg border px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 no-print"
              >
                Re-run with different document
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
