import { supabaseServer } from '@/lib/supabaseServer';

export interface ViewEventRow {
  user_id: string | null;
  format_id: string | null;
  season_id: string | null;
  episode_id: string | null;
  metadata?: Record<string, unknown> | null;
}

function pickText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function shortId(value: string): string {
  return value.length > 8 ? value.slice(0, 8) : value;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function buildCandidates(formatId: string): Set<string> {
  const base = formatId.trim();
  const slug = base
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_\-]/g, '');

  const normalized = normalize(base);
  return new Set([base, base.toLowerCase(), slug, slug.replace(/_/g, '-'), normalized]);
}

function matchesFormat(value: string | null, candidates: Set<string>): boolean {
  if (!value) return false;
  if (candidates.has(value)) return true;
  if (candidates.has(value.toLowerCase())) return true;
  if (candidates.has(normalize(value))) return true;
  return false;
}

function matchesFormatMetadata(metadata: Record<string, unknown> | null | undefined, candidates: Set<string>): boolean {
  if (!metadata) return false;

  const rawFormatKey = metadata.format_key;
  if (typeof rawFormatKey === 'string') {
    if (candidates.has(rawFormatKey)) return true;
    if (candidates.has(rawFormatKey.toLowerCase())) return true;
    if (candidates.has(normalize(rawFormatKey))) return true;
  }

  return false;
}

export async function loadViewStartEvents(formatId?: string): Promise<ViewEventRow[]> {
  if (!supabaseServer) return [];

  const allRows: ViewEventRow[] = [];
  const pageSize = 1000;
  const maxPages = 100;
  const candidates = formatId ? buildCandidates(formatId) : null;

  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await supabaseServer
      .from('content_events')
      .select('user_id,format_id,season_id,episode_id,metadata')
      .eq('event_name', 'view_start')
      .range(from, to);

    if (error || !data) break;

    const batch = data as ViewEventRow[];
    if (batch.length === 0) break;

    const filtered = candidates
      ? batch.filter(row => matchesFormat(row.format_id, candidates) || matchesFormatMetadata(row.metadata, candidates))
      : batch;

    allRows.push(...filtered);

    if (batch.length < pageSize) break;
  }

  return allRows;
}

export function buildEpisodeNameMap(rows: ViewEventRow[]): Map<string, string> {
  const map = new Map<string, string>();

  for (const row of rows) {
    if (!row.episode_id) continue;

    const metadata = row.metadata ?? {};
    const candidates = [
      metadata.episode_title,
      metadata.content_title,
      metadata.content_id,
      metadata.episode_key,
    ];

    const firstText = candidates.find(value => typeof value === 'string' && value.trim().length > 0);
    map.set(row.episode_id, typeof firstText === 'string' ? firstText : `Episodio ${shortId(row.episode_id)}`);
  }

  return map;
}

export function buildSeasonNameMap(rows: ViewEventRow[]): Map<string, string> {
  const map = new Map<string, string>();

  for (const row of rows) {
    if (!row.season_id) continue;

    const metadata = row.metadata ?? {};
    const candidates = [
      metadata.season_title,
      metadata.season_name,
      metadata.season_key,
    ];

    const firstText = candidates.find(value => typeof value === 'string' && value.trim().length > 0);
    map.set(row.season_id, typeof firstText === 'string' ? `Stagione ${firstText}` : `Stagione ${shortId(row.season_id)}`);
  }

  return map;
}

export async function loadUserNameMap(rows: ViewEventRow[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!supabaseServer) return map;

  const ids = Array.from(new Set(rows.map(row => row.user_id).filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return map;

  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);

    const { data, error } = await supabaseServer
      .from('user_profiles')
      .select('id,display_name,email')
      .in('id', chunk);

    if (error || !data) continue;

    for (const row of data as Array<{ id: string; display_name: string | null; email: string | null }>) {
      const displayName = row.display_name && row.display_name.trim().length > 0
        ? row.display_name
        : row.email || `Utente ${shortId(row.id)}`;
      map.set(row.id, displayName);
    }
  }

  return map;
}

