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
    .select(`
      id, format_id, video_id, title, thumbnail_url, published_at,
      is_active, min_badge, season, competition_season_id,
      competition_season:competition_seasons!competition_season_id(
        season_label,
        competition:competitions!competition_id(name)
      )
    `)
    .eq('format_id', formatId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Flatten the nested competition_season → competition relation into a single
  // `competition_label` string ("Competition · Season") so the Control page can
  // build a filter dropdown that mirrors the app (Playoff 2025/26 vs Serie C 2025/26)
  // without having to traverse the relation client-side.
  type CompetitionRel = { name: string | null } | { name: string | null }[] | null;
  type CompetitionSeasonRel = {
    season_label: string | null;
    competition: CompetitionRel;
  } | { season_label: string | null; competition: CompetitionRel }[] | null;
  type Row = {
    id: string;
    format_id: string;
    video_id: string | null;
    title: string | null;
    thumbnail_url: string | null;
    published_at: string | null;
    is_active: boolean;
    min_badge: string | null;
    season: string | null;
    competition_season_id: string | null;
    competition_season: CompetitionSeasonRel;
  };

  const enriched = (episodes as Row[] | null ?? []).map((ep) => {
    const csRel = ep.competition_season;
    const cs = Array.isArray(csRel) ? csRel[0] : csRel;
    const compRel = cs?.competition;
    const competitionName =
      (Array.isArray(compRel) ? compRel[0]?.name : compRel?.name) ?? null;
    const seasonLabel = cs?.season_label ?? null;
    const competitionLabel =
      competitionName && seasonLabel ? `${competitionName} · ${seasonLabel}` : null;
    return {
      id: ep.id,
      format_id: ep.format_id,
      video_id: ep.video_id,
      title: ep.title,
      thumbnail_url: ep.thumbnail_url,
      published_at: ep.published_at,
      is_active: ep.is_active,
      min_badge: ep.min_badge,
      season: ep.season,
      competition_season_id: ep.competition_season_id,
      competition_label: competitionLabel,
    };
  });

  return NextResponse.json(enriched);
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
