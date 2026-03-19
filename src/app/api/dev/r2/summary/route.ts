import { NextResponse } from 'next/server';
import { ListObjectsV2Command, ListObjectsV2CommandOutput } from '@aws-sdk/client-s3';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { r2BucketName, r2Client } from '@/lib/r2Client';

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

interface ObjectItem {
  key: string;
  size: number;
}

const VIDEO_SEGMENTS = new Set(['video', 'videos']);
const COVER_SEGMENTS = new Set(['copertine', 'copertina', 'cover', 'covers', 'thumbnail', 'thumbnails']);

async function listTopLevelFormats(): Promise<string[]> {
  if (!r2Client || !r2BucketName) return [];

  const formats: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response: ListObjectsV2CommandOutput = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: r2BucketName,
        Delimiter: '/',
        ContinuationToken: continuationToken,
      })
    );

    for (const prefix of response.CommonPrefixes ?? []) {
      const value = prefix.Prefix?.replace(/\/$/, '');
      if (value) {
        formats.push(value);
      }
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return formats;
}

async function listAllObjects(): Promise<ObjectItem[]> {
  if (!r2Client || !r2BucketName) return [];

  let continuationToken: string | undefined;
  const results: ObjectItem[] = [];

  do {
    const response: ListObjectsV2CommandOutput = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: r2BucketName,
        ContinuationToken: continuationToken,
      })
    );

    for (const item of response.Contents ?? []) {
      if (!item.Key || item.Key.endsWith('/')) continue;
      results.push({
        key: item.Key,
        size: item.Size ?? 0,
      });
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return results;
}

function normalizeSegment(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, '_');
}

type AssetType = 'video' | 'cover' | 'hls-master' | 'hls-segment' | 'other';

