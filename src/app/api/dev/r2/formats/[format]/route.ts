import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { r2Client, r2BucketName } from '@/lib/r2Client';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';

/**
 * Dettaglio formato — metadati da Supabase, dimensioni reali da R2.
 */

interface SeasonStat {
  season: string;
  videos: number;
  covers: number;
  other: number;
  episodes: number;
  totalAssets: number;
  sizeBytes: number;
  sizeHuman: string;
}

interface SupaEpisode {
  id: string;
  title: string | null;
  season: string | null;
  video_id: string | null;
  is_active: boolean;
  r2_key: string | null;
}

function formatBytesHuman(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i >= 2 ? 2 : 0)} ${units[i]}`;
}

// ── R2 size helpers ───────────────────────────────────────────────────────────

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
 * Extract the real R2 prefix for each season from r2_key values.
 * e.g. r2_key "HIGHLIGHTS/2025-2026/hls/file.m3u8" → "HIGHLIGHTS/2025-2026/"
 * Returns a map: seasonName → R2 prefix (first 2 path segments + slash)
 */
function resolveSeasonR2Prefixes(episodes: SupaEpisode[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const ep of episodes) {
    const seasonName = ep.season ?? 'Generale';
    if (!ep.r2_key || map.has(seasonName)) continue;
    // Extract first two segments: "FORMAT_ROOT/SEASON_DIR/"
    const parts = ep.r2_key.split('/');
    if (parts.length >= 2) {
      map.set(seasonName, `${parts[0]}/${parts[1]}/`);
    }
  }
  return map;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(_: Request, { params }: { params: Promise<{ format: string }> }) {
  const { format } = await params;

  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const requested = decodeURIComponent(format);

  const { data: formats } = await supabaseServer
    .from('content_formats')
    .select('id, title')
    .ilike('title', requested);

  const matchedFormat = formats?.[0];
  if (!matchedFormat) {
    return NextResponse.json({ error: 'Format not found' }, { status: 404 });
  }

  const { data: episodes } = await supabaseServer
    .from('content_episodes')
    .select('id, title, season, video_id, is_active, r2_key')
    .eq('format_id', matchedFormat.id);

  const episodeList = (episodes ?? []) as SupaEpisode[];

  // Group by season
  const seasonMap = new Map<string, SeasonStat>();

  for (const ep of episodeList) {
    const seasonName = ep.season ?? 'Generale';
    if (!seasonMap.has(seasonName)) {
      seasonMap.set(seasonName, {
        season: seasonName,
        videos: 0,
        covers: 0,
        other: 0,
        episodes: 0,
        totalAssets: 0,
        sizeBytes: 0,
        sizeHuman: '-',
      });
    }

    const stat = seasonMap.get(seasonName)!;
    stat.episodes += 1;
    stat.totalAssets += 1;
    if (ep.video_id) {
      stat.videos += 1;
    }
  }

  // Get real R2 sizes per season using actual R2 prefixes
  const seasonR2Prefixes = resolveSeasonR2Prefixes(episodeList);

  const seasonSizeResults = await Promise.all(
    Array.from(seasonMap.keys()).map(async (seasonName) => {
      const prefix = seasonR2Prefixes.get(seasonName);
      const size = prefix ? await sumR2PrefixSize(prefix) : 0;
      return [seasonName, size] as const;
    })
  );
  const seasonSizes = new Map(seasonSizeResults);

  const seasons = Array.from(seasonMap.entries())
    .map(([name, s]) => {
      const sizeBytes = seasonSizes.get(name) ?? 0;
      return { ...s, sizeBytes, sizeHuman: formatBytesHuman(sizeBytes) };
    })
    .sort((a, b) => b.episodes - a.episodes);

  const totals = seasons.reduce(
    (acc, s) => {
      acc.seasons += 1;
      acc.videos += s.videos;
      acc.episodes += s.episodes;
      acc.totalAssets += s.totalAssets;
      acc.sizeBytes += s.sizeBytes;
      return acc;
    },
    { seasons: 0, videos: 0, covers: 0, other: 0, episodes: 0, totalAssets: 0, sizeBytes: 0 }
  );

  return NextResponse.json({
    format: matchedFormat.title,
    totals: {
      ...totals,
      sizeHuman: formatBytesHuman(totals.sizeBytes),
    },
    seasons,
    generatedAt: new Date().toISOString(),
  });
}
