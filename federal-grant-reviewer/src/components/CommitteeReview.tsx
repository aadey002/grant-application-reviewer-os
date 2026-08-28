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
function StatementTable({ statements, headerColor, applicationId, criterionName }: { statements: ConsensusStatement[]; headerColor: string; applicationId: string; criterionName: string }) {
  if (statements.length === 0) return null;
  const bgMap: Record<string, string> = {
    red: 'bg-red-50', emerald: 'bg-emerald-50', slate: 'bg-slate-50',
  };
  const textMap: Record<string, string> = {
    red: 'text-red-900', emerald: 'text-emerald-900', slate: 'text-slate-700',
  };

  // Group by subcriterion if any statements have one
  const hasSubs = statements.some(s => s.subcriterion && s.subcriterion.trim());
  const groups: Array<{ label: string; items: ConsensusStatement[] }> = [];
  if (hasSubs) {
    const seen = new Map<string, ConsensusStatement[]>();
    for (const s of statements) {
      const key = s.subcriterion?.trim() || '(General)';
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key)!.push(s);
    }
    for (const [label, items] of seen) groups.push({ label, items });
  } else {
    groups.push({ label: '', items: statements });
  }

  const thClass = 'px-3 py-2 text-xs font-bold ' + (textMap[headerColor] || '');

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left">
        <thead className={bgMap[headerColor] || 'bg-slate-50'}>
          <tr>
            <th className={thClass}>#</th>
            <th className={thClass}>Combined Statement (verbatim)</th>
            <th className={thClass}>Reviewer</th>
            <th className={thClass}>Q</th>
            <th className={thClass}>Action</th>
            <th className={thClass}>Rationale</th>
            <th className={thClass}>Chair Comments</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(group => (<React.Fragment key={group.label}>
            {group.label && (
              <tr>
                <td colSpan={7} className="px-3 py-2 bg-indigo-50 border-t border-b border-indigo-200">
                  <span className="text-xs font-bold text-indigo-800 uppercase tracking-wide">{group.label}</span>
                </td>
              </tr>
            )}
            {group.items.map(s => (
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
                {s.nofo_requirement_text && (
                  <div className="mt-2 rounded-lg bg-indigo-50 p-2 text-xs text-indigo-900 border border-indigo-200">
                    <span className="font-semibold">NOFO: </span>
                    <span className="italic">{s.nofo_requirement_text}</span>
                  </div>
                )}
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
                {s.is_conflict && (
                  <div className="mt-2 rounded-lg bg-orange-50 p-2 text-xs text-orange-900 border border-orange-200">
                    <ShieldAlert size={12} className="inline mr-1" />
                    <span className="font-semibold">CONFLICT: </span>
                    This question has conflicting assessments from different reviewers. Chair should discuss.
                  </div>
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
              <td className="px-3 py-3 align-top text-sm text-slate-600 max-w-xs">
                {/* Feature 6: INTEL tag when rationale references intelligence data */}
                {/budget|formula|verified|intelligence|IDC|salary cap|FTE|scholarship|prior award|discipline/i.test(s.rationale || '') && (
                  <span className="inline-block rounded bg-purple-700 text-white px-1.5 py-0.5 text-[8px] font-bold mr-1 align-middle">INTEL</span>
                )}
                {s.rationale}
              </td>
              <td className="px-3 py-3 align-top">
                <textarea
                  className="w-full text-xs border rounded p-1.5 min-h-[60px] resize-y bg-amber-50 focus:bg-white focus:ring-1 focus:ring-blue-400 no-print"
                  placeholder="Chair comments..."
                  defaultValue={(() => { try { const k = 'cc_' + applicationId; const d = JSON.parse(localStorage.getItem(k) || '{}'); return d[criterionName + '_' + s.number] || ''; } catch { return ''; } })()}
                  onBlur={(e) => { try { const k = 'cc_' + applicationId; const d = JSON.parse(localStorage.getItem(k) || '{}'); d[criterionName + '_' + s.number] = e.target.value; localStorage.setItem(k, JSON.stringify(d)); } catch {} }}
                />
              </td>
            </tr>
          ))}
          </React.Fragment>))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Criterion section
// ---------------------------------------------------------------------------
function CriterionSection({ crit, applicationId }: { crit: ConsensusCriterion; applicationId: string }) {
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

      {/* Feature 4: NOFO Evaluation Questions with coverage badges */}
      <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm">
        <p className="font-semibold text-slate-700 mb-1 text-xs uppercase">NOFO Evaluation Questions</p>
        {crit.worksheet_questions.map(q => {
          const allStmts = [...crit.strengths, ...crit.mets, ...crit.weaknesses];
          const hasWeakness = crit.weaknesses.some(w => w.worksheet_question === q.id);
          const hasCoverage = allStmts.some(s => s.worksheet_question === q.id);
          const badgeCls = hasWeakness ? 'bg-amber-100 text-amber-800' : hasCoverage ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800';
          const badgeText = hasWeakness ? 'WEAKNESS' : hasCoverage ? 'COVERED' : 'GAP';
          return (
            <div key={q.id} className="flex items-center gap-2 py-1 border-b border-slate-100 last:border-0">
              <span className="font-mono font-bold text-slate-500 text-xs w-6">{q.id}</span>
              <span className="text-slate-600 flex-1">{q.text}</span>
              <span className={'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ' + badgeCls}>{badgeText}</span>
            </div>
          );
        })}
      </div>

      {/* Weaknesses first per HRSA protocol */}
      {crit.weaknesses.length > 0 && (
        <div className="mb-4">
          <h4 className="font-bold text-red-800 mb-2 text-sm uppercase tracking-wide">
            Weaknesses ({crit.weaknesses.length})
          </h4>
          <StatementTable statements={crit.weaknesses} headerColor="red" applicationId={applicationId} criterionName={crit.criterion_name} />
        </div>
      )}

      {/* Strengths */}
      {crit.strengths.length > 0 && (
        <div className="mb-4">
          <h4 className="font-bold text-emerald-800 mb-2 text-sm uppercase tracking-wide">
            Strengths ({crit.strengths.length})
          </h4>
          <StatementTable statements={crit.strengths} headerColor="emerald" applicationId={applicationId} criterionName={crit.criterion_name} />
        </div>
      )}

      {/* Mets */}
      {crit.mets.length > 0 && (
        <div className="mb-4">
          <h4 className="font-bold text-slate-700 mb-2 text-sm uppercase tracking-wide">
            Met ({crit.mets.length})
          </h4>
          <StatementTable statements={crit.mets} headerColor="slate" applicationId={applicationId} criterionName={crit.criterion_name} />
        </div>
      )}

      {/* Feature 5: Coverage Gap Callouts */}
      {(() => {
        const allStmts = [...crit.strengths, ...crit.mets, ...crit.weaknesses];
        const gaps = crit.worksheet_questions.filter(q => !allStmts.some(s => s.worksheet_question === q.id));
        if (gaps.length === 0) return null;
        return (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 mt-2">
            <p className="text-xs font-bold text-red-800 mb-1">⚠ Coverage Gap — {gaps.length} unanswered NOFO question{gaps.length > 1 ? 's' : ''}</p>
            {gaps.map(g => (
              <p key={g.id} className="text-xs text-red-700 ml-2"><span className="font-mono font-bold">{g.id}:</span> {g.text}</p>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Criteria tabs — click a criterion to show only that one
// ---------------------------------------------------------------------------
function CriteriaTabs({ criteria, applicationId }: { criteria: ConsensusCriterion[]; applicationId: string }) {
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
      <CriterionSection crit={active} applicationId={applicationId} />

      {/* Print: show all criteria */}
      <div className="hidden print:block">
        {criteria.filter((_, i) => i !== activeIdx).map(crit => (
          <CriterionSection key={crit.criterion_name} crit={crit} applicationId={applicationId} />
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
  const [fullResult, setFullResult] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const [reviewerName, setReviewerName] = useState('');
  const [pageLimit, setPageLimit] = useState(60);
  const [submitting, setSubmitting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [result, setResult] = useState<ConsensusResult | null>(null);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [cleared, setCleared] = useState(false);
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
        .select('filename,full_result,applicant_name')
        .eq('id', applicationId)
        .single();
      if (app?.applicant_name) setApplicantName(app.applicant_name);
      else if (app?.filename) setApplicantName(app.filename.replace(/\.pdf$/i, ''));
      if (app?.full_result) {
        let fr = app.full_result;
        if (typeof fr === 'string') { try { fr = JSON.parse(fr); } catch {} }
        if (typeof fr === 'string') { try { fr = JSON.parse(fr); } catch {} }
        setFullResult(fr);
      }

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

  // Check for existing result on mount (skip if user just cleared)
  useEffect(() => {
    if (!applicationId || cleared) return;
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
  }, [applicationId, startPolling, cleared]);

  const handleSubmit = async () => {
    if (!file) return;
    setSubmitting(true);
    setError('');
    setCleared(false);
    try {
      await submitConsensusReview(reviewId, applicationId, file, reviewerName, pageLimit);
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
      {/* Dark Header Bar */}
      <header className="bg-slate-800 text-white px-8 py-5 no-print">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Committee Consensus Review</h1>
              <p className="text-slate-300 text-sm mt-0.5">
                {applicantName || 'Loading...'} {fullResult?.project_name ? '— ' + fullResult.project_name : ''} {fullResult?.discipline ? '— ' + fullResult.discipline : ''} &middot; {agency}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {result && <div className="rounded-lg bg-blue-100 text-blue-900 px-4 py-2 font-bold text-lg">{result.summary.suggested_score_range}</div>}
              {result && (
                <button onClick={() => window.print()} className="flex items-center gap-2 rounded-lg bg-white/10 border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20">
                  <Printer size={16} /> Print
                </button>
              )}
              <a href={'#/reviews/' + reviewId} className="rounded-lg bg-white/10 border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
          >
            Back to Review
          </a>
            </div>
          </div>
          <div className="flex gap-4 mt-3 text-xs text-slate-400 border-t border-slate-700 pt-3 flex-wrap">
            <span><strong>NOFO:</strong> {fullResult?.application_number || agency}</span>
            <span><strong>Agency:</strong> {agency}</span>
            <span><strong>My Initials:</strong> AOR</span>
            <span><strong>Date:</strong> {new Date().toLocaleDateString()}</span>
            {fullResult?.period_of_performance?.start_date && (
              <span><strong>Period:</strong> {fullResult.period_of_performance.start_date} – {fullResult.period_of_performance.end_date} ({fullResult.period_of_performance.years} yrs)</span>
            )}
          </div>
          {/* Per-year funding row */}
          {(() => {
            const funding = fullResult?.budget?.annual_requested_funding || fullResult?.budget?.annual_recommended_funding;
            const total = fullResult?.budget?.total_requested;
            if (!funding || funding.length === 0) return null;
            return (
              <div className="flex gap-3 mt-2 text-xs flex-wrap">
                {funding.map((amt: number | null, i: number) => amt != null && (
                  <span key={i} className="rounded bg-blue-900/50 px-2 py-1 font-mono font-semibold text-blue-200">Yr {i+1}: ${amt.toLocaleString()}</span>
                ))}
                {total != null && <span className="rounded bg-blue-800 px-2 py-1 font-mono font-bold text-white">Total: ${total.toLocaleString()}</span>}
              </div>
            );
          })()}
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
                  NOFO page limit
                </label>
                <input
                  type="number"
                  value={pageLimit}
                  onChange={e => setPageLimit(parseInt(e.target.value) || 0)}
                  min={0}
                  className="w-24 rounded-lg border px-4 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Statements citing pages past this limit will be flagged for removal. Set 0 to disable.
                </p>
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
                <p className="mt-2 text-xs text-blue-600">
                  <Flag size={12} className="inline mr-1" />
                  Your statements will be auto-detected from your stored review and flagged automatically.
                </p>
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
            {/* Feature 2: Reviewer Intelligence Panel */}
            {fullResult?.reviewer_intelligence && fullResult.reviewer_intelligence.length > 0 && (
              <div className="rounded-xl border-2 border-purple-200 bg-purple-50/30 p-4 mb-6">
                <h4 className="text-sm font-bold text-purple-800 mb-3 flex items-center gap-2">
                  <span>🔍</span> Reviewer Intelligence — Used for Statement Validation
                </h4>
                {fullResult.reviewer_intelligence.map((item: any, i: number) => {
                  const catColors: Record<string, string> = {
                    'PRIOR AWARD': 'bg-emerald-100 text-emerald-800', 'ACCREDITATION': 'bg-amber-100 text-amber-800',
                    'DATA CONSISTENCY': 'bg-blue-100 text-blue-800', 'BUDGET FORMULA': 'bg-emerald-100 text-emerald-800',
                    'VERB COMPLIANCE': 'bg-indigo-100 text-indigo-800', 'POSITIONING': 'bg-purple-100 text-purple-800',
                    'SUSTAINABILITY': 'bg-amber-100 text-amber-800', 'DOJ COMPLIANCE': 'bg-emerald-100 text-emerald-800',
                    'DISCIPLINE MISMATCH': 'bg-red-100 text-red-800', 'CROSS-REFERENCE': 'bg-blue-100 text-blue-800',
                  };
                  return (
                    <div key={i} className="flex items-start gap-2 py-2 border-b border-purple-100 last:border-0 text-sm">
                      <span className={'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ' + (catColors[item.category] || 'bg-slate-100 text-slate-600')}>{item.category}</span>
                      <div><span className="font-semibold text-slate-800">{item.finding}</span> <span className="text-slate-500">{item.detail}</span></div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Feature 3: Budget Verification Compact */}
            {(() => {
              let bv = fullResult?.budget_verification;
              if (typeof bv === 'string') { try { bv = JSON.parse(bv); } catch { bv = null; } }
              if (!bv) return null;
              const fmt = (n: any) => n != null ? '$' + Number(n).toLocaleString() : '—';
              const PassB = () => <span className="rounded bg-emerald-100 text-emerald-800 px-1 py-0.5 text-[9px] font-bold">PASS</span>;
              const FailB = () => <span className="rounded bg-red-100 text-red-800 px-1 py-0.5 text-[9px] font-bold">FAIL</span>;
              const Check = ({ v, lim }: { v: any; lim: number }) => v == null ? <span className="text-xs text-slate-400">—</span> : v <= lim ? <PassB /> : <FailB />;
              const annual = fullResult?.budget?.annual_requested_funding || [];
              return (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50/50 p-4 mb-6">
                  <h4 className="text-xs font-bold text-emerald-900 mb-3">Budget Verification — <span className="text-emerald-600">{(bv.unallowable_amount || 0) === 0 ? 'ALL PASS ✓' : 'REVIEW NEEDED'}</span></h4>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
                    <div className="bg-white rounded-lg border border-emerald-200 p-2"><div className="text-[9px] font-bold text-slate-500 uppercase">PD FTE</div><div className="font-mono font-bold">{bv.pd_fte_pct != null ? bv.pd_fte_pct + '%' : '—'} <Check v={bv.pd_fte_pct} lim={25} /></div><div className="text-[9px] text-slate-400">≤ 25%</div></div>
                    <div className="bg-white rounded-lg border border-emerald-200 p-2"><div className="text-[9px] font-bold text-slate-500 uppercase">PD Salary</div><div className="font-mono font-bold">{fmt(bv.pd_salary_rate_used ?? bv.pd_base_salary)} <Check v={bv.pd_salary_rate_used ?? bv.pd_base_salary} lim={228000} /></div><div className="text-[9px] text-slate-400">≤ $228,000</div></div>
                    <div className="bg-white rounded-lg border border-emerald-200 p-2"><div className="text-[9px] font-bold text-slate-500 uppercase">IDC</div><div className="font-mono font-bold">{bv.idc_rate_pct != null ? bv.idc_rate_pct + '%' : '—'} <Check v={bv.idc_rate_pct} lim={8} /></div><div className="text-[9px] text-slate-400">on {fmt(bv.pd_total)}</div></div>
                    {bv.per_student_amount != null && bv.per_student_amount > 0 && (
                      <div className="bg-white rounded-lg border border-emerald-200 p-2"><div className="text-[9px] font-bold text-slate-500 uppercase">Per-Student</div><div className="font-mono font-bold">{fmt(bv.per_student_amount)} <Check v={bv.per_student_amount} lim={40000} /></div><div className="text-[9px] text-slate-400">≤ $40,000</div></div>
                    )}
                    <div className="bg-white rounded-lg border border-emerald-200 p-2"><div className="text-[9px] font-bold text-slate-500 uppercase">Annual</div><div className="font-mono font-bold">{annual[0] != null ? fmt(annual[0]) : '—'} <Check v={annual[0]} lim={bv.annual_ceiling || 650000} /></div><div className="text-[9px] text-slate-400">≤ {fmt(bv.annual_ceiling || 650000)}</div></div>
                    <div className="bg-white rounded-lg border border-emerald-200 p-2"><div className="text-[9px] font-bold text-slate-500 uppercase">Unallowable</div><div className="font-mono font-bold">{fmt(bv.unallowable_amount ?? 0)} {(bv.unallowable_amount || 0) === 0 ? <PassB /> : <FailB />}</div><div className="text-[9px] text-slate-400">{(bv.unallowable_amount || 0) === 0 ? 'None' : 'Found'}</div></div>
                  </div>
                </div>
              );
            })()}

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
                {/* Feature 7: Per-year funding in budget chip */}
                {(() => {
                  const funding = fullResult?.budget?.annual_requested_funding;
                  if (!funding || funding.length === 0) return null;
                  return <p className="text-xs text-slate-500 mt-0.5 font-mono">${funding[0]?.toLocaleString()}/yr × {funding.length} = ${(fullResult?.budget?.total_requested || funding.reduce((a: number, b: number) => a + (b || 0), 0)).toLocaleString()}</p>;
                })()}
                {result.budget_recommendation.rationale && (
                  <p className="text-xs text-slate-500 mt-0.5">{result.budget_recommendation.rationale}</p>
                )}
              </div>
              <div className="flex items-center gap-3 ml-auto text-sm text-slate-500">
                <span className="flex items-center gap-1"><Flag size={14} className="text-blue-600" /> Your statement</span>
                <span className="flex items-center gap-1"><ShieldAlert size={14} className="text-orange-600" /> Conflict</span>
              </div>
            </div>

            {/* Missing questions alert */}
            {result.summary.missing_questions && result.summary.missing_questions.length > 0 && (
              <div className="rounded-xl bg-amber-50 border border-amber-300 p-4 mb-6">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-amber-900">Unanswered Worksheet Questions</p>
                    <p className="text-sm text-amber-800 mb-2">The following NOFO requirements have no reviewer feedback from any reviewer:</p>
                    <div className="space-y-1">
                      {result.summary.missing_questions.map((mq, i) => (
                        <div key={i} className="text-sm">
                          <span className="font-mono font-bold text-amber-700">{mq.criterion} — {mq.question_id}:</span>{' '}
                          <span className="text-amber-900">{mq.question_text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Criteria tabs */}
            <CriteriaTabs criteria={result.criteria} applicationId={applicationId} />

            {/* Feature 8: Voting Result Section */}
            <div className="mt-6 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 text-center mb-6">
              <p className="text-sm font-bold text-emerald-900">Panel Vote</p>
              <p className="text-2xl font-bold text-emerald-700 my-2">— / — Approve</p>
              <p className="text-xs text-emerald-600">Vote recorded after panel discussion</p>
            </div>

            {/* Footer */}
            <div className="mt-8 pt-6 border-t flex items-center justify-between">
              <p className="text-xs text-slate-400">
                {result.certification}
              </p>
              <button
                onClick={async () => {
                  // Clear DB consensus state so a fresh upload can run
                  try {
                    await supabase.from('applications').update({
                      consensus_result: null,
                      consensus_status: null,
                      consensus_error: null,
                    }).eq('id', applicationId);
                  } catch { /* best effort */ }
                  setResult(null);
                  setFile(null);
                  setError('');
                  setPolling(false);
                  setCleared(true);
                }}
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
