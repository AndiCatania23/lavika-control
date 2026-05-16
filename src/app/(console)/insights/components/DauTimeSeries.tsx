'use client';

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import type { DauPoint } from '@/lib/insights/queries';

interface Props {
  series: DauPoint[];
}

const COLORS = {
  total: '#e8701a',
  registered: '#38bdf8',
  guest: '#a78bfa',
};

function formatTick(d: string): string {
  // YYYY-MM-DD → DD/MM
  const parts = d.split('-');
  if (parts.length < 3) return d;
  return `${parts[2]}/${parts[1]}`;
}

export function DauTimeSeries({ series }: Props) {
  if (series.length === 0) {
    return <div className="text-[13px] text-muted-foreground">Nessun dato.</div>;
  }

  return (
    <div className="w-full h-[280px]">
      <ResponsiveContainer>
        <LineChart data={series} margin={{ top: 8, right: 12, bottom: 8, left: -16 }}>
          <CartesianGrid stroke="rgba(120,120,140,0.12)" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={formatTick}
            tick={{ fontSize: 11, fill: 'var(--text-lo, #888)' }}
            tickLine={false}
            axisLine={{ stroke: 'rgba(120,120,140,0.2)' }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--text-lo, #888)' }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--surface-2, #1a1a1f)',
              border: '1px solid var(--hairline, rgba(255,255,255,0.08))',
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(label) => formatTick(label as string)}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          <Line
            type="monotone"
            dataKey="total"
            name="Totale"
            stroke={COLORS.total}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="registered"
            name="Registrati"
            stroke={COLORS.registered}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="guest"
            name="Guest"
            stroke={COLORS.guest}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            activeDot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
