'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { getJobById, getJobRunsData, getErrorsData, Job, JobRun, ErrorLog } from '@/lib/data';
import { getRunSourceMapping, saveRunSourceMapping } from '@/lib/jobRunSourceRegistry';
import { StatusPill } from '@/components/StatusPill';
import {
  Play, ArrowLeft, Clock, Calendar, CheckCircle, XCircle, AlertTriangle,
  CircleDashed, Ban, ChevronRight,
} from 'lucide-react';

type JobSourceSummary = {
  title: string;
  id: string;
  source: string;
  scope: string;
  filters: string;
};

type JobSummary = {
  objective: string;
  output: string;
  mode: string;
  sources: JobSourceSummary[];
};

const SOURCE_FORMAT_MAP: Record<string, string> = {
  'catanista-live':          'catanista',
  'serie-c-2025-2026':       'highlights',
  'catania-press-conference':'press-conference',
  'unica-sport-live':        'unica-sport',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'success':   return <CheckCircle  className="w-4 h-4" style={{ color: 'var(--ok)' }} />;
    case 'failed':    return <XCircle      className="w-4 h-4" style={{ color: 'var(--danger)' }} />;
    case 'cancelled': return <Ban          className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />;
    case 'running':   return <CircleDashed className="w-4 h-4 animate-spin" style={{ color: 'var(--info)' }} />;
    default:          return null;
  }
}

