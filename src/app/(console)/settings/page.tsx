'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { StatusPill } from '@/components/StatusPill';
import { Users, Database, HardDrive, LogOut, Settings, ShieldCheck } from 'lucide-react';

interface AdminMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
}

function IphoneToggle({ enabled, onClick }: { enabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={enabled}
      className={`relative h-6 w-12 shrink-0 overflow-hidden rounded-full transition-colors duration-300 ${
        enabled ? 'bg-primary' : 'bg-muted-foreground/30'
      }`}
    >
      <div
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-300 ${
          enabled ? 'translate-x-6' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export default function SettingsPage() {
  const { signOut } = useAuth();
  const { isDark, setTheme } = useTheme();
  const [featureFlags, setFeatureFlags] = useState({
    betaFeatures: false,
    analytics: true,
    notifications: true,
  });
  const [adminUsers, setAdminUsers] = useState<AdminMember[]>([]);
  const [adminLoading, setAdminLoading] = useState(true);

  const integrations = [
    { name: 'Supabase', status: 'active' as const, details: 'Database PostgreSQL' },
    { name: 'R2 Storage', status: 'active' as const, details: 'Object storage S3-compatibile' },
    { name: 'VPS Runner', status: 'active' as const, details: 'Istanza EC2 per job processing' },
  ];

  useEffect(() => {
    const loadAdmins = async () => {
      try {
        const response = await fetch('/api/dev/admins', { cache: 'no-store' });
        if (!response.ok) {
          setAdminUsers([]);
          return;
        }

        const data = await response.json() as AdminMember[];
        setAdminUsers(Array.isArray(data) ? data : []);
      } catch {
        setAdminUsers([]);
      } finally {
        setAdminLoading(false);
      }
    };

    void loadAdmins();
  }, []);

  const toggleFlag = (flag: keyof typeof featureFlags) => {
    setFeatureFlags(prev => ({ ...prev, [flag]: !prev[flag] }));
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-gradient-to-br from-card via-card to-muted/40 p-6">
        <h1 className="text-2xl font-bold text-foreground">Impostazioni</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pannello configurazione e sicurezza della console operativa.</p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-6 flex items-center gap-3">
              <Settings className="h-5 w-5 text-amber-500" />
              <h3 className="font-semibold text-foreground">Funzionalita</h3>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background/70 px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">Modalita Scura</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      isDark ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                    }`}>
                      {isDark ? 'DARK' : 'LIGHT'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Cambia il tema globale dell&apos;app tra dark e light.</p>
                </div>
                <IphoneToggle enabled={isDark} onClick={() => setTheme(isDark ? 'light' : 'dark')} />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background/70 px-4 py-3">
                <div>
                  <p className="font-medium text-foreground">Funzionalita Beta</p>
                  <p className="text-xs text-muted-foreground">Abilita componenti sperimentali riservati al team.</p>
                </div>
                <IphoneToggle enabled={featureFlags.betaFeatures} onClick={() => toggleFlag('betaFeatures')} />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background/70 px-4 py-3">
                <div>
                  <p className="font-medium text-foreground">Analisi</p>
                  <p className="text-xs text-muted-foreground">Mostra pannelli avanzati e metriche aggregate.</p>
                </div>
                <IphoneToggle enabled={featureFlags.analytics} onClick={() => toggleFlag('analytics')} />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background/70 px-4 py-3">
                <div>
                  <p className="font-medium text-foreground">Notifiche</p>
                  <p className="text-xs text-muted-foreground">Attiva avvisi e-mail per eventi operativi critici.</p>
                </div>
                <IphoneToggle enabled={featureFlags.notifications} onClick={() => toggleFlag('notifications')} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-6 flex items-center gap-3">
              <Database className="h-5 w-5 text-indigo-500" />
              <h3 className="font-semibold text-foreground">Integrazioni</h3>
            </div>
            <div className="space-y-2">
              {integrations.map(integration => (
                <div
                  key={integration.name}
                  className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background/70 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    {integration.name === 'Supabase' && <Database className="h-4 w-4 text-indigo-500" />}
                    {integration.name === 'R2 Storage' && <HardDrive className="h-4 w-4 text-violet-500" />}
                    {integration.name === 'VPS Runner' && <HardDrive className="h-4 w-4 text-emerald-500" />}
                    <div>
                      <p className="font-medium text-foreground">{integration.name}</p>
                      <p className="text-xs text-muted-foreground">{integration.details}</p>
                    </div>
                  </div>
                  <StatusPill status={integration.status} size="sm" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-6 flex items-center gap-3">
              <Users className="h-5 w-5 text-sky-500" />
              <h3 className="font-semibold text-foreground">Ruoli e Permessi</h3>
            </div>

            {adminLoading ? (
              <div className="flex h-24 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : adminUsers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-background/60 p-4 text-sm text-muted-foreground">
                Nessun admin trovato su `dev_admins`.
              </div>
            ) : (
              <div className="space-y-2">
                {adminUsers.map(user => (
                  <div key={user.id} className="rounded-xl border border-border bg-background/70 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        {user.role.toUpperCase()}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {user.permissions.length > 0 ? user.permissions.map(permission => (
                        <span
                          key={`${user.id}-${permission}`}
                          className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {permission}
                        </span>
                      )) : (
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                          full_access
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-6 flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
              <h3 className="font-semibold text-foreground">Sicurezza Account</h3>
            </div>
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-400">
                Sessione autenticata e permessi amministratore verificati.
              </div>
              <button
                onClick={async () => {
                  await signOut();
                }}
                className="w-full rounded-xl border border-destructive/30 bg-destructive/10 py-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20"
              >
                <span className="inline-flex items-center gap-2">
                  <LogOut className="h-4 w-4" />
                  Esci dall&apos;applicazione
                </span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
