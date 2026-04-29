'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileEdit,
  Workflow,
  Users,
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
  Pill,
  CalendarClock,
  ImageIcon,
  AlertTriangle,
  Bell,
  Flag,
  Megaphone,
} from 'lucide-react';

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  children?: Array<{ href: string; label: string; icon: typeof LayoutDashboard; match?: string[] }>;
  match?: string[];
};

const NAV: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Oggi',
    icon: LayoutDashboard,
    match: ['/dashboard', '/analytics'],
  },
  {
    href: '/pills',
    label: 'Editoriale',
    icon: FileEdit,
    match: ['/pills', '/palinsesto-home', '/media'],
    children: [
      { href: '/pills',            label: 'Pillole',   icon: Pill },
      { href: '/palinsesto-home',  label: 'Palinsesto',icon: CalendarClock },
      { href: '/media',            label: 'Media',     icon: ImageIcon },
    ],
  },
  {
    href: '/social',
    label: 'Social',
    icon: Megaphone,
    match: ['/social'],
  },
  {
    href: '/jobs',
    label: 'Sync & Jobs',
    icon: Workflow,
    match: ['/jobs', '/errors', '/notifications'],
    children: [
      { href: '/jobs',          label: 'Job / Runs',     icon: Workflow },
      { href: '/errors',        label: 'Errori',         icon: AlertTriangle },
      { href: '/notifications', label: 'Notifiche',      icon: Bell },
    ],
  },
  {
    href: '/users',
    label: 'Utenti',
    icon: Users,
    match: ['/users'],
  },
  {
    href: '/reports',
    label: 'Segnalazioni',
    icon: Flag,
    match: ['/reports'],
  },
  {
    href: '/shop',
    label: 'Shop',
    icon: ShoppingBag,
    match: ['/shop'],
  },
];

function isItemActive(pathname: string, item: NavItem): boolean {
  if (item.match?.some(m => pathname === m || pathname.startsWith(m + '/'))) return true;
  return pathname === item.href;
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 h-screen bg-card border-r border-[color:var(--hairline)] overflow-hidden transition-[width] duration-200 ${collapsed ? 'w-[72px]' : 'w-[248px]'}`}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-[color:var(--hairline-s)]">
          {!collapsed && (
            <span className="text-[18px] font-semibold tracking-tight text-[color:var(--text-hi)]">
              LΛVIKΛ
            </span>
          )}
          <button
            onClick={() => setCollapsed(v => !v)}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-[color:var(--surface-2)] rounded-md transition-colors"
            aria-label={collapsed ? 'Espandi' : 'Comprimi'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {NAV.map(item => {
            const active = isItemActive(pathname, item);
            const Icon = item.icon;
            const showChildren = !collapsed && item.children && active;
            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 h-10 px-3 rounded-lg transition-colors ${
                    active
                      ? 'bg-[color:var(--accent-soft)] text-[color:var(--primary)]'
                      : 'text-muted-foreground hover:text-foreground hover:bg-[color:var(--surface-2)]'
                  }`}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={1.75} />
                  {!collapsed && (
                    <span className="text-[13px] font-medium truncate">{item.label}</span>
                  )}
                </Link>
                {showChildren && (
                  <div className="ml-6 mt-0.5 mb-1 pl-3 border-l border-[color:var(--hairline-s)] space-y-0.5">
                    {item.children!.map(sub => {
                      const subActive = pathname === sub.href || pathname.startsWith(sub.href + '/');
                      const SubIcon = sub.icon;
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          className={`flex items-center gap-2.5 h-8 px-2.5 rounded-md transition-colors text-[12.5px] ${
                            subActive
                              ? 'text-[color:var(--primary)] font-medium'
                              : 'text-muted-foreground hover:text-foreground hover:bg-[color:var(--surface-2)]'
                          }`}
                        >
                          <SubIcon className="w-[14px] h-[14px] shrink-0" strokeWidth={1.75} />
                          <span className="truncate">{sub.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="p-2 border-t border-[color:var(--hairline-s)]">
          <Link
            href="/settings"
            className={`flex items-center gap-3 h-10 px-3 rounded-lg transition-colors text-[13px] ${
              pathname.startsWith('/settings')
                ? 'text-[color:var(--primary)]'
                : 'text-muted-foreground hover:text-foreground hover:bg-[color:var(--surface-2)]'
            }`}
            title={collapsed ? 'Impostazioni' : undefined}
          >
            <span className="inline-grid place-items-center w-[18px] h-[18px] shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </span>
            {!collapsed && <span className="font-medium">Impostazioni</span>}
          </Link>
        </div>
      </aside>

      {/* Mobile bottom tab bar (5 tab) */}
      <nav className="m-tabbar lg:hidden">
        {NAV.map(item => {
          const active = isItemActive(pathname, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="m-tab"
              data-active={active ? 'true' : 'false'}
            >
              <Icon className="w-5 h-5" strokeWidth={1.75} />
              <span className="truncate max-w-full px-1">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
