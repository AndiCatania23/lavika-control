import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

const STATUS_VALUES = ['draft', 'published'] as const;
const ACCESS_VALUES = ['bronze', 'silver', 'gold'] as const;

type ScheduleStatus = typeof STATUS_VALUES[number];
type ScheduleAccess = typeof ACCESS_VALUES[number];

interface UpdatePayload {
  format_id?: unknown;
  label?: unknown;
  access?: unknown;
  start_at?: unknown;
  status?: unknown;
  is_active?: unknown;
  cover_override_url?: unknown;
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function isKnownFormat(formatId: string): Promise<boolean> {
  if (!supabaseServer) return false;

  const { data, error } = await supabaseServer
    .from('dev_format_options')
    .select('id')
    .eq('id', formatId)
    .limit(1);

  return !error && Array.isArray(data) && data.length > 0;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase non configurato.' }, { status: 503 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'ID mancante.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null) as UpdatePayload | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Payload non valido.' }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (Object.prototype.hasOwnProperty.call(body, 'format_id')) {
    const formatId = typeof body.format_id === 'string' ? body.format_id.trim() : '';
    if (!formatId) {
      return NextResponse.json({ error: 'format_id non valido.' }, { status: 400 });
    }
    const knownFormat = await isKnownFormat(formatId);
    if (!knownFormat) {
      return NextResponse.json({ error: 'format_id non presente nelle opzioni valide.' }, { status: 400 });
    }
    updateData.format_id = formatId;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'label')) {
    updateData.label = normalizeOptionalText(body.label);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'access')) {
    if (!ACCESS_VALUES.includes(body.access as ScheduleAccess)) {
      return NextResponse.json({ error: 'Valore access non valido.' }, { status: 400 });
    }
    updateData.access = body.access;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    if (!STATUS_VALUES.includes(body.status as ScheduleStatus)) {
      return NextResponse.json({ error: 'Valore status non valido.' }, { status: 400 });
    }
    updateData.status = body.status;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'is_active')) {
    if (typeof body.is_active !== 'boolean') {
      return NextResponse.json({ error: 'Valore is_active non valido.' }, { status: 400 });
    }
    updateData.is_active = body.is_active;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'start_at')) {
    const startAtRaw = typeof body.start_at === 'string' ? body.start_at : '';
    const parsedStartAt = new Date(startAtRaw);
    if (!startAtRaw || Number.isNaN(parsedStartAt.getTime())) {
      return NextResponse.json({ error: 'start_at non valido.' }, { status: 400 });
    }
    updateData.start_at = parsedStartAt.toISOString();
  }

  if (Object.prototype.hasOwnProperty.call(body, 'cover_override_url')) {
    const coverOverrideUrl = normalizeOptionalText(body.cover_override_url);
    if (coverOverrideUrl && !isValidHttpUrl(coverOverrideUrl)) {
      return NextResponse.json({ error: 'cover_override_url deve essere una URL http/https valida.' }, { status: 400 });
    }
    updateData.cover_override_url = coverOverrideUrl;
  }

  if (Object.keys(updateData).length === 1) {
    return NextResponse.json({ error: 'Nessun campo da aggiornare.' }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from('home_schedule_cards')
    .update(updateData)
    .eq('id', id)
    .select('id,format_id,label,access,start_at,status,is_active,cover_override_url,created_at,updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase non configurato.' }, { status: 503 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'ID mancante.' }, { status: 400 });
  }

  const url = new URL(request.url);
  const hardDelete = url.searchParams.get('hard') === 'true';

  if (hardDelete) {
    const { error } = await supabaseServer
      .from('home_schedule_cards')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, mode: 'hard' });
  }

  const { error } = await supabaseServer
    .from('home_schedule_cards')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, mode: 'soft' });
}
