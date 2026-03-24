import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

const STATUS_VALUES = ['draft', 'published'] as const;
const ACCESS_VALUES = ['bronze', 'silver', 'gold'] as const;

type ScheduleStatus = typeof STATUS_VALUES[number];
type ScheduleAccess = typeof ACCESS_VALUES[number];

interface ScheduleRow {
  id: string;
  format_id: string;
  label: string | null;
  access: ScheduleAccess;
  start_at: string;
  status: ScheduleStatus;
  is_active: boolean;
  cover_override_url: string | null;
  created_at: string;
  updated_at: string;
}

function parseDateISO(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
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

interface CreatePayload {
  format_id?: unknown;
  label?: unknown;
  access?: unknown;
  start_at?: unknown;
  status?: unknown;
  is_active?: unknown;
  cover_override_url?: unknown;
}

export async function GET(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase non configurato.' }, { status: 503 });
  }

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get('status') ?? 'all';
  const activeFilter = url.searchParams.get('active') ?? 'all';
  const fromFilter = parseDateISO(url.searchParams.get('from'));
  const toFilter = parseDateISO(url.searchParams.get('to'));

  const limitRaw = Number(url.searchParams.get('limit') ?? '20');
  const offsetRaw = Number(url.searchParams.get('offset') ?? '0');
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 100) : 20;
  const offset = Number.isFinite(offsetRaw) ? Math.max(Math.floor(offsetRaw), 0) : 0;

  if (statusFilter !== 'all' && !STATUS_VALUES.includes(statusFilter as ScheduleStatus)) {
    return NextResponse.json({ error: 'Filtro status non valido.' }, { status: 400 });
  }

  if (!['all', 'active', 'inactive'].includes(activeFilter)) {
    return NextResponse.json({ error: 'Filtro attivo non valido.' }, { status: 400 });
  }

  if (url.searchParams.has('from') && !fromFilter) {
    return NextResponse.json({ error: 'Parametro from non valido.' }, { status: 400 });
  }

  if (url.searchParams.has('to') && !toFilter) {
    return NextResponse.json({ error: 'Parametro to non valido.' }, { status: 400 });
  }

  let query = supabaseServer
    .from('home_schedule_cards')
    .select('id,format_id,label,access,start_at,status,is_active,cover_override_url,created_at,updated_at', {
      count: 'exact',
    })
    .order('start_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  if (activeFilter === 'active') {
    query = query.eq('is_active', true);
  } else if (activeFilter === 'inactive') {
    query = query.eq('is_active', false);
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

  const rows = (data ?? []) as ScheduleRow[];
  const formatIds = Array.from(new Set(rows.map(item => item.format_id)));
  const formatTitleById = new Map<string, string | null>();

  if (formatIds.length > 0) {
    const { data: formatRows } = await supabaseServer
      .from('dev_format_options')
      .select('id,title')
      .in('id', formatIds);

    for (const row of formatRows ?? []) {
      formatTitleById.set(row.id as string, (row.title as string | null) ?? null);
    }
  }

  const items = rows.map(item => ({
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

  const body = await request.json().catch(() => null) as CreatePayload | null;
  const formatId = typeof body?.format_id === 'string' ? body.format_id.trim() : '';
  const startAtRaw = typeof body?.start_at === 'string' ? body.start_at : '';
  const statusRaw = typeof body?.status === 'string' ? body.status : 'draft';
  const accessRaw = typeof body?.access === 'string' ? body.access : '';
  const label = normalizeOptionalText(body?.label);
  const coverOverrideUrl = normalizeOptionalText(body?.cover_override_url);
  const isActive = typeof body?.is_active === 'boolean' ? body.is_active : true;

  if (!formatId) {
    return NextResponse.json({ error: 'format_id obbligatorio.' }, { status: 400 });
  }

  const knownFormat = await isKnownFormat(formatId);
  if (!knownFormat) {
    return NextResponse.json({ error: 'format_id non presente nelle opzioni valide.' }, { status: 400 });
  }

  if (!ACCESS_VALUES.includes(accessRaw as ScheduleAccess)) {
    return NextResponse.json({ error: 'Valore access non valido.' }, { status: 400 });
  }

  if (!STATUS_VALUES.includes(statusRaw as ScheduleStatus)) {
    return NextResponse.json({ error: 'Valore status non valido.' }, { status: 400 });
  }

  const parsedStartAt = new Date(startAtRaw);
  if (!startAtRaw || Number.isNaN(parsedStartAt.getTime())) {
    return NextResponse.json({ error: 'start_at non valido.' }, { status: 400 });
  }

  if (coverOverrideUrl && !isValidHttpUrl(coverOverrideUrl)) {
    return NextResponse.json({ error: 'cover_override_url deve essere una URL http/https valida.' }, { status: 400 });
  }

  const payload = {
    format_id: formatId,
    label,
    access: accessRaw as ScheduleAccess,
    start_at: parsedStartAt.toISOString(),
    status: statusRaw as ScheduleStatus,
    is_active: isActive,
    cover_override_url: coverOverrideUrl,
  };

  const { data, error } = await supabaseServer
    .from('home_schedule_cards')
    .insert(payload)
    .select('id,format_id,label,access,start_at,status,is_active,cover_override_url,created_at,updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data as ScheduleRow, { status: 201 });
}
