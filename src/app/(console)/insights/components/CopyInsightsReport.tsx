'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type {
  AppleMetricsSnapshot,
  CohortRow,
  CoreUsageDay,
  CoreUsageRow,
  DauPoint,
  DeviceGeoBreakdown,
  FeatureActivationRow,
  FunnelTotals,
  GuestVsRegRow,
  HeroKpis,
  RetentionIntegrity,
  IntegrityBaseline,
} from '@/lib/insights/queries';

type ReportData = {
  hero: HeroKpis;
  retentionIntegrity: RetentionIntegrity | null;
  integrityBaseline: IntegrityBaseline | null;
  coreUsage: CoreUsageRow[];
  coreUsageAvailable: boolean;
  coreUsageDaily: CoreUsageDay[];
  funnel: FunnelTotals;
  activation: FeatureActivationRow[];
  cohorts: CohortRow[];
  dauSeries: DauPoint[];
  guestVsReg: GuestVsRegRow[];
  apple: AppleMetricsSnapshot;
  deviceGeo: DeviceGeoBreakdown;
};

const featureNames = { pill: 'Pills', match: 'Partite', video: 'Video', prediction: 'Pronostici' } as const;
const value = (number: number | null, suffix = '') => number == null ? 'n/d' : `${number}${suffix}`;

