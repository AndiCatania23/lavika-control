import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET() {
  if (!supabaseServer) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  const [published, pending, conflicts, runs] = await Promise.all([
    supabaseServer.from('published_player_roster')
      .select('id, full_name, position, resolved_shirt_number, shirt_number_verification_status, membership_status, roster_last_seen_at')
      .order('resolved_shirt_number', { ascending: true, nullsFirst: false }),
    supabaseServer.from('player_team_memberships')
      .select('player_id, membership_status, last_seen_at, consecutive_misses, players!player_id(full_name, position, api_football_player_id)')
      .eq('is_current', true)
      .eq('is_published', false)
      .order('last_seen_at', { ascending: false }),
    supabaseServer.from('player_source_assertions')
      .select('id, player_id, proposed_value, review_note, observed_at, players!player_id(full_name), player_data_sources!source_id(provider, source_reference)')
      .eq('assertion_status', 'conflict')
      .order('observed_at', { ascending: false }),
    supabaseServer.from('roster_sync_runs')
      .select('id, provider, status, observed_players, published_players, anomaly_count, diagnostics, started_at, completed_at')
      .order('started_at', { ascending: false })
      .limit(10),
  ]);

  const error = published.error ?? pending.error ?? conflicts.error ?? runs.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    published: published.data ?? [],
    pending: pending.data ?? [],
    conflicts: conflicts.data ?? [],
    runs: runs.data ?? [],
  });
}

export async function PATCH(request: Request) {
  if (!supabaseServer) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  const body = await request.json().catch(() => null) as {
    action?: 'verify_number' | 'publish_membership' | 'reject_membership';
    playerId?: string;
    shirtNumber?: number;
    sourceReference?: string;
  } | null;
  if (!body?.action || !body.playerId) return NextResponse.json({ error: 'Payload non valido' }, { status: 400 });

  const [{ data: team }, { data: season }] = await Promise.all([
    supabaseServer.from('teams').select('id').eq('normalized_name', 'CATANIA').single(),
    supabaseServer.from('competition_seasons').select('id').eq('season_label', '2026/2027').order('start_date', { ascending: false }).limit(1).single(),
  ]);
  if (!team || !season) return NextResponse.json({ error: 'Contesto roster non disponibile' }, { status: 500 });

  if (body.action === 'publish_membership' || body.action === 'reject_membership') {
    const accepted = body.action === 'publish_membership';
    const officialReference = body.sourceReference?.trim() ?? '';
    if (accepted && !officialReference.startsWith('https://')) {
      return NextResponse.json({ error: 'Per pubblicare serve una fonte ufficiale HTTPS' }, { status: 400 });
    }
    let verifiedSourceId: string | null = null;
    if (accepted) {
      const payloadHash = createHash('sha256').update(`${body.playerId}:membership:${officialReference}`).digest('hex');
      const { data: source, error: sourceError } = await supabaseServer.from('player_data_sources').upsert({
        provider: 'lavika-editorial', source_type: 'membership_verification', source_reference: officialReference,
        payload_hash: payloadHash, raw_payload: { player_id: body.playerId, membership: 'confirmed' },
        metadata: { verified_in: 'LAVIKA Control' },
      }, { onConflict: 'provider,source_reference,payload_hash' }).select('id').single();
      if (sourceError || !source) return NextResponse.json({ error: sourceError?.message ?? 'Fonte non salvata' }, { status: 400 });
      verifiedSourceId = source.id;
    }
    const { error } = await supabaseServer.from('player_team_memberships').update({
      membership_status: accepted ? 'confirmed' : 'unknown',
      is_published: accepted,
      is_current: accepted,
      verified_source_id: verifiedSourceId,
      updated_at: new Date().toISOString(),
      metadata: { editorial_review: accepted ? 'approved' : 'rejected' },
    }).eq('player_id', body.playerId).eq('team_id', team.id).eq('competition_season_id', season.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const number = Number(body.shirtNumber);
  const sourceReference = body.sourceReference?.trim() ?? '';
  if (!Number.isInteger(number) || number < 1 || number > 999 || !sourceReference.startsWith('https://')) {
    return NextResponse.json({ error: 'Numero o fonte ufficiale non validi' }, { status: 400 });
  }
  const payloadHash = createHash('sha256').update(`${body.playerId}:${number}:${sourceReference}`).digest('hex');
  const { data: source, error: sourceError } = await supabaseServer.from('player_data_sources').upsert({
    provider: 'lavika-editorial', source_type: 'manual_verification', source_reference: sourceReference,
    payload_hash: payloadHash, raw_payload: { player_id: body.playerId, shirt_number: number },
    metadata: { verified_in: 'LAVIKA Control' },
  }, { onConflict: 'provider,source_reference,payload_hash' }).select('id').single();
  if (sourceError || !source) return NextResponse.json({ error: sourceError?.message ?? 'Fonte non salvata' }, { status: 400 });

  const results = await Promise.all([
    supabaseServer.from('player_squad_numbers').upsert({
      player_id: body.playerId, team_id: team.id, competition_season_id: season.id,
      shirt_number: number, verification_status: 'verified', authority_rank: 100,
      source_id: source.id, is_current: true, updated_at: new Date().toISOString(),
    }, { onConflict: 'player_id,team_id,competition_season_id,source_id' }),
    supabaseServer.from('player_editorial_overrides').upsert({
      player_id: body.playerId, team_id: team.id, competition_season_id: season.id,
      field_name: 'shirt_number', override_value: number, reason: 'Verifica editoriale da fonte ufficiale',
      source_reference: sourceReference, is_active: true, locked_against_sync: true, updated_at: new Date().toISOString(),
    }, { onConflict: 'player_id,team_id,competition_season_id,field_name' }),
    supabaseServer.from('players').update({ shirt_number: String(number), updated_at: new Date().toISOString() }).eq('id', body.playerId),
    supabaseServer.from('player_team_memberships').update({
      membership_status: 'confirmed', is_current: true, is_published: true,
      verified_source_id: source.id, updated_at: new Date().toISOString(),
    }).eq('player_id', body.playerId).eq('team_id', team.id).eq('competition_season_id', season.id),
  ]);
  const writeError = results.find((result) => result.error)?.error;
  if (writeError) return NextResponse.json({ error: writeError.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
