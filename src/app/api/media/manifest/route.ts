import { NextResponse } from 'next/server';
import {
  GetObjectCommand,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { r2Client, r2BucketName } from '@/lib/r2Client';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Episode {
  id: string;
  name?: string;
  episodeNumber?: number;
  thumbnailUrl?: string;
}

interface Season {
  id: string;
  name?: string;
  episodes: Episode[];
}

interface Format {
  id: string;
  name?: string;
  seasons: Season[];
}

interface ManifestData {
  formats: Format[];
  [key: string]: unknown;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const VIDEO_SEGS = new Set(['video', 'videos']);
const COVER_SEGS = new Set(['copertine', 'copertina', 'cover', 'covers', 'thumbnail', 'thumbnails']);
const VIDEO_EXTS = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'm3u8']);

function segmentType(seg: string): 'video' | 'cover' | 'other' {
  const s = seg.toLowerCase().trim();
  if (VIDEO_SEGS.has(s)) return 'video';
  if (COVER_SEGS.has(s) || s.startsWith('copert') || s.includes('thumbnail')) return 'cover';
  return 'other';
}

function fileExt(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

function stemName(filename: string): string {
  return filename.replace(/\.[^.]+$/, '');
}

function prettyName(id: string): string {
  return id.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

async function listAllObjects(): Promise<string[]> {
  if (!r2Client || !r2BucketName) return [];
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const res: ListObjectsV2CommandOutput = await r2Client.send(
      new ListObjectsV2Command({ Bucket: r2BucketName, ContinuationToken: token })
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key && !obj.Key.endsWith('/')) keys.push(obj.Key);
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

/**
 * Build a synthetic manifest from the bucket folder structure.
 *
 * Expected layout (but handles variations):
 *   {format}/{season}/video/{episode}.mp4
 *   {format}/{season}/copertine/{cover}.jpg
 *
 * Rules:
 * - segs[0] = format id
 * - segs[1] = season id  (if it doesn't look like a type folder)
 * - A segment classified as "video" signals the file is an episode
 * - .ts segments (HLS chunks) are skipped; only playlist (.m3u8) or direct videos count
 */
async function buildManifestFromBucket(): Promise<ManifestData> {
  const keys = await listAllObjects();

  // formatId → seasonId → episode stems
  const tree = new Map<string, Map<string, Set<string>>>();

  for (const key of keys) {
    const segs = key.split('/').filter(Boolean);
    if (segs.length < 2) continue;

    const formatId = segs[0];
    const filename = segs[segs.length - 1];
    const ext = fileExt(filename);

    // Skip HLS segments and non-video files
    if (ext === 'ts') continue;
    if (!VIDEO_EXTS.has(ext)) continue;

    // Check if any middle segment classifies as a video folder
    const hasVideoFolder = segs.slice(1, -1).some(s => segmentType(s) === 'video');
    if (!hasVideoFolder && segs.length < 3) continue; // flat file at format level, skip

    // Determine seasonId:
    // If depth >= 4: format/season/videoFolder/file → segs[1] is season
    // If depth == 3 and segs[1] is NOT a type folder: format/season/file → segs[1] is season
    // If depth == 3 and segs[1] IS a video folder: no season → use 'Stagione 1'
    let seasonId: string;
    if (segs.length >= 4) {
      seasonId = segs[1];
    } else if (segs.length === 3 && segmentType(segs[1]) === 'other') {
      seasonId = segs[1];
    } else {
      seasonId = 'Stagione 1';
    }

    if (!tree.has(formatId)) tree.set(formatId, new Map());
    const seasonMap = tree.get(formatId)!;
    if (!seasonMap.has(seasonId)) seasonMap.set(seasonId, new Set());
    seasonMap.get(seasonId)!.add(stemName(filename));
  }

  const formats: Format[] = [];

  for (const [formatId, seasonMap] of tree.entries()) {
    const seasons: Season[] = [];

    for (const [seasonId, stems] of seasonMap.entries()) {
      const sortedStems = Array.from(stems).sort();
      const episodes: Episode[] = sortedStems.map((stem, idx) => ({
        id: stem,
        name: prettyName(stem),
        episodeNumber: idx + 1,
      }));
      seasons.push({ id: seasonId, name: prettyName(seasonId), episodes });
    }

    seasons.sort((a, b) => a.id.localeCompare(b.id));
    formats.push({ id: formatId, name: prettyName(formatId), seasons });
  }

  formats.sort((a, b) => a.id.localeCompare(b.id));
  return { formats };
}

// ── Route handlers ─────────────────────────────────────────────────────────────

export async function GET() {
  if (!r2Client || !r2BucketName) {
    return NextResponse.json({ error: 'R2 not configured' }, { status: 503 });
  }

  try {
    // 1. Try to read manifest.json from lavika-videos
    try {
      const res = await r2Client.send(
        new GetObjectCommand({ Bucket: r2BucketName, Key: 'manifest.json' })
      );
      const body = await res.Body?.transformToString();
      if (body) {
        const parsed = JSON.parse(body) as ManifestData;
        if (Array.isArray(parsed.formats) && parsed.formats.length > 0) {
          return NextResponse.json(parsed);
        }
      }
    } catch (err) {
      const code =
        (err as { Code?: string })?.Code ?? (err as { name?: string })?.name;
      // If not found, fall through to bucket scan; otherwise re-throw
      if (code !== 'NoSuchKey' && code !== 'NotFound') throw err;
    }

    // 2. Fall back: build manifest from bucket folder structure
    const manifest = await buildManifestFromBucket();
    return NextResponse.json(manifest);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (!r2Client || !r2BucketName) {
    return NextResponse.json({ error: 'R2 not configured' }, { status: 503 });
  }

  try {
    const manifest: unknown = await request.json();
    const body = JSON.stringify(manifest, null, 2);

    await r2Client.send(
      new PutObjectCommand({
        Bucket: r2BucketName,
        Key: 'manifest.json',
        Body: body,
        ContentType: 'application/json',
      })
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
