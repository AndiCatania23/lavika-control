'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getJobRunByIdData, JobRun } from '@/lib/data';
import { getRunSourceMapping } from '@/lib/jobRunSourceRegistry';
import { StatusPill } from '@/components/StatusPill';
import {
  ArrowLeft, Clock, User, Play, Download, Upload, Layers, TimerReset,
  Search, AlertTriangle, SkipForward,
} from 'lucide-react';

/* ==================================================================
   Log parser — extract metrics from the sync-master RIEPILOGO block.
   Fallback when DB columns are NULL (daemon doesn't populate them).
   ================================================================== */
interface ParsedMetrics {
  sourcesProcessed: number | null;
  videosFound: number | null;
  downloadedVideos: number | null;
  uploadedVideos: number | null;
  skippedVideos: number | null;
  errorCount: number | null;
  totalDurationSeconds: number | null;
}

function parseMetricsFromLogs(logs: string | null): ParsedMetrics {
  const empty: ParsedMetrics = {
    sourcesProcessed: null, videosFound: null, downloadedVideos: null,
    uploadedVideos: null, skippedVideos: null, errorCount: null,
    totalDurationSeconds: null,
  };
  if (!logs) return empty;

  const pick = (re: RegExp): number | null => {
    const m = logs.match(re);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  };

  // RIEPILOGO block patterns (italian summary box)
  return {
    sourcesProcessed:     pick(/Source processate:\s*(\d+)/i),
    videosFound:          pick(/Video trovati:\s*(\d+)/i),
    downloadedVideos:     pick(/Video scaricati:\s*(\d+)/i),
    uploadedVideos:       pick(/Video caricati:\s*(\d+)/i),
    skippedVideos:        pick(/Video saltati:\s*(\d+)/i),
    errorCount:           pick(/Errori:\s*(\d+)/i),
    totalDurationSeconds: pick(/Durata totale:\s*(\d+)s/i),
  };
}

