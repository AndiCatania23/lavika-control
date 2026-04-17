import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { r2Client, r2BucketName } from '@/lib/r2Client';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';

/**
 * Catalogo media — metadati da Supabase, dimensioni reali da R2.
 */

interface FormatStat {
  format: string;
  videos: number;
  covers: number;
  other: number;
  total: number;
  sizeBytes: number;
  seasons: number;
  episodes: number;
  coverVerticalUrl?: string;
  coverHorizontalUrl?: string;
}

interface SupaFormat {
  id: string;
  title: string | null;
  cover_vertical_url: string | null;
  cover_horizontal_url: string | null;
}

interface SupaEpisode {
  format_id: string;
  season: string | null;
  video_id: string | null;
  r2_key: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i >= 2 ? 2 : 0)} ${units[i]}`;
}

// ── R2 size cache (in-memory, 1 hour TTL) ────────────────────────────────────

interface R2SizeCache {
  byPrefix: Map<string, number>;
  totalBytes: number;
  cachedAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let r2SizeCache: R2SizeCache | null = null;

/** List all objects under a prefix and sum their sizes. */
async function sumR2PrefixSize(prefix: string): Promise<number> {
  if (!r2Client || !r2BucketName) return 0;

  let totalSize = 0;
  let token: string | undefined;

  do {
    const res = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: r2BucketName,
        Prefix: prefix,
        ContinuationToken: token,
      })
    );
    for (const obj of res.Contents ?? []) {
      totalSize += obj.Size ?? 0;
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  return totalSize;
}

/**
 * Extract the real R2 root prefix for each format from r2_key values.
 * e.g. format_id "highlights" → R2 prefix "HIGHLIGHTS/"
 */
function resolveR2Prefixes(episodes: SupaEpisode[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const ep of episodes) {
    if (!ep.r2_key || map.has(ep.format_id)) continue;
    const firstSlash = ep.r2_key.indexOf('/');
    if (firstSlash > 0) {
      map.set(ep.format_id, ep.r2_key.substring(0, firstSlash + 1));
    }
  }
  return map;
}

/** Get R2 sizes per format, using a 1-hour cache. */
async function getR2Sizes(formatIds: string[], r2Prefixes: Map<string, string>): Promise<Map<string, number>> {
  // Return cached data if still fresh
  if (r2SizeCache && Date.now() - r2SizeCache.cachedAt < CACHE_TTL_MS) {
    return r2SizeCache.byPrefix;
  }

  if (!r2Client || !r2BucketName) {
    return new Map();
  }

  // Scan all format prefixes in parallel, using real R2 prefixes
  const results = await Promise.all(
    formatIds.map(async (id) => {
      const prefix = r2Prefixes.get(id) ?? `${id}/`;
      const size = await sumR2PrefixSize(prefix);
      return [id, size] as const;
    })
  );

  const byPrefix = new Map<string, number>(results);
  const totalBytes = results.reduce((sum, [, size]) => sum + size, 0);

  r2SizeCache = { byPrefix, totalBytes, cachedAt: Date.now() };
  return byPrefix;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  // ?fast=1 skips the R2 ListObjectsV2 scan (size fields will be 0).
  // Used by the dashboard home to avoid a multi-second blocking call.
  const fast = new URL(request.url).searchParams.get('fast') === '1';

  if (!supabaseServer) {
    return NextResponse.json({
      connected: false,
      totals: { formats: 0, videos: 0, covers: 0, other: 0, allAssets: 0, sizeBytes: 0, sizeHuman: '0 B' },
      formats: [] as FormatStat[],
    });
  }

  try {
    const [formatsRes, episodesRes] = await Promise.all([
      supabaseServer.from('content_formats').select('id, title, cover_vertical_url, cover_horizontal_url'),
      supabaseServer.from('content_episodes').select('format_id, season, video_id, r2_key'),
    ]);

    const formats = (formatsRes.data ?? []) as SupaFormat[];
    const episodes = (episodesRes.data ?? []) as SupaEpisode[];

    // Group episodes by format
    const episodesByFormat = new Map<string, SupaEpisode[]>();
    for (const ep of episodes) {
      const list = episodesByFormat.get(ep.format_id) ?? [];
      list.push(ep);
      episodesByFormat.set(ep.format_id, list);
    }

    // Get real R2 sizes per format (cached 1h) — skip in fast mode.
    const formatIds = formats.map(f => f.id);
    const r2Prefixes = resolveR2Prefixes(episodes);
    const r2Sizes = fast ? new Map<string, number>() : await getR2Sizes(formatIds, r2Prefixes);

    const stats: FormatStat[] = [];
    let videosTotal = 0;
    let episodesTotal = 0;
    let sizeBytesTotal = 0;

    for (const fmt of formats) {
      const fmtEpisodes = episodesByFormat.get(fmt.id) ?? [];
      const seasons = new Set(fmtEpisodes.map(e => e.season).filter(Boolean));
      const withVideo = fmtEpisodes.filter(e => e.video_id).length;
      const fmtSizeBytes = r2Sizes.get(fmt.id) ?? 0;

      stats.push({
        format: fmt.title ?? fmt.id,
        videos: withVideo,
        covers: 0,
        other: 0,
        total: fmtEpisodes.length,
        sizeBytes: fmtSizeBytes,
        seasons: seasons.size,
        episodes: fmtEpisodes.length,
        coverVerticalUrl: fmt.cover_vertical_url ?? undefined,
        coverHorizontalUrl: fmt.cover_horizontal_url ?? undefined,
      });

      videosTotal += withVideo;
      episodesTotal += fmtEpisodes.length;
      sizeBytesTotal += fmtSizeBytes;
    }

    return NextResponse.json({
      connected: true,
      totals: {
        formats: stats.length,
        videos: videosTotal,
        covers: 0,
        other: 0,
        allAssets: episodesTotal,
        sizeBytes: sizeBytesTotal,
        sizeHuman: formatBytes(sizeBytesTotal),
      },
      formats: stats.sort((a, b) => b.episodes - a.episodes),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      {
        connected: false,
        error: message,
        totals: { formats: 0, videos: 0, covers: 0, other: 0, allAssets: 0, sizeBytes: 0, sizeHuman: '0 B' },
        formats: [] as FormatStat[],
      },
      { status: 500 }
    );
  }
}
