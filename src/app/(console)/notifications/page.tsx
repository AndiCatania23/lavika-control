'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppNotification, getNotificationsData } from '@/lib/data';
import { Bell, CircleCheck, TriangleAlert, Ban, Clapperboard, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 20;

function fmt(iso: string) {
  return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function iconFor(type: AppNotification['type']) {
  switch (type) {
    case 'new_video':     return <Clapperboard className="w-4 h-4" style={{ color: 'var(--accent-raw)' }} />;
    case 'run_success':   return <CircleCheck   className="w-4 h-4" style={{ color: 'var(--ok)' }} />;
    case 'run_failed':    return <TriangleAlert className="w-4 h-4" style={{ color: 'var(--danger)' }} />;
    case 'run_cancelled': return <Ban           className="w-4 h-4" style={{ color: 'var(--warn)' }} />;
    default:              return <Bell          className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />;
  }
}

function bgFor(type: AppNotification['type']): string {
  switch (type) {
    case 'new_video':     return 'color-mix(in oklab, var(--accent-raw) 12%, transparent)';
    case 'run_success':   return 'color-mix(in oklab, var(--ok) 12%, transparent)';
    case 'run_failed':    return 'color-mix(in oklab, var(--danger) 12%, transparent)';
    case 'run_cancelled': return 'color-mix(in oklab, var(--warn) 12%, transparent)';
    default:              return 'var(--card-muted)';
  }
}

export default function NotificationsPage() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    getNotificationsData(PAGE_SIZE, 0)
      .then(data => { setItems(data); setHasMore(data.length === PAGE_SIZE); })
      .catch(() => { setItems([]); setHasMore(false); })
      .finally(() => setLoading(false));
  }, []);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = await getNotificationsData(PAGE_SIZE, items.length);
      setItems(prev => {
        const map = new Map<string, AppNotification>();
        for (const it of prev) map.set(it.id, it);
        for (const it of next) map.set(it.id, it);
        return Array.from(map.values()).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      });
      setHasMore(next.length === PAGE_SIZE);
    } finally { setLoadingMore(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-2 border-[color:var(--accent-raw)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="vstack" style={{ gap: 'var(--s4)' }}>
      {items.length === 0 ? (
        <div className="card card-body text-center">
          <Bell className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
          <p className="typ-caption">Nessuna notifica disponibile.</p>
        </div>
      ) : (
        <>
          <div className="vstack-tight">
            {items.map(item => (
              <Link
                key={item.id}
                href={item.href}
                className="card card-hover card-body"
                style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}
              >
                <span
                  className="shrink-0 inline-grid place-items-center rounded-[var(--r-sm)]"
                  style={{ width: 36, height: 36, background: bgFor(item.type) }}
                >
                  {iconFor(item.type)}
                </span>
                <div className="grow min-w-0">
                  <div className="typ-label">{item.title}</div>
                  <div className="typ-caption truncate-2 mt-0.5">{item.message}</div>
                  <div className="typ-caption mt-1" style={{ fontSize: 11 }}>{fmt(item.timestamp)}</div>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0 mt-1" style={{ color: 'var(--text-muted)' }} />
              </Link>
            ))}
          </div>

          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="btn btn-ghost"
              style={{ width: '100%' }}
            >
              {loadingMore ? 'Caricamento…' : 'Carica altre notifiche'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
