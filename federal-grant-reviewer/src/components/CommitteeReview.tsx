import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, FileText, Flag, Loader2, Merge,
  Pencil, Trash2, Upload, X,
} from 'lucide-react';
import {
  ConsensusResult, ConsensusCriterion, ConsensusStatement,
  getConsensusResult, submitConsensusReview,
} from '../services/api';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface CommitteeReviewProps {
  reviewId: string;
  applicationId: string;
  applicantName: string;
  agency: string;
  onClose: () => void;
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
// Statement row
// ---------------------------------------------------------------------------
function StatementRow({ s }: { s: ConsensusStatement }) {
  return (
    <tr className={'border-b last:border-0 ' + (s.action === 'REMOVE' ? 'bg-red-50/50' : s.action === 'MERGE' ? 'bg-amber-50/30' : '')}>
      <td className="px-3 py-3 align-top font-mono text-sm font-bold whitespace-nowrap">
        {s.number}
        {s.is_mine && (
          <span className="ml-1 text-blue-600" title="Your statement">
            <Flag size={14} className="inline" />
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
      <td className="px-3 py-3 align-top text-sm text-slate-600 whitespace-nowrap">{s.reviewer_citation}</td>
      <td className="px-3 py-3 align-top text-sm text-slate-500 whitespace-nowrap">{s.worksheet_question}</td>
      <td className="px-3 py-3 align-top"><ActionBadge action={s.action} /></td>
      <td className="px-3 py-3 align-top text-sm text-slate-600 max-w-xs">{s.rationale}</td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Criterion section
// ---------------------------------------------------------------------------
function CriterionSection({ crit }: { crit: ConsensusCriterion }) {
  return (
    <div className="mb-8">
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
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-left">
              <thead className="bg-red-50">
                <tr>
                  <th className="px-3 py-2 text-xs font-bold text-red-900">#</th>
                  <th className="px-3 py-2 text-xs font-bold text-red-900">Combined Statement (verbatim)</th>
                  <th className="px-3 py-2 text-xs font-bold text-red-900">Reviewer</th>
                  <th className="px-3 py-2 text-xs font-bold text-red-900">Q</th>
                  <th className="px-3 py-2 text-xs font-bold text-red-900">Action</th>
                  <th className="px-3 py-2 text-xs font-bold text-red-900">Rationale</th>
                </tr>
              </thead>
              <tbody>
                {crit.weaknesses.map(s => <StatementRow key={s.number} s={s} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Strengths */}
      {crit.strengths.length > 0 && (
        <div className="mb-4">
          <h4 className="font-bold text-emerald-800 mb-2 text-sm uppercase tracking-wide">
            Strengths ({crit.strengths.length})
          </h4>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-left">
              <thead className="bg-emerald-50">
                <tr>
                  <th className="px-3 py-2 text-xs font-bold text-emerald-900">#</th>
                  <th className="px-3 py-2 text-xs font-bold text-emerald-900">Combined Statement (verbatim)</th>
                  <th className="px-3 py-2 text-xs font-bold text-emerald-900">Reviewer</th>
                  <th className="px-3 py-2 text-xs font-bold text-emerald-900">Q</th>
                  <th className="px-3 py-2 text-xs font-bold text-emerald-900">Action</th>
                  <th className="px-3 py-2 text-xs font-bold text-emerald-900">Rationale</th>
                </tr>
              </thead>
              <tbody>
                {crit.strengths.map(s => <StatementRow key={s.number} s={s} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mets */}
      {crit.mets.length > 0 && (
        <div className="mb-4">
          <h4 className="font-bold text-slate-700 mb-2 text-sm uppercase tracking-wide">
            Met ({crit.mets.length})
          </h4>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-left">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-xs font-bold text-slate-700">#</th>
                  <th className="px-3 py-2 text-xs font-bold text-slate-700">Combined Statement (verbatim)</th>
                  <th className="px-3 py-2 text-xs font-bold text-slate-700">Reviewer</th>
                  <th className="px-3 py-2 text-xs font-bold text-slate-700">Q</th>
                  <th className="px-3 py-2 text-xs font-bold text-slate-700">Action</th>
                  <th className="px-3 py-2 text-xs font-bold text-slate-700">Rationale</th>
                </tr>
              </thead>
              <tbody>
                {crit.mets.map(s => <StatementRow key={s.number} s={s} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function CommitteeReview({
  reviewId, applicationId, applicantName, agency, onClose,
}: CommitteeReviewProps) {
  const [file, setFile] = useState<File | null>(null);
  const [reviewerName, setReviewerName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [result, setResult] = useState<ConsensusResult | null>(null);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Check if there's already a result
  useEffect(() => {
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

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto py-8">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl mx-4 min-h-[60vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b">
          <div>
            <h2 className="text-2xl font-bold">Committee Consensus Review</h2>
            <p className="text-slate-500 mt-0.5">
              {applicantName} &middot; {agency}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>

        <div className="px-8 py-6">
          {/* Upload form — show if no result yet */}
          {!result && !polling && (
            <div className="max-w-xl mx-auto">
              <div className="rounded-xl border-2 border-dashed border-slate-300 p-8 text-center">
                <FileText size={40} className="mx-auto text-slate-400 mb-4" />
                <h3 className="text-lg font-bold mb-2">Upload Combined Statements</h3>
                <p className="text-slate-500 text-sm mb-4">
                  Upload the combined reviewer statements PDF for this application.
                  The tool will validate each statement against the NOFO worksheet questions.
                </p>

                <div className="mb-4">
                  <label className="block text-sm font-semibold text-slate-700 mb-1 text-left">
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

                <div className="mb-4">
                  <label className="block text-sm font-semibold text-slate-700 mb-1 text-left">
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

          {/* Polling state */}
          {polling && !result && (
            <div className="text-center py-16">
              <Loader2 size={40} className="mx-auto text-blue-600 animate-spin mb-4" />
              <h3 className="text-lg font-bold">Analyzing combined statements...</h3>
              <p className="text-slate-500 mt-1">
                Validating each statement against NOFO worksheet questions.
                This takes 1-2 minutes.
              </p>
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
                <div className="rounded-xl bg-slate-50 p-4 text-center">
                  <p className="text-2xl font-bold">{result.summary.total_findings}</p>
                  <p className="text-xs text-slate-500 font-semibold">Total</p>
                </div>
                <div className="rounded-xl bg-emerald-50 p-4 text-center">
                  <p className="text-2xl font-bold text-emerald-700">{result.summary.keep_count}</p>
                  <p className="text-xs text-emerald-600 font-semibold">KEEP</p>
                </div>
                <div className="rounded-xl bg-amber-50 p-4 text-center">
                  <p className="text-2xl font-bold text-amber-700">{result.summary.merge_count}</p>
                  <p className="text-xs text-amber-600 font-semibold">MERGE</p>
                </div>
                <div className="rounded-xl bg-blue-50 p-4 text-center">
                  <p className="text-2xl font-bold text-blue-700">{result.summary.revise_count}</p>
                  <p className="text-xs text-blue-600 font-semibold">REVISE</p>
                </div>
                <div className="rounded-xl bg-red-50 p-4 text-center">
                  <p className="text-2xl font-bold text-red-700">{result.summary.remove_count}</p>
                  <p className="text-xs text-red-600 font-semibold">REMOVE</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4 text-center">
                  <p className="text-2xl font-bold">{result.summary.findings_after_consolidation}</p>
                  <p className="text-xs text-slate-500 font-semibold">After consolidation</p>
                </div>
              </div>

              {/* Score + motion */}
              <div className="flex items-center gap-4 mb-6">
                <div className="rounded-xl bg-blue-700 text-white px-5 py-3">
                  <p className="text-xs font-semibold opacity-80">Suggested Score</p>
                  <p className="text-xl font-bold">{result.summary.suggested_score_range}</p>
                </div>
                <div className="rounded-xl border px-5 py-3">
                  <p className="text-xs font-semibold text-slate-500">Motion</p>
                  <p className="text-sm font-bold">
                    {result.summary.motion.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </p>
                </div>
                <div className="rounded-xl border px-5 py-3">
                  <p className="text-xs font-semibold text-slate-500">Budget</p>
                  <p className="text-sm font-bold">
                    {result.budget_recommendation.recommendation.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </p>
                  {result.budget_recommendation.rationale && (
                    <p className="text-xs text-slate-500 mt-0.5">{result.budget_recommendation.rationale}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-auto text-sm text-slate-500">
                  <Flag size={14} className="text-blue-600" /> = Your statement
                </div>
              </div>

              {/* Criteria */}
              {result.criteria.map(crit => (
                <CriterionSection key={crit.criterion_name} crit={crit} />
              ))}

              {/* Re-run button */}
              <div className="mt-8 pt-6 border-t flex items-center justify-between">
                <p className="text-xs text-slate-400">
                  {result.certification}
                </p>
                <button
                  onClick={() => { setResult(null); setFile(null); setError(''); }}
                  className="rounded-lg border px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Re-run with different document
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
