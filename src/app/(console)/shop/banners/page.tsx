'use client';

import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/lib/toast';
import {
  getShopBanners, createShopBanner, updateShopBanner, deleteShopBanner,
  BANNER_TYPE_LABELS,
  type ShopBanner, type BannerType, type BannerAccent,
} from '@/lib/data/shop';
import { Plus, Pencil, Trash2, Eye, EyeOff, X, Upload, Loader2, ImageIcon } from 'lucide-react';

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
  type: 'drop', headline: '', subline: '', image_url: '', cta_label: 'Scopri',
  cta_href: '/shop', accent_color: 'red', priority: 0, active: false,
  starts_at: '', ends_at: '',
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
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const handleStartNew = () => setEditing({ ...EMPTY_DRAFT });
  const handleStartEdit = (b: ShopBanner) => setEditing({
    id: b.id, type: b.type, headline: b.headline, subline: b.subline ?? '',
    image_url: b.image_url ?? '', cta_label: b.cta_label ?? '', cta_href: b.cta_href ?? '',
    accent_color: (b.accent_color ?? '') as BannerAccent | '',
    priority: b.priority, active: b.active,
    starts_at: b.starts_at ?? '', ends_at: b.ends_at ?? '',
  });

  const handleSave = async () => {
    if (!editing) return;
    const payload: Partial<ShopBanner> = {
      type: editing.type, headline: editing.headline,
      subline: editing.subline || null, image_url: editing.image_url || null,
      cta_label: editing.cta_label || null, cta_href: editing.cta_href || null,
      accent_color: (editing.accent_color || null) as BannerAccent | null,
      priority: editing.priority, active: editing.active,
      starts_at: editing.starts_at || null, ends_at: editing.ends_at || null,
    };

    try {
      if (editing.id) { await updateShopBanner(editing.id, payload); showToast('success', 'Banner aggiornato'); }
      else             { await createShopBanner(payload);            showToast('success', 'Banner creato'); }
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
    <div className="vstack" style={{ gap: 'var(--s4)' }}>
      <div className="flex items-center gap-2">
        <div className="typ-caption grow">{banners.length} banner · {banners.filter(b => b.active).length} attivi</div>
        <button onClick={handleStartNew} className="btn btn-primary btn-sm">
          <Plus className="w-4 h-4" /> Nuovo banner
        </button>
      </div>

      {!loading && banners.length === 0 && (
        <div className="card card-body text-center">
          <ImageIcon className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
          <p className="typ-label">Nessun banner</p>
          <p className="typ-caption mt-1">Crea il primo banner marketing per lo shop.</p>
        </div>
      )}

      {loading && (
        <div className="vstack-tight">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card" style={{ height: 110, opacity: 0.4 }} />
          ))}
        </div>
      )}

      {!loading && banners.length > 0 && (
        <div className="vstack-tight">
          {banners.map(b => (
            <div key={b.id} className="card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div className="flex flex-col md:flex-row">
                {/* Image */}
                <div className="relative md:w-64 aspect-video shrink-0 overflow-hidden" style={{ background: 'var(--card-muted)' }}>
                  {b.image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={b.image_url} alt={b.headline} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-7 h-7" style={{ color: 'var(--text-muted)' }} />
                    </div>
                  )}
                  <span className={b.active ? 'pill pill-ok' : 'pill'} style={{ position: 'absolute', top: 8, left: 8, fontSize: 10, padding: '1px 6px' }}>
                    {b.active ? 'ATTIVO' : 'DISATTIVATO'}
                  </span>
                </div>

                {/* Info */}
                <div className="grow p-4 vstack-tight">
                  <div className="typ-micro">{BANNER_TYPE_LABELS[b.type]} · priority {b.priority}</div>
                  <div className="typ-h2">{b.headline}</div>
                  {b.subline && <div className="typ-caption truncate-2">{b.subline}</div>}
                  {b.cta_href && (
                    <div className="typ-mono typ-caption truncate" style={{ fontSize: 11 }}>
                      → {b.cta_label ?? 'CTA'}: {b.cta_href}
                    </div>
                  )}
                  {(b.starts_at || b.ends_at) && (
                    <div className="typ-caption" style={{ fontSize: 11 }}>
                      Attivo: {b.starts_at ? new Date(b.starts_at).toLocaleDateString('it-IT') : '∞'}
                      {' → '}
                      {b.ends_at ? new Date(b.ends_at).toLocaleDateString('it-IT') : '∞'}
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-[color:var(--hairline-soft)]">
                    <button onClick={() => void handleToggleActive(b)} className="btn btn-ghost btn-sm">
                      {b.active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      {b.active ? 'Disattiva' : 'Attiva'}
                    </button>
                    <button onClick={() => handleStartEdit(b)} className="btn btn-ghost btn-sm">
                      <Pencil className="w-3.5 h-3.5" /> Modifica
                    </button>
                    <button onClick={() => void handleDelete(b.id)} className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--danger)' }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && <BannerEditor draft={editing} onChange={setEditing} onSave={handleSave} onClose={() => setEditing(null)} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Banner editor (sheet)
   ═══════════════════════════════════════════════════════ */

function BannerEditor({
  draft, onChange, onSave, onClose,
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
    if (!draft.headline) { showToast('error', 'Headline obbligatorio'); return; }
    setSaving(true);
    await onSave();
    setSaving(false);
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" style={{ maxHeight: '92vh' }}>
        <div className="sheet-grip" />
        <div className="flex items-center gap-2 mb-3">
          <h2 className="typ-h1 grow">{draft.id ? 'Modifica banner' : 'Nuovo banner'}</h2>
          <button onClick={onClose} className="btn btn-quiet btn-icon btn-sm" aria-label="Chiudi">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="vstack" style={{ gap: 'var(--s4)' }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="typ-micro block mb-1.5">Tipo *</label>
              <select value={draft.type} onChange={e => set('type', e.target.value as BannerType)} className="input">
                {Object.entries(BANNER_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="typ-micro block mb-1.5">Accent color</label>
              <select value={draft.accent_color} onChange={e => set('accent_color', e.target.value as BannerAccent | '')} className="input">
                <option value="">—</option>
                <option value="red">Rosso</option>
                <option value="gold">Oro</option>
                <option value="blue">Blu</option>
              </select>
            </div>
            <div>
              <label className="typ-micro block mb-1.5">Priority</label>
              <input type="number" value={draft.priority} onChange={e => set('priority', Number(e.target.value))} className="input" />
              <div className="typ-caption mt-0.5" style={{ fontSize: 11 }}>Più alta = sopra</div>
            </div>
          </div>

          <div>
            <label className="typ-micro block mb-1.5">Headline *</label>
            <input type="text" value={draft.headline} onChange={e => set('headline', e.target.value)} placeholder="Es. LAVIKA ORIGINS" className="input" />
          </div>

          <div>
            <label className="typ-micro block mb-1.5">Subline</label>
            <input type="text" value={draft.subline} onChange={e => set('subline', e.target.value)} placeholder="Descrizione breve" className="input" />
          </div>

          <div>
            <label className="typ-micro block mb-1.5">Immagine</label>
            <div className="vstack-tight">
              {draft.image_url && (
                <div className="relative aspect-video rounded-[var(--r)] overflow-hidden" style={{ background: 'var(--card-muted)', border: '1px solid var(--hairline-soft)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={draft.image_url} alt="" className="w-full h-full object-cover" />
                  <button type="button" onClick={() => set('image_url', '')} className="absolute top-2 right-2 inline-grid place-items-center" style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,0,0,0.6)', color: '#fff' }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void handleUploadImage(f); }} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="btn btn-ghost">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? 'Caricamento…' : draft.image_url ? 'Sostituisci immagine' : 'Carica immagine'}
              </button>
              <input type="url" value={draft.image_url} onChange={e => set('image_url', e.target.value)} placeholder="oppure incolla URL diretto" className="input typ-mono" style={{ fontSize: 12 }} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="typ-micro block mb-1.5">CTA label</label>
              <input type="text" value={draft.cta_label} onChange={e => set('cta_label', e.target.value)} placeholder="Scopri" className="input" />
            </div>
            <div>
              <label className="typ-micro block mb-1.5">CTA href</label>
              <input type="text" value={draft.cta_href} onChange={e => set('cta_href', e.target.value)} placeholder="/shop/prodotto-slug" className="input typ-mono" style={{ fontSize: 12 }} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="typ-micro block mb-1.5">Attivo dal</label>
              <input type="datetime-local" value={draft.starts_at} onChange={e => set('starts_at', e.target.value)} className="input" />
              <div className="typ-caption mt-0.5" style={{ fontSize: 11 }}>Vuoto = sempre</div>
            </div>
            <div>
              <label className="typ-micro block mb-1.5">Attivo fino</label>
              <input type="datetime-local" value={draft.ends_at} onChange={e => set('ends_at', e.target.value)} className="input" />
              <div className="typ-caption mt-0.5" style={{ fontSize: 11 }}>Vuoto = sempre</div>
            </div>
          </div>

          <label className="flex items-center gap-2 typ-body cursor-pointer">
            <input type="checkbox" checked={draft.active} onChange={e => set('active', e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--accent-raw)' }} />
            Attivo (visibile sullo shop app)
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-[color:var(--hairline-soft)]">
          <button onClick={onClose} className="btn btn-ghost">Annulla</button>
          <button onClick={handleSubmit} disabled={saving} className="btn btn-primary">
            {saving ? 'Salvataggio…' : draft.id ? 'Salva' : 'Crea banner'}
          </button>
        </div>
      </div>
    </>
  );
}
