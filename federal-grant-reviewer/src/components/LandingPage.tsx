import React from 'react';
import {
  ArrowRight, Brain, CheckCircle2, FileSearch, FileText,
  Shield, Star, Upload,
} from 'lucide-react';

const nav = (hash: string) => { window.location.hash = hash; };

const LandingPage: React.FC = () => (
  <div className="min-h-screen bg-white text-slate-900">
    {/* ---- NAV ---- */}
    <nav className="sticky top-0 z-50 border-b bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white">
            <Brain size={22} />
          </div>
          <span className="text-lg font-bold">Federal Grant Reviewer AI</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => nav('/demo')}
            className="rounded-lg border px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Try Demo
          </button>
          <button
            onClick={() => nav('/login')}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700"
          >
            Sign In
          </button>
        </div>
      </div>
    </nav>

    {/* ---- HERO ---- */}
    <section className="bg-gradient-to-b from-slate-50 to-white px-6 py-24 text-center">
      <div className="mx-auto max-w-3xl">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-xl">
          <Brain size={40} />
        </div>
        <h1 className="text-5xl font-extrabold leading-tight tracking-tight text-slate-900">
          Federal Grant Reviewer AI
        </h1>
        <p className="mt-5 text-xl leading-8 text-slate-600">
          Evidence-grounded scoring and structured reviewer comments for federal grant
          applications — derived directly from the Notice of Funding Opportunity.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <button
            onClick={() => nav('/login')}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-4 text-lg font-bold text-white shadow-lg hover:bg-blue-700"
          >
            Get Started <ArrowRight size={20} />
          </button>
          <button
            onClick={() => nav('/demo')}
            className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-8 py-4 text-lg font-semibold text-slate-700 hover:bg-slate-50"
          >
            View Demo
          </button>
        </div>
      </div>
    </section>

    {/* ---- SUPPORTED AGENCIES ---- */}
    <section className="border-y bg-slate-50 px-6 py-12">
      <p className="text-center text-sm font-bold uppercase tracking-widest text-slate-400">
        Supported Funding Agencies
      </p>
      <div className="mx-auto mt-6 flex max-w-2xl flex-wrap items-center justify-center gap-6">
        {['HRSA', 'SAMHSA', 'NIH', 'CDC'].map(agency => (
          <div
            key={agency}
            className="rounded-xl border bg-white px-8 py-4 text-xl font-extrabold text-slate-700 shadow-sm"
          >
            {agency}
          </div>
        ))}
      </div>
    </section>

    {/* ---- METHODOLOGY ---- */}
    <section className="mx-auto max-w-5xl px-6 py-20">
      <h2 className="text-center text-3xl font-bold">NOFO-Derived Scoring Methodology</h2>
      <p className="mx-auto mt-4 max-w-2xl text-center text-slate-600">
        Every score is anchored to language extracted directly from the Notice of Funding
        Opportunity — not generic rubrics. Evidence is cited by page and quote.
      </p>
      <div className="mt-12 grid gap-8 md:grid-cols-3">
        {[
          {
            icon: <FileText size={28} />,
            title: 'NOFO-Derived Rubric',
            body: 'Criteria and point allocations are automatically extracted from the uploaded NOFO and presented for human verification before any scoring begins.',
          },
          {
            icon: <FileSearch size={28} />,
            title: 'Evidence-Grounded Comments',
            body: 'Every strength, weakness, and met criterion is tied to specific application pages and direct quotes — making reviewer comments auditable and defensible.',
          },
          {
            icon: <Shield size={28} />,
            title: 'Human Validation Controls',
            body: 'The reviewer approves the extracted rubric before scoring runs, adjusts point values, and retains final authority over every score. The AI drafts; humans decide.',
          },
        ].map(card => (
          <div key={card.title} className="rounded-2xl border bg-white p-8 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              {card.icon}
            </div>
            <h3 className="mt-5 text-xl font-bold">{card.title}</h3>
            <p className="mt-3 leading-7 text-slate-600">{card.body}</p>
          </div>
        ))}
      </div>
    </section>

    {/* ---- ARCHITECTURE ---- */}
    <section className="bg-slate-900 px-6 py-20 text-white">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-center text-3xl font-bold">How It Works</h2>
        <div className="mt-12 grid gap-4 md:grid-cols-4">
          {[
            { step: '01', icon: <Upload size={24} />, label: 'Upload', detail: 'NOFO + applications securely uploaded to Supabase Storage' },
            { step: '02', icon: <FileSearch size={24} />, label: 'Extract', detail: 'Criteria, points, and keywords extracted from the NOFO' },
            { step: '03', icon: <Star size={24} />, label: 'Score', detail: 'Each application scored against NOFO criteria with evidence citations' },
            { step: '04', icon: <CheckCircle2 size={24} />, label: 'Review', detail: 'Completed worksheets and structured comments delivered for human review' },
          ].map(s => (
            <div key={s.step} className="rounded-xl bg-white/10 p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white">
                {s.icon}
              </div>
              <p className="mt-1 text-xs font-bold text-slate-400">{s.step}</p>
              <p className="mt-2 text-lg font-bold">{s.label}</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">{s.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* ---- HUMAN CONTROLS ---- */}
    <section className="mx-auto max-w-4xl px-6 py-20">
      <h2 className="text-center text-3xl font-bold">Human Validation at Every Step</h2>
      <div className="mt-10 space-y-5">
        {[
          'Reviewer uploads and selects the funding agency before any processing begins.',
          'Extracted rubric is displayed for human review — point values are editable before scoring.',
          'Reviewer must check "I verified this rubric" before the scoring run starts.',
          'All AI-drafted comments are labeled as drafts and require human judgment before use.',
          'JSON export and completed worksheet are available for audit and filing.',
        ].map((item, i) => (
          <div key={i} className="flex items-start gap-4 rounded-xl border bg-white p-5 shadow-sm">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-sm">
              {i + 1}
            </div>
            <p className="text-slate-700 leading-6">{item}</p>
          </div>
        ))}
      </div>
    </section>

    {/* ---- CTA ---- */}
    <section className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-20 text-center text-white">
      <h2 className="text-3xl font-bold">Ready to review your grant competition?</h2>
      <p className="mt-4 text-lg text-blue-100">
        Upload a NOFO and applications to get NOFO-aligned scores in minutes.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        <button
          onClick={() => nav('/demo')}
          className="rounded-xl border border-white/50 bg-white/20 px-8 py-4 text-lg font-semibold hover:bg-white/30"
        >
          Try Demo First
        </button>
        <button
          onClick={() => nav('/login')}
          className="rounded-xl bg-white px-8 py-4 text-lg font-bold text-blue-700 hover:bg-blue-50"
        >
          Sign In to Review <ArrowRight className="inline" size={18} />
        </button>
      </div>
    </section>

    {/* ---- FOOTER ---- */}
    <footer className="border-t px-6 py-10 text-center">
      <p className="text-xs leading-6 text-slate-400 max-w-2xl mx-auto">
        This is an independently developed review-support system and is not affiliated with or
        endorsed by HRSA, SAMHSA, NIH, CDC, or any federal agency. All AI-generated outputs are
        drafts intended to support — not replace — human reviewer judgment.
      </p>
      <p className="mt-4 text-xs text-slate-300">
        &copy; {new Date().getFullYear()} Federal Grant Reviewer AI
      </p>
    </footer>
  </div>
);

export default LandingPage;
