import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

// Audit log events per un ordine. Ordinato cronologicamente discendente.

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: 'Missing order id' }, { status: 400 });

  const { data, error } = await supabaseServer
    .from('shop_order_events')
    .select('id, event_type, from_status, to_status, actor_id, actor_email, data, created_at')
    .eq('order_id', id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[api/dev/shop/orders/events] GET failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
