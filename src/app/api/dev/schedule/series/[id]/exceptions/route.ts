import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { materializeSeries } from '@/lib/schedule/materializer';
import { isValidAccess, isValidHttpUrl, normalizeOptionalText } from '@/lib/schedule/server';
import { parseLocalDateTime } from '@/lib/schedule/timezone';

interface ExceptionPayload {
  occurrence_local?: unknown;
  action?: unknown;
  override_start_local?: unknown;
  override_label?: unknown;
  override_access?: unknown;
  override_cover_override_url?: unknown;
}

function normalizeLocalInput(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const parsed = parseLocalDateTime(value);
  if (!parsed) return null;
  return `${String(parsed.year).padStart(4, '0')}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}T${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}:${String(parsed.second).padStart(2, '0')}`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase non configurato.' }, { status: 503 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null) as ExceptionPayload | null;
  const occurrenceLocal = normalizeLocalInput(body?.occurrence_local);
  const action = typeof body?.action === 'string' ? body.action : '';

  if (!occurrenceLocal) {
    return NextResponse.json({ error: 'occurrence_local obbligatorio.' }, { status: 400 });
  }
  if (!['skip', 'override'].includes(action)) {
    return NextResponse.json({ error: 'action non valida.' }, { status: 400 });
  }

  const overrideStartLocal = normalizeLocalInput(body?.override_start_local);
  const overrideLabel = normalizeOptionalText(body?.override_label);
  const overrideCover = normalizeOptionalText(body?.override_cover_override_url);

  if (overrideCover && !isValidHttpUrl(overrideCover)) {
    return NextResponse.json({ error: 'override_cover_override_url non valida.' }, { status: 400 });
  }

  if (body?.override_access !== undefined && body?.override_access !== null && !isValidAccess(body.override_access)) {
    return NextResponse.json({ error: 'override_access non valido.' }, { status: 400 });
  }

  if (action === 'override' && !overrideStartLocal) {
    return NextResponse.json({ error: 'override_start_local obbligatorio per override.' }, { status: 400 });
  }

  const payload = {
    series_id: id,
    occurrence_local: occurrenceLocal,
    action,
    override_start_local: action === 'override' ? overrideStartLocal : null,
    override_label: action === 'override' ? overrideLabel : null,
    override_access: action === 'override' ? (body?.override_access ?? null) : null,
    override_cover_override_url: action === 'override' ? overrideCover : null,
  };

  const { data, error } = await supabaseServer
    .from('home_schedule_series_exceptions')
    .upsert(payload, {
      onConflict: 'series_id,occurrence_local',
      ignoreDuplicates: false,
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await materializeSeries({ seriesId: id }).catch(() => undefined);

  return NextResponse.json(data, { status: 201 });
}
