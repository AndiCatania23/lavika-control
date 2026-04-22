import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

// Gestione gallery immagini prodotto.
// Upload fisico su R2 e' fatto da /api/media/upload (type=shop-product-image).
// Qui registriamo/aggiorniamo/ordiniamo le righe in shop_product_images.

export async function POST(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    const body = (await request.json()) as {
      product_id?: string;
      url?: string;
      alt_text?: string;
      is_primary?: boolean;
      sort_order?: number;
      variant_size?: string;
    };

    if (!body.product_id || !body.url) {
      return NextResponse.json({ error: 'Missing product_id or url' }, { status: 400 });
    }

    // Se stai settando una nuova primary, rimuovi il flag dalle altre
    if (body.is_primary) {
      await supabaseServer
        .from('shop_product_images')
        .update({ is_primary: false })
        .eq('product_id', body.product_id)
        .eq('is_primary', true);
    }

    const { data, error } = await supabaseServer
      .from('shop_product_images')
      .insert({
        product_id: body.product_id,
        url: body.url,
        alt_text: body.alt_text ?? null,
        is_primary: body.is_primary ?? false,
        sort_order: body.sort_order ?? 0,
        variant_size: body.variant_size ?? null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bad request';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    const body = (await request.json()) as { id?: string } & Record<string, unknown>;
    if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const { id, ...updates } = body;

    // Se stai settando primary, rimuovi dalle altre dello stesso prodotto
    if (updates.is_primary) {
      const { data: existing } = await supabaseServer
        .from('shop_product_images')
        .select('product_id')
        .eq('id', id as string)
        .single();
      if (existing) {
        await supabaseServer
          .from('shop_product_images')
          .update({ is_primary: false })
          .eq('product_id', existing.product_id)
          .neq('id', id as string);
      }
    }

    const { data, error } = await supabaseServer
      .from('shop_product_images')
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
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { error } = await supabaseServer.from('shop_product_images').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
