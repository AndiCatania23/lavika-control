'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getDashboardKpis, Kpi } from '@/lib/data';
import { systemStatus } from '@/mocks/kpis';
import { KpiCard } from '@/components/KpiCard';
import { SectionHeader } from '@/components/SectionHeader';
import { StatusPill } from '@/components/StatusPill';
import { ArrowRight } from 'lucide-react';

export default function DashboardPage() {
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardKpis().then(data => {
      setKpis(data.kpis);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <SectionHeader 
        title="Dashboard" 
        description="Overview of your platform performance"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map(kpi => (
          <KpiCard key={kpi.id} kpi={kpi} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">System Status</h3>
          </div>
          <div className="space-y-3">
            {systemStatus.map(service => (
              <div key={service.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-3">
                  <StatusPill status={service.status} size="sm" />
                  <span className="text-sm text-foreground">{service.name}</span>
                </div>
                <span className="text-xs text-muted-foreground">{service.latency}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">Quick Actions</h3>
          </div>
          <div className="space-y-2">
            <Link
              href="/jobs"
              className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/30 transition-colors group"
            >
              <span className="text-sm text-foreground">View Jobs</span>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </Link>
            <Link
              href="/users"
              className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/30 transition-colors group"
            >
              <span className="text-sm text-foreground">Manage Users</span>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </Link>
            <Link
              href="/errors"
              className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/30 transition-colors group"
            >
              <span className="text-sm text-foreground">View Errors</span>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
