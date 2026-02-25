'use client';

import { useState } from 'react';
import { SectionHeader } from '@/components/SectionHeader';
import { BarChart3, Users, DollarSign, FileText } from 'lucide-react';

type Tab = 'users' | 'revenue' | 'content';

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('users');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'users', label: 'Users' },
    { id: 'revenue', label: 'Revenue Forecast' },
    { id: 'content', label: 'Content' },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader 
        title="Analytics" 
        description="Platform performance insights and forecasts"
      />

      <div className="border-b border-border">
        <nav className="flex gap-6">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {activeTab === 'users' && (
          <>
            <div className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-center gap-3 mb-2">
                <Users className="w-5 h-5 text-primary" />
                <span className="text-sm text-muted-foreground">Total Users</span>
              </div>
              <div className="text-2xl font-semibold text-foreground">12,847</div>
              <div className="text-xs text-green-500 mt-1">+12.5% from last month</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-center gap-3 mb-2">
                <BarChart3 className="w-5 h-5 text-primary" />
                <span className="text-sm text-muted-foreground">Active Now</span>
              </div>
              <div className="text-2xl font-semibold text-foreground">4,892</div>
              <div className="text-xs text-muted-foreground mt-1">38% of MAU</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-center gap-3 mb-2">
                <Users className="w-5 h-5 text-primary" />
                <span className="text-sm text-muted-foreground">New This Week</span>
              </div>
              <div className="text-2xl font-semibold text-foreground">342</div>
              <div className="text-xs text-green-500 mt-1">+8.2% vs last week</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-center gap-3 mb-2">
                <Users className="w-5 h-5 text-primary" />
                <span className="text-sm text-muted-foreground">Churn Rate</span>
              </div>
              <div className="text-2xl font-semibold text-foreground">2.3%</div>
              <div className="text-xs text-green-500 mt-1">-0.5% vs last month</div>
            </div>
          </>
        )}

        {activeTab === 'revenue' && (
          <>
            <div className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-center gap-3 mb-2">
                <DollarSign className="w-5 h-5 text-primary" />
                <span className="text-sm text-muted-foreground">MRR</span>
              </div>
              <div className="text-2xl font-semibold text-foreground">$45,230</div>
              <div className="text-xs text-green-500 mt-1">+15.2% from last month</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-center gap-3 mb-2">
                <DollarSign className="w-5 h-5 text-primary" />
                <span className="text-sm text-muted-foreground">ARR</span>
              </div>
              <div className="text-2xl font-semibold text-foreground">$542,760</div>
              <div className="text-xs text-green-500 mt-1">Projected</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-center gap-3 mb-2">
                <DollarSign className="w-5 h-5 text-primary" />
                <span className="text-sm text-muted-foreground">LTV</span>
              </div>
              <div className="text-2xl font-semibold text-foreground">$1,245</div>
              <div className="text-xs text-muted-foreground mt-1">Average</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-center gap-3 mb-2">
                <DollarSign className="w-5 h-5 text-primary" />
                <span className="text-sm text-muted-foreground">ARPU</span>
              </div>
              <div className="text-2xl font-semibold text-foreground">$89</div>
              <div className="text-xs text-green-500 mt-1">+5.1% vs last month</div>
            </div>
          </>
        )}

        {activeTab === 'content' && (
          <>
            <div className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-center gap-3 mb-2">
                <FileText className="w-5 h-5 text-primary" />
                <span className="text-sm text-muted-foreground">Total Items</span>
              </div>
              <div className="text-2xl font-semibold text-foreground">45,230</div>
              <div className="text-xs text-green-500 mt-1">+1,234 this week</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-center gap-3 mb-2">
                <FileText className="w-5 h-5 text-primary" />
                <span className="text-sm text-muted-foreground">Active</span>
              </div>
              <div className="text-2xl font-semibold text-foreground">38,456</div>
              <div className="text-xs text-muted-foreground mt-1">85% of total</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-center gap-3 mb-2">
                <FileText className="w-5 h-5 text-primary" />
                <span className="text-sm text-muted-foreground">Pending</span>
              </div>
              <div className="text-2xl font-semibold text-foreground">5,234</div>
              <div className="text-xs text-muted-foreground mt-1">Needs review</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-5">
              <div className="flex items-center gap-3 mb-2">
                <FileText className="w-5 h-5 text-primary" />
                <span className="text-sm text-muted-foreground">Errors</span>
              </div>
              <div className="text-2xl font-semibold text-foreground">1,540</div>
              <div className="text-xs text-red-500 mt-1">Needs attention</div>
            </div>
          </>
        )}
      </div>

      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="font-semibold text-foreground mb-4">
          {activeTab === 'users' && 'User Growth'}
          {activeTab === 'revenue' && 'Revenue Trend'}
          {activeTab === 'content' && 'Content Distribution'}
        </h3>
        <div className="h-64 flex items-end gap-2">
          {[45, 62, 55, 78, 65, 82, 70, 88, 75, 92, 85, 95].map((height, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-2">
              <div 
                className="w-full bg-primary/40 rounded-t hover:bg-primary/60 transition-colors"
                style={{ height: `${height}%` }}
              />
              <span className="text-xs text-muted-foreground">
                {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][i]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
