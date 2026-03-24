import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { materializeSeries } from '@/lib/schedule/materializer';
import { parseRRule } from '@/lib/schedule/rrule';
import { isKnownFormat, isValidAccess, isValidHttpUrl, isValidStatus, normalizeOptionalText } from '@/lib/schedule/server';
import { parseLocalDateTime } from '@/lib/schedule/timezone';
import { SCHEDULE_TIMEZONE, ScheduleSeries } from '@/lib/schedule/types';

interface CreateSeriesPayload {
  format_id?: unknown;
  label?: unknown;
  access?: unknown;
  cover_override_url?: unknown;
  timezone?: unknown;
  dtstart_local?: unknown;
  rrule?: unknown;
  until_local?: unknown;
  max_occurrences?: unknown;
  status?: unknown;
  is_active?: unknown;
}

function normalizeLocalInput(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const parsed = parseLocalDateTime(value);
  if (!parsed) return null;
  return `${String(parsed.year).padStart(4, '0')}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}T${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}:${String(parsed.second).padStart(2, '0')}`;
}

export async function GET(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase non configurato.' }, { status: 503 });
  }

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get('status') ?? 'all';
  const activeFilter = url.searchParams.get('active') ?? 'all';
  const formatFilter = url.searchParams.get('format_id');

  const limitRaw = Number(url.searchParams.get('limit') ?? '20');
  const offsetRaw = Number(url.searchParams.get('offset') ?? '0');
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 100) : 20;
  const offset = Number.isFinite(offsetRaw) ? Math.max(Math.floor(offsetRaw), 0) : 0;

  let query = supabaseServer
    .from('home_schedule_series')
    .select('id,format_id,label,access,cover_override_url,timezone,dtstart_local,rrule,until_local,max_occurrences,status,is_active,created_at,updated_at', {
      count: 'exact',
    })
    .order('dtstart_local', { ascending: true })
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

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const series = (data ?? []) as ScheduleSeries[];
  const formatIds = Array.from(new Set(series.map(item => item.format_id)));
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

  const items = series.map(item => ({
    ...item,
    format_title: formatTitleById.get(item.format_id) ?? null,
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

  const body = await request.json().catch(() => null) as CreateSeriesPayload | null;
  const formatId = typeof body?.format_id === 'string' ? body.format_id.trim() : '';
  const label = normalizeOptionalText(body?.label);
  const coverOverrideUrl = normalizeOptionalText(body?.cover_override_url);
  const dtstartLocal = normalizeLocalInput(body?.dtstart_local);
  const untilLocal = body?.until_local === null ? null : normalizeLocalInput(body?.until_local);
  const rrule = typeof body?.rrule === 'string' ? body.rrule.trim() : '';
  const maxOccurrences = typeof body?.max_occurrences === 'number' && body.max_occurrences > 0
    ? Math.floor(body.max_occurrences)
    : null;
  const timezone = typeof body?.timezone === 'string' ? body.timezone.trim() : SCHEDULE_TIMEZONE;
  const isActive = typeof body?.is_active === 'boolean' ? body.is_active : true;

  if (!formatId || !(await isKnownFormat(formatId))) {
    return NextResponse.json({ error: 'format_id non valido.' }, { status: 400 });
  }
  if (!isValidAccess(body?.access)) {
    return NextResponse.json({ error: 'access non valido.' }, { status: 400 });
  }
  if (!isValidStatus(body?.status)) {
    return NextResponse.json({ error: 'status non valido.' }, { status: 400 });
  }
  if (timezone !== SCHEDULE_TIMEZONE) {
    return NextResponse.json({ error: `timezone deve essere ${SCHEDULE_TIMEZONE}.` }, { status: 400 });
  }
  if (!dtstartLocal) {
    return NextResponse.json({ error: 'dtstart_local non valido.' }, { status: 400 });
  }
  if (!rrule) {
    return NextResponse.json({ error: 'rrule obbligatoria.' }, { status: 400 });
  }
  try {
    parseRRule(rrule);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'rrule non valida.' }, { status: 400 });
  }

  if (coverOverrideUrl && !isValidHttpUrl(coverOverrideUrl)) {
    return NextResponse.json({ error: 'cover_override_url non valida.' }, { status: 400 });
  }

  if (body?.until_local !== undefined && body?.until_local !== null && !untilLocal) {
    return NextResponse.json({ error: 'until_local non valido.' }, { status: 400 });
  }

  const payload = {
    format_id: formatId,
    label,
    access: body.access,
    cover_override_url: coverOverrideUrl,
    timezone,
    dtstart_local: dtstartLocal,
    rrule,
    until_local: untilLocal,
    max_occurrences: maxOccurrences,
    status: body.status,
    is_active: isActive,
  };

  const { data, error } = await supabaseServer
    .from('home_schedule_series')
    .insert(payload)
    .select('id,format_id,label,access,cover_override_url,timezone,dtstart_local,rrule,until_local,max_occurrences,status,is_active,created_at,updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (payload.status === 'published' && payload.is_active) {
    try {
      await materializeSeries({ seriesId: data.id });
    } catch (error) {
      await supabaseServer.from('home_schedule_series').delete().eq('id', data.id);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Materializzazione serie non riuscita.' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(data, { status: 201 });
}
