'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getJobs, Job } from '@/lib/data';
import { saveRunSourceMapping } from '@/lib/jobRunSourceRegistry';
import { StatusPill } from '@/components/StatusPill';
import { useToast } from '@/lib/toast';
import { Play, Clock, Calendar, ChevronRight, Workflow, Video, RefreshCw } from 'lucide-react';

// Map from quickSource.id → Supabase content_formats.id
const SOURCE_FORMAT_MAP: Record<string, string> = {
  'catanista-live':              'catanista',
  'serie-c-2025-2026':           'highlights',
  'catania-press-conference':    'press-conference',
  'unica-sport-live':            'unica-sport',
  'match-reaction-2025-2026':    'match-reaction',
};

const QUICK_SOURCES = [
  { id: 'catanista-live',              title: 'CATANISTA LIVE'    },
  { id: 'serie-c-2025-2026',           title: 'HIGHLIGHTS'        },
  { id: 'catania-press-conference',    title: 'PRESS CONFERENCE'  },
  { id: 'unica-sport-live',            title: 'UNICA SPORT'       },
  { id: 'match-reaction-2025-2026',    title: 'MATCH REACTION'    },
];

function formatDate(date: string | null) {
  if (!date) return 'Mai';
  return new Date(date).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [runningSourceId, setRunningSourceId] = useState<string | null>(null);
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

  const handleRunSource = async (sourceId: string) => {
    setRunningSourceId(sourceId);
    try {
      const response = await fetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: 'job_sync_video', triggeredBy: 'manual', source: sourceId }) });
      if (!response.ok) {
        if (response.status === 409) { showToast('warning', 'Un sync è già in corso — riprova tra poco'); setHasRunningJob(true); }
        else {
          const body = await response.json().catch(() => null) as { error?: string } | null;
          showToast('error', `Trigger fallito: ${body?.error || response.status}`);
        }
      } else {
        const payload = await response.json().catch(() => null) as { run?: { id?: string } } | null;
        const runId = payload?.run?.id;
        if (runId) saveRunSourceMapping(runId, sourceId);
        showToast('success', `Accodato: ${sourceId}`);
        setPendingCount(c => c + 1);
      }
    } catch (error) { showToast('error', `Errore rete: ${error instanceof Error ? error.message : 'unknown'}`); }
    setTimeout(async () => {
      const { getJobs: reloadJobs } = await import('@/lib/data');
      reloadJobs().then(data => setJobs(data));
      setRunningSourceId(null);
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
      </div>

      {/* Quick sync sources */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Video className="w-4 h-4 text-[color:var(--accent-raw)]" strokeWidth={1.75} />
          <h2 className="typ-h2 grow">Sync rapido</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {QUICK_SOURCES.map(source => {
            const coverUrl = formatCovers[SOURCE_FORMAT_MAP[source.id]];
            const running = runningSourceId === source.id;
            return (
              <div key={source.id} className="card card-body">
                <div className="relative aspect-video rounded-[var(--r-sm)] overflow-hidden mb-3" style={{ background: 'var(--card-muted)' }}>
                  {coverUrl ? (
                    <Image src={coverUrl} alt={source.title} width={640} height={360} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center typ-caption">{source.title}</div>
                  )}
                </div>
                <h3 className="typ-label">{source.title}</h3>
                <div className="typ-caption mt-0.5">Sync Video</div>
                <div className="flex items-center gap-2 pt-3 mt-3 border-t border-[color:var(--hairline-soft)]">
                  <button
                    onClick={() => handleRunSource(source.id)}
                    disabled={running || hasRunningJob}
                    className="btn btn-primary btn-sm grow"
                  >
                    <Play className="w-3.5 h-3.5" />
                    {running ? 'Accodo…' : hasRunningJob ? 'Attivo' : 'Esegui'}
                  </button>
                  <button
                    onClick={() => router.push(`/jobs/job_sync_video?source=${encodeURIComponent(source.id)}`)}
                    className="btn btn-ghost btn-sm btn-icon"
                    aria-label="Dettagli"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Other jobs */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Workflow className="w-4 h-4 text-[color:var(--accent-raw)]" strokeWidth={1.75} />
          <h2 className="typ-h2 grow">Altri job</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {jobs.map(job => {
            const running = runningJobId === job.id;
            return (
              <div
                key={job.id}
                onClick={() => router.push(`/jobs/${job.id}`)}
                className="card card-hover card-body"
                style={{ cursor: 'pointer' }}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="typ-label grow">{job.name}</h3>
                  <StatusPill status={job.status} size="sm" />
                </div>
                <p className="typ-caption truncate-2 mt-1.5">{job.description}</p>

                <div className="flex items-center gap-3 typ-caption mt-3">
                  {job.schedule ? (
                    <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{job.schedule}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" />Manuale</span>
                  )}
                </div>
                <div className="typ-caption mt-1">Ultima: {formatDate(job.lastRun)}</div>

                <div className="flex items-center gap-2 pt-3 mt-3 border-t border-[color:var(--hairline-soft)]">
                  {job.schedule === null && job.status !== 'paused' && (
                    <button
                      onClick={(e) => handleRunJob(e, job)}
                      disabled={running || hasRunningJob}
                      className="btn btn-primary btn-sm grow"
                    >
                      <Play className="w-3.5 h-3.5" />
                      {running ? 'Accodo…' : hasRunningJob ? 'Attivo' : 'Esegui'}
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); router.push(`/jobs/${job.id}`); }}
                    className="btn btn-ghost btn-sm btn-icon"
                    aria-label="Dettagli"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
