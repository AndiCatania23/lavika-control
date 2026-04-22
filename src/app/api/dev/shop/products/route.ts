import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { syncProductToStripe, archiveProductOnStripe, isStripeConfigured } from '@/lib/stripeShopSync';

// Shop products CRUD. Mutations via service_role (Supabase RLS bypass).
// Autenticazione admin: demandata al middleware Control (dev_admins check).

export async function GET() {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const { data, error } = await supabaseServer
    .from('shop_products')
    .select(`
      *,
      images:shop_product_images(id, url, alt_text, is_primary, sort_order, variant_size),
      variants:shop_product_variants(id, sku, size, color, price_delta_eur, stock, low_stock_threshold, stripe_price_id)
    `)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[api/dev/shop/products] GET failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;

    const required = ['slug', 'name', 'product_type', 'category', 'price_eur'];
    for (const key of required) {
      if (body[key] === undefined || body[key] === null || body[key] === '') {
        return NextResponse.json({ error: `Campo mancante: ${key}` }, { status: 400 });
      }
    }

    const insertPayload = {
      slug: body.slug as string,
      name: body.name as string,
      subtitle: (body.subtitle as string) ?? null,
      description: (body.description as string) ?? null,
      product_type: body.product_type as string,
      category: body.category as string,
      tier: (body.tier as string) ?? 'standard',
      sector: (body.sector as string) ?? null,
      price_eur: Number(body.price_eur),
      price_original_eur: body.price_original_eur ? Number(body.price_original_eur) : null,
      badge: (body.badge as string) ?? null,
      limited_edition_max: body.limited_edition_max ? Number(body.limited_edition_max) : null,
      limited_edition_number: body.limited_edition_number ? Number(body.limited_edition_number) : null,
      signed_by: (body.signed_by as string) ?? null,
      signed_on: (body.signed_on as string) ?? null,
      status: (body.status as string) ?? 'draft',
      sort_order: body.sort_order ? Number(body.sort_order) : 0,
    };

    const { data, error } = await supabaseServer
      .from('shop_products')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error('[api/dev/shop/products] POST failed:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Stripe sync: non blocca creazione prodotto se Stripe fallisce.
    // Il record DB esiste comunque; sync manuale piu' tardi via re-save.
    if (isStripeConfigured() && data) {
      try {
        const stripeRes = await syncProductToStripe({
          id: data.id as string,
          slug: data.slug as string,
          name: data.name as string,
          description: data.description as string | null,
          price_eur: data.price_eur as number,
          imageUrls: [],
          stripe_product_id: null,
        });
        if (stripeRes) {
          await supabaseServer
            .from('shop_products')
            .update({ stripe_product_id: stripeRes.stripe_product_id })
            .eq('id', data.id as string);
          data.stripe_product_id = stripeRes.stripe_product_id;
        }
      } catch (stripeErr) {
        console.warn('[api/dev/shop/products] Stripe sync failed (non-blocking):', stripeErr);
      }
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
    if (!body.id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    // Escludi campi immutabili / computed
    const { id, created_at: _created, updated_at: _updated, images: _images, variants: _variants, ...updates } = body;
    void _created; void _updated; void _images; void _variants;

    // Se status cambia a 'active' e published_at null, settalo ora
    if (updates.status === 'active' && !updates.published_at) {
      updates.published_at = new Date().toISOString();
    }

    const { data, error } = await supabaseServer
      .from('shop_products')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[api/dev/shop/products] PATCH failed:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Stripe sync on update: aggiorna Product + gestisce price changes (archive+create)
    if (isStripeConfigured() && data) {
      try {
        // Recupera immagini primary per attachment Stripe
        const { data: imgs } = await supabaseServer
          .from('shop_product_images')
          .select('url, is_primary, sort_order')
          .eq('product_id', id as string)
          .order('is_primary', { ascending: false })
          .order('sort_order', { ascending: true })
          .limit(8);

        const imageUrls = (imgs ?? []).map((i) => i.url as string);

        // Se archived, archive anche su Stripe
        if (data.status === 'archived' && data.stripe_product_id) {
          await archiveProductOnStripe(data.stripe_product_id as string);
        } else {
          const stripeRes = await syncProductToStripe({
            id: data.id as string,
            slug: data.slug as string,
            name: data.name as string,
            description: data.description as string | null,
            price_eur: data.price_eur as number,
            imageUrls,
            stripe_product_id: (data.stripe_product_id as string | null) ?? null,
          });
          if (stripeRes && stripeRes.stripe_product_id !== data.stripe_product_id) {
            await supabaseServer
              .from('shop_products')
              .update({ stripe_product_id: stripeRes.stripe_product_id })
              .eq('id', data.id as string);
            data.stripe_product_id = stripeRes.stripe_product_id;
          }
        }
      } catch (stripeErr) {
        console.warn('[api/dev/shop/products] Stripe sync failed (non-blocking):', stripeErr);
      }
    }

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
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  // Prima di eliminare da DB, archivia Stripe product (se sync attivo)
  if (isStripeConfigured()) {
    try {
      const { data: existing } = await supabaseServer
        .from('shop_products')
        .select('stripe_product_id')
        .eq('id', id)
        .single();
      if (existing?.stripe_product_id) {
        await archiveProductOnStripe(existing.stripe_product_id as string);
      }
    } catch (stripeErr) {
      console.warn('[api/dev/shop/products] Stripe archive failed (non-blocking):', stripeErr);
    }
  }

  // CASCADE delete su images e variants grazie a FK ON DELETE CASCADE
  const { error } = await supabaseServer.from('shop_products').delete().eq('id', id);
  if (error) {
    console.error('[api/dev/shop/products] DELETE failed:', error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
