import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSearch, Loader2, LockKeyhole, Upload } from 'lucide-react';
import { runSafeReviews, SafeReview, ReviewPackage } from '../services/api';

type PackageDraft = { application: File | null; nofo: File | null; rubric: File | null; worksheet: File | null };
const emptyPackage = (): PackageDraft => ({application:null, nofo:null, rubric:null, worksheet:null});

const SafeReviewDashboard: React.FC = () => {
  const [packages, setPackages] = useState<PackageDraft[]>([emptyPackage(), emptyPackage(), emptyPackage()]);
  const [reviews, setReviews] = useState<SafeReview[]>([]);
  const [selected, setSelected] = useState(0);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = packages.every(item => Object.values(item).every(Boolean));
  const current = reviews[selected];
  const scoreTotal = useMemo(() => current?.criteria.reduce((sum, c) => sum + Number(scores[`${current.review_id}:${c.name}`] || 0), 0) || 0, [current, scores]);

  const choose = (index: number, kind: keyof PackageDraft, file?: File) => {
    const next = [...packages]; next[index] = {...next[index], [kind]: file || null}; setPackages(next);
  };
  const run = async () => {
    setBusy(true); setError('');
    try { setReviews(await runSafeReviews(packages as ReviewPackage[])); setSelected(0); }
    catch (e) { setError(e instanceof Error ? e.message : 'Review failed'); }
    finally { setBusy(false); }
  };
  const exportReview = () => {
    const completed = {...current, reviewer_scores: current.criteria.map(c => ({criterion:c.name, points:scores[`${current.review_id}:${c.name}`] || null})), reviewer_total:scoreTotal};
    const url = URL.createObjectURL(new Blob([JSON.stringify(completed, null, 2)], {type:'application/json'}));
    const link = document.createElement('a'); link.href=url; link.download=`${current.review_id}-review.json`; link.click(); URL.revokeObjectURL(url);
  };

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <div><p className="text-xs font-bold uppercase tracking-[.24em] text-blue-700">ReviewerOS</p><h1 className="text-2xl font-bold">Federal Grant Review Workspace</h1></div>
        <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800"><LockKeyhole size={16}/> Evidence-first mode</div>
      </div>
    </header>
    <main className="mx-auto max-w-7xl px-6 py-8">
      {!reviews.length && <section>
        <div className="mb-7"><h2 className="text-3xl font-bold">Prepare three grant reviews</h2><p className="mt-2 text-slate-600">Each application remains isolated and produces a separate evidence map and reviewer scorecard.</p></div>
        <div className="space-y-5">{packages.map((item, i) => <div key={i} className="rounded-2xl border bg-white p-6">
          <div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Review {i+1}</p><h3 className="text-xl font-bold">Grant package</h3></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${Object.values(item).every(Boolean)?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}`}>{Object.values(item).filter(Boolean).length}/4 files</span></div>
          <div className="grid gap-3 md:grid-cols-4">{([
            ['application','Application PDF','.pdf'], ['nofo','NOFO','.pdf,.doc,.docx'], ['rubric','Scoring rubric','.pdf,.doc,.docx,.txt'], ['worksheet','Worksheet / instructions','.pdf,.doc,.docx,.txt']
          ] as [keyof PackageDraft,string,string][]).map(([kind,label,accept])=><label key={kind} className="cursor-pointer rounded-xl border-2 border-dashed border-slate-200 p-4 hover:border-blue-500">
            <input className="hidden" type="file" accept={accept} onChange={e=>choose(i,kind,e.target.files?.[0])}/>
            <Upload className="mb-3 text-blue-700" size={20}/><p className="text-sm font-bold">{label}</p><p className="mt-1 truncate text-xs text-slate-500">{item[kind]?.name || 'Choose file'}</p>
          </label>)}</div>
        </div>)}</div>
        {error && <div className="mt-5 flex gap-2 rounded-xl bg-red-50 p-4 text-red-800"><AlertTriangle/>{error}</div>}
        <button onClick={run} disabled={!ready||busy} className="mt-7 flex items-center gap-2 rounded-xl bg-blue-700 px-6 py-3 font-semibold text-white disabled:opacity-40">{busy?<Loader2 className="animate-spin"/>:<FileSearch/>}{busy?'Building evidence maps…':'Run three reviews'}</button>
      </section>}
      {!!reviews.length && <section>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-3xl font-bold">Review dashboard</h2><p className="mt-1 text-slate-600">Validate citations, enter reviewer scores, then export.</p></div><button onClick={()=>{setReviews([]);setScores({})}} className="rounded-lg border bg-white px-4 py-2 font-semibold">New review set</button></div>
        <div className="grid gap-4 md:grid-cols-3">{reviews.map((r,i)=><button key={r.review_id} onClick={()=>setSelected(i)} className={`rounded-xl border p-5 text-left ${selected===i?'border-blue-600 bg-blue-50 ring-2 ring-blue-100':'bg-white'}`}>
          <div className="flex justify-between"><span className="font-bold">Review {i+1}</span><CheckCircle2 className="text-emerald-600" size={20}/></div><p className="mt-3 truncate text-sm font-semibold">{r.application_file}</p><p className="mt-1 text-xs text-slate-500">{r.page_count} pages · human review required</p>
        </button>)}</div>
        {current && <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">{current.criteria.map(c=><article key={c.name} className="rounded-2xl border bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold">{c.name}</h3><p className="text-sm text-slate-500">{c.status.replace(/_/g,' ')}</p></div><label className="text-sm font-semibold">Score <input type="number" min="0" max={c.maximum_points} value={scores[`${current.review_id}:${c.name}`]||''} onChange={e=>setScores({...scores,[`${current.review_id}:${c.name}`]:e.target.value})} className="ml-2 w-20 rounded-lg border px-2 py-1"/> / {c.maximum_points}</label></div>
            <div className="mt-4 space-y-3">{c.evidence.map((e,j)=><div key={j} className="rounded-xl bg-slate-50 p-4"><p className="mb-1 text-xs font-bold uppercase text-blue-700">Application page {e.page}</p><p className="text-sm leading-6">{e.quote}</p></div>)}</div>
          </article>)}</div>
          <aside className="h-fit rounded-2xl border bg-slate-900 p-6 text-white lg:sticky lg:top-6"><p className="text-sm text-slate-300">Reviewer total</p><p className="mt-2 text-5xl font-bold">{scoreTotal}<span className="text-xl text-slate-400"> / {current.criteria.reduce((s,c)=>s+c.maximum_points,0)}</span></p><div className="my-6 border-t border-slate-700"/><p className="text-sm leading-6 text-slate-300">{current.certification}</p><button onClick={exportReview} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 font-bold text-slate-900"><Download size={18}/>Export review JSON</button></aside>
        </div>}
      </section>}
    </main>
  </div>;
};
export default SafeReviewDashboard;
