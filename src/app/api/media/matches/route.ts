import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

/**
 * GET /api/media/matches
 * Query params:
 *   q       — search by home/away team name (ilike on normalized_name)
 *   season  — filter by season string (matches.season)
 *   limit   — max rows (default 100, max 400)
 *
 * Returns the full season list ordered by kickoff_at desc, with team metadata
 * needed to render a "Catania – Crotone · 12/04 17:30" picker label.
 */
export async function GET(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const url   = new URL(request.url);
  const q     = url.searchParams.get('q')?.trim();
  const limit = Math.min(400, Math.max(1, parseInt(url.searchParams.get('limit') ?? '100', 10) || 100));

  const { data, error } = await supabaseServer
    .from('matches')
    .select(
      `id, matchday, kickoff_at, status, home_score, away_score,
       home_team:teams!matches_home_team_id_fkey(normalized_name, short_name, logo_url),
       away_team:teams!matches_away_team_id_fkey(normalized_name, short_name, logo_url)`
    )
    .order('kickoff_at', { ascending: false })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = {
    id: string; matchday: number | null; kickoff_at: string | null;
    status: string | null; home_score: number | null; away_score: number | null;
    home_team: { normalized_name: string; short_name: string | null; logo_url: string | null } | null;
    away_team: { normalized_name: string; short_name: string | null; logo_url: string | null } | null;
  };

  const rows = (data ?? []) as Row[];
  const filtered = q
    ? rows.filter(r => {
        const h = r.home_team?.normalized_name?.toLowerCase() ?? '';
        const a = r.away_team?.normalized_name?.toLowerCase() ?? '';
        return h.includes(q.toLowerCase()) || a.includes(q.toLowerCase());
      })
    : rows;

  return NextResponse.json({ items: filtered });
}
