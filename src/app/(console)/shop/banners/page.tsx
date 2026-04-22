'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { SectionHeader } from '@/components/SectionHeader';
import { useToast } from '@/lib/toast';
import {
  getShopBanners,
  createShopBanner,
  updateShopBanner,
  deleteShopBanner,
  BANNER_TYPE_LABELS,
  type ShopBanner,
  type BannerType,
  type BannerAccent,
} from '@/lib/data/shop';
import { Plus, Pencil, Trash2, Eye, EyeOff, ChevronLeft, Upload, Loader2, ImageIcon } from 'lucide-react';

interface BannerDraft {
  id?: string;
  type: BannerType;
  headline: string;
  subline: string;
  image_url: string;
  cta_label: string;
  cta_href: string;
  accent_color: BannerAccent | '';
  priority: number;
  active: boolean;
  starts_at: string;
  ends_at: string;
}

const EMPTY_DRAFT: BannerDraft = {
  type: 'drop',
  headline: '',
  subline: '',
  image_url: '',
  cta_label: 'Scopri',
  cta_href: '/shop',
  accent_color: 'red',
  priority: 0,
  active: false,
  starts_at: '',
  ends_at: '',
};

export default function ShopBannersPage() {
  const [banners, setBanners] = useState<ShopBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<BannerDraft | null>(null);
  const { showToast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const data = await getShopBanners();
      setBanners(data);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore caricamento');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleStartNew = () => setEditing({ ...EMPTY_DRAFT });
  const handleStartEdit = (b: ShopBanner) => setEditing({
    id: b.id,
    type: b.type,
    headline: b.headline,
    subline: b.subline ?? '',
    image_url: b.image_url ?? '',
    cta_label: b.cta_label ?? '',
    cta_href: b.cta_href ?? '',
    accent_color: (b.accent_color ?? '') as BannerAccent | '',
    priority: b.priority,
    active: b.active,
    starts_at: b.starts_at ?? '',
    ends_at: b.ends_at ?? '',
  });

  const handleSave = async () => {
    if (!editing) return;
    const payload: Partial<ShopBanner> = {
      type: editing.type,
      headline: editing.headline,
      subline: editing.subline || null,
      image_url: editing.image_url || null,
      cta_label: editing.cta_label || null,
      cta_href: editing.cta_href || null,
      accent_color: (editing.accent_color || null) as BannerAccent | null,
      priority: editing.priority,
      active: editing.active,
      starts_at: editing.starts_at || null,
      ends_at: editing.ends_at || null,
    };

    try {
      if (editing.id) {
        await updateShopBanner(editing.id, payload);
        showToast('success', 'Banner aggiornato');
      } else {
        await createShopBanner(payload);
        showToast('success', 'Banner creato');
      }
      setEditing(null);
      await load();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore salvataggio');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Eliminare questo banner?')) return;
    try {
      await deleteShopBanner(id);
      showToast('success', 'Banner eliminato');
      await load();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore eliminazione');
    }
  };

  const handleToggleActive = async (b: ShopBanner) => {
    try {
      await updateShopBanner(b.id, { active: !b.active });
      showToast('success', `Banner ${!b.active ? 'attivato' : 'disattivato'}`);
      await load();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore aggiornamento');
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Banner Shop"
        description={`${banners.length} banner · ${banners.filter((b) => b.active).length} attivi`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/shop"
              className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border border-border bg-card hover:bg-muted text-sm font-medium text-foreground"
            >
              <ChevronLeft className="w-4 h-4" />
              Indietro
            </Link>
            <button
              type="button"
              onClick={handleStartNew}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-foreground text-background text-sm font-semibold hover:opacity-90"
            >
              <Plus className="w-4 h-4" />
              Nuovo banner
            </button>
          </div>
        }
      />

      {!loading && banners.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
          <ImageIcon className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-base font-semibold text-foreground">Nessun banner</p>
          <p className="text-sm text-muted-foreground mt-1">Crea il primo banner marketing per lo shop.</p>
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : null}

      {!loading && banners.length > 0 ? (
        <div className="space-y-3">
          {banners.map((b) => (
            <article key={b.id} className="rounded-xl border border-border bg-card overflow-hidden flex flex-col md:flex-row">
              <div className="relative md:w-64 aspect-[16/9] bg-muted/50 shrink-0">
                {b.image_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={b.image_url} alt={b.headline} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <ImageIcon className="w-8 h-8" />
                  </div>
                )}
                <span
                  className={`absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${
                    b.active ? 'bg-green-500/20 text-green-400' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {b.active ? 'ATTIVO' : 'DISATTIVATO'}
                </span>
              </div>
              <div className="flex-1 p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {BANNER_TYPE_LABELS[b.type]} · priority {b.priority}
                    </p>
                    <h3 className="mt-0.5 text-lg font-bold text-foreground leading-tight">{b.headline}</h3>
                    {b.subline ? <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{b.subline}</p> : null}
                    {b.cta_href ? (
                      <p className="mt-1 text-xs font-mono text-muted-foreground truncate">
                        → {b.cta_label ?? 'CTA'}: {b.cta_href}
                      </p>
                    ) : null}
                    {b.starts_at || b.ends_at ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Attivo: {b.starts_at ? new Date(b.starts_at).toLocaleDateString('it-IT') : '∞'}
                        {' → '}
                        {b.ends_at ? new Date(b.ends_at).toLocaleDateString('it-IT') : '∞'}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 pt-2">
                  <button
                    type="button"
                    onClick={() => void handleToggleActive(b)}
                    className="inline-flex items-center gap-1 h-8 px-3 rounded border border-border hover:bg-muted text-xs font-medium text-foreground"
                  >
                    {b.active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {b.active ? 'Disattiva' : 'Attiva'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStartEdit(b)}
                    className="inline-flex items-center gap-1 h-8 px-3 rounded border border-border hover:bg-muted text-xs font-medium text-foreground"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Modifica
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(b.id)}
                    className="inline-flex items-center justify-center h-8 w-8 rounded border border-border hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/30"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {editing ? <BannerEditor draft={editing} onChange={setEditing} onSave={handleSave} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Banner editor (modal)
   ═══════════════════════════════════════════════════════ */

function BannerEditor({
  draft,
  onChange,
  onSave,
  onClose,
}: {
  draft: BannerDraft;
  onChange: (d: BannerDraft) => void;
  onSave: () => Promise<void> | void;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof BannerDraft>(key: K, v: BannerDraft[K]) => onChange({ ...draft, [key]: v });

  const handleUploadImage = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('type', 'shop-banner');
      fd.append('bannerId', draft.id ?? `new-${Date.now()}`);
      fd.append('file', file);

      const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload fallito' }));
        throw new Error(err.error || 'Upload fallito');
      }
      const { url } = (await res.json()) as { url: string };
      set('image_url', url);
      showToast('success', 'Immagine caricata');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore upload');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!draft.headline) {
      showToast('error', 'Headline obbligatorio');
      return;
    }
    setSaving(true);
    await onSave();
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-card border border-border rounded-t-2xl md:rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">
            {draft.id ? 'Modifica banner' : 'Nuovo banner'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg border border-border hover:bg-muted text-foreground"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Tipo *">
              <select
                value={draft.type}
                onChange={(e) => set('type', e.target.value as BannerType)}
                className={selectClass}
              >
                {Object.entries(BANNER_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </Field>
            <Field label="Accent color">
              <select
                value={draft.accent_color}
                onChange={(e) => set('accent_color', e.target.value as BannerAccent | '')}
                className={selectClass}
              >
                <option value="">—</option>
                <option value="red">Rosso</option>
                <option value="gold">Oro</option>
                <option value="blue">Blu</option>
              </select>
            </Field>
            <Field label="Priority" hint="Più alta = sopra">
              <input type="number" value={draft.priority} onChange={(e) => set('priority', Number(e.target.value))} className={inputClass} />
            </Field>
          </div>

          <Field label="Headline *">
            <input
              type="text"
              value={draft.headline}
              onChange={(e) => set('headline', e.target.value)}
              placeholder="Es. LAVIKA ORIGINS"
              className={inputClass}
            />
          </Field>

          <Field label="Subline">
            <input
              type="text"
              value={draft.subline}
              onChange={(e) => set('subline', e.target.value)}
              placeholder="Descrizione breve del banner"
              className={inputClass}
            />
          </Field>

          {/* Image upload */}
          <Field label="Immagine">
            <div className="space-y-2">
              {draft.image_url ? (
                <div className="relative aspect-[16/9] rounded-lg overflow-hidden border border-border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={draft.image_url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => set('image_url', '')}
                    className="absolute top-2 right-2 inline-flex items-center justify-center h-8 w-8 rounded bg-black/60 text-white hover:bg-black/80"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : null}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUploadImage(f); }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-border hover:bg-muted text-sm font-medium text-foreground disabled:opacity-50"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? 'Caricamento…' : draft.image_url ? 'Sostituisci immagine' : 'Carica immagine'}
              </button>
              <input
                type="url"
                value={draft.image_url}
                onChange={(e) => set('image_url', e.target.value)}
                placeholder="oppure incolla URL diretto"
                className={inputClass + ' font-mono text-xs'}
              />
            </div>
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="CTA label">
              <input
                type="text"
                value={draft.cta_label}
                onChange={(e) => set('cta_label', e.target.value)}
                placeholder="Scopri"
                className={inputClass}
              />
            </Field>
            <Field label="CTA href">
              <input
                type="text"
                value={draft.cta_href}
                onChange={(e) => set('cta_href', e.target.value)}
                placeholder="/shop/prodotto-slug"
                className={inputClass + ' font-mono text-xs'}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Attivo dal" hint="Vuoto = sempre">
              <input
                type="datetime-local"
                value={draft.starts_at}
                onChange={(e) => set('starts_at', e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Attivo fino" hint="Vuoto = sempre">
              <input
                type="datetime-local"
                value={draft.ends_at}
                onChange={(e) => set('ends_at', e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => set('active', e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm font-medium text-foreground">Attivo (visibile sul shop app)</span>
          </label>
        </div>

        <div className="sticky bottom-0 bg-card border-t border-border px-5 py-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center h-10 px-4 rounded-lg border border-border hover:bg-muted text-sm font-medium text-foreground"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="inline-flex items-center h-10 px-4 rounded-lg bg-foreground text-background text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Salvataggio…' : draft.id ? 'Salva' : 'Crea banner'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-muted-foreground/70">{hint}</span> : null}
    </label>
  );
}

const inputClass = 'w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-muted-foreground/60';
const selectClass = 'w-full h-10 px-3 rounded-lg border border-border bg-background text-sm text-foreground outline-none';
