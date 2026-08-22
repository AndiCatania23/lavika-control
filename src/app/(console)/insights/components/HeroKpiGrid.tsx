import type { HeroKpis } from '@/lib/insights/queries';

interface Props {
  kpis: HeroKpis;
}

type Tile = {
  label: string;
  value: string;
  hint?: string;
};

function formatNumber(n: number): string {
  return n.toLocaleString('it-IT');
}

function buildTiles(k: HeroKpis): Tile[] {
  return [
    { label: 'Utenti totali', value: formatNumber(k.totalUsers) },
    { label: 'Attivi oggi', value: formatNumber(k.dau), hint: 'Utenti distinti · DAU' },
    { label: 'Attivi 7 giorni', value: formatNumber(k.wau), hint: 'Utenti distinti · WAU' },
    { label: 'Attivi 30 giorni', value: formatNumber(k.mau), hint: 'Utenti distinti · MAU' },
    {
      label: 'Frequenza d’uso',
      value: k.stickinessPct != null ? `${k.stickinessPct}%` : '—',
      hint: 'attivi oggi / attivi 30 giorni',
    },
    {
      label: 'Ritorno giornaliero',
      value: k.nextDayReturnPct != null ? `${k.nextDayReturnPct}%` : '—',
      hint: k.nextDayReturnSample > 0 ? `attività giorno→giorno · media 30gg` : 'dati insufficienti',
    },
    {
      label: 'Ritorno al giorno 7',
      value: k.retentionD7Pct != null ? `${k.retentionD7Pct}%` : '—',
      hint: k.retentionD7Sample > 0 ? `utenti eleggibili · n=${k.retentionD7Sample}` : 'dati in raccolta',
    },
    {
      label: 'Durata tipica sessione',
      value: k.sessionMedianMinutes != null ? `${k.sessionMedianMinutes}'` : '—',
      hint: k.sessionSample > 0 ? `mediana · ${formatNumber(k.sessionSample)} sess. 30gg` : 'nessun dato',
    },
    {
      label: 'Notifiche attive',
      value: k.pushOptInPct != null ? `${k.pushOptInPct}%` : '—',
      hint: `${formatNumber(k.pushOptedUsers)} utenti distinti / totali`,
    },
    {
      // Finché non arriva il primo tap tracciato mostriamo
      // "—" invece di 0%, per non confondere "nessun dato ancora" con "0% reale".
      label: 'Apertura notifiche',
      value: k.pushClickedSinceTracking > 0 && k.pushOpenRatePct != null ? `${k.pushOpenRatePct}%` : '—',
      hint: k.pushClickedSinceTracking > 0
        ? `${formatNumber(k.pushClickedSinceTracking)}/${formatNumber(k.pushSentSinceTracking)} tap · dal 9 ago`
        : `${formatNumber(k.pushSentSinceTracking)} inviate dal 9 ago · in attesa dei primi tap`,
    },
    {
      label: 'Valutazione App Store',
      value: k.appStoreRating != null ? `${k.appStoreRating}★` : 'n/d',
      hint: 'non disponibile via API ASC',
    },
  ];
}

export function HeroKpiGrid({ kpis }: Props) {
  const tiles = buildTiles(kpis);
  return (
    <div className="grid auto-rows-fr grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="flex min-w-0 flex-col gap-1 rounded-xl border border-[color:var(--hairline)] bg-card p-3 sm:p-4"
        >
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground sm:text-[11px]">
            {t.label}
          </span>
          <span className="text-[22px] font-semibold tracking-tight text-[color:var(--text-hi)]">
            {t.value}
          </span>
          {t.hint ? (
            <span className="text-[10.5px] text-muted-foreground/80 leading-tight mt-0.5">
              {t.hint}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
