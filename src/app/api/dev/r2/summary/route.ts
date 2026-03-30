import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Catalogo media — legge da Supabase (content_formats + content_episodes)
 * invece di scansionare tutti i file R2 (migliaia di segmenti HLS).
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

interface SupaFormat {
  id: string;
  title: string | null;
}

interface SupaEpisode {
  format_id: string;
  season: string | null;
  video_id: string | null;
}

export async function GET() {
  if (!supabaseServer) {
    return NextResponse.json({
      connected: false,
      totals: { formats: 0, videos: 0, covers: 0, other: 0, allAssets: 0, sizeBytes: 0, sizeHuman: '0 B' },
      formats: [] as FormatStat[],
    });
  }

  try {
    const [formatsRes, episodesRes, coversMap] = await Promise.all([
      supabaseServer.from('content_formats').select('id, title'),
      supabaseServer.from('content_episodes').select('format_id, season, video_id'),
      loadFormatCovers(),
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

    const stats: FormatStat[] = [];
    let videosTotal = 0;
    let episodesTotal = 0;

    for (const fmt of formats) {
      const fmtEpisodes = episodesByFormat.get(fmt.id) ?? [];
      const seasons = new Set(fmtEpisodes.map(e => e.season).filter(Boolean));
      const withVideo = fmtEpisodes.filter(e => e.video_id).length;
      const matchedCover = matchCover(fmt.title ?? fmt.id, coversMap);

      stats.push({
        format: fmt.title ?? fmt.id,
        videos: withVideo,
        covers: 0,
        other: 0,
        total: fmtEpisodes.length,
        sizeBytes: 0,
        seasons: seasons.size,
        episodes: fmtEpisodes.length,
        coverVerticalUrl: matchedCover.vertical,
        coverHorizontalUrl: matchedCover.horizontal,
      });

      videosTotal += withVideo;
      episodesTotal += fmtEpisodes.length;
    }

    return NextResponse.json({
      connected: true,
      totals: {
        formats: stats.length,
        videos: videosTotal,
        covers: 0,
        other: 0,
        allAssets: episodesTotal,
        sizeBytes: 0,
        sizeHuman: '-',
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
