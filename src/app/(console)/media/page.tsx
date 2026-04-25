'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Upload, ImageIcon, Film, AlertTriangle, CheckCircle2, RefreshCw,
  Cloud, Database, X, Square, Layers, Search, Trash2, Users,
} from 'lucide-react';

const MEDIA_PUBLIC_BASE_URL = 'https://pub-caae50e77b854437b46967f95fd48914.r2.dev';
const PRESS_CONF_RE = /press.?conf|conferenza/i;

/* ==================================================================
   Types
   ================================================================== */

type FormatImageColumn = 'cover_vertical_url' | 'cover_horizontal_url' | 'hero_url';
type Section = 'formats' | 'episodes' | 'players' | 'archive';

interface SupaFormat {
  id: string; title: string | null;
  cover_vertical_url: string | null;
  cover_horizontal_url: string | null;
  hero_url: string | null;
}

interface SupaEpisode {
  id: string; format_id: string; video_id: string | null;
  title: string | null; thumbnail_url: string | null;
  published_at: string | null; is_active: boolean;
  min_badge: string | null; season: string | null;
}

interface UploadState { progress: number; error: string | null; done: boolean; }

interface LibraryItem { key: string; url: string; size: number; lastModified?: string; }

type PickerTarget =
  | { kind: 'format'; formatId: string; column: FormatImageColumn }
  | { kind: 'episode-single'; episodeId: string }
  | { kind: 'episode-batch' };

const FORMAT_SLOTS = [
  { key: 'cover_vertical_url'   as FormatImageColumn, label: 'Cover Verticale',   note: 'Con titolo · 2:3',  aspect: 'aspect-[2/3]',  minDim: '400×600',  uploadType: 'format-cover-vertical' },
  { key: 'cover_horizontal_url' as FormatImageColumn, label: 'Cover Orizzontale', note: 'Con titolo · 16:9', aspect: 'aspect-video',  minDim: '640×360',  uploadType: 'format-cover-horizontal' },
  { key: 'hero_url'             as FormatImageColumn, label: 'Hero',              note: 'Senza titolo · 16:9', aspect: 'aspect-video',  minDim: '640×360',  uploadType: 'format-hero' },
] as const;

/* ==================================================================
   Utilities
   ================================================================== */

async function convertToWebP(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('Canvas non disponibile')); return; }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        blob => { URL.revokeObjectURL(url); blob ? resolve(blob) : reject(new Error('Conversione WebP fallita')); },
        'image/webp', 0.88
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Impossibile caricare l'immagine")); };
    img.src = url;
  });
}

async function uploadFile(file: File, type: string, params: Record<string, string>, onProgress?: (p: number) => void): Promise<string> {
  onProgress?.(5);
  const webp = await convertToWebP(file);
  onProgress?.(40);
  const fd = new FormData();
  fd.append('type', type);
  fd.append('file', new File([webp], 'image.webp', { type: 'image/webp' }));
  Object.entries(params).forEach(([k, v]) => fd.append(k, v));
  onProgress?.(60);
  const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
  onProgress?.(90);
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `Errore upload (${res.status})`);
  }
  const { url } = await res.json() as { url: string };
  onProgress?.(100);
  return url;
}

/* ==================================================================
   ImageSlot — one of the 3 format image slots
   ================================================================== */
function ImageSlot({
  label, note, aspect, minDim, url, uploadState, onUpload, onPicker, onRemove,
}: {
  label: string; note: string; aspect: string; minDim: string;
  url: string | null; uploadState: UploadState | null;
  onUpload: (f: File) => void; onPicker: () => void; onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [imgError, setImgError] = useState(false);
  const uploading = uploadState && !uploadState.done && uploadState.progress > 0;

  useEffect(() => { setImgError(false); }, [url]);

  return (
    <div className="vstack-tight">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="typ-label truncate">{label}</p>
          <p className="typ-caption">{note} · min {minDim}px</p>
        </div>
        {url && !uploading && (
          <button onClick={onRemove} className="typ-caption" style={{ color: 'var(--danger)', textDecoration: 'underline', cursor: 'pointer' }}>
            Rimuovi
          </button>
        )}
      </div>

      <div
        className={`relative ${aspect} rounded-[var(--r)] overflow-hidden cursor-pointer transition-colors`}
        style={{
          border: dragging ? '2px solid var(--accent-raw)' : '2px dashed var(--hairline)',
          background: dragging ? 'var(--accent-soft)' : (url && !imgError ? 'var(--card)' : 'var(--card-muted)'),
        }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault(); setDragging(false);
          const f = e.dataTransfer.files[0]; if (f) onUpload(f);
        }}
        onClick={() => { if (!uploading) inputRef.current?.click(); }}
      >
        {url && !imgError && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={url} alt={label} className="absolute inset-0 w-full h-full object-cover" onError={() => setImgError(true)} />
        )}

        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 transition-opacity"
          style={{
            opacity: uploading ? 1 : (url && !imgError ? 0 : 1),
            background: uploading ? 'rgba(255,255,255,0.85)' : (url && !imgError ? 'transparent' : 'transparent'),
          }}
        >
          {uploading ? (
            <div className="w-full px-4 vstack-tight items-center">
              <div className="w-7 h-7 border-2 border-[color:var(--accent-raw)] border-t-transparent rounded-full animate-spin" />
              <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'var(--hairline-soft)' }}>
                <div style={{ height: '100%', background: 'var(--accent-raw)', width: `${uploadState!.progress}%`, transition: 'width 200ms' }} />
              </div>
              <span className="typ-caption">{uploadState!.progress}%</span>
            </div>
          ) : (
            <>
              <Upload className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
              <span className="typ-caption">{dragging ? 'Rilascia' : 'Clicca o trascina'}</span>
            </>
          )}
        </div>

        {uploadState?.done && (
          <div className="absolute top-2 right-2">
            <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--ok)' }} />
          </div>
        )}
      </div>

      {uploadState?.error && <p className="typ-caption" style={{ color: 'var(--danger)' }}>{uploadState.error}</p>}

      <div className="grid grid-cols-2 gap-1.5">
        <button disabled={!!uploading} onClick={() => inputRef.current?.click()} className="btn btn-ghost btn-sm">
          <Upload className="w-3.5 h-3.5" /> Carica
        </button>
        <button disabled={!!uploading} onClick={onPicker} className="btn btn-ghost btn-sm">
          <ImageIcon className="w-3.5 h-3.5" /> Libreria
        </button>
      </div>

      <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) { onUpload(f); e.target.value = ''; } }} />
    </div>
  );
}

