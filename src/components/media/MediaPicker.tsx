'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageIcon, Upload, Search, X, Trash2 } from 'lucide-react';
import { LibraryItem, UploadState, convertToWebP, MEDIA_PUBLIC_BASE_URL } from '@/lib/mediaUpload';

export function MediaPicker({
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

  const handleDelete = async (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deletingKey) return;
    setDeletingKey(key);
    try {
      const res = await fetch('/api/media/library', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      });
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
