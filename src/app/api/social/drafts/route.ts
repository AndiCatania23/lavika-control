import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

/**
 * GET /api/social/drafts
 * Query params:
 *   status   — filter by status (draft|review|approved|scheduled|published|failed|cancelled)
 *   limit    — default 50, max 200
 *   offset   — pagination
 *
 * Returns: { items, total }
 * Each item is a draft + count of variants by status (so the list UI
 * can show "3 ready · 1 publishing · 0 failed" badges).
 */
export async function GET(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const limit  = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit')  ?? '50', 10) || 50));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0',  10) || 0);

  let query = supabaseServer
    .from('social_drafts')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq('status', status);

  const { data: drafts, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fetch variants count per draft (for list badges)
  const draftIds = (drafts ?? []).map(d => d.id);
  let variantsByDraft = new Map<string, { total: number; ready: number; published: number; failed: number; pending: number }>();
  if (draftIds.length > 0) {
    const { data: variants } = await supabaseServer
      .from('social_variants')
      .select('draft_id, status, asset_url')
      .in('draft_id', draftIds);

    for (const v of variants ?? []) {
      if (!variantsByDraft.has(v.draft_id)) {
        variantsByDraft.set(v.draft_id, { total: 0, ready: 0, published: 0, failed: 0, pending: 0 });
      }
      const c = variantsByDraft.get(v.draft_id)!;
      c.total++;
      if (v.status === 'asset_ready' || v.status === 'scheduled') c.ready++;
      else if (v.status === 'published') c.published++;
      else if (v.status === 'failed') c.failed++;
      else c.pending++;
    }
  }

  // Fetch source thumbnails for visual list
  const pillIds = (drafts ?? []).filter(d => d.source_type === 'pill').map(d => d.source_id).filter(Boolean);
  const epIds   = (drafts ?? []).filter(d => d.source_type === 'episode').map(d => d.source_id).filter(Boolean);
  const sourceImages = new Map<string, string | null>();
  if (pillIds.length > 0) {
    const { data } = await supabaseServer.from('pills').select('id, image_url').in('id', pillIds);
    for (const p of data ?? []) sourceImages.set(p.id, p.image_url);
  }
  if (epIds.length > 0) {
    const { data } = await supabaseServer.from('content_episodes').select('id, thumbnail_url').in('id', epIds);
    for (const e of data ?? []) sourceImages.set(e.id, e.thumbnail_url);
  }

  return NextResponse.json({
    items: (drafts ?? []).map(d => ({
      ...d,
      variantsSummary: variantsByDraft.get(d.id) ?? { total: 0, ready: 0, published: 0, failed: 0, pending: 0 },
      sourceImage: d.source_id ? sourceImages.get(d.source_id) ?? null : null,
    })),
    total: count ?? 0,
  });
}
