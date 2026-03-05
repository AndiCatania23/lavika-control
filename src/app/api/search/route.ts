import { NextResponse } from 'next/server';
import { listGithubWorkflows, mapWorkflowToJobId } from '@/lib/githubWorkflows';
import { supabaseServer } from '@/lib/supabaseServer';

type SearchResultItem = {
  id: string;
  type: 'user' | 'job';
  title: string;
  subtitle: string;
  href: string;
};

async function searchJobs(query: string, limit: number): Promise<SearchResultItem[]> {
  const workflows = await listGithubWorkflows();
  const q = query.toLowerCase();

  return workflows
    .map(workflow => ({
      id: `job_${workflow.id}`,
      type: 'job' as const,
      title: workflow.name,
      subtitle: workflow.path,
      href: `/jobs/${mapWorkflowToJobId(workflow)}`,
    }))
    .filter(item => `${item.title} ${item.subtitle}`.toLowerCase().includes(q))
    .slice(0, limit);
}

async function searchUsers(query: string, limit: number): Promise<SearchResultItem[]> {
  if (!supabaseServer) return [];

  const q = query.toLowerCase();
  const perPage = 200;
  const results: SearchResultItem[] = [];

  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await supabaseServer.auth.admin.listUsers({ page, perPage });
    if (error || !data?.users?.length) break;

    for (const user of data.users) {
      const email = user.email ?? '';
      const metadata = (user.user_metadata as Record<string, unknown> | undefined) ?? undefined;
      const displayName =
        (typeof metadata?.display_name === 'string' && metadata.display_name)
        || (typeof metadata?.full_name === 'string' && metadata.full_name)
        || (typeof metadata?.name === 'string' && metadata.name)
        || email.split('@')[0]
        || user.id;

      const haystack = `${displayName} ${email} ${user.id}`.toLowerCase();
      if (!haystack.includes(q)) continue;

      results.push({
        id: `user_${user.id}`,
        type: 'user',
        title: displayName,
        subtitle: email || user.id,
        href: `/users/${user.id}`,
      });

      if (results.length >= limit) {
        return results;
      }
    }

    if ((data.users ?? []).length < perPage) break;
  }

  return results;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get('q') ?? '';
  const query = rawQuery.trim();

  if (!query) {
    return NextResponse.json([]);
  }

  const limitParam = Number(searchParams.get('limit') ?? 12);
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(30, limitParam)) : 12;

  const [users, jobs] = await Promise.all([
    searchUsers(query, Math.ceil(limit / 2)),
    searchJobs(query, Math.ceil(limit / 2)),
  ]);

  const merged = [...users, ...jobs].slice(0, limit);
  return NextResponse.json(merged);
}
