'use client';

import { useState } from 'react';
import { SectionHeader } from '@/components/SectionHeader';
import { StatusPill } from '@/components/StatusPill';
import { Users, Database, HardDrive, ToggleLeft, ToggleRight } from 'lucide-react';

export default function SettingsPage() {
  const [featureFlags, setFeatureFlags] = useState({
    darkMode: true,
    betaFeatures: false,
    analytics: true,
    notifications: true,
  });

  const adminUsers = [
    { id: 'usr_001', name: 'Mario Rossi', email: 'mario.rossi@example.com', role: 'admin' },
    { id: 'usr_002', name: 'Giulia Bianchi', email: 'giulia.bianchi@example.com', role: 'viewer' },
  ];

  const integrations = [
    { name: 'Supabase', status: 'active' as const, details: 'PostgreSQL database' },
    { name: 'R2 Storage', status: 'active' as const, details: 'S3-compatible object storage' },
    { name: 'VPS Runner', status: 'active' as const, details: 'EC2 instance for job processing' },
  ];

  const toggleFlag = (flag: keyof typeof featureFlags) => {
    setFeatureFlags(prev => ({ ...prev, [flag]: !prev[flag] }));
  };

  return (
    <div className="space-y-8">
      <SectionHeader 
        title="Settings" 
        description="Manage your application settings"
      />

      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center gap-3 mb-6">
          <Users className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Roles & Permissions</h3>
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
          <h3 className="font-semibold text-foreground">Integrations</h3>
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
          <ToggleLeft className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Feature Flags</h3>
        </div>
        <div className="space-y-4">
          {Object.entries(featureFlags).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between py-3 border-b border-border last:border-0">
              <div>
                <div className="font-medium text-foreground">
                  {key === 'darkMode' && 'Dark Mode'}
                  {key === 'betaFeatures' && 'Beta Features'}
                  {key === 'analytics' && 'Analytics'}
                  {key === 'notifications' && 'Notifications'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {key === 'darkMode' && 'Enable dark theme for the UI'}
                  {key === 'betaFeatures' && 'Enable experimental features'}
                  {key === 'analytics' && 'Enable usage analytics'}
                  {key === 'notifications' && 'Enable email notifications'}
                </div>
              </div>
              <button
                onClick={() => toggleFlag(key as keyof typeof featureFlags)}
                className="text-primary transition-colors"
              >
                {value ? (
                  <ToggleRight className="w-8 h-5" />
                ) : (
                  <ToggleLeft className="w-8 h-5 text-muted-foreground" />
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
