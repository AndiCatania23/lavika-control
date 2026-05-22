import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

/**
 * GET /api/media/competition-seasons
 *
 * Returns the list of competition_seasons (rows from `competition_seasons`
 * joined with their competition name) so the Episodes drawer can offer a
 * dropdown for re-assigning `content_episodes.competition_season_id` per
 * episode. Mobile-friendly: small payload, no params.
 *
 * Response shape:
 *   { items: Array<{ id: string; label: string; competition_name: string;
 *                    season_label: string | null }> }
 */
export async function GET() {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const { data, error } = await supabaseServer
    .from('competition_seasons')
    .select(`
      id,
      season_label,
      start_date,
      competition:competitions!competition_id(name)
    `)
    .order('start_date', { ascending: false, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type Row = {
    id: string;
    season_label: string | null;
    start_date: string | null;
    competition: { name: string | null } | { name: string | null }[] | null;
  };

  const items = (data as Row[] | null ?? []).map((row) => {
    const compRel = row.competition;
    const competitionName =
      (Array.isArray(compRel) ? compRel[0]?.name : compRel?.name) ?? 'Competizione';
    const seasonLabel = row.season_label ?? '';
    const label = seasonLabel ? `${competitionName} · ${seasonLabel}` : competitionName;
    return {
      id: row.id,
      label,
      competition_name: competitionName,
      season_label: row.season_label,
    };
  });

  return NextResponse.json({ items });
}
