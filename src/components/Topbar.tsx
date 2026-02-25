'use client';

import { useState } from 'react';
import { Search, Bell, Settings } from 'lucide-react';
import Link from 'next/link';

interface TopbarProps {
  title?: string;
}

export function Topbar({ title = 'LΛVIKΛ' }: TopbarProps) {
  const [searchOpen, setSearchOpen] = useState(false);

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
          <div className={`relative ${searchOpen ? 'w-full lg:w-64' : 'w-auto'}`}>
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              <Search className="w-5 h-5" />
            </button>
            {searchOpen && (
              <input
                type="text"
                placeholder="Quick search..."
                autoFocus
                className="absolute left-0 top-1/2 -translate-y-1/2 w-full lg:w-64 px-3 py-2 ml-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            )}
          </div>

          <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
          </button>

          <div className="h-6 w-px bg-border mx-1" />

          <Link
            href="/settings"
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            title="Impostazioni"
          >
            <Settings className="w-5 h-5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
