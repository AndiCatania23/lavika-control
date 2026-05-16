/**
 * /insights — User & Engagement Insights
 *
 * Dashboard server-rendered con ISR 300s (pattern di /social/insights).
 * Carica in parallelo 7 loader e renderizza una sezione per ognuno.
 *
 * Schema sources (vedi migrations 20260516_001..004):
 *   - v_insights_active_users_daily (DAU/WAU/MAU)
 *   - v_insights_retention_cohorts (D1/D7/D30)
 *   - v_insights_signup_funnel (signups→onboarded→first_play→returned_d7)
 *   - v_insights_guest_vs_registered (24h/7d/30d)
 *   - apple_app_metrics (ASC: downloads, sessions, crashes)
 *   - user_sessions (device/geo breakdown)
 *   - user_profiles + push_subscriptions (totali + opt-in)
 */

import {
  loadHeroKpis,
  loadDauSeries,
  loadCohorts,
  loadGuestVsReg,
  loadFunnel,
  loadAppleMetrics,
  loadDeviceGeo,
} from '@/lib/insights/queries';
import { HeroKpiGrid } from './components/HeroKpiGrid';
import { AppleAppStoreSection } from './components/AppleAppStoreSection';
import { DauTimeSeries } from './components/DauTimeSeries';
import { RetentionCohortTable } from './components/RetentionCohortTable';
import { GuestVsRegistered } from './components/GuestVsRegistered';
import { SignupFunnel } from './components/SignupFunnel';
import { DeviceGeoBreakdown } from './components/DeviceGeoBreakdown';
import { InsightSection } from './components/InsightSection';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

export default async function InsightsPage() {
  const [
    hero,
    dauSeries,
    cohorts,
    guestVsReg,
    funnel,
    appleMetrics,
    deviceGeo,
  ] = await Promise.all([
    loadHeroKpis(),
    loadDauSeries(30),
    loadCohorts(8),
    loadGuestVsReg(),
    loadFunnel(30),
    loadAppleMetrics(30),
    loadDeviceGeo(30),
  ]);

  return (
    <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-8 max-w-[1280px] mx-auto">
      <header className="space-y-1">
        <h1 className="text-[24px] font-semibold tracking-tight text-[color:var(--text-hi)]">
          User &amp; Engagement Insights
        </h1>
        <p className="text-[13px] text-muted-foreground">
          Metriche prodotto · DAU/WAU/MAU · retention · funnel signup · App Store
        </p>
      </header>

      {/* Hero KPI grid (8 valori) */}
      <HeroKpiGrid kpis={hero} />

      {/* Apple ASC */}
      <InsightSection
        title="Apple App Store"
        subtitle="Downloads, sessioni, crash — via ASC Analytics API (delay ~48h)"
      >
        <AppleAppStoreSection data={appleMetrics} />
      </InsightSection>

      {/* DAU time series */}
      <InsightSection
        title="Active Users (30 giorni)"
        subtitle="Daily Active Users — registrati vs guest"
      >
        <DauTimeSeries series={dauSeries} />
      </InsightSection>

      {/* Retention cohorts */}
      <InsightSection
        title="Retention coorti settimanali"
        subtitle="% di nuovi utenti tornati dopo 1, 7 e 30 giorni"
      >
        <RetentionCohortTable cohorts={cohorts} />
      </InsightSection>

      {/* Guest vs Registered + Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <InsightSection
          title="Guest vs Registered"
          subtitle="Distribuzione attivita' su 24h / 7d / 30d"
        >
          <GuestVsRegistered rows={guestVsReg} />
        </InsightSection>

        <InsightSection
          title="Signup funnel (30 giorni)"
          subtitle="Signup → Onboarded → First Play → Returned D7"
        >
          <SignupFunnel totals={funnel} />
        </InsightSection>
      </div>

      {/* Device/Geo */}
      <InsightSection
        title="Device &amp; Geography"
        subtitle="Breakdown sistema operativo e nazione (ultime 5000 sessioni)"
      >
        <DeviceGeoBreakdown data={deviceGeo} />
      </InsightSection>
    </div>
  );
}
