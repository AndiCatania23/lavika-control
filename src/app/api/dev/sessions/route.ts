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

async function listUserNameById(): Promise<Map<string, { name: string; email: string }>> {
  const client = supabaseServer;
  if (!client) return new Map();

  const map = new Map<string, { name: string; email: string }>();
  const perPage = 200;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error || !data) break;

    for (const user of data.users ?? []) {
      const mapped = mapAuthUserToDevUser(user);
      map.set(user.id, { name: mapped.name, email: mapped.email });
    }

    if ((data.users ?? []).length < perPage) break;
  }

  return map;
}

async function listSessionsFromUserSessions(userId?: string | null): Promise<Session[]> {
  const client = supabaseServer;
  if (!client) return [];

  const userInfo = await listUserNameById();
  const sessions: Session[] = [];
  const pageSize = 1000;
  let selectMode: 'geo' | 'geo_alt' | 'geo_short' | 'legacy' | 'base' = 'geo';
  const recentGeoByUser = new Map<string, {
    location_source: string | null;
    latitude: number | null;
    longitude: number | null;
    city_name: string | null;
    region_name: string | null;
    country_code: string | null;
  }>();

  const activeUsers = await loadActiveUsers(7 * 24 * 60);
  for (const item of activeUsers) {
    if (userId && item.user_id !== userId) continue;
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

  for (let page = 0; page < 50; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const buildQuery = (selectClause: string) => {
      let query = client
        .from('user_sessions')
        .select(selectClause)
        .order('last_seen_at', { ascending: false })
        .range(from, to);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      return query;
    };

    let { data, error } = await buildQuery(
      selectMode === 'geo'
        ? EXTENDED_SESSION_SELECT_GEO
        : selectMode === 'geo_alt'
        ? EXTENDED_SESSION_SELECT_GEO_ALT
        : selectMode === 'geo_short'
        ? EXTENDED_SESSION_SELECT_GEO_SHORT
        : selectMode === 'legacy'
        ? EXTENDED_SESSION_SELECT_LEGACY
        : BASE_SESSION_SELECT
    );

    if (error && selectMode === 'geo') {
      selectMode = 'geo_alt';
      ({ data, error } = await buildQuery(EXTENDED_SESSION_SELECT_GEO_ALT));
    }

    if (error && selectMode === 'geo_alt') {
      selectMode = 'geo_short';
      ({ data, error } = await buildQuery(EXTENDED_SESSION_SELECT_GEO_SHORT));
    }

    if (error && selectMode === 'geo_short') {
      selectMode = 'legacy';
      ({ data, error } = await buildQuery(EXTENDED_SESSION_SELECT_LEGACY));
    }

    if (error && selectMode === 'legacy') {
      selectMode = 'base';
      ({ data, error } = await buildQuery(BASE_SESSION_SELECT));
    }

    if (error || !data || data.length === 0) break;

    for (const row of data as unknown as UserSessionRow[]) {
      const recentGeo = recentGeoByUser.get(row.user_id);
      const hasRowGpsSource = isGpsSource(row.location_source);
      const hasRecentGpsSource = isGpsSource(recentGeo?.location_source);
      const hasCoordinates = isFiniteNumber(recentGeo?.latitude) && isFiniteNumber(recentGeo?.longitude);

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

    if (data.length < pageSize) break;
  }

  return sessions;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  const allSessions = await listSessionsFromUserSessions(userId);
  return NextResponse.json(allSessions);
}
