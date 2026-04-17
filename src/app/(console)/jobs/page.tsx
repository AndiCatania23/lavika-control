'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getJobs, Job } from '@/lib/data';
import { saveRunSourceMapping } from '@/lib/jobRunSourceRegistry';
import { SectionHeader } from '@/components/SectionHeader';
import { StatusPill } from '@/components/StatusPill';
import { useToast } from '@/lib/toast';
import { Play, Clock, Calendar, ChevronRight } from 'lucide-react';

// Map from quickSource.id → Supabase content_formats.id
const SOURCE_FORMAT_MAP: Record<string, string> = {
  'catanista-live':              'catanista',
  'serie-c-2025-2026':           'highlights',
  'catania-press-conference':    'press-conference',
  'unica-sport-live':            'unica-sport',
  'match-reaction-2025-2026':    'match-reaction',
};


export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [runningSourceId, setRunningSourceId] = useState<string | null>(null);
  const [hasRunningJob, setHasRunningJob] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  // formatId → cover_horizontal_url from Supabase/R2
  const [formatCovers, setFormatCovers] = useState<Record<string, string>>({});
  const router = useRouter();
  const { showToast } = useToast();

  const refreshQueueState = async () => {
    const [running, pending] = await Promise.all([
      fetch('/api/jobs/runs?status=running', { cache: 'no-store' })
        .then(r => r.ok ? r.json() as Promise<Array<{ id: string }>> : [])
        .catch(() => []),
      fetch('/api/jobs/runs?status=pending', { cache: 'no-store' })
        .then(r => r.ok ? r.json() as Promise<Array<{ id: string }>> : [])
        .catch(() => []),
    ]);
    setHasRunningJob(running.length > 0);
    setPendingCount(pending.length);
  };

  const quickSources = [
    { id: 'catanista-live',              title: 'CATANISTA LIVE'    },
    { id: 'serie-c-2025-2026',           title: 'HIGHLIGHTS'        },
    { id: 'catania-press-conference',    title: 'PRESS CONFERENCE'  },
    { id: 'unica-sport-live',            title: 'UNICA SPORT'       },
    { id: 'match-reaction-2025-2026',    title: 'MATCH REACTION'    },
  ];

  useEffect(() => {
    Promise.all([
      getJobs(),
      fetch('/api/jobs/runs?status=running', { cache: 'no-store' })
        .then(response => response.ok ? response.json() as Promise<Array<{ id: string }>> : [])
        .catch(() => []),
      fetch('/api/jobs/runs?status=pending', { cache: 'no-store' })
        .then(response => response.ok ? response.json() as Promise<Array<{ id: string }>> : [])
        .catch(() => []),
      fetch('/api/media/formats')
        .then(r => r.ok ? r.json() as Promise<Array<{ id: string; cover_horizontal_url: string | null }>> : [])
        .catch(() => []),
    ]).then(([jobsData, runningRuns, pendingRuns, formatsData]) => {
      setJobs(jobsData);
      setHasRunningJob(runningRuns.length > 0);
      setPendingCount(pendingRuns.length);
      const covers: Record<string, string> = {};
      for (const fmt of formatsData) {
        if (fmt.cover_horizontal_url) covers[fmt.id] = fmt.cover_horizontal_url;
      }
      setFormatCovers(covers);
      setLoading(false);
    });
  }, []);

  const handleRunJob = async (e: React.MouseEvent, job: Job) => {
    e.stopPropagation();
    setRunningJobId(job.id);

    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id, triggeredBy: 'manual' }),
      });

      if (!response.ok) {
        if (response.status === 409) {
          showToast('warning', 'Un sync è già in corso — riprova tra poco');
          setHasRunningJob(true);
        } else {
          const body = await response.json().catch(() => null) as { error?: string } | null;
          showToast('error', `Trigger fallito: ${body?.error || response.status}`);
        }
      } else {
        showToast('success', 'Job accodato');
        setPendingCount(c => c + 1);
      }
    } catch (error) {
      showToast('error', `Errore rete: ${error instanceof Error ? error.message : 'unknown'}`);
    }

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
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: 'job_sync_video',
          triggeredBy: 'manual',
          source: sourceId,
        }),
      });

      if (!response.ok) {
        if (response.status === 409) {
          showToast('warning', 'Un sync è già in corso — riprova tra poco');
          setHasRunningJob(true);
        } else {
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
    } catch (error) {
      showToast('error', `Errore rete: ${error instanceof Error ? error.message : 'unknown'}`);
    }

    setTimeout(async () => {
      const { getJobs: reloadJobs } = await import('@/lib/data');
      reloadJobs().then(data => setJobs(data));
      setRunningSourceId(null);
      refreshQueueState();
    }, 6000);
  };

  const formatDate = (date: string | null) => {
    if (!date) return 'Mai';
    return new Date(date).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader 
        title="Job" 
        description="Lista job dalla piattaforma"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {quickSources.map(source => (
          <div
            key={source.id}
            className="bg-card border border-border rounded-lg p-4 w-full"
          >
            <div className="mb-3 overflow-hidden rounded-md border border-border bg-muted/20 aspect-video">
              {formatCovers[SOURCE_FORMAT_MAP[source.id]] ? (
                <Image
                  src={formatCovers[SOURCE_FORMAT_MAP[source.id]]}
                  alt={`${source.title} card`}
                  width={640}
                  height={360}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs">
                  {source.title}
                </div>
              )}
            </div>
            <h3 className="font-semibold text-foreground text-base">{source.title}</h3>
            <div className="text-xs text-muted-foreground mt-1">Sync Video</div>
            <div className="flex items-center gap-2 pt-3 mt-3 border-t border-border">
              <button
                onClick={() => handleRunSource(source.id)}
                disabled={runningSourceId === source.id || hasRunningJob}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                <Play className="w-3 h-3" />
                {runningSourceId === source.id
                  ? 'Accodamento...'
                  : hasRunningJob
                    ? 'Job attivo'
                    : pendingCount > 0
                      ? `ESEGUI (${pendingCount} in coda)`
                      : 'ESEGUI'}
              </button>
              <button
                onClick={() => router.push(`/jobs/job_sync_video?source=${encodeURIComponent(source.id)}`)}
                className="flex items-center gap-1 px-3 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-muted/50"
              >
                Dettagli
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {jobs.map(job => (
          <div
            key={job.id}
            onClick={() => router.push(`/jobs/${job.id}`)}
            className="bg-card border border-border rounded-lg p-4 hover:border-primary/50 cursor-pointer transition-all active:scale-[0.99]"
          >
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-semibold text-foreground text-base">{job.name}</h3>
              <StatusPill status={job.status} size="sm" />
            </div>
            
            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{job.description}</p>
            
            <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
              {job.schedule ? (
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{job.schedule}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  <span>Manuale</span>
                </div>
              )}
            </div>

            <div className="text-xs text-muted-foreground mb-3">
              Ultima esecuzione: {formatDate(job.lastRun)}
            </div>
            
            <div className="flex items-center gap-2 pt-3 border-t border-border">
              {job.schedule === null && job.status !== 'paused' && (
                <button
                  onClick={(e) => handleRunJob(e, job)}
                  disabled={runningJobId === job.id || hasRunningJob}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  <Play className="w-3 h-3" />
                  {runningJobId === job.id
                    ? 'Accodamento...'
                    : hasRunningJob
                      ? 'Job attivo'
                      : pendingCount > 0
                        ? `ESEGUI (${pendingCount} in coda)`
                        : 'ESEGUI'}
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); router.push(`/jobs/${job.id}`); }}
                className="flex items-center gap-1 px-3 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-muted/50"
              >
                Dettagli
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
