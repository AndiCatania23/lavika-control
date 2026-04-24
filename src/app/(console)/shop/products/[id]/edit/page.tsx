'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '@/lib/toast';
import { ChevronLeft } from 'lucide-react';
import { ProductForm, type ProductFormValue } from '@/components/shop/ProductForm';
import { ProductImagesPanel } from '@/components/shop/ProductImagesPanel';
import { ProductVariantsPanel } from '@/components/shop/ProductVariantsPanel';
import { getShopProducts, updateShopProduct, type ShopProduct } from '@/lib/data/shop';

export default function EditProductPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const [product, setProduct] = useState<ShopProduct | null>(null);
  const [formValue, setFormValue] = useState<ProductFormValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadProduct = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getShopProducts();
      const found = all.find((p) => p.id === params.id);
      if (!found) {
        showToast('error', 'Prodotto non trovato');
        router.push('/shop/products');
        return;
      }
      setProduct(found);
      setFormValue({
        slug: found.slug,
        name: found.name,
        subtitle: found.subtitle ?? '',
        description: found.description ?? '',
        product_type: found.product_type,
        category: found.category,
        tier: found.tier,
        sector: found.sector,
        price_eur: found.price_eur,
        price_original_eur: found.price_original_eur,
        badge: found.badge,
        limited_edition_max: found.limited_edition_max,
        limited_edition_number: found.limited_edition_number,
        signed_by: found.signed_by ?? '',
        signed_on: found.signed_on ?? '',
        status: found.status,
        sort_order: found.sort_order,
      });
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore caricamento');
    } finally {
      setLoading(false);
    }
  }, [params.id, router, showToast]);

  useEffect(() => {
    void loadProduct();
  }, [loadProduct]);

  const handleSave = async () => {
    if (!formValue || !product) return;
    setSaving(true);
    try {
      await updateShopProduct(product.id, {
        ...formValue,
        subtitle: formValue.subtitle || null,
        description: formValue.description || null,
        signed_by: formValue.signed_by || null,
        signed_on: formValue.signed_on || null,
      });
      showToast('success', 'Prodotto aggiornato');
      await loadProduct();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore salvataggio');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !formValue || !product) {
    return (
      <div className="vstack" style={{ gap: 'var(--s4)' }}>
        <div className="card" style={{ height: 80, opacity: 0.4 }} />
        <div className="card" style={{ height: 380, opacity: 0.4 }} />
      </div>
    );
  }

  return (
    <div className="vstack" style={{ gap: 'var(--s4)' }}>
      <Link href="/shop/products" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}>
        <ChevronLeft className="w-4 h-4" /> Torna ai prodotti
      </Link>

      <div>
        <h1 className="typ-h1">{product.name || 'Modifica prodotto'}</h1>
        <p className="typ-caption mt-1">Slug: <span className="typ-mono">{product.slug}</span> · Creato {new Date(product.created_at).toLocaleDateString('it-IT')}</p>
      </div>

      <ProductForm
        value={formValue}
        onChange={setFormValue}
        onSubmit={handleSave}
        saving={saving}
        submitLabel="Salva modifiche"
      />

      {/* Gallery immagini */}
      <ProductImagesPanel
        productId={product.id}
        productSlug={product.slug}
        images={product.images ?? []}
        onChange={loadProduct}
      />

      {/* Varianti (taglie/colori/stock) */}
      <ProductVariantsPanel
        productId={product.id}
        variants={product.variants ?? []}
        onChange={loadProduct}
      />
    </div>
  );
}
