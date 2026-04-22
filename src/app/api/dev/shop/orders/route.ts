import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

// Shop orders admin view. Ordini sono creati dal webhook Stripe (app lavikasport.app)
// che scrive direttamente in shop_orders. Qui leggiamo + aggiorniamo status/tracking.

export async function GET(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get('status');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500);

  let query = supabaseServer
    .from('shop_orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[api/dev/shop/orders] GET failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function PATCH(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    const body = (await request.json()) as {
      id?: string;
      status?: string;
      tracking_number?: string;
      tracking_url?: string;
      shipping_carrier?: string;
      staff_notes?: string;
      fulfilled_by?: string;
    };

    if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const { id, ...updates } = body;
    const updatePayload: Record<string, unknown> = { ...updates };

    // Auto-timestamp in base allo status transition
    const now = new Date().toISOString();
    if (updates.status === 'shipped' && !('shipped_at' in updates)) {
      updatePayload.shipped_at = now;
    }
    if (updates.status === 'delivered' && !('delivered_at' in updates)) {
      updatePayload.delivered_at = now;
    }

    const { data, error } = await supabaseServer
      .from('shop_orders')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[api/dev/shop/orders] PATCH failed:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bad request';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
