import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { materializeSeries, retireSeriesOccurrences } from '@/lib/schedule/materializer';
import { parseRRule } from '@/lib/schedule/rrule';
import { isKnownFormat, isValidAccess, isValidHttpUrl, isValidStatus, normalizeOptionalText } from '@/lib/schedule/server';
import { parseLocalDateTime } from '@/lib/schedule/timezone';
import { SCHEDULE_TIMEZONE } from '@/lib/schedule/types';

type UpdateScope = 'all' | 'this_and_following';

interface PatchSeriesPayload {
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
  scope?: unknown;
  effective_from_local?: unknown;
}

interface SeriesRow {
  id: string;
  format_id: string;
  label: string | null;
  access: 'bronze' | 'silver' | 'gold';
  cover_override_url: string | null;
  timezone: string;
  dtstart_local: string;
  rrule: string;
  until_local: string | null;
  max_occurrences: number | null;
  status: 'draft' | 'published';
  is_active: boolean;
}

function normalizeLocalInput(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const parsed = parseLocalDateTime(value);
  if (!parsed) return null;
  return `${String(parsed.year).padStart(4, '0')}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}T${String(parsed.hour).padStart(2, '0')}:${String(parsed.minute).padStart(2, '0')}:${String(parsed.second).padStart(2, '0')}`;
}

