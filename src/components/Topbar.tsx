'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, Bell, Settings, CircleCheck, TriangleAlert, Ban, Clapperboard } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getNotificationsData, AppNotification, getGlobalSearchData, GlobalSearchResult } from '@/lib/data';

interface TopbarProps {
  title?: string;
}

const quickSearchItems: Array<{ id: string; href: string; title: string; keywords: string[] }> = [
  { id: 'page_dashboard', href: '/dashboard', title: 'Dashboard', keywords: ['home', 'overview'] },
  { id: 'page_analytics', href: '/analytics', title: 'Analisi', keywords: ['analytics', 'metriche', 'kpi'] },
  { id: 'page_users', href: '/users', title: 'Utenti', keywords: ['users', 'profili'] },
  { id: 'page_sessions', href: '/sessions', title: 'Sessioni', keywords: ['session', 'accessi', 'login'] },
  { id: 'page_jobs', href: '/jobs', title: 'Job', keywords: ['run', 'workflow', 'sync'] },
  { id: 'page_runs', href: '/jobs/runs', title: 'Esecuzioni Job', keywords: ['runs', 'esecuzioni'] },
  { id: 'page_errors', href: '/errors', title: 'Errori', keywords: ['error', 'warning', 'fail'] },
  { id: 'page_notifications', href: '/notifications', title: 'Notifiche', keywords: ['alert', 'campanella'] },
  { id: 'page_settings', href: '/settings', title: 'Impostazioni', keywords: ['settings', 'config'] },
];

