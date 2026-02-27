import { NextResponse } from 'next/server';
import type { ErrorLog } from '@/mocks/errors';
import { getGithubRunById } from '@/lib/githubWorkflows';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const runId = id.startsWith('gh_') ? id.replace('gh_', '') : id;
  const run = await getGithubRunById(runId);

  if (!run || (run.conclusion !== 'failure' && run.conclusion !== 'cancelled')) {
    return NextResponse.json(null, { status: 404 });
  }

  const payload: ErrorLog = {
    id: `gh_${run.id}`,
    severity: run.conclusion === 'cancelled' ? 'warning' : 'error',
    source: run.name || 'github_actions',
    message: `Workflow ${run.conclusion === 'failure' ? 'failed' : 'cancelled'} - Run #${run.run_number ?? run.id}`,
    metadata: {
      runId: run.id,
      workflowId: run.workflow_id,
      htmlUrl: run.html_url,
      logsUrl: run.logs_url,
      status: run.status,
      conclusion: run.conclusion,
    },
    timestamp: run.run_started_at ?? run.created_at,
    jobRunId: String(run.id),
  };

  return NextResponse.json(payload);
}
