'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  BarChart3, 
  Users, 
  Activity, 
  Workflow, 
  AlertTriangle, 
  Settings,
  ChevronLeft,
  ChevronRight,
  Home
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/analytics', label: 'Analisi', icon: BarChart3 },
  { href: '/users', label: 'Utenti', icon: Users },
  { href: '/sessions', label: 'Sessioni', icon: Activity },
  { href: '/jobs', label: 'Job', icon: Workflow },
  { href: '/errors', label: 'Errori', icon: AlertTriangle },
  { href: '/settings', label: 'Impostazioni', icon: Settings },
];

const mobileNavItems = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/analytics', label: 'Analisi', icon: BarChart3 },
  { href: '/users', label: 'Utenti', icon: Users },
  { href: '/sessions', label: 'Sessioni', icon: Activity },
  { href: '/jobs', label: 'Job', icon: Workflow },
  { href: '/errors', label: 'Errori', icon: AlertTriangle },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-40
        bg-card border-r border-border
        flex flex-col
        transition-all duration-300
        ${collapsed ? 'w-16' : 'w-64'}
        -translate-x-full lg:translate-x-0
      `}>
        <div className="flex items-center justify-between h-16 px-4 border-b border-border">
          {!collapsed && (
            <span className="text-lg font-semibold text-foreground">Lavika</span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 py-4 px-2 space-y-1">
          {navItems.map(item => {
            const isActive = pathname === item.href || 
              (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg
                  transition-colors
                  ${isActive 
                    ? 'bg-primary/10 text-primary' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }
                `}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
      </aside>

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border pb-safe">
        <div className="flex justify-around items-center h-16">
          {mobileNavItems.map(item => {
            const isActive = pathname === item.href || 
              (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex flex-col items-center justify-center flex-1 h-full
                  transition-colors
                  ${isActive 
                    ? 'text-primary' 
                    : 'text-muted-foreground'
                  }
                `}
              >
                <item.icon className="w-5 h-5" />
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
