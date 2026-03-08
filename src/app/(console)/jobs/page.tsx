'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getJobs, Job } from '@/lib/data';
import { saveRunSourceMapping } from '@/lib/jobRunSourceRegistry';
import { SectionHeader } from '@/components/SectionHeader';
import { StatusPill } from '@/components/StatusPill';
import { Play, Clock, Calendar, ChevronRight } from 'lucide-react';

type YouTubeCookiesUpdateResponse = {
  ok?: boolean;
  message?: string;
  missing?: string[];
  hint?: string;
  stats?: {
    filteredRows?: number;
    secretLength?: number;
    updatedSecrets?: string[];
  };
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [runningSourceId, setRunningSourceId] = useState<string | null>(null);
  const [hasRunningJob, setHasRunningJob] = useState(false);
  const [cookiesFile, setCookiesFile] = useState<File | null>(null);
  const [cookiesLoading, setCookiesLoading] = useState(false);
  const [cookiesError, setCookiesError] = useState<string | null>(null);
  const [cookiesResult, setCookiesResult] = useState<YouTubeCookiesUpdateResponse | null>(null);
  const [isCookiesPanelOpen, setIsCookiesPanelOpen] = useState(false);
  const router = useRouter();

  const quickSources = [
    {
      id: 'catanista-live',
      title: 'CATANISTA LIVE',
      imageUrl: '/immagini/Format Cover/Catanista/Catanista - card orizzontale.webp',
    },
    {
      id: 'serie-c-2025-2026',
      title: 'HIGHLIGHTS',
      imageUrl: '/immagini/Format Cover/highlights/highlights - card orizzontale.webp',
    },
    {
      id: 'catania-press-conference',
      title: 'PRESS CONFERENCE',
      imageUrl: '/immagini/Format Cover/Press Conference/press conference - card orizzontale.webp',
    },
  ];

  useEffect(() => {
    Promise.all([
      getJobs(),
      fetch('/api/jobs/runs?status=running', { cache: 'no-store' })
        .then(response => response.ok ? response.json() as Promise<Array<{ id: string }>> : [])
        .catch(() => []),
    ]).then(([jobsData, runningRuns]) => {
      setJobs(jobsData);
      setHasRunningJob(runningRuns.length > 0);
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
        console.error('Job trigger failed');
        if (response.status === 409) {
          setHasRunningJob(true);
        }
      } else {
        setHasRunningJob(true);
      }
    } catch (error) {
      console.error('Error triggering job:', error);
    }
    
    setTimeout(async () => {
      const { getJobs: reloadJobs } = await import('@/lib/data');
      reloadJobs().then(data => setJobs(data));
      setRunningJobId(null);
      fetch('/api/jobs/runs?status=running', { cache: 'no-store' })
        .then(response => response.ok ? response.json() as Promise<Array<{ id: string }>> : [])
        .then(runs => setHasRunningJob(runs.length > 0))
        .catch(() => setHasRunningJob(false));
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
        console.error('Source trigger failed');
        if (response.status === 409) {
          setHasRunningJob(true);
        }
      } else {
        const payload = await response.json().catch(() => null) as { run?: { id?: string } } | null;
        const runId = payload?.run?.id;
        if (runId) {
          saveRunSourceMapping(runId, sourceId);
        }
        setHasRunningJob(true);
      }
    } catch (error) {
      console.error('Error triggering source:', error);
    }

    setTimeout(async () => {
      const { getJobs: reloadJobs } = await import('@/lib/data');
      reloadJobs().then(data => setJobs(data));
      setRunningSourceId(null);
      fetch('/api/jobs/runs?status=running', { cache: 'no-store' })
        .then(response => response.ok ? response.json() as Promise<Array<{ id: string }>> : [])
        .then(runs => setHasRunningJob(runs.length > 0))
        .catch(() => setHasRunningJob(false));
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

  const handleUpdateYouTubeCookies = async () => {
    setCookiesError(null);
    setCookiesResult(null);

    if (!cookiesFile || !cookiesFile.name.toLowerCase().endsWith('.txt')) {
      setCookiesError('Seleziona un file cookies.txt valido');
      return;
    }

    setCookiesLoading(true);

    try {
      const cookiesText = await cookiesFile.text();
      if (!cookiesText.trim()) {
        setCookiesError('file vuoto/non valido');
        return;
      }

      const formData = new FormData();
      formData.append('cookies', cookiesFile);

      const response = await fetch('/api/jobs/update-youtube-cookies', {
        method: 'POST',
        body: formData,
      });

      let payload: YouTubeCookiesUpdateResponse | null = null;
      try {
        payload = (await response.json()) as YouTubeCookiesUpdateResponse;
      } catch {
        payload = null;
      }

      if (response.ok) {
        setCookiesResult(payload ?? { ok: true, message: 'Cookies YouTube/Google aggiornati' });
        return;
      }

      if (response.status === 400) {
        setCookiesError('file vuoto/non valido');
      } else if (response.status === 401) {
        setCookiesError(payload?.message ?? 'Token GitHub non valido');
      } else if (response.status === 403) {
        setCookiesError(payload?.message ?? 'Permessi GitHub insufficienti per secrets/workflow');
      } else if (response.status === 503) {
        setCookiesError('backend non configurato (ADMIN_API_KEY mancante)');
      } else if (response.status === 500) {
        if (payload?.missing?.length) {
          const missingList = payload.missing.join(', ');
          const hint = payload.hint ? ` (${payload.hint})` : '';
          setCookiesError(`${payload.message ?? 'Config GitHub mancante'}: ${missingList}${hint}`);
        } else {
          setCookiesError(payload?.message ?? 'Errore backend');
        }
      } else {
        setCookiesError(payload?.message ?? `Errore ${response.status}`);
      }
    } catch {
      setCookiesError('Errore di rete durante aggiornamento cookies');
    } finally {
      setCookiesLoading(false);
    }
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {quickSources.map(source => (
          <div
            key={source.id}
            className="bg-card border border-border rounded-lg p-4 w-full"
          >
            <div className="mb-3 overflow-hidden rounded-md border border-border bg-muted/20 aspect-video">
              <Image
                src={source.imageUrl}
                alt={`${source.title} card`}
                width={640}
                height={360}
                className="h-full w-full object-cover"
              />
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
                {runningSourceId === source.id ? 'Esecuzione...' : hasRunningJob ? 'Job attivo' : 'ESEGUI'}
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

      <div className="bg-card border border-border rounded-lg">
        <button
          onClick={() => setIsCookiesPanelOpen((open) => !open)}
          className="w-full flex items-center justify-between p-4 text-left"
        >
          <span className="font-semibold text-foreground text-base">Aggiorna Cookies YouTube/Google</span>
          <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isCookiesPanelOpen ? 'rotate-90' : ''}`} />
        </button>

        {isCookiesPanelOpen && (
          <div className="px-4 pb-4 space-y-3">
            <div className="grid grid-cols-1 gap-3">
              <label className="space-y-1">
                <span className="block text-sm text-muted-foreground">cookies.txt</span>
                <input
                  type="file"
                  accept=".txt,text/plain"
                  onChange={(event) => setCookiesFile(event.target.files?.[0] ?? null)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-medium"
                />
              </label>
            </div>

            <button
              onClick={handleUpdateYouTubeCookies}
              disabled={cookiesLoading}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {cookiesLoading ? 'Aggiornamento in corso...' : 'Aggiorna Cookies YouTube/Google'}
            </button>

            <div className="rounded-lg border border-border bg-background p-3 text-sm">
              {cookiesLoading && <p className="text-muted-foreground">Upload cookies in corso...</p>}
              {!cookiesLoading && cookiesError && <p className="text-red-500">{cookiesError}</p>}
              {!cookiesLoading && cookiesResult && (
                <div className="space-y-1 text-foreground">
                  <p>ok: {String(Boolean(cookiesResult.ok))}</p>
                  <p>message: {cookiesResult.message ?? '-'}</p>
                  <p>filteredRows: {cookiesResult.stats?.filteredRows ?? '-'}</p>
                  <p>secretLength: {cookiesResult.stats?.secretLength ?? '-'}</p>
                </div>
              )}
              {!cookiesLoading && !cookiesError && !cookiesResult && (
                <p className="text-muted-foreground">Nessun aggiornamento eseguito.</p>
              )}
            </div>
          </div>
        )}
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
                  {runningJobId === job.id ? 'Esecuzione...' : hasRunningJob ? 'Job attivo' : 'ESEGUI'}
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
