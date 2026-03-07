'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { getJobById, getJobRunsData, getErrorsData, Job, JobRun, ErrorLog } from '@/lib/data';
import { getRunSourceMapping, saveRunSourceMapping } from '@/lib/jobRunSourceRegistry';
import { StatusPill } from '@/components/StatusPill';
import { Play, ArrowLeft, Clock, Calendar, CheckCircle, XCircle, AlertTriangle, CircleDashed, Ban } from 'lucide-react';

type JobSourceSummary = {
  title: string;
  id: string;
  source: string;
  scope: string;
  filters: string;
  imageUrl: string;
};

type JobSummary = {
  objective: string;
  output: string;
  mode: string;
  sources: JobSourceSummary[];
};

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = params.id as string;
  const selectedSourceId = searchParams.get('source');

  const [job, setJob] = useState<Job | null>(null);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [visibleErrors, setVisibleErrors] = useState(10);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const getJobSummary = (id: string, sourceId?: string | null): JobSummary | null => {
    if (id !== 'job_sync_video') return null;

    const sources: JobSourceSummary[] = [
      {
        id: 'catanista-live',
        title: 'CATANISTA LIVE',
        source: 'Facebook (catanista-live)',
        scope: 'Live Catanista con naming a prefisso data.',
        filters: 'Durata 5m-4h, parole chiave CATANISTA LIVE, esclusi Clip/Short.',
        imageUrl: '/immagini/Format Cover/Catanista/Catanista - card orizzontale.webp',
      },
      {
        id: 'serie-c-2025-2026',
        title: 'HIGHLIGHTS',
        source: 'YouTube playlist Serie C (serie-c-2025-2026)',
        scope: 'Partite categoria highlights stagione 2025/2026.',
        filters: 'Titoli con CATANIA, durata 1m-60m, esclusi Allenamento/Primavera/Under.',
        imageUrl: '/immagini/Format Cover/highlights/highlights - card orizzontale.webp',
      },
      {
        id: 'catania-press-conference',
        title: 'PRESS CONFERENCE',
        source: 'YouTube @officialcataniafc streams (catania-press-conference)',
        scope: 'Conferenze pre-gara con risoluzione match e naming canonico.',
        filters: 'Parole chiave conferenza pre-gara, durata 3m-2h, esclusi Highlights/settori giovanili.',
        imageUrl: '/immagini/Format Cover/Press Conference/press conference - card orizzontale.webp',
      },
    ];

    const filteredSources = sourceId
      ? sources.filter(source => source.id === sourceId)
      : sources;

    return {
      objective: 'Sincronizza i video nelle librerie Lavika su R2 e aggiorna il database/manifest.',
      output: 'Scarica nuovi video idonei, li carica su storage e aggiorna i metadati usati dall\'app.',
      mode: sourceId
        ? 'Dettaglio source specifica: il run avvia solo questa source.'
        : 'Puoi avviarlo completo oppure su singola source dalle mini-card della pagina Job.',
      sources: filteredSources,
    };
  };

  const jobSummary = getJobSummary(jobId, selectedSourceId);

  useEffect(() => {
    Promise.all([
      getJobById(jobId),
      getJobRunsData({ jobId }),
      getErrorsData(),
    ]).then(([jobData, runsData, errorsData]) => {
      setJob(jobData || null);
      setRuns(runsData);
      const filteredErrors = jobData
        ? errorsData.filter(error => error.source.toLowerCase().includes(jobData.name.toLowerCase()))
        : errorsData;
      setErrors(filteredErrors);
      setVisibleErrors(10);
      setLoading(false);
    });
  }, [jobId]);

  const handleRun = async () => {
    if (!job) return;
    setRunning(true);
    
    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: job.id,
          triggeredBy: 'manual',
          ...(selectedSourceId ? { source: selectedSourceId } : {}),
        }),
      });

      if (response.ok && selectedSourceId) {
        const payload = await response.json().catch(() => null) as { run?: { id?: string } } | null;
        const runId = payload?.run?.id;
        if (runId) {
          saveRunSourceMapping(runId, selectedSourceId);
        }
      }
    } catch (error) {
      console.error('Error triggering job:', error);
    }
    
    setTimeout(async () => {
      const [updatedRuns, updatedErrors] = await Promise.all([
        getJobRunsData({ jobId }),
        getErrorsData(),
      ]);
      setRuns(updatedRuns);
      const filteredErrors = job
        ? updatedErrors.filter(error => error.source.toLowerCase().includes(job.name.toLowerCase()))
        : updatedErrors;
      setErrors(filteredErrors);
      setVisibleErrors(10);
      setRunning(false);
    }, 6000);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'cancelled':
        return <Ban className="w-4 h-4 text-muted-foreground" />;
      case 'running':
        return <CircleDashed className="w-4 h-4 text-blue-500 animate-spin" />;
      default:
        return null;
    }
  };

  const getStatusLabel = (status: JobRun['status']) => {
    switch (status) {
      case 'success':
        return 'Completato';
      case 'failed':
        return 'Fallito';
      case 'cancelled':
        return 'Annullato';
      case 'running':
        return 'In corso';
      default:
        return status;
    }
  };

  const recentRuns = [...runs]
    .filter(run => {
      if (!selectedSourceId) return true;

      const mappedSource = getRunSourceMapping(run.id);
      return mappedSource === selectedSourceId;
    })
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 5);

  const displayedErrors = errors.slice(0, visibleErrors);
  const hasMoreErrors = errors.length > visibleErrors;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Job non trovato</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Torna ai job
      </button>

      <div className="bg-card border border-border rounded-lg p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">{job.name}</h1>
            {selectedSourceId && (
              <p className="text-xs text-muted-foreground mt-1">Source selezionata: {selectedSourceId}</p>
            )}
            <p className="text-sm text-muted-foreground mt-1">{job.description}</p>
          </div>
          <StatusPill status={job.status} />
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
          {job.schedule ? (
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>Schedule: {job.schedule}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span>Esecuzione manuale</span>
            </div>
          )}
        </div>

        {job.schedule === null && job.status !== 'paused' && (
          <button
            onClick={handleRun}
            disabled={running}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            {running ? 'Esecuzione in corso...' : 'ESEGUI JOB'}
          </button>
        )}
      </div>

      {jobSummary && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Cosa fa questo job</h2>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p><span className="text-foreground font-medium">Obiettivo:</span> {jobSummary.objective}</p>
            <p><span className="text-foreground font-medium">Output:</span> {jobSummary.output}</p>
            <p><span className="text-foreground font-medium">Modalita:</span> {jobSummary.mode}</p>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {jobSummary.sources.map(source => (
              <div key={source.title} className="border border-border rounded-lg p-3">
                <div className="mb-2 overflow-hidden rounded-md border border-border bg-muted/20 aspect-video">
                  <Image
                    src={source.imageUrl}
                    alt={`${source.title} card`}
                    width={640}
                    height={360}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="text-sm font-semibold text-foreground">{source.title}</div>
                <div className="text-xs text-muted-foreground mt-1">{source.source}</div>
                <div className="text-xs text-muted-foreground mt-2">{source.scope}</div>
                <div className="text-xs text-muted-foreground mt-2">{source.filters}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">Esecuzioni</h2>
        {recentRuns.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-6 text-center text-muted-foreground">
            {selectedSourceId ? 'Nessuna esecuzione trovata per questa source' : 'Nessuna esecuzione trovata'}
          </div>
        ) : (
          <div className="space-y-2">
            {recentRuns.map(run => (
              <div
                key={run.id}
                className="bg-card border border-border rounded-lg p-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  {getStatusIcon(run.status)}
                  <div>
                    <button
                      onClick={() => router.push(`/jobs/runs/${run.id}`)}
                      className="text-sm font-medium text-foreground hover:text-primary transition-colors"
                    >
                      {run.jobName} - #{run.id}
                    </button>
                    <div className="text-xs text-muted-foreground">{formatDate(run.startedAt)}</div>
                  </div>
                </div>
                <div className="text-right text-xs space-y-1">
                  <div className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                    {getStatusIcon(run.status)}
                    <span>{getStatusLabel(run.status)}</span>
                  </div>
                  {run.duration && <div className="text-muted-foreground">{run.duration}s</div>}
                  <div className="text-muted-foreground">
                    Scans: {run.scannedCount} | Ins: {run.insertedCount} | Err: {run.errorCount}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {errors.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3">Errori</h2>
          <div className="space-y-2">
            {displayedErrors.map(error => (
              <div
                key={error.id}
                onClick={() => router.push(`/errors/${error.id}`)}
                className="bg-card border border-border rounded-lg p-3 flex items-start gap-3 hover:border-primary/50 cursor-pointer"
              >
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{error.message}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(error.timestamp)}</div>
                </div>
              </div>
            ))}

            {hasMoreErrors && (
              <button
                onClick={() => setVisibleErrors(count => count + 5)}
                className="w-full py-2 text-sm text-primary hover:text-primary/80 border border-dashed border-border rounded-lg"
              >
                Clicca per vedere altro
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
