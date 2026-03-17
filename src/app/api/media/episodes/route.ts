import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

/** GET — returns all episodes that have a non-null editorial thumbnail */
export async function GET() {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }
  const { data, error } = await supabaseServer
    .from('content_episodes')
    .select('id, thumbnail_url')
    .not('thumbnail_url', 'is', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/** PATCH — update thumbnail_url for one or many episodes (by id list) */
export async function PATCH(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const body = await request.json() as { ids?: string[]; thumbnail_url?: string | null };
  const { ids, thumbnail_url } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 });
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
