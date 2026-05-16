/**
 * Insights data loaders.
 *
 * Tutti questi loader sono server-side e ritornano shape stabili indipendenti
 * dalla forma raw Supabase, cosi' i componenti UI hanno tipi semplici.
 *
 * Schema reference (vedi migrations 20260516_001..004):
 *   - v_insights_active_users_daily(day, dau_registered, dau_guest, dau_total)
 *   - v_insights_retention_cohorts(cohort_week, cohort_size, d1_returned, d7_returned, d30_returned)
 *   - v_insights_signup_funnel(day, signups, onboarded, first_play, returned_d7)
 *   - v_insights_guest_vs_registered(window, registered_users, guest_devices, view_starts)
 *   - apple_app_metrics(metric_date, app_id, region, downloads, sessions, active_devices, ...)
 *   - user_profiles, user_sessions, push_subscriptions, content_events
 */

import { supabaseServer } from '@/lib/supabaseServer';

const LAVIKA_APP_ID = '6762273646';

/* =========================================================================
 * HERO KPI (8 valori)
 * ========================================================================= */

export interface HeroKpis {
  totalUsers: number;
  dau: number;
  wau: number;
  mau: number;
  avgSessionMinutes: number | null;
  retentionD7Pct: number | null;
  pushOptInPct: number | null;
  appStoreRating: number | null; // placeholder, ASC non lo espone direttamente
}

export async function loadHeroKpis(): Promise<HeroKpis> {
  if (!supabaseServer) {
    return {
      totalUsers: 0, dau: 0, wau: 0, mau: 0,
      avgSessionMinutes: null, retentionD7Pct: null, pushOptInPct: null, appStoreRating: null,
    };
  }

  const today = new Date();
  const isoDay = today.toISOString().slice(0, 10);
  const thirtyAgo = new Date(today.getTime() - 30 * 86400000).toISOString().slice(0, 10);

  const [
    totalUsersRes,
    dauSeriesRes,
    pushOptedRes,
    pushTotalRes,
    cohortsRes,
  ] = await Promise.all([
    supabaseServer.from('user_profiles').select('id', { count: 'exact', head: true }),
    // 30gg di DAU per calcolare WAU/MAU lato app sommando le ultime 7/30 righe.
    supabaseServer
      .from('v_insights_active_users_daily')
      .select('day,dau_total')
      .gte('day', thirtyAgo)
      .lte('day', isoDay)
      .order('day', { ascending: false }),
    supabaseServer
      .from('push_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),
    supabaseServer.from('user_profiles').select('id', { count: 'exact', head: true }),
    // Retention D7 = media delle ultime 4 coorti settimanali (per avere
    // un campione decente con N=39 utenti totali). Niente filtro per data:
    // le coorti recenti potrebbero essere troppo giovani per D7 ma il
    // weighted average sotto le ignora se cohort_size=0.
    supabaseServer
      .from('v_insights_retention_cohorts')
      .select('cohort_size,d7_returned')
      .order('cohort_week', { ascending: false })
      .limit(4),
  ]);

  const totalUsers = totalUsersRes.count ?? 0;

  const dauRows = (dauSeriesRes.data as Array<{ day: string; dau_total: number }> | null) ?? [];
  const dau = dauRows.find((r) => r.day === isoDay)?.dau_total ?? dauRows[0]?.dau_total ?? 0;
  const wau = dauRows.slice(0, 7).reduce((s, r) => s + (r.dau_total ?? 0), 0);
  const mau = dauRows.slice(0, 30).reduce((s, r) => s + (r.dau_total ?? 0), 0);

  const cohorts =
    (cohortsRes.data as Array<{ cohort_size: number; d7_returned: number }> | null) ?? [];
  const cohortTotal = cohorts.reduce((s, c) => s + (c.cohort_size ?? 0), 0);
  const cohortReturned = cohorts.reduce((s, c) => s + (c.d7_returned ?? 0), 0);
  const retentionD7Pct = cohortTotal > 0 ? Math.round((cohortReturned / cohortTotal) * 1000) / 10 : null;

  const pushOpted = pushOptedRes.count ?? 0;
  const pushTotal = pushTotalRes.count ?? 0;
  const pushOptInPct = pushTotal > 0 ? Math.round((pushOpted / pushTotal) * 1000) / 10 : null;

  return {
    totalUsers,
    dau,
    wau,
    mau,
    avgSessionMinutes: null, // TODO: derivare da user_sessions duration quando schema completo
    retentionD7Pct,
    pushOptInPct,
    appStoreRating: null,
  };
}

/* =========================================================================
 * DAU TIME SERIES (30 giorni)
 * ========================================================================= */

export interface DauPoint {
  day: string;            // YYYY-MM-DD
  registered: number;
  guest: number;
  total: number;
}

export async function loadDauSeries(days = 30): Promise<DauPoint[]> {
  if (!supabaseServer) return [];

  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data, error } = await supabaseServer
    .from('v_insights_active_users_daily')
    .select('day,dau_registered,dau_guest,dau_total')
    .gte('day', from)
    .order('day', { ascending: true });

  if (error || !data) return [];
  return (data as Array<{ day: string; dau_registered: number; dau_guest: number; dau_total: number }>).map((r) => ({
    day: r.day,
    registered: r.dau_registered ?? 0,
    guest: r.dau_guest ?? 0,
    total: r.dau_total ?? 0,
  }));
}

