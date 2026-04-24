'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getShopProducts, type ShopProduct } from '@/lib/data/shop';
import { Package, ShoppingCart, Image as ImageIcon, Tag, ArrowRight, Mail, Printer } from 'lucide-react';

export default function ShopOverviewPage() {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getShopProducts().then(setProducts).catch(() => setProducts([])).finally(() => setLoading(false));
  }, []);

  const activeCount   = products.filter(p => p.status === 'active').length;
  const draftCount    = products.filter(p => p.status === 'draft').length;
  const archivedCount = products.filter(p => p.status === 'archived').length;

  return (
    <div className="vstack" style={{ gap: 'var(--s5)' }}>
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { label: 'Attivi',     value: activeCount,     tone: 'ok' as const },
          { label: 'Bozze',      value: draftCount,      tone: 'warn' as const },
          { label: 'Archiviati', value: archivedCount,   tone: 'neutral' as const },
          { label: 'Totale',     value: products.length, tone: 'info' as const },
        ].map(k => {
          const pillClass =
            k.tone === 'ok' ? 'pill pill-ok'
            : k.tone === 'warn' ? 'pill pill-warn'
            : k.tone === 'info' ? 'pill pill-info'
            : 'pill';
          return (
            <div key={k.label} className="card card-body" style={{ padding: 12 }}>
              <div className="flex items-center justify-between gap-2">
                <span className="typ-micro truncate">{k.label}</span>
                <span className={pillClass} style={{ padding: '2px 6px' }}>
                  <Package className="w-3 h-3" />
                </span>
              </div>
              <div className="typ-metric mt-1" style={{ fontSize: 24 }}>
                {loading ? '…' : k.value.toLocaleString('it-IT')}
              </div>
            </div>
          );
        })}
      </div>

      {/* Nav cards (compact rows) */}
      <div className="vstack-tight">
        <NavRow href="/shop/products"      icon={Package}       title="Prodotti"       desc="CRUD con gallery, varianti e prezzi" />
        <NavRow href="/shop/orders"        icon={ShoppingCart}  title="Ordini"         desc="Nuovi ordini, fulfillment, tracking" />
        <NavRow href="/shop/banners"       icon={ImageIcon}     title="Banner"         desc="Hero carousel: drop, saldi, limited edition" />
        <NavRow href="/shop/notifications" icon={Mail}          title="Notifiche email" desc="Destinatari mail auto (ordine, refund, scorta bassa)" />
        <NavRow href="/shop/printful"      icon={Printer}       title="Printful POD"   desc="Mapping prodotti Printful → varianti LAVIKA" />
        <NavRow href="#"                   icon={Tag}           title="Inventario"     desc="Stock per taglia/colore + alert — presto" disabled />
      </div>
    </div>
  );
}

function NavRow({
  href, icon: Icon, title, desc, disabled = false,
}: { href: string; icon: typeof Package; title: string; desc: string; disabled?: boolean }) {
  const content = (
    <div
      className={disabled ? 'card' : 'card card-hover'}
      style={{
        padding: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span className="shrink-0 inline-grid place-items-center" style={{ width: 40, height: 40, borderRadius: 'var(--r-sm)', background: 'var(--card-muted)', color: 'var(--accent-raw)' }}>
        <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
      </span>
      <div className="grow min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="typ-label">{title}</div>
          {disabled && <span className="pill" style={{ fontSize: 10, padding: '1px 6px' }}>presto</span>}
        </div>
        <div className="typ-caption truncate mt-0.5">{desc}</div>
      </div>
      {!disabled && <ArrowRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />}
    </div>
  );
  if (disabled) return content;
  return <Link href={href}>{content}</Link>;
}
