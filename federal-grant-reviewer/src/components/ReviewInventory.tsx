import React, { useEffect, useState, useMemo } from 'react';
import { BarChart3, ChevronRight, Download, ExternalLink, LogOut, Search, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ReviewRow {
  id: string;
  agency: string;
  nofo_filename: string;
  status: string;
  created_at: string;
}

interface AppRow {
  id: string;
  review_id: string;
  applicant_name: string | null;
  filename: string;
  final_score: number | null;
  maximum_score: number | null;
  agency: string | null;
  created_at: string;
  full_result: any;
}

interface NofoGroup {
  nofo_number: string;
  nofo_title: string;
  nofo_desc: string;
  agency: string;
  apps: DedupedApp[];
  avg_score: number;
  date_start: string;
  date_end: string;
  budget_flags: number;
}

interface DedupedApp {
  name: string;
  score: number;
  date: string;
  budget_yr1: number | null;
  budget_rec: string | null;
  review_id: string;
  app_id: string;
}

// ---------------------------------------------------------------------------
// NOFO metadata — descriptions keyed by NOFO number
// ---------------------------------------------------------------------------
const NOFO_META: Record<string, { title: string; desc: string }> = {
  'HRSA-26-067': {
    title: 'Ryan White Part D - WICY Existing Geographic Service Areas',
    desc: 'Funds family-centered outpatient HIV care and support services for low-income women, infants, children, and youth through local community-based organizations.',
  },
  'HRSA-26-019': {
    title: 'Ryan White Part C - Early Intervention Services',
    desc: 'Supports early intervention and primary care for people living with HIV through outpatient health services, case management, and linkage to care at community health centers.',
  },
  'HRSA-26-036': {
    title: 'Rural Communities Opioid Response Program - Planning',
    desc: 'Supports rural communities in developing strategic plans to address opioid and substance use disorder through needs assessment, partnership building, and workforce planning.',
  },
  'HRSA-26-037': {
    title: 'Rural Communities Opioid Response Program - Implementation',
    desc: 'Funds implementation of evidence-based opioid and substance use disorder prevention, treatment, and recovery services in rural communities with high overdose burden.',
  },
  'SP-26-002': {
    title: 'Strategic Prevention Framework - Partnerships for Success',
    desc: 'Funds state, tribal, and community organizations to implement evidence-based substance use prevention strategies targeting underage drinking and prescription drug misuse.',
  },
};

function extractNofoNumber(filename: string): string {
  const m = filename.match(/HRSA[- ]?\d{2}[- ]?\d{3}/i);
  if (m) return m[0].replace(/\s/g, '-').toUpperCase();
  if (/spf-pfs|SP-26-002/i.test(filename)) return 'SP-26-002';
  return 'UNKNOWN';
}

function scoreColor(score: number): string {
  if (score >= 90) return '#059669';
  if (score >= 70) return '#d97706';
  return '#dc2626';
}

function barFill(score: number): string {
  if (score >= 90) return '#10b981';
  if (score >= 70) return '#f59e0b';
  return '#ef4444';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const ReviewInventory: React.FC = () => {
  const { user, signOut } = useAuth();
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [apps, setApps] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedNofo, setExpandedNofo] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [agencyFilter, setAgencyFilter] = useState('');
  const [sortBy, setSortBy] = useState('recent');

  // Fetch data
  useEffect(() => {
    async function load() {
      const [revRes, appRes] = await Promise.all([
        supabase.from('grant_reviews').select('id,agency,nofo_filename,status,created_at').order('created_at', { ascending: false }),
        supabase.from('applications').select('id,review_id,applicant_name,filename,final_score,maximum_score,agency,created_at,full_result').eq('status', 'completed').order('created_at', { ascending: false }),
      ]);
      setReviews(revRes.data || []);
      setApps(appRes.data || []);
      setLoading(false);
    }
    load();
  }, []);

  // Build NOFO groups with deduplication
  const nofoGroups = useMemo(() => {
    const reviewMap: Record<string, ReviewRow> = {};
    reviews.forEach(r => { reviewMap[r.id] = r; });

    const byNofo: Record<string, { agency: string; apps: DedupedApp[]; dates: string[]; budgetFlags: number }> = {};

    apps.forEach(a => {
      const rev = reviewMap[a.review_id];
      if (!rev) return;
      const nofo = extractNofoNumber(rev.nofo_filename || '');
      if (!byNofo[nofo]) byNofo[nofo] = { agency: rev.agency || a.agency || 'UNKNOWN', apps: [], dates: [], budgetFlags: 0 };

      const result = typeof a.full_result === 'string' ? JSON.parse(a.full_result) : a.full_result;
      const budget = result?.budget;
      const yr1 = budget?.annual_recommended_funding?.[0] || null;
      const rec = budget?.recommendation || null;

      byNofo[nofo].apps.push({
        name: a.applicant_name || a.filename.replace(/\.pdf$/i, '').replace(/_/g, ' '),
        score: a.final_score || 0,
        date: a.created_at.substring(0, 10),
        budget_yr1: yr1,
        budget_rec: rec,
        review_id: a.review_id,
        app_id: a.id,
      });
      byNofo[nofo].dates.push(a.created_at.substring(0, 10));
    });

    // Merge UNKNOWN into SPF-PFS if both exist
    if (byNofo['UNKNOWN'] && byNofo['SP-26-002']) {
      byNofo['SP-26-002'].apps.push(...byNofo['UNKNOWN'].apps);
      byNofo['SP-26-002'].dates.push(...byNofo['UNKNOWN'].dates);
      delete byNofo['UNKNOWN'];
    } else if (byNofo['UNKNOWN']) {
      byNofo['SP-26-002'] = byNofo['UNKNOWN'];
      delete byNofo['UNKNOWN'];
    }

    // Deduplicate by applicant name — keep latest
    const groups: NofoGroup[] = [];
    Object.entries(byNofo).forEach(([nofo, data]) => {
      const seen: Record<string, DedupedApp> = {};
      data.apps.forEach(a => {
        const key = a.name.toLowerCase().trim();
        if (!seen[key]) seen[key] = a;
      });
      const deduped = Object.values(seen).sort((a, b) => b.score - a.score);
      const scores = deduped.map(a => a.score).filter(Boolean);
      const avg = scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0;
      const sortedDates = [...new Set(data.dates)].sort();
      const flags = deduped.filter(a => a.budget_rec === 'as_reduced').length;

      const meta = NOFO_META[nofo] || { title: nofo, desc: '' };
      groups.push({
        nofo_number: nofo,
        nofo_title: meta.title,
        nofo_desc: meta.desc,
        agency: data.agency,
        apps: deduped,
        avg_score: avg,
        date_start: sortedDates[0] || '',
        date_end: sortedDates[sortedDates.length - 1] || '',
        budget_flags: flags,
      });
    });

    return groups;
  }, [reviews, apps]);

  // Filter and sort
  const filtered = useMemo(() => {
    let result = [...nofoGroups];
    if (agencyFilter) result = result.filter(g => g.agency.toUpperCase() === agencyFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(g =>
        g.nofo_number.toLowerCase().includes(q) ||
        g.nofo_title.toLowerCase().includes(q) ||
        g.agency.toLowerCase().includes(q) ||
        g.apps.some(a => a.name.toLowerCase().includes(q))
      );
    }
    if (sortBy === 'recent') result.sort((a, b) => b.date_end.localeCompare(a.date_end));
    else if (sortBy === 'apps') result.sort((a, b) => b.apps.length - a.apps.length);
    else if (sortBy === 'score_high') result.sort((a, b) => b.avg_score - a.avg_score);
    else if (sortBy === 'score_low') result.sort((a, b) => a.avg_score - b.avg_score);
    return result;
  }, [nofoGroups, agencyFilter, search, sortBy]);

  // Summary stats
  const totalApps = nofoGroups.reduce((s, g) => s + g.apps.length, 0);
  const allScores = nofoGroups.flatMap(g => g.apps.map(a => a.score)).filter(Boolean);
  const globalAvg = allScores.length ? Math.round(allScores.reduce((s, v) => s + v, 0) / allScores.length) : 0;
  const globalMin = allScores.length ? Math.min(...allScores) : 0;
  const globalMax = allScores.length ? Math.max(...allScores) : 0;
  const allDates = nofoGroups.flatMap(g => [g.date_start, g.date_end]).filter(Boolean).sort();
  const totalFlags = nofoGroups.reduce((s, g) => s + g.budget_flags, 0);
  const agencies = [...new Set(nofoGroups.map(g => g.agency.toUpperCase()))];

  function formatDate(d: string) {
    if (!d) return '';
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function formatBudget(n: number | null) {
    if (!n) return '--';
    return '$' + Math.round(n).toLocaleString() + '/yr';
  }

  function exportCSV() {
    const rows = [['NOFO', 'Agency', 'Program', 'Applicant', 'Score', 'Budget (Yr 1)', 'Budget Rec', 'Date'].join(',')];
    nofoGroups.forEach(g => {
      g.apps.forEach(a => {
        rows.push([g.nofo_number, g.agency, '"' + g.nofo_title + '"', '"' + a.name + '"', a.score, a.budget_yr1 || '', a.budget_rec || '', a.date].join(','));
      });
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'grant-review-inventory.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' }}>
        <p style={{ color: '#64748b', fontSize: 14 }}>Loading inventory...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)', color: 'white', padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Grant Review Inventory</h1>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0' }}>Track and manage all federal grant application reviews</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button onClick={() => { window.location.hash = '#/app'; }} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            New Review
          </button>
          <button onClick={signOut} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: 24 }}>
        {/* Summary Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'NOFOs Reviewed', value: nofoGroups.length, sub: agencies.join(', '), accent: '#3b82f6' },
            { label: 'Unique Applications', value: totalApps, sub: 'Deduplicated by applicant', accent: '#10b981' },
            { label: 'Avg Score', value: globalAvg, sub: 'Range: ' + globalMin + ' - ' + globalMax, accent: '#8b5cf6' },
            { label: 'Review Period', value: allDates.length ? Math.ceil((new Date(allDates[allDates.length - 1]).getTime() - new Date(allDates[0]).getTime()) / 86400000) + 'd' : '--', sub: allDates.length ? formatDate(allDates[0]) + ' - ' + formatDate(allDates[allDates.length - 1]) + ', 2026' : '', accent: '#f59e0b' },
            { label: 'Budget Flags', value: totalFlags, sub: 'Reductions recommended', accent: '#ef4444' },
          ].map((card, i) => (
            <div key={i} style={{ background: 'white', borderRadius: 12, padding: 20, border: '1px solid #e2e8f0', borderLeft: '4px solid ' + card.accent }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#64748b' }}>{card.label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6, color: '#0f172a' }}>{card.value}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{card.sub}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: 10, color: '#94a3b8' }} />
            <input type="text" placeholder="Search NOFO, applicant, or agency..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '8px 14px 8px 34px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, background: 'white', width: 280 }} />
          </div>
          <select value={agencyFilter} onChange={e => setAgencyFilter(e.target.value)} style={{ padding: '8px 14px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, background: 'white' }}>
            <option value="">All Agencies</option>
            <option value="HRSA">HRSA</option>
            <option value="SAMHSA">SAMHSA</option>
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: '8px 14px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, background: 'white' }}>
            <option value="recent">Sort: Most Recent</option>
            <option value="apps">Most Applications</option>
            <option value="score_high">Highest Avg Score</option>
            <option value="score_low">Lowest Avg Score</option>
          </select>
          <div style={{ flex: 1 }} />
          <button onClick={exportCSV} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} /> Export CSV
          </button>
        </div>

        {/* Table */}
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 32 }}></th>
                <th style={thStyle}>NOFO / Program</th>
                <th style={thStyle}>Agency</th>
                <th style={{ ...thStyle, width: 70 }}>Apps</th>
                <th style={{ ...thStyle, width: 140 }}>Avg Score</th>
                <th style={thStyle}>Review Dates</th>
                <th style={{ ...thStyle, width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(g => (
                <React.Fragment key={g.nofo_number}>
                  <tr onClick={() => setExpandedNofo(expandedNofo === g.nofo_number ? null : g.nofo_number)} style={{ cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }} onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td style={tdStyle}>
                      <ChevronRight size={16} style={{ color: expandedNofo === g.nofo_number ? '#3b82f6' : '#94a3b8', transform: expandedNofo === g.nofo_number ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 700, color: '#1e3a5f', fontSize: 14 }}>{g.nofo_number}</div>
                      <div style={{ fontSize: 12, color: '#334155', marginTop: 2, fontWeight: 600 }}>{g.nofo_title}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, lineHeight: 1.5, maxWidth: 360 }}>{g.nofo_desc}</div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: g.agency === 'HRSA' ? '#dbeafe' : '#fae8ff', color: g.agency === 'HRSA' ? '#1e40af' : '#86198f' }}>
                        {g.agency}
                      </span>
                    </td>
                    <td style={tdStyle}><span style={{ fontWeight: 700, color: '#1e3a5f' }}>{g.apps.length}</span></td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, minWidth: 32, textAlign: 'right' }}>{g.avg_score}</span>
                        <div style={{ flex: 1, height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden', minWidth: 60 }}>
                          <div style={{ height: '100%', borderRadius: 4, width: g.avg_score + '%', background: barFill(g.avg_score) }} />
                        </div>
                      </div>
                    </td>
                    <td style={tdStyle}><span style={{ fontSize: 12, color: '#64748b' }}>{formatDate(g.date_start)} - {formatDate(g.date_end)}, 2026</span></td>
                    <td style={tdStyle}>
                      <button onClick={e => { e.stopPropagation(); setExpandedNofo(g.nofo_number); }} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', color: '#475569' }}>
                        View
                      </button>
                    </td>
                  </tr>
                  {expandedNofo === g.nofo_number && (
                    <tr>
                      <td colSpan={7} style={{ padding: '0 16px 16px 48px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'grid', gap: 6 }}>
                          {g.apps.map((a, i) => (
                            <div key={a.app_id} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 100px 90px 36px', gap: 12, alignItems: 'center', padding: '8px 12px', background: 'white', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}>
                              <span style={{ fontWeight: 800, color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>#{i + 1}</span>
                              <span style={{ fontWeight: 600 }}>{a.name}</span>
                              <span style={{ fontWeight: 700, color: scoreColor(a.score) }}>{a.score}/100</span>
                              <span style={{ fontSize: 12, color: '#64748b' }}>{formatBudget(a.budget_yr1)}</span>
                              <span style={{ fontSize: 12, color: '#64748b' }}>{formatDate(a.date)}</span>
                              <button onClick={() => { window.location.hash = '#/reviews/' + a.review_id; }} title="Open review" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', padding: 4 }}>
                                <ExternalLink size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>No reviews match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const thStyle: React.CSSProperties = {
  background: '#f8fafc', textAlign: 'left', padding: '12px 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#64748b', borderBottom: '2px solid #e2e8f0',
};

const tdStyle: React.CSSProperties = {
  padding: '14px 16px', fontSize: 13, verticalAlign: 'top',
};

export default ReviewInventory;
