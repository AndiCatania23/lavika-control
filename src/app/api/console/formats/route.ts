/**
 * GET  /api/console/formats         → lista format con counts (episodi, source attive, ultimo sync)
 * POST /api/console/formats         → crea format nuovo (slug univoco, validazioni)
 *
 * Usato dal wizard FASE 4. Estende /api/media/formats che oggi gestisce solo cover/badge.
 *
 * Audit: scrive in audit_log per POST.
 */
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { writeAuditLog, actorEmailFromRequest } from '@/lib/auditLog';

const SLUG_RE = /^[a-z0-9-]+$/;
const VALID_BADGES = new Set(['bronze', 'silver', 'gold']);

interface CreateFormatPayload {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  category?: unknown;
  team_id?: unknown;
  default_min_badge?: unknown;
  sort_order?: unknown;
  sync_trigger_offset_minutes?: unknown;
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET() {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }

  // Lista format
  const { data: formats, error: fmtErr } = await supabaseServer
    .from('content_formats')
    .select('id, title, description, category, team_id, default_min_badge, sort_order, sync_trigger_offset_minutes, cover_horizontal_url, cover_vertical_url, hero_url, created_at, updated_at')
    .order('sort_order', { ascending: true });

  if (fmtErr) return NextResponse.json({ error: fmtErr.message }, { status: 500 });

  const formatIds = (formats ?? []).map(f => f.id as string);
  if (formatIds.length === 0) {
    return NextResponse.json({ items: [] });
  }

  // Counts episodi attivi per format
  const { data: epRows } = await supabaseServer
    .from('content_episodes')
    .select('format_id, is_active')
    .in('format_id', formatIds);

  const episodesByFormat = new Map<string, { total: number; active: number }>();
  for (const r of epRows ?? []) {
    const fid = r.format_id as string;
    if (!episodesByFormat.has(fid)) episodesByFormat.set(fid, { total: 0, active: 0 });
    const e = episodesByFormat.get(fid)!;
    e.total += 1;
    if (r.is_active) e.active += 1;
  }

  // Source attive per format
  const { data: srcRows } = await supabaseServer
    .from('video_sources')
    .select('format_id, enabled')
    .in('format_id', formatIds);

  const sourcesByFormat = new Map<string, { total: number; enabled: number }>();
  for (const r of srcRows ?? []) {
    const fid = r.format_id as string;
    if (!sourcesByFormat.has(fid)) sourcesByFormat.set(fid, { total: 0, enabled: 0 });
    const s = sourcesByFormat.get(fid)!;
    s.total += 1;
    if (r.enabled) s.enabled += 1;
  }

  // Ultimo sync per format (tramite job_queue.source → video_sources.format_id)
  const { data: jobsRows } = await supabaseServer
    .from('job_queue')
    .select('source, finished_at, status')
    .eq('status', 'success')
    .order('finished_at', { ascending: false })
    .limit(500);

  // Mappa source.id → format_id
  const sourceIdToFormat = new Map<string, string>();
  for (const r of srcRows ?? []) {
    sourceIdToFormat.set(r.format_id as string, r.format_id as string);
  }
  // Più precisamente: prima carico video_sources con id+format_id
  const { data: srcIdRows } = await supabaseServer
    .from('video_sources')
    .select('id, format_id')
    .in('format_id', formatIds);
  const srcIdToFormat = new Map<string, string>();
  for (const r of srcIdRows ?? []) srcIdToFormat.set(r.id as string, r.format_id as string);

  const lastSyncByFormat = new Map<string, string>();
  for (const j of jobsRows ?? []) {
    const fid = srcIdToFormat.get(j.source as string);
    if (!fid) continue;
    if (!lastSyncByFormat.has(fid) && j.finished_at) {
      lastSyncByFormat.set(fid, j.finished_at as string);
    }
  }

  const items = (formats ?? []).map(f => {
    const fid = f.id as string;
    const ep = episodesByFormat.get(fid) ?? { total: 0, active: 0 };
    const src = sourcesByFormat.get(fid) ?? { total: 0, enabled: 0 };
    return {
      ...f,
      episodes_total: ep.total,
      episodes_active: ep.active,
      sources_total: src.total,
      sources_enabled: src.enabled,
      last_sync_at: lastSyncByFormat.get(fid) ?? null,
    };
  });

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }

  const body = await request.json().catch(() => null) as CreateFormatPayload | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Payload non valido' }, { status: 400 });
  }

  // Slug (id) — required, regex
  const id = asText(body.id);
  if (!id || !SLUG_RE.test(id) || id.length > 40) {
    return NextResponse.json({ error: 'id slug deve match ^[a-z0-9-]+$, max 40 char' }, { status: 400 });
  }

  // Title — required
  const title = asText(body.title);
  if (!title) {
    return NextResponse.json({ error: 'title obbligatorio' }, { status: 400 });
  }

  // default_min_badge — required, enum
  const badge = asText(body.default_min_badge) ?? 'bronze';
  if (!VALID_BADGES.has(badge)) {
    return NextResponse.json({ error: `default_min_badge deve essere bronze/silver/gold` }, { status: 400 });
  }

  // sort_order — opzionale
  const sortOrder = typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)
    ? Math.floor(body.sort_order)
    : 100;

  // sync_trigger_offset_minutes — opzionale, 1..1440
  let offset = 15;
  if (body.sync_trigger_offset_minutes !== undefined) {
    if (typeof body.sync_trigger_offset_minutes !== 'number' || body.sync_trigger_offset_minutes <= 0
        || body.sync_trigger_offset_minutes > 1440) {
      return NextResponse.json({ error: 'sync_trigger_offset_minutes deve essere intero 1..1440' }, { status: 400 });
    }
    offset = Math.floor(body.sync_trigger_offset_minutes);
  }

  // team_id — opzionale (uuid string)
  const teamId = asText(body.team_id);

  // Verifica unicità id
  const { data: existing } = await supabaseServer
    .from('content_formats')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: `Format con id "${id}" esiste già` }, { status: 409 });
  }

  const insertPayload = {
    id,
    title,
    description: asText(body.description),
    category: asText(body.category),
    team_id: teamId,
    default_min_badge: badge,
    sort_order: sortOrder,
    sync_trigger_offset_minutes: offset,
  };

  const { data, error } = await supabaseServer
    .from('content_formats')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAuditLog({
    action: 'create_format',
    entity_table: 'content_formats',
    entity_id: data.id,
    diff: { before: null, after: data },
    actor_email: actorEmailFromRequest(request),
  });

  return NextResponse.json({ item: data }, { status: 201 });
}
