/**
 * GET /api/console/feature-flags
 *
 * Espone i feature flag UI letti da sync_config. Cache short (10s) lato server
 * per evitare query inutili a Supabase a ogni page load del Control.
 *
 * Output: { enable_format_wizard: { enabled: boolean }, ... }
 *
 * Nuovi flag: aggiungere la chiave nell'array READ_KEYS qui sotto +
 * inserire la riga in sync_config via SQL admin.
 */
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

const READ_KEYS = [
  'enable_format_wizard',
];

let cache: { fetchedAt: number; flags: Record<string, unknown> } | null = null;
const CACHE_TTL_MS = 10 * 1000;

export async function GET() {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 503 });
  }

  const now = Date.now();
  if (cache && (now - cache.fetchedAt) < CACHE_TTL_MS) {
    return NextResponse.json(cache.flags);
  }

  const { data, error } = await supabaseServer
    .from('sync_config')
    .select('key, value')
    .in('key', READ_KEYS);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const flags: Record<string, unknown> = {};
  for (const k of READ_KEYS) {
    flags[k] = { enabled: false };
  }
  for (const row of data ?? []) {
    flags[row.key as string] = row.value;
  }

  cache = { fetchedAt: now, flags };
  return NextResponse.json(flags);
}
