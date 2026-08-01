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
    { label: 'DAU (oggi)', value: formatNumber(k.dau), hint: 'Utenti distinti attivi oggi' },
    { label: 'WAU (7g)', value: formatNumber(k.wau), hint: 'Utenti distinti · 7gg' },
    { label: 'MAU (30g)', value: formatNumber(k.mau), hint: 'Utenti distinti · 30gg' },
    {
      label: 'Stickiness',
      value: k.stickinessPct != null ? `${k.stickinessPct}%` : '—',
      hint: 'DAU / MAU',
    },
    {
      label: 'Ritorno 24h',
      value: k.nextDayReturnPct != null ? `${k.nextDayReturnPct}%` : '—',
      hint: k.nextDayReturnSample > 0 ? `torna il giorno dopo · media 30gg` : 'dati insufficienti',
    },
    {
      label: 'Retention D7',
      value: k.retentionD7Pct != null ? `${k.retentionD7Pct}%` : '—',
      hint: k.retentionD7Sample > 0 ? `coorti mature · n=${k.retentionD7Sample}` : 'dati insufficienti',
    },
    {
      label: 'Sessione mediana',
      value: k.sessionMedianMinutes != null ? `${k.sessionMedianMinutes}'` : '—',
      hint: k.sessionSample > 0 ? `mediana · ${formatNumber(k.sessionSample)} sess. 30gg` : 'nessun dato',
    },
    {
      label: 'Push opt-in',
      value: k.pushOptInPct != null ? `${k.pushOptInPct}%` : '—',
      hint: `${formatNumber(k.pushOptedUsers)} utenti distinti / totali`,
    },
    {
      // Finché non arriva il primo tap (app aggiornata in produzione) mostriamo
      // "—" invece di 0%, per non confondere "nessun dato ancora" con "0% reale".
      label: 'Notifiche aperte',
      value: k.pushClicked30d > 0 && k.pushOpenRatePct != null ? `${k.pushOpenRatePct}%` : '—',
      hint: k.pushClicked30d > 0
        ? `${formatNumber(k.pushClicked30d)}/${formatNumber(k.pushSent30d)} tap · 30gg`
        : `${formatNumber(k.pushSent30d)} inviate · in attesa dei primi tap`,
    },
    {
      label: 'Rating App Store',
      value: k.appStoreRating != null ? `${k.appStoreRating}★` : 'n/d',
      hint: 'non disponibile via API ASC',
    },
  ];
}

export function HeroKpiGrid({ kpis }: Props) {
  const tiles = buildTiles(kpis);
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="rounded-xl border border-[color:var(--hairline)] bg-card p-4 flex flex-col gap-1"
        >
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
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
