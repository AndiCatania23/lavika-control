import { NextResponse } from 'next/server';
import type { Session } from '@/mocks/sessions';
import { supabaseServer } from '@/lib/supabaseServer';
import { mapAuthUserToDevUser, mapUserSessionTelemetryToSession } from '@/lib/devControl/serverData';
import { loadActiveUsers } from '@/lib/metrics/activeTelemetry';
import { reverseGeocodeCoordinates } from '@/lib/telemetry/reverseGeocode';

interface UserSessionRow {
  id: string;
  user_id: string;
  first_seen_at: string;
  last_seen_at: string;
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
  ip_hash: string | null;
}

const BASE_SESSION_SELECT = 'id,user_id,first_seen_at,last_seen_at,platform,device_type,os_name,browser_name,country_code,region_name,city_name,ip_hash';
const EXTENDED_SESSION_SELECT_GEO = `${BASE_SESSION_SELECT},location_source:geo_source,latitude:geo_lat,longitude:geo_lon`;
const EXTENDED_SESSION_SELECT_GEO_ALT = `${BASE_SESSION_SELECT},location_source:geo_source,latitude:geo_lat,longitude:geo_long`;
const EXTENDED_SESSION_SELECT_GEO_SHORT = `${BASE_SESSION_SELECT},location_source:geo_source,latitude:geo_lat,longitude:geo_lo`;
const EXTENDED_SESSION_SELECT_LEGACY = `${BASE_SESSION_SELECT},location_source,latitude,longitude`;

function isGpsSource(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized.includes('gps') || normalized.includes('geolocation');
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Resolve the correct SELECT clause by trying geo column variants. */
let resolvedSelectMode: 'geo' | 'geo_alt' | 'geo_short' | 'legacy' | 'base' | null = null;

function selectClauseForMode(mode: string): string {
  switch (mode) {
    case 'geo': return EXTENDED_SESSION_SELECT_GEO;
    case 'geo_alt': return EXTENDED_SESSION_SELECT_GEO_ALT;
    case 'geo_short': return EXTENDED_SESSION_SELECT_GEO_SHORT;
    case 'legacy': return EXTENDED_SESSION_SELECT_LEGACY;
    default: return BASE_SESSION_SELECT;
  }
}

const SELECT_FALLBACK_ORDER = ['geo', 'geo_alt', 'geo_short', 'legacy', 'base'] as const;

async function querySessionsPage(
  userId: string | null,
  limit: number,
  offset: number,
): Promise<{ rows: UserSessionRow[]; total: number }> {
  const client = supabaseServer;
  if (!client) return { rows: [], total: 0 };

  const buildQuery = (selectClause: string, withCount: boolean) => {
    let query = client
      .from('user_sessions')
      .select(selectClause, withCount ? { count: 'exact' } : undefined)
      .order('last_seen_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (userId) query = query.eq('user_id', userId);
    return query;
  };

  // If we already know which column set works, use it directly
  if (resolvedSelectMode) {
    const { data, error, count } = await buildQuery(selectClauseForMode(resolvedSelectMode), true);
    if (!error && data) {
      return { rows: data as unknown as UserSessionRow[], total: count ?? 0 };
    }
    // Reset if previously working mode now fails
    resolvedSelectMode = null;
  }

  // Try each select variant until one works
  for (const mode of SELECT_FALLBACK_ORDER) {
    const { data, error, count } = await buildQuery(selectClauseForMode(mode), true);
    if (!error && data) {
      resolvedSelectMode = mode;
      return { rows: data as unknown as UserSessionRow[], total: count ?? 0 };
    }
  }

  return { rows: [], total: 0 };
}

async function lookupUserNames(userIds: string[]): Promise<Map<string, { name: string; email: string }>> {
  const client = supabaseServer;
  if (!client || userIds.length === 0) return new Map();

  const map = new Map<string, { name: string; email: string }>();
  const needed = new Set(userIds);
  const perPage = 200;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error || !data) break;

    for (const user of data.users ?? []) {
      if (needed.has(user.id)) {
        const mapped = mapAuthUserToDevUser(user);
        map.set(user.id, { name: mapped.name, email: mapped.email });
      }
    }

    // Stop early if we found everyone
    if (map.size >= needed.size) break;
    if ((data.users ?? []).length < perPage) break;
  }

  return map;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 50, 1), 200);
  const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

  const client = supabaseServer;
  if (!client) {
    return NextResponse.json({ data: [], total: 0 });
  }

  // 1. Paginated query — only fetches the requested slice
  const { rows, total } = await querySessionsPage(userId, limit, offset);

  if (rows.length === 0) {
    return NextResponse.json({ data: [], total });
  }

  // 2. Lookup user names only for the user_ids in this page
  const uniqueUserIds = [...new Set(rows.map(r => r.user_id))];
  const [userInfo, activeUsers] = await Promise.all([
    lookupUserNames(uniqueUserIds),
    loadActiveUsers(7 * 24 * 60),
  ]);

  // Build recent-geo lookup from active telemetry (only for users in this page)
  const neededUsers = new Set(uniqueUserIds);
  const recentGeoByUser = new Map<string, {
    location_source: string | null;
    latitude: number | null;
    longitude: number | null;
    city_name: string | null;
    region_name: string | null;
    country_code: string | null;
  }>();

  for (const item of activeUsers) {
    if (!neededUsers.has(item.user_id)) continue;
    if (!recentGeoByUser.has(item.user_id)) {
      recentGeoByUser.set(item.user_id, {
        location_source: item.location_source,
        latitude: item.latitude,
        longitude: item.longitude,
        city_name: item.city_name,
        region_name: item.region_name,
        country_code: item.country_code,
      });
    }
  }

  // 3. Enrich each row (geocoding limited to this page only)
  const sessions: Session[] = [];

  for (const row of rows) {
    const recentGeo = recentGeoByUser.get(row.user_id);
    const hasRecentGpsSource = isGpsSource(recentGeo?.location_source);
    const hasCoordinates = isFiniteNumber(recentGeo?.latitude) && isFiniteNumber(recentGeo?.longitude);
    const hasRowGpsSource = isGpsSource(row.location_source);

    let rowForView = hasRecentGpsSource || hasCoordinates
      ? {
          ...row,
          location_source: recentGeo?.location_source ?? row.location_source,
          latitude: recentGeo?.latitude ?? row.latitude,
          longitude: recentGeo?.longitude ?? row.longitude,
          city_name: recentGeo?.city_name ?? row.city_name,
          region_name: recentGeo?.region_name ?? row.region_name,
          country_code: recentGeo?.country_code ?? row.country_code,
        }
      : row;

    const canReverseGeocode =
      (hasRowGpsSource || hasRecentGpsSource) &&
      isFiniteNumber(rowForView.latitude) &&
      isFiniteNumber(rowForView.longitude);

    if (canReverseGeocode) {
      const latitude = rowForView.latitude as number;
      const longitude = rowForView.longitude as number;
      const reverseGeo = await reverseGeocodeCoordinates(latitude, longitude);
      if (reverseGeo) {
        rowForView = {
          ...rowForView,
          city_name: reverseGeo.city_name ?? rowForView.city_name,
          region_name: reverseGeo.region_name ?? rowForView.region_name,
          country_code: reverseGeo.country_code ?? rowForView.country_code,
        };
      }
    }

    const info = userInfo.get(row.user_id);
    sessions.push(
      mapUserSessionTelemetryToSession(
        rowForView,
        info?.name ?? row.user_id,
        info?.email ?? '-'
      )
    );
  }

  return NextResponse.json({ data: sessions, total });
}
