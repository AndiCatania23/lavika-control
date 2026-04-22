import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

// Shop notification emails CRUD.
// Destinatari delle mail "nuovo ordine", "refund", "low stock", "daily summary".
// Lo script Mac (shop-orders-notifier) NON usa questa tabella (va su APNs);
// sara' consumata dai futuri senders email (Resend / SES).

const VALID_PURPOSES = ['new_order', 'refund', 'low_stock', 'daily_summary', 'generic'];

export async function GET() {
  if (!supabaseServer) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  const { data, error } = await supabaseServer
    .from('shop_notification_emails')
    .select('*')
    .order('purpose', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  if (!supabaseServer) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });

  try {
    const body = (await request.json()) as {
      email?: string;
      purpose?: string;
      enabled?: boolean;
      note?: string;
    };

    const email = body.email?.trim().toLowerCase() ?? '';
    const purpose = body.purpose ?? 'new_order';

    if (!email) return NextResponse.json({ error: 'Email obbligatoria' }, { status: 400 });
    if (!VALID_PURPOSES.includes(purpose)) {
      return NextResponse.json({ error: `Purpose non valido (ammessi: ${VALID_PURPOSES.join(', ')})` }, { status: 400 });
    }

    const { data, error } = await supabaseServer
      .from('shop_notification_emails')
      .insert({
        email,
        purpose,
        enabled: body.enabled ?? true,
        note: body.note?.trim() || null,
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

    const { id, ...raw } = body;
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof raw.email === 'string') updates.email = raw.email.trim().toLowerCase();
    if (typeof raw.purpose === 'string') {
      if (!VALID_PURPOSES.includes(raw.purpose)) {
        return NextResponse.json({ error: 'Purpose non valido' }, { status: 400 });
      }
      updates.purpose = raw.purpose;
    }
    if (typeof raw.enabled === 'boolean') updates.enabled = raw.enabled;
    if (typeof raw.note === 'string') updates.note = raw.note.trim() || null;

    const { data, error } = await supabaseServer
      .from('shop_notification_emails')
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

  const { error } = await supabaseServer.from('shop_notification_emails').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
