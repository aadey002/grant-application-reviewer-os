import React, { useState } from 'react';
import { AlertTriangle, ArrowLeft, Brain, CheckCircle2, Download } from 'lucide-react';

// ---------------------------------------------------------------------------
// Synthetic demo data — no real applicants, no real API calls
// ---------------------------------------------------------------------------
const DEMO_APPLICANT = 'Sunrise Community Health Center';
const DEMO_AGENCY = 'HRSA';

interface DemoCriterion {
  name: string;
  maximum_points: number;
  score: number;
  score_rationale: string;
  strengths: Array<{ comment: string; pages: number[] }>;
  mets: Array<{ comment: string; pages: number[] }>;
  weaknesses: Array<{ comment: string; pages: number[] }>;
}

const DEMO_CRITERIA: DemoCriterion[] = [
  {
    name: 'Need for Assistance',
    maximum_points: 25,
    score: 22,
    score_rationale: 'Strong documentation of target population health disparities with census-level data.',
    strengths: [
      { comment: 'Applicant provides county-level HRSA Health Professional Shortage Area designations with current poverty rate data.', pages: [4, 5] },
      { comment: 'Compelling epidemiological data on unmet dental and behavioral health need in the service area.', pages: [6] },
    ],
    mets: [
      { comment: 'Service area description covers all required FQHC eligibility elements per program requirements.', pages: [3] },
    ],
    weaknesses: [
      { comment: 'Demographic breakdown of current patient panel is omitted; reviewer cannot confirm sliding fee scale reach.', pages: [] },
    ],
  },
  {
    name: 'Response to Program Requirements',
    maximum_points: 25,
    score: 20,
    score_rationale: 'Good alignment with required service package; staffing plan slightly underspecified.',
    strengths: [
      { comment: 'Proposed clinical staffing model includes FTE allocations for each required primary care discipline.', pages: [11, 12] },
      { comment: 'Robust description of after-hours coverage and call protocols meets Section 330 requirements.', pages: [14] },
    ],
    mets: [
      { comment: 'Sliding fee discount schedule is attached and covers all income brackets as required.', pages: [22] },
    ],
    weaknesses: [
      { comment: 'Behavioral health integration plan references a future MOU that has not been executed; milestone is vague.', pages: [13] },
    ],
  },
  {
    name: 'Evaluative Measures',
    maximum_points: 20,
    score: 15,
    score_rationale: 'Evaluation plan present but baseline data sources not fully specified.',
    strengths: [
      { comment: 'Uses UDS clinical quality measures as performance indicators — directly aligned with HRSA reporting expectations.', pages: [18] },
    ],
    mets: [
      { comment: 'Quarterly reporting timeline and responsible staff identified.', pages: [19] },
    ],
    weaknesses: [
      { comment: 'No baseline metric values are provided; targets appear aspirational rather than data-driven.', pages: [18, 19] },
      { comment: 'External evaluator role is mentioned but budget line item for evaluation is absent.', pages: [25] },
    ],
  },
  {
    name: 'Organizational Capacity',
    maximum_points: 20,
    score: 18,
    score_rationale: 'Demonstrated track record; governance documentation complete.',
    strengths: [
      { comment: 'Board composition meets FQHC majority patient board requirement with documented minutes.', pages: [28] },
      { comment: 'Three years of audited financial statements show clean opinions with adequate reserves.', pages: [30, 31] },
    ],
    mets: [
      { comment: 'Current Section 330 grantee with satisfactory program performance; no open findings.', pages: [27] },
    ],
    weaknesses: [
      { comment: 'Key personnel section lacks CVs for two listed clinical positions.', pages: [29] },
    ],
  },
  {
    name: 'Budget',
    maximum_points: 10,
    score: 8,
    score_rationale: 'Budget is reasonable and well-justified with minor gaps.',
    strengths: [
      { comment: 'Personnel costs are justified with market-rate salary documentation.', pages: [33] },
    ],
    mets: [
      { comment: 'Indirect cost rate is supported by a current approved negotiated rate agreement.', pages: [34] },
    ],
    weaknesses: [
      { comment: 'Equipment line items lack vendor quotes; costs appear estimated only.', pages: [33] },
    ],
  },
];

const TOTAL = DEMO_CRITERIA.reduce((s, c) => s + c.maximum_points, 0);
const SCORE = DEMO_CRITERIA.reduce((s, c) => s + c.score, 0);

