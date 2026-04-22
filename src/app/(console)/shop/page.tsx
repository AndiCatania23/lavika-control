'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SectionHeader } from '@/components/SectionHeader';
import { getShopProducts, type ShopProduct } from '@/lib/data/shop';
import { Package, ShoppingCart, Image as ImageIcon, Tag, ArrowRight, Mail } from 'lucide-react';

export default function ShopOverviewPage() {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getShopProducts()
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  const activeCount = products.filter((p) => p.status === 'active').length;
  const draftCount = products.filter((p) => p.status === 'draft').length;
  const archivedCount = products.filter((p) => p.status === 'archived').length;

  return (
    <div className="space-y-6">
      <SectionHeader title="Shop" description="Gestione prodotti, immagini, varianti, banner e ordini." />

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Prodotti attivi" value={loading ? '…' : String(activeCount)} />
        <StatCard label="Bozze" value={loading ? '…' : String(draftCount)} />
        <StatCard label="Archiviati" value={loading ? '…' : String(archivedCount)} />
        <StatCard label="Totale" value={loading ? '…' : String(products.length)} />
      </div>

      {/* Quick nav */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <NavCard href="/shop/products" icon={Package} title="Prodotti" description="Felpe, cappellini, sticker, accessori — CRUD completo con gallery e varianti." />
        <NavCard href="/shop/orders" icon={ShoppingCart} title="Ordini" description="Nuovi ordini, fulfillment, tracking." />
        <NavCard href="/shop/banners" icon={ImageIcon} title="Banner" description="Hero carousel: drop, saldi, pezzi firmati." />
        <NavCard href="/shop/notifications" icon={Mail} title="Notifiche email" description="Destinatari mail automatiche (nuovo ordine, refund, scorta bassa)." />
        <NavCard href="/shop/inventory" icon={Tag} title="Inventario" description="Stock per taglia/colore + alert bassa disponibilita." disabled />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function NavCard({
  href,
  icon: Icon,
  title,
  description,
  disabled = false,
}: {
  href: string;
  icon: typeof Package;
  title: string;
  description: string;
  disabled?: boolean;
}) {
  const content = (
    <div
      className={`rounded-xl border border-border bg-card p-5 flex items-start gap-4 transition-colors ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-muted-foreground/40 hover:bg-muted/50'
      }`}
    >
      <Icon className="w-6 h-6 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          {disabled && (
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              Presto
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1 leading-snug">{description}</p>
      </div>
      {!disabled && <ArrowRight className="w-5 h-5 text-muted-foreground shrink-0 mt-1" />}
    </div>
  );

  if (disabled) return content;
  return <Link href={href}>{content}</Link>;
}
