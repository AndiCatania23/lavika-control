import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

/**
 * Normalize an arbitrary format name/path segment into a Supabase format_id slug.
 * e.g. "Press Conference" → "press-conference", "press-conference" → "press-conference"
 */
function toFormatSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_]+/g, '-');
}

/**
 * GET /api/media/formats/[id]/episodes
 * Returns all episodes for a given format from content_episodes.format_id,
 * with the format id normalised to a slug so R2 folder names (e.g. "Press Conference")
 * map correctly to the Supabase format_id (e.g. "press-conference").
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const { id: rawId } = await params;
  const formatId = toFormatSlug(rawId);

  const { data: episodes, error } = await supabaseServer
    .from('content_episodes')
    .select('id, format_id, video_id, title, thumbnail_url, published_at, is_active, min_badge')
    .eq('format_id', formatId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = episodes ?? [];

  // Enrich with season from Video table.
  // content_episodes.video_id ends with the YouTube externalId (always 11 chars).
  // e.g. "unica-sport-live-06-01-2026-p5DfC-DAOAs" → externalId = "p5DfC-DAOAs"
  const youtubeIds = Array.from(
    new Set(
      rows
        .map(ep => (ep.video_id ? ep.video_id.slice(-11) : null))
        .filter((id): id is string => id !== null)
    )
  );

  if (youtubeIds.length === 0) {
    return NextResponse.json(rows);
  }

  const { data: videos } = await supabaseServer
    .from('Video')
    .select('"externalId", season')
    .in('"externalId"', youtubeIds);

  const seasonMap = new Map(
    (videos ?? []).map(v => [v.externalId as string, v.season as string | null])
  );

  return NextResponse.json(
    rows.map(ep => ({
      ...ep,
      season: ep.video_id ? (seasonMap.get(ep.video_id.slice(-11)) ?? null) : null,
    }))
  );
}

const VALID_BADGE_VALUES = ['bronze', 'silver', 'gold'];

/**
 * PATCH /api/media/formats/[id]/episodes
 * Body: { episodeId: string; min_badge: string | null }
 * Updates the min_badge field of a single episode in content_episodes.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  // params.id is only used to scope the update to the correct format (safety check)
  const { id: rawId } = await params;
  const formatId = toFormatSlug(rawId);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 });
  }

  const { episodeId, min_badge } = body as Record<string, unknown>;

  if (typeof episodeId !== 'string' || !episodeId) {
    return NextResponse.json({ error: 'episodeId is required' }, { status: 400 });
  }

  // min_badge can be null (inherit from format) or one of the valid badge values
  if (min_badge !== null && !VALID_BADGE_VALUES.includes(min_badge as string)) {
    return NextResponse.json(
      { error: `min_badge must be null or one of: ${VALID_BADGE_VALUES.join(', ')}` },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseServer
    .from('content_episodes')
    .update({ min_badge: min_badge ?? null })
    .eq('id', episodeId)
    .eq('format_id', formatId)
    .select('id, min_badge')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
