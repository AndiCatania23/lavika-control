import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

// Shop orders admin view. Ordini sono creati dal webhook Stripe (app lavikasport.app)
// che scrive direttamente in shop_orders. Qui leggiamo + aggiorniamo status/tracking
// e scriviamo shop_order_events (audit log).

type OrderRow = {
  id: string;
  status: string;
  fulfilled_by: string | null;
  shipping_carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  staff_notes: string | null;
};

type EventInsert = {
  order_id: string;
  actor_id: string | null;
  actor_email: string | null;
  event_type: 'status_changed' | 'tracking_updated' | 'note_updated' | 'fulfilled_by_set';
  from_status: string | null;
  to_status: string | null;
  data: Record<string, unknown>;
};

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
      actor_id?: string;
      actor_email?: string;
    };

    if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const actorId = body.actor_id?.trim() || null;
    const actorEmail = body.actor_email?.trim() || null;

    // Pre-update snapshot per calcolare il diff e scrivere audit log.
    const { data: before, error: beforeError } = await supabaseServer
      .from('shop_orders')
      .select('id, status, fulfilled_by, shipping_carrier, tracking_number, tracking_url, staff_notes')
      .eq('id', body.id)
      .maybeSingle();

    if (beforeError) {
      console.error('[api/dev/shop/orders] pre-read failed:', beforeError);
      return NextResponse.json({ error: beforeError.message }, { status: 500 });
    }
    if (!before) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const beforeRow = before as OrderRow;

    // Costruisci payload update. Escludi i campi audit-only dal body.
    const { id: _id, actor_id: _actorId, actor_email: _actorEmail, ...updates } = body;
    void _id; void _actorId; void _actorEmail;

    const updatePayload: Record<string, unknown> = { ...updates };
    const now = new Date().toISOString();

    // Auto-timestamp su status transition
    if (updates.status === 'shipped' && !('shipped_at' in updates)) {
      updatePayload.shipped_at = now;
    }
    if (updates.status === 'delivered' && !('delivered_at' in updates)) {
      updatePayload.delivered_at = now;
    }

    // Auto-popola fulfilled_by alla prima transizione verso fulfilling/shipped/delivered
    // se non e' gia' settato e abbiamo l'actor.
    const shouldSetFulfilledBy =
      !beforeRow.fulfilled_by
      && actorId
      && updates.status
      && ['fulfilling', 'shipped', 'delivered'].includes(updates.status);

    if (shouldSetFulfilledBy) {
      updatePayload.fulfilled_by = actorId;
    }

    const { data, error } = await supabaseServer
      .from('shop_orders')
      .update(updatePayload)
      .eq('id', body.id)
      .select()
      .single();

    if (error) {
      console.error('[api/dev/shop/orders] PATCH failed:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Audit events (fire-and-forget: log errore ma non blocca la response).
    const events: EventInsert[] = [];

    if (updates.status && updates.status !== beforeRow.status) {
      events.push({
        order_id: body.id,
        actor_id: actorId,
        actor_email: actorEmail,
        event_type: 'status_changed',
        from_status: beforeRow.status,
        to_status: updates.status,
        data: {},
      });
    }

    const trackingChanged =
      (updates.tracking_number !== undefined && updates.tracking_number !== (beforeRow.tracking_number ?? ''))
      || (updates.tracking_url !== undefined && updates.tracking_url !== (beforeRow.tracking_url ?? ''))
      || (updates.shipping_carrier !== undefined && updates.shipping_carrier !== (beforeRow.shipping_carrier ?? ''));

    if (trackingChanged) {
      events.push({
        order_id: body.id,
        actor_id: actorId,
        actor_email: actorEmail,
        event_type: 'tracking_updated',
        from_status: null,
        to_status: null,
        data: {
          carrier: updates.shipping_carrier ?? beforeRow.shipping_carrier,
          tracking_number: updates.tracking_number ?? beforeRow.tracking_number,
          tracking_url: updates.tracking_url ?? beforeRow.tracking_url,
        },
      });
    }

    if (updates.staff_notes !== undefined && (updates.staff_notes || '') !== (beforeRow.staff_notes ?? '')) {
      events.push({
        order_id: body.id,
        actor_id: actorId,
        actor_email: actorEmail,
        event_type: 'note_updated',
        from_status: null,
        to_status: null,
        data: { preview: (updates.staff_notes || '').slice(0, 200) },
      });
    }

    if (shouldSetFulfilledBy) {
      events.push({
        order_id: body.id,
        actor_id: actorId,
        actor_email: actorEmail,
        event_type: 'fulfilled_by_set',
        from_status: null,
        to_status: null,
        data: { fulfilled_by: actorId },
      });
    }

    if (events.length > 0) {
      const { error: auditError } = await supabaseServer.from('shop_order_events').insert(events);
      if (auditError) {
        console.error('[api/dev/shop/orders] audit insert failed:', auditError.message);
      }
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bad request';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
