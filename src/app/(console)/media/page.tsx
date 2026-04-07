'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SectionHeader } from '@/components/SectionHeader';
import {
  Upload,
  ImageIcon,
  Film,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  BookOpen,
  ChevronDown,
  Cloud,
  Database,
  X,
  Square,
  Layers,
  Search,
  Trash2,
} from 'lucide-react';

const MEDIA_PUBLIC_BASE_URL = 'https://pub-caae50e77b854437b46967f95fd48914.r2.dev';
const PRESS_CONF_RE = /press.?conf|conferenza/i;

// ── Types ──────────────────────────────────────────────────────────────────────

type FormatImageColumn = 'cover_vertical_url' | 'cover_horizontal_url' | 'hero_url';

interface SupaFormat {
  id: string;
  title: string | null;
  cover_vertical_url: string | null;
  cover_horizontal_url: string | null;
  hero_url: string | null;
}

interface SupaEpisode {
  id: string;
  format_id: string;
  video_id: string | null;
  title: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  is_active: boolean;
  min_badge: string | null;
  season: string | null;
}

interface UploadState {
  progress: number;
  error: string | null;
  done: boolean;
}

interface LibraryItem {
  key: string;
  url: string;
  size: number;
  lastModified?: string;
}

type PickerTarget =
  | { kind: 'format'; formatId: string; column: FormatImageColumn }
  | { kind: 'episode-single'; episodeId: string }
  | { kind: 'episode-batch' };

// ── Slot definitions ───────────────────────────────────────────────────────────

const FORMAT_SLOTS = [
  {
    key: 'cover_vertical_url' as FormatImageColumn,
    label: 'Cover Verticale',
    note: 'Con titolo · 2:3',
    aspect: 'aspect-[2/3]',
    minDim: '400×600',
    uploadType: 'format-cover-vertical',
  },
  {
    key: 'cover_horizontal_url' as FormatImageColumn,
    label: 'Cover Orizzontale',
    note: 'Con titolo · 16:9',
    aspect: 'aspect-video',
    minDim: '640×360',
    uploadType: 'format-cover-horizontal',
  },
  {
    key: 'hero_url' as FormatImageColumn,
    label: 'Hero',
    note: 'Senza titolo · 3:4',
    aspect: 'aspect-[3/4]',
    minDim: '750×1000',
    uploadType: 'format-hero',
  },
] as const;

// ── Utilities ──────────────────────────────────────────────────────────────────

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
        (blob) => { URL.revokeObjectURL(url); blob ? resolve(blob) : reject(new Error('Conversione WebP fallita')); },
        'image/webp',
        0.88
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Impossibile caricare l'immagine")); };
    img.src = url;
  });
}

