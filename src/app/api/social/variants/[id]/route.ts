import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { deleteAssetFromUrl } from '@/lib/social/r2Cleanup';

const EDITABLE_FIELDS = new Set(['caption', 'hashtags', 'scheduled_at', 'status']);

/**
 * PATCH /api/social/variants/[id]
 * Body: subset of editable fields (caption, hashtags, scheduled_at, status)
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseServer) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(body)) {
    if (EDITABLE_FIELDS.has(k)) updates[k] = v;
  }

  const { data, error } = await supabaseServer
    .from('social_variants')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ variant: data });
}

/**
 * DELETE /api/social/variants/[id]
 *
 * - Cancella asset R2 collegato (se presente)
 * - Cancella variant DB (cascade su social_asset_jobs)
 * - Se era l'ultima variant del draft → cancella anche il draft
 *   (evita draft orfani senza varianti)
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseServer) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const { id } = await params;

  // Read variant to get asset_url + draft_id
  const { data: variant } = await supabaseServer
    .from('social_variants')
    .select('id, draft_id, asset_url')
    .eq('id', id)
    .maybeSingle<{ id: string; draft_id: string; asset_url: string | null }>();

  if (!variant) {
    return NextResponse.json({ ok: true, note: 'già eliminata' });
  }

  // 1. Delete R2 asset (best-effort, non bloccante)
  let r2Result = null;
  if (variant.asset_url) {
    r2Result = await deleteAssetFromUrl(variant.asset_url);
  }

  // 2. Delete variant from DB (cascade su social_asset_jobs)
  const { error: delErr } = await supabaseServer
    .from('social_variants')
    .delete()
    .eq('id', id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  // 3. Check se era l'ultima variant del draft → auto-delete draft
  const { count } = await supabaseServer
    .from('social_variants')
    .select('id', { count: 'exact', head: true })
    .eq('draft_id', variant.draft_id);

  let draftDeleted = false;
  if ((count ?? 0) === 0) {
    const { error: dErr } = await supabaseServer
      .from('social_drafts')
      .delete()
      .eq('id', variant.draft_id);
    draftDeleted = !dErr;
  }

  return NextResponse.json({
    ok: true,
    r2: r2Result,
    draftDeleted,
    remainingVariants: count ?? 0,
  });
}
