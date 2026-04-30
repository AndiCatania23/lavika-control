/**
 * GET  /api/console/video-sources       → lista source (filtro format_id, enabled)
 * POST /api/console/video-sources       → crea source nuova
 *
 * Validazioni:
 * - id slug ^[a-z0-9-]+$
 * - format_id deve esistere in content_formats
 * - platform IN (youtube, facebook, manual)
 * - channel URL pattern per platform
 *
 * Audit: scrive in audit_log per POST.
 */
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { writeAuditLog, actorEmailFromRequest } from '@/lib/auditLog';

const SLUG_RE = /^[a-z0-9-]+$/;
const VALID_PLATFORMS = new Set(['youtube', 'facebook', 'manual']);

const YT_RE = /^https?:\/\/(www\.)?youtube\.com\/(playlist\?list=|@|channel\/|c\/|user\/)/i;
const FB_RE = /^(https?:\/\/(www\.)?facebook\.com\/|file:)/i;

interface CreateSourcePayload {
  id?: unknown;
  format_id?: unknown;
  name?: unknown;
  platform?: unknown;
  channel?: unknown;
  filters?: unknown;
  processing?: unknown;
  naming?: unknown;
  notifications?: unknown;
  ui_format?: unknown;
  metadata?: unknown;
  season?: unknown;
  match_resolver?: unknown;
  category?: unknown;
  subcategory?: unknown;
  schedule_cron?: unknown;
  scan_window?: unknown;
  max_videos_per_run?: unknown;
  enabled?: unknown;
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export async function GET(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }

  const url = new URL(request.url);
  const formatFilter = url.searchParams.get('format_id');
  const enabledFilter = url.searchParams.get('enabled');

  let query = supabaseServer
    .from('video_sources')
    .select('*')
    .order('id', { ascending: true });

  if (formatFilter) query = query.eq('format_id', formatFilter);
  if (enabledFilter === 'true') query = query.eq('enabled', true);
  else if (enabledFilter === 'false') query = query.eq('enabled', false);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }

  const body = await request.json().catch(() => null) as CreateSourcePayload | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Payload non valido' }, { status: 400 });
  }

  // id slug
  const id = asText(body.id);
  if (!id || !SLUG_RE.test(id) || id.length > 50) {
    return NextResponse.json({ error: 'id deve match ^[a-z0-9-]+$, max 50 char' }, { status: 400 });
  }

  // format_id required + verify exists
  const formatId = asText(body.format_id);
  if (!formatId) {
    return NextResponse.json({ error: 'format_id obbligatorio' }, { status: 400 });
  }
  const { data: fmt } = await supabaseServer
    .from('content_formats')
    .select('id')
    .eq('id', formatId)
    .maybeSingle();
  if (!fmt) {
    return NextResponse.json({ error: `format_id "${formatId}" non esiste in content_formats` }, { status: 400 });
  }

  // platform required + enum
  const platform = asText(body.platform);
  if (!platform || !VALID_PLATFORMS.has(platform)) {
    return NextResponse.json({ error: 'platform deve essere youtube/facebook/manual' }, { status: 400 });
  }

  // channel — required per youtube/facebook, opzionale per manual
  const channel = asText(body.channel);
  if (platform === 'youtube') {
    if (!channel || !YT_RE.test(channel)) {
      return NextResponse.json({ error: 'channel YouTube deve match URL playlist o @canale o /channel/' }, { status: 400 });
    }
  } else if (platform === 'facebook') {
    if (!channel || !FB_RE.test(channel)) {
      return NextResponse.json({ error: 'channel Facebook deve match URL facebook.com/ o file:...' }, { status: 400 });
    }
  }

  // Verifica unicità id
  const { data: existing } = await supabaseServer
    .from('video_sources')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: `Source con id "${id}" esiste già` }, { status: 409 });
  }

  const insertPayload = {
    id,
    format_id: formatId,
    name: asText(body.name),
    platform,
    channel,
    filters: asObject(body.filters) ?? {},
    processing: asObject(body.processing) ?? {},
    naming: asObject(body.naming) ?? {},
    notifications: asObject(body.notifications) ?? {},
    ui_format: asObject(body.ui_format) ?? {},
    metadata: asObject(body.metadata) ?? {},
    season: asObject(body.season),
    match_resolver: asObject(body.match_resolver),
    category: asText(body.category),
    subcategory: asText(body.subcategory),
    schedule_cron: asText(body.schedule_cron),
    scan_window: typeof body.scan_window === 'number' && body.scan_window > 0 ? Math.floor(body.scan_window) : 14,
    max_videos_per_run: typeof body.max_videos_per_run === 'number' && body.max_videos_per_run > 0 ? Math.floor(body.max_videos_per_run) : 100,
    enabled: typeof body.enabled === 'boolean' ? body.enabled : true,
    created_by: actorEmailFromRequest(request) ?? 'control-api',
  };

  const { data, error } = await supabaseServer
    .from('video_sources')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog({
    action: 'create_source',
    entity_table: 'video_sources',
    entity_id: data.id,
    diff: { before: null, after: data },
    actor_email: actorEmailFromRequest(request),
  });

  return NextResponse.json({ item: data }, { status: 201 });
}
