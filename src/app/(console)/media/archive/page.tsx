'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Cloud, RefreshCw, Search, Trash2, X, ArrowLeft, CheckCircle2,
} from 'lucide-react';
import { LibraryItem } from '@/lib/mediaUpload';

export default function ArchivePage() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'formats' | 'episodes' | 'library' | 'players'>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/media/library');
      const data = await res.json() as { items: LibraryItem[] };
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDeleteSelected = async () => {
    if (selected.size === 0 || deleting) return;
    setDeleting(true);
    for (const key of [...selected]) {
      try {
        await fetch('/api/media/library', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
        setItems(prev => prev.filter(i => i.key !== key));
        setSelected(prev => { const n = new Set(prev); n.delete(key); return n; });
      } catch { /* ignore */ }
    }
    setDeleting(false);
  };

  const filtered = items.filter(item => {
    if (filter === 'formats'  && !item.key.startsWith('formats/'))  return false;
    if (filter === 'episodes' && !item.key.startsWith('episodes/')) return false;
    if (filter === 'library'  && !item.key.startsWith('library/'))  return false;
    if (filter === 'players'  && !item.key.startsWith('players/'))  return false;
    if (search && !item.key.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="vstack" style={{ gap: 'var(--s5)' }}>
      <div className="flex items-center gap-2 flex-wrap">
        <Link href="/media" className="btn btn-ghost btn-sm">
          <ArrowLeft className="w-4 h-4" /> Media
        </Link>
        <div className="grow" />
        <button onClick={load} className="btn btn-ghost btn-sm btn-icon">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div>
        <h1 className="typ-h1">Archivio R2</h1>
        <p className="typ-caption mt-1">Browser dello storage Cloudflare R2 (bucket <code>lavika-media</code>). Tool di debug — eliminazioni permanenti.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'formats', 'episodes', 'library', 'players'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={filter === f ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}>
            {f === 'all' ? 'Tutto' : f === 'formats' ? 'Format' : f === 'episodes' ? 'Episodi' : f === 'players' ? 'Giocatori' : 'Library'}
          </button>
        ))}
        <div className="grow" />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
          <input type="text" placeholder="Cerca..." value={search} onChange={e => setSearch(e.target.value)} className="input pl-10" style={{ width: 200 }} />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-7 h-7 border-2 border-[color:var(--accent-raw)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card card-body text-center">
          <Cloud className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
          <p className="typ-caption">Nessuna immagine.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between typ-caption">
            <span>{filtered.length} immagini{selected.size > 0 ? ` · ${selected.size} selezionate` : ' · Clicca per selezionare'}</span>
            <div className="flex items-center gap-3">
              {selected.size > 0 && <button onClick={() => setSelected(new Set())} className="hover:text-[color:var(--text-hi)]">Deseleziona</button>}
              <button onClick={() => { const all = new Set(filtered.map(i => i.key)); setSelected(prev => prev.size === all.size ? new Set() : all); }} className="hover:text-[color:var(--text-hi)]">
                {selected.size === filtered.length ? 'Deseleziona tutto' : 'Seleziona tutto'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {filtered.map(item => {
              const sel = selected.has(item.key);
              return (
                <div key={item.key} title={item.key}
                  onClick={() => setSelected(prev => { const n = new Set(prev); n.has(item.key) ? n.delete(item.key) : n.add(item.key); return n; })}
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

      {selected.size > 0 && (
        <div className="fixed z-30 pointer-events-none" style={{ left: 0, right: 0, bottom: 'calc(var(--tabbar-h) + env(safe-area-inset-bottom, 0) + 16px)' }}>
          <div className="max-w-3xl mx-auto px-4 pointer-events-auto">
            <div className="card card-body flex items-center gap-3" style={{ borderColor: 'color-mix(in oklab, var(--danger) 28%, transparent)', boxShadow: 'var(--shadow-card-hi)' }}>
              <div className="grow min-w-0">
                <div className="typ-label">{selected.size} immagin{selected.size === 1 ? 'e' : 'i'}</div>
                <div className="typ-micro">Eliminazione permanente R2</div>
              </div>
              <button onClick={handleDeleteSelected} disabled={deleting} className="btn btn-danger btn-sm">
                {deleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Elimina
              </button>
              <button onClick={() => setSelected(new Set())} className="btn btn-quiet btn-icon btn-sm" aria-label="Chiudi">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
