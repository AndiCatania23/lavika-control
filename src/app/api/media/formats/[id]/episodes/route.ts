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

  const { data, error } = await supabaseServer
    .from('content_episodes')
    .select('id, format_id, video_id, title, thumbnail_url, published_at, is_active, min_badge')
    .eq('format_id', formatId)
    .order('published_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