/* ==================================================================
   EpisodeCard — with checkbox + thumbnail upload
   ================================================================== */
function EpisodeCard({
  episode, checked, onCheck, uploadState, onUpload, onPicker,
}: {
  episode: SupaEpisode; checked: boolean; onCheck: (v: boolean) => void;
  uploadState?: UploadState;
  onUpload: (f: File) => void; onPicker: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [imgError, setImgError] = useState(false);
  const uploading = uploadState && !uploadState.done && uploadState.progress > 0;
  const displayUrl = episode.thumbnail_url;
  const isEditorial = Boolean(displayUrl);

  useEffect(() => { setImgError(false); }, [displayUrl]);

  return (
    <div className="card" style={{ borderColor: checked ? 'var(--accent-raw)' : 'var(--hairline-soft)', boxShadow: 'none', overflow: 'hidden' }}>
      {/* Checkbox */}
      <button
        onClick={() => onCheck(!checked)}
        className="absolute z-10 inline-grid place-items-center"
        style={{
          top: 8, left: 8,
          width: 24, height: 24,
          borderRadius: 6,
          background: checked ? 'var(--accent-raw)' : 'rgba(255,255,255,0.9)',
          border: `2px solid ${checked ? 'var(--accent-raw)' : 'var(--hairline)'}`,
          position: 'absolute',
        }}
      >
        {checked && <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#fff' }} />}
      </button>

      {/* Thumbnail */}
      <div
        className="relative aspect-video cursor-pointer overflow-hidden"
        style={{ background: dragging ? 'var(--accent-soft)' : 'var(--card-muted)' }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault(); setDragging(false);
          const f = e.dataTransfer.files[0]; if (f) onUpload(f);
        }}
        onClick={() => { if (!uploading) inputRef.current?.click(); }}
      >
        {displayUrl && !imgError && !uploading && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={displayUrl} alt={episode.title ?? episode.id} className="absolute inset-0 w-full h-full object-cover" onError={() => setImgError(true)} />
        )}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 transition-opacity"
          style={{
            opacity: uploading ? 1 : (displayUrl && !imgError ? 0 : 1),
            background: uploading ? 'rgba(255,255,255,0.85)' : (displayUrl && !imgError ? 'rgba(0,0,0,0)' : 'transparent'),
          }}
        >
          {uploading ? (
            <div className="w-full px-4 vstack-tight items-center">
              <div className="w-6 h-6 border-2 border-[color:var(--accent-raw)] border-t-transparent rounded-full animate-spin" />
              <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'var(--hairline-soft)' }}>
                <div style={{ height: '100%', background: 'var(--accent-raw)', width: `${uploadState!.progress}%` }} />
              </div>
            </div>
          ) : (
            <>
              <Upload className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              <span className="typ-caption">Carica thumbnail</span>
            </>
          )}
        </div>
        {uploadState?.done && (
          <div className="absolute top-1.5 right-1.5">
            <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--ok)' }} />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="card-body">
        <p className="typ-label truncate-2">{episode.title ?? episode.id}</p>
        <div className="flex items-center justify-between mt-2">
          <span className={isEditorial ? 'pill pill-ok' : 'pill'}>
            <span className={isEditorial ? 'dot dot-ok' : 'dot'} />
            {isEditorial ? 'Editoriale' : 'Nessuna'}
          </span>
          <button onClick={e => { e.stopPropagation(); onPicker(); }} className="btn btn-quiet btn-icon btn-sm" aria-label="Libreria">
            <ImageIcon className="w-3.5 h-3.5" />
          </button>
        </div>
        {uploadState?.error && <p className="typ-caption mt-1 truncate-2" style={{ color: 'var(--danger)' }}>{uploadState.error}</p>}
      </div>

      <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) { onUpload(f); e.target.value = ''; } }} />
    </div>
  );
}

/* ==================================================================
   MediaPicker — R2 library modal (becomes sheet on mobile)
   ================================================================== */