export function Topbar({ title = 'LΛVIKΛ' }: TopbarProps) {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [searchResults, setSearchResults] = useState<GlobalSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const searchPanelRef = useRef<HTMLDivElement>(null);
  const notificationPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadNotifications = () => {
      getNotificationsData(3)
        .then(data => setNotifications(data))
        .catch(() => setNotifications([]));
    };

    loadNotifications();
    const interval = setInterval(loadNotifications, 15000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!searchPanelRef.current) return;
      if (!searchPanelRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
        setSearchValue('');
        setSearchResults([]);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!notificationPanelRef.current) return;
      if (!notificationPanelRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getNotificationIcon = (type: AppNotification['type']) => {
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
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  useEffect(() => {
    const query = searchValue.trim();
    if (!searchOpen || query.length === 0) {
      return;
    }

    const timeoutId = setTimeout(() => {
      const localItems: GlobalSearchResult[] = quickSearchItems
        .filter(item => {
          const q = query.toLowerCase();
          return item.title.toLowerCase().includes(q)
            || item.href.toLowerCase().includes(q)
            || item.keywords.some(keyword => keyword.toLowerCase().includes(q));
        })
        .map(item => ({
          id: item.id,
          type: 'page',
          title: item.title,
          subtitle: item.href,
          href: item.href,
        }));

      setSearchLoading(true);
      getGlobalSearchData(query, 12)
        .then(remoteItems => {
          const merged = [...remoteItems, ...localItems];
          const unique = new Map<string, GlobalSearchResult>();
          for (const item of merged) {
            if (!unique.has(item.id)) {
              unique.set(item.id, item);
            }
          }
          setSearchResults(Array.from(unique.values()).slice(0, 12));
        })
        .catch(() => {
          setSearchResults(localItems.slice(0, 12));
        })
        .finally(() => setSearchLoading(false));
    }, 220);

    return () => clearTimeout(timeoutId);
  }, [searchValue, searchOpen]);

  const handleSearchSelect = (href: string) => {
    router.push(href);
    setSearchOpen(false);
    setSearchValue('');
    setSearchResults([]);
  };

  const hasTypedQuery = searchValue.trim().length > 0;

  return (
    <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-20">
      <div className="h-full flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-foreground lg:hidden">{title}</h1>
          <span className="lg:hidden px-2 py-0.5 bg-yellow-500/10 text-yellow-500 text-xs font-medium rounded">DEV</span>
          <h1 className="text-lg font-semibold text-foreground hidden lg:block">{title}</h1>
          <span className="hidden lg:inline-block px-2.5 py-1 bg-yellow-500/10 text-yellow-500 text-xs font-medium rounded">DEV</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative" ref={searchPanelRef}>
            <button
              onClick={() => setSearchOpen(open => !open)}
              aria-label={searchOpen ? 'Chiudi ricerca' : 'Apri ricerca'}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              <Search className="w-5 h-5" />
            </button>

            {searchOpen && (
              <div className="fixed top-16 left-1/2 -translate-x-1/2 w-[min(92vw,22rem)] z-40 sm:absolute sm:top-full sm:left-0 sm:translate-x-0 sm:mt-2 sm:w-64">
                <div className="bg-card border border-border rounded-lg shadow-xl overflow-hidden">
                  <input
                    type="text"
                    placeholder="Cerca utenti, job, pagine..."
                    autoFocus
                    value={searchValue}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setSearchValue(nextValue);
                      if (nextValue.trim().length === 0) {
                        setSearchLoading(false);
                        setSearchResults([]);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && searchResults.length > 0) {
                        handleSearchSelect(searchResults[0].href);
                      }
                      if (event.key === 'Escape') {
                        setSearchOpen(false);
                        setSearchValue('');
                        setSearchResults([]);
                      }
                    }}
                    className="w-full px-3 py-2 text-sm bg-transparent border-b border-border text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />

                  {hasTypedQuery && (
                    <div className="max-h-72 overflow-y-auto">
                      {searchLoading ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">Ricerca in corso...</div>
                      ) : searchResults.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">Nessun risultato</div>
                      ) : (
                        searchResults.map(item => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleSearchSelect(item.href)}
                            className="w-full text-left px-3 py-2 border-b border-border last:border-b-0 hover:bg-muted/40"
                          >
                            <div className="text-sm text-foreground">{item.title}</div>
                            <div className="text-[11px] text-muted-foreground">{item.type.toUpperCase()} - {item.subtitle}</div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className={`${searchOpen ? 'hidden lg:flex' : 'flex'} items-center gap-3`}>
            <div className="relative" ref={notificationPanelRef}>
              <button
                onClick={() => setNotificationsOpen(open => !open)}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors relative"
                aria-label="Apri notifiche"
                aria-expanded={notificationsOpen}
              >
                <Bell className="w-5 h-5" />
                {notifications.length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </button>

              {notificationsOpen && (
                <div className="fixed left-3 right-3 top-16 bg-card border border-border rounded-lg shadow-xl z-40 overflow-hidden sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[22rem]">
                  <div className="px-3 py-2 border-b border-border text-xs font-medium text-muted-foreground">
                    Ultime notifiche
                  </div>

                  {notifications.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-muted-foreground">Nessuna notifica recente</div>
                  ) : (
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.map(notification => (
                        <Link
                          key={notification.id}
                          href={notification.href}
                          onClick={() => setNotificationsOpen(false)}
                          className="flex items-start gap-3 px-3 py-3 border-b border-border last:border-b-0 hover:bg-muted/40 transition-colors"
                        >
                          <div className="pt-0.5">{getNotificationIcon(notification.type)}</div>
                          <div className="min-w-0">
                            <div className="text-sm text-foreground leading-tight">{notification.title}</div>
                            <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{notification.message}</div>
                            <div className="text-[11px] text-muted-foreground mt-1">{formatTimestamp(notification.timestamp)}</div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}

                  <Link
                    href="/notifications"
                    onClick={() => setNotificationsOpen(false)}
                    className="block px-3 py-2 border-t border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                  >
                    Tutte le notifiche
                  </Link>
                </div>
              )}
            </div>

            <div className="h-6 w-px bg-border" />

            <Link
              href="/settings"
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              title="Impostazioni"
            >
              <Settings className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
