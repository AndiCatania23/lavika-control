import type { CohortRow } from '@/lib/insights/queries';

interface Props {
  cohorts: CohortRow[];
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
}

/**
 * Colore cella in base alla % retention.
 * 0% → trasparente, >0% verde crescente.
 */
function cellStyle(pct: number | null): string {
  if (pct == null) return 'text-muted-foreground';
  if (pct === 0) return 'text-muted-foreground/60';
  if (pct < 20) return 'bg-amber-500/10 text-amber-200';
  if (pct < 40) return 'bg-emerald-500/15 text-emerald-200';
  if (pct < 60) return 'bg-emerald-500/25 text-emerald-100';
  return 'bg-emerald-500/40 text-white';
}

export function RetentionCohortTable({ cohorts }: Props) {
  if (cohorts.length === 0) {
    return <div className="text-[13px] text-muted-foreground">Nessuna coorte disponibile.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-muted-foreground text-[11px] uppercase tracking-wider">
            <th className="text-left font-medium py-2 pr-3">Coorte</th>
            <th className="text-right font-medium py-2 pr-3">Size</th>
            <th className="text-right font-medium py-2 pr-3">D1</th>
            <th className="text-right font-medium py-2 pr-3">D7</th>
            <th className="text-right font-medium py-2 pr-3">D30</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[color:var(--hairline)]">
          {cohorts.map((c) => (
            <tr key={c.cohortWeek}>
              <td className="py-2 pr-3 text-[color:var(--text-hi)]">{formatDate(c.cohortWeek)}</td>
              <td className="py-2 pr-3 text-right text-muted-foreground">{c.cohortSize}</td>
              <td className={`py-2 pr-3 text-right rounded-sm ${cellStyle(c.d1Pct)}`}>
                {c.d1Pct != null ? `${c.d1Pct}%` : '—'}
              </td>
              <td className={`py-2 pr-3 text-right rounded-sm ${cellStyle(c.d7Pct)}`}>
                {c.d7Pct != null ? `${c.d7Pct}%` : '—'}
              </td>
              <td className={`py-2 pr-3 text-right rounded-sm ${cellStyle(c.d30Pct)}`}>
                {c.d30Pct != null ? `${c.d30Pct}%` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
