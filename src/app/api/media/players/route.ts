import { NextResponse } from 'next/server';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { r2MediaClient, MEDIA_BUCKET_NAME, MEDIA_PUBLIC_BASE_URL } from '@/lib/r2MediaClient';
import { supabaseServer } from '@/lib/supabaseServer';

interface PlayerRow {
  id: string;
  slug: string | null;
  full_name: string;
  position: string | null;
  shirt_number: string | null;
  photo_url: string | null;
  cutout_url: string | null;
  cutout_updated_at: string | null;
  team_id: string | null;
}

interface EnrichedPlayer extends PlayerRow {
  hasCustomCutout: boolean;
  cutoutBucketKey: string | null;
}

/**
 * GET /api/media/players
 *
 * Returns players relevant to Lavika (Catania coaches + anyone whose slug
 * already has a folder in lavika-media/players/). Attaches the detected
 * bucket key for the canonical cutout so the UI can show a preview.
 */
export async function GET() {
  if (!supabaseServer) {
    return NextResponse.json({ players: [] }, { status: 500 });
  }

  // 1. Load all players from DB
  const { data, error } = await supabaseServer
    .from('players')
    .select('id, slug, full_name, position, shirt_number, photo_url, cutout_url, cutout_updated_at, team_id')
    .not('slug', 'is', null)
    .order('position', { ascending: true })
    .order('full_name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message, players: [] }, { status: 500 });
  }

  const players = (data ?? []) as PlayerRow[];

  // 2. Catania team id
  const { data: cataniaTeam } = await supabaseServer
    .from('teams').select('id').eq('normalized_name', 'CATANIA').maybeSingle();
  const cataniaId = cataniaTeam?.id ?? null;

  // 3. Slugs that already have a folder in R2 (indicate active roster)
  const slugsWithFolder = new Set<string>();
  if (r2MediaClient) {
    try {
      let token: string | undefined;
      do {
        const res = await r2MediaClient.send(new ListObjectsV2Command({
          Bucket: MEDIA_BUCKET_NAME,
          Prefix: 'players/',
          ContinuationToken: token,
        }));
        for (const obj of res.Contents ?? []) {
          if (!obj.Key) continue;
          const m = obj.Key.match(/^players\/([^/]+)\//);
          if (m) slugsWithFolder.add(m[1]);
        }
        token = res.IsTruncated ? res.NextContinuationToken : undefined;
      } while (token);
    } catch { /* ignore — we'll return without bucket enrichment */ }
  }

  // 4. Filter the list: keep only players that are either
  //    - part of the Catania team (coaches + any future proper join), or
  //    - have an existing folder in the R2 media bucket (implicit roster).
  const relevant = players.filter(p => {
    if (cataniaId && p.team_id === cataniaId) return true;
    if (p.slug && slugsWithFolder.has(p.slug)) return true;
    return false;
  });

  const enriched: EnrichedPlayer[] = relevant.map(p => {
    const hasCustomCutout = Boolean(p.cutout_url);
    const cutoutBucketKey = p.slug ? `players/${p.slug}/cutout.webp` : null;
    return { ...p, hasCustomCutout, cutoutBucketKey };
  });

  return NextResponse.json({
    players: enriched,
    bucketBaseUrl: MEDIA_PUBLIC_BASE_URL,
    totalInDb: players.length,
    cataniaCount: enriched.length,
  });
}

export async function PATCH(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }
  const body = (await request.json().catch(() => null)) as {
    id?: string; cutout_url?: string | null;
  } | null;
  if (!body?.id) {
    return NextResponse.json({ error: 'id mancante' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if ('cutout_url' in body) {
    updates.cutout_url = body.cutout_url ?? null;
    updates.cutout_updated_at = body.cutout_url ? new Date().toISOString() : null;
  }

  const { data, error } = await supabaseServer
    .from('players')
    .update(updates)
    .eq('id', body.id)
    .select('id, cutout_url, cutout_updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ player: data });
}