export function groupTotalPerEpisode(rows: ViewEventRow[], episodeNameMap?: Map<string, string>) {
  const map = new Map<string, number>();
  const uniqueUsersByEpisode = new Map<string, Set<string>>();
  const formatNameByEpisode = new Map<string, string>();
  for (const row of rows) {
    if (!row.episode_id) continue;
    map.set(row.episode_id, (map.get(row.episode_id) ?? 0) + 1);

    if (row.user_id) {
      const existing = uniqueUsersByEpisode.get(row.episode_id) ?? new Set<string>();
      existing.add(row.user_id);
      uniqueUsersByEpisode.set(row.episode_id, existing);
    }

    if (!formatNameByEpisode.has(row.episode_id)) {
      const metadata = row.metadata ?? {};
      const formatName = pickText(
        metadata.format_title,
        metadata.format_name,
        metadata.format_key,
        row.format_id,
      );
      if (formatName) {
        formatNameByEpisode.set(row.episode_id, formatName);
      }
    }
  }

  return Array.from(map.entries())
    .map(([episode_id, total_views]) => ({
      episode_id,
      episode_name: episodeNameMap?.get(episode_id) ?? `Episodio ${shortId(episode_id)}`,
      format_name: formatNameByEpisode.get(episode_id) ?? 'Format n/d',
      total_views,
      unique_users: uniqueUsersByEpisode.get(episode_id)?.size ?? 0,
    }))
    .sort((a, b) => b.total_views - a.total_views);
}

export function groupTotalPerSeason(rows: ViewEventRow[], seasonNameMap?: Map<string, string>) {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (!row.season_id) continue;
    map.set(row.season_id, (map.get(row.season_id) ?? 0) + 1);
  }

  return Array.from(map.entries())
    .map(([season_id, total_views]) => ({
      season_id,
      season_name: seasonNameMap?.get(season_id) ?? `Stagione ${shortId(season_id)}`,
      total_views,
    }))
    .sort((a, b) => b.total_views - a.total_views);
}

export function groupUserPerEpisode(rows: ViewEventRow[], episodeNameMap?: Map<string, string>, userNameMap?: Map<string, string>) {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (!row.user_id || !row.episode_id) continue;
    const key = `${row.user_id}::${row.episode_id}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  return Array.from(map.entries())
    .map(([key, user_views]) => {
      const [user_id, episode_id] = key.split('::');
      return {
        user_id,
        user_name: userNameMap?.get(user_id) ?? `Utente ${shortId(user_id)}`,
        episode_id,
        episode_name: episodeNameMap?.get(episode_id) ?? `Episodio ${shortId(episode_id)}`,
        user_views,
      };
    })
    .sort((a, b) => b.user_views - a.user_views);
}

export function groupUserPerSeason(rows: ViewEventRow[], seasonNameMap?: Map<string, string>, userNameMap?: Map<string, string>) {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (!row.user_id || !row.season_id) continue;
    const key = `${row.user_id}::${row.season_id}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  return Array.from(map.entries())
    .map(([key, user_views]) => {
      const [user_id, season_id] = key.split('::');
      return {
        user_id,
        user_name: userNameMap?.get(user_id) ?? `Utente ${shortId(user_id)}`,
        season_id,
        season_name: seasonNameMap?.get(season_id) ?? `Stagione ${shortId(season_id)}`,
        user_views,
      };
    })
    .sort((a, b) => b.user_views - a.user_views);
}

export function totalPerFormat(rows: ViewEventRow[]) {
  return rows.length;
}

export function userPerFormat(rows: ViewEventRow[], userNameMap?: Map<string, string>) {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (!row.user_id) continue;
    map.set(row.user_id, (map.get(row.user_id) ?? 0) + 1);
  }

  return Array.from(map.entries())
    .map(([user_id, user_views]) => ({
      user_id,
      user_name: userNameMap?.get(user_id) ?? `Utente ${shortId(user_id)}`,
      user_views,
    }))
    .sort((a, b) => b.user_views - a.user_views);
}
