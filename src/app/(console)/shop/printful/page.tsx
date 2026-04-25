'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SectionHeader } from '@/components/SectionHeader';
import { useToast } from '@/lib/toast';
import { getShopProducts, type ShopProduct } from '@/lib/data/shop';
import { ChevronLeft, ExternalLink, Link as LinkIcon, Unlink, RefreshCw, AlertCircle, CheckCircle2, Package, Archive } from 'lucide-react';

type PrintfulSyncProduct = {
  id: number;
  external_id: string | null;
  name: string;
  variants: number;
  synced: number;
  thumbnail_url: string | null;
};

type LinkResult = {
  matched: Array<{ shop_variant_id: string; size: string; printful_sync_variant_id: number }>;
  unmatched_shop_variants: Array<{ id: string; size: string | null; color: string | null }>;
  unmatched_printful_variants: Array<{ id: number; size: string | null; color: string | null }>;
};

export default function ShopPrintfulPage() {
  const [pfProducts, setPfProducts] = useState<PrintfulSyncProduct[]>([]);
  const [shopProducts, setShopProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<string | null>(null);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pfRes, shop] = await Promise.all([
        fetch('/api/dev/pod/printful/sync-products', { cache: 'no-store' }),
        getShopProducts(),
      ]);
      if (!pfRes.ok) {
        const payload = (await pfRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? 'Errore fetch Printful');
      }
      const pfList = (await pfRes.json()) as PrintfulSyncProduct[];
      setPfProducts(pfList);
      setShopProducts(shop);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore caricamento');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleLink = async (shopProductId: string, printfulSyncProductId: number, shopName: string, pfName: string) => {
    const ok = window.confirm(
      `Collegare "${shopName}" → "${pfName}"?\nIl match avviene per taglia. Verranno aggiornate tutte le varianti compatibili.`
    );
    if (!ok) return;

    setLinking(shopProductId);
    try {
      const res = await fetch('/api/dev/pod/printful/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop_product_id: shopProductId,
          printful_sync_product_id: printfulSyncProductId,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? 'Errore link');
      }
      const result = (await res.json()) as LinkResult;
      const matchedCount = result.matched.length;
      const unmatchedShop = result.unmatched_shop_variants.length;
      const unmatchedPf = result.unmatched_printful_variants.length;

      const parts = [`${matchedCount} varianti collegate`];
      if (unmatchedShop > 0) parts.push(`${unmatchedShop} shop senza match`);
      if (unmatchedPf > 0) parts.push(`${unmatchedPf} Printful senza match`);
      showToast(matchedCount > 0 ? 'success' : 'warning', parts.join(' · '));
      await load();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore link');
    } finally {
      setLinking(null);
    }
  };

  const handleArchive = async (shopProductId: string, shopName: string) => {
    if (!window.confirm(
      `Archiviare "${shopName}"?\nIl prodotto Printful collegato non esiste più.\nVerrà nascosto dallo shop pubblico ma resterà nelle tabelle ordini.`
    )) return;
    setArchiving(shopProductId);
    try {
      const res = await fetch('/api/dev/shop/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: shopProductId, status: 'archived' }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? 'Errore archiviazione');
      }
      showToast('success', `Archiviato: ${shopName}`);
      await load();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore');
    } finally {
      setArchiving(null);
    }
  };

  const handleUnlink = async (shopProductId: string, shopName: string) => {
    if (!window.confirm(`Scollegare "${shopName}" da Printful?\nLe varianti tornano self-managed e torneranno a richiedere stock.`)) return;
    try {
      const res = await fetch(`/api/dev/pod/printful/link?shop_product_id=${encodeURIComponent(shopProductId)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Errore unlink');
      showToast('success', 'Scollegato');
      await load();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore');
    }
  };

  // Auto-match suggestion per external_id (se Printful sync product ha external_id = shop slug)
  const pfBySlug = new Map<string, PrintfulSyncProduct>();
  pfProducts.forEach((p) => { if (p.external_id) pfBySlug.set(p.external_id.toLowerCase(), p); });

  // Orfani: shop_products linkati a Printful con pod_product_id non più esistente nella lista appena scaricata.
  // Esclude già-archiviati (no point flaggarli ancora).
  const pfIds = new Set(pfProducts.map((p) => String(p.id)));
  const orphans = shopProducts.filter(
    (sp) =>
      sp.pod_provider === 'printful' &&
      sp.pod_product_id &&
      !pfIds.has(sp.pod_product_id) &&
      sp.status !== 'archived',
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/shop"
          className="inline-flex items-center gap-1 text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Shop
        </Link>
        <SectionHeader
          title="Printful POD"
          description="Collega i Sync Product Printful ai prodotti LAVIKA. Il match avviene per taglia."
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Aggiorna
        </button>
        <span className="text-xs text-muted-foreground">
          {pfProducts.length} prodotti Printful · {shopProducts.filter(p => p.pod_provider === 'printful').length} LAVIKA collegati
        </span>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <div>
            <p className="text-sm font-semibold text-red-400">Errore Printful</p>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        </div>
      ) : null}

      {!loading && !error && orphans.length > 0 ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-400">
                {orphans.length} prodott{orphans.length === 1 ? 'o orfano' : 'i orfani'} su Printful
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Erano collegati a Printful ma il sync product non esiste più. Archiviali per nasconderli dallo shop pubblico (gli ordini storici restano intatti).
              </p>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {orphans.map((sp) => (
              <div
                key={sp.id}
                className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-background/40 p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{sp.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {sp.slug} · status: {sp.status} · pod_id: {sp.pod_product_id}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={archiving === sp.id}
                  onClick={() => void handleArchive(sp.id, sp.name)}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400 transition-colors hover:bg-amber-500/20 disabled:opacity-40"
                >
                  <Archive className="h-3 w-3" />
                  {archiving === sp.id ? 'Archivio…' : 'Archivia'}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Carico…</p>
      ) : pfProducts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
          <Package className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold text-foreground">Nessun Sync Product su Printful</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Vai su{' '}
            <a href="https://www.printful.com/dashboard" target="_blank" rel="noreferrer" className="underline">
              Printful dashboard
            </a>
            {' '}e crea un prodotto con design + varianti. Poi torna qui per collegarlo.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Printful sync products */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Sync Products Printful ({pfProducts.length})
            </h3>
            <div className="space-y-2">
              {pfProducts.map((pf) => {
                const linkedShop = shopProducts.find(s => s.pod_product_id === String(pf.id));
                return (
                  <div
                    key={pf.id}
                    className={`flex items-start gap-3 rounded-xl border p-3 ${
                      linkedShop ? 'border-emerald-500/20 bg-emerald-500/[0.03]' : 'border-border bg-card'
                    }`}
                  >
                    {pf.thumbnail_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={pf.thumbnail_url} alt={pf.name} className="h-14 w-14 rounded-md object-cover" />
                    ) : (
                      <div className="h-14 w-14 rounded-md bg-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{pf.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {pf.synced}/{pf.variants} varianti sync
                        {pf.external_id ? ` · ext: ${pf.external_id}` : ''}
                      </p>
                      {linkedShop ? (
                        <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          Collegato a {linkedShop.name}
                        </p>
                      ) : null}
                    </div>
                    <a
                      href={`https://www.printful.com/dashboard/sync/update?id=${pf.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                      title="Apri su Printful"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                );
              })}
            </div>
          </section>

          {/* LAVIKA products */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Prodotti LAVIKA ({shopProducts.length})
            </h3>
            <div className="space-y-2">
              {shopProducts.map((sp) => {
                const isLinked = sp.pod_provider === 'printful' && sp.pod_product_id;
                const linkedPf = isLinked ? pfProducts.find(p => String(p.id) === sp.pod_product_id) : null;
                const suggestion = pfBySlug.get((sp.slug || '').toLowerCase());

                return (
                  <div
                    key={sp.id}
                    className={`flex items-start gap-3 rounded-xl border p-3 ${
                      isLinked ? 'border-emerald-500/20 bg-emerald-500/[0.03]' : 'border-border bg-card'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{sp.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {sp.slug} · {sp.status}
                      </p>
                      {isLinked && linkedPf ? (
                        <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
                          <LinkIcon className="h-3 w-3" />
                          Printful: {linkedPf.name}
                        </p>
                      ) : suggestion ? (
                        <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-400">
                          Suggerimento: {suggestion.name} (ext_id match)
                        </p>
                      ) : null}
                    </div>

                    {isLinked ? (
                      <button
                        type="button"
                        onClick={() => void handleUnlink(sp.id, sp.name)}
                        className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30"
                      >
                        <Unlink className="h-3 w-3" />
                        Scollega
                      </button>
                    ) : (
                      <select
                        disabled={linking === sp.id || pfProducts.length === 0}
                        defaultValue=""
                        onChange={(e) => {
                          const pfId = Number(e.target.value);
                          if (!pfId) return;
                          const pf = pfProducts.find(p => p.id === pfId);
                          if (pf) void handleLink(sp.id, pfId, sp.name, pf.name);
                          e.currentTarget.value = '';
                        }}
                        className="h-8 rounded-md border border-border bg-background px-2 text-[10px] font-semibold uppercase tracking-wider text-foreground outline-none disabled:opacity-40"
                      >
                        <option value="" disabled>Collega a…</option>
                        {pfProducts.map(pf => (
                          <option key={pf.id} value={pf.id}>
                            {suggestion?.id === pf.id ? '★ ' : ''}{pf.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
