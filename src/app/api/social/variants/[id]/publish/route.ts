import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import {
  publishFbPhotoPost, publishIgPhotoPost,
  publishIgStoryPhoto, publishIgStoryVideo,
  publishFbStoryPhoto, publishFbStoryVideo,
} from '@/lib/meta/publisher';
import { MetaApiError } from '@/lib/meta/client';
import { rewriteToPublicBase, MEDIA_PUBLIC_BASE_URL } from '@/lib/r2MediaClient';

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
/**
 * Build a publicly fetchable asset URL that Meta will accept.
 *
 * Strategia:
 *  A) Se MEDIA_PUBLIC_BASE_URL è settato a custom domain (es.
 *     media.lavikasport.app), riscrivo asset_url legacy `pub-*.r2.dev`
 *     → custom domain. Direct pass, niente hop Vercel. PREFERITO.
 *  B) Fallback al proxy Vercel `/api/social/asset-proxy/[variantId]`
 *     se per qualche motivo non riusciamo a riscrivere (custom domain
 *     non configurato).
 *
 * Cloudflare R2 `pub-*.r2.dev` raw è blacklistato da Instagram
 * (error 9004), quindi MAI passare quel dominio direttamente a Meta.
 */
function getPublicAssetUrl(req: Request, variantId: string, assetUrl: string): string {
  const isCustomDomain = !MEDIA_PUBLIC_BASE_URL.includes('pub-') || !MEDIA_PUBLIC_BASE_URL.includes('.r2.dev');
  if (isCustomDomain) {
    const rewritten = rewriteToPublicBase(assetUrl);
    if (rewritten && !rewritten.includes('pub-') && !rewritten.includes('.r2.dev')) {
      return rewritten;
    }
  }
  // Fallback: Vercel proxy
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    ?? `https://${new URL(req.url).host}`;
  return `${baseUrl}/api/social/asset-proxy/${variantId}`;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

    // Costruisci URL trusted per Meta: custom domain R2 (preferito) o proxy Vercel (fallback)
    const publicAssetUrl = getPublicAssetUrl(req, id, variant.asset_url);

    /* Routing platform × format. Format è quello selezionato nel Composer:
         feed_post  → Feed (foto)
         story      → Story 24h (foto)
         story_video → Story 24h (video)
         reel       → Reel feed permanente (video) — TBD
         carousel   → Album foto — TBD
       Riferimento: src/app/(console)/social/composer/page.tsx PLATFORMS array.
       Per il fix del bug "ogni cosa va al Feed" (2026-04-30) il routing
       per 'story' va a publishIgStoryPhoto / publishFbStoryPhoto (NON a
       publishXxxPhotoPost che è solo Feed). */
    const fmt = variant.format;
    const caption = variant.caption ?? '';

    if (variant.platform === 'instagram') {
      if (fmt === 'story_video') {
        const r = await publishIgStoryVideo({ videoUrl: publicAssetUrl, caption });
        result = { id: r.id, permalink: r.permalink };
      } else if (fmt === 'story') {
        const r = await publishIgStoryPhoto({ imageUrl: publicAssetUrl, caption });
        result = { id: r.id, permalink: r.permalink };
      } else if (fmt === 'feed_post') {
        const r = await publishIgPhotoPost({ imageUrl: publicAssetUrl, caption });
        result = { id: r.id, permalink: r.permalink };
      } else {
        throw new Error(`Format '${fmt}' su Instagram non ancora supportato (TODO: reel, carousel)`);
      }
    } else if (variant.platform === 'facebook') {
      if (fmt === 'story_video') {
        const r = await publishFbStoryVideo({ videoUrl: publicAssetUrl, caption });
        result = { id: r.post_id ?? r.id, permalink: r.permalink_url };
      } else if (fmt === 'story') {
        const r = await publishFbStoryPhoto({ imageUrl: publicAssetUrl, caption });
        result = { id: r.post_id ?? r.id, permalink: r.permalink_url };
      } else if (fmt === 'feed_post') {
        const r = await publishFbPhotoPost({ imageUrl: publicAssetUrl, caption });
        result = { id: r.post_id ?? r.id, permalink: r.permalink_url };
      } else {
        throw new Error(`Format '${fmt}' su Facebook non ancora supportato (TODO: reel)`);
      }
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
