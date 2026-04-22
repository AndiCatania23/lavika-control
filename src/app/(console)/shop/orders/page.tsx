'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SectionHeader } from '@/components/SectionHeader';
import { useToast } from '@/lib/toast';
import {
  getShopOrders,
  updateShopOrder,
  ORDER_STATUS_LABELS,
  formatCents,
  type ShopOrder,
  type OrderStatus,
} from '@/lib/data/shop';
import { ChevronLeft, ChevronRight, Truck, Package, CheckCircle2, XCircle, Clock, RefreshCw, ShoppingCart, Eye, PackageCheck } from 'lucide-react';

const STATUS_STYLES: Record<OrderStatus, { bg: string; text: string; icon: typeof Clock }> = {
  pending: { bg: 'bg-yellow-500/10', text: 'text-yellow-500', icon: Clock },
  paid: { bg: 'bg-blue-500/10', text: 'text-blue-500', icon: ShoppingCart },
  fulfilling: { bg: 'bg-orange-500/10', text: 'text-orange-500', icon: Package },
  shipped: { bg: 'bg-purple-500/10', text: 'text-purple-500', icon: Truck },
  delivered: { bg: 'bg-green-500/10', text: 'text-green-500', icon: CheckCircle2 },
  refunded: { bg: 'bg-muted', text: 'text-muted-foreground', icon: RefreshCw },
  cancelled: { bg: 'bg-red-500/10', text: 'text-red-500', icon: XCircle },
};

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['paid', 'cancelled'],
  paid: ['fulfilling', 'refunded', 'cancelled'],
  fulfilling: ['shipped', 'refunded'],
  shipped: ['delivered', 'refunded'],
  delivered: ['refunded'],
  refunded: [],
  cancelled: [],
};

