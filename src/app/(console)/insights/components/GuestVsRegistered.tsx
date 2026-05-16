import type { GuestVsRegRow } from '@/lib/insights/queries';

interface Props {
  rows: GuestVsRegRow[];
}

const WINDOW_LABEL: Record<GuestVsRegRow['window'], string> = {
  '24h': 'Ultime 24h',
  '7d': 'Ultimi 7 giorni',
  '30d': 'Ultimi 30 giorni',
};

/**
 * Stacked horizontal bar per ogni finestra temporale.
 * Visualizza registered (oro) vs guest (viola) proporzionalmente.
 */
function StackedBar({ registered, guest }: { registered: number; guest: number }) {
  const total = registered + guest;
  if (total === 0) {
    return <div className="h-3 rounded-full bg-[color:var(--surface-2)]" />;
  }
  const regPct = (registered / total) * 100;
  return (
    <div className="h-3 rounded-full bg-[color:var(--surface-2)] overflow-hidden flex">
      <div
        className="h-full bg-amber-500/80"
        style={{ width: `${regPct}%` }}
        title={`Registrati: ${registered}`}
      />
      <div
        className="h-full bg-violet-500/70"
        style={{ width: `${100 - regPct}%` }}
        title={`Guest: ${guest}`}
      />
    </div>
  );
}

export function GuestVsRegistered({ rows }: Props) {
  if (rows.length === 0) {
    return <div className="text-[13px] text-muted-foreground">Nessun dato.</div>;
  }

  return (
    <div className="space-y-4">
      {rows.map((r) => {
        const total = r.registered + r.guests;
        return (
          <div key={r.window} className="space-y-1.5">
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-[color:var(--text-hi)] font-medium">
                {WINDOW_LABEL[r.window]}
              </span>
              <span className="text-muted-foreground">
                {total} attivi · {r.viewStarts} view
              </span>
            </div>
            <StackedBar registered={r.registered} guest={r.guests} />
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-500/80" />
                Registrati {r.registered}
              </span>
              <span className="flex items-center gap-1.5">
                Guest {r.guests}
                <span className="inline-block w-2 h-2 rounded-full bg-violet-500/70" />
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
