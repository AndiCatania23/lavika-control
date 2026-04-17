'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getJobRunByIdData, JobRun } from '@/lib/data';
import { getRunSourceMapping } from '@/lib/jobRunSourceRegistry';
import { StatusPill } from '@/components/StatusPill';
import { ArrowLeft, Clock, User, Play } from 'lucide-react';

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Run not found</p>
        <button
          onClick={() => router.push('/jobs/runs')}
          className="mt-4 text-primary hover:underline"
        >
          Back to runs
        </button>
      </div>
    );
  }

  const inferredSourcesProcessed = run.sourcesProcessed ?? (getRunSourceMapping(run.id) ? 1 : null);
  const hasExtraSummary = run.status === 'success' && (
    inferredSourcesProcessed != null
    || run.downloadedVideos != null
    || run.uploadedVideos != null
    || run.totalDurationSeconds != null
  );

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push('/jobs/runs')}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to runs
      </button>

      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">{run.jobName}</h2>
            <p className="text-sm text-muted-foreground font-mono mt-1">{run.id}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusPill status={run.status} />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-border">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Clock className="w-3 h-3" />
              Started
            </div>
            <div className="text-sm text-foreground">{new Date(run.startedAt).toLocaleString('en-GB')}</div>
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Clock className="w-3 h-3" />
              Duration
            </div>
            <div className="text-sm text-foreground">{run.duration ? `${run.duration}s` : '-'}</div>
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <User className="w-3 h-3" />
              Triggered By
            </div>
            <div className="text-sm text-foreground">{run.triggeredBy}</div>
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Play className="w-3 h-3" />
              Status
            </div>
            <div className="text-sm text-foreground">{run.status}</div>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="font-semibold text-foreground mb-4">Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-muted/30 rounded-lg p-4">
            <div className="text-2xl font-semibold text-foreground">{run.scannedCount}</div>
            <div className="text-xs text-muted-foreground">Scanned</div>
          </div>
          <div className="bg-green-500/10 rounded-lg p-4">
            <div className="text-2xl font-semibold text-green-500">{run.insertedCount}</div>
            <div className="text-xs text-muted-foreground">Inserted</div>
          </div>
          <div className="bg-blue-500/10 rounded-lg p-4">
            <div className="text-2xl font-semibold text-blue-500">{run.updatedCount}</div>
            <div className="text-xs text-muted-foreground">Updated</div>
          </div>
          <div className={`${run.errorCount > 0 ? 'bg-red-500/10' : 'bg-muted/30'} rounded-lg p-4`}>
            <div className={`text-2xl font-semibold ${run.errorCount > 0 ? 'text-red-500' : 'text-foreground'}`}>
              {run.errorCount}
            </div>
            <div className="text-xs text-muted-foreground">Errors</div>
          </div>
        </div>
      </div>

      {hasExtraSummary && (
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-semibold text-foreground mb-4">Riepilogo Job</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <div className="text-2xl font-semibold text-foreground">{inferredSourcesProcessed ?? '-'}</div>
              <div className="text-xs text-muted-foreground">Source processate</div>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <div className="text-2xl font-semibold text-foreground">{run.downloadedVideos ?? '-'}</div>
              <div className="text-xs text-muted-foreground">Video scaricati</div>
            </div>
            <div className="bg-green-500/10 rounded-lg p-4">
              <div className="text-2xl font-semibold text-green-500">{run.uploadedVideos ?? '-'}</div>
              <div className="text-xs text-muted-foreground">Video caricati</div>
            </div>
            <div className="bg-blue-500/10 rounded-lg p-4">
              <div className="text-2xl font-semibold text-blue-500">{run.totalDurationSeconds ?? '-'}</div>
              <div className="text-xs text-muted-foreground">Durata totale (s)</div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-foreground">Logs</h3>
          {run.source && (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground px-2 py-0.5 rounded bg-muted/40">
              source: {run.source}
            </span>
          )}
        </div>
        {run.logs ? (
          <pre className="text-[11px] text-foreground/80 bg-black/40 border border-border rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-[480px] leading-relaxed font-mono">
            {run.logs}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nessun log salvato per questa esecuzione.
          </p>
        )}
      </div>
    </div>
  );
}
