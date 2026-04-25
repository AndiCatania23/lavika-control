import { supabaseServer } from '@/lib/supabaseServer';

interface ContentEventTelemetryRow {
  user_id: string | null;
  occurred_at: string;
  metadata: Record<string, unknown> | null;
}

export interface ActiveUserSession {
  user_id: string;
  last_seen_at: string;
  last_path: string | null;
  platform: string | null;
  device_type: string | null;
  os_name: string | null;
  browser_name: string | null;
  location_source: string | null;
  latitude: number | null;
  longitude: number | null;
  country_code: string | null;
  region_name: string | null;
  city_name: string | null;
  timezone: string | null;
}

function readText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readMetadataText(metadata: Record<string, unknown> | null, keys: string[]): string | null {
  if (!metadata) return null;

  for (const key of keys) {
    const direct = readText(metadata[key]);
    if (direct) return direct;
  }

  const nestedCandidates = [metadata.device, metadata.client, metadata.context, metadata.geo, metadata.location];
  for (const nestedCandidate of nestedCandidates) {
    const nestedObject = nestedCandidate as Record<string, unknown> | undefined;
    if (!nestedObject) continue;
    for (const key of keys) {
      const nested = readText(nestedObject[key]);
      if (nested) return nested;
    }
  }

  return null;
}

function readMetadataNumber(metadata: Record<string, unknown> | null, keys: string[]): number | null {
  if (!metadata) return null;

  for (const key of keys) {
    const value = metadata[key];
    const parsed = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  const nestedCandidates = [metadata.device, metadata.client, metadata.context, metadata.geo, metadata.location];
  for (const nestedCandidate of nestedCandidates) {
    const nestedObject = nestedCandidate as Record<string, unknown> | undefined;
    if (!nestedObject) continue;
    for (const key of keys) {
      const value = nestedObject[key];
      const parsed = typeof value === 'number' ? value : Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

function mapRowToActiveUser(row: ContentEventTelemetryRow): ActiveUserSession | null {
  if (!row.user_id) return null;
  const metadata = row.metadata ?? null;

  return {
    user_id: row.user_id,
    last_seen_at: row.occurred_at,
    last_path: readMetadataText(metadata, ['last_path', 'path', 'route', 'screen', 'pathname']),
    platform: readMetadataText(metadata, ['platform', 'client_platform', 'surface']),
    device_type: readMetadataText(metadata, ['device_type', 'deviceType', 'type']),
    os_name: readMetadataText(metadata, ['os_name', 'osName', 'os']),
    browser_name: readMetadataText(metadata, ['browser_name', 'browserName', 'browser']),
    location_source: readMetadataText(metadata, ['location_source', 'locationSource', 'geo_source']),
    latitude: readMetadataNumber(metadata, ['latitude', 'lat', 'geo_lat']),
    longitude: readMetadataNumber(metadata, ['longitude', 'lng', 'lon', 'geo_lng']),
    country_code: readMetadataText(metadata, ['country_code', 'countryCode', 'country']),
    region_name: readMetadataText(metadata, ['region_name', 'regionName', 'region']),
    city_name: readMetadataText(metadata, ['city_name', 'cityName', 'city']),
    timezone: readMetadataText(metadata, ['timezone', 'tz', 'time_zone']),
  };
}

export function normalizeWindowMinutes(value: string | null, fallback = 5): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(7 * 24 * 60, Math.round(parsed)));
}

export async function loadActiveUsers(windowMinutes: number): Promise<ActiveUserSession[]> {
  if (!supabaseServer) return [];

  // Aggregato lato DB via RPC: ritorna 1 riga per utente attivo (latest event)
  // invece di scaricare tutti i view_start. Riduce egress da MB a KB.
  const { data, error } = await supabaseServer.rpc('active_users_recent', {
    window_minutes: windowMinutes,
  });

  if (error || !data) {
    console.error('Error loading active_users_recent:', error);
    return [];
  }

  const sessions: ActiveUserSession[] = [];
  for (const row of data as ContentEventTelemetryRow[]) {
    const mapped = mapRowToActiveUser({
      user_id: row.user_id,
      occurred_at: (row as unknown as { last_seen_at: string }).last_seen_at,
      metadata: row.metadata,
    });
    if (mapped) sessions.push(mapped);
  }

  return sessions.sort(
    (a, b) => new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime()
  );
}