export function buildReport(data: ReportData): string {
  const { hero: h } = data;
  const lines = [
    '# LAVIKA — Statistiche prodotto e crescita',
    `Generato il ${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}`,
    'Nota metodologica: la misurazione completa di Pills, Partite, Video e Pronostici è attiva dal 22 agosto 2026 alle 22:41 (Europe/Rome). Lo storico precedente riguarda soprattutto i video.',
    '',
    '## Panoramica',
    `- Utenti totali: ${h.totalUsers}`,
    `- Attivi oggi calendario Roma (DAU): ${h.dau}`,
    `- Attivi nelle ultime 168 ore rolling (WAU): ${h.wau}`,
    `- Attivi nelle ultime 720 ore rolling (MAU): ${h.mau}`,
    `- Frequenza d’uso (DAU/MAU): ${h.dau}/${h.mau} = ${value(h.stickinessPct, '%')}`,
    `- Ritorno giornaliero medio su 30 giorni: ${value(h.nextDayReturnPct, '%')} (campione: ${h.nextDayReturnSample} coppie giorno-utente; non è retention di coorte)`,
    `- D7 Core Action · exact: ${h.retentionD7Returned}/${h.retentionD7Sample} = ${value(h.retentionD7Pct, '%')}`,
    `- Intervallo sessione · mediana: ${value(h.sessionMedianMinutes, ' minuti')} (sessioni: ${h.sessionSample})`,
    `- Notifiche attive: ${value(h.pushOptInPct, '%')} (${h.pushOptedUsers} utenti)`,
    `- Apertura notifiche: ${h.pushClickedSinceTracking > 0 ? value(h.pushOpenRatePct, '%') : 'n/d'} (${h.pushClickedSinceTracking}/${h.pushSentSinceTracking}; misurazione affidabile dal 9 agosto 2026)`,
    `- Valutazione App Store: ${value(h.appStoreRating)}`,
    '',
    '## Uso delle funzioni principali',
  ];

  if (!data.coreUsageAvailable) lines.push('- Dati momentaneamente non disponibili per errore di lettura.');
  for (const window of data.coreUsageAvailable ? (['24h', '7d', '30d'] as const) : []) {
    const audience = data.guestVsReg.find((row) => row.window === window)?.registered ?? 0;
    lines.push(`### ${window} — registrati attivi: ${audience}`);
    for (const row of data.coreUsage.filter((item) => item.window === window)) {
      const share = audience > 0 ? Math.round((row.uniqueUsers / audience) * 1000) / 10 : null;
      const frequency = row.uniqueUsers > 0 ? Math.round((row.actions / row.uniqueUsers) * 10) / 10 : null;
      lines.push(`- ${featureNames[row.feature]}: ${row.uniqueUsers} utenti, ${row.actions} azioni, quota ${value(share, '%')}, ${value(frequency)} azioni per utente`);
    }
  }
  lines.push('- Nota: gli utenti possono usare più funzioni; le quote non sono sommabili. Azioni: aperture Pill/Partita uniche per account/contenuto/sessione/giorno Roma; avvii Video deduplicati per device (account se assente), episodio e playback key; primo invio Pronostico per account/partita. Video: HLS dopo play() riuscito; YouTube al comando di avvio, non visione confermata.');

  lines.push('', '## Andamento giornaliero delle funzioni');
  if (!data.coreUsageAvailable) lines.push('- Dati momentaneamente non disponibili per errore di lettura.');
  for (const day of data.coreUsageAvailable ? data.coreUsageDaily : []) {
    lines.push(`- ${day.day}: Pills ${day.pillUsers} utenti/${day.pillActions} azioni; Partite ${day.matchUsers}/${day.matchActions}; Video ${day.videoUsers}/${day.videoActions}; Pronostici ${day.predictionUsers}/${day.predictionActions}`);
  }

  lines.push('', '## Retention: exact e ritorno nella settimana');
  const retention = data.retentionIntegrity;
  if (!retention) {
    lines.push('- Dati retention non disponibili: errore di lettura, non zero.');
  } else {
    const rate = (n: number) => retention.eligible > 0
      ? `${n}/${retention.eligible} = ${Math.round(n / retention.eligible * 1000) / 10}%` : 'n/d — nessun utente maturo';
    lines.push(
      `- D7 App Return · exact: ${rate(retention.appD7)}`,
      `- D7 Core Action · exact: ${rate(retention.coreD7)}`,
      `- Returned D1–D7 · App / W1 Return: ${rate(retention.appWeek1)}`,
      `- Returned D1–D7 · Core: ${rate(retention.coreWeek1)}`,
      '- Exact: attività nella data Roma D0+7. D1–D7: almeno una attività nei giorni 1–7 inclusi. Il giorno 7 deve essere concluso.',
      '- App: evento oppure presenza di sessione osservata. Core: apertura Pill/Partita, primo pronostico per partita o avvio Video canonico.',
      `- Presenza giornaliera persistente dal ${retention.observedFrom}; lo storico precedente è un minimo osservabile, non una registrazione completa dei ritorni.`,
      `- Nuova baseline: ${retention.certifiedAt ?? 'certificazione in corso; baseline non avviata'}`,
    );
  }

  const baseline = data.integrityBaseline;
  if (baseline?.certified_at) {
    const ratio = (n: number, d: number) => d ? `${n}/${d} = ${Math.round(n / d * 1000) / 10}%` : 'n/d — campione non maturato';
    lines.push('', '## Nuova baseline certificata',
      `- Inizio: ${baseline.certified_at}. Nessuna cancellazione dello storico.`,
      `- Acquisition: ${baseline.acquired} nuovi account dalla certificazione.`,
      `- Activation D0 Core: ${ratio(baseline.activated_d0, baseline.activation_eligible)}; nuovi iscritti, D0 concluso.`,
      `- W1 Return App D1–D7: ${ratio(baseline.w1_returned, baseline.w1_eligible)}; nuovi iscritti, D7 concluso.`,
      `- WAU/MAU registrati: ${ratio(baseline.wau, baseline.mau)}; tutti gli account, attività dalla certificazione nelle ultime 168/720 ore; ${baseline.windows_complete ? 'finestre complete' : 'finestre parziali'}.`,
      '- Next Matchday Retention: non ancora calcolata. Feature engagement nelle sezioni storiche precedenti.',
    );
  }

  const f = data.funnel;
  lines.push(
    '', '## Percorso dei nuovi iscritti',
    `- Registrati: ${f.signups}`,
    `- Onboarding completato: ${f.onboarded} (${value(f.onboardedPct, '%')})`,
    `- Prima core action: ${f.firstValue} (${value(f.firstValuePct, '%')})`,
    `- D7 Core Action · exact: ${f.returnedD7} su ${f.d7Eligible} eleggibili (${value(f.returnedD7Pct, '%')})`,
    '', '## Attivazione per funzione',
  );
  for (const row of data.activation) {
    lines.push(`- ${featureNames[row.feature]}: ${row.activatedUsers}/${row.signupUsers} attivati (${value(row.activationPct, '%')}); stessa funzione D1 exact ${row.d1Returned}/${row.d1Eligible} (${value(row.d1Pct, '%')}); stessa funzione D7 exact ${row.d7Returned}/${row.d7Eligible} (${value(row.d7Pct, '%')})`);
  }

  lines.push('', '## Coorti settimanali');
  if (data.cohorts.length === 0) lines.push('- Dati ancora in raccolta.');
  for (const row of data.cohorts) {
    lines.push(`- Settimana ${row.cohortWeek}: ${row.cohortSize} iscritti; core D1 exact ${row.d1Returned}/${row.d1Eligible} = ${value(row.d1Pct, '%')}; core D7 exact ${row.d7Returned}/${row.d7Eligible} = ${value(row.d7Pct, '%')}; core D30 exact ${row.d30Returned}/${row.d30Eligible} = ${value(row.d30Pct, '%')}`);
  }

  lines.push('', '## Utenti attivi giornalieri — ultimi 30 giorni');
  for (const row of data.dauSeries) lines.push(`- ${row.day}: totale ${row.total}, registrati ${row.registered}, ospiti ${row.guest}`);

  lines.push('', '## Ospiti e registrati');
  for (const row of data.guestVsReg) lines.push(`- ${row.window}: ${row.registered} utenti registrati, ${row.guests} dispositivi ospiti, totale indicativo ${row.registered + row.guests}, ${row.viewStarts} avvii video`);
  lines.push('- Nota: registrati e dispositivi ospiti non sono unità perfettamente omogenee; il totale è indicativo.');

  const apple = data.apple;
  lines.push('', '## App Store');
  if (apple.latest.metricDate == null || apple.series.length === 0) {
    lines.push('- Dati App Store non disponibili. Non interpretare questa assenza come zero.');
  } else {
    lines.push(
      `- Ultimo aggiornamento: ${apple.latest.metricDate}`,
      `- Ultimo giorno: ${apple.latest.downloads} download, ${apple.latest.sessions} sessioni, ${apple.latest.activeDevices} dispositivi attivi, ${apple.latest.crashes} arresti, ${value(apple.latest.crashFreeRate == null ? null : Math.round(apple.latest.crashFreeRate * 10000) / 100, '%')} senza arresti`,
      `- Ultimi 30 giorni: ${apple.totals30d.downloads} download, ${apple.totals30d.installs} primi download/installazioni, ${apple.totals30d.sessions} sessioni`,
      `- Paesi principali: ${apple.latest.topCountries.map((country) => `${country.country} ${country.downloads}`).join(', ') || 'n/d'}`,
      '- Serie giornaliera App Store:',
      ...apple.series.map((row) => `  - ${row.day}: ${row.downloads} download, ${row.sessions} sessioni, ${row.activeDevices} dispositivi attivi`),
    );
  }
  lines.push(
    '', '## Dispositivi e provenienza — ultimi 30 giorni',
    `- Sistemi operativi: ${data.deviceGeo.topOs.map((row) => `${row.label} ${row.users}`).join(', ') || 'n/d'}`,
    `- Paesi: ${data.deviceGeo.topCountries.map((row) => `${row.label} ${row.users}`).join(', ') || 'n/d'}`,
    '', '## Definizioni e limiti',
    '- DAU: oggi calendario Europe/Rome. WAU/MAU: ultime 168/720 ore rolling. Account e dispositivi guest sono unità differenti.',
    '- Il ritorno giornaliero medio descrive passaggi giorno→giorno; il ritorno D1/D7/D30 misura coorti di iscrizione.',
    '- Le finestre 24 ore, 7 giorni e 30 giorni sono mobili. Giorni e coorti usano Europe/Rome.',
    '- Intervallo sessione: last_seen − first_seen, non tempo attivo; sessioni iniziate nelle ultime 720 ore, incluse durate zero.',
    '- Ritorno per funzione: stessa funzione usata in D0 e nel giorno exact indicato; non ritorno a qualsiasi funzione.',
    '- I dati App Store possono arrivare con circa 48 ore di ritardo.',
    '- “n/d” indica un dato non disponibile o non ancora maturato, non uno zero.',
    '- Dispositivi e provenienza derivano dalle ultime 5.000 sessioni al massimo negli ultimi 30 giorni.',
    '',
    'Analizza questi dati distinguendo attivazione, coinvolgimento e ritorno. Evidenzia segnali positivi, criticità, limiti del campione e le 3 azioni prioritarie. Non interpretare “n/d” o dati non ancora maturi come 0%.',
  );

  return lines.join('\n');
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Alcune WebView espongono Clipboard API ma la rifiutano.
    }
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Copia non supportata');
}

export function CopyInsightsReport({ data }: { data: ReportData }) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');

  async function handleCopy() {
    try {
      await copyText(buildReport(data));
      setState('copied');
      window.setTimeout(() => setState('idle'), 2200);
    } catch {
      setState('error');
      window.setTimeout(() => setState('idle'), 2200);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[color:var(--hairline)] bg-white/[0.06] px-4 py-2.5 text-[12.5px] font-medium text-[color:var(--text-hi)] transition-[background-color,transform] duration-150 hover:bg-white/[0.1] active:scale-[0.97] sm:w-auto"
      aria-live="polite"
    >
      {state === 'copied' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      {state === 'copied' ? 'Statistiche copiate' : state === 'error' ? 'Copia non riuscita' : 'Copia tutte le statistiche'}
    </button>
  );
}
