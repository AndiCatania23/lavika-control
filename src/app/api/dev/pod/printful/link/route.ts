import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { getPrintfulSyncProduct, isPrintfulConfigured } from '@/lib/pod/printful';

// Collega un prodotto LAVIKA a un Sync Product Printful.
// Flow:
//   1. Client passa shopProductId + printfulSyncProductId
//   2. Server fetcha sync_variants da Printful
//   3. Server fetcha shop_product_variants dal DB
//   4. Match per size (case-insensitive) e popola pod_provider='printful'
//      + pod_variant_id + stock_managed=false
//   5. Aggiorna shop_products.pod_provider + pod_product_id

type LinkRequest = {
  shop_product_id?: string;
  printful_sync_product_id?: number;
};

type LinkResult = {
  matched: Array<{ shop_variant_id: string; size: string; printful_sync_variant_id: number }>;
  unmatched_shop_variants: Array<{ id: string; size: string | null; color: string | null }>;
  unmatched_printful_variants: Array<{ id: number; size: string | null; color: string | null }>;
};

function normalizeSize(s: string | null | undefined): string {
  return (s ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

export async function POST(request: Request) {
  if (!supabaseServer) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  if (!isPrintfulConfigured()) return NextResponse.json({ error: 'Printful not configured' }, { status: 503 });

  try {
    const body = (await request.json()) as LinkRequest;
    if (!body.shop_product_id || !body.printful_sync_product_id) {
      return NextResponse.json({ error: 'shop_product_id + printful_sync_product_id obbligatori' }, { status: 400 });
    }

    // Fetch Printful details
    const pfDetail = await getPrintfulSyncProduct(body.printful_sync_product_id);

    // Fetch LAVIKA variants
    const { data: shopVariants, error: variantsErr } = await supabaseServer
      .from('shop_product_variants')
      .select('id, size, color')
      .eq('product_id', body.shop_product_id);

    if (variantsErr) return NextResponse.json({ error: variantsErr.message }, { status: 500 });
    if (!shopVariants || shopVariants.length === 0) {
      return NextResponse.json({ error: 'Il prodotto LAVIKA non ha varianti. Creale prima di collegare Printful.' }, { status: 400 });
    }

    // Match per size (tolleriamo case/space)
    const matched: LinkResult['matched'] = [];
    const matchedShopIds = new Set<string>();
    const matchedPfIds = new Set<number>();

    for (const sv of shopVariants as Array<{ id: string; size: string | null; color: string | null }>) {
      const sizeKey = normalizeSize(sv.size);
      if (!sizeKey) continue;

      const pfVariant = pfDetail.sync_variants.find((pv) => normalizeSize(pv.size) === sizeKey && !matchedPfIds.has(pv.id));
      if (!pfVariant) continue;

      matched.push({
        shop_variant_id: sv.id,
        size: sv.size ?? '',
        printful_sync_variant_id: pfVariant.id,
      });
      matchedShopIds.add(sv.id);
      matchedPfIds.add(pfVariant.id);
    }

    // Apply updates
    for (const m of matched) {
      const { error: updateErr } = await supabaseServer
        .from('shop_product_variants')
        .update({
          pod_provider: 'printful',
          pod_variant_id: String(m.printful_sync_variant_id),
          stock_managed: false,
        })
        .eq('id', m.shop_variant_id);

      if (updateErr) {
        console.error('[pod/printful/link] variant update failed:', updateErr.message);
      }
    }

    // Update shop_products
    await supabaseServer
      .from('shop_products')
      .update({
        pod_provider: 'printful',
        pod_product_id: String(body.printful_sync_product_id),
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.shop_product_id);

    const result: LinkResult = {
      matched,
      unmatched_shop_variants: (shopVariants as Array<{ id: string; size: string | null; color: string | null }>)
        .filter((sv) => !matchedShopIds.has(sv.id))
        .map((sv) => ({ id: sv.id, size: sv.size, color: sv.color })),
      unmatched_printful_variants: pfDetail.sync_variants
        .filter((pv) => !matchedPfIds.has(pv.id))
        .map((pv) => ({ id: pv.id, size: pv.size, color: pv.color })),
    };

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Link failed';
    console.error('[api/dev/pod/printful/link] POST failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Rimuovi collegamento Printful da un prodotto
export async function DELETE(request: Request) {
  if (!supabaseServer) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const url = new URL(request.url);
  const shopProductId = url.searchParams.get('shop_product_id');
  if (!shopProductId) return NextResponse.json({ error: 'shop_product_id obbligatorio' }, { status: 400 });

  const { error: variantsErr } = await supabaseServer
    .from('shop_product_variants')
    .update({ pod_provider: null, pod_variant_id: null, stock_managed: true })
    .eq('product_id', shopProductId)
    .eq('pod_provider', 'printful');
  if (variantsErr) return NextResponse.json({ error: variantsErr.message }, { status: 500 });

  const { error: productErr } = await supabaseServer
    .from('shop_products')
    .update({ pod_provider: null, pod_product_id: null, updated_at: new Date().toISOString() })
    .eq('id', shopProductId);
  if (productErr) return NextResponse.json({ error: productErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