// ---------------------------------------------------------------------------
const DemoMode: React.FC = () => {
  const [selected, setSelected] = useState(0);
  const criterion = DEMO_CRITERIA[selected];

  const exportDemo = () => {
    const payload = {
      applicant: DEMO_APPLICANT,
      agency: DEMO_AGENCY,
      total_score: SCORE,
      maximum_score: TOTAL,
      criteria: DEMO_CRITERIA,
      note: 'SYNTHETIC DEMO DATA — Not a real application.',
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'demo-review.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#f4f7fc] text-slate-900">
      {/* DEMO BANNER */}
      <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-400 px-6 py-3 text-center text-sm font-bold text-amber-950">
        <AlertTriangle size={16} />
        DEMO MODE — Viewing synthetic example data only. No real applications or API calls.
        <AlertTriangle size={16} />
      </div>

      {/* Header */}
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white">
              <Brain />
            </div>
            <div>
              <h1 className="text-xl font-bold">Federal Grant Reviewer AI</h1>
              <p className="text-sm text-slate-500">Demo — Sunrise Community Health Center · HRSA</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { window.location.hash = '/'; }}
              className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              <ArrowLeft size={16} /> Back to Home
            </button>
            <button
              onClick={() => { window.location.hash = '/login'; }}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
            >
              Sign In to Review Real Applications
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {/* Subtitle */}
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="text-3xl font-bold">Demo: {DEMO_APPLICANT}</h2>
            <p className="text-slate-600">{DEMO_AGENCY} · Synthetic example — all data is fictional</p>
          </div>
        </div>

        {/* Criterion tabs */}
        <div className="mb-6 flex flex-wrap gap-2">
          {DEMO_CRITERIA.map((c, i) => (
            <button
              key={c.name}
              onClick={() => setSelected(i)}
              className={'rounded-lg border px-4 py-2 text-sm font-semibold ' + (selected === i ? 'border-blue-600 bg-blue-600 text-white' : 'bg-white')}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          {/* Criterion detail */}
          <article className="rounded-xl border bg-white p-6">
            <div className="flex justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold">{criterion.name}</h3>
                <p className="mt-1 text-sm text-slate-600">{criterion.score_rationale}</p>
              </div>
              <div className="shrink-0 rounded-lg bg-blue-50 px-4 py-2 font-bold text-blue-800 text-lg">
                {criterion.score} / {criterion.maximum_points}
              </div>
            </div>

            {(['strengths', 'mets', 'weaknesses'] as const).map(group => (
              <div key={group} className="mt-6">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{group}</p>
                <div className="mt-2 space-y-2">
                  {criterion[group].length ? (
                    criterion[group].map((finding, fi) => (
                      <div key={fi} className="rounded-lg bg-slate-50 p-4">
                        <p className="text-sm leading-6">{finding.comment}</p>
                        {finding.pages.length > 0 && (
                          <p className="mt-1 text-xs font-bold text-blue-700">
                            Application page(s): {finding.pages.join(', ')}
                          </p>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-400">None identified.</p>
                  )}
                </div>
              </div>
            ))}
          </article>

          {/* Score sidebar */}
          <aside className="h-fit rounded-xl bg-slate-900 p-6 text-white lg:sticky lg:top-16">
            <p className="text-slate-300">Demo total score</p>
            <p className="mt-2 text-4xl font-bold">
              {SCORE}
              <span className="text-lg text-slate-400"> / {TOTAL}</span>
            </p>

            <div className="mt-5 space-y-2">
              {DEMO_CRITERIA.map(c => (
                <div key={c.name}>
                  <div className="flex justify-between text-xs text-slate-300">
                    <span className="truncate max-w-[160px]">{c.name}</span>
                    <span className="font-bold">{c.score}/{c.maximum_points}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-white/20">
                    <div
                      className="h-1.5 rounded-full bg-blue-400"
                      style={{ width: Math.round((c.score / c.maximum_points) * 100) + '%' }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-5 rounded-lg bg-white/10 p-3 text-xs leading-5 text-slate-300">
              <CheckCircle2 size={12} className="inline mr-1" />
              AI draft score. Final scores are set by human reviewers.
            </p>

            <button
              onClick={exportDemo}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 font-bold text-slate-900"
            >
              <Download size={18} /> Export Demo JSON
            </button>

            <button
              onClick={() => { window.location.hash = '/login'; }}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-700"
            >
              Sign in to review real applications
            </button>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default DemoMode;