function getStatusLabel(status: JobRun['status']): string {
  switch (status) {
    case 'success':   return 'Completato';
    case 'failed':    return 'Fallito';
    case 'cancelled': return 'Annullato';
    case 'running':   return 'In corso';
    default:          return status;
  }
}

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
  const [formatCovers, setFormatCovers] = useState<Record<string, string>>({});

  const getJobSummary = (id: string, sourceId?: string | null): JobSummary | null => {
    if (id !== 'job_sync_video') return null;
    const sources: JobSourceSummary[] = [
      { id: 'catanista-live',           title: 'CATANISTA LIVE',   source: 'Facebook @catanista.redazione · /live_videos',       scope: 'Video Facebook con titolo 💥 CATANISTA LIVE sulla pagina live_videos.',           filters: 'Titolo contiene "💥 CATANISTA LIVE".' },
      { id: 'serie-c-2025-2026',        title: 'HIGHLIGHTS',       source: 'YouTube playlist Serie C (serie-c-2025-2026)',       scope: 'Partite categoria highlights stagione 2025/2026.',                                 filters: 'Titoli con CATANIA, durata 1m-60m, esclusi Allenamento/Primavera/Under.' },
      { id: 'catania-press-conference', title: 'PRESS CONFERENCE', source: 'YouTube @officialcataniafc streams (catania-press-conference)', scope: 'Conferenze pre-gara con risoluzione match e naming canonico.',                    filters: 'Parole chiave conferenza pre-gara, durata 3m-2h, esclusi Highlights/settori giovanili.' },
      { id: 'unica-sport-live',         title: 'UNICA SPORT',      source: 'YouTube @unicasport2025 streams (unica-sport-live)', scope: 'Live Unica Sport con naming stile Catanista e stagione per anno upload.',           filters: 'Titoli LIVE UNICA SPORT con data, durata 20m-4h, esclusi Clip/Short, ingest da 2026.' },
    ];
    const filteredSources = sourceId ? sources.filter(s => s.id === sourceId) : sources;
    return {
      objective: 'Sincronizza i video nelle librerie Lavika su R2 e aggiorna il database.',
      output:    'Scarica nuovi video idonei, li carica su storage e aggiorna i metadati usati dall\'app.',
      mode:      sourceId ? 'Dettaglio source specifica: il run avvia solo questa source.' : 'Puoi avviarlo completo oppure su singola source dalle mini-card della pagina Job.',
      sources: filteredSources,
    };
  };

  const jobSummary = getJobSummary(jobId, selectedSourceId);

  useEffect(() => {
    Promise.all([
      getJobById(jobId),
      getJobRunsData({ jobId }),
      getErrorsData(),
      fetch('/api/media/formats').then(r => r.ok ? r.json() as Promise<Array<{ id: string; cover_horizontal_url: string | null }>> : []).catch(() => []),
    ]).then(([jobData, runsData, errorsData, formatsData]) => {
      setJob(jobData || null);
      setRuns(runsData);
      const filteredErrors = jobData
        ? errorsData.filter(error => error.source.toLowerCase().includes(jobData.name.toLowerCase()))
        : errorsData;
      setErrors(filteredErrors);
      setVisibleErrors(10);
      setLoading(false);
      const covers: Record<string, string> = {};
      for (const fmt of formatsData) if (fmt.cover_horizontal_url) covers[fmt.id] = fmt.cover_horizontal_url;
      setFormatCovers(covers);
    });
  }, [jobId]);

  const handleRun = async () => {
    if (!job) return;
    setRunning(true);
    try {
      const response = await fetch('/api/jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: job.id, triggeredBy: 'manual', ...(selectedSourceId ? { source: selectedSourceId } : {}) }),
      });
      if (response.ok && selectedSourceId) {
        const payload = await response.json().catch(() => null) as { run?: { id?: string } } | null;
        const runId = payload?.run?.id;
        if (runId) saveRunSourceMapping(runId, selectedSourceId);
      }
    } catch (error) { console.error('Error triggering job:', error); }

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

  const recentRuns = [...runs]
    .filter(run => {
      if (!selectedSourceId) return true;
      const mapped = getRunSourceMapping(run.id);
      return mapped === selectedSourceId;
    })
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .slice(0, 5);

  const displayedErrors = errors.slice(0, visibleErrors);
  const hasMoreErrors = errors.length > visibleErrors;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-2 border-[color:var(--accent-raw)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="card card-body text-center">
        <p className="typ-caption">Job non trovato</p>
      </div>
    );
  }

  return (
    <div className="vstack" style={{ gap: 'var(--s5)' }}>
      <button onClick={() => router.back()} className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}>
        <ArrowLeft className="w-4 h-4" /> Torna ai job
      </button>

      {/* Header */}
      <div className="card card-body">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="grow min-w-0">
            <div className="typ-micro">{selectedSourceId ? `Source · ${selectedSourceId}` : 'Job'}</div>
            <h1 className="typ-h1 mt-1">{job.name}</h1>
            <p className="typ-caption mt-1">{job.description}</p>
          </div>
          <StatusPill status={job.status} />
        </div>

        <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-[color:var(--hairline-soft)]">
          {job.schedule ? (
            <span className="pill"><Clock className="w-3 h-3" />Schedule: {job.schedule}</span>
          ) : (
            <span className="pill"><Calendar className="w-3 h-3" />Esecuzione manuale</span>
          )}
        </div>

        {job.schedule === null && job.status !== 'paused' && (
          <div className="mt-4">
            <button onClick={handleRun} disabled={running} className="btn btn-primary w-full">
              <Play className="w-4 h-4" />
              {running ? 'Esecuzione in corso…' : 'Esegui job'}
            </button>
          </div>
        )}
      </div>

      {/* Job summary */}
      {jobSummary && (
        <div className="card card-body">
          <h2 className="typ-h2 mb-3">Cosa fa questo job</h2>
          <div className="vstack-tight typ-body">
            <p><strong>Obiettivo:</strong> {jobSummary.objective}</p>
            <p><strong>Output:</strong> {jobSummary.output}</p>
            <p><strong>Modalità:</strong> {jobSummary.mode}</p>
          </div>

          {jobSummary.sources.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
              {jobSummary.sources.map(source => (
                <div key={source.title} className="card card-body" style={{ background: 'var(--card-muted)', boxShadow: 'none' }}>
                  <div className="aspect-video rounded-[var(--r-sm)] overflow-hidden mb-2" style={{ background: 'var(--card-muted)' }}>
                    {formatCovers[SOURCE_FORMAT_MAP[source.id]] ? (
                      <Image src={formatCovers[SOURCE_FORMAT_MAP[source.id]]} alt={source.title} width={640} height={360} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center typ-caption">{source.title}</div>
                    )}
                  </div>
                  <div className="typ-label">{source.title}</div>
                  <div className="typ-caption mt-1">{source.source}</div>
                  <div className="typ-caption mt-2">{source.scope}</div>
                  <div className="typ-caption mt-2" style={{ fontStyle: 'italic' }}>{source.filters}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recent runs */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="typ-h2">Esecuzioni recenti</h2>
          <button onClick={() => router.push('/jobs/runs')} className="btn btn-quiet btn-sm">
            Tutte →
          </button>
        </div>
        {recentRuns.length === 0 ? (
          <div className="card card-body text-center">
            <p className="typ-caption">
              {selectedSourceId ? 'Nessuna esecuzione trovata per questa source' : 'Nessuna esecuzione trovata'}
            </p>
          </div>
        ) : (
          <div className="vstack-tight">
            {recentRuns.map(run => (
              <div
                key={run.id}
                onClick={() => router.push(`/jobs/runs/${run.id}`)}
                className="card card-hover card-body"
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
              >
                <div className="shrink-0 inline-grid place-items-center" style={{ width: 36, height: 36, borderRadius: 'var(--r-sm)', background: 'var(--card-muted)' }}>
                  {getStatusIcon(run.status)}
                </div>
                <div className="grow min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusPill status={run.status} size="sm" />
                    <span className="typ-caption">{getStatusLabel(run.status)}</span>
                  </div>
                  <div className="typ-label mt-1 truncate">{run.jobName} · <span className="typ-mono" style={{ fontSize: 11 }}>{run.id.slice(0, 8)}</span></div>
                  <div className="typ-caption mt-0.5">
                    {fmtDate(run.startedAt)}{run.duration ? ` · ${run.duration}s` : ''}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div>
          <h2 className="typ-h2 mb-3">Errori ({errors.length})</h2>
          <div className="vstack-tight">
            {displayedErrors.map(error => (
              <div
                key={error.id}
                onClick={() => router.push(`/errors/${error.id}`)}
                className="card card-hover card-body"
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12 }}
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-1" style={{ color: 'var(--danger)' }} />
                <div className="grow min-w-0">
                  <div className="typ-label truncate">{error.message}</div>
                  <div className="typ-caption mt-0.5">{fmtDate(error.timestamp)}</div>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
              </div>
            ))}

            {hasMoreErrors && (
              <button onClick={() => setVisibleErrors(c => c + 5)} className="btn btn-ghost w-full" style={{ borderStyle: 'dashed' }}>
                Mostra altri ({errors.length - visibleErrors})
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
