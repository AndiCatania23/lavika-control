import { NextRequest, NextResponse } from 'next/server';
import type { Job } from '@/mocks/jobs';
import type { JobRun } from '@/mocks/jobRuns';
import {
  listGithubRuns,
  listGithubWorkflows,
  mapWorkflowToJobId,
  triggerGithubWorkflow,
} from '@/lib/githubWorkflows';

function mapRunStatus(status: string, conclusion: string | null): JobRun['status'] {
  if (status !== 'completed') return 'running';
  if (conclusion === 'success') return 'success';
  if (conclusion === 'cancelled') return 'cancelled';
  return 'failed';
}

function computeDuration(startedAt: string | null, finishedAt: string | null): number | null {
  if (!startedAt || !finishedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = new Date(finishedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.round((end - start) / 1000);
}

async function buildJobs(): Promise<Job[]> {
  const [workflows, runs] = await Promise.all([listGithubWorkflows(), listGithubRuns()]);

  return workflows.map(workflow => {
    const jobId = mapWorkflowToJobId(workflow);
    const relatedRuns = runs.filter(run => run.workflow_id === workflow.id);
    const latest = relatedRuns[0];
    const status: Job['status'] = workflow.state === 'active' ? 'active' : 'paused';

    return {
      id: jobId,
      name: workflow.name,
      description: workflow.path,
      schedule: null,
      lastRun: latest?.run_started_at ?? latest?.created_at ?? null,
      status,
      nextRun: null,
    };
  });
}

function mapRun(run: Awaited<ReturnType<typeof listGithubRuns>>[number]): JobRun {
  const startedAt = run.run_started_at ?? run.created_at;
  const finishedAt = run.status === 'completed' ? run.updated_at : null;
  return {
    id: String(run.id),
    jobId: run.workflow_id ? `job_${run.workflow_id}` : 'job_sync_video',
    jobName: run.name,
    status: mapRunStatus(run.status, run.conclusion),
    startedAt,
    finishedAt,
    duration: computeDuration(startedAt, finishedAt),
    triggeredBy: run.actor?.login ?? 'github',
    scannedCount: 0,
    insertedCount: 0,
    updatedCount: 0,
    errorCount: run.conclusion === 'failure' ? 1 : 0,
  };
}

export async function GET() {
  const jobs = await buildJobs();
  return NextResponse.json(jobs);
}

export async function POST(request: NextRequest) {
  const { jobId, triggeredBy = 'manual', source } = await request.json() as {
    jobId?: string;
    triggeredBy?: string;
    source?: string;
  };

  if (jobId !== 'job_sync_video') {
    return NextResponse.json({ error: 'Unsupported job id' }, { status: 400 });
  }

  const [workflows, currentRuns] = await Promise.all([listGithubWorkflows(), listGithubRuns()]);
  const syncWorkflow = workflows.find(workflow => workflow.path.toLowerCase().includes('sync-videos.yml'));
  const previousRunIds = new Set(currentRuns.map(run => String(run.id)));
  const hasRunningSync = currentRuns.some(run => {
    if (run.status === 'completed') return false;
    if (syncWorkflow) return run.workflow_id === syncWorkflow.id;
    return run.name.toLowerCase().includes('sync');
  });

  if (hasRunningSync) {
    return NextResponse.json(
      { success: false, error: 'Sync job already running' },
      { status: 409 }
    );
  }

  const workflowInputs = source
    ? { source }
    : undefined;

  const dispatch = await triggerGithubWorkflow('sync-videos.yml', 'master', workflowInputs);
  if (!dispatch.ok) {
    return NextResponse.json({ success: false, error: dispatch.error ?? 'Dispatch failed' }, { status: 502 });
  }

  await new Promise(resolve => setTimeout(resolve, 1200));

  let latest = null as Awaited<ReturnType<typeof listGithubRuns>>[number] | null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const runs = await listGithubRuns();
    latest = runs.find(run => {
      const isNewRun = !previousRunIds.has(String(run.id));
      if (!isNewRun) return false;
      if (syncWorkflow) return run.workflow_id === syncWorkflow.id;
      return run.name.toLowerCase().includes('sync');
    }) ?? null;

    if (latest) break;
    await new Promise(resolve => setTimeout(resolve, 1200));
  }

  if (!latest) {
    const runs = await listGithubRuns();
    latest = runs.find(run => {
      if (syncWorkflow) return run.workflow_id === syncWorkflow.id;
      return run.name.toLowerCase().includes('sync');
    }) ?? runs[0] ?? null;
  }

  let run: JobRun;
  if (latest) {
    run = mapRun(latest);
  } else {
    run = {
      id: `pending_${Date.now()}`,
      jobId,
      jobName: 'Sync Video',
      status: 'running',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      duration: null,
      triggeredBy,
      scannedCount: 0,
      insertedCount: 0,
      updatedCount: 0,
      errorCount: 0,
    };
  }

  return NextResponse.json({ success: true, run });
}

export async function HEAD() {
  return NextResponse.json({ ok: true });
}