function localMinusOneMinute(value: string): string {
  const parsed = parseLocalDateTime(value);
  if (!parsed) return value;
  const utc = Date.UTC(parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute, parsed.second);
  const shifted = new Date(utc - 60_000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}T${String(shifted.getUTCHours()).padStart(2, '0')}:${String(shifted.getUTCMinutes()).padStart(2, '0')}:${String(shifted.getUTCSeconds()).padStart(2, '0')}`;
}

async function fetchSeriesById(id: string): Promise<SeriesRow | null> {
  if (!supabaseServer) return null;
  const { data, error } = await supabaseServer
    .from('home_schedule_series')
    .select('id,format_id,label,access,cover_override_url,timezone,dtstart_local,rrule,until_local,max_occurrences,status,is_active')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as SeriesRow | null) ?? null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase non configurato.' }, { status: 503 });
  }

  const { id } = await params;
  const current = await fetchSeriesById(id);
  if (!current) {
    return NextResponse.json({ error: 'Serie non trovata.' }, { status: 404 });
  }

  const body = await request.json().catch(() => null) as PatchSeriesPayload | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Payload non valido.' }, { status: 400 });
  }

  const scope = (typeof body.scope === 'string' ? body.scope : 'all') as UpdateScope;
  if (!['all', 'this_and_following'].includes(scope)) {
    return NextResponse.json({ error: 'scope non valido.' }, { status: 400 });
  }

  const nextFormatId = Object.prototype.hasOwnProperty.call(body, 'format_id')
    ? (typeof body.format_id === 'string' ? body.format_id.trim() : '')
    : current.format_id;

  if (!nextFormatId || !(await isKnownFormat(nextFormatId))) {
    return NextResponse.json({ error: 'format_id non valido.' }, { status: 400 });
  }

  const nextAccess = Object.prototype.hasOwnProperty.call(body, 'access') ? body.access : current.access;
  if (!isValidAccess(nextAccess)) {
    return NextResponse.json({ error: 'access non valido.' }, { status: 400 });
  }

  const nextStatus = Object.prototype.hasOwnProperty.call(body, 'status') ? body.status : current.status;
  if (!isValidStatus(nextStatus)) {
    return NextResponse.json({ error: 'status non valido.' }, { status: 400 });
  }

  const nextTimezone = Object.prototype.hasOwnProperty.call(body, 'timezone')
    ? (typeof body.timezone === 'string' ? body.timezone.trim() : '')
    : current.timezone;
  if (nextTimezone !== SCHEDULE_TIMEZONE) {
    return NextResponse.json({ error: `timezone deve essere ${SCHEDULE_TIMEZONE}.` }, { status: 400 });
  }

  const nextDtstartLocal = Object.prototype.hasOwnProperty.call(body, 'dtstart_local')
    ? normalizeLocalInput(body.dtstart_local)
    : current.dtstart_local;
  if (!nextDtstartLocal) {
    return NextResponse.json({ error: 'dtstart_local non valido.' }, { status: 400 });
  }

  const nextRrule = Object.prototype.hasOwnProperty.call(body, 'rrule')
    ? (typeof body.rrule === 'string' ? body.rrule.trim() : '')
    : current.rrule;
  if (!nextRrule) {
    return NextResponse.json({ error: 'rrule non valida.' }, { status: 400 });
  }
  try {
    parseRRule(nextRrule);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'rrule non valida.' }, { status: 400 });
  }

  const nextUntilLocal = Object.prototype.hasOwnProperty.call(body, 'until_local')
    ? (body.until_local === null ? null : normalizeLocalInput(body.until_local))
    : current.until_local;
  if (Object.prototype.hasOwnProperty.call(body, 'until_local') && body.until_local !== null && !nextUntilLocal) {
    return NextResponse.json({ error: 'until_local non valido.' }, { status: 400 });
  }

  const nextCover = Object.prototype.hasOwnProperty.call(body, 'cover_override_url')
    ? normalizeOptionalText(body.cover_override_url)
    : current.cover_override_url;
  if (nextCover && !isValidHttpUrl(nextCover)) {
    return NextResponse.json({ error: 'cover_override_url non valida.' }, { status: 400 });
  }

  const nextLabel = Object.prototype.hasOwnProperty.call(body, 'label')
    ? normalizeOptionalText(body.label)
    : current.label;

  const nextMaxOccurrences = Object.prototype.hasOwnProperty.call(body, 'max_occurrences')
    ? (typeof body.max_occurrences === 'number' && body.max_occurrences > 0 ? Math.floor(body.max_occurrences) : null)
    : current.max_occurrences;

  const nextIsActive = Object.prototype.hasOwnProperty.call(body, 'is_active')
    ? (typeof body.is_active === 'boolean' ? body.is_active : current.is_active)
    : current.is_active;

  if (scope === 'all') {
    const updateData = {
      format_id: nextFormatId,
      label: nextLabel,
      access: nextAccess,
      cover_override_url: nextCover,
      timezone: nextTimezone,
      dtstart_local: nextDtstartLocal,
      rrule: nextRrule,
      until_local: nextUntilLocal,
      max_occurrences: nextMaxOccurrences,
      status: nextStatus,
      is_active: nextIsActive,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseServer
      .from('home_schedule_series')
      .update(updateData)
      .eq('id', id)
      .select('id,format_id,label,access,cover_override_url,timezone,dtstart_local,rrule,until_local,max_occurrences,status,is_active,created_at,updated_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (nextIsActive) {
      try {
        const materialize = await materializeSeries({ seriesId: id });
        return NextResponse.json({ mode: 'all', item: data, materialize });
      } catch (materializeError) {
        return NextResponse.json(
          { error: materializeError instanceof Error ? materializeError.message : 'Rematerialize non riuscito.' },
          { status: 500 }
        );
      }
    } else {
      try {
        await retireSeriesOccurrences({ seriesId: id, futureOnly: true, hardDelete: false });
      } catch (retireError) {
        return NextResponse.json(
          { error: retireError instanceof Error ? retireError.message : 'Disattivazione occorrenze non riuscita.' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ mode: 'all', item: data, materialize: null });
  }

  const effectiveFrom = normalizeLocalInput(body.effective_from_local);
  if (!effectiveFrom) {
    return NextResponse.json({ error: 'effective_from_local obbligatorio per this_and_following.' }, { status: 400 });
  }

  const oldUntil = localMinusOneMinute(effectiveFrom);
  const baseUntil = current.until_local;
  const finalOldUntil = baseUntil && baseUntil < oldUntil ? baseUntil : oldUntil;

  const { error: closeError } = await supabaseServer
    .from('home_schedule_series')
    .update({
      until_local: finalOldUntil,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (closeError) {
    return NextResponse.json({ error: closeError.message }, { status: 500 });
  }

  const createPayload = {
    format_id: nextFormatId,
    label: nextLabel,
    access: nextAccess,
    cover_override_url: nextCover,
    timezone: nextTimezone,
    dtstart_local: effectiveFrom,
    rrule: nextRrule,
    until_local: nextUntilLocal,
    max_occurrences: nextMaxOccurrences,
    status: nextStatus,
    is_active: nextIsActive,
  };

  const { data: created, error: createError } = await supabaseServer
    .from('home_schedule_series')
    .insert(createPayload)
    .select('id,format_id,label,access,cover_override_url,timezone,dtstart_local,rrule,until_local,max_occurrences,status,is_active,created_at,updated_at')
    .single();

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 500 });
  }

  try {
    let previousMaterialize: unknown = null;
    let newMaterialize: unknown = null;

    if (current.is_active) {
      previousMaterialize = await materializeSeries({ seriesId: id });
    } else {
      await retireSeriesOccurrences({ seriesId: id, futureOnly: true, hardDelete: false });
    }

    if (nextIsActive) {
      newMaterialize = await materializeSeries({ seriesId: created.id });
    } else {
      await retireSeriesOccurrences({ seriesId: created.id, futureOnly: true, hardDelete: false });
    }

    return NextResponse.json({
      mode: 'this_and_following',
      previous_series_id: id,
      new_series: created,
      materialize_previous: previousMaterialize,
      materialize_new: newMaterialize,
    });
  } catch (materializeError) {
    return NextResponse.json(
      { error: materializeError instanceof Error ? materializeError.message : 'Rematerialize split non riuscito.' },
      { status: 500 }
    );
  }
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
      .from('home_schedule_series')
      .delete()
      .eq('id', id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await retireSeriesOccurrences({ seriesId: id, hardDelete: true, futureOnly: false });

    return NextResponse.json({ ok: true, mode: 'hard' });
  }

  const { error } = await supabaseServer
    .from('home_schedule_series')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    await retireSeriesOccurrences({ seriesId: id, hardDelete: false, futureOnly: true });
  } catch (retireError) {
    return NextResponse.json(
      { error: retireError instanceof Error ? retireError.message : 'Disattivazione occorrenze non riuscita.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, mode: 'soft' });
}
