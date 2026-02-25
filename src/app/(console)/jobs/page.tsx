'use client';

import { useEffect, useState } from 'react';
import { getDevFeed, DevFeedItem } from '@/lib/data';
import { SectionHeader } from '@/components/SectionHeader';

export default function JobsPage() {
  const [items, setItems] = useState<DevFeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDevFeed('jobs', 20).then(data => {
      setItems(data);
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
    <div className="space-y-6">
      <SectionHeader 
        title="Job" 
        description="Lista job dalla piattaforma"
      />

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Titolo</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Descrizione</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Data</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                  Nessun job trovato
                </td>
              </tr>
            ) : (
              items.map(item => (
                <tr key={item.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3 text-sm text-foreground">{item.title}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{item.description || '-'}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {new Date(item.created_at).toLocaleDateString('it-IT')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
