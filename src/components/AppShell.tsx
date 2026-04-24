'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileEdit,
  Workflow,
  Users,
  ShoppingBag,
  Bell,
  Settings,
  Sun,
  Moon,
  Search,
  CircleCheck,
  TriangleAlert,
  Ban,
  Clapperboard,
  X,
  Pill,
  CalendarClock,
  ImageIcon,
  AlertTriangle,
} from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { getNotificationsData, AppNotification, getGlobalSearchData, GlobalSearchResult } from '@/lib/data';

/* ==================================================================
   NAVIGATION model
   5 aree: Oggi · Editoriale · Sync & Jobs · Utenti · Shop
   ================================================================== */

type NavAreaKey = 'oggi' | 'editoriale' | 'sync' | 'utenti' | 'shop';

interface NavArea {
  key: NavAreaKey;
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  matchPrefixes: string[];
}

const AREAS: NavArea[] = [
  { key: 'oggi',       href: '/dashboard',      label: 'Oggi',       icon: LayoutDashboard, matchPrefixes: ['/dashboard', '/analytics'] },
  { key: 'editoriale', href: '/pills',          label: 'Editoriale', icon: FileEdit,        matchPrefixes: ['/pills', '/palinsesto-home', '/media', '/home-schedule'] },
  { key: 'sync',       href: '/jobs',           label: 'Sync & Jobs',icon: Workflow,        matchPrefixes: ['/jobs', '/errors', '/notifications'] },
  { key: 'utenti',     href: '/users',          label: 'Utenti',     icon: Users,           matchPrefixes: ['/users', '/sessions'] },
  { key: 'shop',       href: '/shop',           label: 'Shop',       icon: ShoppingBag,     matchPrefixes: ['/shop'] },
];

function matchActive(pathname: string, area: NavArea): boolean {
  return area.matchPrefixes.some(p => pathname === p || pathname.startsWith(p + '/'));
}

/* ==================================================================
   AppShell — wrapper that provides chrome around content
   Mobile: top translucent bar + bottom tab bar
   Wide: side rail / side nav + top chrome (same top bar, fluid)
   ================================================================== */

interface AppShellProps {
  title: string;
  subtitle?: string;
  leading?: ReactNode;            // left-side element in top chrome (e.g. back button)
  trailing?: ReactNode;           // right-side element in top chrome (e.g. page action)
  children: ReactNode;
}