async function uploadFile(
  file: File,
  type: string,
  params: Record<string, string>,
  onProgress?: (p: number) => void
): Promise<string> {
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

// ── ImageSlot ──────────────────────────────────────────────────────────────────

function ImageSlot({
  label, note, aspect, minDim,
  url, uploadState,
  onUpload, onPicker, onRemove,
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
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-foreground">{label}</p>
          <p className="text-[10px] text-muted-foreground">{note} · min {minDim}px</p>
        </div>
        {url && !uploading && (
          <button onClick={onRemove} className="text-[10px] text-red-500 hover:underline shrink-0">
            Rimuovi
          </button>
        )}
      </div>

      <div
        className={`relative ${aspect} rounded-lg border-2 overflow-hidden cursor-pointer transition-colors ${
          dragging ? 'border-primary bg-primary/10'
            : url && !imgError ? 'border-border hover:border-primary/40'
            : 'border-dashed border-border hover:border-primary/40 bg-muted/10'
        } ${uploadState?.error ? 'border-red-500/40' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragging(false);
          const f = e.dataTransfer.files[0]; if (f) onUpload(f);
        }}
        onClick={() => { if (!uploading) inputRef.current?.click(); }}
      >
        {url && !imgError && (
          <img src={url} alt={label} className="absolute inset-0 w-full h-full object-cover"
            onError={() => setImgError(true)} />
        )}
        <div className={`absolute inset-0 flex flex-col items-center justify-center gap-2 transition-opacity ${
          uploading ? 'bg-background/80 opacity-100'
            : url && !imgError ? 'opacity-0 hover:opacity-100 bg-background/60'
            : 'opacity-100'
        }`}>
          {uploading ? (
            <div className="w-full px-4 space-y-2 text-center">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <div className="w-full bg-muted rounded-full h-1">
                <div className="bg-primary h-1 rounded-full transition-all" style={{ width: `${uploadState!.progress}%` }} />
              </div>
              <span className="text-[10px] text-muted-foreground">{uploadState!.progress}%</span>
            </div>
          ) : (
            <>
              <Upload className="w-5 h-5 text-muted-foreground/60" />
              <span className="text-[10px] text-muted-foreground">{dragging ? 'Rilascia' : 'Clicca o trascina'}</span>
            </>
          )}
        </div>
        {uploadState?.done && (
          <div className="absolute top-2 right-2">
            <CheckCircle2 className="w-4 h-4 text-green-500 drop-shadow" />
          </div>
        )}
      </div>

      {uploadState?.error && <p className="text-[10px] text-red-500">{uploadState.error}</p>}

      <div className="grid grid-cols-2 gap-1.5">
        <button
          disabled={!!uploading}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border border-border text-xs text-foreground hover:bg-muted/40 disabled:opacity-40 transition-colors"
        >
          <Upload className="w-3 h-3" /> Carica nuova
        </button>
        <button
          disabled={!!uploading}
          onClick={onPicker}
          className="inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border border-border text-xs text-foreground hover:bg-muted/40 disabled:opacity-40 transition-colors"
        >
          <ImageIcon className="w-3 h-3" /> Libreria
        </button>
      </div>

      <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) { onUpload(f); e.target.value = ''; } }} />
    </div>
  );
}

// ── EpisodeCard ────────────────────────────────────────────────────────────────

function EpisodeCard({
  episode, checked,
  onCheck, uploadState, onUpload, onPicker,
}: {
  episode: SupaEpisode;
  checked: boolean;
  onCheck: (v: boolean) => void;
  uploadState?: UploadState;
  onUpload: (f: File) => void;
  onPicker: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [imgError, setImgError] = useState(false);
  const uploading = uploadState && !uploadState.done && uploadState.progress > 0;
  const displayUrl = episode.thumbnail_url;
  const isEditorial = Boolean(displayUrl);

  useEffect(() => { setImgError(false); }, [displayUrl]);

  return (
    <div className={`relative rounded-lg border bg-card overflow-hidden transition-colors ${
      checked ? 'border-primary/60 ring-1 ring-primary/20' : 'border-border'
    }`}>
      {/* Checkbox */}
      <button
        onClick={() => onCheck(!checked)}
        className={`absolute top-2 left-2 z-10 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
          checked ? 'bg-primary border-primary' : 'bg-background/80 border-muted-foreground/40 hover:border-primary/60'
        }`}
      >
        {checked && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
      </button>

      {/* Thumbnail */}
      <div
        className={`relative aspect-video cursor-pointer overflow-hidden ${dragging ? 'bg-primary/10' : 'bg-muted/20'}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragging(false);
          const f = e.dataTransfer.files[0]; if (f) onUpload(f);
        }}
        onClick={() => { if (!uploading) inputRef.current?.click(); }}
      >
        {displayUrl && !imgError && !uploading && (
          <img src={displayUrl} alt={episode.title ?? episode.id}
            className="absolute inset-0 w-full h-full object-cover" onError={() => setImgError(true)} />
        )}
        <div className={`absolute inset-0 flex flex-col items-center justify-center gap-1 transition-opacity ${
          uploading ? 'bg-background/80' : displayUrl && !imgError ? 'opacity-0 hover:opacity-100 bg-background/60' : ''
        }`}>
          {uploading ? (
            <div className="w-full px-4 space-y-1.5">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <div className="w-full bg-muted rounded-full h-1">
                <div className="bg-primary h-1 rounded-full" style={{ width: `${uploadState!.progress}%` }} />
              </div>
            </div>
          ) : (
            <>
              <Upload className="w-4 h-4 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Carica thumbnail</span>
            </>
          )}
        </div>
        {uploadState?.done && (
          <div className="absolute top-1 right-1"><CheckCircle2 className="w-4 h-4 text-green-500 drop-shadow" /></div>
        )}
      </div>

      {/* Info */}
      <div className="p-2.5 space-y-1.5">
        <p className="text-xs font-medium text-foreground line-clamp-2 leading-tight">
          {episode.title ?? episode.id}
        </p>
        <div className="flex items-center justify-between">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium ${
            isEditorial
              ? 'bg-green-500/10 text-green-600 dark:text-green-400'
              : 'bg-muted/50 text-muted-foreground/50'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isEditorial ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
            {isEditorial ? 'Editoriale' : 'Nessuna'}
          </span>
          <button onClick={(e) => { e.stopPropagation(); onPicker(); }}
            className="text-muted-foreground hover:text-foreground transition-colors">
            <ImageIcon className="w-3.5 h-3.5" />
          </button>
        </div>
        {uploadState?.error && <p className="text-[10px] text-red-500 line-clamp-2">{uploadState.error}</p>}
      </div>

      <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) { onUpload(f); e.target.value = ''; } }} />
    </div>
  );
}

