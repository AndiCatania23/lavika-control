'use client';

import { useState } from 'react';
import { useToast } from '@/lib/toast';
import {
  addShopProductVariant,
  updateShopProductVariant,
  deleteShopProductVariant,
  type ShopProductVariant,
} from '@/lib/data/shop';
import { Plus, Trash2, Save, AlertTriangle } from 'lucide-react';

interface Props {
  productId: string;
  variants: ShopProductVariant[];
  onChange: () => void | Promise<void>;
}

const COMMON_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'TAGLIA UNICA'];

export function ProductVariantsPanel({ productId, variants, onChange }: Props) {
  const { showToast } = useToast();
  const [newVariant, setNewVariant] = useState({
    size: '',
    color: '',
    price_delta_eur: 0,
    stock: 0,
    low_stock_threshold: 3,
  });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<ShopProductVariant>>({});

  const handleAdd = async () => {
    if (!newVariant.size && !newVariant.color) {
      showToast('error', 'Inserisci almeno taglia o colore');
      return;
    }

    setSaving(true);
    try {
      await addShopProductVariant({
        product_id: productId,
        size: newVariant.size || undefined,
        color: newVariant.color || undefined,
        price_delta_eur: newVariant.price_delta_eur,
        stock: newVariant.stock,
        low_stock_threshold: newVariant.low_stock_threshold,
      });
      setNewVariant({ size: '', color: '', price_delta_eur: 0, stock: 0, low_stock_threshold: 3 });
      showToast('success', 'Variante aggiunta');
      await onChange();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore aggiunta');
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (variant: ShopProductVariant) => {
    setEditingId(variant.id);
    setEditDraft({
      size: variant.size,
      color: variant.color,
      price_delta_eur: variant.price_delta_eur,
      stock: variant.stock,
      low_stock_threshold: variant.low_stock_threshold,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    try {
      await updateShopProductVariant(editingId, editDraft);
      showToast('success', 'Variante aggiornata');
      setEditingId(null);
      setEditDraft({});
      await onChange();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore salvataggio');
    }
  };

  const handleDelete = async (variant: ShopProductVariant) => {
    const label = [variant.size, variant.color].filter(Boolean).join(' / ') || 'questa variante';
    if (!window.confirm(`Eliminare ${label}?`)) return;
    try {
      await deleteShopProductVariant(variant.id);
      showToast('success', 'Variante eliminata');
      await onChange();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore eliminazione');
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Varianti ({variants.length})
        </h3>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Taglie/colori con stock separato. Lascia vuoto per prodotti senza varianti.
        </p>
      </div>

      {/* Existing variants */}
      {variants.length > 0 ? (
        <div className="space-y-2">
          {variants.map((v) => {
            const isEditing = editingId === v.id;
            const lowStock = v.stock <= v.low_stock_threshold;

            return (
              <div key={v.id} className="rounded-lg border border-border bg-background p-3">
                {isEditing ? (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
                    <FieldInline label="Taglia">
                      <input
                        list="common-sizes"
                        type="text"
                        value={editDraft.size ?? ''}
                        onChange={(e) => setEditDraft({ ...editDraft, size: e.target.value })}
                        className={inputInline}
                      />
                    </FieldInline>
                    <FieldInline label="Colore">
                      <input
                        type="text"
                        value={editDraft.color ?? ''}
                        onChange={(e) => setEditDraft({ ...editDraft, color: e.target.value })}
                        className={inputInline}
                      />
                    </FieldInline>
                    <FieldInline label="Delta € (+/-)">
                      <input
                        type="number"
                        step="0.01"
                        value={editDraft.price_delta_eur ?? 0}
                        onChange={(e) => setEditDraft({ ...editDraft, price_delta_eur: Number(e.target.value) })}
                        className={inputInline}
                      />
                    </FieldInline>
                    <FieldInline label="Stock">
                      <input
                        type="number"
                        min={0}
                        value={editDraft.stock ?? 0}
                        onChange={(e) => setEditDraft({ ...editDraft, stock: Number(e.target.value) })}
                        className={inputInline}
                      />
                    </FieldInline>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={handleSaveEdit}
                        className="flex-1 inline-flex items-center justify-center gap-1 h-9 px-3 rounded bg-foreground text-background text-xs font-semibold"
                      >
                        <Save className="w-3.5 h-3.5" />
                        Salva
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditDraft({});
                        }}
                        className="inline-flex items-center justify-center h-9 px-3 rounded border border-border text-xs font-medium text-foreground"
                      >
                        Annulla
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="inline-flex items-center justify-center h-8 px-3 rounded-full bg-muted text-sm font-semibold text-foreground shrink-0">
                        {v.size || '—'}
                        {v.color ? ` · ${v.color}` : ''}
                      </span>
                      {v.price_delta_eur !== 0 ? (
                        <span className="text-xs text-muted-foreground">
                          {v.price_delta_eur > 0 ? '+' : ''}
                          €{v.price_delta_eur}
                        </span>
                      ) : null}
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold ${
                          lowStock ? 'text-orange-500' : 'text-muted-foreground'
                        }`}
                      >
                        {lowStock && <AlertTriangle className="w-3 h-3" />}
                        Stock: {v.stock}
                      </span>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(v)}
                        className="inline-flex items-center h-8 px-3 rounded border border-border hover:bg-muted text-xs font-medium text-foreground"
                      >
                        Modifica
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(v)}
                        className="inline-flex items-center justify-center h-8 w-8 rounded border border-border hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/30"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Add new variant */}
      <div className="rounded-lg border border-dashed border-border bg-background/50 p-3">
        <p className="text-xs font-semibold text-muted-foreground mb-2">Aggiungi variante</p>
        <datalist id="common-sizes">
          {COMMON_SIZES.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <FieldInline label="Taglia">
            <input
              list="common-sizes"
              type="text"
              value={newVariant.size}
              onChange={(e) => setNewVariant({ ...newVariant, size: e.target.value })}
              placeholder="S / M / L…"
              className={inputInline}
            />
          </FieldInline>
          <FieldInline label="Colore">
            <input
              type="text"
              value={newVariant.color}
              onChange={(e) => setNewVariant({ ...newVariant, color: e.target.value })}
              placeholder="Nero, Rosso…"
              className={inputInline}
            />
          </FieldInline>
          <FieldInline label="Delta € (+/-)">
            <input
              type="number"
              step="0.01"
              value={newVariant.price_delta_eur}
              onChange={(e) => setNewVariant({ ...newVariant, price_delta_eur: Number(e.target.value) })}
              className={inputInline}
            />
          </FieldInline>
          <FieldInline label="Stock">
            <input
              type="number"
              min={0}
              value={newVariant.stock}
              onChange={(e) => setNewVariant({ ...newVariant, stock: Number(e.target.value) })}
              className={inputInline}
            />
          </FieldInline>
          <button
            type="button"
            onClick={handleAdd}
            disabled={saving}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded bg-foreground text-background text-xs font-semibold disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            Aggiungi
          </button>
        </div>
      </div>
    </section>
  );
}

function FieldInline({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const inputInline =
  'w-full h-9 px-2.5 rounded border border-border bg-background text-sm text-foreground outline-none focus:border-muted-foreground/60';
