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
  loadActivationByFeature,
  loadCoreUsage,
  loadCoreUsageDaily,
  CORE_ANALYTICS_STARTED_AT,
} from '@/lib/insights/queries';
import { HeroKpiGrid } from './components/HeroKpiGrid';
import { AppleAppStoreSection } from './components/AppleAppStoreSection';
import { DauTimeSeries } from './components/DauTimeSeries';
import { RetentionCohortTable } from './components/RetentionCohortTable';
import { GuestVsRegistered } from './components/GuestVsRegistered';
import { SignupFunnel } from './components/SignupFunnel';
import { DeviceGeoBreakdown } from './components/DeviceGeoBreakdown';
import { InsightSection } from './components/InsightSection';
import { ActivationByFeature } from './components/ActivationByFeature';
import { CoreUsageDashboard } from './components/CoreUsageDashboard';

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
    activationByFeature,
    coreUsage,
    coreUsageDaily,
  ] = await Promise.all([
    loadHeroKpis(),
    loadDauSeries(30),
    loadCohorts(8),
    loadGuestVsReg(),
    loadFunnel(30),
    loadAppleMetrics(30),
    loadDeviceGeo(30),
    loadActivationByFeature(),
    loadCoreUsage(),
    loadCoreUsageDaily(),
  ]);

  const registeredActiveUsers = Object.fromEntries(
    guestVsReg.map((row) => [row.window, row.registered]),
  ) as Record<'24h' | '7d' | '30d', number>;

  return (
    <div className="px-4 py-6 lg:px-8 lg:py-8 space-y-8 max-w-[1280px] mx-auto">
      <header className="space-y-1">
        <h1 className="text-[24px] font-semibold tracking-tight text-[color:var(--text-hi)]">
          Prodotto e crescita
        </h1>
        <p className="text-[13px] text-muted-foreground">
          Cosa fanno i tifosi, cosa li attiva e cosa li fa tornare
        </p>
      </header>

      <div className="rounded-xl border border-sky-400/20 bg-sky-400/[0.06] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[12.5px] font-medium text-sky-100">Misurazione completa attiva dal 22 agosto 2026</div>
            <div className="mt-0.5 text-[11px] leading-relaxed text-sky-100/60">
              Prima di questa data lo storico riguarda soprattutto i video. Pills, Partite e Pronostici sono confrontabili solo da qui in avanti.
            </div>
          </div>
          <time className="text-[10px] text-sky-100/45" dateTime={CORE_ANALYTICS_STARTED_AT}>Europe/Rome</time>
        </div>
      </div>

      <div>
        <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Panoramica</div>
        <HeroKpiGrid kpis={hero} />
      </div>

      <InsightSection
        title="Cosa fanno i tifosi"
        subtitle="Utenti e azioni nelle quattro funzioni principali · finestre mobili"
      >
        <CoreUsageDashboard
          rows={coreUsage}
          daily={coreUsageDaily}
          activeUsers={{
            '24h': registeredActiveUsers['24h'] ?? 0,
            '7d': registeredActiveUsers['7d'] ?? 0,
            '30d': registeredActiveUsers['30d'] ?? 0,
          }}
        />
      </InsightSection>

      <div className="pt-1">
        <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Attivazione dei nuovi iscritti</div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <InsightSection
            title="Percorso dei nuovi iscritti"
            subtitle="Dal 22 agosto · Registrazione → Primo valore → Ritorno"
          >
            <SignupFunnel totals={funnel} />
          </InsightSection>
          <InsightSection
            title="Attivazione per funzione"
            subtitle="Funzione usata nel giorno dell’iscrizione; una persona può apparire in più righe"
          >
            <ActivationByFeature rows={activationByFeature} />
          </InsightSection>
        </div>
      </div>

      <div className="pt-1">
        <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Ritorno nel tempo</div>
        <div className="space-y-6">
          <InsightSection
            title="Coorti settimanali"
            subtitle="Utenti iscritti nella stessa settimana · solo dati completi dal 22 agosto"
          >
            <RetentionCohortTable cohorts={cohorts} />
          </InsightSection>
          <InsightSection
            title="Utenti attivi negli ultimi 30 giorni"
            subtitle="Registrati e ospiti attivi ogni giorno"
          >
            <DauTimeSeries series={dauSeries} />
          </InsightSection>
        </div>
      </div>

      <div className="pt-1">
        <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Acquisizione e contesto</div>
        <div className="space-y-6">
          <InsightSection
            title="App Store"
            subtitle="Download, sessioni e stabilità · aggiornamento Apple con circa 48 ore di ritardo"
          >
            <AppleAppStoreSection data={appleMetrics} />
          </InsightSection>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <InsightSection
              title="Ospiti e registrati"
              subtitle="Distribuzione dell’attività nelle diverse finestre"
            >
              <GuestVsRegistered rows={guestVsReg} />
            </InsightSection>
            <InsightSection
              title="Dispositivi e provenienza"
              subtitle="Sistema operativo e paese nelle sessioni recenti"
            >
              <DeviceGeoBreakdown data={deviceGeo} />
            </InsightSection>
          </div>
        </div>
      </div>
    </div>
  );
}