// ── MediaPicker ────────────────────────────────────────────────────────────────

function MediaPicker({
  open, onClose, onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
}) {
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

  useEffect(() => {
    if (open) { loadItems(); setSearch(''); setFilter('all'); setPickerUpload(null); }
  }, [open, loadItems]);

  const filtered = items.filter(item => {
    if (filter === 'formats' && !item.key.startsWith('formats/')) return false;
    if (filter === 'episodes' && !item.key.startsWith('episodes/')) return false;
    if (search && !item.key.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handlePickerDelete = async (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deletingKey) return;
    setDeletingKey(key);
    try {
      const res = await fetch('/api/media/library', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
      if (!res.ok) throw new Error('Errore eliminazione');
      setItems(prev => prev.filter(i => i.key !== key));
    } catch { /* ignore */ }
    setDeletingKey(null);
  };

  const handlePickerUpload = async (file: File) => {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-4xl max-h-[85vh] bg-card border border-border rounded-xl flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-foreground">Libreria Media · lavika-media</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0 flex-wrap">
          {(['all', 'formats', 'episodes'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                filter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/40'
              }`}>
              {f === 'all' ? 'Tutto' : f === 'formats' ? 'Format' : 'Episodi'}
            </button>
          ))}
          <div className="flex-1" />
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <input type="text" placeholder="Cerca..." value={search} onChange={(e) => setSearch(e.target.value)}
              className="bg-muted/40 border border-border rounded-md pl-6 pr-2 py-1 text-xs text-foreground placeholder:text-muted-foreground w-36" />
          </div>
          <button onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">
            <Upload className="w-3 h-3" /> Carica nuova
          </button>
        </div>

        {/* Upload progress */}
        {pickerUpload && !pickerUpload.done && (
          <div className="px-3 py-2 border-b border-border shrink-0 flex items-center gap-2">
            <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
            <div className="flex-1 bg-muted rounded-full h-1">
              <div className="bg-primary h-1 rounded-full" style={{ width: `${pickerUpload.progress}%` }} />
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0">{pickerUpload.progress}%</span>
          </div>
        )}
        {pickerUpload?.error && (
          <div className="px-3 py-2 border-b border-border shrink-0">
            <p className="text-[10px] text-red-500">{pickerUpload.error}</p>
          </div>
        )}

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <ImageIcon className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">
                {items.length === 0 ? 'La libreria è vuota — carica la prima immagine.' : 'Nessun risultato per questa ricerca.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
              {filtered.map(item => (
                <div key={item.key} title={item.key}
                  onClick={() => { onSelect(item.url); onClose(); }}
                  className={`group relative aspect-square rounded-lg overflow-hidden border-2 border-transparent hover:border-primary transition-all bg-muted/20 cursor-pointer ${
                    deletingKey === item.key ? 'opacity-40 pointer-events-none' : ''
                  }`}>
                  <img src={item.url} alt={item.key} className="w-full h-full object-cover" loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <div className="absolute inset-0 bg-background/0 group-hover:bg-background/40 transition-colors" />
                  <button
                    onClick={(e) => handlePickerDelete(item.key, e)}
                    className="absolute top-1 right-1 p-1 rounded-md bg-red-600/80 text-white opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-all z-10"
                    title="Elimina"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                  <p className="absolute bottom-0 inset-x-0 px-1 py-0.5 text-[8px] text-white bg-black/50 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                    {item.key.split('/').pop()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-3 py-2 border-t border-border shrink-0">
          <p className="text-[10px] text-muted-foreground">{filtered.length} immagini · Clicca per selezionare · Hover per eliminare</p>
        </div>

        <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) { handlePickerUpload(f); e.target.value = ''; } }} />
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function MediaPage() {
  const [activeSection, setActiveSection] = useState<'formats' | 'episodes'>('formats');

  // Section 1: Supabase formats
  const [supaFormats, setSupaFormats] = useState<SupaFormat[]>([]);
  const [formatsLoading, setFormatsLoading] = useState(true);
  const [formatsError, setFormatsError] = useState<string | null>(null);
  const [formatUploadStates, setFormatUploadStates] = useState<Record<string, UploadState>>({});

  // Section 2: Supabase episodes
  const [supaEpisodes, setSupaEpisodes] = useState<SupaEpisode[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [selectedFormatId, setSelectedFormatId] = useState('');
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [selectedEpIds, setSelectedEpIds] = useState<Set<string>>(new Set());
  const [epUploadStates, setEpUploadStates] = useState<Record<string, UploadState>>({});
  const [bulkUploading, setBulkUploading] = useState(false);
  const batchFileRef = useRef<HTMLInputElement>(null);

  // Media picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);

  // ── Data loading ─────────────────────────────────────────────────────────────

  const loadFormats = useCallback(async () => {
    setFormatsLoading(true); setFormatsError(null);
    try {
      const res = await fetch('/api/media/formats');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as SupaFormat[];
      const formats = Array.isArray(data) ? data : [];
      setSupaFormats(formats);
      // Initialize format selector for episodes section
      if (formats.length > 0 && !selectedFormatId) {
        setSelectedFormatId(formats[0].id);
      }
    } catch (err) {
      setFormatsError(err instanceof Error ? err.message : 'Errore');
    } finally { setFormatsLoading(false); }
  }, [selectedFormatId]);

  const loadEpisodesForFormat = useCallback(async (formatId: string) => {
    if (!formatId) return;
    setEpisodesLoading(true);
    setSupaEpisodes([]);
    setSelectedEpIds(new Set());
    try {
      const res = await fetch(`/api/media/formats/${encodeURIComponent(formatId)}/episodes`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as SupaEpisode[];
      const episodes = Array.isArray(data) ? data : [];
      setSupaEpisodes(episodes);
      // Pick the most recent season by default
      const seasons = [...new Set(episodes.map(ep => ep.season).filter(Boolean))] as string[];
      seasons.sort((a, b) => b.localeCompare(a));
      setSelectedSeasonId(seasons[0] ?? '');
    } catch { /* ignore */ } finally { setEpisodesLoading(false); }
  }, []);

  useEffect(() => { loadFormats(); }, [loadFormats]);

  // Load episodes when format changes
  useEffect(() => {
    if (selectedFormatId) loadEpisodesForFormat(selectedFormatId);
  }, [selectedFormatId, loadEpisodesForFormat]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const availableSeasons = [...new Set(supaEpisodes.map(ep => ep.season).filter(Boolean))] as string[];
  availableSeasons.sort((a, b) => b.localeCompare(a));

  const episodesForSeason = supaEpisodes.filter(ep =>
    selectedSeasonId ? ep.season === selectedSeasonId : !ep.season
  );

  const episodesWithoutEditorial = episodesForSeason.filter(ep => !ep.thumbnail_url);
  const allSelected = episodesForSeason.length > 0 && episodesForSeason.every(ep => selectedEpIds.has(ep.id));
  const isPressConf = PRESS_CONF_RE.test(selectedFormatId);

  // ── Format upload handlers ────────────────────────────────────────────────

  const handleFormatUpload = async (formatId: string, column: FormatImageColumn, uploadType: string, file: File) => {
    const stateKey = `${formatId}-${column}`;
    setFormatUploadStates(prev => ({ ...prev, [stateKey]: { progress: 0, error: null, done: false } }));
    try {
      const url = await uploadFile(file, uploadType, { formatId }, (p) => {
        setFormatUploadStates(prev => ({ ...prev, [stateKey]: { progress: p, error: null, done: false } }));
      });
      const res = await fetch('/api/media/formats', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: formatId, column, value: url }),
      });
      if (!res.ok) throw new Error('Errore salvataggio DB');
      setFormatUploadStates(prev => ({ ...prev, [stateKey]: { progress: 100, error: null, done: true } }));
      setSupaFormats(prev => prev.map(f => f.id === formatId ? { ...f, [column]: url } : f));
    } catch (err) {
      setFormatUploadStates(prev => ({
        ...prev, [stateKey]: { progress: 0, error: err instanceof Error ? err.message : 'Errore', done: false },
      }));
    }
  };

  const handleFormatRemove = async (formatId: string, column: FormatImageColumn) => {
    await fetch('/api/media/formats', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: formatId, column, value: null }),
    });
    setSupaFormats(prev => prev.map(f => f.id === formatId ? { ...f, [column]: null } : f));
  };

  // ── Episode upload handlers ───────────────────────────────────────────────

  const handleEpUpload = async (ep: SupaEpisode, file: File) => {
    const stateKey = `ep-${ep.id}`;
    setEpUploadStates(prev => ({ ...prev, [stateKey]: { progress: 0, error: null, done: false } }));
    try {
      const season = ep.season?.replace(/\//g, '-') ?? '';
      const url = await uploadFile(
        file, 'episode-thumbnail',
        { formatId: ep.format_id, season, episodeId: ep.id },
        (p) => { setEpUploadStates(prev => ({ ...prev, [stateKey]: { progress: p, error: null, done: false } })); }
      );
      await fetch('/api/media/episodes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [ep.id], thumbnail_url: url }),
      });
      setEpUploadStates(prev => ({ ...prev, [stateKey]: { progress: 100, error: null, done: true } }));
      setSupaEpisodes(prev => prev.map(e => e.id === ep.id ? { ...e, thumbnail_url: url } : e));
    } catch (err) {
      setEpUploadStates(prev => ({
        ...prev, [stateKey]: { progress: 0, error: err instanceof Error ? err.message : 'Errore', done: false },
      }));
    }
  };

  // ── Batch upload ──────────────────────────────────────────────────────────

  const applyBatchUrl = async (url: string) => {
    const ids = Array.from(selectedEpIds);
    await fetch('/api/media/episodes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, thumbnail_url: url }),
    });
    setSupaEpisodes(prev => prev.map(e => ids.includes(e.id) ? { ...e, thumbnail_url: url } : e));
    setSelectedEpIds(new Set());
  };

  const handleBatchUpload = async (file: File) => {
    setBulkUploading(true);
    try {
      const url = await uploadFile(file, 'batch-thumbnail', { formatId: selectedFormatId });
      await applyBatchUrl(url);
    } catch (err) {
      console.error('Batch upload error:', err);
    } finally { setBulkUploading(false); }
  };

  // ── Media Picker handlers ─────────────────────────────────────────────────

  const openPicker = (target: PickerTarget) => { setPickerTarget(target); setPickerOpen(true); };

  const handlePickerSelect = async (url: string) => {
    setPickerOpen(false);
    if (!pickerTarget) return;
    if (pickerTarget.kind === 'format') {
      await fetch('/api/media/formats', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pickerTarget.formatId, column: pickerTarget.column, value: url }),
      });
      setSupaFormats(prev => prev.map(f =>
        f.id === pickerTarget.formatId ? { ...f, [pickerTarget.column]: url } : f
      ));
    } else if (pickerTarget.kind === 'episode-single') {
      await fetch('/api/media/episodes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [pickerTarget.episodeId], thumbnail_url: url }),
      });
      setSupaEpisodes(prev => prev.map(e =>
        e.id === pickerTarget.episodeId ? { ...e, thumbnail_url: url } : e
      ));
    } else if (pickerTarget.kind === 'episode-batch') {
      await applyBatchUrl(url);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-48">
      <SectionHeader
        title="Media"
        description="Immagini su lavika-media · Catalogo su Supabase"
        actions={
          <button onClick={() => { loadFormats(); if (selectedFormatId) loadEpisodesForFormat(selectedFormatId); }}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted/40 transition-colors">
            <RefreshCw className="w-4 h-4" /> Ricarica
          </button>
        }
      />

      {/* Bucket banners */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <Cloud className="w-4 h-4 text-violet-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground">Immagini su</p>
            <p className="text-xs font-medium truncate">lavika-media (pubblico)</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <Database className="w-4 h-4 text-blue-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground">Catalogo su</p>
            <p className="text-xs font-medium truncate">Supabase (content_episodes)</p>
          </div>
        </div>
      </div>

      {/* Section tabs */}
      <div className="rounded-xl border border-border bg-card/70 p-1">
        <nav className="grid grid-cols-2 gap-1">
          {[
            { id: 'formats' as const, label: 'Immagini Format', icon: <ImageIcon className="h-3.5 w-3.5" /> },
            { id: 'episodes' as const, label: 'Thumbnail Episodi', icon: <Film className="h-3.5 w-3.5" /> },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveSection(tab.id)}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors ${
                activeSection === tab.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              }`}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Section 1: Format Images ─────────────────────────────────────────── */}
      {activeSection === 'formats' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card/60 p-3 text-xs text-muted-foreground space-y-1">
            <p>Le immagini vengono caricate su <span className="text-foreground font-medium">lavika-media</span> e salvate
              nella tabella <code className="bg-muted px-1 rounded text-[10px]">content_formats</code>.</p>
            <p>Formati accettati: JPG, PNG, WebP · Convertiti automaticamente in WebP prima del caricamento.</p>
          </div>

          {formatsLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : formatsError ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-500">Errore caricamento format</p>
                <p className="text-xs text-muted-foreground mt-1">{formatsError}</p>
                <button onClick={loadFormats} className="mt-2 text-xs text-primary hover:underline">Riprova</button>
              </div>
            </div>
          ) : supaFormats.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <BookOpen className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nessun format trovato in <code>content_formats</code>.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {supaFormats.map(fmt => (
                <div key={fmt.id} className="rounded-xl border border-border bg-card p-5 space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{fmt.title ?? fmt.id}</h3>
                    <p className="text-[10px] text-muted-foreground font-mono">{fmt.id}</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    {FORMAT_SLOTS.map(slot => {
                      const stateKey = `${fmt.id}-${slot.key}`;
                      return (
                        <ImageSlot
                          key={slot.key}
                          label={slot.label}
                          note={slot.note}
                          aspect={slot.aspect}
                          minDim={slot.minDim}
                          url={fmt[slot.key]}
                          uploadState={formatUploadStates[stateKey] ?? null}
                          onUpload={(file) => handleFormatUpload(fmt.id, slot.key, slot.uploadType, file)}
                          onPicker={() => openPicker({ kind: 'format', formatId: fmt.id, column: slot.key })}
                          onRemove={() => handleFormatRemove(fmt.id, slot.key)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Section 2: Episode Thumbnails ────────────────────────────────────── */}
      {activeSection === 'episodes' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card/60 p-3 text-xs text-muted-foreground space-y-1">
            <p>
              Badge <span className="text-green-500 font-medium">Editoriale</span>: thumbnail salvata in{' '}
              <code className="bg-muted px-1 rounded text-[10px]">content_episodes.thumbnail_url</code> — scrittura immediata.
            </p>
            <p>
              Badge <span className="text-muted-foreground font-medium">Nessuna</span>: episodio senza thumbnail — carica o scegli dalla libreria.
            </p>
          </div>

          {/* Format + Season selectors */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <select value={selectedFormatId} onChange={e => setSelectedFormatId(e.target.value)}
                className="w-full appearance-none bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground pr-8">
                {formatsLoading && <option value="">Caricamento...</option>}
                {!formatsLoading && supaFormats.length === 0 && <option value="">Nessun format</option>}
                {supaFormats.map(f => (
                  <option key={f.id} value={f.id}>{f.title ?? f.id}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
            <div className="relative flex-1">
              <select value={selectedSeasonId} onChange={e => { setSelectedSeasonId(e.target.value); setSelectedEpIds(new Set()); }}
                disabled={availableSeasons.length === 0}
                className="w-full appearance-none bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground pr-8 disabled:opacity-50">
                {availableSeasons.length === 0 && <option value="">Nessuna stagione</option>}
                {availableSeasons.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Press Conference warning */}
          {isPressConf && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Le thumbnail di questo format devono riflettere il soggetto reale dell&apos;episodio (allenatore, giocatore).
                Evita di assegnare la stessa immagine a episodi con soggetti diversi.
              </p>
            </div>
          )}

          {/* Bulk actions (top bar) */}
          {episodesForSeason.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setSelectedEpIds(allSelected ? new Set() : new Set(episodesForSeason.map(ep => ep.id)))}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-xs text-foreground hover:bg-muted/40 transition-colors"
              >
                <Square className="w-3 h-3" />
                {allSelected ? 'Deseleziona tutti' : 'Seleziona tutti'}
              </button>
              {episodesWithoutEditorial.length > 0 && (
                <button
                  onClick={() => setSelectedEpIds(new Set(episodesWithoutEditorial.map(ep => ep.id)))}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-xs text-foreground hover:bg-muted/40 transition-colors"
                >
                  <Layers className="w-3 h-3" />
                  Senza thumbnail ({episodesWithoutEditorial.length})
                </button>
              )}
              {selectedEpIds.size > 0 && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {selectedEpIds.size} selezionat{selectedEpIds.size === 1 ? 'o' : 'i'}
                </span>
              )}
            </div>
          )}

          {/* Episodes grid */}
          {episodesLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : episodesForSeason.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <Film className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {!selectedFormatId ? 'Seleziona un format.' : 'Nessun episodio in questa stagione.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {episodesForSeason.map(ep => (
                <EpisodeCard
                  key={ep.id}
                  episode={ep}
                  checked={selectedEpIds.has(ep.id)}
                  onCheck={(v) => {
                    setSelectedEpIds(prev => {
                      const next = new Set(prev);
                      v ? next.add(ep.id) : next.delete(ep.id);
                      return next;
                    });
                  }}
                  uploadState={epUploadStates[`ep-${ep.id}`]}
                  onUpload={(file) => handleEpUpload(ep, file)}
                  onPicker={() => openPicker({ kind: 'episode-single', episodeId: ep.id })}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Sticky bottom: Batch action bar ─────────────────────────────────── */}
      {activeSection === 'episodes' && selectedEpIds.size > 0 && (
        <div className="fixed bottom-20 lg:bottom-6 left-0 lg:left-64 right-0 px-4 lg:px-6 pointer-events-none z-30">
          <div className="max-w-4xl mx-auto pointer-events-auto">
            <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-card shadow-xl px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {selectedEpIds.size} episod{selectedEpIds.size === 1 ? 'io' : 'i'} selezionat{selectedEpIds.size === 1 ? 'o' : 'i'}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Carica o scegli dalla libreria — lo stesso URL viene assegnato a tutti
                </p>
              </div>
              <button
                onClick={() => batchFileRef.current?.click()}
                disabled={bulkUploading}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium hover:bg-muted/40 disabled:opacity-40 transition-colors shrink-0"
              >
                {bulkUploading
                  ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  : <Upload className="w-3.5 h-3.5" />}
                Carica per tutti
              </button>
              <button
                onClick={() => openPicker({ kind: 'episode-batch' })}
                disabled={bulkUploading}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium hover:bg-muted/40 disabled:opacity-40 transition-colors shrink-0"
              >
                <ImageIcon className="w-3.5 h-3.5" /> Libreria
              </button>
              <button
                onClick={() => setSelectedEpIds(new Set())}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Media Picker Modal ───────────────────────────────────────────────── */}
      <MediaPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={handlePickerSelect} />

      {/* Batch file input (hidden) */}
      <input ref={batchFileRef} type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) { handleBatchUpload(f); e.target.value = ''; } }} />
    </div>
  );
}
