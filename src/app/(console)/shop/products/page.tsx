'use client';

import Link from 'next/link';
import { useEffect, useState, useMemo } from 'react';
import { SectionHeader } from '@/components/SectionHeader';
import { ModalConfirm } from '@/components/ModalConfirm';
import { useToast } from '@/lib/toast';
import {
  getShopProducts,
  deleteShopProduct,
  updateShopProduct,
  PRODUCT_TYPE_LABELS,
  CATEGORY_LABELS,
  SECTOR_LABELS,
  STATUS_LABELS,
  formatPrice,
  type ShopProduct,
  type ProductStatus,
  type ProductType,
  type ProductCategory,
} from '@/lib/data/shop';
import { Plus, Pencil, Trash2, Eye, EyeOff, PackageOpen, Archive, Search } from 'lucide-react';

const STATUS_STYLES: Record<ProductStatus, { bg: string; text: string }> = {
  draft: { bg: 'bg-yellow-500/10', text: 'text-yellow-500' },
  active: { bg: 'bg-green-500/10', text: 'text-green-500' },
  paused: { bg: 'bg-orange-500/10', text: 'text-orange-500' },
  archived: { bg: 'bg-muted', text: 'text-muted-foreground' },
};

export default function ShopProductsPage() {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ShopProduct | null>(null);
  const [statusFilter, setStatusFilter] = useState<ProductStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<ProductType | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<ProductCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const { showToast } = useToast();

  const loadProducts = async () => {
    setLoading(true);
    try {
      const data = await getShopProducts();
      setProducts(data);
    } catch (err) {
      showToast('error',err instanceof Error ? err.message : 'Errore nel caricamento');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProducts();
  }, []);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (typeFilter !== 'all' && p.product_type !== typeFilter) return false;
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      if (searchQuery && !`${p.name} ${p.slug} ${p.subtitle ?? ''}`.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [products, statusFilter, typeFilter, categoryFilter, searchQuery]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteShopProduct(deleteTarget.id);
      showToast('success','Prodotto eliminato');
      setDeleteTarget(null);
      void loadProducts();
    } catch (err) {
      showToast('error',err instanceof Error ? err.message : 'Errore eliminazione');
    }
  };

  const handleToggleStatus = async (product: ShopProduct, nextStatus: ProductStatus) => {
    try {
      await updateShopProduct(product.id, { status: nextStatus });
      showToast('success',`Status aggiornato: ${STATUS_LABELS[nextStatus]}`);
      void loadProducts();
    } catch (err) {
      showToast('error',err instanceof Error ? err.message : 'Errore aggiornamento');
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Prodotti Shop"
        description={`${products.length} prodotti · ${products.filter((p) => p.status === 'active').length} attivi`}
        actions={
          <Link
            href="/shop/products/new"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-foreground text-background text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            Nuovo prodotto
          </Link>
        }
      />

      {/* Filtri */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 h-10 px-3 rounded-lg border border-border bg-card flex-1 min-w-[200px] max-w-md">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            type="search"
            placeholder="Cerca per nome, slug, sottotitolo…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <FilterSelect
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as ProductStatus | 'all')}
          options={[
            { value: 'all', label: 'Tutti gli status' },
            ...Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l })),
          ]}
        />

        <FilterSelect
          value={typeFilter}
          onChange={(v) => setTypeFilter(v as ProductType | 'all')}
          options={[
            { value: 'all', label: 'Tutti i tipi' },
            ...Object.entries(PRODUCT_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l })),
          ]}
        />

        <FilterSelect
          value={categoryFilter}
          onChange={(v) => setCategoryFilter(v as ProductCategory | 'all')}
          options={[
            { value: 'all', label: 'Tutte le categorie' },
            ...Object.entries(CATEGORY_LABELS).map(([v, l]) => ({ value: v, label: l })),
          ]}
        />
      </div>

      {/* Empty state */}
      {!loading && filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <PackageOpen className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-base font-semibold text-foreground">
            {products.length === 0 ? 'Nessun prodotto ancora' : 'Nessun prodotto con questi filtri'}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {products.length === 0 ? 'Crea il tuo primo prodotto per iniziare.' : 'Prova a rimuovere qualche filtro.'}
          </p>
          {products.length === 0 ? (
            <Link
              href="/shop/products/new"
              className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-foreground text-background text-sm font-semibold"
            >
              <Plus className="w-4 h-4" />
              Crea primo prodotto
            </Link>
          ) : null}
        </div>
      ) : null}

      {/* Loading state */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-48 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : null}

      {/* Product grid */}
      {!loading && filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((product) => {
            const primaryImage = product.images?.find((i) => i.is_primary) ?? product.images?.[0];
            const statusStyle = STATUS_STYLES[product.status];

            return (
              <article key={product.id} className="rounded-xl border border-border bg-card overflow-hidden group">
                <div className="relative aspect-[4/3] bg-muted/50 flex items-center justify-center">
                  {primaryImage ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={primaryImage.url} alt={product.name} className="w-full h-full object-cover" />
                  ) : (
                    <PackageOpen className="w-10 h-10 text-muted-foreground" />
                  )}
                  <span
                    className={`absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${statusStyle.bg} ${statusStyle.text}`}
                  >
                    {STATUS_LABELS[product.status]}
                  </span>
                </div>

                <div className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-foreground truncate">{product.name}</h3>
                      <p className="text-xs text-muted-foreground truncate">
                        {PRODUCT_TYPE_LABELS[product.product_type]} · {CATEGORY_LABELS[product.category]}
                        {product.sector ? ` · ${SECTOR_LABELS[product.sector]}` : ''}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-foreground shrink-0">{formatPrice(product.price_eur)}</p>
                  </div>

                  <div className="flex items-center gap-1.5 pt-1">
                    <Link
                      href={`/shop/products/${product.id}/edit`}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md border border-border bg-card hover:bg-muted text-xs font-medium text-foreground transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Modifica
                    </Link>

                    {product.status === 'draft' || product.status === 'paused' ? (
                      <button
                        type="button"
                        onClick={() => void handleToggleStatus(product, 'active')}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-border hover:bg-green-500/10 hover:border-green-500/30 hover:text-green-500 transition-colors"
                        title="Pubblica (active)"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    ) : product.status === 'active' ? (
                      <button
                        type="button"
                        onClick={() => void handleToggleStatus(product, 'paused')}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-border hover:bg-orange-500/10 hover:border-orange-500/30 hover:text-orange-500 transition-colors"
                        title="Metti in pausa"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                      </button>
                    ) : null}

                    {product.status !== 'archived' ? (
                      <button
                        type="button"
                        onClick={() => void handleToggleStatus(product, 'archived')}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-border hover:bg-muted transition-colors"
                        title="Archivia"
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => setDeleteTarget(product)}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-border hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-500 transition-colors"
                      title="Elimina"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      <ModalConfirm
        isOpen={deleteTarget !== null}
        title="Elimina prodotto"
        message={
          deleteTarget
            ? `Sei sicuro di voler eliminare "${deleteTarget.name}"? L'operazione rimuovera' anche immagini e varianti associate. Non e' reversibile.`
            : ''
        }
        confirmLabel="Elimina"
        variant="danger"
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 px-3 rounded-lg border border-border bg-card text-sm text-foreground outline-none focus:border-muted-foreground/60"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
