/**
 * GET    /api/console/video-sources/[id]    → dettaglio source
 * PATCH  /api/console/video-sources/[id]    → modifica (NO id, NO format_id changes)
 * DELETE /api/console/video-sources/[id]    → SOFT delete: enabled=false (no DELETE fisico)
 *
 * Vincoli:
 * - id IMMUTABILE
 * - format_id IMMUTABILE (cambiarlo orfanerebbe episodi)
 *
 * Audit: scrive in audit_log per PATCH e DELETE soft.
 */
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { writeAuditLog, actorEmailFromRequest } from '@/lib/auditLog';

const PATCHABLE_FIELDS = new Set([
  'name', 'channel', 'filters', 'processing', 'naming', 'notifications',
  'ui_format', 'metadata', 'season', 'match_resolver',
  'category', 'subcategory', 'schedule_cron', 'scan_window', 'max_videos_per_run',
  'enabled',
]);

const VALID_PLATFORMS = new Set(['youtube', 'facebook', 'manual']);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const { id } = await params;

  const { data, error } = await supabaseServer
    .from('video_sources')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Source non trovata' }, { status: 404 });

  return NextResponse.json({ item: data });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const { id } = await params;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Payload non valido' }, { status: 400 });
  }

  if (Object.prototype.hasOwnProperty.call(body, 'id')) {
    return NextResponse.json({ error: 'id non modificabile' }, { status: 400 });
  }
  if (Object.prototype.hasOwnProperty.call(body, 'format_id')) {
    return NextResponse.json({ error: 'format_id non modificabile (orfanerebbe episodi)' }, { status: 400 });
  }
  if (Object.prototype.hasOwnProperty.call(body, 'platform')) {
    // platform tecnicamente non andrebbe cambiato post-creazione, ma allowable se davvero serve
    const p = body.platform;
    if (typeof p !== 'string' || !VALID_PLATFORMS.has(p)) {
      return NextResponse.json({ error: 'platform deve essere youtube/facebook/manual' }, { status: 400 });
    }
  }

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (Object.prototype.hasOwnProperty.call(body, 'platform')) {
    updateData.platform = body.platform;
  }

  for (const [key, value] of Object.entries(body)) {
    if (!PATCHABLE_FIELDS.has(key)) continue;

    if (key === 'enabled') {
      if (typeof value !== 'boolean') {
        return NextResponse.json({ error: 'enabled deve essere boolean' }, { status: 400 });
      }
      updateData[key] = value;
    } else if (key === 'scan_window' || key === 'max_videos_per_run') {
      if (typeof value !== 'number' || value <= 0) {
        return NextResponse.json({ error: `${key} deve essere intero > 0` }, { status: 400 });
      }
      updateData[key] = Math.floor(value);
    } else if (
      key === 'filters' || key === 'processing' || key === 'naming' || key === 'notifications'
      || key === 'ui_format' || key === 'metadata' || key === 'season' || key === 'match_resolver'
    ) {
      if (value === null) updateData[key] = null;
      else if (typeof value === 'object' && !Array.isArray(value)) updateData[key] = value;
      else return NextResponse.json({ error: `${key} deve essere object o null` }, { status: 400 });
    } else {
      // text fields
      updateData[key] = typeof value === 'string' ? value.trim() : value === null ? null : String(value);
    }
  }

  if (Object.keys(updateData).length === 1) {
    return NextResponse.json({ error: 'Nessun campo valido da aggiornare' }, { status: 400 });
  }

  const { data: before } = await supabaseServer
    .from('video_sources')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: 'Source non trovata' }, { status: 404 });

  const { data: after, error } = await supabaseServer
    .from('video_sources')
    .update(updateData)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog({
    action: 'update_source',
    entity_table: 'video_sources',
    entity_id: id,
    diff: { before, after },
    actor_email: actorEmailFromRequest(request),
  });

  return NextResponse.json({ item: after });
}

/**
 * Soft delete: enabled=false. Niente DELETE fisico (decisione piano:
 * gli episodi associati restano linkati al format_id, la source resta
 * in DB ma il sync non la prende più).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const { id } = await params;

  const { data: before } = await supabaseServer
    .from('video_sources')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: 'Source non trovata' }, { status: 404 });

  if (!before.enabled) {
    return NextResponse.json({ ok: true, mode: 'already_disabled' });
  }

  const { data: after, error } = await supabaseServer
    .from('video_sources')
    .update({ enabled: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog({
    action: 'archive_source',
    entity_table: 'video_sources',
    entity_id: id,
    diff: { before, after },
    actor_email: actorEmailFromRequest(request),
  });

  return NextResponse.json({ ok: true, mode: 'soft', item: after });
}
