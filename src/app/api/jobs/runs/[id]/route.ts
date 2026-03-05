import { NextResponse } from 'next/server';
import type { JobRun } from '@/mocks/jobRuns';
import { getGithubRunById } from '@/lib/githubWorkflows';

function mapRunStatus(status: string, conclusion: string | null): JobRun['status'] {
  if (status !== 'completed') return 'running';
  if (conclusion === 'success') return 'success';
  if (conclusion === 'cancelled') return 'cancelled';
  return 'failed';
}

type SyncSummary = {
  sourcesProcessed: number | null;
  downloadedVideos: number | null;
  uploadedVideos: number | null;
  totalDurationSeconds: number | null;
};

function parseSummaryMetric(text: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function parseSyncSummary(text: string): SyncSummary {
  const normalized = text.toLowerCase();

  return {
    sourcesProcessed: parseSummaryMetric(normalized, [
      /source\s*processate\s*[:=]\s*(\d+)/i,
      /sources?\s*processed\s*[:=]\s*(\d+)/i,
    ]),
    downloadedVideos: parseSummaryMetric(normalized, [
      /video\s*scaricati\s*[:=]\s*(\d+)/i,
      /videos?\s*downloaded\s*[:=]\s*(\d+)/i,
    ]),
    uploadedVideos: parseSummaryMetric(normalized, [
      /video\s*caricati\s*[:=]\s*(\d+)/i,
      /videos?\s*uploaded\s*[:=]\s*(\d+)/i,
    ]),
    totalDurationSeconds: parseSummaryMetric(normalized, [
      /durata\s*totale\s*[:=]\s*(\d+)\s*s?/i,
      /total\s*duration\s*[:=]\s*(\d+)\s*s?/i,
    ]),
  };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getGithubRunById(id);

  if (!run) {
    return NextResponse.json(null, { status: 404 });
  }

  const startedAt = run.run_started_at ?? run.created_at;
  const finishedAt = run.status === 'completed' ? run.updated_at : null;
  const duration = finishedAt
    ? Math.max(0, Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000))
    : null;
  const parsedSummary = parseSyncSummary(`${run.name ?? ''}\n${run.display_title ?? ''}`);
  const downloadedVideos = parsedSummary.downloadedVideos;
  const uploadedVideos = parsedSummary.uploadedVideos;

  const payload: JobRun = {
    id: String(run.id),
    jobId: run.workflow_id ? `job_${run.workflow_id}` : 'job_sync_video',
    jobName: run.name,
    status: mapRunStatus(run.status, run.conclusion),
    startedAt,
    finishedAt,
    duration,
    triggeredBy: run.actor?.login ?? 'github',
    scannedCount: downloadedVideos ?? 0,
    insertedCount: uploadedVideos ?? 0,
    updatedCount: 0,
    errorCount: run.conclusion === 'failure' ? 1 : 0,
    sourcesProcessed: parsedSummary.sourcesProcessed,
    downloadedVideos,
    uploadedVideos,
    totalDurationSeconds: parsedSummary.totalDurationSeconds ?? duration,
  };

  return NextResponse.json(payload);
}
