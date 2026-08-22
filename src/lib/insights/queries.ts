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

// Il deliveryId e il tracking dei tap sono diventati affidabili dal riavvio
// del notification worker del 9 agosto 2026. Le consegne precedenti non
// contenevano l'identificativo nel payload e non devono entrare nel KPI.
export const PUSH_OPEN_TRACKING_STARTED_AT = '2026-08-09T11:46:55.751Z';
export const CORE_ANALYTICS_STARTED_AT = '2026-08-22T20:41:06.000Z';

/* =========================================================================
 * HERO KPI (8 valori)
 * ========================================================================= */

export interface HeroKpis {
  totalUsers: number;
  dau: number;
  wau: number;
  mau: number;
  stickinessPct: number | null; // DAU/MAU * 100
  nextDayReturnPct: number | null; // % attivi che tornano il giorno dopo (media 30gg)
  nextDayReturnSample: number; // n. di (giorno,utente) attivi nel calcolo
  sessionMedianMinutes: number | null; // mediana (la media e' distorta da sessioni lunghe)
  sessionSample: number;
  retentionD7Pct: number | null;
  retentionD7Sample: number; // n. utenti nelle coorti mature usate per il calcolo
  pushOptInPct: number | null;
  pushOptedUsers: number;
  pushOpenRatePct: number | null; // % notifiche aperte da quando il tracking e' affidabile
  pushSentSinceTracking: number;
  pushClickedSinceTracking: number;
  appStoreRating: number | null; // nessuna fonte: ASC non espone il rating via API
}

export async function loadHeroKpis(): Promise<HeroKpis> {
  const empty: HeroKpis = {
    totalUsers: 0, dau: 0, wau: 0, mau: 0,
    stickinessPct: null, nextDayReturnPct: null, nextDayReturnSample: 0,
    sessionMedianMinutes: null, sessionSample: 0,
    retentionD7Pct: null, retentionD7Sample: 0,
    pushOptInPct: null, pushOptedUsers: 0,
    pushOpenRatePct: null, pushSentSinceTracking: 0, pushClickedSinceTracking: 0,
    appStoreRating: null,
  };
  if (!supabaseServer) return empty;

  const [
    totalUsersRes,
    windowsRes,
    returnRes,
    pushActiveRes,
    pushSentRes,
    pushClickedRes,
    cohortsRes,
  ] = await Promise.all([
    supabaseServer.from('user_profiles').select('id', { count: 'exact', head: true }),
    // DAU/WAU/MAU come count(DISTINCT) sulle finestre + mediana sessione.
    supabaseServer
      .from('v_insights_kpi_windows')
      .select('dau,wau,mau,session_median_min,session_sample')
      .maybeSingle(),
    // Ritorno entro 24h (next-day return, media 30gg).
    supabaseServer
      .from('v_insights_next_day_return')
      .select('next_day_return_pct,active_user_days')
      .maybeSingle(),
    // Push opt-in = UTENTI distinti con subscription attiva (non righe: chi ha
    // piu' device conterebbe piu' volte). Dedup lato app.
    supabaseServer
      .from('push_subscriptions')
      .select('user_id')
      .eq('is_active', true)
      .not('user_id', 'is', null),
    // Denominatore del KPI: solo consegne realmente tracciabili.
    supabaseServer
      .from('notification_deliveries')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'sent')
      .gte('sent_at', PUSH_OPEN_TRACKING_STARTED_AT),
    // Numeratore sullo stesso identico insieme temporale e di stato.
    supabaseServer
      .from('notification_deliveries')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'sent')
      .gte('sent_at', PUSH_OPEN_TRACKING_STARTED_AT)
      .not('clicked_at', 'is', null),
    // Retention D7 canonica: qualunque core action, solo utenti eleggibili.
    supabaseServer
      .from('v_insights_complete_retention_cohorts')
      .select('cohort_week,d7_eligible,d7_returned')
      .order('cohort_week', { ascending: false })
      .limit(12),
  ]);

  const totalUsers = totalUsersRes.count ?? 0;

  const win = (windowsRes.data as {
    dau: number; wau: number; mau: number;
    session_median_min: number | null; session_sample: number | null;
  } | null) ?? null;
  const dau = win?.dau ?? 0;
  const wau = win?.wau ?? 0;
  const mau = win?.mau ?? 0;
  const sessionMedianMinutes = win?.session_median_min != null ? Number(win.session_median_min) : null;
  const sessionSample = win?.session_sample ?? 0;

  // Stickiness = DAU/MAU.
  const stickinessPct = mau > 0 ? Math.round((dau / mau) * 1000) / 10 : null;

  // Ritorno entro 24h.
  const ret = (returnRes.data as { next_day_return_pct: number | null; active_user_days: number | null } | null) ?? null;
  const nextDayReturnPct = ret?.next_day_return_pct != null ? Number(ret.next_day_return_pct) : null;
  const nextDayReturnSample = ret?.active_user_days ?? 0;

  // Push open-rate.
  const pushSentSinceTracking = pushSentRes.count ?? 0;
  const pushClickedSinceTracking = pushClickedRes.count ?? 0;
  const pushOpenRatePct = pushSentSinceTracking > 0
    ? Math.round((pushClickedSinceTracking / pushSentSinceTracking) * 1000) / 10
    : null;

  // Push opt-in su utenti distinti.
  const pushRows = (pushActiveRes.data as Array<{ user_id: string | null }> | null) ?? [];
  const pushOptedUsers = new Set(pushRows.map((r) => r.user_id).filter(Boolean)).size;
  const pushOptInPct = totalUsers > 0 ? Math.round((pushOptedUsers / totalUsers) * 1000) / 10 : null;

  // Retention D7: solo coorti mature, weighted average.
  const cohorts =
    (cohortsRes.data as Array<{ cohort_week: string; d7_eligible: number; d7_returned: number }> | null) ?? [];
  const cohortTotal = cohorts.reduce((s, c) => s + (c.d7_eligible ?? 0), 0);
  const cohortReturned = cohorts.reduce((s, c) => s + (c.d7_returned ?? 0), 0);
  const retentionD7Pct = cohortTotal > 0 ? Math.round((cohortReturned / cohortTotal) * 1000) / 10 : null;

  return {
    totalUsers,
    dau,
    wau,
    mau,
    stickinessPct,
    nextDayReturnPct,
    nextDayReturnSample,
    sessionMedianMinutes,
    sessionSample,
    retentionD7Pct,
    retentionD7Sample: cohortTotal,
    pushOptInPct,
    pushOptedUsers,
    pushOpenRatePct,
    pushSentSinceTracking,
    pushClickedSinceTracking,
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
  d1Eligible: number;
  d7Eligible: number;
  d30Eligible: number;
}

