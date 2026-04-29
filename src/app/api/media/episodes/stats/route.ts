import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

/**
 * GET /api/media/episodes/stats
 * Returns: { total, active, inactive, byFormat: { [format_id]: { total, active } } }
 */
export async function GET() {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const { data, error } = await supabaseServer
    .from('content_episodes')
    .select('format_id, is_active');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Array<{ format_id: string; is_active: boolean }>;
  const byFormat: Record<string, { total: number; active: number }> = {};
  let active = 0;
  for (const r of rows) {
    if (!byFormat[r.format_id]) byFormat[r.format_id] = { total: 0, active: 0 };
    byFormat[r.format_id].total += 1;
    if (r.is_active) {
      byFormat[r.format_id].active += 1;
      active += 1;
    }
  }

  return NextResponse.json({
    total: rows.length,
    active,
    inactive: rows.length - active,
    byFormat,
  });
}
