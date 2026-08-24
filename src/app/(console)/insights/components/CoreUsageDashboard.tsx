'use client';

import { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { CoreFeature, CoreUsageDay, CoreUsageRow, CoreUsageWindow } from '@/lib/insights/queries';

const FEATURES: Array<{ key: CoreFeature; label: string; color: string }> = [
  { key: 'pill', label: 'Pills', color: '#f59e0b' },
  { key: 'match', label: 'Partite', color: '#38bdf8' },
  { key: 'video', label: 'Video', color: '#a78bfa' },
  { key: 'prediction', label: 'Pronostici', color: '#34d399' },
];

const WINDOWS: Array<{ key: CoreUsageWindow; label: string }> = [
  { key: '24h', label: '24 ore' },
  { key: '7d', label: '7 giorni' },
  { key: '30d', label: '30 giorni' },
];

function pct(value: number, total: number): string {
  return total > 0 ? `${Math.round((value / total) * 1000) / 10}%` : '—';
}

function formatDay(day: string): string {
  const [, month, date] = day.split('-');
  return `${date}/${month}`;
}

export function CoreUsageDashboard({
  rows,
  daily,
  activeUsers,
  available,
}: {
  rows: CoreUsageRow[];
  daily: CoreUsageDay[];
  activeUsers: Record<CoreUsageWindow, number>;
  available: boolean;
}) {
  const [windowKey, setWindowKey] = useState<CoreUsageWindow>('7d');
  const [trendMetric, setTrendMetric] = useState<'users' | 'actions'>('users');

  const selectedRows = useMemo(() => FEATURES.map((feature) => {
    const row = rows.find((item) => item.window === windowKey && item.feature === feature.key);
    return {
      ...feature,
      uniqueUsers: row?.uniqueUsers ?? 0,
      actions: row?.actions ?? 0,
      share: activeUsers[windowKey] > 0 ? (row?.uniqueUsers ?? 0) / activeUsers[windowKey] * 100 : 0,
      actionsPerUser: (row?.uniqueUsers ?? 0) > 0 ? (row?.actions ?? 0) / (row?.uniqueUsers ?? 1) : 0,
    };
  }), [activeUsers, rows, windowKey]);

  const totalActions = selectedRows.reduce((sum, row) => sum + row.actions, 0);

  if (!available) {
    return <div className="rounded-lg border border-dashed border-[color:var(--hairline)] p-4 text-[12px] text-muted-foreground">Dati momentaneamente non disponibili. Riprova tra poco.</div>;
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid w-full grid-cols-3 rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface-2)] p-1 sm:inline-flex sm:w-auto">
          {WINDOWS.map((window) => (
            <button
              key={window.key}
              type="button"
              onClick={() => setWindowKey(window.key)}
              className={`min-h-10 rounded-md px-3 py-1.5 text-[12px] font-medium transition-[color,background-color,transform] duration-150 active:scale-[0.98] ${
                windowKey === window.key
                  ? 'bg-white/10 text-[color:var(--text-hi)] shadow-sm'
                  : 'text-muted-foreground hover:text-[color:var(--text-hi)]'
              }`}
            >
              {window.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Le quote non si sommano al 100%: uno stesso tifoso può usare più funzioni.
        </p>
      </div>

      <div className="space-y-2 md:hidden">
        {selectedRows.map((row) => (
          <article key={row.key} className="rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface-2)] p-3">
            <div className="flex items-center gap-2 font-medium text-[color:var(--text-hi)]"><span className="h-2 w-2 rounded-full" style={{ background: row.color }} />{row.label}</div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">Utenti</div><div className="mt-0.5 text-[20px] font-semibold tabular-nums">{row.uniqueUsers}</div></div>
              <div><div className="text-[10px] uppercase tracking-wider text-muted-foreground">{row.key === 'video' ? 'Avvii video' : 'Azioni'}</div><div className="mt-0.5 text-[20px] font-semibold tabular-nums">{row.actions}</div></div>
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">{pct(row.uniqueUsers, activeUsers[windowKey])} dei registrati attivi · {row.actionsPerUser > 0 ? row.actionsPerUser.toFixed(1) : '—'} {row.key === 'video' ? 'avvii' : 'azioni'} per utente</div>
          </article>
        ))}
      </div>
      <div className="hidden overflow-x-auto rounded-lg border border-[color:var(--hairline)] md:block">
        <table className="w-full min-w-[650px] text-[12.5px]">
          <thead className="bg-[color:var(--surface-2)] text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 text-left font-medium">Funzione</th>
              <th className="px-3 py-2.5 text-right font-medium">Utenti</th>
              <th className="px-3 py-2.5 text-right font-medium">Azioni / avvii</th>
              <th className="px-3 py-2.5 text-right font-medium">Quota registrati attivi</th>
              <th className="px-3 py-2.5 text-right font-medium">Azioni per utente</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--hairline)]">
            {selectedRows.map((row) => (
              <tr key={row.key}>
                <td className="px-3 py-3 font-medium text-[color:var(--text-hi)]">
                  <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: row.color }} />
                  {row.label}{row.key === 'video' ? <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">Avvii video</span> : null}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{row.uniqueUsers}</td>
                <td className="px-3 py-3 text-right tabular-nums">{row.actions}</td>
                <td className="px-3 py-3 text-right tabular-nums">{pct(row.uniqueUsers, activeUsers[windowKey])}</td>
                <td className="px-3 py-3 text-right tabular-nums">{row.actionsPerUser > 0 ? row.actionsPerUser.toFixed(1) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div>
          <div className="mb-3 text-[11px] uppercase tracking-wider text-muted-foreground">Utenti per funzione</div>
          <div className="h-[220px]">
            <ResponsiveContainer>
              <BarChart data={selectedRows} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 6 }}>
                <CartesianGrid stroke="rgba(120,120,140,0.12)" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-lo, #888)' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" width={72} tick={{ fontSize: 11, fill: 'var(--text-lo, #888)' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} contentStyle={{ background: '#17171c', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="uniqueUsers" name="Utenti" radius={[0, 5, 5, 0]} isAnimationActive={false}>
                  {selectedRows.map((row) => <Cell key={row.key} fill={row.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <div className="mb-3 text-[11px] uppercase tracking-wider text-muted-foreground">Distribuzione delle azioni</div>
          {totalActions === 0 ? (
            <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-[color:var(--hairline)] text-[12px] text-muted-foreground">Dati in raccolta</div>
          ) : (
            <div className="relative h-[220px]">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={selectedRows} dataKey="actions" nameKey="label" innerRadius={55} outerRadius={82} paddingAngle={2} isAnimationActive={false}>
                    {selectedRows.map((row) => <Cell key={row.key} fill={row.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#17171c', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, fontSize: 12 }} />
                  <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-x-0 top-[82px] text-center">
                <div className="text-[20px] font-semibold text-[color:var(--text-hi)]">{totalActions}</div>
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">azioni</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-[color:var(--hairline)] pt-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Andamento giornaliero</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">Misurazione completa dal 22 agosto</div>
          </div>
          <div className="grid min-h-10 grid-cols-2 rounded-lg border border-[color:var(--hairline)] bg-[color:var(--surface-2)] p-1">
            {(['users', 'actions'] as const).map((metric) => (
              <button key={metric} type="button" onClick={() => setTrendMetric(metric)} className={`rounded-md px-3 py-1 text-[11px] transition-colors ${trendMetric === metric ? 'bg-white/10 text-[color:var(--text-hi)]' : 'text-muted-foreground'}`}>
                {metric === 'users' ? 'Utenti' : 'Azioni'}
              </button>
            ))}
          </div>
        </div>
        <div className="h-[250px] sm:h-[280px]">
          <ResponsiveContainer>
            <LineChart data={daily} margin={{ top: 8, right: 12, bottom: 8, left: -16 }}>
              <CartesianGrid stroke="rgba(120,120,140,0.12)" vertical={false} />
              <XAxis dataKey="day" tickFormatter={formatDay} tick={{ fontSize: 11, fill: 'var(--text-lo, #888)' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-lo, #888)' }} axisLine={false} tickLine={false} />
              <Tooltip labelFormatter={(label) => formatDay(String(label))} contentStyle={{ background: '#17171c', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {FEATURES.map((feature) => (
                <Line key={feature.key} type="monotone" dataKey={`${feature.key}${trendMetric === 'users' ? 'Users' : 'Actions'}`} name={feature.label} stroke={feature.color} strokeWidth={2} dot={daily.length < 10} activeDot={{ r: 4 }} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
