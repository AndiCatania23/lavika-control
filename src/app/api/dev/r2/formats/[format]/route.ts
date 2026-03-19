import { NextResponse } from 'next/server';
import { ListObjectsV2Command, ListObjectsV2CommandOutput } from '@aws-sdk/client-s3';
import { r2BucketName, r2Client } from '@/lib/r2Client';

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

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function toHumanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

type AssetType = 'video' | 'cover' | 'hls-master' | 'hls-segment' | 'other';

function classifyAsset(pathSegments: string[]): AssetType {
  const normalized = pathSegments.map(segment => segment.toLowerCase());
  const filename = normalized[normalized.length - 1] ?? '';

  // HLS detection — any path that contains an 'hls' directory segment
  const hlsIdx = normalized.indexOf('hls');
  if (hlsIdx >= 0) {
    // Master playlist: [format, stagione, hls, nome-episodio, playlist.m3u8] = exactly 5 segments
    if (pathSegments.length === 5 && hlsIdx === 2 && filename === 'playlist.m3u8') {
      return 'hls-master';
    }
    // Profile-level playlists (720p/playlist.m3u8, 480p/playlist.m3u8) and .ts segments
    return 'hls-segment';
  }

  if (normalized.some(segment => segment === 'video' || segment === 'videos')) return 'video';
  if (normalized.some(segment => segment.includes('copert') || segment.includes('cover') || segment.includes('thumbnail'))) {
    return 'cover';
  }
  return 'other';
}

async function listAllObjects(): Promise<Array<{ key: string; size: number }>> {
  if (!r2Client || !r2BucketName) return [];

  let continuationToken: string | undefined;
  const items: Array<{ key: string; size: number }> = [];

  do {
    const response: ListObjectsV2CommandOutput = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: r2BucketName,
        ContinuationToken: continuationToken,
      })
    );

    for (const entry of response.Contents ?? []) {
      if (!entry.Key || entry.Key.endsWith('/')) continue;
      items.push({ key: entry.Key, size: entry.Size ?? 0 });
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return items;
}

export async function GET(_: Request, { params }: { params: Promise<{ format: string }> }) {
  const { format } = await params;

  if (!r2Client || !r2BucketName) {
    return NextResponse.json({ error: 'R2 not configured' }, { status: 503 });
  }

  const requested = decodeURIComponent(format);
  const requestedNormalized = normalizeName(requested);
  const objects = await listAllObjects();

  const seasonMap = new Map<string, Omit<SeasonStat, 'sizeHuman'>>();
  // Tracks how many HLS master playlists (= episodes) exist per season
  const seasonHlsMasterMap = new Map<string, number>();
  let matchedFormatName: string | null = null;

  for (const item of objects) {
    const segments = item.key.split('/').filter(Boolean);
    if (segments.length === 0) continue;

    const formatName = segments[0];
    if (normalizeName(formatName) !== requestedNormalized) continue;
    matchedFormatName = formatName;

    const seasonName = segments[1] ?? 'Generale';
    if (!seasonMap.has(seasonName)) {
      seasonMap.set(seasonName, {
        season: seasonName,
        videos: 0,
        covers: 0,
        other: 0,
        episodes: 0,
        totalAssets: 0,
        sizeBytes: 0,
      });
    }

    const stat = seasonMap.get(seasonName)!;
    const type = classifyAsset(segments);

    if (type === 'video') {
      stat.videos += 1;
    } else if (type === 'cover') {
      stat.covers += 1;
    } else if (type === 'hls-master') {
      seasonHlsMasterMap.set(seasonName, (seasonHlsMasterMap.get(seasonName) ?? 0) + 1);
    } else if (type === 'other') {
      stat.other += 1;
    }
    // 'hls-segment' (.ts and profile-level playlists): excluded from other, not counted separately

    stat.totalAssets += 1;
    stat.sizeBytes += item.size;
  }

  // Compute episodes per season: max(MP4 count, HLS master playlist count)
  // Handles: solo MP4 → usa MP4; transizione MP4+HLS → usa il maggiore; solo HLS → usa master
  for (const [seasonName, stat] of seasonMap.entries()) {
    stat.episodes = Math.max(stat.videos, seasonHlsMasterMap.get(seasonName) ?? 0);
  }

  if (!matchedFormatName) {
    return NextResponse.json({ error: 'Format not found' }, { status: 404 });
  }

  const seasons = Array.from(seasonMap.values())
    .map(season => ({ ...season, sizeHuman: toHumanSize(season.sizeBytes) }))
    .sort((a, b) => b.episodes - a.episodes);

  const totals = seasons.reduce(
    (acc, season) => {
      acc.seasons += 1;
      acc.videos += season.videos;
      acc.covers += season.covers;
      acc.other += season.other;
      acc.episodes += season.episodes;
      acc.totalAssets += season.totalAssets;
      acc.sizeBytes += season.sizeBytes;
      return acc;
    },
    {
      seasons: 0,
      videos: 0,
      covers: 0,
      other: 0,
      episodes: 0,
      totalAssets: 0,
      sizeBytes: 0,
    }
  );

  return NextResponse.json({
    format: matchedFormatName,
    totals: {
      ...totals,
      sizeHuman: toHumanSize(totals.sizeBytes),
    },
    seasons,
    generatedAt: new Date().toISOString(),
  });
}
