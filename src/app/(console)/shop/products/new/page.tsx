'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { SectionHeader } from '@/components/SectionHeader';
import { useToast } from '@/lib/toast';
import { ChevronLeft } from 'lucide-react';
import { ProductForm, type ProductFormValue } from '@/components/shop/ProductForm';
import { createShopProduct, slugify } from '@/lib/data/shop';

const INITIAL: ProductFormValue = {
  slug: '',
  name: '',
  subtitle: '',
  description: '',
  product_type: 'tshirt',
  category: 'lavika',
  tier: 'standard',
  sector: null,
  price_eur: 0,
  price_original_eur: null,
  badge: null,
  limited_edition_max: null,
  limited_edition_number: null,
  signed_by: '',
  signed_on: '',
  status: 'draft',
  sort_order: 0,
};

export default function NewProductPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [value, setValue] = useState<ProductFormValue>(INITIAL);
  const [saving, setSaving] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);

  // Auto-slug da nome finche' utente non lo modifica
  useEffect(() => {
    if (!slugTouched) {
      setValue((prev) => ({ ...prev, slug: slugify(prev.name) }));
    }
  }, [value.name, slugTouched]);

  const handleSubmit = async () => {
    if (!value.name || !value.slug) {
      showToast('error', 'Nome e slug sono obbligatori');
      return;
    }
    if (value.price_eur < 0) {
      showToast('error', 'Il prezzo deve essere >= 0');
      return;
    }

    setSaving(true);
    try {
      const created = await createShopProduct({
        ...value,
        subtitle: value.subtitle || null,
        description: value.description || null,
        signed_by: value.signed_by || null,
        signed_on: value.signed_on || null,
      });
      showToast('success', 'Prodotto creato');
      router.push(`/shop/products/${created.id}/edit`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore creazione');
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Nuovo prodotto"
        description="Compila i campi base. Immagini e varianti le aggiungi dopo aver creato il prodotto."
        actions={
          <Link
            href="/shop/products"
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg border border-border bg-card hover:bg-muted text-sm font-medium text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Torna ai prodotti
          </Link>
        }
      />

      <ProductForm
        value={value}
        onChange={(next) => {
          setValue(next);
          if (next.slug !== slugify(value.name)) setSlugTouched(true);
        }}
        onSlugTouch={() => setSlugTouched(true)}
        onSubmit={handleSubmit}
        saving={saving}
        submitLabel="Crea prodotto"
      />
    </div>
  );
}
