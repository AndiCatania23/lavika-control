import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

/**
 * GET /api/media/formats/[id]/episodes
 * Returns all episodes for a given format, ordered by id.
 * Episodes are matched by id prefix: "{formatId}-*"
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const { id: formatId } = await params;

  const { data, error } = await supabaseServer
    .from('content_episodes')
    .select('*')
    .ilike('id', `${formatId}-%`)
    .order('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