/* =========================================================================
 * RETENTION COHORTS (8 settimane)
 * ========================================================================= */

export interface CohortRow {
  cohortWeek: string;
  cohortSize: number;
  d1Pct: number | null;
  d7Pct: number | null;
  d30Pct: number | null;
}

export async function loadCohorts(weeks = 8): Promise<CohortRow[]> {
  if (!supabaseServer) return [];

  const { data, error } = await supabaseServer
    .from('v_insights_retention_cohorts')
    .select('cohort_week,cohort_size,d1_returned,d7_returned,d30_returned')
    .order('cohort_week', { ascending: false })
    .limit(weeks);

  if (error || !data) return [];

  return (data as Array<{
    cohort_week: string;
    cohort_size: number;
    d1_returned: number;
    d7_returned: number;
    d30_returned: number;
  }>).map((r) => ({
    cohortWeek: r.cohort_week,
    cohortSize: r.cohort_size ?? 0,
    d1Pct: r.cohort_size > 0 ? Math.round(((r.d1_returned ?? 0) / r.cohort_size) * 1000) / 10 : null,
    d7Pct: r.cohort_size > 0 ? Math.round(((r.d7_returned ?? 0) / r.cohort_size) * 1000) / 10 : null,
    d30Pct: r.cohort_size > 0 ? Math.round(((r.d30_returned ?? 0) / r.cohort_size) * 1000) / 10 : null,
  }));
}

/* =========================================================================
 * GUEST VS REGISTERED (24h / 7d / 30d)
 * ========================================================================= */

export interface GuestVsRegRow {
  window: '24h' | '7d' | '30d';
  registered: number;
  guests: number;
  viewStarts: number;
}

export async function loadGuestVsReg(): Promise<GuestVsRegRow[]> {
  if (!supabaseServer) return [];

  const { data, error } = await supabaseServer
    .from('v_insights_guest_vs_registered')
    .select('window,registered_users,guest_devices,view_starts');

  if (error || !data) return [];

  const order = { '24h': 0, '7d': 1, '30d': 2 } as Record<string, number>;
  return (data as Array<{ window: string; registered_users: number; guest_devices: number; view_starts: number }>)
    .map((r) => ({
      window: r.window as GuestVsRegRow['window'],
      registered: r.registered_users ?? 0,
      guests: r.guest_devices ?? 0,
      viewStarts: r.view_starts ?? 0,
    }))
    .sort((a, b) => (order[a.window] ?? 99) - (order[b.window] ?? 99));
}

/* =========================================================================
 * SIGNUP FUNNEL (ultimi 30 giorni)
 * ========================================================================= */

export interface FunnelTotals {
  signups: number;
  onboarded: number;
  firstPlay: number;
  returnedD7: number;
  onboardedPct: number | null;
  firstPlayPct: number | null;
  returnedD7Pct: number | null;
}

export async function loadFunnel(days = 30): Promise<FunnelTotals> {
  if (!supabaseServer) {
    return {
      signups: 0, onboarded: 0, firstPlay: 0, returnedD7: 0,
      onboardedPct: null, firstPlayPct: null, returnedD7Pct: null,
    };
  }

  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data, error } = await supabaseServer
    .from('v_insights_signup_funnel')
    .select('signups,onboarded,first_play,returned_d7')
    .gte('day', from);

  if (error || !data) {
    return {
      signups: 0, onboarded: 0, firstPlay: 0, returnedD7: 0,
      onboardedPct: null, firstPlayPct: null, returnedD7Pct: null,
    };
  }

  const totals = (data as Array<{ signups: number; onboarded: number; first_play: number; returned_d7: number }>)
    .reduce(
      (acc, r) => {
        acc.signups += r.signups ?? 0;
        acc.onboarded += r.onboarded ?? 0;
        acc.firstPlay += r.first_play ?? 0;
        acc.returnedD7 += r.returned_d7 ?? 0;
        return acc;
      },
      { signups: 0, onboarded: 0, firstPlay: 0, returnedD7: 0 },
    );

  const pct = (num: number, den: number) =>
    den > 0 ? Math.round((num / den) * 1000) / 10 : null;

  return {
    ...totals,
    onboardedPct: pct(totals.onboarded, totals.signups),
    firstPlayPct: pct(totals.firstPlay, totals.signups),
    returnedD7Pct: pct(totals.returnedD7, totals.signups),
  };
}