function MediaPicker({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (url: string) => void }) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'formats' | 'episodes'>('all');
  const [search, setSearch] = useState('');
  const [pickerUpload, setPickerUpload] = useState<UploadState | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/media/library');
      const data = await res.json() as { items: LibraryItem[] };
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) { loadItems(); setSearch(''); setFilter('all'); setPickerUpload(null); } }, [open, loadItems]);

  const filtered = items.filter(item => {
    if (filter === 'formats' && !item.key.startsWith('formats/')) return false;
    if (filter === 'episodes' && !item.key.startsWith('episodes/')) return false;
    if (search && !item.key.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleDelete = async (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deletingKey) return;
    setDeletingKey(key);
    try {
      const res = await fetch('/api/media/library', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
      if (!res.ok) throw new Error('Errore');
      setItems(prev => prev.filter(i => i.key !== key));
    } catch { /* ignore */ }
    setDeletingKey(null);
  };

  const handleUpload = async (file: File) => {
    setPickerUpload({ progress: 10, error: null, done: false });
    try {
      const webp = await convertToWebP(file);
      setPickerUpload({ progress: 40, error: null, done: false });
      const fd = new FormData();
      fd.append('type', 'library-upload');
      fd.append('formatId', '_');
      fd.append('file', new File([webp], 'image.webp', { type: 'image/webp' }));
      setPickerUpload({ progress: 70, error: null, done: false });
      const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Upload fallito');
      const { url } = await res.json() as { url: string };
      setPickerUpload({ progress: 100, error: null, done: true });
      const key = url.replace(MEDIA_PUBLIC_BASE_URL + '/', '');
      setItems(prev => [{ key, url, size: webp.size }, ...prev]);
      onSelect(url);
      onClose();
    } catch (err) {
      setPickerUpload({ progress: 0, error: err instanceof Error ? err.message : 'Errore', done: false });
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" style={{ maxHeight: '92vh' }}>
        <div className="sheet-grip" />
        <div className="flex items-center gap-2 mb-3">
          <ImageIcon className="w-5 h-5 text-[color:var(--accent-raw)]" />
          <h2 className="typ-h1 grow">Libreria Media</h2>
          <button onClick={onClose} className="btn btn-quiet btn-icon btn-sm" aria-label="Chiudi"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {(['all', 'formats', 'episodes'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={filter === f ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}>
              {f === 'all' ? 'Tutto' : f === 'formats' ? 'Format' : 'Episodi'}
            </button>
          ))}
          <div className="grow" />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
            <input type="text" placeholder="Cerca..." value={search} onChange={e => setSearch(e.target.value)} className="input pl-10" style={{ width: 180 }} />
          </div>
          <button onClick={() => fileRef.current?.click()} className="btn btn-primary btn-sm">
            <Upload className="w-4 h-4" /> Carica
          </button>
        </div>

        {pickerUpload && !pickerUpload.done && (
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-4 border-2 border-[color:var(--accent-raw)] border-t-transparent rounded-full animate-spin shrink-0" />
            <div className="grow h-1 rounded-full overflow-hidden" style={{ background: 'var(--hairline-soft)' }}>
              <div style={{ height: '100%', background: 'var(--accent-raw)', width: `${pickerUpload.progress}%` }} />
            </div>
            <span className="typ-caption shrink-0">{pickerUpload.progress}%</span>
          </div>
        )}
        {pickerUpload?.error && <p className="typ-caption mb-2" style={{ color: 'var(--danger)' }}>{pickerUpload.error}</p>}

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-7 h-7 border-2 border-[color:var(--accent-raw)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48">
            <ImageIcon className="w-10 h-10 mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
            <p className="typ-caption">{items.length === 0 ? 'La libreria è vuota.' : 'Nessun risultato.'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {filtered.map(item => (
              <div key={item.key} title={item.key}
                onClick={() => { onSelect(item.url); onClose(); }}
                className={`group relative aspect-square rounded-[var(--r-sm)] overflow-hidden cursor-pointer transition-all ${deletingKey === item.key ? 'opacity-40 pointer-events-none' : ''}`}
                style={{ background: 'var(--card-muted)', border: '2px solid transparent' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent-raw)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = 'transparent'}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt={item.key} className="w-full h-full object-cover" loading="lazy" onError={e => (e.target as HTMLImageElement).style.display = 'none'} />
                <button
                  onClick={e => handleDelete(item.key, e)}
                  className="absolute top-1 right-1 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-all z-10"
                  style={{ background: 'rgba(192,57,43,0.92)', color: '#fff' }}
                  title="Elimina"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { handleUpload(f); e.target.value = ''; } }} />
      </div>
    </>
  );
}

/* ==================================================================
   Players Cutouts Section
   ================================================================== */

interface PlayerCutoutRow {
  id: string; slug: string | null; full_name: string;
  position: string | null; shirt_number: string | null;
  photo_url: string | null; cutout_url: string | null;
  cutout_updated_at: string | null; team_id: string | null;
  hasCustomCutout: boolean; cutoutBucketKey: string | null;
}

function PlayersCutoutsSection() {
  const [players, setPlayers] = useState<PlayerCutoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [uploadState, setUploadState] = useState<Record<string, { progress: number; error: string | null; done: boolean }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/media/players', { cache: 'no-store' });
      const data = await r.json() as { players?: PlayerCutoutRow[] };
      setPlayers(data.players ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (player: PlayerCutoutRow, file: File) => {
    if (!player.slug) return;
    const key = player.id;
    setUploadState(prev => ({ ...prev, [key]: { progress: 0, error: null, done: false } }));
    try {
      const fd = new FormData();
      fd.append('type', 'player-cutout');
      fd.append('playerSlug', player.slug);
      fd.append('file', file);
      const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.url) throw new Error(payload.error || `HTTP ${res.status}`);
      const patch = await fetch('/api/media/players', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: player.id, cutout_url: payload.url }) });
      if (!patch.ok) throw new Error('Salvataggio DB fallito');
      setUploadState(prev => ({ ...prev, [key]: { progress: 100, error: null, done: true } }));
      setPlayers(prev => prev.map(p => p.id === player.id ? { ...p, cutout_url: payload.url as string, cutout_updated_at: new Date().toISOString(), hasCustomCutout: true } : p));
    } catch (err) {
      setUploadState(prev => ({ ...prev, [key]: { progress: 0, error: err instanceof Error ? err.message : 'Errore', done: false } }));
    }
  };

  const handleRemove = async (player: PlayerCutoutRow) => {
    if (!window.confirm(`Rimuovere cutout di ${player.full_name}? Il file WebP resta su R2 ma non sarà più linkato.`)) return;
    const res = await fetch('/api/media/players', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: player.id, cutout_url: null }) });
    if (!res.ok) return;
    setPlayers(prev => prev.map(p => p.id === player.id ? { ...p, cutout_url: null, cutout_updated_at: null, hasCustomCutout: false } : p));
  };

  const filtered = players.filter(p => {
    if (onlyMissing && p.hasCustomCutout) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.full_name.toLowerCase().includes(q) && !(p.slug || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const missing = players.filter(p => !p.hasCustomCutout).length;

  return (
    <div className="vstack" style={{ gap: 'var(--s4)' }}>
      <div className="card card-body">
        <p className="typ-caption">
          Cutout (mezzo busto, sfondo trasparente) per ogni giocatore/staff. Conversione auto in WebP (2560px max, alpha preservato),
          salvato in <code style={{ background: 'var(--card-muted)', padding: '1px 6px', borderRadius: 4 }}>lavika-media/players/{'{'}slug{'}'}/cutout.webp</code>.
          L&apos;app lo usa come hero della pagina giocatore e nelle card.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 flex-wrap">
        <div className="typ-caption">
          <strong className="typ-label">{players.length}</strong> giocatori ·{' '}
          <span style={{ color: missing > 0 ? 'var(--warn)' : 'var(--ok)' }}>{missing} senza cutout</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 typ-caption cursor-pointer select-none">
            <input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} style={{ accentColor: 'var(--accent-raw)' }} />
            Solo mancanti
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca giocatore..." className="input pl-10" style={{ width: 220 }} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-7 h-7 border-2 border-[color:var(--accent-raw)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map(player => {
            const state = uploadState[player.id];
            return (
              <div key={player.id} className="card card-body vstack-tight">
                <div className="relative aspect-[3/4] rounded-[var(--r)] overflow-hidden" style={{ background: 'var(--card-muted)', border: '1px solid var(--hairline-soft)' }}>
                  {player.cutout_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={player.cutout_url} alt={player.full_name} className="w-full h-full object-contain" />
                  ) : player.photo_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={player.photo_url} alt={player.full_name} className="w-full h-full object-cover" style={{ opacity: 0.3 }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Users className="w-8 h-8" style={{ color: 'var(--text-muted)' }} />
                    </div>
                  )}
                  <span
                    className={player.hasCustomCutout ? 'pill pill-ok' : 'pill pill-warn'}
                    style={{ position: 'absolute', top: 8, right: 8 }}
                  >
                    {player.hasCustomCutout ? <><CheckCircle2 className="w-3 h-3" />OK</> : <><AlertTriangle className="w-3 h-3" />manca</>}
                  </span>
                </div>
                <div>
                  <div className="typ-label truncate">{player.full_name}</div>
                  <div className="typ-micro truncate">{player.position || '—'}{player.shirt_number ? ` · #${player.shirt_number}` : ''}</div>
                </div>
                <label className={`btn btn-ghost btn-sm ${state && !state.error && !state.done ? 'opacity-60 pointer-events-none' : ''}`}>
                  <Upload className="w-3.5 h-3.5" />
                  {state && !state.error && !state.done ? 'Upload…' : player.hasCustomCutout ? 'Sostituisci' : 'Carica cutout'}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/heic" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) { handleUpload(player, f); e.target.value = ''; } }} />
                </label>
                {player.hasCustomCutout && (
                  <button onClick={() => handleRemove(player)} className="typ-caption inline-flex items-center justify-center gap-1" style={{ color: 'var(--danger)', textDecoration: 'underline', cursor: 'pointer' }}>
                    <Trash2 className="w-3 h-3" /> Rimuovi link
                  </button>
                )}
                {state?.error && <div className="typ-caption truncate-2" style={{ color: 'var(--danger)' }}>{state.error}</div>}
                {state?.done  && <div className="typ-caption" style={{ color: 'var(--ok)' }}>Caricato ✓</div>}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full card card-body text-center">
              <div className="typ-caption">Nessun giocatore.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ==================================================================
   MAIN PAGE
   ================================================================== */

/* Wide layout threshold: >=1024 shows all 3 slots inline; below shows compact cards + sheet editor */
function useIsWide() {
  const [w, setW] = useState<boolean>(typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  useEffect(() => {
    const onR = () => setW(window.innerWidth >= 1024);
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);
  return w;
}

/* ==================================================================
   FormatCompactCard — mobile/iPad portrait preview (name + cover + dots)
   ================================================================== */
function FormatCompactCard({ fmt, onOpen }: { fmt: SupaFormat; onOpen: () => void }) {
  const cover = fmt.cover_vertical_url || fmt.cover_horizontal_url || fmt.hero_url;
  const slots = [
    { key: 'cover_vertical_url'   as const, label: 'Verticale',  filled: !!fmt.cover_vertical_url },
    { key: 'cover_horizontal_url' as const, label: 'Orizzontale',filled: !!fmt.cover_horizontal_url },
    { key: 'hero_url'             as const, label: 'Hero',       filled: !!fmt.hero_url },
  ];
  const missing = slots.filter(s => !s.filled).length;

  return (
    <div onClick={onOpen} className="card card-hover" style={{ cursor: 'pointer', padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
      {/* Cover preview (2:3 aspect) */}
      <div className="shrink-0 rounded-[var(--r-sm)] overflow-hidden" style={{ width: 56, height: 84, background: 'var(--card-muted)' }}>
        {cover ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={cover} alt={fmt.title ?? fmt.id} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
          </div>
        )}
      </div>

      <div className="grow min-w-0">
        <div className="typ-label truncate">{fmt.title ?? fmt.id}</div>
        <div className="typ-micro typ-mono truncate mt-0.5">{fmt.id}</div>
        <div className="flex items-center gap-1.5 mt-2">
          {slots.map(s => (
            <span
              key={s.key}
              title={`${s.label} ${s.filled ? 'presente' : 'mancante'}`}
              className="inline-flex items-center gap-1 typ-caption"
              style={{ fontSize: 11 }}
            >
              <span className={s.filled ? 'dot dot-ok' : 'dot dot-warn'} />
              {s.label[0]}
            </span>
          ))}
          {missing > 0 && (
            <span className="pill pill-warn ml-auto" style={{ fontSize: 10, padding: '1px 6px' }}>
              {missing} mancant{missing === 1 ? 'e' : 'i'}
            </span>
          )}
          {missing === 0 && (
            <span className="pill pill-ok ml-auto" style={{ fontSize: 10, padding: '1px 6px' }}>
              <CheckCircle2 className="w-3 h-3" /> completo
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ==================================================================
   FormatEditor — renders the 3 slots for a format (used in sheet/panel)
   ================================================================== */
function FormatEditor({
  fmt, formatUploadStates, onUpload, onPicker, onRemove,
}: {
  fmt: SupaFormat;
  formatUploadStates: Record<string, UploadState>;
  onUpload: (formatId: string, column: FormatImageColumn, uploadType: string, file: File) => void;
  onPicker: (formatId: string, column: FormatImageColumn) => void;
  onRemove: (formatId: string, column: FormatImageColumn) => void;
}) {
  return (
    <div className="vstack" style={{ gap: 'var(--s5)' }}>
      <div>
        <h3 className="typ-h1">{fmt.title ?? fmt.id}</h3>
        <p className="typ-micro typ-mono mt-1">{fmt.id}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {FORMAT_SLOTS.map(slot => {
          const stateKey = `${fmt.id}-${slot.key}`;
          return (
            <ImageSlot
              key={slot.key}
              label={slot.label} note={slot.note} aspect={slot.aspect} minDim={slot.minDim}
              url={fmt[slot.key]} uploadState={formatUploadStates[stateKey] ?? null}
              onUpload={f => onUpload(fmt.id, slot.key, slot.uploadType, f)}
              onPicker={() => onPicker(fmt.id, slot.key)}
              onRemove={() => onRemove(fmt.id, slot.key)}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function MediaPage() {
  const isWide = useIsWide();
  const [activeSection, setActiveSection] = useState<Section>('formats');

  // Formats
  const [supaFormats, setSupaFormats] = useState<SupaFormat[]>([]);
  const [formatsLoading, setFormatsLoading] = useState(true);
  const [formatsError, setFormatsError] = useState<string | null>(null);
  const [formatUploadStates, setFormatUploadStates] = useState<Record<string, UploadState>>({});
  const [editingFormatId, setEditingFormatId] = useState<string | null>(null);

  // Episodes
  const [supaEpisodes, setSupaEpisodes] = useState<SupaEpisode[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [selectedFormatId, setSelectedFormatId] = useState('');
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [selectedEpIds, setSelectedEpIds] = useState<Set<string>>(new Set());
  const [epUploadStates, setEpUploadStates] = useState<Record<string, UploadState>>({});
  const [bulkUploading, setBulkUploading] = useState(false);
  const batchFileRef = useRef<HTMLInputElement>(null);

  // Picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);

  // Archive
  const [archiveItems, setArchiveItems] = useState<LibraryItem[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveFilter, setArchiveFilter] = useState<'all' | 'formats' | 'episodes' | 'library'>('all');
  const [archiveSearch, setArchiveSearch] = useState('');
  const [archiveSelected, setArchiveSelected] = useState<Set<string>>(new Set());
  const [archiveDeleting, setArchiveDeleting] = useState(false);

  // Loaders
  const loadFormats = useCallback(async () => {
    setFormatsLoading(true); setFormatsError(null);
    try {
      const res = await fetch('/api/media/formats');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as SupaFormat[];
      const formats = Array.isArray(data) ? data : [];
      setSupaFormats(formats);
      if (formats.length > 0 && !selectedFormatId) setSelectedFormatId(formats[0].id);
    } catch (err) { setFormatsError(err instanceof Error ? err.message : 'Errore'); }
    finally { setFormatsLoading(false); }
  }, [selectedFormatId]);

  const loadEpisodesForFormat = useCallback(async (formatId: string) => {
    if (!formatId) return;
    setEpisodesLoading(true); setSupaEpisodes([]); setSelectedEpIds(new Set());
    try {
      const res = await fetch(`/api/media/formats/${encodeURIComponent(formatId)}/episodes`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as SupaEpisode[];
      const episodes = Array.isArray(data) ? data : [];
      setSupaEpisodes(episodes);
      const seasons = [...new Set(episodes.map(ep => ep.season).filter(Boolean))] as string[];
      seasons.sort((a, b) => b.localeCompare(a));
      setSelectedSeasonId(seasons[0] ?? '');
    } catch { /* ignore */ } finally { setEpisodesLoading(false); }
  }, []);

  const loadArchive = useCallback(async () => {
    setArchiveLoading(true);
    try {
      const res = await fetch('/api/media/library');
      const data = await res.json() as { items: LibraryItem[] };
      setArchiveItems(Array.isArray(data.items) ? data.items : []);
    } catch { /* ignore */ } finally { setArchiveLoading(false); }
  }, []);

  const handleArchiveDeleteSelected = async () => {
    if (archiveSelected.size === 0 || archiveDeleting) return;
    setArchiveDeleting(true);
    for (const key of [...archiveSelected]) {
      try {
        await fetch('/api/media/library', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
        setArchiveItems(prev => prev.filter(i => i.key !== key));
        setArchiveSelected(prev => { const n = new Set(prev); n.delete(key); return n; });
      } catch { /* ignore */ }
    }
    setArchiveDeleting(false);
  };

  useEffect(() => { loadFormats(); }, [loadFormats]);
  useEffect(() => { if (selectedFormatId) loadEpisodesForFormat(selectedFormatId); }, [selectedFormatId, loadEpisodesForFormat]);
  useEffect(() => { if (activeSection === 'archive' && archiveItems.length === 0) loadArchive(); }, [activeSection, archiveItems.length, loadArchive]);

  // Derived
  const availableSeasons = [...new Set(supaEpisodes.map(ep => ep.season).filter(Boolean))] as string[];
  availableSeasons.sort((a, b) => b.localeCompare(a));
  const episodesForSeason = supaEpisodes.filter(ep => selectedSeasonId ? ep.season === selectedSeasonId : !ep.season);
  const episodesWithoutEditorial = episodesForSeason.filter(ep => !ep.thumbnail_url);
  const allSelected = episodesForSeason.length > 0 && episodesForSeason.every(ep => selectedEpIds.has(ep.id));
  const isPressConf = PRESS_CONF_RE.test(selectedFormatId);

  // Format upload
  const handleFormatUpload = async (formatId: string, column: FormatImageColumn, uploadType: string, file: File) => {
    const k = `${formatId}-${column}`;
    setFormatUploadStates(p => ({ ...p, [k]: { progress: 0, error: null, done: false } }));
    try {
      const url = await uploadFile(file, uploadType, { formatId }, pr => setFormatUploadStates(p => ({ ...p, [k]: { progress: pr, error: null, done: false } })));
      const res = await fetch('/api/media/formats', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: formatId, column, value: url }) });
      if (!res.ok) throw new Error('DB error');
      setFormatUploadStates(p => ({ ...p, [k]: { progress: 100, error: null, done: true } }));
      setSupaFormats(p => p.map(f => f.id === formatId ? { ...f, [column]: url } : f));
    } catch (err) {
      setFormatUploadStates(p => ({ ...p, [k]: { progress: 0, error: err instanceof Error ? err.message : 'Errore', done: false } }));
    }
  };

  const handleFormatRemove = async (formatId: string, column: FormatImageColumn) => {
    await fetch('/api/media/formats', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: formatId, column, value: null }) });
    setSupaFormats(p => p.map(f => f.id === formatId ? { ...f, [column]: null } : f));
  };

  // Episode upload
  const handleEpUpload = async (ep: SupaEpisode, file: File) => {
    const k = `ep-${ep.id}`;
    setEpUploadStates(p => ({ ...p, [k]: { progress: 0, error: null, done: false } }));
    try {
      const season = ep.season?.replace(/\//g, '-') ?? '';
      const url = await uploadFile(file, 'episode-thumbnail', { formatId: ep.format_id, season, episodeId: ep.id },
        pr => setEpUploadStates(p => ({ ...p, [k]: { progress: pr, error: null, done: false } })));
      await fetch('/api/media/episodes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [ep.id], thumbnail_url: url }) });
      setEpUploadStates(p => ({ ...p, [k]: { progress: 100, error: null, done: true } }));
      setSupaEpisodes(p => p.map(e => e.id === ep.id ? { ...e, thumbnail_url: url } : e));
    } catch (err) {
      setEpUploadStates(p => ({ ...p, [k]: { progress: 0, error: err instanceof Error ? err.message : 'Errore', done: false } }));
    }
  };

  const applyBatchUrl = async (url: string) => {
    const ids = [...selectedEpIds];
    await fetch('/api/media/episodes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, thumbnail_url: url }) });
    setSupaEpisodes(p => p.map(e => ids.includes(e.id) ? { ...e, thumbnail_url: url } : e));
    setSelectedEpIds(new Set());
  };

  const handleBatchUpload = async (file: File) => {
    setBulkUploading(true);
    try {
      const url = await uploadFile(file, 'batch-thumbnail', { formatId: selectedFormatId });
      await applyBatchUrl(url);
    } catch (err) { console.error('Batch upload error:', err); }
    finally { setBulkUploading(false); }
  };

  const openPicker = (target: PickerTarget) => { setPickerTarget(target); setPickerOpen(true); };

  const handlePickerSelect = async (url: string) => {
    setPickerOpen(false);
    if (!pickerTarget) return;
    if (pickerTarget.kind === 'format') {
      await fetch('/api/media/formats', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pickerTarget.formatId, column: pickerTarget.column, value: url }) });
      setSupaFormats(p => p.map(f => f.id === pickerTarget.formatId ? { ...f, [pickerTarget.column]: url } : f));
    } else if (pickerTarget.kind === 'episode-single') {
      await fetch('/api/media/episodes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [pickerTarget.episodeId], thumbnail_url: url }) });
      setSupaEpisodes(p => p.map(e => e.id === pickerTarget.episodeId ? { ...e, thumbnail_url: url } : e));
    } else if (pickerTarget.kind === 'episode-batch') {
      await applyBatchUrl(url);
    }
  };

  const archiveFiltered = archiveItems.filter(item => {
    if (archiveFilter === 'formats' && !item.key.startsWith('formats/')) return false;
    if (archiveFilter === 'episodes' && !item.key.startsWith('episodes/')) return false;
    if (archiveFilter === 'library' && !item.key.startsWith('library/')) return false;
    if (archiveSearch && !item.key.toLowerCase().includes(archiveSearch.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="vstack" style={{ gap: 'var(--s5)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => { loadFormats(); if (selectedFormatId) loadEpisodesForFormat(selectedFormatId); }} className="btn btn-ghost btn-sm">
          <RefreshCw className="w-4 h-4" /> <span className="hidden md:inline">Ricarica</span>
        </button>
        <div className="grow" />
        <div className="flex items-center gap-1.5 pill" style={{ padding: '4px 10px' }}>
          <Cloud className="w-3.5 h-3.5" style={{ color: 'var(--accent-raw)' }} />
          <span className="typ-caption">lavika-media</span>
        </div>
        <div className="flex items-center gap-1.5 pill" style={{ padding: '4px 10px' }}>
          <Database className="w-3.5 h-3.5" style={{ color: 'var(--info)' }} />
          <span className="typ-caption">Supabase</span>
        </div>
      </div>

      {/* Section tabs — segmented control (2x2 mobile, 4-col tablet+) */}
      <div className="p-1 rounded-[var(--r)]" style={{ background: 'var(--card-muted)', border: '1px solid var(--hairline-soft)' }}>
        <nav className="grid grid-cols-2 sm:grid-cols-4 gap-1">
          {[
            { id: 'formats'  as const, label: 'Format',       icon: ImageIcon, count: supaFormats.length },
            { id: 'episodes' as const, label: 'Episodi',      icon: Film,      count: episodesForSeason.length },
            { id: 'players'  as const, label: 'Giocatori',    icon: Users,     count: null },
            { id: 'archive'  as const, label: 'Archivio R2',  icon: Cloud,     count: archiveItems.length || null },
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSection(tab.id)}
                className="inline-flex items-center justify-center gap-1.5 h-10 px-2 rounded-[calc(var(--r)-2px)] typ-label transition-colors"
                style={{
                  background: active ? 'var(--card)' : 'transparent',
                  color: active ? 'var(--text-hi)' : 'var(--text-muted)',
                  boxShadow: active ? 'var(--shadow-card)' : 'none',
                  fontWeight: active ? 600 : 500,
                }}
              >
                <Icon className="w-4 h-4" strokeWidth={1.75} />
                <span className="truncate">{tab.label}</span>
                {tab.count !== null && tab.count > 0 && <span className="typ-caption">({tab.count})</span>}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Formats ── */}
      {activeSection === 'formats' && (() => {
        const selectedFmt = editingFormatId ? supaFormats.find(f => f.id === editingFormatId) ?? null : null;

        if (formatsLoading) {
          return (
            <div className="flex items-center justify-center h-32">
              <div className="w-7 h-7 border-2 border-[color:var(--accent-raw)] border-t-transparent rounded-full animate-spin" />
            </div>
          );
        }
        if (formatsError) {
          return (
            <div className="card card-body flex items-start gap-3" style={{ borderColor: 'color-mix(in oklab, var(--danger) 30%, transparent)', background: 'color-mix(in oklab, var(--danger) 8%, var(--card))' }}>
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
              <div>
                <p className="typ-label" style={{ color: 'var(--danger)' }}>Errore caricamento format</p>
                <p className="typ-caption mt-1">{formatsError}</p>
                <button onClick={loadFormats} className="btn btn-ghost btn-sm mt-2">Riprova</button>
              </div>
            </div>
          );
        }
        if (supaFormats.length === 0) {
          return (
            <div className="card card-body text-center">
              <ImageIcon className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
              <p className="typ-caption">Nessun format in <code>content_formats</code>.</p>
            </div>
          );
        }

        /* Master-detail on wide, stacked list on narrow */
        return (
          <div className="grid gap-4" style={{ gridTemplateColumns: isWide && selectedFmt ? 'minmax(320px, 420px) 1fr' : '1fr' }}>
            {/* Master: list of compact cards */}
            <div className="vstack-tight">
              {supaFormats.map(fmt => {
                const selected = selectedFmt?.id === fmt.id;
                return (
                  <div
                    key={fmt.id}
                    onClick={() => setEditingFormatId(fmt.id)}
                    className="card card-hover"
                    style={{
                      cursor: 'pointer',
                      padding: 12,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      borderColor: selected ? 'var(--accent-raw)' : 'var(--hairline-soft)',
                      boxShadow: selected ? 'none' : 'var(--shadow-card)',
                    }}
                  >
                    {/* Cover preview */}
                    <div className="shrink-0 rounded-[var(--r-sm)] overflow-hidden" style={{ width: 56, height: 84, background: 'var(--card-muted)' }}>
                      {(fmt.cover_vertical_url || fmt.cover_horizontal_url || fmt.hero_url) ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={fmt.cover_vertical_url || fmt.cover_horizontal_url || fmt.hero_url || ''} alt={fmt.title ?? fmt.id} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
                        </div>
                      )}
                    </div>
                    <div className="grow min-w-0">
                      <div className="typ-label truncate">{fmt.title ?? fmt.id}</div>
                      <div className="typ-micro typ-mono truncate mt-0.5">{fmt.id}</div>
                      <div className="flex items-center gap-1.5 mt-2">
                        {[
                          { k: 'cover_vertical_url'   as const, l: 'V', filled: !!fmt.cover_vertical_url },
                          { k: 'cover_horizontal_url' as const, l: 'O', filled: !!fmt.cover_horizontal_url },
                          { k: 'hero_url'             as const, l: 'H', filled: !!fmt.hero_url },
                        ].map(s => (
                          <span key={s.k} className="inline-flex items-center gap-1" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            <span className={s.filled ? 'dot dot-ok' : 'dot dot-warn'} />
                            {s.l}
                          </span>
                        ))}
                        {(() => {
                          const missing = [fmt.cover_vertical_url, fmt.cover_horizontal_url, fmt.hero_url].filter(v => !v).length;
                          return missing > 0
                            ? <span className="pill pill-warn ml-auto" style={{ fontSize: 10, padding: '1px 6px' }}>{missing} mancant{missing === 1 ? 'e' : 'i'}</span>
                            : <span className="pill pill-ok ml-auto" style={{ fontSize: 10, padding: '1px 6px' }}><CheckCircle2 className="w-3 h-3" /> completo</span>;
                        })()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Detail panel (wide only, when selected) */}
            {isWide && selectedFmt && (
              <div className="card card-body" style={{ position: 'sticky', top: 80, alignSelf: 'start', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
                <div className="flex items-center gap-2 mb-4">
                  <ImageIcon className="w-5 h-5 text-[color:var(--accent-raw)]" />
                  <div className="grow min-w-0">
                    <h2 className="typ-h1 truncate">{selectedFmt.title ?? selectedFmt.id}</h2>
                    <p className="typ-micro typ-mono truncate">{selectedFmt.id}</p>
                  </div>
                  <button className="btn btn-quiet btn-icon btn-sm" onClick={() => setEditingFormatId(null)} aria-label="Chiudi"><X className="w-4 h-4" /></button>
                </div>
                <div className="flex flex-wrap gap-4">
                  {FORMAT_SLOTS.map(slot => {
                    const stateKey = `${selectedFmt.id}-${slot.key}`;
                    return (
                      <div key={slot.key} style={{ width: 220, maxWidth: '100%' }}>
                        <ImageSlot
                          label={slot.label} note={slot.note} aspect={slot.aspect} minDim={slot.minDim}
                          url={selectedFmt[slot.key]} uploadState={formatUploadStates[stateKey] ?? null}
                          onUpload={f => handleFormatUpload(selectedFmt.id, slot.key, slot.uploadType, f)}
                          onPicker={() => openPicker({ kind: 'format', formatId: selectedFmt.id, column: slot.key })}
                          onRemove={() => handleFormatRemove(selectedFmt.id, slot.key)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Format editor sheet (mobile/iPad portrait) */}
      {!isWide && editingFormatId && (() => {
        const fmt = supaFormats.find(f => f.id === editingFormatId);
        if (!fmt) return null;
        return (
          <>
            <div className="sheet-backdrop" onClick={() => setEditingFormatId(null)} />
            <div className="sheet" style={{ maxHeight: '92vh' }}>
              <div className="sheet-grip" />
              <div className="flex items-center gap-2 mb-4">
                <ImageIcon className="w-5 h-5 text-[color:var(--accent-raw)]" />
                <div className="grow min-w-0">
                  <h2 className="typ-h1 truncate">{fmt.title ?? fmt.id}</h2>
                  <p className="typ-micro typ-mono truncate">{fmt.id}</p>
                </div>
                <button className="btn btn-quiet btn-icon btn-sm" onClick={() => setEditingFormatId(null)} aria-label="Chiudi"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex flex-wrap gap-4 justify-center sm:justify-start">
                {FORMAT_SLOTS.map(slot => {
                  const stateKey = `${fmt.id}-${slot.key}`;
                  return (
                    <div key={slot.key} style={{ width: 200, maxWidth: '100%' }}>
                      <ImageSlot
                        label={slot.label} note={slot.note} aspect={slot.aspect} minDim={slot.minDim}
                        url={fmt[slot.key]} uploadState={formatUploadStates[stateKey] ?? null}
                        onUpload={f => handleFormatUpload(fmt.id, slot.key, slot.uploadType, f)}
                        onPicker={() => openPicker({ kind: 'format', formatId: fmt.id, column: slot.key })}
                        onRemove={() => handleFormatRemove(fmt.id, slot.key)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        );
      })()}

      {/* ── Episodes ── */}
      {activeSection === 'episodes' && (
        <div className="vstack" style={{ gap: 'var(--s4)' }}>
          {/* Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="typ-micro block mb-1.5">Format</label>
              <select value={selectedFormatId} onChange={e => setSelectedFormatId(e.target.value)} className="input">
                {formatsLoading && <option value="">Carico…</option>}
                {!formatsLoading && supaFormats.length === 0 && <option value="">Nessun format</option>}
                {supaFormats.map(f => <option key={f.id} value={f.id}>{f.title ?? f.id}</option>)}
              </select>
            </div>
            <div>
              <label className="typ-micro block mb-1.5">Stagione</label>
              <select value={selectedSeasonId} onChange={e => { setSelectedSeasonId(e.target.value); setSelectedEpIds(new Set()); }} disabled={availableSeasons.length === 0} className="input">
                {availableSeasons.length === 0 && <option value="">Nessuna</option>}
                {availableSeasons.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {isPressConf && (
            <div className="card card-body flex items-start gap-3" style={{ borderColor: 'color-mix(in oklab, var(--warn) 28%, transparent)', background: 'color-mix(in oklab, var(--warn) 8%, var(--card))' }}>
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--warn)' }} />
              <p className="typ-caption" style={{ color: 'var(--warn)' }}>
                Le thumbnail di questo format devono riflettere il soggetto reale dell&apos;episodio. Evita di assegnare la stessa immagine a soggetti diversi.
              </p>
            </div>
          )}

          {episodesForSeason.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setSelectedEpIds(allSelected ? new Set() : new Set(episodesForSeason.map(ep => ep.id)))} className="btn btn-ghost btn-sm">
                <Square className="w-3.5 h-3.5" /> {allSelected ? 'Deseleziona tutti' : 'Seleziona tutti'}
              </button>
              {episodesWithoutEditorial.length > 0 && (
                <button onClick={() => setSelectedEpIds(new Set(episodesWithoutEditorial.map(ep => ep.id)))} className="btn btn-ghost btn-sm">
                  <Layers className="w-3.5 h-3.5" /> Senza thumbnail ({episodesWithoutEditorial.length})
                </button>
              )}
              {selectedEpIds.size > 0 && (
                <span className="typ-caption ml-auto">{selectedEpIds.size} selezionat{selectedEpIds.size === 1 ? 'o' : 'i'}</span>
              )}
            </div>
          )}

          {episodesLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-7 h-7 border-2 border-[color:var(--accent-raw)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : episodesForSeason.length === 0 ? (
            <div className="card card-body text-center">
              <Film className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
              <p className="typ-caption">{!selectedFormatId ? 'Seleziona un format.' : 'Nessun episodio in questa stagione.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {episodesForSeason.map(ep => (
                <EpisodeCard
                  key={ep.id} episode={ep}
                  checked={selectedEpIds.has(ep.id)}
                  onCheck={v => setSelectedEpIds(p => { const n = new Set(p); v ? n.add(ep.id) : n.delete(ep.id); return n; })}
                  uploadState={epUploadStates[`ep-${ep.id}`]}
                  onUpload={f => handleEpUpload(ep, f)}
                  onPicker={() => openPicker({ kind: 'episode-single', episodeId: ep.id })}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Players ── */}
      {activeSection === 'players' && <PlayersCutoutsSection />}

      {/* ── Archive ── */}
      {activeSection === 'archive' && (
        <div className="vstack" style={{ gap: 'var(--s4)' }}>
          <div className="flex flex-wrap items-center gap-2">
            {(['all', 'formats', 'episodes', 'library'] as const).map(f => (
              <button key={f} onClick={() => setArchiveFilter(f)} className={archiveFilter === f ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}>
                {f === 'all' ? 'Tutto' : f === 'formats' ? 'Format' : f === 'episodes' ? 'Episodi' : 'Library'}
              </button>
            ))}
            <div className="grow" />
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
              <input type="text" placeholder="Cerca..." value={archiveSearch} onChange={e => setArchiveSearch(e.target.value)} className="input pl-10" style={{ width: 200 }} />
            </div>
            <button onClick={loadArchive} className="btn btn-ghost btn-sm btn-icon">
              <RefreshCw className={`w-4 h-4 ${archiveLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {archiveLoading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-7 h-7 border-2 border-[color:var(--accent-raw)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : archiveFiltered.length === 0 ? (
            <div className="card card-body text-center">
              <Cloud className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
              <p className="typ-caption">Nessuna immagine.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between typ-caption">
                <span>{archiveFiltered.length} immagini{archiveSelected.size > 0 ? ` · ${archiveSelected.size} selezionate` : ' · Clicca per selezionare'}</span>
                <div className="flex items-center gap-3">
                  {archiveSelected.size > 0 && <button onClick={() => setArchiveSelected(new Set())} className="hover:text-[color:var(--text-hi)]">Deseleziona</button>}
                  <button onClick={() => { const all = new Set(archiveFiltered.map(i => i.key)); setArchiveSelected(prev => prev.size === all.size ? new Set() : all); }} className="hover:text-[color:var(--text-hi)]">
                    {archiveSelected.size === archiveFiltered.length ? 'Deseleziona tutto' : 'Seleziona tutto'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                {archiveFiltered.map(item => {
                  const sel = archiveSelected.has(item.key);
                  return (
                    <div key={item.key} title={item.key}
                      onClick={() => setArchiveSelected(prev => { const n = new Set(prev); n.has(item.key) ? n.delete(item.key) : n.add(item.key); return n; })}
                      className={`group relative aspect-square rounded-[var(--r-sm)] overflow-hidden cursor-pointer transition-all ${sel ? 'ring-2' : ''}`}
                      style={{ background: 'var(--card-muted)', border: `2px solid ${sel ? 'var(--danger)' : 'transparent'}` }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.url} alt={item.key} className="w-full h-full object-cover" loading="lazy" onError={e => (e.target as HTMLImageElement).style.display = 'none'} />
                      {sel && <div className="absolute inset-0" style={{ background: 'color-mix(in oklab, var(--danger) 10%, transparent)' }} />}
                      <div className="absolute top-1 left-1">
                        <div className="inline-grid place-items-center" style={{ width: 20, height: 20, borderRadius: 5, background: sel ? 'var(--danger)' : 'rgba(0,0,0,0.35)', border: `2px solid ${sel ? 'var(--danger)' : 'rgba(255,255,255,0.7)'}` }}>
                          {sel && <CheckCircle2 className="w-3 h-3" style={{ color: '#fff' }} />}
                        </div>
                      </div>
                      <p className="absolute bottom-0 inset-x-0 px-1 py-0.5 truncate" style={{ fontSize: 9, color: '#fff', background: 'rgba(0,0,0,0.6)' }}>
                        {item.key}
                      </p>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Sticky bottom: Archive delete bar */}
      {activeSection === 'archive' && archiveSelected.size > 0 && (
        <div className="fixed z-30 pointer-events-none" style={{ left: 0, right: 0, bottom: 'calc(var(--tabbar-h) + env(safe-area-inset-bottom, 0) + 16px)' }}>
          <div className="max-w-3xl mx-auto px-4 pointer-events-auto">
            <div className="card card-body flex items-center gap-3" style={{ borderColor: 'color-mix(in oklab, var(--danger) 28%, transparent)', boxShadow: 'var(--shadow-card-hi)' }}>
              <div className="grow min-w-0">
                <div className="typ-label">{archiveSelected.size} immagin{archiveSelected.size === 1 ? 'e' : 'i'}</div>
                <div className="typ-micro">Eliminazione permanente R2</div>
              </div>
              <button onClick={handleArchiveDeleteSelected} disabled={archiveDeleting} className="btn btn-danger btn-sm">
                {archiveDeleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Elimina
              </button>
              <button onClick={() => setArchiveSelected(new Set())} className="btn btn-quiet btn-icon btn-sm" aria-label="Chiudi">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky bottom: Batch upload bar */}
      {activeSection === 'episodes' && selectedEpIds.size > 0 && (
        <div className="fixed z-30 pointer-events-none" style={{ left: 0, right: 0, bottom: 'calc(var(--tabbar-h) + env(safe-area-inset-bottom, 0) + 16px)' }}>
          <div className="max-w-3xl mx-auto px-4 pointer-events-auto">
            <div className="card card-body flex items-center gap-3" style={{ borderColor: 'color-mix(in oklab, var(--accent-raw) 30%, transparent)', boxShadow: 'var(--shadow-card-hi)' }}>
              <div className="grow min-w-0">
                <div className="typ-label">{selectedEpIds.size} episod{selectedEpIds.size === 1 ? 'io' : 'i'}</div>
                <div className="typ-micro">Stesso URL a tutti</div>
              </div>
              <button onClick={() => batchFileRef.current?.click()} disabled={bulkUploading} className="btn btn-ghost btn-sm">
                {bulkUploading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Carica
              </button>
              <button onClick={() => openPicker({ kind: 'episode-batch' })} disabled={bulkUploading} className="btn btn-ghost btn-sm">
                <ImageIcon className="w-3.5 h-3.5" /> Libreria
              </button>
              <button onClick={() => setSelectedEpIds(new Set())} className="btn btn-quiet btn-icon btn-sm" aria-label="Chiudi">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Media Picker */}
      <MediaPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={handlePickerSelect} />

      <input ref={batchFileRef} type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) { handleBatchUpload(f); e.target.value = ''; } }} />
    </div>
  );
}
