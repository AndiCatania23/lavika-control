'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SectionHeader } from '@/components/SectionHeader';
import { AppNotification, getNotificationsData } from '@/lib/data';
import { Bell, CircleCheck, TriangleAlert, Ban, Clapperboard } from 'lucide-react';

const PAGE_SIZE = 20;

function formatTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getNotificationIcon(type: AppNotification['type']) {
  switch (type) {
    case 'new_video':
      return <Clapperboard className="w-4 h-4 text-primary" />;
    case 'run_success':
      return <CircleCheck className="w-4 h-4 text-green-500" />;
    case 'run_failed':
      return <TriangleAlert className="w-4 h-4 text-red-500" />;
    case 'run_cancelled':
      return <Ban className="w-4 h-4 text-yellow-500" />;
    default:
      return <Bell className="w-4 h-4 text-muted-foreground" />;
  }
}

export default function NotificationsPage() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    getNotificationsData(PAGE_SIZE, 0)
      .then(data => {
        setItems(data);
        setHasMore(data.length === PAGE_SIZE);
      })
      .catch(() => {
        setItems([]);
        setHasMore(false);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextItems = await getNotificationsData(PAGE_SIZE, items.length);
      setItems(prev => {
        const map = new Map<string, AppNotification>();
        for (const item of prev) map.set(item.id, item);
        for (const item of nextItems) map.set(item.id, item);
        return Array.from(map.values()).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      });
      setHasMore(nextItems.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Notifiche"
        description="Storico notifiche su run, errori e nuovi contenuti"
      />

      {items.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-6 text-center text-muted-foreground">
          Nessuna notifica disponibile
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <Link
              key={item.id}
              href={item.href}
              className="bg-card border border-border rounded-lg p-3 flex items-start gap-3 hover:border-primary/50 transition-colors"
            >
              <div className="pt-0.5">{getNotificationIcon(item.type)}</div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">{item.title}</div>
                <div className="text-xs text-muted-foreground mt-1">{item.message}</div>
                <div className="text-[11px] text-muted-foreground mt-1">{formatTimestamp(item.timestamp)}</div>
              </div>
            </Link>
          ))}

          {hasMore && (
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="w-full py-2 text-sm text-primary hover:text-primary/80 border border-dashed border-border rounded-lg disabled:opacity-50"
            >
              {loadingMore ? 'Caricamento...' : 'Carica altre notifiche'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
