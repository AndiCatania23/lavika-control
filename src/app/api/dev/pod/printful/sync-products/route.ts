import { NextResponse } from 'next/server';
import { isPrintfulConfigured, listPrintfulSyncProducts, getPrintfulSyncProduct } from '@/lib/pod/printful';

// Proxy endpoint Control → Printful. Teniamo il token Printful solo server-side.
// - GET                         → lista sync products
// - GET ?id=<syncProductId>     → dettaglio singolo con varianti

export async function GET(request: Request) {
  if (!isPrintfulConfigured()) {
    return NextResponse.json({ error: 'Printful non configurato (PRINTFUL_API_TOKEN / PRINTFUL_STORE_ID mancanti)' }, { status: 503 });
  }

  const url = new URL(request.url);
  const idParam = url.searchParams.get('id');

  try {
    if (idParam) {
      const detail = await getPrintfulSyncProduct(Number(idParam));
      return NextResponse.json(detail);
    }

    const products = await listPrintfulSyncProducts();
    return NextResponse.json(products);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Printful fetch failed';
    console.error('[api/dev/pod/printful] GET failed:', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
