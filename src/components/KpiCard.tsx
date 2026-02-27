'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { DevCard, DevCardValue } from '@/lib/data/devConsole';

interface KpiCardProps {
  card: DevCard & {
    value?: DevCardValue;
  };
}

export function KpiCard({ card }: KpiCardProps) {
  const val = card.value;
  
  const displayValue = val?.value_num?.toLocaleString('it-IT') || val?.value_text || '-';
  const deltaText = val?.delta_text || val?.delta_num?.toString() || '';
  const status = val?.status;
  
  const getDeltaColor = () => {
    if (!deltaText) return 'text-muted-foreground';
    if (val?.delta_direction === 'up') return 'text-green-500';
    if (val?.delta_direction === 'down') return 'text-red-500';
    return 'text-muted-foreground';
  };

  const getStatusBadge = () => {
    if (!status) return null;
    const colors = {
      ok: 'bg-green-500/10 text-green-500',
      warn: 'bg-yellow-500/10 text-yellow-500',
      error: 'bg-red-500/10 text-red-500',
    };
    return (
      <span className={`text-[10px] px-1.5 py-0.5 rounded ${colors[status]}`}>
        {status.toUpperCase()}
      </span>
    );
  };

  return (
    <div className="bg-card border border-border rounded-lg p-3 sm:p-4 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between mb-1.5">
        <span className="text-xs sm:text-sm text-muted-foreground line-clamp-1">{card.title}</span>
        {getStatusBadge()}
      </div>
      
      <div className="text-lg sm:text-2xl font-semibold text-foreground mb-1.5 sm:mb-2 leading-tight">
        {displayValue}
        {val?.unit && <span className="text-xs sm:text-sm font-normal text-muted-foreground ml-1">{val.unit}</span>}
      </div>
      
      {deltaText && (
        <div className={`flex items-center gap-1 text-xs ${getDeltaColor()}`}>
          {val?.delta_direction === 'up' && <TrendingUp className="w-3 h-3" />}
          {val?.delta_direction === 'down' && <TrendingDown className="w-3 h-3" />}
          {(!val?.delta_direction || val.delta_direction === 'flat') && <Minus className="w-3 h-3" />}
          <span>{deltaText}</span>
        </div>
      )}
    </div>
  );
}
