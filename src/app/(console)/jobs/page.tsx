'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getJobs, Job } from '@/lib/data';
import { saveRunSourceMapping } from '@/lib/jobRunSourceRegistry';
import { StatusPill } from '@/components/StatusPill';
import { useToast } from '@/lib/toast';
import { Play, Clock, Calendar, ChevronRight, Workflow, Video, RefreshCw, Settings } from 'lucide-react';
import Link from 'next/link';

/**
 * Quick sync per format. L'API risolve a runtime la source ENABLED per
 * quel format_id (in video_sources). Cosi' non serve mantenere mapping
 * hardcoded che diventano stantii ad ogni cambio stagione (es. quando
 * 'serie-c-2025-2026' diventa disabled e arriva 'play-off-2025-2026').
 */
const QUICK_FORMATS = [
  { formatId: 'catanista',         title: 'CATANISTA LIVE'   },
  { formatId: 'highlights',        title: 'HIGHLIGHTS'       },
  { formatId: 'press-conference',  title: 'PRESS CONFERENCE' },
  { formatId: 'unica-sport',       title: 'UNICA SPORT'      },
  { formatId: 'match-reaction',    title: 'MATCH REACTION'   },
];

function formatDate(date: string | null) {
  if (!date) return 'Mai';
  return new Date(date).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [runningFormatId, setRunningFormatId] = useState<string | null>(null);
  const [hasRunningJob, setHasRunningJob] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [formatCovers, setFormatCovers] = useState<Record<string, string>>({});
  const router = useRouter();
  const { showToast } = useToast();

  const refreshQueueState = async () => {
    const [running, pending] = await Promise.all([
      fetch('/api/jobs/runs?status=running', { cache: 'no-store' }).then(r => r.ok ? r.json() as Promise<Array<{ id: string }>> : []).catch(() => []),
      fetch('/api/jobs/runs?status=pending', { cache: 'no-store' }).then(r => r.ok ? r.json() as Promise<Array<{ id: string }>> : []).catch(() => []),
    ]);
    setHasRunningJob(running.length > 0);
    setPendingCount(pending.length);
  };

  useEffect(() => {
    Promise.all([
      getJobs(),
      fetch('/api/jobs/runs?status=running', { cache: 'no-store' }).then(r => r.ok ? r.json() as Promise<Array<{ id: string }>> : []).catch(() => []),
      fetch('/api/jobs/runs?status=pending', { cache: 'no-store' }).then(r => r.ok ? r.json() as Promise<Array<{ id: string }>> : []).catch(() => []),
      fetch('/api/media/formats').then(r => r.ok ? r.json() as Promise<Array<{ id: string; cover_horizontal_url: string | null }>> : []).catch(() => []),
    ]).then(([jobsData, runningRuns, pendingRuns, formatsData]) => {
      setJobs(jobsData);
      setHasRunningJob(runningRuns.length > 0);
      setPendingCount(pendingRuns.length);
      const covers: Record<string, string> = {};
      for (const fmt of formatsData) if (fmt.cover_horizontal_url) covers[fmt.id] = fmt.cover_horizontal_url;
      setFormatCovers(covers);
      setLoading(false);
    });
  }, []);

  const handleRunJob = async (e: React.MouseEvent, job: Job) => {
    e.stopPropagation();
    setRunningJobId(job.id);
    try {
      const response = await fetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: job.id, triggeredBy: 'manual' }) });
      if (!response.ok) {
        if (response.status === 409) { showToast('warning', 'Un sync è già in corso — riprova tra poco'); setHasRunningJob(true); }
        else {
          const body = await response.json().catch(() => null) as { error?: string } | null;
          showToast('error', `Trigger fallito: ${body?.error || response.status}`);
        }
      } else { showToast('success', 'Job accodato'); setPendingCount(c => c + 1); }
    } catch (error) { showToast('error', `Errore rete: ${error instanceof Error ? error.message : 'unknown'}`); }
    setTimeout(async () => {
      const { getJobs: reloadJobs } = await import('@/lib/data');
      reloadJobs().then(data => setJobs(data));
      setRunningJobId(null);
      refreshQueueState();
    }, 6000);
  };

  const handleRunFormat = async (formatId: string) => {
    setRunningFormatId(formatId);
    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: 'job_sync_video', triggeredBy: 'manual', formatId }),
      });
      if (!response.ok) {
        if (response.status === 409) { showToast('warning', 'Un sync è già in corso — riprova tra poco'); setHasRunningJob(true); }
        else {
          const body = await response.json().catch(() => null) as { error?: string } | null;
          showToast('error', `Trigger fallito: ${body?.error || response.status}`);
        }
      } else {
        // L'API risolve formatId → sourceId enabled e lo torna in resolvedSource.
        const payload = await response.json().catch(() => null) as { run?: { id?: string }; resolvedSource?: string } | null;
        const runId = payload?.run?.id;
        const resolvedSource = payload?.resolvedSource ?? formatId;
        if (runId) saveRunSourceMapping(runId, resolvedSource);
        showToast('success', `Accodato: ${resolvedSource}`);
        setPendingCount(c => c + 1);
      }
    } catch (error) { showToast('error', `Errore rete: ${error instanceof Error ? error.message : 'unknown'}`); }
    setTimeout(async () => {
      const { getJobs: reloadJobs } = await import('@/lib/data');
      reloadJobs().then(data => setJobs(data));
      setRunningFormatId(null);
      refreshQueueState();
    }, 6000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-2 border-[color:var(--accent-raw)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="vstack" style={{ gap: 'var(--s5)' }}>

      {/* Queue state banner */}
      <div className="flex items-center gap-2 flex-wrap">
        {hasRunningJob ? (
          <span className="pill pill-info">
            <span className="dot dot-info dot-pulse" />
            Sync in corso
          </span>
        ) : pendingCount > 0 ? (
          <span className="pill pill-warn">
            <Clock className="w-3 h-3" />
            {pendingCount} in coda
          </span>
        ) : (
          <span className="pill pill-ok">
            <span className="dot dot-ok" />
            Queue libera
          </span>
        )}
        <div className="grow" />
        <button onClick={() => { refreshQueueState(); getJobs().then(setJobs); }} className="btn btn-ghost btn-sm">
          <RefreshCw className="w-4 h-4" />
          <span className="hidden md:inline">Aggiorna</span>
        </button>
        <button onClick={() => router.push('/jobs/runs')} className="btn btn-ghost btn-sm">
          <Clock className="w-4 h-4" />
          <span className="hidden md:inline">Esecuzioni</span>
        </button>
        <Link href="/content/formats" className="btn btn-ghost btn-sm">
          <Settings className="w-4 h-4" />
          <span className="hidden md:inline">Configurazione Format</span>
        </Link>
      </div>

      {/* Quick sync sources — compact row with thumb + title + action */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Video className="w-4 h-4 text-[color:var(--accent-raw)]" strokeWidth={1.75} />
          <h2 className="typ-h2 grow">Sync rapido</h2>
          <span className="typ-micro">{QUICK_FORMATS.length} format</span>
        </div>
        <div className="vstack-tight">
          {QUICK_FORMATS.map(fmt => {
            const coverUrl = formatCovers[fmt.formatId];
            const running = runningFormatId === fmt.formatId;
            return (
              <div key={fmt.formatId} className="card" style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Thumb 16:9 (72×41) */}
                <div className="shrink-0 rounded-[var(--r-sm)] overflow-hidden" style={{ width: 72, height: 41, background: 'var(--card-muted)' }}>
                  {coverUrl ? (
                    <Image src={coverUrl} alt={fmt.title} width={288} height={162} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Video className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                    </div>
                  )}
                </div>

                {/* Title + subtitle */}
                <div className="grow min-w-0">
                  <div className="typ-label truncate">{fmt.title}</div>
                  <div className="typ-micro truncate">Sync Video</div>
                </div>

                {/* Actions */}
                <button
                  onClick={() => handleRunFormat(fmt.formatId)}
                  disabled={running || hasRunningJob}
                  className="btn btn-primary btn-sm shrink-0"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">
                    {running ? 'Accodo…' : hasRunningJob ? 'Attivo' : 'Esegui'}
                  </span>
                </button>
                <button
                  onClick={() => router.push(`/jobs/job_sync_video?formatId=${encodeURIComponent(fmt.formatId)}`)}
                  className="btn btn-ghost btn-sm shrink-0"
                  aria-label="Dettagli"
                >
                  <span className="hidden sm:inline">Dettagli</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Other jobs — compact row with status dot + info + action */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Workflow className="w-4 h-4 text-[color:var(--accent-raw)]" strokeWidth={1.75} />
          <h2 className="typ-h2 grow">Altri job</h2>
          <span className="typ-micro">{jobs.length}</span>
        </div>
        <div className="vstack-tight">
          {jobs.map(job => {
            const running = runningJobId === job.id;
            const canRun = job.schedule === null && job.status !== 'paused';
            return (
              <div
                key={job.id}
                onClick={() => router.push(`/jobs/${job.id}`)}
                className="card card-hover"
                style={{ cursor: 'pointer', padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}
              >
                {/* Status icon block */}
                <div className="shrink-0 inline-grid place-items-center" style={{ width: 36, height: 36, borderRadius: 'var(--r-sm)', background: 'var(--card-muted)' }}>
                  <Workflow className="w-4 h-4" style={{ color: 'var(--text-muted)' }} strokeWidth={1.75} />
                </div>

                {/* Info */}
                <div className="grow min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="typ-label truncate">{job.name}</div>
                    <StatusPill status={job.status} size="sm" />
                  </div>
                  <div className="typ-caption truncate mt-0.5">
                    {job.schedule ? (
                      <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{job.schedule}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" />Manuale</span>
                    )}
                    <span className="mx-1.5">·</span>
                    Ultima: {formatDate(job.lastRun)}
                  </div>
                </div>

                {/* Actions */}
                {canRun && (
                  <button
                    onClick={(e) => handleRunJob(e, job)}
                    disabled={running || hasRunningJob}
                    className="btn btn-primary btn-sm shrink-0"
                    style={{ minWidth: 96 }}
                  >
                    <Play className="w-3.5 h-3.5" />
                    {running ? 'Accodo…' : hasRunningJob ? 'Attivo' : 'Esegui'}
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); router.push(`/jobs/${job.id}`); }}
                  className="btn btn-ghost btn-sm shrink-0"
                  aria-label="Dettagli"
                >
                  <span className="hidden sm:inline">Dettagli</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
