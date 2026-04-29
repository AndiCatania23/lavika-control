import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { publishFbPhotoPost, publishIgPhotoPost } from '@/lib/meta/publisher';
import { MetaApiError } from '@/lib/meta/client';

/**
 * POST /api/social/variants/[id]/publish
 *
 * Pubblica IMMEDIATAMENTE una variant sul suo platform target.
 * Solo per asset image al momento (Reel video arriverà col Remotion).
 *
 * Flow:
 *  1. Read variant
 *  2. Validate: asset_url presente, status='asset_ready' OR 'scheduled' OR 'failed' (retry)
 *  3. Update status='publishing'
 *  4. Call appropriate Meta publisher
 *  5. Update status='published' + external_post_id + external_post_url + published_at
 *  6. On error: status='failed' + error message
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseServer) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  const { id } = await params;

  const { data: variant, error: vErr } = await supabaseServer
    .from('social_variants')
    .select('*')
    .eq('id', id)
    .single();

  if (vErr || !variant) return NextResponse.json({ error: `Variant non trovata: ${id}` }, { status: 404 });
  if (!variant.asset_url) return NextResponse.json({ error: 'asset_url mancante — asset non ancora generato' }, { status: 400 });

  const allowedStatus = ['asset_ready', 'scheduled', 'failed'];
  if (!allowedStatus.includes(variant.status)) {
    return NextResponse.json({ error: `Status corrente '${variant.status}' non permette la pubblicazione` }, { status: 400 });
  }

  // Mark publishing
  await supabaseServer.from('social_variants').update({
    status: 'publishing',
    error: null,
    updated_at: new Date().toISOString(),
  }).eq('id', id);

  try {
    let result: { id: string; permalink?: string; external_post_url?: string };

    if (variant.platform === 'facebook') {
      const r = await publishFbPhotoPost({ imageUrl: variant.asset_url, caption: variant.caption ?? '' });
      result = { id: r.post_id ?? r.id, permalink: r.permalink_url };
    } else if (variant.platform === 'instagram') {
      const r = await publishIgPhotoPost({ imageUrl: variant.asset_url, caption: variant.caption ?? '' });
      result = { id: r.id, permalink: r.permalink };
    } else {
      throw new Error(`Platform '${variant.platform}' non supportata in questa versione`);
    }

    const { data: updated } = await supabaseServer
      .from('social_variants')
      .update({
        status: 'published',
        external_post_id: result.id,
        external_post_url: result.permalink ?? null,
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    return NextResponse.json({ ok: true, variant: updated });
  } catch (err) {
    const errMsg = err instanceof MetaApiError ? err.message
      : err instanceof Error ? err.message : 'Errore sconosciuto';
    await supabaseServer.from('social_variants').update({
      status: 'failed',
      error: errMsg,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    return NextResponse.json({ ok: false, error: errMsg }, { status: 502 });
  }
}
