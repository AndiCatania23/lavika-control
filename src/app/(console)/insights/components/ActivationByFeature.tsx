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
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-3 text-left font-medium">Feature</th>
            <th className="py-2 pr-3 text-right font-medium">Attivati</th>
            <th className="py-2 pr-3 text-right font-medium">D1</th>
            <th className="py-2 text-right font-medium">D7</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[color:var(--hairline)]">
          {rows.map((row) => (
            <tr key={row.feature}>
              <td className="py-2.5 pr-3 font-medium text-[color:var(--text-hi)]">{LABELS[row.feature]}</td>
              <td className="py-2.5 pr-3 text-right text-muted-foreground">{row.activatedUsers}</td>
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
  );
}