/* Strip carriage-return progress-bar noise: keep only the final state of each line. */
function cleanLogs(logs: string | null): string {
  if (!logs) return '';
  return logs
    .split('\n')
    .map(line => {
      // If line has \r, keep only what's after the LAST \r (final progress state)
      const idx = line.lastIndexOf('\r');
      return idx >= 0 ? line.slice(idx + 1) : line;
    })
    // Strip ANSI escape codes
    .map(line => line.replace(/\u001b\[[0-9;]*m/g, ''))
    .join('\n');
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* ==================================================================
   Page
   ================================================================== */
export default function JobRunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [run, setRun] = useState<JobRun | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = params.id as string;
    getJobRunByIdData(id).then(data => {
      setRun(data || null);
      setLoading(false);
    });
  }, [params.id]);

  const parsed = useMemo(() => parseMetricsFromLogs(run?.logs ?? null), [run]);
  const cleanedLogs = useMemo(() => cleanLogs(run?.logs ?? null), [run]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-2 border-[color:var(--accent-raw)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="card card-body text-center">
        <p className="typ-caption">Run non trovato</p>
        <button onClick={() => router.push('/jobs/runs')} className="btn btn-ghost btn-sm mt-3" style={{ marginLeft: 'auto', marginRight: 'auto' }}>
          Torna alle esecuzioni
        </button>
      </div>
    );
  }

  // Metric resolver: prefer DB value; fallback to parsed from logs
  const pick = (dbValue: number | null | undefined, parsedValue: number | null): number | null => {
    if (typeof dbValue === 'number') return dbValue;
    return parsedValue;
  };

  const sourcesProcessed = pick(run.sourcesProcessed, parsed.sourcesProcessed)
    ?? (getRunSourceMapping(run.id) ? 1 : null);
  const videosFound = parsed.videosFound;
  const downloadedVideos = pick(run.downloadedVideos, parsed.downloadedVideos);
  const uploadedVideos = pick(run.uploadedVideos, parsed.uploadedVideos);
  const skippedVideos = parsed.skippedVideos;
  const errors = pick(run.errorCount, parsed.errorCount) ?? run.errorCount;
  const totalDuration = pick(run.totalDurationSeconds, parsed.totalDurationSeconds) ?? run.duration;

  const metrics: Array<{ icon: React.ReactNode; label: string; value: string; tone?: 'ok' | 'info' | 'warn' | 'err' }> = [
    { icon: <Layers       className="w-[14px] h-[14px]" strokeWidth={1.75} />, label: 'Source processate', value: sourcesProcessed !== null ? String(sourcesProcessed) : '—', tone: 'info' },
    { icon: <Search       className="w-[14px] h-[14px]" strokeWidth={1.75} />, label: 'Video trovati',     value: videosFound      !== null ? String(videosFound)      : '—', tone: 'info' },
    { icon: <Download     className="w-[14px] h-[14px]" strokeWidth={1.75} />, label: 'Video scaricati',   value: downloadedVideos !== null ? String(downloadedVideos) : '—', tone: 'info' },
    { icon: <Upload       className="w-[14px] h-[14px]" strokeWidth={1.75} />, label: 'Video caricati',    value: uploadedVideos   !== null ? String(uploadedVideos)   : '—', tone: 'ok' },
    { icon: <SkipForward  className="w-[14px] h-[14px]" strokeWidth={1.75} />, label: 'Video saltati',     value: skippedVideos    !== null ? String(skippedVideos)    : '—' },
    { icon: <AlertTriangle className="w-[14px] h-[14px]" strokeWidth={1.75} />, label: 'Errori',           value: errors !== null && errors !== undefined ? String(errors) : '—', tone: errors && errors > 0 ? 'err' : 'ok' },
    { icon: <TimerReset   className="w-[14px] h-[14px]" strokeWidth={1.75} />, label: 'Durata totale',     value: totalDuration ? `${totalDuration}s` : '—' },
  ];

  const toneClass = (t?: string) => t === 'ok' ? 'pill-ok' : t === 'warn' ? 'pill-warn' : t === 'err' ? 'pill-err' : t === 'info' ? 'pill-info' : '';

  return (
    <div className="vstack" style={{ gap: 'var(--s5)' }}>
      <button onClick={() => router.push('/jobs/runs')} className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}>
        <ArrowLeft className="w-4 h-4" /> Esecuzioni
      </button>

      {/* Header */}
      <div className="card card-body">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="grow min-w-0">
            <div className="typ-micro">{run.source ? `Source · ${run.source}` : 'Run'}</div>
            <h1 className="typ-h1 mt-1">{run.jobName}</h1>
            <p className="typ-mono mt-1" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{run.id}</p>
          </div>
          <StatusPill status={run.status} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 pt-5 border-t border-[color:var(--hairline-soft)]">
          <div>
            <div className="typ-micro inline-flex items-center gap-1.5"><Clock className="w-3 h-3" /> Inizio</div>
            <div className="typ-label mt-1">{fmtDate(run.startedAt)}</div>
          </div>
          <div>
            <div className="typ-micro inline-flex items-center gap-1.5"><Clock className="w-3 h-3" /> Durata</div>
            <div className="typ-label mt-1">{run.duration ? `${run.duration}s` : '—'}</div>
          </div>
          <div>
            <div className="typ-micro inline-flex items-center gap-1.5"><User className="w-3 h-3" /> Trigger</div>
            <div className="typ-label mt-1">{run.triggeredBy}</div>
          </div>
          <div>
            <div className="typ-micro inline-flex items-center gap-1.5"><Play className="w-3 h-3" /> Stato</div>
            <div className="typ-label mt-1">{run.status}</div>
          </div>
        </div>
      </div>

      {/* Riepilogo metriche */}
      <div>
        <div className="typ-micro mb-2" style={{ paddingLeft: 2 }}>Riepilogo</div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2 sm:gap-3">
          {metrics.map(m => (
            <div key={m.label} className="card card-body">
              <div className="flex items-center justify-between gap-2">
                <span className="typ-micro truncate">{m.label}</span>
                <span className={`pill ${toneClass(m.tone)}`} style={{ padding: '2px 6px' }}>{m.icon}</span>
              </div>
              <div className="typ-metric mt-1" style={{ fontSize: 22 }}>{m.value}</div>
            </div>
          ))}
        </div>
        <p className="typ-caption mt-2" style={{ fontSize: 11 }}>
          Alcune metriche vengono estratte dai log quando il daemon non le scrive sul DB.
        </p>
      </div>

      {/* Logs */}
      <div className="card">
        <div className="card-head">
          <div>
            <div className="typ-micro">Log di esecuzione</div>
            <h3 className="typ-h2 mt-0.5">Output sync-master</h3>
          </div>
          {run.source && (
            <span className="pill">{run.source}</span>
          )}
        </div>
        <div className="card-body">
          {cleanedLogs ? (
            <pre className="typ-mono" style={{
              fontSize: 11,
              padding: 14,
              background: 'var(--card-muted)',
              borderRadius: 'var(--r)',
              border: '1px solid var(--hairline-soft)',
              overflowX: 'auto',
              maxHeight: 520,
              whiteSpace: 'pre-wrap',
              color: 'var(--text)',
              lineHeight: 1.55,
            }}>{cleanedLogs}</pre>
          ) : (
            <p className="typ-caption">Nessun log salvato per questa esecuzione.</p>
          )}
        </div>
      </div>
    </div>
  );
}
