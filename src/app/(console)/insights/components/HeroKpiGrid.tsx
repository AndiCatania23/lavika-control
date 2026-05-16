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
    { label: 'DAU (oggi)', value: formatNumber(k.dau), hint: 'Daily active users' },
    { label: 'WAU (7g)', value: formatNumber(k.wau), hint: 'Weekly active users (somma 7gg)' },
    { label: 'MAU (30g)', value: formatNumber(k.mau), hint: 'Monthly active users (somma 30gg)' },
    {
      label: 'Sessione media',
      value: k.avgSessionMinutes != null ? `${k.avgSessionMinutes}'` : '—',
      hint: 'TBD (richiede session_duration)',
    },
    {
      label: 'Retention D7',
      value: k.retentionD7Pct != null ? `${k.retentionD7Pct}%` : '—',
      hint: 'Media ultime 4 coorti',
    },
    {
      label: 'Push opt-in',
      value: k.pushOptInPct != null ? `${k.pushOptInPct}%` : '—',
      hint: 'sub. attive / utenti totali',
    },
    {
      label: 'Rating App Store',
      value: k.appStoreRating != null ? `${k.appStoreRating}★` : '—',
      hint: 'placeholder (ASC non lo espone)',
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
