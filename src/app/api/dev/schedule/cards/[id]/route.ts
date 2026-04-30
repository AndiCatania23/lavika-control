import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { isKnownFormat, isValidAccess, isValidHttpUrl, isValidStatus, normalizeOptionalText } from '@/lib/schedule/server';

interface PatchPayload {
  format_id?: unknown;
  label?: unknown;
  access?: unknown;
  start_at?: unknown;
  status?: unknown;
  is_active?: unknown;
  cover_override_url?: unknown;
  duration_minutes?: unknown;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase non configurato.' }, { status: 503 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null) as PatchPayload | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Payload non valido.' }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (Object.prototype.hasOwnProperty.call(body, 'format_id')) {
    const formatId = typeof body.format_id === 'string' ? body.format_id.trim() : '';
    if (!formatId || !(await isKnownFormat(formatId))) {
      return NextResponse.json({ error: 'format_id non valido.' }, { status: 400 });
    }
    updateData.format_id = formatId;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'label')) {
    updateData.label = normalizeOptionalText(body.label);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'access')) {
    if (!isValidAccess(body.access)) {
      return NextResponse.json({ error: 'access non valido.' }, { status: 400 });
    }
    updateData.access = body.access;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    if (!isValidStatus(body.status)) {
      return NextResponse.json({ error: 'status non valido.' }, { status: 400 });
    }
    updateData.status = body.status;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'is_active')) {
    if (typeof body.is_active !== 'boolean') {
      return NextResponse.json({ error: 'is_active non valido.' }, { status: 400 });
    }
    updateData.is_active = body.is_active;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'start_at')) {
    const startAtRaw = typeof body.start_at === 'string' ? body.start_at : '';
    const parsed = new Date(startAtRaw);
    if (!startAtRaw || Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'start_at non valido.' }, { status: 400 });
    }
    updateData.start_at = parsed.toISOString();
  }

  if (Object.prototype.hasOwnProperty.call(body, 'cover_override_url')) {
    const coverOverride = normalizeOptionalText(body.cover_override_url);
    if (coverOverride && !isValidHttpUrl(coverOverride)) {
      return NextResponse.json({ error: 'cover_override_url non valida.' }, { status: 400 });
    }
    updateData.cover_override_url = coverOverride;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'duration_minutes')) {
    if (typeof body.duration_minutes !== 'number' || !Number.isFinite(body.duration_minutes)
        || body.duration_minutes <= 0 || body.duration_minutes > 1440) {
      return NextResponse.json({ error: 'duration_minutes deve essere intero 1..1440.' }, { status: 400 });
    }
    updateData.duration_minutes = Math.floor(body.duration_minutes);
  }

  if (Object.keys(updateData).length === 1) {
    return NextResponse.json({ error: 'Nessun campo da aggiornare.' }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from('home_schedule_cards')
    .update(updateData)
    .eq('id', id)
    .select('id,format_id,label,access,start_at,status,is_active,cover_override_url,source_type,series_id,occurrence_key,duration_minutes,created_at,updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase non configurato.' }, { status: 503 });
  }

  const { id } = await params;
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
