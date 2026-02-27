'use client';

import type { DevCard, DevFeedItem } from '@/lib/data/devConsole';

interface FeedCardProps {
  card: DevCard;
  items: DevFeedItem[];
}

const dateFormatter = new Intl.DateTimeFormat('it-IT', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function FeedCard({ card, items }: FeedCardProps) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">{card.title}</h3>
        <span className="text-xs text-muted-foreground">{items.length} log</span>
      </div>

      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground py-3">Nessun log disponibile</div>
      ) : (
        <div className="space-y-2 max-h-52 overflow-auto pr-1">
          {items.map(item => (
            <div key={item.id} className="rounded-md border border-border/60 p-2">
              <div className="text-xs text-muted-foreground mb-1">
                {dateFormatter.format(new Date(item.created_at))}
              </div>
              <div className="text-sm text-foreground font-medium line-clamp-1">{item.title}</div>
              {item.description && (
                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
