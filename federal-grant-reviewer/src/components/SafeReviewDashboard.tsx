import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSearch, Loader2, LockKeyhole, Upload } from 'lucide-react';
import { extractRubrics, runSafeReviews, SafeReview, ReviewPackage, ExtractedRubric } from '../services/api';

type PackageDraft = { applications: File[]; nofo: File | null; rubric: File | null; worksheet: File | null };
const emptyPackage = (): PackageDraft => ({applications:[], nofo:null, rubric:null, worksheet:null});

const SafeReviewDashboard: React.FC = () => {
  const [packages, setPackages] = useState<PackageDraft[]>([emptyPackage(), emptyPackage(), emptyPackage()]);
  const [reviews, setReviews] = useState<SafeReview[]>([]);
  const [rubrics, setRubrics] = useState<ExtractedRubric[]>([]);
  const [selected, setSelected] = useState(0);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = packages.every(item => item.applications.length > 0 && item.nofo);
  const current = reviews[selected];
  const scoreTotal = useMemo(() => current?.criteria.reduce((sum, c) => sum + Number(scores[`${current.review_id}:${c.name}`] || 0), 0) || 0, [current, scores]);

  const chooseApplications = (index: number, files: FileList | null) => {
    if (!files) return;
    const next = [...packages]; next[index] = {...next[index], applications: Array.from(files)}; setPackages(next);
  };
  const chooseFile = (index: number, kind: 'nofo' | 'rubric' | 'worksheet', file?: File) => {
    const next = [...packages]; next[index] = {...next[index], [kind]: file || null}; setPackages(next);
  };
  const run = async () => {
    setBusy(true); setError('');
    try { setReviews(await runSafeReviews(packages as ReviewPackage[], rubrics)); setSelected(0); }
    catch (e) { setError(e instanceof Error ? e.message : 'Review failed'); }
    finally { setBusy(false); }
  };
  const extract = async () => {
    setBusy(true); setError('');
    try { setRubrics(await extractRubrics(packages.map(item => item.nofo as File))); }
    catch (e) { setError(e instanceof Error ? e.message : 'Rubric extraction failed'); }
    finally { setBusy(false); }
  };
  const setRubricApproval = (index:number, approved:boolean) => {
    const next=[...rubrics]; next[index]={...next[index],approved}; setRubrics(next);
  };
  const setCriterionPoints = (rubricIndex:number, criterionIndex:number, points:number) => {
    const next=[...rubrics]; const criteria=[...next[rubricIndex].criteria];
    criteria[criterionIndex]={...criteria[criterionIndex],points};
    next[rubricIndex]={...next[rubricIndex],criteria,total_points:criteria.reduce((sum,item)=>sum+item.points,0)};
    setRubrics(next);
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
        <div className="mb-7"><h2 className="text-3xl font-bold">Prepare three grant reviews</h2><p className="mt-2 text-slate-600">Upload one NOFO per grant and at least one application. Rubrics and worksheets are optional.</p></div>
        <div className="space-y-5">{packages.map((item, i) => <div key={i} className="rounded-2xl border bg-white p-6">
          <div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Grant {i+1}</p><h3 className="text-xl font-bold">Grant package</h3></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${item.applications.length>0&&item.nofo?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}`}>{(item.applications.length>0?1:0)+(item.nofo?1:0)+(item.rubric?1:0)+(item.worksheet?1:0)} files</span></div>
          <div className="grid gap-3 md:grid-cols-4">
            <label className="cursor-pointer rounded-xl border-2 border-dashed border-slate-200 p-4 hover:border-blue-500">
              <input className="hidden" type="file" accept=".pdf" multiple onChange={e=>chooseApplications(i,e.target.files)}/>
              <Upload className="mb-3 text-blue-700" size={20}/><p className="text-sm font-bold">Application(s) PDF</p><p className="mt-1 truncate text-xs text-slate-500">{item.applications.length?`${item.applications.length} file(s)`:'Choose file(s)'}</p>
            </label>
            <label className="cursor-pointer rounded-xl border-2 border-dashed border-slate-200 p-4 hover:border-blue-500">
              <input className="hidden" type="file" accept=".pdf,.doc,.docx" onChange={e=>chooseFile(i,'nofo',e.target.files?.[0])}/>
              <Upload className="mb-3 text-blue-700" size={20}/><p className="text-sm font-bold">NOFO <span className="text-red-500">*</span></p><p className="mt-1 truncate text-xs text-slate-500">{item.nofo?.name||'Choose file'}</p>
            </label>
            <label className="cursor-pointer rounded-xl border-2 border-dashed border-slate-200 p-4 hover:border-blue-500">
              <input className="hidden" type="file" accept=".pdf,.doc,.docx,.txt" onChange={e=>chooseFile(i,'rubric',e.target.files?.[0])}/>
              <Upload className="mb-3 text-slate-400" size={20}/><p className="text-sm font-bold text-slate-500">Scoring rubric <span className="text-xs font-normal">(optional)</span></p><p className="mt-1 truncate text-xs text-slate-500">{item.rubric?.name||'Choose file'}</p>
            </label>
            <label className="cursor-pointer rounded-xl border-2 border-dashed border-slate-200 p-4 hover:border-blue-500">
              <input className="hidden" type="file" accept=".pdf,.doc,.docx,.txt" onChange={e=>chooseFile(i,'worksheet',e.target.files?.[0])}/>
              <Upload className="mb-3 text-slate-400" size={20}/><p className="text-sm font-bold text-slate-500">Worksheet <span className="text-xs font-normal">(optional)</span></p><p className="mt-1 truncate text-xs text-slate-500">{item.worksheet?.name||'Choose file'}</p>
            </label>
          </div>
        </div>)}</div>
        {!!rubrics.length && <div className="mt-7 space-y-4">{rubrics.map((rubric,ri)=><div key={ri} className="rounded-2xl border bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase text-blue-700">Grant {ri+1}</p><h3 className="text-xl font-bold">Extracted NOFO rubric</h3></div><span className={`rounded-full px-3 py-1 text-sm font-bold ${rubric.total_points===100?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}`}>{rubric.total_points} points</span></div>
          <div className="mt-4 divide-y">{rubric.criteria.map((c,ci)=><div key={ci} className="grid gap-2 py-3 md:grid-cols-[80px_1fr_120px]"><span className="text-sm font-bold text-slate-500">#{c.number}</span><div><p className="font-semibold">{c.name}</p><p className="text-xs text-slate-500">NOFO page {c.source_page}</p></div><label className="text-sm">Points <input className="ml-2 w-16 rounded border px-2 py-1" type="number" min="0" value={c.points} onChange={e=>setCriterionPoints(ri,ci,Number(e.target.value))}/></label></div>)}</div>
          {!rubric.criteria.length && <p className="mt-4 rounded-lg bg-red-50 p-3 text-red-700">Criteria could not be extracted. Upload a clearer NOFO or enter the rubric manually.</p>}
          {rubric.warnings.length > 0 && <div className="mt-3 space-y-1">{rubric.warnings.map((w,wi)=><p key={wi} className="text-sm text-amber-700">{w}</p>)}</div>}
          <label className="mt-4 flex items-center gap-2 font-semibold"><input type="checkbox" checked={!!rubric.approved} disabled={!rubric.criteria.length} onChange={e=>setRubricApproval(ri,e.target.checked)}/>I verified these criteria and point values against the NOFO.</label>
        </div>)}</div>}
        {error && <div className="mt-5 flex gap-2 rounded-xl bg-red-50 p-4 text-red-800"><AlertTriangle/>{error}</div>}
        {!rubrics.length ? <button onClick={extract} disabled={!ready||busy} className="mt-7 flex items-center gap-2 rounded-xl bg-blue-700 px-6 py-3 font-semibold text-white disabled:opacity-40">{busy?<Loader2 className="animate-spin"/>:<FileSearch/>}{busy?'Extracting criteria…':'Extract NOFO scoring criteria'}</button>
        : <button onClick={run} disabled={busy||!rubrics.every(r=>r.approved)} className="mt-7 flex items-center gap-2 rounded-xl bg-blue-700 px-6 py-3 font-semibold text-white disabled:opacity-40">{busy?<Loader2 className="animate-spin"/>:<FileSearch/>}{busy?'Building evidence maps…':'Run all application reviews'}</button>}
      </section>}
      {!!reviews.length && <section>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-3xl font-bold">Review dashboard</h2><p className="mt-1 text-slate-600">Validate citations, enter reviewer scores, then export.</p></div><button onClick={()=>{setReviews([]);setRubrics([]);setScores({})}} className="rounded-lg border bg-white px-4 py-2 font-semibold">New review set</button></div>
        <div className="grid gap-4 md:grid-cols-3">{reviews.map((r,i)=><button key={r.review_id} onClick={()=>setSelected(i)} className={`rounded-xl border p-5 text-left ${selected===i?'border-blue-600 bg-blue-50 ring-2 ring-blue-100':'bg-white'}`}>
          <div className="flex justify-between"><span className="font-bold">Grant {r.grant_index} · Application {r.application_index}</span><CheckCircle2 className="text-emerald-600" size={20}/></div><p className="mt-3 truncate text-sm font-semibold">{r.application_file}</p><p className="mt-1 text-xs text-slate-500">{r.page_count} pages · human review required</p>
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