export function AppShell({ title, subtitle, leading, trailing, children }: AppShellProps) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);

  // Load notifications (light poll on visible)
  useEffect(() => {
    const load = () => { getNotificationsData(3).then(setNotifications).catch(() => {}); };
    load();
    let t: number | null = null;
    const start = () => { if (t == null) t = window.setInterval(load, 3 * 60 * 1000); };
    const stop  = () => { if (t != null) { window.clearInterval(t); t = null; } };
    const onVis = () => document.visibilityState === 'visible' ? (load(), start()) : stop();
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  // Close notif on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!notifRef.current) return;
      if (!notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="shell">
      {/* ────── Side rail / side nav (wide only) ────── */}
      <aside className="siderail">
        <div className="siderail-brand">
          {/* Brand mark: only "L" mono on narrow rail, full LAVIKA on expanded */}
          <span className="brand-mark text-[20px] font-bold tracking-tight text-[color:var(--text-hi)]">L</span>
          <span className="brand-full hidden xl:inline text-[22px] font-bold tracking-tight text-[color:var(--text-hi)]">LΛVIKΛ</span>
        </div>
        <nav className="flex flex-col gap-1 flex-1">
          {AREAS.map(a => {
            const active = matchActive(pathname, a);
            const Icon = a.icon;
            return (
              <Link
                key={a.key}
                href={a.href}
                className="siderail-item"
                data-active={active ? 'true' : 'false'}
                title={a.label}
              >
                <Icon className="w-[20px] h-[20px] shrink-0" strokeWidth={1.75} />
                <span className="siderail-item-label">{a.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col gap-1 pt-3 border-t border-[color:var(--hairline-soft)]">
          <Link
            href="/settings"
            className="siderail-item"
            data-active={pathname.startsWith('/settings') ? 'true' : 'false'}
            title="Impostazioni"
          >
            <Settings className="w-[20px] h-[20px] shrink-0" strokeWidth={1.75} />
            <span className="siderail-item-label">Impostazioni</span>
          </Link>
        </div>
      </aside>

      {/* ────── Main column ────── */}
      <div className="flex flex-col min-w-0">
        {/* Top chrome (visible all viewports) */}
        <header className="topchrome">
          {leading}
          <div className="topchrome-title">
            <div className="truncate">{title}</div>
            {subtitle && <span className="subtitle truncate">{subtitle}</span>}
          </div>

          <div className="flex items-center gap-1">
            {trailing}

            {/* Search (quick jump) — hidden on narrow mobile, visible from 480px+ */}
            <button
              onClick={() => setSearchOpen(true)}
              className="hidden xs:inline-flex w-[40px] h-[40px] md:w-[38px] md:h-[38px] items-center justify-center rounded-lg text-[color:var(--text-muted)] hover:text-[color:var(--text-hi)] hover:bg-[color:var(--card-muted)]"
              aria-label="Ricerca rapida"
              style={{ display: 'inline-flex' }}
            >
              <Search className="w-[18px] h-[18px]" strokeWidth={1.75} />
            </button>

            {/* Notifications bell */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen(v => !v)}
                className="relative w-[40px] h-[40px] md:w-[38px] md:h-[38px] inline-flex items-center justify-center rounded-lg text-[color:var(--text-muted)] hover:text-[color:var(--text-hi)] hover:bg-[color:var(--card-muted)]"
                aria-label="Notifiche"
              >
                <Bell className="w-[18px] h-[18px]" strokeWidth={1.75} />
                {notifications.length > 0 && (
                  <span className="absolute top-[9px] right-[10px] w-[8px] h-[8px] rounded-full bg-[color:var(--danger)] ring-2 ring-[color:var(--canvas)]" />
                )}
              </button>
              {notifOpen && <NotificationsDropdown items={notifications} onClose={() => setNotifOpen(false)} />}
            </div>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="w-[40px] h-[40px] md:w-[38px] md:h-[38px] inline-flex items-center justify-center rounded-lg text-[color:var(--text-muted)] hover:text-[color:var(--text-hi)] hover:bg-[color:var(--card-muted)]"
              aria-label="Cambia tema"
              title={theme === 'dark' ? 'Passa a light' : 'Passa a dark'}
            >
              {theme === 'dark' ? <Sun className="w-[18px] h-[18px]" strokeWidth={1.75} /> : <Moon className="w-[18px] h-[18px]" strokeWidth={1.75} />}
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="content">
          {children}
        </main>
      </div>

      {/* ────── Bottom tab bar (mobile only) ────── */}
      <nav className="tabbar">
        {AREAS.map(a => {
          const active = matchActive(pathname, a);
          const Icon = a.icon;
          return (
            <Link
              key={a.key}
              href={a.href}
              className="tabbar-tab"
              data-active={active ? 'true' : 'false'}
            >
              <Icon className="w-[22px] h-[22px]" strokeWidth={1.75} />
              <span className="truncate w-full px-1">{a.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* ────── Global search sheet ────── */}
      {searchOpen && <SearchSheet onClose={() => setSearchOpen(false)} />}
    </div>
  );
}

/* ==================================================================
   Sub-components
   ================================================================== */

function NotificationsDropdown({ items, onClose }: { items: AppNotification[]; onClose: () => void }) {
  const iconFor = (t: AppNotification['type']) => {
    switch (t) {
      case 'new_video':     return <Clapperboard className="w-4 h-4 text-[color:var(--accent-raw)]" />;
      case 'run_success':   return <CircleCheck className="w-4 h-4 text-[color:var(--ok)]" />;
      case 'run_failed':    return <TriangleAlert className="w-4 h-4 text-[color:var(--danger)]" />;
      case 'run_cancelled': return <Ban className="w-4 h-4 text-[color:var(--warn)]" />;
      default:              return <Bell className="w-4 h-4 text-[color:var(--text-muted)]" />;
    }
  };
  const fmt = (iso: string) => new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="absolute right-0 top-full mt-2 w-[min(92vw,22rem)] card shadow-[var(--shadow-card-hi)] overflow-hidden z-40">
      <div className="card-head">
        <span className="typ-micro">Ultime notifiche</span>
      </div>
      <div className="max-h-[60vh] overflow-y-auto">
        {items.length === 0 ? (
          <div className="p-4 typ-caption">Nessuna notifica recente</div>
        ) : (
          items.map(n => (
            <Link key={n.id} href={n.href} onClick={onClose} className="row block hover:bg-[color:var(--card-muted)] transition-colors grid-cols-[auto_1fr]">
              <div className="pt-0.5">{iconFor(n.type)}</div>
              <div className="min-w-0">
                <div className="typ-label truncate">{n.title}</div>
                <div className="typ-caption truncate-2">{n.message}</div>
                <div className="typ-caption" style={{ fontSize: 11 }}>{fmt(n.timestamp)}</div>
              </div>
            </Link>
          ))
        )}
      </div>
      <Link href="/notifications" onClick={onClose} className="block p-3 text-center typ-caption border-t border-[color:var(--hairline-soft)] hover:bg-[color:var(--card-muted)]">
        Tutte le notifiche
      </Link>
    </div>
  );
}

function SearchSheet({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = q.trim();
    if (!trimmed) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(() => {
      getGlobalSearchData(trimmed, 12)
        .then(r => setResults(r))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="Cerca">
        <div className="sheet-grip" />
        <div className="flex items-center gap-2 mb-3">
          <h2 className="typ-h2 grow">Cerca</h2>
          <button onClick={onClose} className="btn btn-quiet btn-icon btn-sm" aria-label="Chiudi">
            <X className="w-4 h-4" />
          </button>
        </div>
        <input
          autoFocus
          type="text"
          placeholder="Pagine, utenti, job..."
          value={q}
          onChange={e => setQ(e.target.value)}
          className="input mb-3"
        />
        <div className="min-h-[200px]">
          {loading && <div className="p-4 typ-caption">Cerco…</div>}
          {!loading && q && results.length === 0 && <div className="p-4 typ-caption">Nessun risultato</div>}
          {results.map(r => (
            <Link key={r.id} href={r.href} onClick={onClose} className="row block hover:bg-[color:var(--card-muted)]">
              <div className="min-w-0">
                <div className="typ-label truncate">{r.title}</div>
                <div className="typ-caption truncate">{r.type.toUpperCase()} · {r.subtitle}</div>
              </div>
            </Link>
          ))}
          {!q && <QuickJumpPages onPick={onClose} />}
        </div>
      </div>
    </>
  );
}

const QUICK_ITEMS: Array<{ id: string; href: string; title: string; icon: typeof LayoutDashboard }> = [
  { id: 'p1',  href: '/dashboard',       title: 'Oggi — Dashboard',    icon: LayoutDashboard },
  { id: 'p2',  href: '/pills',           title: 'Pillole',             icon: Pill },
  { id: 'p3',  href: '/palinsesto-home', title: 'Palinsesto Home',     icon: CalendarClock },
  { id: 'p4',  href: '/media',           title: 'Media — Copertine',   icon: ImageIcon },
  { id: 'p5',  href: '/jobs',            title: 'Job & Runs',          icon: Workflow },
  { id: 'p6',  href: '/errors',          title: 'Errori',              icon: AlertTriangle },
  { id: 'p7',  href: '/notifications',   title: 'Notifiche',           icon: Bell },
  { id: 'p8',  href: '/users',           title: 'Utenti',              icon: Users },
  { id: 'p9',  href: '/shop',            title: 'Shop',                icon: ShoppingBag },
  { id: 'p10', href: '/analytics',       title: 'Analytics complete',  icon: LayoutDashboard },
  { id: 'p11', href: '/settings',        title: 'Impostazioni',        icon: Settings },
];

function QuickJumpPages({ onPick }: { onPick: () => void }) {
  return (
    <div>
      <div className="typ-micro mb-2">Vai rapidamente a</div>
      {QUICK_ITEMS.map(q => {
        const Icon = q.icon;
        return (
          <Link key={q.id} href={q.href} onClick={onPick} className="row block hover:bg-[color:var(--card-muted)] grid-cols-[auto_1fr]">
            <Icon className="w-[18px] h-[18px] text-[color:var(--text-muted)]" strokeWidth={1.75} />
            <div className="typ-label truncate">{q.title}</div>
          </Link>
        );
      })}
    </div>
  );
}