function classifyAsset(pathSegments: string[]): AssetType {
  const normalized = pathSegments.map(normalizeSegment);
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

  if (normalized.some(segment => VIDEO_SEGMENTS.has(segment))) {
    return 'video';
  }

  if (
    normalized.some(segment =>
      COVER_SEGMENTS.has(segment) || segment.startsWith('copert') || segment.includes('cover')
    )
  ) {
    return 'cover';
  }

  return 'other';
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

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

interface FormatCoverSet {
  vertical?: string;
  horizontal?: string;
}

async function loadFormatCovers(): Promise<Map<string, FormatCoverSet>> {
  const coversDir = path.join(process.cwd(), 'public', 'immagini', 'Format Cover');
  const map = new Map<string, FormatCoverSet>();

  try {
    const formatDirs = await readdir(coversDir, { withFileTypes: true });

    for (const dir of formatDirs) {
      if (!dir.isDirectory()) continue;

      const folderPath = path.join(coversDir, dir.name);
      const files = await readdir(folderPath, { withFileTypes: true });
      const key = normalizeName(dir.name);
      const entry: FormatCoverSet = {};

      for (const file of files) {
        if (!file.isFile()) continue;
        const ext = path.extname(file.name).toLowerCase();
        if (!['.jpg', '.jpeg', '.png', '.webp', '.avif'].includes(ext)) continue;

        const lower = file.name.toLowerCase();
        const url = `/immagini/Format Cover/${encodeURIComponent(dir.name)}/${encodeURIComponent(file.name)}`;

        if (!entry.vertical && lower.includes('card verticale')) {
          entry.vertical = url;
        }

        if (!entry.horizontal && lower.includes('card orizzontale')) {
          entry.horizontal = url;
        }
      }

      if (entry.vertical || entry.horizontal) {
        map.set(key, entry);
      }
    }
  } catch {
    return map;
  }

  return map;
}

function matchCover(formatName: string, coversMap: Map<string, FormatCoverSet>): FormatCoverSet {
  const normalizedFormat = normalizeName(formatName);
  const direct = coversMap.get(normalizedFormat);
  if (direct) return direct;

  for (const [key, value] of coversMap.entries()) {
    if (key.includes(normalizedFormat) || normalizedFormat.includes(key)) {
      return value;
    }
  }

  return {};
}

export async function GET() {
  const env = {
    hasAccountId: Boolean(process.env.R2_ACCOUNT_ID),
    hasAccessKey: Boolean(process.env.R2_ACCESS_KEY_ID),
    hasSecretKey: Boolean(process.env.R2_SECRET_ACCESS_KEY),
    hasBucket: Boolean(process.env.R2_BUCKET_NAME),
  };

  if (!r2Client || !r2BucketName) {
    return NextResponse.json({
      connected: false,
      env,
      totals: {
        formats: 0,
        videos: 0,
        covers: 0,
        other: 0,
        allAssets: 0,
        sizeBytes: 0,
        sizeHuman: '0 B',
      },
      formats: [] as FormatStat[],
    });
  }

  try {
    const objects = await listAllObjects();
    const coversMap = await loadFormatCovers();
    const map = new Map<string, FormatStat>();
    const seasonsMap = new Map<string, Set<string>>();
    // Tracks how many HLS master playlists (= episodes) exist per format
    const hlsMasterMap = new Map<string, number>();

    for (const item of objects) {
      const segments = item.key.split('/').filter(Boolean);
      if (segments.length === 0) continue;

      const formatName = segments[0];
      if (!map.has(formatName)) {
        const matchedCover = matchCover(formatName, coversMap);
        map.set(formatName, {
          format: formatName,
          videos: 0,
          covers: 0,
          other: 0,
          total: 0,
          sizeBytes: 0,
          seasons: 0,
          episodes: 0,
          coverVerticalUrl: matchedCover.vertical,
          coverHorizontalUrl: matchedCover.horizontal,
        });
      }

      if (segments.length > 1) {
        if (!seasonsMap.has(formatName)) {
          seasonsMap.set(formatName, new Set());
        }
        seasonsMap.get(formatName)!.add(segments[1]);
      }

      const bucket = map.get(formatName)!;
      const type = classifyAsset(segments);

      if (type === 'video') {
        bucket.videos += 1;
      } else if (type === 'cover') {
        bucket.covers += 1;
      } else if (type === 'hls-master') {
        hlsMasterMap.set(formatName, (hlsMasterMap.get(formatName) ?? 0) + 1);
      } else if (type === 'other') {
        bucket.other += 1;
      }
      // 'hls-segment' (.ts and profile-level playlists): excluded from other, not counted separately

      bucket.total += 1;
      bucket.sizeBytes += item.size;
    }

    if (map.size === 0) {
      for (const formatName of await listTopLevelFormats()) {
        const matchedCover = matchCover(formatName, coversMap);
        map.set(formatName, {
          format: formatName,
          videos: 0,
          covers: 0,
          other: 0,
          total: 0,
          sizeBytes: 0,
          seasons: 0,
          episodes: 0,
          coverVerticalUrl: matchedCover.vertical,
          coverHorizontalUrl: matchedCover.horizontal,
        });
      }
    }

    const stats: FormatStat[] = Array.from(map.values());
    let videosTotal = 0;
    let coversTotal = 0;
    let otherTotal = 0;
    let assetsTotal = 0;
    let bytesTotal = 0;

    for (const row of stats) {
      row.seasons = seasonsMap.get(row.format)?.size ?? 0;
      // episodes = max(MP4 count, HLS master playlist count)
      // Handles: solo MP4 → usa MP4; transizione MP4+HLS → usa il maggiore; solo HLS → usa master
      row.episodes = Math.max(row.videos, hlsMasterMap.get(row.format) ?? 0);
      videosTotal += row.videos;
      coversTotal += row.covers;
      otherTotal += row.other;
      assetsTotal += row.total;
      bytesTotal += row.sizeBytes;
    }

    return NextResponse.json({
      connected: true,
      env,
      totals: {
        formats: stats.length,
        videos: videosTotal,
        covers: coversTotal,
        other: otherTotal,
        allAssets: assetsTotal,
        sizeBytes: bytesTotal,
        sizeHuman: toHumanSize(bytesTotal),
      },
      formats: stats.sort((a, b) => b.total - a.total),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown R2 error';

    return NextResponse.json(
      {
        connected: false,
        env,
        error: message,
        totals: {
          formats: 0,
          videos: 0,
          covers: 0,
          other: 0,
          allAssets: 0,
          sizeBytes: 0,
          sizeHuman: '0 B',
        },
        formats: [] as FormatStat[],
      },
      { status: 500 }
    );
  }
}
