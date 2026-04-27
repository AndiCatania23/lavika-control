'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { AppShell } from '@/components/AppShell';

/* Map path → page title shown in chrome.
   Kept here because titles are cross-cutting and small pages shouldn't each import the shell.
   For deep pages (e.g. /pills/[id]) the pages can override by setting document.title
   or we extend later with a setter in context. */
function resolveTitle(pathname: string): { title: string; subtitle?: string } {
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) return { title: 'Oggi', subtitle: 'Azioni e stato' };
  if (pathname.startsWith('/analytics'))       return { title: 'Analytics', subtitle: 'Metriche complete' };
  if (pathname.startsWith('/pills'))           return { title: 'Pillole',   subtitle: 'Editoriale' };
  if (pathname.startsWith('/palinsesto-home')) return { title: 'Palinsesto',subtitle: 'Homepage app' };
  if (pathname.startsWith('/media'))           return { title: 'Media',     subtitle: 'Copertine e players' };
  if (pathname.startsWith('/jobs'))            return { title: 'Job & Runs',subtitle: 'Sync daemon' };
  if (pathname.startsWith('/errors'))          return { title: 'Errori',    subtitle: 'Log e triage' };
  if (pathname.startsWith('/notifications'))   return { title: 'Notifiche', subtitle: 'Storico' };
  if (pathname.startsWith('/users'))           return { title: 'Utenti',    subtitle: 'Moderazione' };
  if (pathname.startsWith('/reports'))         return { title: 'Segnalazioni', subtitle: 'Moderazione UGC' };
  if (pathname.startsWith('/sessions'))        return { title: 'Sessioni',  subtitle: 'Token attivi' };
  if (pathname.startsWith('/shop'))            return { title: 'Shop',      subtitle: 'E-commerce' };
  if (pathname.startsWith('/settings'))        return { title: 'Impostazioni' };
  if (pathname.startsWith('/team'))            return { title: 'Team' };
  return { title: 'LAVIKA Control' };
}

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[color:var(--accent-raw)] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center p-8 max-w-md">
          <h1 className="typ-h1 mb-2">Accesso negato</h1>
          <p className="typ-caption">Non hai i permessi per accedere a questa area.</p>
        </div>
      </div>
    );
  }

  const { title, subtitle } = resolveTitle(pathname);

  return (
    <AppShell title={title} subtitle={subtitle}>
      {children}
    </AppShell>
  );
}
