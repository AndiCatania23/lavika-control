import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

/**
 * GET /api/social/asset-proxy/[variantId]
 *
 * Restream l'asset di una variant attraverso il dominio Vercel.
 * Necessario perché Instagram (Meta Graph API) NON accetta image_url
 * da `pub-*.r2.dev` di Cloudflare R2 (untrusted domain → errore 9004).
 * Il dominio `lavikacontrol.vercel.app` è trusted, quindi serve come
 * proxy.
 *
 * Long-term: configurare custom domain Cloudflare R2 (es.
 * `media.lavikasport.app`) e bypassare questo proxy.
 *
 * Cache: 24h (asset sono immutable, hash nell'URL via variantId).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';  // no static optimization

export async function GET(_req: Request, { params }: { params: Promise<{ variantId: string }> }) {
  if (!supabaseServer) {
    return new Response('Supabase not configured', { status: 503 });
  }
  const { variantId } = await params;

  const { data: variant, error } = await supabaseServer
    .from('social_variants')
    .select('asset_url, asset_meta')
    .eq('id', variantId)
    .single<{ asset_url: string | null; asset_meta: { mime?: string } | null }>();

  if (error || !variant) {
    return new Response('Variant not found', { status: 404 });
  }
  if (!variant.asset_url) {
    return new Response('Asset not yet generated', { status: 409 });
  }

  // Fetch asset from R2
  const upstream = await fetch(variant.asset_url);
  if (!upstream.ok || !upstream.body) {
    return new Response(`Upstream failed: ${upstream.status}`, { status: 502 });
  }

  const mime = variant.asset_meta?.mime ?? upstream.headers.get('content-type') ?? 'application/octet-stream';

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=86400, immutable',  // 24h cache
      'Content-Length': upstream.headers.get('content-length') ?? '',
    },
  });
}
