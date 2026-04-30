import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { isKnownFormat, isValidAccess, isValidHttpUrl, isValidStatus, normalizeOptionalText } from '@/lib/schedule/server';
import { ScheduleCard } from '@/lib/schedule/types';

interface CreateCardPayload {
  format_id?: unknown;
  label?: unknown;
  access?: unknown;
  start_at?: unknown;
  status?: unknown;
  is_active?: unknown;
  cover_override_url?: unknown;
  duration_minutes?: unknown;
}

const DEFAULT_DURATION_MINUTES = 60;
function normalizeDurationMinutes(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1440) {
    return Math.floor(value);
  }
  return DEFAULT_DURATION_MINUTES;
}

function parseDateIso(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export async function GET(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase non configurato.' }, { status: 503 });
  }

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get('status') ?? 'all';
  const activeFilter = url.searchParams.get('active') ?? 'all';
  const formatFilter = url.searchParams.get('format_id');
  const fromFilter = parseDateIso(url.searchParams.get('from'));
  const toFilter = parseDateIso(url.searchParams.get('to'));

  const limitRaw = Number(url.searchParams.get('limit') ?? '20');
  const offsetRaw = Number(url.searchParams.get('offset') ?? '0');
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 100) : 20;
  const offset = Number.isFinite(offsetRaw) ? Math.max(Math.floor(offsetRaw), 0) : 0;

  let query = supabaseServer
    .from('home_schedule_cards')
    .select('id,format_id,label,access,start_at,status,is_active,cover_override_url,source_type,series_id,occurrence_key,duration_minutes,created_at,updated_at', {
      count: 'exact',
    })
    .order('start_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (statusFilter !== 'all') {
    if (!isValidStatus(statusFilter)) {
      return NextResponse.json({ error: 'Filtro status non valido.' }, { status: 400 });
    }
    query = query.eq('status', statusFilter);
  }

  if (activeFilter === 'active') {
    query = query.eq('is_active', true);
  } else if (activeFilter === 'inactive') {
    query = query.eq('is_active', false);
  } else if (activeFilter !== 'all') {
    return NextResponse.json({ error: 'Filtro active non valido.' }, { status: 400 });
  }

  if (formatFilter) {
    query = query.eq('format_id', formatFilter);
  }

  if (fromFilter) {
    query = query.gte('start_at', fromFilter);
  }
  if (toFilter) {
    query = query.lte('start_at', toFilter);
  }

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const cards = (data ?? []) as ScheduleCard[];
  const formatIds = Array.from(new Set(cards.map(card => card.format_id)));
  const formatTitleById = new Map<string, string | null>();

  if (formatIds.length > 0) {
    const { data: formatRows } = await supabaseServer
      .from('content_formats')
      .select('id,title')
      .in('id', formatIds);

    for (const row of formatRows ?? []) {
      formatTitleById.set(row.id as string, (row.title as string | null) ?? null);
    }
  }

  const items = cards.map(card => ({
    ...card,
    format_title: formatTitleById.get(card.format_id) ?? null,
  }));

  return NextResponse.json({
    items,
    total: count ?? items.length,
    limit,
    offset,
  });
}

export async function POST(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase non configurato.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null) as CreateCardPayload | null;
  const formatId = typeof body?.format_id === 'string' ? body.format_id.trim() : '';
  const startAtRaw = typeof body?.start_at === 'string' ? body.start_at : '';
  const label = normalizeOptionalText(body?.label);
  const coverOverrideUrl = normalizeOptionalText(body?.cover_override_url);
  const accessRaw = body?.access;
  const statusRaw = body?.status;
  const isActive = typeof body?.is_active === 'boolean' ? body.is_active : true;

  if (!formatId) {
    return NextResponse.json({ error: 'format_id obbligatorio.' }, { status: 400 });
  }
  if (!(await isKnownFormat(formatId))) {
    return NextResponse.json({ error: 'format_id non valido.' }, { status: 400 });
  }
  if (!isValidAccess(accessRaw)) {
    return NextResponse.json({ error: 'access non valido.' }, { status: 400 });
  }
  if (!isValidStatus(statusRaw)) {
    return NextResponse.json({ error: 'status non valido.' }, { status: 400 });
  }

  const parsedStartAt = new Date(startAtRaw);
  if (!startAtRaw || Number.isNaN(parsedStartAt.getTime())) {
    return NextResponse.json({ error: 'start_at non valido.' }, { status: 400 });
  }

  if (coverOverrideUrl && !isValidHttpUrl(coverOverrideUrl)) {
    return NextResponse.json({ error: 'cover_override_url deve essere URL http/https valida.' }, { status: 400 });
  }

  const payload = {
    format_id: formatId,
    label,
    access: accessRaw,
    start_at: parsedStartAt.toISOString(),
    status: statusRaw,
    is_active: isActive,
    cover_override_url: coverOverrideUrl,
    source_type: 'manual',
    series_id: null,
    occurrence_key: null,
    duration_minutes: normalizeDurationMinutes(body?.duration_minutes),
  };

  const { data, error } = await supabaseServer
    .from('home_schedule_cards')
    .insert(payload)
    .select('id,format_id,label,access,start_at,status,is_active,cover_override_url,source_type,series_id,occurrence_key,duration_minutes,created_at,updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