export async function loadCohorts(weeks = 8): Promise<CohortRow[]> {
  if (!supabaseServer) return [];

  const { data, error } = await supabaseServer
    .from('v_insights_complete_retention_cohorts')
    .select('cohort_week,cohort_size,d1_eligible,d1_returned,d7_eligible,d7_returned,d30_eligible,d30_returned')
    .order('cohort_week', { ascending: false })
    .limit(weeks);

  if (error || !data) return [];

  return (data as Array<{
    cohort_week: string;
    cohort_size: number;
    d1_returned: number;
    d1_eligible: number;
    d7_returned: number;
    d7_eligible: number;
    d30_returned: number;
    d30_eligible: number;
  }>).map((r) => ({
    cohortWeek: r.cohort_week,
    cohortSize: r.cohort_size ?? 0,
    d1Eligible: r.d1_eligible ?? 0,
    d7Eligible: r.d7_eligible ?? 0,
    d30Eligible: r.d30_eligible ?? 0,
    d1Pct: r.d1_eligible > 0 ? Math.round(((r.d1_returned ?? 0) / r.d1_eligible) * 1000) / 10 : null,
    d7Pct: r.d7_eligible > 0 ? Math.round(((r.d7_returned ?? 0) / r.d7_eligible) * 1000) / 10 : null,
    d30Pct: r.d30_eligible > 0 ? Math.round(((r.d30_returned ?? 0) / r.d30_eligible) * 1000) / 10 : null,
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
  firstValue: number;
  d7Eligible: number;
  returnedD7: number;
  onboardedPct: number | null;
  firstValuePct: number | null;
  returnedD7Pct: number | null;
}

export async function loadFunnel(days = 30): Promise<FunnelTotals> {
  if (!supabaseServer) {
    return {
      signups: 0, onboarded: 0, firstValue: 0, d7Eligible: 0, returnedD7: 0,
      onboardedPct: null, firstValuePct: null, returnedD7Pct: null,
    };
  }

  const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data, error } = await supabaseServer
    .from('v_insights_complete_signup_funnel')
    .select('signups,onboarded,first_value,d7_eligible,returned_d7')
    .gte('day', from);

  if (error || !data) {
    return {
      signups: 0, onboarded: 0, firstValue: 0, d7Eligible: 0, returnedD7: 0,
      onboardedPct: null, firstValuePct: null, returnedD7Pct: null,
    };
  }

  const totals = (data as Array<{ signups: number; onboarded: number; first_value: number; d7_eligible: number; returned_d7: number }>)
    .reduce(
      (acc, r) => {
        acc.signups += r.signups ?? 0;
        acc.onboarded += r.onboarded ?? 0;
        acc.firstValue += r.first_value ?? 0;
        acc.d7Eligible += r.d7_eligible ?? 0;
        acc.returnedD7 += r.returned_d7 ?? 0;
        return acc;
      },
      { signups: 0, onboarded: 0, firstValue: 0, d7Eligible: 0, returnedD7: 0 },
    );

  const pct = (num: number, den: number) =>
    den > 0 ? Math.round((num / den) * 1000) / 10 : null;

  return {
    ...totals,
    onboardedPct: pct(totals.onboarded, totals.signups),
    firstValuePct: pct(totals.firstValue, totals.signups),
    returnedD7Pct: pct(totals.returnedD7, totals.d7Eligible),
  };
}

export interface FeatureActivationRow {
  feature: 'pill' | 'video' | 'match' | 'prediction';
  activatedUsers: number;
  d1Eligible: number;
  d1Returned: number;
  d7Eligible: number;
  d7Returned: number;
  d1Pct: number | null;
  d7Pct: number | null;
  signupUsers: number;
  activationPct: number | null;
}

export async function loadActivationByFeature(): Promise<FeatureActivationRow[]> {
  if (!supabaseServer) return [];
  const { data, error } = await supabaseServer
    .from('v_insights_complete_activation_by_feature')
    .select('feature,feature_order,signup_users,activated_users,d1_eligible,d1_returned,d7_eligible,d7_returned')
    .order('feature_order', { ascending: true });
  if (error || !data) return [];

  const pct = (num: number, den: number) =>
    den > 0 ? Math.round((num / den) * 1000) / 10 : null;

  return (data as Array<{
    feature: FeatureActivationRow['feature'];
    signup_users: number;
    activated_users: number;
    d1_eligible: number;
    d1_returned: number;
    d7_eligible: number;
    d7_returned: number;
  }>).map((row) => ({
    feature: row.feature,
    signupUsers: row.signup_users ?? 0,
    activatedUsers: row.activated_users ?? 0,
    d1Eligible: row.d1_eligible ?? 0,
    d1Returned: row.d1_returned ?? 0,
    d7Eligible: row.d7_eligible ?? 0,
    d7Returned: row.d7_returned ?? 0,
    d1Pct: pct(row.d1_returned ?? 0, row.d1_eligible ?? 0),
    d7Pct: pct(row.d7_returned ?? 0, row.d7_eligible ?? 0),
    activationPct: pct(row.activated_users ?? 0, row.signup_users ?? 0),
  }));
}

export type CoreFeature = 'pill' | 'match' | 'video' | 'prediction';
export type CoreUsageWindow = '24h' | '7d' | '30d';

export interface CoreUsageRow {
  window: CoreUsageWindow;
  feature: CoreFeature;
  uniqueUsers: number;
  actions: number;
  effectiveFrom: string;
}

export interface CoreUsageDay {
  day: string;
  pillUsers: number;
  pillActions: number;
  matchUsers: number;
  matchActions: number;
  videoUsers: number;
  videoActions: number;
  predictionUsers: number;
  predictionActions: number;
}

export async function loadCoreUsage(): Promise<CoreUsageRow[]> {
  if (!supabaseServer) return [];
  const { data, error } = await supabaseServer
    .from('v_insights_core_usage_windows')
    .select('window_key,feature,unique_users,actions,effective_from')
    .order('window_order', { ascending: true })
    .order('feature_order', { ascending: true });
  if (error || !data) return [];
  return (data as Array<{
    window_key: CoreUsageWindow;
    feature: CoreFeature;
    unique_users: number;
    actions: number;
    effective_from: string;
  }>).map((row) => ({
    window: row.window_key,
    feature: row.feature,
    uniqueUsers: row.unique_users ?? 0,
    actions: row.actions ?? 0,
    effectiveFrom: row.effective_from,
  }));
}

export async function loadCoreUsageDaily(): Promise<CoreUsageDay[]> {
  if (!supabaseServer) return [];
  const { data, error } = await supabaseServer
    .from('v_insights_core_usage_daily')
    .select('day,feature,unique_users,actions')
    .order('day', { ascending: true });
  if (error || !data) return [];

  const days = new Map<string, CoreUsageDay>();
  for (const row of data as Array<{ day: string; feature: CoreFeature; unique_users: number; actions: number }>) {
    const current = days.get(row.day) ?? {
      day: row.day,
      pillUsers: 0, pillActions: 0,
      matchUsers: 0, matchActions: 0,
      videoUsers: 0, videoActions: 0,
      predictionUsers: 0, predictionActions: 0,
    };
    const prefix = row.feature;
    if (prefix === 'pill') { current.pillUsers = row.unique_users ?? 0; current.pillActions = row.actions ?? 0; }
    if (prefix === 'match') { current.matchUsers = row.unique_users ?? 0; current.matchActions = row.actions ?? 0; }
    if (prefix === 'video') { current.videoUsers = row.unique_users ?? 0; current.videoActions = row.actions ?? 0; }
    if (prefix === 'prediction') { current.predictionUsers = row.unique_users ?? 0; current.predictionActions = row.actions ?? 0; }
    days.set(row.day, current);
  }
  return Array.from(days.values());
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

  // user_sessions: os_name + country_code (geo IP). Prendiamo le 5000 righe
  // PIU' RECENTI (order desc + limit): senza l'order il limit prenderebbe un
  // sottoinsieme arbitrario, non "le ultime" come dichiara la UI.
  const { data, error } = await supabaseServer
    .from('user_sessions')
    .select('os_name,country_code,user_id,device_id')
    .gte('first_seen_at', from)
    .order('first_seen_at', { ascending: false })
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
