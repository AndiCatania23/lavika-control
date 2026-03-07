import { supabaseServer } from '@/lib/supabaseServer';

interface ContentEventPathRow {
  occurred_at: string;
  user_id: string | null;
  metadata: Record<string, unknown> | null;
}

export interface TopViewedPage {
  path: string;
  views: number;
  uniqueUsers: number;
  share: number;
  lastViewedAt: string | null;
}

function readText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readMetadataPath(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;

  const keys = ['path', 'pathname', 'route', 'screen', 'last_path', 'page', 'page_path'];
  for (const key of keys) {
    const direct = readText(metadata[key]);
    if (direct) return direct;
  }

  const nestedCandidates = [metadata.device, metadata.client, metadata.context, metadata.navigation];
  for (const nestedCandidate of nestedCandidates) {
    const nested = nestedCandidate as Record<string, unknown> | undefined;
    if (!nested) continue;

    for (const key of keys) {
      const nestedValue = readText(nested[key]);
      if (nestedValue) return nestedValue;
    }
  }

  return null;
}

function normalizePath(rawPath: string): string | null {
  const trimmed = rawPath.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      return parsed.pathname || '/';
    } catch {
      return null;
    }
  }

  const withoutHash = trimmed.split('#')[0] ?? trimmed;
  const withoutQuery = withoutHash.split('?')[0] ?? withoutHash;

  if (!withoutQuery) return null;
  return withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
}

function isExcludedTopPagePath(path: string): boolean {
  return path === '/' || path === '/home' || path === '/on-demand';
}

async function loadPathRowsByEventName(eventName: string): Promise<ContentEventPathRow[]> {
  if (!supabaseServer) return [];

  const rows: ContentEventPathRow[] = [];
  const pageSize = 1000;
  const maxPages = 100;

  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await supabaseServer
      .from('content_events')
      .select('occurred_at,user_id,metadata')
      .eq('event_name', eventName)
      .order('occurred_at', { ascending: false })
      .range(from, to);

    if (error || !data || data.length === 0) break;

    rows.push(...(data as ContentEventPathRow[]));

    if (data.length < pageSize) break;
  }

  return rows;
}

export async function loadTopViewedPages(limit = 5): Promise<TopViewedPage[]> {
  if (!supabaseServer) return [];

  const maxLimit = Math.max(1, Math.min(20, Math.round(limit)));
  const pageViews = new Map<string, number>();
  const uniqueUsersByPath = new Map<string, Set<string>>();
  const latestByPath = new Map<string, string>();
  let totalTrackedViews = 0;
  const pageViewRows = await loadPathRowsByEventName('page_view');
  const sourceRows = pageViewRows.length > 0 ? pageViewRows : await loadPathRowsByEventName('view_start');

  for (const row of sourceRows) {
    const rawPath = readMetadataPath(row.metadata);
    if (!rawPath) continue;

    const normalizedPath = normalizePath(rawPath);
    if (!normalizedPath) continue;
    if (isExcludedTopPagePath(normalizedPath)) continue;

    pageViews.set(normalizedPath, (pageViews.get(normalizedPath) ?? 0) + 1);
    totalTrackedViews += 1;

    if (row.user_id) {
      const existing = uniqueUsersByPath.get(normalizedPath) ?? new Set<string>();
      existing.add(row.user_id);
      uniqueUsersByPath.set(normalizedPath, existing);
    }

    if (!latestByPath.has(normalizedPath)) {
      latestByPath.set(normalizedPath, row.occurred_at);
    }
  }

  return Array.from(pageViews.entries())
    .map(([path, views]) => ({
      path,
      views,
      uniqueUsers: uniqueUsersByPath.get(path)?.size ?? 0,
      share: totalTrackedViews > 0 ? views / totalTrackedViews : 0,
      lastViewedAt: latestByPath.get(path) ?? null,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, maxLimit);
}
