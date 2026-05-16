import type { FunnelTotals } from '@/lib/insights/queries';

interface Props {
  totals: FunnelTotals;
}

/**
 * Funnel visivo orizzontale (4 step). Larghezza barra proporzionale al N
 * assoluto di signups (100%). Pct conversione mostrate sotto ogni step.
 */
export function SignupFunnel({ totals }: Props) {
  const base = totals.signups || 1;

  const steps = [
    { label: 'Signup', count: totals.signups, pct: 100 as number | null },
    { label: 'Onboarded', count: totals.onboarded, pct: totals.onboardedPct },
    { label: 'First Play', count: totals.firstPlay, pct: totals.firstPlayPct },
    { label: 'Returned D7', count: totals.returnedD7, pct: totals.returnedD7Pct },
  ];

  if (totals.signups === 0) {
    return <div className="text-[13px] text-muted-foreground">Nessun signup nel periodo.</div>;
  }

  return (
    <div className="space-y-3">
      {steps.map((s) => {
        const widthPct = Math.max((s.count / base) * 100, s.count > 0 ? 4 : 0);
        return (
          <div key={s.label} className="space-y-1">
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-[color:var(--text-hi)]">{s.label}</span>
              <span className="text-muted-foreground">
                {s.count} {s.pct != null ? <span className="ml-2 text-[11px]">({s.pct}%)</span> : null}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-[color:var(--surface-2)] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500/70 to-amber-400/80"
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