/* =========================================================================
 * APPLE APP STORE METRICS
 * ========================================================================= */

export interface AppleMetricsSnapshot {
  latest: {
    metricDate: string | null;
    downloads: number;
    sessions: number;
    activeDevices: number;
    crashes: number;
    crashFreeRate: number | null;
    topCountries: Array<{ country: string; downloads: number }>;
  };
  series: Array<{ day: string; downloads: number; sessions: number; activeDevices: number }>;
  totals30d: {
    downloads: number;
    installs: number;
    sessions: number;
  };
}

interface AppleRow {
  metric_date: string;
  downloads: number | null;
  first_time_downloads: number | null;
  installs: number | null;
  sessions: number | null;
  active_devices: number | null;
  crashes: number | null;
  crash_free_rate: number | null;
  breakdown: { topCountries?: Array<{ country: string; downloads: number }> } | null;
}

export async function loadAppleMetrics(days = 30): Promise<AppleMetricsSnapshot> {
  const empty: AppleMetricsSnapshot = {
    latest: {
      metricDate: null, downloads: 0, sessions: 0, activeDevices: 0,
      crashes: 0, crashFreeRate: null, topCountries: [],
    },
    series: [],
    totals30d: { downloads: 0, installs: 0, sessions: 0 },
  };

  if (!supabaseServer) return empty;

  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data, error } = await supabaseServer
    .from('apple_app_metrics')
    .select('metric_date,downloads,first_time_downloads,installs,sessions,active_devices,crashes,crash_free_rate,breakdown')
    .eq('app_id', LAVIKA_APP_ID)
    .eq('region', 'WORLD')
    .gte('metric_date', from)
    .order('metric_date', { ascending: true });

  if (error || !data || data.length === 0) return empty;

  const rows = data as AppleRow[];
  const last = rows[rows.length - 1];

  return {
    latest: {
      metricDate: last.metric_date,
      downloads: last.downloads ?? 0,
      sessions: last.sessions ?? 0,
      activeDevices: last.active_devices ?? 0,
      crashes: last.crashes ?? 0,
      crashFreeRate: last.crash_free_rate != null ? Number(last.crash_free_rate) : null,
      topCountries: (last.breakdown?.topCountries ?? []).slice(0, 5),
    },
    series: rows.map((r) => ({
      day: r.metric_date,
      downloads: r.downloads ?? 0,
      sessions: r.sessions ?? 0,
      activeDevices: r.active_devices ?? 0,
    })),
    totals30d: rows.reduce(
      (acc, r) => {
        acc.downloads += r.downloads ?? 0;
        acc.installs += r.first_time_downloads ?? r.installs ?? 0;
        acc.sessions += r.sessions ?? 0;
        return acc;
      },
      { downloads: 0, installs: 0, sessions: 0 },
    ),
  };
}

/* =========================================================================
 * DEVICE / GEO BREAKDOWN (da user_sessions)
 * ========================================================================= */

export interface DeviceGeoBreakdown {
  topOs: Array<{ label: string; users: number }>;
  topCountries: Array<{ label: string; users: number }>;
}

export async function loadDeviceGeo(days = 30): Promise<DeviceGeoBreakdown> {
  const empty: DeviceGeoBreakdown = { topOs: [], topCountries: [] };
  if (!supabaseServer) return empty;

  const from = new Date(Date.now() - days * 86400000).toISOString();

  // user_sessions: os_name + country_code (geo IP). Limitiamo a 5000 righe
  // recenti per evitare full table scan.
  const { data, error } = await supabaseServer
    .from('user_sessions')
    .select('os_name,country_code,user_id,device_id')
    .gte('first_seen_at', from)
    .limit(5000);

  if (error || !data) return empty;

  const osMap = new Map<string, Set<string>>();
  const countryMap = new Map<string, Set<string>>();

  for (const row of data as Array<{
    os_name: string | null;
    country_code: string | null;
    user_id: string | null;
    device_id: string | null;
  }>) {
    const key = row.user_id || row.device_id || '';
    if (!key) continue;

    const os = row.os_name || 'unknown';
    if (!osMap.has(os)) osMap.set(os, new Set());
    osMap.get(os)!.add(key);

    const country = row.country_code || 'unknown';
    if (!countryMap.has(country)) countryMap.set(country, new Set());
    countryMap.get(country)!.add(key);
  }

  const toSorted = (m: Map<string, Set<string>>) =>
    Array.from(m.entries())
      .map(([label, users]) => ({ label, users: users.size }))
      .sort((a, b) => b.users - a.users)
      .slice(0, 10);

  return {
    topOs: toSorted(osMap),
    topCountries: toSorted(countryMap),
  };
}
