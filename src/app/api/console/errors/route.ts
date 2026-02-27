import { NextResponse } from 'next/server';
import type { ErrorLog } from '@/mocks/errors';
import { listGithubRuns } from '@/lib/githubWorkflows';

function mapSeverity(conclusion: string | null): ErrorLog['severity'] {
  if (conclusion === 'cancelled') return 'warning';
  return 'error';
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const severityFilter = searchParams.get('severity');
  const sourceFilter = searchParams.get('source');

  const runs = await listGithubRuns();
  const items: ErrorLog[] = runs
    .filter(run => run.conclusion === 'failure' || run.conclusion === 'cancelled')
    .map(run => ({
      id: `gh_${run.id}`,
      severity: mapSeverity(run.conclusion),
      source: run.name || 'github_actions',
      message: `Workflow ${run.conclusion === 'failure' ? 'failed' : 'cancelled'} - Run #${run.run_number ?? run.id}`,
      metadata: {
        runId: run.id,
        workflowId: run.workflow_id,
        htmlUrl: run.html_url,
      },
      timestamp: run.run_started_at ?? run.created_at,
      jobRunId: String(run.id),
    }))
    .filter(item => {
      if (severityFilter && item.severity !== severityFilter) return false;
      if (sourceFilter && item.source !== sourceFilter) return false;
      return true;
    });

  return NextResponse.json(items);
}
