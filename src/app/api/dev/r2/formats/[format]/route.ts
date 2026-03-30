import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

/**
 * Dettaglio formato — legge da Supabase (content_formats + content_episodes)
 * invece di scansionare tutti i file R2.
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
}

export async function GET(_: Request, { params }: { params: Promise<{ format: string }> }) {
  const { format } = await params;

  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const requested = decodeURIComponent(format);

  // Find format by title (case-insensitive)
  const { data: formats } = await supabaseServer
    .from('content_formats')
    .select('id, title')
    .ilike('title', requested);

  const matchedFormat = formats?.[0];
  if (!matchedFormat) {
    return NextResponse.json({ error: 'Format not found' }, { status: 404 });
  }

  // Load episodes for this format
  const { data: episodes } = await supabaseServer
    .from('content_episodes')
    .select('id, title, season, video_id, is_active')
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

  const seasons = Array.from(seasonMap.values())
    .sort((a, b) => b.episodes - a.episodes);

  const totals = seasons.reduce(
    (acc, s) => {
      acc.seasons += 1;
      acc.videos += s.videos;
      acc.episodes += s.episodes;
      acc.totalAssets += s.totalAssets;
      return acc;
    },
    { seasons: 0, videos: 0, covers: 0, other: 0, episodes: 0, totalAssets: 0, sizeBytes: 0 }
  );

  return NextResponse.json({
    format: matchedFormat.title,
    totals: {
      ...totals,
      sizeHuman: '-',
    },
    seasons,
    generatedAt: new Date().toISOString(),
  });
}
