'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getJobRunsData, JobRun } from '@/lib/data';
import { StatusPill } from '@/components/StatusPill';
import { Search, Clock, ChevronRight, ChevronLeft } from 'lucide-react';

function useIsWide() {
  const [w, setW] = useState<boolean>(typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  useEffect(() => {
    const onR = () => setW(window.innerWidth >= 1024);
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);
  return w;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function JobRunsPage() {
  const router = useRouter();
  const isWide = useIsWide();
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    const filters = statusFilter ? { status: statusFilter } : undefined;
    getJobRunsData(filters).then(data => {
      setRuns(data);
      setLoading(false);
    });
  }, [statusFilter]);

  const filtered = useMemo(() => {
    if (!search) return runs;
    const q = search.toLowerCase();
    return runs.filter(r =>
      r.id.toLowerCase().includes(q) ||
      r.jobName.toLowerCase().includes(q) ||
      r.triggeredBy.toLowerCase().includes(q)
    );
  }, [runs, search]);

  return (
    <div className="vstack" style={{ gap: 'var(--s4)' }}>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-col sm:flex-row">
        <button onClick={() => router.push('/jobs')} className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}>
          <ChevronLeft className="w-4 h-4" /> <span className="hidden md:inline">Job</span>
        </button>
        <div className="relative w-full sm:grow">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Cerca run id, job, trigger..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input" style={{ width: 'auto', minWidth: 140 }}>
          <option value="">Tutti gli stati</option>
          <option value="running">In corso</option>
          <option value="success">Completato</option>
          <option value="failed">Fallito</option>
          <option value="cancelled">Cancellato</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-7 h-7 border-2 border-[color:var(--accent-raw)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card card-body text-center">
          <Clock className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
          <p className="typ-caption">Nessuna esecuzione trovata.</p>
        </div>
      ) : isWide ? (
        /* Desktop: table-ish with grid columns */
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="grid items-center gap-3 px-4 py-2.5" style={{ gridTemplateColumns: '180px 1fr 120px 140px 80px 120px 90px', background: 'var(--card-muted)', borderBottom: '1px solid var(--hairline-soft)' }}>
            <span className="typ-micro">Run ID</span>
            <span className="typ-micro">Job</span>
            <span className="typ-micro">Stato</span>
            <span className="typ-micro">Iniziato</span>
            <span className="typ-micro">Durata</span>
            <span className="typ-micro">Trigger</span>
            <span className="typ-micro" style={{ textAlign: 'right' }}>Errori</span>
          </div>
          {filtered.map(run => (
            <div
              key={run.id}
              onClick={() => router.push(`/jobs/runs/${run.id}`)}
              className="grid items-center gap-3 px-4 py-3 cursor-pointer transition-colors"
              style={{ gridTemplateColumns: '180px 1fr 120px 140px 80px 120px 90px', borderBottom: '1px solid var(--hairline-soft)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--card-muted)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <span className="typ-mono truncate" style={{ fontSize: 12 }}>{run.id}</span>
              <span className="typ-label truncate">{run.jobName}</span>
              <StatusPill status={run.status} size="sm" />
              <span className="typ-caption">{fmtDate(run.startedAt)}</span>
              <span className="typ-mono" style={{ fontSize: 12 }}>{run.duration ? `${run.duration}s` : '-'}</span>
              <span className="typ-caption truncate">{run.triggeredBy}</span>
              <span className="typ-mono" style={{ fontSize: 12, textAlign: 'right', color: run.errorCount > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                {run.errorCount}
              </span>
            </div>
          ))}
        </div>
      ) : (
        /* Mobile: card list */
        <div className="vstack-tight">
          {filtered.map(run => (
            <div
              key={run.id}
              onClick={() => router.push(`/jobs/runs/${run.id}`)}
              className="card card-hover card-body"
              style={{ cursor: 'pointer' }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <StatusPill status={run.status} size="sm" />
                {run.errorCount > 0 && (
                  <span className="pill pill-err" style={{ fontSize: 10, padding: '1px 6px' }}>
                    {run.errorCount} err
                  </span>
                )}
                <span className="typ-micro ml-auto">{run.triggeredBy}</span>
              </div>
              <div className="typ-label mt-2">{run.jobName}</div>
              <div className="typ-caption mt-0.5 typ-mono" style={{ fontSize: 11 }}>{run.id}</div>
              <div className="flex items-center justify-between gap-3 mt-2 pt-2 border-t border-[color:var(--hairline-soft)]">
                <span className="typ-caption inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {fmtDate(run.startedAt)} · {run.duration ? `${run.duration}s` : '-'}
                </span>
                <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
              </div>
              <div className="flex items-center gap-3 mt-2 typ-caption">
                <span>Scan: <strong>{run.scannedCount}</strong></span>
                <span>Ins: <strong>{run.insertedCount}</strong></span>
                <span>Upd: <strong>{run.updatedCount}</strong></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
