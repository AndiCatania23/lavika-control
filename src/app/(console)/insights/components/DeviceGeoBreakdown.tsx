import type { DeviceGeoBreakdown as DeviceGeoData } from '@/lib/insights/queries';

interface Props {
  data: DeviceGeoData;
}

function BreakdownTable({ title, rows }: { title: string; rows: Array<{ label: string; users: number }> }) {
  const max = Math.max(...rows.map((r) => r.users), 1);
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="text-[12.5px] text-muted-foreground">Nessun dato.</div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-3 text-[12.5px]">
              <span className="w-20 text-[color:var(--text-hi)] truncate" title={r.label}>
                {r.label || '—'}
              </span>
              <div className="flex-1 h-2 rounded-full bg-[color:var(--surface-2)] overflow-hidden">
                <div
                  className="h-full bg-amber-500/70"
                  style={{ width: `${(r.users / max) * 100}%` }}
                />
              </div>
              <span className="w-10 text-right text-muted-foreground tabular-nums">
                {r.users}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DeviceGeoBreakdown({ data }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <BreakdownTable title="Sistema operativo" rows={data.topOs} />
      <BreakdownTable title="Nazione (geo IP)" rows={data.topCountries} />
    </div>
  );
}
