import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

// Gestione varianti prodotto (taglia x colore + stock).

export async function POST(request: Request) {
  if (!supabaseServer) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  try {
    const body = (await request.json()) as {
      product_id?: string;
      sku?: string;
      size?: string;
      color?: string;
      price_delta_eur?: number;
      stock?: number;
      low_stock_threshold?: number;
    };

    if (!body.product_id) return NextResponse.json({ error: 'Missing product_id' }, { status: 400 });

    const { data, error } = await supabaseServer
      .from('shop_product_variants')
      .insert({
        product_id: body.product_id,
        sku: body.sku ?? null,
        size: body.size ?? null,
        color: body.color ?? null,
        price_delta_eur: body.price_delta_eur ?? 0,
        stock: body.stock ?? 0,
        low_stock_threshold: body.low_stock_threshold ?? 3,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bad request';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  if (!supabaseServer) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  try {
    const body = (await request.json()) as { id?: string } & Record<string, unknown>;
    if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const { id, ...updates } = body;

    const { data, error } = await supabaseServer
      .from('shop_product_variants')
      .update(updates)
      .eq('id', id as string)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bad request';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!supabaseServer) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { error } = await supabaseServer.from('shop_product_variants').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
