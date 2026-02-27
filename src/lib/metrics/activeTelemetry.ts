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

  const cutoffIso = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const pageSize = 1000;
  const maxPages = 50;
  const latestByUser = new Map<string, ActiveUserSession>();

  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await supabaseServer
      .from('content_events')
      .select('user_id,occurred_at,metadata')
      .eq('event_name', 'view_start')
      .not('user_id', 'is', null)
      .gte('occurred_at', cutoffIso)
      .order('occurred_at', { ascending: false })
      .range(from, to);

    if (error || !data || data.length === 0) break;

    for (const row of data as ContentEventTelemetryRow[]) {
      const mapped = mapRowToActiveUser(row);
      if (!mapped) continue;
      if (!latestByUser.has(mapped.user_id)) {
        latestByUser.set(mapped.user_id, mapped);
      }
    }

    if (data.length < pageSize) break;
  }

  return Array.from(latestByUser.values()).sort(
    (a, b) => new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime()
  );
}
