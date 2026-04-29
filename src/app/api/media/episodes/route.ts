import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

const VALID_BADGES = new Set(['bronze', 'silver', 'gold']);
const PATCHABLE_FIELDS = new Set([
  'title', 'description', 'match_id', 'is_active',
  'min_badge', 'published_at', 'speaker_id', 'thumbnail_url',
]);

/**
 * GET /api/media/episodes
 * Query params:
 *   format_id  — filter by format
 *   season     — filter by season
 *   q          — title search (ilike)
 *   active     — 'true' | 'false' (filter is_active)
 *   page       — 1-based page number (default 1)
 *   pageSize   — items per page (default 50, max 200)
 *
 * Returns: { items, total, page, pageSize }
 *
 * Legacy behavior (no params): returns { items: [...] } of episodes with non-null thumbnail.
 * (Maintained for any external caller; new code should pass query params.)
 */
export async function GET(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const url = new URL(request.url);
  const formatId  = url.searchParams.get('format_id');
  const season    = url.searchParams.get('season');
  const q         = url.searchParams.get('q')?.trim();
  const activeRaw = url.searchParams.get('active');
  const page      = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const pageSize  = Math.min(200, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '50', 10) || 50));
  const hasParams = formatId || season || q || activeRaw || url.searchParams.has('page') || url.searchParams.has('pageSize');

  if (!hasParams) {
    // Legacy: return all episodes with editorial thumbnail
    const { data, error } = await supabaseServer
      .from('content_episodes')
      .select('id, thumbnail_url')
      .not('thumbnail_url', 'is', null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  }

  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;

  let query = supabaseServer
    .from('content_episodes')
    .select(
      `id, video_id, format_id, title, description, season, published_at,
       hls_url, thumbnail_url, min_badge, duration_secs, match_id, speaker_id,
       is_active, created_at, updated_at,
       speaker:players!speaker_id(id, full_name, slug),
       match:matches!match_id(id, kickoff_at, matchday,
         home_team:teams!matches_home_team_id_fkey(normalized_name, short_name),
         away_team:teams!matches_away_team_id_fkey(normalized_name, short_name))`,
      { count: 'exact' }
    )
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at',   { ascending: false })
    .range(from, to);

  if (formatId) query = query.eq('format_id', formatId);
  if (season)   query = query.eq('season', season);
  if (q)        query = query.ilike('title', `%${q}%`);
  if (activeRaw === 'true')  query = query.eq('is_active', true);
  if (activeRaw === 'false') query = query.eq('is_active', false);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    items: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
  });
}

/**
 * PATCH /api/media/episodes
 *
 * Two shapes supported:
 *
 * Legacy (bulk thumbnail):
 *   { ids: string[], thumbnail_url: string | null }
 *
 * New (single-row, multi-field):
 *   { id: string, patch: { title?, description?, match_id?, is_active?,
 *                          min_badge?, published_at?, speaker_id?, thumbnail_url? } }
 */
export async function PATCH(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const body = await request.json().catch(() => null) as
    | { ids?: string[]; thumbnail_url?: string | null; id?: string; patch?: Record<string, unknown> }
    | null;

  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  // ── New shape ────────────────────────────────────────────────────
  if (typeof body.id === 'string' && body.patch && typeof body.patch === 'object') {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [key, value] of Object.entries(body.patch)) {
      if (!PATCHABLE_FIELDS.has(key)) continue;
      if (key === 'min_badge' && value !== null && typeof value === 'string' && !VALID_BADGES.has(value)) {
        return NextResponse.json({ error: `min_badge must be one of: ${[...VALID_BADGES].join(', ')}` }, { status: 400 });
      }
      if (key === 'is_active' && typeof value !== 'boolean') {
        return NextResponse.json({ error: 'is_active must be a boolean' }, { status: 400 });
      }
      updates[key] = value;
    }

    const { data, error } = await supabaseServer
      .from('content_episodes')
      .update(updates)
      .eq('id', body.id)
      .select(
        `id, title, description, is_active, min_badge, published_at,
         match_id, speaker_id, thumbnail_url, format_id, season, video_id,
         speaker:players!speaker_id(id, full_name, slug),
         match:matches!match_id(id, kickoff_at, matchday,
           home_team:teams!matches_home_team_id_fkey(normalized_name, short_name),
           away_team:teams!matches_away_team_id_fkey(normalized_name, short_name))`
      )
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ episode: data });
  }

  // ── Legacy shape ────────────────────────────────────────────────
  const { ids, thumbnail_url } = body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'Provide either { id, patch } or { ids, thumbnail_url }' }, { status: 400 });
  }

  const { count, error } = await supabaseServer
    .from('content_episodes')
    .update({
      thumbnail_url: thumbnail_url ?? null,
      updated_at: new Date().toISOString(),
    })
    .in('id', ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updated: count });
}
