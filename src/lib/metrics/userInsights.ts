import { supabaseServer } from '@/lib/supabaseServer';

interface ContentEventRow {
  occurred_at: string;
  format_id: string | null;
  season_id: string | null;
  episode_id: string | null;
  metadata: Record<string, unknown> | null;
}

interface ContentWatchTimeRow {
  watch_time_seconds: number | null;
}

type DayPart = 'notte' | 'mattina' | 'pomeriggio' | 'sera' | 'n/d';

export interface UserTopFormat {
  formatId: string;
  formatName: string;
  views: number;
  share: number;
}

export interface UserTopEpisode {
  episodeId: string;
  episodeName: string;
  seasonName: string;
  views: number;
  lastViewedAt: string | null;
  rewatched: boolean;
}

export interface UserTopSeason {
  seasonId: string;
  seasonName: string;
  views: number;
}

export interface UserContentInsights {
  userId: string;
  totalViews: number;
  uniqueFormats: number;
  uniqueSeasons: number;
  uniqueEpisodes: number;
  rewatchedEpisodes: number;
  rewatchRate: number;
  favoritesCount: number;
  watchTimeSeconds: number;
  activeDays: number;
  avgViewsPerActiveDay: number;
  firstViewAt: string | null;
  lastViewAt: string | null;
  lastActivityAt: string | null;
  activeNow: boolean;
  active24h: boolean;
  active7d: boolean;
  preferredDayPart: DayPart;
  engagementSegment: 'new' | 'casual' | 'core' | 'power';
  topFormats: UserTopFormat[];
  topEpisodes: UserTopEpisode[];
  topSeasons: UserTopSeason[];
}

function shortId(value: string): string {
  return value.length > 8 ? value.slice(0, 8) : value;
}

function pickText(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function getDayPart(occurredAt: string): DayPart {
  const hour = new Date(occurredAt).getUTCHours();
  if (!Number.isFinite(hour)) return 'n/d';
  if (hour < 6) return 'notte';
  if (hour < 12) return 'mattina';
  if (hour < 18) return 'pomeriggio';
  return 'sera';
}

function inferEngagementSegment(totalViews: number, activeDays: number, rewatchRate: number): UserContentInsights['engagementSegment'] {
  if (totalViews <= 2 || activeDays <= 1) return 'new';
  if (totalViews >= 80 || (activeDays >= 18 && rewatchRate >= 0.3)) return 'power';
  if (totalViews >= 25 || activeDays >= 8) return 'core';
  return 'casual';
}

function maxTimestamp(values: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  let bestTime = Number.NEGATIVE_INFINITY;

  for (const value of values) {
    if (!value) continue;
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) continue;
    if (time > bestTime) {
      bestTime = time;
      best = value;
    }
  }

  return best;
}

export function emptyUserInsights(userId: string): UserContentInsights {
  return {
    userId,
    totalViews: 0,
    uniqueFormats: 0,
    uniqueSeasons: 0,
    uniqueEpisodes: 0,
    rewatchedEpisodes: 0,
    rewatchRate: 0,
    favoritesCount: 0,
    watchTimeSeconds: 0,
    activeDays: 0,
    avgViewsPerActiveDay: 0,
    firstViewAt: null,
    lastViewAt: null,
    lastActivityAt: null,
    activeNow: false,
    active24h: false,
    active7d: false,
    preferredDayPart: 'n/d',
    engagementSegment: 'new',
    topFormats: [],
    topEpisodes: [],
    topSeasons: [],
  };
}

