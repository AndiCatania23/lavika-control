'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { Kpi } from '@/lib/data';

interface KpiCardProps {
  kpi: Kpi;
}

export function KpiCard({ kpi }: KpiCardProps) {
  const maxValue = Math.max(...kpi.sparkline);
  const minValue = Math.min(...kpi.sparkline);
  const range = maxValue - minValue || 1;
  
  return (
    <div className="bg-card border border-border rounded-lg p-5 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <span className="text-sm text-muted-foreground">{kpi.title}</span>
        <div className={`flex items-center gap-1 text-xs ${
          kpi.deltaType === 'positive' ? 'text-green-500' : 
          kpi.deltaType === 'negative' ? 'text-red-500' : 'text-muted-foreground'
        }`}>
          {kpi.deltaType === 'positive' && <TrendingUp className="w-3 h-3" />}
          {kpi.deltaType === 'negative' && <TrendingDown className="w-3 h-3" />}
          {kpi.deltaType === 'neutral' && <Minus className="w-3 h-3" />}
          <span>{kpi.delta}</span>
        </div>
      </div>
      
      <div className="text-3xl font-semibold text-foreground mb-4">{kpi.value}</div>
      
      <div className="h-12 flex items-end gap-0.5">
        {kpi.sparkline.map((value, i) => (
          <div
            key={i}
            className="flex-1 bg-primary/40 rounded-t"
            style={{ height: `${((value - minValue) / range) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}
