import type { FeatureActivationRow } from '@/lib/insights/queries';

const LABELS: Record<FeatureActivationRow['feature'], string> = {
  pill: 'Pills',
  video: 'Video',
  match: 'Match',
  prediction: 'Pronostici',
};

export function ActivationByFeature({ rows }: { rows: FeatureActivationRow[] }) {
  if (rows.length === 0) {
    return <div className="text-[13px] text-muted-foreground">Nessuna attivazione disponibile.</div>;
  }

  return (
    <>
      <div className="space-y-2 md:hidden">
        {rows.map((row) => (
          <article key={row.feature} className="rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface-2)] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="font-medium text-[color:var(--text-hi)]">{LABELS[row.feature]}</div>
              <div className="text-right text-[12px] tabular-nums">
                <div>{row.activatedUsers} attivati</div>
                <div className="text-muted-foreground">{row.activationPct == null ? '—' : `${row.activationPct}%`} degli iscritti</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[color:var(--hairline)] pt-3">
              <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Giorno 1</div><div className="mt-0.5 text-[14px] tabular-nums">{row.d1Pct == null ? '—' : `${row.d1Pct}%`} <span className="text-[10px] text-muted-foreground">n={row.d1Eligible}</span></div></div>
              <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Giorno 7</div><div className="mt-0.5 text-[14px] tabular-nums">{row.d7Pct == null ? '—' : `${row.d7Pct}%`} <span className="text-[10px] text-muted-foreground">n={row.d7Eligible}</span></div></div>
            </div>
          </article>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-3 text-left font-medium">Funzione</th>
            <th className="py-2 pr-3 text-right font-medium">Attivati</th>
            <th className="py-2 pr-3 text-right font-medium">% nuovi iscritti</th>
            <th className="py-2 pr-3 text-right font-medium">Ritorno giorno 1</th>
            <th className="py-2 text-right font-medium">Ritorno giorno 7</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[color:var(--hairline)]">
          {rows.map((row) => (
            <tr key={row.feature}>
              <td className="py-2.5 pr-3 font-medium text-[color:var(--text-hi)]">{LABELS[row.feature]}</td>
              <td className="py-2.5 pr-3 text-right text-muted-foreground">{row.activatedUsers}</td>
              <td className="py-2.5 pr-3 text-right">{row.activationPct == null ? '—' : `${row.activationPct}%`}</td>
              <td className="py-2.5 pr-3 text-right">
                {row.d1Pct == null ? '—' : `${row.d1Pct}%`}
                <span className="ml-1 text-[10px] text-muted-foreground">n={row.d1Eligible}</span>
              </td>
              <td className="py-2.5 text-right">
                {row.d7Pct == null ? '—' : `${row.d7Pct}%`}
                <span className="ml-1 text-[10px] text-muted-foreground">n={row.d7Eligible}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}
