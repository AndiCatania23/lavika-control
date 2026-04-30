/**
 * GET   /api/console/formats/[id]   → dettaglio format con sources collegate
 * PATCH /api/console/formats/[id]   → modifica campi (NO id, NO delete fisico)
 *
 * Vincoli:
 * - id (slug) IMMUTABILE dopo creazione (cambiarlo orfanerebbe R2)
 * - delete fisico NON SUPPORTATO (decisione esistente piano)
 *
 * Audit: scrive in audit_log per PATCH.
 */
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { writeAuditLog, actorEmailFromRequest } from '@/lib/auditLog';

const VALID_BADGES = new Set(['bronze', 'silver', 'gold']);

const PATCHABLE_FIELDS = new Set([
  'title', 'description', 'category', 'team_id', 'default_min_badge',
  'sort_order', 'sync_trigger_offset_minutes',
  'cover_horizontal_url', 'cover_vertical_url', 'hero_url',
]);

function asText(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }
  const { id } = await params;

  const { data: format, error } = await supabaseServer
    .from('content_formats')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!format) return NextResponse.json({ error: 'Format non trovato' }, { status: 404 });

  const { data: sources } = await supabaseServer
    .from('video_sources')
    .select('*')
    .eq('format_id', id)
    .order('id');

  return NextResponse.json({ format, sources: sources ?? [] });
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

  // Blocco esplicito tentativo di cambiare id
  if (Object.prototype.hasOwnProperty.call(body, 'id')) {
    return NextResponse.json({ error: 'id (slug) non modificabile dopo creazione' }, { status: 400 });
  }

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

  for (const [key, value] of Object.entries(body)) {
    if (!PATCHABLE_FIELDS.has(key)) continue;

    if (key === 'default_min_badge') {
      const badge = asText(value);
      if (!badge || !VALID_BADGES.has(badge)) {
        return NextResponse.json({ error: 'default_min_badge non valido' }, { status: 400 });
      }
      updateData[key] = badge;
    } else if (key === 'sort_order') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return NextResponse.json({ error: 'sort_order deve essere numero' }, { status: 400 });
      }
      updateData[key] = Math.floor(value);
    } else if (key === 'sync_trigger_offset_minutes') {
      if (typeof value !== 'number' || value <= 0 || value > 1440) {
        return NextResponse.json({ error: 'sync_trigger_offset_minutes deve essere intero 1..1440' }, { status: 400 });
      }
      updateData[key] = Math.floor(value);
    } else {
      updateData[key] = value === null ? null : asText(value);
    }
  }

  if (Object.keys(updateData).length === 1) {
    return NextResponse.json({ error: 'Nessun campo valido da aggiornare' }, { status: 400 });
  }

  // Carica before per audit
  const { data: before } = await supabaseServer
    .from('content_formats')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: 'Format non trovato' }, { status: 404 });

  const { data: after, error } = await supabaseServer
    .from('content_formats')
    .update(updateData)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog({
    action: 'update_format',
    entity_table: 'content_formats',
    entity_id: id,
    diff: { before, after },
    actor_email: actorEmailFromRequest(request),
  });

  return NextResponse.json({ item: after });
}
