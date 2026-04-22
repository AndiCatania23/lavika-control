'use client';

import {
  PRODUCT_TYPE_LABELS,
  CATEGORY_LABELS,
  TIER_LABELS,
  SECTOR_LABELS,
  STATUS_LABELS,
  type ProductType,
  type ProductCategory,
  type ProductTier,
  type StadiumSector,
  type ProductBadge,
  type ProductStatus,
} from '@/lib/data/shop';

export interface ProductFormValue {
  slug: string;
  name: string;
  subtitle: string;
  description: string;
  product_type: ProductType;
  category: ProductCategory;
  tier: ProductTier;
  sector: StadiumSector | null;
  price_eur: number;
  price_original_eur: number | null;
  badge: ProductBadge | null;
  limited_edition_max: number | null;
  limited_edition_number: number | null;
  signed_by: string;
  signed_on: string;
  status: ProductStatus;
  sort_order: number;
}

interface ProductFormProps {
  value: ProductFormValue;
  onChange: (next: ProductFormValue) => void;
  onSlugTouch?: () => void;
  onSubmit: () => void;
  saving: boolean;
  submitLabel: string;
}

export function ProductForm({ value, onChange, onSlugTouch, onSubmit, saving, submitLabel }: ProductFormProps) {
  const set = <K extends keyof ProductFormValue>(key: K, v: ProductFormValue[K]) => {
    onChange({ ...value, [key]: v });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-6"
    >
      {/* ── Base ────────────────────────────────────────── */}
      <FormSection title="Base">
        <Field label="Nome *" required>
          <input
            type="text"
            required
            value={value.name}
            onChange={(e) => set('name', e.target.value)}
            className={inputClass}
            placeholder="Es. Felpa Curva Sud"
          />
        </Field>

        <Field label="Slug *" hint="URL univoco, kebab-case. Si auto-genera dal nome.">
          <input
            type="text"
            required
            value={value.slug}
            onChange={(e) => {
              set('slug', e.target.value);
              onSlugTouch?.();
            }}
            className={inputClass + ' font-mono'}
            placeholder="felpa-curva-sud"
          />
        </Field>

        <Field label="Sottotitolo" hint="Es. 'Jacquard a due facce · Design tifoseria'">
          <input
            type="text"
            value={value.subtitle}
            onChange={(e) => set('subtitle', e.target.value)}
            className={inputClass}
            placeholder="Sottotitolo visibile sulla card"
          />
        </Field>

        <Field label="Descrizione">
          <textarea
            rows={4}
            value={value.description}
            onChange={(e) => set('description', e.target.value)}
            className={inputClass + ' resize-y'}
            placeholder="Descrizione lunga visibile nel dettaglio prodotto"
          />
        </Field>
      </FormSection>

      {/* ── Classificazione ─────────────────────────────── */}
      <FormSection title="Classificazione">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Tipo prodotto *">
            <select
              value={value.product_type}
              onChange={(e) => set('product_type', e.target.value as ProductType)}
              className={selectClass}
            >
              {Object.entries(PRODUCT_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Categoria *">
            <select
              value={value.category}
              onChange={(e) => set('category', e.target.value as ProductCategory)}
              className={selectClass}
            >
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Tier">
            <select
              value={value.tier}
              onChange={(e) => set('tier', e.target.value as ProductTier)}
              className={selectClass}
            >
              {Object.entries(TIER_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label="Settore stadio"
          hint="Solo per prodotti curva/tifoseria. Lascia vuoto per prodotti neutri (visibili a tutti)."
        >
          <select
            value={value.sector ?? ''}
            onChange={(e) => set('sector', (e.target.value || null) as StadiumSector | null)}
            className={selectClass}
          >
            <option value="">— Nessuno (prodotto neutro) —</option>
            {Object.entries(SECTOR_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
      </FormSection>

      {/* ── Prezzo ──────────────────────────────────────── */}
      <FormSection title="Prezzo">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Prezzo (€) *">
            <input
              type="number"
              min={0}
              step="0.01"
              required
              value={value.price_eur}
              onChange={(e) => set('price_eur', Number(e.target.value))}
              className={inputClass}
            />
          </Field>

          <Field label="Prezzo originale (€)" hint="Opzionale, mostra barrato per evidenziare saldo.">
            <input
              type="number"
              min={0}
              step="0.01"
              value={value.price_original_eur ?? ''}
              onChange={(e) => set('price_original_eur', e.target.value ? Number(e.target.value) : null)}
              className={inputClass}
              placeholder="—"
            />
          </Field>

          <Field label="Badge">
            <select
              value={value.badge ?? ''}
              onChange={(e) => set('badge', (e.target.value || null) as ProductBadge | null)}
              className={selectClass}
            >
              <option value="">— Nessuno —</option>
              <option value="new">NUOVO</option>
              <option value="sale">SALDI</option>
              <option value="limited">LIMITED</option>
              <option value="signed">FIRMATO</option>
              <option value="hot">HOT</option>
            </select>
          </Field>
        </div>
      </FormSection>

      {/* ── Collector fields (se tier=collector) ───────── */}
      {value.tier === 'collector' ? (
        <FormSection title="Dettagli Collector">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Edizione limitata (totale)" hint="Es. 50 per tiratura /50">
              <input
                type="number"
                min={1}
                value={value.limited_edition_max ?? ''}
                onChange={(e) => set('limited_edition_max', e.target.value ? Number(e.target.value) : null)}
                className={inputClass}
                placeholder="es. 50"
              />
            </Field>

            <Field label="Numero pezzo" hint="Quale numero di tiratura è questo. Es. 12">
              <input
                type="number"
                min={1}
                value={value.limited_edition_number ?? ''}
                onChange={(e) => set('limited_edition_number', e.target.value ? Number(e.target.value) : null)}
                className={inputClass}
                placeholder="es. 12"
              />
            </Field>
          </div>

          <Field label="Firmato da">
            <input
              type="text"
              value={value.signed_by}
              onChange={(e) => set('signed_by', e.target.value)}
              className={inputClass}
              placeholder="Es. Domenico Toscano"
            />
          </Field>

          <Field label="Data firma">
            <input
              type="date"
              value={value.signed_on}
              onChange={(e) => set('signed_on', e.target.value)}
              className={inputClass}
            />
          </Field>
        </FormSection>
      ) : null}

      {/* ── Publishing ──────────────────────────────────── */}
      <FormSection title="Pubblicazione">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Status" hint="Solo 'Attivo' è visibile nello shop.">
            <select
              value={value.status}
              onChange={(e) => set('status', e.target.value as ProductStatus)}
              className={selectClass}
            >
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Sort order" hint="Ordine nel feed shop. 0 = default, valori più alti = posizione più alta.">
            <input
              type="number"
              value={value.sort_order}
              onChange={(e) => set('sort_order', Number(e.target.value))}
              className={inputClass}
            />
          </Field>
        </div>
      </FormSection>

      {/* ── Actions ──────────────────────────────────────── */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 h-11 px-6 rounded-lg bg-foreground text-background text-sm font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {saving ? 'Salvataggio…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

/* ═══════════════════════════════════════════════════════
   UI primitives
   ═══════════════════════════════════════════════════════ */

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
        {required ? <span className="text-red-500 ml-0.5">*</span> : null}
      </span>
      {children}
      {hint ? <span className="block text-xs text-muted-foreground/70 leading-snug">{hint}</span> : null}
    </label>
  );
}

const inputClass =
  'w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-muted-foreground/60 transition-colors';

const selectClass =
  'w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground outline-none focus:border-muted-foreground/60 transition-colors';
