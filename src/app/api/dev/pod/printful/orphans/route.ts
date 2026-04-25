import { NextResponse } from 'next/server';
import { isPrintfulConfigured, listPrintfulSyncProducts } from '@/lib/pod/printful';
import { supabaseServer } from '@/lib/supabaseServer';

// Restituisce shop_products linkati a Printful il cui pod_product_id non
// esiste piu' nella lista sync products di Printful (prodotto cancellato
// remotamente). Serve a popolare il banner dashboard "Le tue azioni".

export async function GET() {
  if (!supabaseServer) {
    return NextResponse.json({ count: 0, items: [] });
  }
  if (!isPrintfulConfigured()) {
    return NextResponse.json({ count: 0, items: [] });
  }

  try {
    const [pfList, shopRes] = await Promise.all([
      listPrintfulSyncProducts(),
      supabaseServer
        .from('shop_products')
        .select('id, name, slug, pod_product_id, status')
        .eq('pod_provider', 'printful')
        .neq('status', 'archived'),
    ]);

    if (shopRes.error) {
      throw new Error(shopRes.error.message);
    }

    const pfIds = new Set(pfList.map((p) => String(p.id)));
    const items = (shopRes.data ?? [])
      .filter((sp) => sp.pod_product_id && !pfIds.has(String(sp.pod_product_id)))
      .map((sp) => ({
        id: sp.id as string,
        name: sp.name as string,
        slug: sp.slug as string,
        status: sp.status as string,
        pod_product_id: sp.pod_product_id as string,
      }));

    return NextResponse.json({ count: items.length, items });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Printful orphans check failed';
    console.error('[api/dev/pod/printful/orphans] GET failed:', message);
    return NextResponse.json({ count: 0, items: [], error: message }, { status: 502 });
  }
}
