'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import {
  getShopOrders, updateShopOrder, getShopOrderEvents,
  ORDER_STATUS_LABELS, formatCents,
  type ShopOrder, type OrderStatus, type ShopOrderEvent,
} from '@/lib/data/shop';
import {
  X, Truck, Package, CheckCircle2, XCircle, Clock, RefreshCw, ShoppingCart,
  PackageCheck, FileText, Edit3, ChevronRight,
} from 'lucide-react';

const STATUS_META: Record<OrderStatus, { pill: string; icon: typeof Clock }> = {
  pending:    { pill: 'pill pill-warn', icon: Clock },
  paid:       { pill: 'pill pill-info', icon: ShoppingCart },
  fulfilling: { pill: 'pill pill-warn', icon: Package },
  shipped:    { pill: 'pill pill-info', icon: Truck },
  delivered:  { pill: 'pill pill-ok',   icon: CheckCircle2 },
  refunded:   { pill: 'pill',           icon: RefreshCw },
  cancelled:  { pill: 'pill pill-err',  icon: XCircle },
};

const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending:    ['paid', 'cancelled'],
  paid:       ['fulfilling', 'refunded', 'cancelled'],
  fulfilling: ['shipped', 'refunded'],
  shipped:    ['delivered', 'refunded'],
  delivered:  ['refunded'],
  refunded:   [],
  cancelled:  [],
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

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
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter]);

  const counts = orders.reduce(
    (acc, o) => { acc.total++; acc[o.status] = (acc[o.status] ?? 0) + 1; return acc; },
    { total: 0 } as Record<string, number>,
  );

  return (
    <div className="vstack" style={{ gap: 'var(--s4)' }}>
      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setStatusFilter('all')}
          className={statusFilter === 'all' ? 'pill pill-accent' : 'pill'}
          style={{ cursor: 'pointer', padding: '6px 12px', fontSize: 12 }}
        >
          Tutti · {counts.total ?? 0}
        </button>
        {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={statusFilter === s ? 'pill pill-accent' : 'pill'}
            style={{ cursor: 'pointer', padding: '6px 12px', fontSize: 12 }}
          >
            {ORDER_STATUS_LABELS[s]} · {counts[s] ?? 0}
          </button>
        ))}
      </div>

      {/* Empty */}
      {!loading && orders.length === 0 && (
        <div className="card card-body text-center">
          <PackageCheck className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
          <p className="typ-label">Nessun ordine</p>
          <p className="typ-caption mt-1">
            {statusFilter === 'all' ? 'Non sono arrivati ordini.' : 'Nessun ordine con questo status.'}
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="vstack-tight">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card" style={{ height: 72, opacity: 0.4 }} />
          ))}
        </div>
      )}

      {/* List */}
      {!loading && orders.length > 0 && (
        <div className="vstack-tight">
          {orders.map(order => {
            const meta = STATUS_META[order.status];
            const SIcon = meta.icon;
            const itemCount = (order.line_items ?? []).reduce((acc, it) => acc + (it.quantity ?? 0), 0);
            return (
              <div
                key={order.id}
                onClick={() => setSelected(order)}
                className="card card-hover"
                style={{ cursor: 'pointer', padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}
              >
                <div className="shrink-0 inline-grid place-items-center" style={{ width: 40, height: 40, borderRadius: 'var(--r-sm)', background: 'var(--card-muted)' }}>
                  <span className={meta.pill} style={{ padding: 4, borderRadius: 8 }}>
                    <SIcon className="w-4 h-4" />
                  </span>
                </div>
                <div className="grow min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="typ-mono" style={{ fontWeight: 600 }}>{order.order_number ?? '—'}</span>
                    <span className={meta.pill} style={{ fontSize: 10, padding: '1px 6px' }}>
                      {ORDER_STATUS_LABELS[order.status]}
                    </span>
                  </div>
                  <div className="typ-caption truncate mt-0.5">
                    {order.customer_name || order.customer_email || 'Cliente guest'} · {fmtDateTime(order.created_at)} · {itemCount} {itemCount === 1 ? 'articolo' : 'articoli'}
                  </div>
                </div>
                <div className="typ-label shrink-0" style={{ fontWeight: 700 }}>
                  {formatCents(order.total_amount, order.currency)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail sheet */}
      {selected && (
        <OrderDetailSheet
          order={selected}
          onClose={() => setSelected(null)}
          onUpdate={async () => { setSelected(null); await load(); }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Order detail sheet
   ═══════════════════════════════════════════════════════ */

function OrderDetailSheet({
  order, onClose, onUpdate,
}: {
  order: ShopOrder;
  onClose: () => void;
  onUpdate: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [statusDraft, setStatusDraft] = useState<OrderStatus>(order.status);
  const [trackingNumber, setTrackingNumber] = useState(order.tracking_number ?? '');
  const [trackingUrl, setTrackingUrl] = useState(order.tracking_url ?? '');
  const [shippingCarrier, setShippingCarrier] = useState(order.shipping_carrier ?? '');
  const [staffNotes, setStaffNotes] = useState(order.staff_notes ?? '');
  const [events, setEvents] = useState<ShopOrderEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  const allowedTransitions = STATUS_TRANSITIONS[order.status];

  useEffect(() => {
    let cancelled = false;
    setEventsLoading(true);
    getShopOrderEvents(order.id)
      .then(data => { if (!cancelled) setEvents(data); })
      .catch(() => { if (!cancelled) setEvents([]); })
      .finally(() => { if (!cancelled) setEventsLoading(false); });
    return () => { cancelled = true; };
  }, [order.id]);

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

      await updateShopOrder(order.id, updates, { id: user?.id ?? null, email: user?.email ?? null });
      showToast('success', 'Ordine aggiornato');
      await onUpdate();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore salvataggio');
      setSaving(false);
    }
  };

  const meta = STATUS_META[order.status];

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" style={{ maxHeight: '92vh' }}>
        <div className="sheet-grip" />
        <div className="flex items-center gap-2 mb-3">
          <div className="grow min-w-0">
            <div className="typ-micro">Ordine</div>
            <h2 className="typ-h1 typ-mono truncate">{order.order_number ?? '—'}</h2>
          </div>
          <button onClick={onClose} className="btn btn-quiet btn-icon btn-sm" aria-label="Chiudi">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="vstack" style={{ gap: 'var(--s5)' }}>
          {/* Customer */}
          <Section title="Cliente">
            <div className="typ-body">
              <div className="typ-label">{order.customer_name ?? '—'}</div>
              <div className="typ-caption">{order.customer_email ?? '—'}</div>
              {order.customer_phone && <div className="typ-caption">{order.customer_phone}</div>}
            </div>
            {order.shipping_address && (
              <pre className="typ-mono mt-2 whitespace-pre-wrap" style={{
                fontSize: 11, padding: 10, background: 'var(--card-muted)', borderRadius: 'var(--r-sm)',
                border: '1px solid var(--hairline-soft)',
              }}>{JSON.stringify(order.shipping_address, null, 2)}</pre>
            )}
          </Section>

          {/* Items */}
          <Section title={`Articoli (${(order.line_items ?? []).length})`}>
            <div className="vstack-tight">
              {(order.line_items ?? []).map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 p-2 rounded-[var(--r-sm)]" style={{ background: 'var(--card-muted)', border: '1px solid var(--hairline-soft)' }}>
                  {item.image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={item.image_url} alt={item.name} className="w-12 h-12 rounded-[var(--r-xs)] object-cover shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-[var(--r-xs)] shrink-0" style={{ background: 'var(--hairline-soft)' }} />
                  )}
                  <div className="grow min-w-0">
                    <div className="typ-label truncate">{item.name ?? 'Articolo'}</div>
                    <div className="typ-caption">
                      {[item.size, item.color].filter(Boolean).join(' · ') || 'No variante'} · Qty {item.quantity}
                    </div>
                  </div>
                  {item.unit_amount ? (
                    <div className="typ-label shrink-0">{formatCents((item.unit_amount as number) * item.quantity)}</div>
                  ) : item.unit_price_eur ? (
                    <div className="typ-label shrink-0">€{(item.unit_price_eur * item.quantity).toFixed(2)}</div>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-3 mt-3 border-t border-[color:var(--hairline-soft)]">
              <span className="typ-micro">Totale</span>
              <span className="typ-h2" style={{ fontWeight: 700 }}>{formatCents(order.total_amount, order.currency)}</span>
            </div>
          </Section>

          {/* Status */}
          <Section title="Status">
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className="typ-micro">Attuale:</span>
              <span className={meta.pill} style={{ fontSize: 11 }}>
                {ORDER_STATUS_LABELS[order.status]}
              </span>
            </div>
            {allowedTransitions.length > 0 ? (
              <>
                <div className="typ-micro mb-2">Cambia a:</div>
                <div className="flex flex-wrap gap-2">
                  {allowedTransitions.map(s => (
                    <button
                      key={s}
                      onClick={() => setStatusDraft(s)}
                      className={statusDraft === s ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                      {ORDER_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="typ-caption italic">Nessuna transizione disponibile (stato finale).</p>
            )}
          </Section>

          {/* Shipping */}
          <Section title="Spedizione">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="typ-micro block mb-1.5">Corriere</label>
                <input type="text" value={shippingCarrier} onChange={e => setShippingCarrier(e.target.value)} placeholder="BRT, SDA, Poste…" className="input" />
              </div>
              <div>
                <label className="typ-micro block mb-1.5">Numero tracking</label>
                <input type="text" value={trackingNumber} onChange={e => setTrackingNumber(e.target.value)} placeholder="Codice tracking" className="input typ-mono" />
              </div>
            </div>
            <div className="mt-3">
              <label className="typ-micro block mb-1.5">URL tracking</label>
              <input type="url" value={trackingUrl} onChange={e => setTrackingUrl(e.target.value)} placeholder="https://…" className="input" />
            </div>
          </Section>

          {/* Staff notes */}
          <Section title="Note interne (staff)">
            <textarea
              rows={3}
              value={staffNotes}
              onChange={e => setStaffNotes(e.target.value)}
              placeholder="Note visibili solo allo staff — non al cliente"
              className="textarea"
            />
          </Section>

          {/* Activity log */}
          <Section title={`Attività (${events.length})`}>
            {eventsLoading ? (
              <p className="typ-caption">Carico eventi…</p>
            ) : events.length === 0 ? (
              <p className="typ-caption italic">Nessun evento registrato.</p>
            ) : (
              <div className="vstack-tight">
                {events.map(ev => <OrderEventItem key={ev.id} event={ev} />)}
              </div>
            )}
          </Section>

          {/* Stripe meta */}
          <Section title="Dettagli Stripe">
            <div className="vstack-tight typ-mono typ-caption" style={{ fontSize: 11 }}>
              <div>Session: {order.stripe_session_id}</div>
              {order.stripe_payment_intent_id && <div>Payment Intent: {order.stripe_payment_intent_id}</div>}
              {order.receipt_url && (
                <div>Receipt: <a href={order.receipt_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline', color: 'var(--accent-raw)' }}>apri</a></div>
              )}
            </div>
          </Section>
        </div>

        {/* Actions footer */}
        <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-[color:var(--hairline-soft)]">
          <button onClick={onClose} className="btn btn-ghost">Chiudi</button>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary">
            {saving ? 'Salvataggio…' : 'Salva modifiche'}
          </button>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="typ-micro mb-2">{title}</div>
      <div>{children}</div>
    </div>
  );
}

function OrderEventItem({ event }: { event: ShopOrderEvent }) {
  const when = new Date(event.created_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const actor = event.actor_email || event.actor_id?.slice(0, 8) || 'sistema';

  let Icon = FileText;
  let label = 'Evento';
  let detail: React.ReactNode = null;

  switch (event.event_type) {
    case 'status_changed':
      Icon = ChevronRight;
      label = 'Status cambiato';
      detail = <span className="typ-mono">{(event.from_status ?? '?').toUpperCase()} → <span style={{ color: 'var(--text-hi)' }}>{(event.to_status ?? '?').toUpperCase()}</span></span>;
      break;
    case 'tracking_updated': {
      Icon = Truck;
      label = 'Tracking aggiornato';
      const data = event.data as { carrier?: string; tracking_number?: string };
      detail = <span className="typ-mono">{data.carrier ?? '—'} · {data.tracking_number ?? '—'}</span>;
      break;
    }
    case 'note_updated': {
      Icon = Edit3;
      label = 'Note aggiornate';
      const data = event.data as { preview?: string };
      detail = data.preview ? <span className="italic">&ldquo;{data.preview.slice(0, 80)}&rdquo;</span> : null;
      break;
    }
    case 'fulfilled_by_set':
      Icon = Package;
      label = 'Preso in carico';
      break;
    default:
      break;
  }

  return (
    <div className="flex items-start gap-3 p-2.5 rounded-[var(--r-sm)]" style={{ background: 'var(--card-muted)', border: '1px solid var(--hairline-soft)' }}>
      <div className="inline-grid place-items-center shrink-0" style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--card)' }}>
        <Icon className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
      </div>
      <div className="min-w-0 grow">
        <div className="flex items-baseline justify-between gap-2">
          <span className="typ-label">{label}</span>
          <span className="typ-caption shrink-0" style={{ fontSize: 11 }}>{when}</span>
        </div>
        {detail && <div className="typ-caption">{detail}</div>}
        <div className="typ-caption" style={{ fontSize: 11, opacity: 0.7 }}>da {actor}</div>
      </div>
    </div>
  );
}
