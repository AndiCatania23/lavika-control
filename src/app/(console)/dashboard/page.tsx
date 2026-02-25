'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getDevCards, getLatestCardValues, DevCard, DevCardValue } from '@/lib/data';
import { KpiCard } from '@/components/KpiCard';
import { SectionHeader } from '@/components/SectionHeader';
import { ArrowRight } from 'lucide-react';

interface KpiWithValue extends DevCard {
  value?: DevCardValue;
}

export default function DashboardPage() {
  const [cards, setCards] = useState<KpiWithValue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      const devCards = await getDevCards();
      
      const kpiCards = devCards.filter(c => c.card_type === 'kpi');
      const cardKeys = kpiCards.map(c => c.card_key);
      
      const values = await getLatestCardValues(cardKeys);
      const valueMap = new Map(values.map(v => [v.card_key, v]));
      
      const cardsWithValues = kpiCards.map(card => ({
        ...card,
        value: valueMap.get(card.card_key),
      }));
      
      setCards(cardsWithValues);
      setLoading(false);
    };
    
    loadData();
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
        description="Panoramica delle performance della piattaforma"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {cards.map(card => (
          <KpiCard key={card.id} card={card} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">Stato Sistema</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-border">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-500/10 text-green-500">
                  <span className="w-1 h-1 rounded-full bg-green-500 mr-1" />
                  Operational
                </span>
                <span className="text-sm text-foreground">Supabase</span>
              </div>
              <span className="text-xs text-muted-foreground">-</span>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">Azioni Rapide</h3>
          </div>
          <div className="space-y-2">
            <Link
              href="/jobs"
              className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/30 transition-colors group"
            >
              <span className="text-sm text-foreground">Visualizza Job</span>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </Link>
            <Link
              href="/users"
              className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/30 transition-colors group"
            >
              <span className="text-sm text-foreground">Gestione Utenti</span>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </Link>
            <Link
              href="/errors"
              className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/30 transition-colors group"
            >
              <span className="text-sm text-foreground">Visualizza Errori</span>
              <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
