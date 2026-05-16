import type { AppleMetricsSnapshot } from '@/lib/insights/queries';

interface Props {
  data: AppleMetricsSnapshot;
}

function formatN(n: number): string {
  return n.toLocaleString('it-IT');
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * SVG sparkline puro — niente recharts per questo widget piccolo.
 * Mostra l'andamento downloads negli ultimi 30 giorni.
 */
function Sparkline({ values, width = 240, height = 48 }: { values: number[]; width?: number; height?: number }) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const stepX = width / Math.max(values.length - 1, 1);

  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linePath = `M ${points.join(' L ')}`;
  const areaPath = `${linePath} L ${width},${height} L 0,${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent-raw, #e8701a)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--accent-raw, #e8701a)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#spark-grad)" />
      <path d={linePath} fill="none" stroke="var(--accent-raw, #e8701a)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function AppleAppStoreSection({ data }: Props) {
  const { latest, series, totals30d } = data;
  const hasData = series.length > 0;

  if (!hasData) {
    return (
      <div className="text-[13px] text-muted-foreground">
        Nessun dato Apple disponibile.{' '}
        <span className="text-[12px]">
          Verifica che il cron <code className="px-1 py-0.5 rounded bg-[color:var(--surface-2)] text-[11px]">fetch-asc-cron.sh</code> sia attivo
          (vedi <code className="px-1 py-0.5 rounded bg-[color:var(--surface-2)] text-[11px]">~/.claude/projects/.../memory/asc-analytics-setup.md</code>).
        </span>
      </div>
    );
  }

  const tiles = [
    { label: 'Downloads (ultimo giorno)', value: formatN(latest.downloads) },
    { label: 'Sessions', value: formatN(latest.sessions) },
    { label: 'Active devices', value: formatN(latest.activeDevices) },
    {
      label: 'Crash-free',
      value: latest.crashFreeRate != null ? `${(latest.crashFreeRate * 100).toFixed(2)}%` : '—',
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface-2)] p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {t.label}
            </div>
            <div className="text-[20px] font-semibold tracking-tight text-[color:var(--text-hi)] mt-1">
              {t.value}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col md:flex-row gap-5 items-start">
        <div className="flex-1 space-y-1">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Downloads (30 giorni)
          </div>
          <Sparkline values={series.map((p) => p.downloads)} width={320} height={56} />
          <div className="text-[11.5px] text-muted-foreground mt-1">
            Totale 30g: <strong className="text-[color:var(--text-hi)]">{formatN(totals30d.downloads)}</strong>
            {' · '}First-time: <strong className="text-[color:var(--text-hi)]">{formatN(totals30d.installs)}</strong>
            {' · '}Ultima sync: {formatDate(latest.metricDate)}
          </div>
        </div>

        {latest.topCountries.length > 0 ? (
          <div className="flex-1">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Top 5 paesi (ultimo giorno)
            </div>
            <div className="space-y-1.5">
              {latest.topCountries.map((c) => (
                <div key={c.country} className="flex items-center justify-between text-[12.5px]">
                  <span className="text-[color:var(--text-hi)]">{c.country}</span>
                  <span className="text-muted-foreground">{formatN(c.downloads)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