export default function ShopOrdersPage() {
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [selected, setSelected] = useState<ShopOrder | null>(null);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const data = await getShopOrders(statusFilter);
      setOrders(data);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore caricamento');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const counts = orders.reduce(
    (acc, o) => {
      acc.total++;
      acc[o.status] = (acc[o.status] ?? 0) + 1;
      return acc;
    },
    { total: 0 } as Record<string, number>,
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Ordini"
        description={`${orders.length} ordini${statusFilter !== 'all' ? ` (${ORDER_STATUS_LABELS[statusFilter as OrderStatus]})` : ''}`}
      />

      {/* Status filter tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          active={statusFilter === 'all'}
          onClick={() => setStatusFilter('all')}
          label={`Tutti · ${counts.total ?? 0}`}
        />
        {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((s) => (
          <FilterChip
            key={s}
            active={statusFilter === s}
            onClick={() => setStatusFilter(s)}
            label={`${ORDER_STATUS_LABELS[s]} · ${counts[s] ?? 0}`}
          />
        ))}
      </div>

      {/* Empty */}
      {!loading && orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <PackageCheck className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-base font-semibold text-foreground">Nessun ordine</p>
          <p className="text-sm text-muted-foreground mt-1">
            {statusFilter === 'all' ? 'Non sono ancora arrivati ordini.' : 'Nessun ordine con questo status.'}
          </p>
        </div>
      ) : null}

      {/* Loading skeleton */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : null}

      {/* List */}
      {!loading && orders.length > 0 ? (
        <div className="space-y-2">
          {orders.map((order) => {
            const StatusIcon = STATUS_STYLES[order.status].icon;
            const statusStyle = STATUS_STYLES[order.status];
            const itemCount = (order.line_items ?? []).reduce((acc, it) => acc + (it.quantity ?? 0), 0);
            return (
              <button
                key={order.id}
                type="button"
                onClick={() => setSelected(order)}
                className="w-full text-left rounded-xl border border-border bg-card hover:border-muted-foreground/30 hover:bg-muted/30 transition-colors p-4 flex items-center gap-4"
              >
                <div
                  className={`flex items-center justify-center w-10 h-10 rounded-lg ${statusStyle.bg} ${statusStyle.text} shrink-0`}
                >
                  <StatusIcon className="w-5 h-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-mono font-semibold text-foreground">{order.order_number ?? '—'}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground truncate">
                      {order.customer_name || order.customer_email || 'Cliente guest'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(order.created_at).toLocaleString('it-IT', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {' · '}
                    {itemCount} {itemCount === 1 ? 'articolo' : 'articoli'}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${statusStyle.bg} ${statusStyle.text}`}>
                    {ORDER_STATUS_LABELS[order.status]}
                  </span>
                  <span className="text-sm font-semibold text-foreground">{formatCents(order.total_amount, order.currency)}</span>
                  <Eye className="w-4 h-4 text-muted-foreground" />
                </div>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Detail sheet */}
      {selected ? (
        <OrderDetailSheet
          order={selected}
          onClose={() => setSelected(null)}
          onUpdate={async () => {
            setSelected(null);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 px-3 rounded-full text-xs font-semibold transition-colors ${
        active ? 'bg-foreground text-background' : 'bg-card border border-border text-foreground/70 hover:bg-muted'
      }`}
    >
      {label}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════
   Order detail sheet
   ═══════════════════════════════════════════════════════ */

function OrderDetailSheet({
  order,
  onClose,
  onUpdate,
}: {
  order: ShopOrder;
  onClose: () => void;
  onUpdate: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [statusDraft, setStatusDraft] = useState<OrderStatus>(order.status);
  const [trackingNumber, setTrackingNumber] = useState(order.tracking_number ?? '');
  const [trackingUrl, setTrackingUrl] = useState(order.tracking_url ?? '');
  const [shippingCarrier, setShippingCarrier] = useState(order.shipping_carrier ?? '');
  const [staffNotes, setStaffNotes] = useState(order.staff_notes ?? '');

  const allowedTransitions = STATUS_TRANSITIONS[order.status];

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates: Parameters<typeof updateShopOrder>[1] = {};
      if (statusDraft !== order.status) updates.status = statusDraft;
      if (trackingNumber !== (order.tracking_number ?? '')) updates.tracking_number = trackingNumber || undefined;
      if (trackingUrl !== (order.tracking_url ?? '')) updates.tracking_url = trackingUrl || undefined;
      if (shippingCarrier !== (order.shipping_carrier ?? '')) updates.shipping_carrier = shippingCarrier || undefined;
      if (staffNotes !== (order.staff_notes ?? '')) updates.staff_notes = staffNotes || undefined;

      if (Object.keys(updates).length === 0) {
        showToast('warning', 'Nessuna modifica da salvare');
        setSaving(false);
        return;
      }

      await updateShopOrder(order.id, updates);
      showToast('success', 'Ordine aggiornato');
      await onUpdate();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore salvataggio');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-card border border-border rounded-t-2xl md:rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Ordine</p>
            <h2 className="text-lg font-mono font-bold text-foreground">{order.order_number ?? '—'}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border hover:bg-muted text-foreground"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Customer */}
          <Block title="Cliente">
            <div className="space-y-0.5">
              <p className="text-sm text-foreground font-semibold">{order.customer_name ?? '—'}</p>
              <p className="text-sm text-muted-foreground">{order.customer_email ?? '—'}</p>
              {order.customer_phone ? <p className="text-sm text-muted-foreground">{order.customer_phone}</p> : null}
            </div>
            {order.shipping_address ? (
              <pre className="mt-2 text-xs text-muted-foreground font-mono whitespace-pre-wrap leading-relaxed bg-background/50 rounded p-2 border border-border">
                {JSON.stringify(order.shipping_address, null, 2)}
              </pre>
            ) : null}
          </Block>

          {/* Items */}
          <Block title={`Articoli (${(order.line_items ?? []).length})`}>
            <div className="space-y-2">
              {(order.line_items ?? []).map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 p-2 rounded-lg bg-background/50 border border-border">
                  {item.image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={item.image_url} alt={item.name} className="w-12 h-12 rounded object-cover shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded bg-muted shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{item.name ?? 'Articolo'}</p>
                    <p className="text-xs text-muted-foreground">
                      {[item.size, item.color].filter(Boolean).join(' · ') || 'No variante'} · Qty {item.quantity}
                    </p>
                  </div>
                  {item.unit_amount ? (
                    <p className="text-sm text-foreground shrink-0">{formatCents((item.unit_amount as number) * item.quantity)}</p>
                  ) : item.unit_price_eur ? (
                    <p className="text-sm text-foreground shrink-0">€{(item.unit_price_eur * item.quantity).toFixed(2)}</p>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-border">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Totale</span>
              <span className="text-lg font-bold text-foreground">{formatCents(order.total_amount, order.currency)}</span>
            </div>
          </Block>

          {/* Status + transition */}
          <Block title="Status">
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">Attuale:</span>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded ${STATUS_STYLES[order.status].bg} ${STATUS_STYLES[order.status].text}`}
                >
                  {ORDER_STATUS_LABELS[order.status]}
                </span>
              </div>
              {allowedTransitions.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Cambia a:</p>
                  <div className="flex flex-wrap gap-2">
                    {allowedTransitions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatusDraft(s)}
                        className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold transition-colors ${
                          statusDraft === s
                            ? 'bg-foreground text-background'
                            : 'bg-card border border-border text-foreground/70 hover:bg-muted'
                        }`}
                      >
                        <ChevronRight className="w-3 h-3" />
                        {ORDER_STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">Nessuna transizione disponibile (stato finale).</p>
              )}
            </div>
          </Block>

          {/* Shipping */}
          <Block title="Spedizione">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FieldBlock label="Corriere">
                <input
                  type="text"
                  value={shippingCarrier}
                  onChange={(e) => setShippingCarrier(e.target.value)}
                  placeholder="BRT, SDA, Poste…"
                  className={inputBlockClass}
                />
              </FieldBlock>
              <FieldBlock label="Numero tracking">
                <input
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="Codice tracking"
                  className={inputBlockClass + ' font-mono'}
                />
              </FieldBlock>
            </div>
            <FieldBlock label="URL tracking">
              <input
                type="url"
                value={trackingUrl}
                onChange={(e) => setTrackingUrl(e.target.value)}
                placeholder="https://…"
                className={inputBlockClass}
              />
            </FieldBlock>
          </Block>

          {/* Staff notes */}
          <Block title="Note interne (staff)">
            <textarea
              rows={3}
              value={staffNotes}
              onChange={(e) => setStaffNotes(e.target.value)}
              placeholder="Note visibili solo allo staff — non visibili al cliente"
              className={inputBlockClass + ' resize-y'}
            />
          </Block>

          {/* Meta */}
          <Block title="Dettagli Stripe">
            <div className="space-y-1 text-xs font-mono text-muted-foreground">
              <p>Session: {order.stripe_session_id}</p>
              {order.stripe_payment_intent_id ? <p>Payment Intent: {order.stripe_payment_intent_id}</p> : null}
              {order.receipt_url ? (
                <p>
                  Receipt:{' '}
                  <a href={order.receipt_url} target="_blank" rel="noreferrer" className="underline">
                    apri
                  </a>
                </p>
              ) : null}
            </div>
          </Block>
        </div>

        {/* Actions footer */}
        <div className="sticky bottom-0 bg-card border-t border-border px-5 py-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center h-10 px-4 rounded-lg border border-border hover:bg-muted text-sm font-medium text-foreground"
          >
            Chiudi
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center h-10 px-4 rounded-lg bg-foreground text-background text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Salvataggio…' : 'Salva modifiche'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">{title}</h3>
      <div>{children}</div>
    </section>
  );
}

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const inputBlockClass =
  'w-full min-h-10 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-muted-foreground/60';
