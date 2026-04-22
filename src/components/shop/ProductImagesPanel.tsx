'use client';

import { useState, useRef } from 'react';
import { useToast } from '@/lib/toast';
import {
  addShopProductImage,
  deleteShopProductImage,
  updateShopProductImage,
  type ShopProductImage,
} from '@/lib/data/shop';
import { Upload, Star, Trash2, Loader2 } from 'lucide-react';

interface Props {
  productId: string;
  productSlug: string;
  images: ShopProductImage[];
  onChange: () => void | Promise<void>;
}

type ImageRole = 'main' | 'gallery' | 'detail';

export function ProductImagesPanel({ productId, productSlug, images, onChange }: Props) {
  const { showToast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [role, setRole] = useState<ImageRole>('gallery');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      // 1. Upload file su R2 via /api/media/upload
      const fd = new FormData();
      fd.append('type', 'shop-product-image');
      fd.append('productSlug', productSlug);
      fd.append('imageRole', role);
      fd.append('file', file);

      const uploadRes = await fetch('/api/media/upload', { method: 'POST', body: fd });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({ error: 'Upload fallito' }));
        throw new Error(err.error || 'Upload fallito');
      }
      const { url } = (await uploadRes.json()) as { url: string };

      // 2. Registra la riga in shop_product_images
      const hasAnyPrimary = images.some((i) => i.is_primary);
      await addShopProductImage({
        product_id: productId,
        url,
        is_primary: role === 'main' || !hasAnyPrimary, // se è main o se non c'è ancora primary, imposta primary
        sort_order: images.length,
      });

      showToast('success', 'Immagine caricata');
      await onChange();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore upload');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleSetPrimary = async (image: ShopProductImage) => {
    try {
      await updateShopProductImage(image.id, { is_primary: true });
      showToast('success', 'Immagine principale aggiornata');
      await onChange();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore aggiornamento');
    }
  };

  const handleDelete = async (image: ShopProductImage) => {
    if (!window.confirm('Eliminare questa immagine?')) return;
    try {
      await deleteShopProductImage(image.id);
      showToast('success', 'Immagine eliminata');
      await onChange();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore eliminazione');
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Immagini ({images.length})
          </h3>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Carica foto JPG/PNG. Vengono convertite in WebP e ridimensionate a 2048px max.
          </p>
        </div>
      </div>

      {/* Upload row */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as ImageRole)}
          className="h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground outline-none"
          disabled={uploading}
        >
          <option value="main">Main (cover principale)</option>
          <option value="gallery">Gallery</option>
          <option value="detail">Detail / zoom</option>
        </select>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
          }}
        />

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-foreground text-background text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? 'Caricamento…' : 'Carica immagine'}
        </button>
      </div>

      {/* Gallery */}
      {images.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-background/50 p-8 text-center">
          <p className="text-sm text-muted-foreground">Nessuna immagine ancora. Carica la prima.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {images
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((img) => (
              <div key={img.id} className="relative group rounded-lg overflow-hidden border border-border bg-background">
                <div className="aspect-square bg-muted/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.alt_text ?? ''} className="w-full h-full object-cover" />
                </div>
                {img.is_primary ? (
                  <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                    <Star className="w-2.5 h-2.5 fill-current" />
                    Main
                  </span>
                ) : null}
                <div className="absolute inset-x-0 bottom-0 p-1.5 flex gap-1 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  {!img.is_primary ? (
                    <button
                      type="button"
                      onClick={() => void handleSetPrimary(img)}
                      className="flex-1 inline-flex items-center justify-center gap-1 h-7 px-2 rounded bg-white/10 hover:bg-white/20 text-[11px] font-semibold text-white backdrop-blur-sm"
                      title="Imposta come main"
                    >
                      <Star className="w-3 h-3" />
                      Main
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void handleDelete(img)}
                    className="inline-flex items-center justify-center h-7 w-7 rounded bg-red-500/80 hover:bg-red-500 text-white"
                    title="Elimina"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}
