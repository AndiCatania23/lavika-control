'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { StatusPill } from '@/components/StatusPill';
import { Users, Database, HardDrive, LogOut, Settings } from 'lucide-react';

function IphoneToggle({ enabled, onClick }: { enabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${
        enabled ? 'bg-primary' : 'bg-muted-foreground/30'
      }`}
    >
      <div
        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-300 ${
          enabled ? 'translate-x-6' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

export default function SettingsPage() {
  const { logout } = useAuth();
  const router = useRouter();
  const [featureFlags, setFeatureFlags] = useState({
    darkMode: true,
    betaFeatures: false,
    analytics: true,
    notifications: true,
  });

  const adminUsers: { id: string; name: string; email: string; role: string }[] = [];

  const integrations = [
    { name: 'Supabase', status: 'active' as const, details: 'Database PostgreSQL' },
    { name: 'R2 Storage', status: 'active' as const, details: 'Object storage S3-compatibile' },
    { name: 'VPS Runner', status: 'active' as const, details: 'Istanza EC2 per job processing' },
  ];

  const toggleFlag = (flag: keyof typeof featureFlags) => {
    setFeatureFlags(prev => ({ ...prev, [flag]: !prev[flag] }));
  };

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">Impostazioni</h1>
        <p className="text-muted-foreground">Gestisci le impostazioni dell'applicazione</p>
      </div>

      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <Users className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Ruoli e Permessi</h3>
        </div>
        <div className="space-y-3">
          {adminUsers.map(user => (
            <div key={user.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
              <div>
                <div className="font-medium text-foreground">{user.name}</div>
                <div className="text-sm text-muted-foreground">{user.email}</div>
              </div>
              <span className={`text-xs px-2 py-1 rounded ${
                user.role === 'admin' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              }`}>
                {user.role.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <Database className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Integrazioni</h3>
        </div>
        <div className="space-y-4">
          {integrations.map(integration => (
            <div key={integration.name} className="flex items-center justify-between py-3 border-b border-border last:border-0">
              <div className="flex items-center gap-3">
                {integration.name === 'Supabase' && <Database className="w-4 h-4 text-muted-foreground" />}
                {integration.name === 'R2 Storage' && <HardDrive className="w-4 h-4 text-muted-foreground" />}
                {integration.name === 'VPS Runner' && <HardDrive className="w-4 h-4 text-muted-foreground" />}
                <div>
                  <div className="font-medium text-foreground">{integration.name}</div>
                  <div className="text-xs text-muted-foreground">{integration.details}</div>
                </div>
              </div>
              <StatusPill status={integration.status} size="sm" />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <Settings className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Funzionalità</h3>
        </div>
        <div className="space-y-4">
          {Object.entries(featureFlags).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between py-3 border-b border-border last:border-0">
              <div>
                <div className="font-medium text-foreground">
                  {key === 'darkMode' && 'Modalità Scura'}
                  {key === 'betaFeatures' && 'Funzionalità Beta'}
                  {key === 'analytics' && 'Analisi'}
                  {key === 'notifications' && 'Notifiche'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {key === 'darkMode' && 'Abilita il tema scuro per l interfaccia'}
                  {key === 'betaFeatures' && 'Abilita funzionalità sperimentali'}
                  {key === 'analytics' && 'Abilita analisi utilizzo'}
                  {key === 'notifications' && 'Abilita notifiche email'}
                </div>
              </div>
              <IphoneToggle
                enabled={value}
                onClick={() => toggleFlag(key as keyof typeof featureFlags)}
              />
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={async () => {
          await logout();
          router.push('/login');
        }}
        className="w-full flex items-center justify-center gap-2 py-3 bg-destructive/10 text-destructive rounded-lg font-medium hover:bg-destructive/20 transition-colors"
      >
        <LogOut className="w-5 h-5" />
        Esci dall'applicazione
      </button>
    </div>
  );
}
