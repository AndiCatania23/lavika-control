'use client';

import Link from 'next/link';
import { useEffect, useState, useMemo } from 'react';
import { ModalConfirm } from '@/components/ModalConfirm';
import { useToast } from '@/lib/toast';
import {
  getShopProducts, deleteShopProduct, updateShopProduct,
  PRODUCT_TYPE_LABELS, CATEGORY_LABELS, SECTOR_LABELS, STATUS_LABELS, formatPrice,
  type ShopProduct, type ProductStatus, type ProductType, type ProductCategory,
} from '@/lib/data/shop';
import { Plus, Pencil, Trash2, Eye, EyeOff, PackageOpen, Archive, Search, Filter } from 'lucide-react';

function statusPillClass(s: ProductStatus): string {
  return s === 'active' ? 'pill pill-ok'
    : s === 'draft'    ? 'pill pill-warn'
    : s === 'paused'   ? 'pill pill-warn'
    : 'pill';
}

export default function ShopProductsPage() {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ShopProduct | null>(null);
  const [statusFilter, setStatusFilter] = useState<ProductStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<ProductType | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<ProductCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const { showToast } = useToast();

  const loadProducts = async () => {
    setLoading(true);
    try {
      const data = await getShopProducts();
      setProducts(data);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore caricamento');
    } finally { setLoading(false); }
  };

  useEffect(() => { void loadProducts(); }, []);

  const filtered = useMemo(() => products.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (typeFilter !== 'all' && p.product_type !== typeFilter) return false;
    if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
    if (searchQuery && !`${p.name} ${p.slug} ${p.subtitle ?? ''}`.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }), [products, statusFilter, typeFilter, categoryFilter, searchQuery]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteShopProduct(deleteTarget.id);
      showToast('success', 'Prodotto eliminato');
      setDeleteTarget(null);
      void loadProducts();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore eliminazione');
    }
  };

  const handleToggleStatus = async (product: ShopProduct, nextStatus: ProductStatus) => {
    try {
      await updateShopProduct(product.id, { status: nextStatus });
      showToast('success', `Status aggiornato: ${STATUS_LABELS[nextStatus]}`);
      void loadProducts();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore aggiornamento');
    }
  };

  const activeCount = products.filter(p => p.status === 'active').length;
  const filtersActive = statusFilter !== 'all' || typeFilter !== 'all' || categoryFilter !== 'all';

  return (
    <div className="vstack" style={{ gap: 'var(--s4)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-col sm:flex-row">
        <div className="relative w-full sm:grow">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
          <input
            type="search"
            placeholder="Cerca nome, slug, sottotitolo..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="input pl-10"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button onClick={() => setShowFilters(v => !v)} className="btn btn-ghost btn-sm">
            <Filter className="w-4 h-4" />
            <span className="hidden md:inline">Filtri</span>
            {filtersActive && <span className="dot dot-warn" />}
          </button>
          <Link href="/shop/products/new" className="btn btn-primary btn-sm grow sm:grow-0">
            <Plus className="w-4 h-4" /> Nuovo
          </Link>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="card card-body grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="typ-micro block mb-1.5">Status</label>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as ProductStatus | 'all')} className="input">
              <option value="all">Tutti</option>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="typ-micro block mb-1.5">Tipo</label>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as ProductType | 'all')} className="input">
              <option value="all">Tutti</option>
              {Object.entries(PRODUCT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="typ-micro block mb-1.5">Categoria</label>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value as ProductCategory | 'all')} className="input">
              <option value="all">Tutte</option>
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Count strip */}
      <div className="typ-caption" style={{ paddingLeft: 2 }}>
        {loading ? 'Carico…' : `${filtered.length} prodotti · ${activeCount} attivi`}
      </div>

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div className="card card-body text-center">
          <PackageOpen className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
          <p className="typ-label">{products.length === 0 ? 'Nessun prodotto' : 'Nessun risultato'}</p>
          <p className="typ-caption mt-1">{products.length === 0 ? 'Crea il primo prodotto per iniziare.' : 'Prova a rimuovere qualche filtro.'}</p>
          {products.length === 0 && (
            <Link href="/shop/products/new" className="btn btn-primary btn-sm mt-4" style={{ marginLeft: 'auto', marginRight: 'auto' }}>
              <Plus className="w-4 h-4" /> Crea primo prodotto
            </Link>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card" style={{ height: 260, opacity: 0.4 }} />
          ))}
        </div>
      )}

      {/* Grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map(product => {
            const primaryImage = product.images?.find(i => i.is_primary) ?? product.images?.[0];
            return (
              <div key={product.id} className="card card-hover" style={{ overflow: 'hidden' }}>
                {/* Image */}
                <div className="relative aspect-[4/3] overflow-hidden" style={{ background: 'var(--card-muted)' }}>
                  {primaryImage ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={primaryImage.url} alt={product.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <PackageOpen className="w-8 h-8" style={{ color: 'var(--text-muted)' }} />
                    </div>
                  )}
                  <span className={statusPillClass(product.status)} style={{ position: 'absolute', top: 8, left: 8, fontSize: 10, padding: '1px 6px' }}>
                    {STATUS_LABELS[product.status]}
                  </span>
                </div>

                {/* Info */}
                <div className="card-body" style={{ padding: 10 }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="grow min-w-0">
                      <div className="typ-label truncate">{product.name}</div>
                      <div className="typ-caption truncate">
                        {PRODUCT_TYPE_LABELS[product.product_type]} · {CATEGORY_LABELS[product.category]}
                        {product.sector ? ` · ${SECTOR_LABELS[product.sector]}` : ''}
                      </div>
                    </div>
                    <div className="typ-label shrink-0" style={{ fontWeight: 700 }}>{formatPrice(product.price_eur)}</div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 mt-2 pt-2 border-t border-[color:var(--hairline-soft)]">
                    <Link href={`/shop/products/${product.id}/edit`} className="btn btn-ghost btn-sm grow">
                      <Pencil className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Edit</span>
                    </Link>

                    {(product.status === 'draft' || product.status === 'paused') && (
                      <button
                        type="button"
                        onClick={() => void handleToggleStatus(product, 'active')}
                        className="btn btn-ghost btn-sm btn-icon"
                        title="Pubblica"
                        style={{ color: 'var(--ok)' }}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {product.status === 'active' && (
                      <button
                        type="button"
                        onClick={() => void handleToggleStatus(product, 'paused')}
                        className="btn btn-ghost btn-sm btn-icon"
                        title="Pausa"
                        style={{ color: 'var(--warn)' }}
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {product.status !== 'archived' && (
                      <button
                        type="button"
                        onClick={() => void handleToggleStatus(product, 'archived')}
                        className="btn btn-ghost btn-sm btn-icon"
                        title="Archivia"
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(product)}
                      className="btn btn-ghost btn-sm btn-icon"
                      title="Elimina"
                      style={{ color: 'var(--danger)' }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ModalConfirm
        isOpen={deleteTarget !== null}
        title="Elimina prodotto"
        message={
          deleteTarget
            ? `Sei sicuro di voler eliminare "${deleteTarget.name}"? Rimuoverà anche immagini e varianti. Non è reversibile.`
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