export async function loadUserContentInsights(userId: string): Promise<UserContentInsights> {
  if (!supabaseServer) {
    return emptyUserInsights(userId);
  }

  const allRows: ContentEventRow[] = [];
  const pageSize = 1000;
  const maxPages = 100;

  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await supabaseServer
      .from('content_events')
      .select('occurred_at,format_id,season_id,episode_id,metadata')
      .eq('event_name', 'view_start')
      .eq('user_id', userId)
      .order('occurred_at', { ascending: false })
      .range(from, to);

    if (error || !data) break;

    const batch = data as ContentEventRow[];
    if (batch.length === 0) break;
    allRows.push(...batch);
    if (batch.length < pageSize) break;
  }

  const [{ count: favoritesCount }, watchTimeResult] = await Promise.all([
    supabaseServer
      .from('favorites')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
    supabaseServer
      .from('content_watch_time')
      .select('watch_time_seconds')
      .eq('user_id', userId),
  ]);

  const watchTimeRows = (watchTimeResult.data as ContentWatchTimeRow[] | null) ?? [];
  const watchTimeSeconds = watchTimeRows.reduce((sum, row) => {
    const value = typeof row.watch_time_seconds === 'number' ? row.watch_time_seconds : 0;
    return sum + Math.max(0, value);
  }, 0);

  const [{ data: lastWatchHistoryRow }, { data: lastWatchTimeRow }, { data: lastSessionRow }] = await Promise.all([
    supabaseServer
      .from('watch_history')
      .select('viewed_at')
      .eq('user_id', userId)
      .order('viewed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseServer
      .from('content_watch_time')
      .select('last_watched_at')
      .eq('user_id', userId)
      .order('last_watched_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseServer
      .from('user_sessions')
      .select('last_seen_at')
      .eq('user_id', userId)
      .order('last_seen_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const lastActivityAtFromSecondary = maxTimestamp([
    (lastWatchHistoryRow as { viewed_at?: string | null } | null)?.viewed_at ?? null,
    (lastWatchTimeRow as { last_watched_at?: string | null } | null)?.last_watched_at ?? null,
    (lastSessionRow as { last_seen_at?: string | null } | null)?.last_seen_at ?? null,
  ]);

  if (allRows.length === 0) {
    const empty = emptyUserInsights(userId);
    empty.favoritesCount = favoritesCount ?? 0;
    empty.watchTimeSeconds = watchTimeSeconds;
    empty.lastActivityAt = lastActivityAtFromSecondary;

    if (lastActivityAtFromSecondary) {
      const lastMs = new Date(lastActivityAtFromSecondary).getTime();
      if (Number.isFinite(lastMs)) {
        const now = Date.now();
        empty.activeNow = now - lastMs <= 30 * 60 * 1000;
        empty.active24h = now - lastMs <= 24 * 60 * 60 * 1000;
        empty.active7d = now - lastMs <= 7 * 24 * 60 * 60 * 1000;
      }
    }

    return empty;
  }

  const formatViews = new Map<string, number>();
  const formatNames = new Map<string, string>();
  const seasonViews = new Map<string, number>();
  const seasonNames = new Map<string, string>();
  const episodeViews = new Map<string, number>();
  const episodeNames = new Map<string, string>();
  const episodeLastViewed = new Map<string, string>();
  const episodeSeasonName = new Map<string, string>();
  const activeDays = new Set<string>();
  const dayPartViews = new Map<DayPart, number>();

  for (const row of allRows) {
    const metadata = row.metadata ?? {};
    activeDays.add(row.occurred_at.slice(0, 10));

    const dayPart = getDayPart(row.occurred_at);
    dayPartViews.set(dayPart, (dayPartViews.get(dayPart) ?? 0) + 1);

    if (row.format_id) {
      formatViews.set(row.format_id, (formatViews.get(row.format_id) ?? 0) + 1);
      const formatName = pickText(
        metadata.format_title,
        metadata.format_name,
        metadata.format_key,
        metadata.format_id,
      );
      formatNames.set(row.format_id, formatName ?? `Format ${shortId(row.format_id)}`);
    }

    if (row.season_id) {
      seasonViews.set(row.season_id, (seasonViews.get(row.season_id) ?? 0) + 1);
      const seasonName = pickText(
        metadata.season_title,
        metadata.season_name,
        metadata.season_key,
      );
      seasonNames.set(row.season_id, seasonName ? `Stagione ${seasonName}` : `Stagione ${shortId(row.season_id)}`);
    }

    if (row.episode_id) {
      episodeViews.set(row.episode_id, (episodeViews.get(row.episode_id) ?? 0) + 1);
      const episodeName = pickText(
        metadata.episode_title,
        metadata.content_title,
        metadata.content_id,
        metadata.episode_key,
      );
      episodeNames.set(row.episode_id, episodeName ?? `Episodio ${shortId(row.episode_id)}`);
      episodeLastViewed.set(row.episode_id, row.occurred_at);

      const seasonName = pickText(metadata.season_title, metadata.season_name, metadata.season_key);
      if (seasonName) {
        episodeSeasonName.set(row.episode_id, `Stagione ${seasonName}`);
      } else if (row.season_id) {
        episodeSeasonName.set(row.episode_id, seasonNames.get(row.season_id) ?? `Stagione ${shortId(row.season_id)}`);
      }
    }
  }

  const totalViews = allRows.length;
  const uniqueEpisodes = episodeViews.size;
  const rewatchedEpisodes = Array.from(episodeViews.values()).filter(value => value > 1).length;
  const rewatchRate = uniqueEpisodes > 0 ? rewatchedEpisodes / uniqueEpisodes : 0;

  const topFormats = Array.from(formatViews.entries())
    .map(([formatId, views]) => ({
      formatId,
      formatName: formatNames.get(formatId) ?? `Format ${shortId(formatId)}`,
      views,
      share: views / totalViews,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 5);

  const topEpisodes = Array.from(episodeViews.entries())
    .map(([episodeId, views]) => ({
      episodeId,
      episodeName: episodeNames.get(episodeId) ?? `Episodio ${shortId(episodeId)}`,
      seasonName: episodeSeasonName.get(episodeId) ?? 'Stagione n/d',
      views,
      lastViewedAt: episodeLastViewed.get(episodeId) ?? null,
      rewatched: views > 1,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 5);

  const topSeasons = Array.from(seasonViews.entries())
    .map(([seasonId, views]) => ({
      seasonId,
      seasonName: seasonNames.get(seasonId) ?? `Stagione ${shortId(seasonId)}`,
      views,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 5);

  const preferredDayPart = Array.from(dayPartViews.entries())
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'n/d';

  const activeDaysCount = activeDays.size;
  const lastViewAt = allRows[0]?.occurred_at ?? null;
  const lastActivityAt = maxTimestamp([
    lastViewAt,
    lastActivityAtFromSecondary,
  ]);
  const lastActivityMs = lastActivityAt ? new Date(lastActivityAt).getTime() : Number.NaN;
  const now = Date.now();

  const activeNow = Number.isFinite(lastActivityMs) ? now - lastActivityMs <= 30 * 60 * 1000 : false;
  const active24h = Number.isFinite(lastActivityMs) ? now - lastActivityMs <= 24 * 60 * 60 * 1000 : false;
  const active7d = Number.isFinite(lastActivityMs) ? now - lastActivityMs <= 7 * 24 * 60 * 60 * 1000 : false;

  return {
    userId,
    totalViews,
    uniqueFormats: formatViews.size,
    uniqueSeasons: seasonViews.size,
    uniqueEpisodes,
    rewatchedEpisodes,
    rewatchRate,
    favoritesCount: favoritesCount ?? 0,
    watchTimeSeconds,
    activeDays: activeDaysCount,
    avgViewsPerActiveDay: activeDaysCount > 0 ? totalViews / activeDaysCount : 0,
    firstViewAt: allRows[allRows.length - 1]?.occurred_at ?? null,
    lastViewAt,
    lastActivityAt,
    activeNow,
    active24h,
    active7d,
    preferredDayPart,
    engagementSegment: inferEngagementSegment(totalViews, activeDaysCount, rewatchRate),
    topFormats,
    topEpisodes,
    topSeasons,
  };
}
