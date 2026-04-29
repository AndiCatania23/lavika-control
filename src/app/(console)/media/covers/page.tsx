'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Upload, ImageIcon, AlertTriangle, CheckCircle2, RefreshCw, X, ArrowLeft,
} from 'lucide-react';
import { MediaPicker } from '@/components/media/MediaPicker';
import { UploadState, uploadFile } from '@/lib/mediaUpload';

type FormatImageColumn = 'cover_vertical_url' | 'cover_horizontal_url' | 'hero_url';

interface SupaFormat {
  id: string; title: string | null;
  cover_vertical_url: string | null;
  cover_horizontal_url: string | null;
  hero_url: string | null;
}

const FORMAT_SLOTS = [
  { key: 'cover_vertical_url'   as FormatImageColumn, label: 'Cover Verticale',   note: 'Con titolo · 2:3',  aspect: 'aspect-[2/3]',  minDim: '400×600',  uploadType: 'format-cover-vertical' },
  { key: 'cover_horizontal_url' as FormatImageColumn, label: 'Cover Orizzontale', note: 'Con titolo · 16:9', aspect: 'aspect-video',  minDim: '640×360',  uploadType: 'format-cover-horizontal' },
  { key: 'hero_url'             as FormatImageColumn, label: 'Hero',              note: 'Senza titolo · 16:9', aspect: 'aspect-video',  minDim: '640×360',  uploadType: 'format-hero' },
] as const;

function useIsWide() {
  const [w, setW] = useState<boolean>(typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  useEffect(() => {
    const onR = () => setW(window.innerWidth >= 1024);
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);
  return w;
}

/* ImageSlot — drag/drop image upload slot */
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
            background: uploading ? 'rgba(255,255,255,0.85)' : 'transparent',
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

export default function CoversPage() {
  const isWide = useIsWide();
  const [supaFormats, setSupaFormats] = useState<SupaFormat[]>([]);
  const [formatsLoading, setFormatsLoading] = useState(true);
  const [formatsError, setFormatsError] = useState<string | null>(null);
  const [formatUploadStates, setFormatUploadStates] = useState<Record<string, UploadState>>({});
  const [editingFormatId, setEditingFormatId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<{ formatId: string; column: FormatImageColumn } | null>(null);

  const loadFormats = useCallback(async () => {
    setFormatsLoading(true); setFormatsError(null);
    try {
      const res = await fetch('/api/media/formats');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as SupaFormat[];
      setSupaFormats(Array.isArray(data) ? data : []);
    } catch (err) { setFormatsError(err instanceof Error ? err.message : 'Errore'); }
    finally { setFormatsLoading(false); }
  }, []);

  useEffect(() => { loadFormats(); }, [loadFormats]);

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

  const openPicker = (formatId: string, column: FormatImageColumn) => {
    setPickerTarget({ formatId, column });
    setPickerOpen(true);
  };

  const handlePickerSelect = async (url: string) => {
    setPickerOpen(false);
    if (!pickerTarget) return;
    await fetch('/api/media/formats', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pickerTarget.formatId, column: pickerTarget.column, value: url }) });
    setSupaFormats(p => p.map(f => f.id === pickerTarget.formatId ? { ...f, [pickerTarget.column]: url } : f));
  };

  const selectedFmt = editingFormatId ? supaFormats.find(f => f.id === editingFormatId) ?? null : null;

  return (
    <div className="vstack" style={{ gap: 'var(--s5)' }}>
      {/* Header with back link */}
      <div className="flex items-center gap-2 flex-wrap">
        <Link href="/media" className="btn btn-ghost btn-sm">
          <ArrowLeft className="w-4 h-4" /> Media
        </Link>
        <div className="grow" />
        <button onClick={loadFormats} className="btn btn-ghost btn-sm">
          <RefreshCw className="w-4 h-4" /> <span className="hidden md:inline">Ricarica</span>
        </button>
      </div>

      <div>
        <h1 className="typ-h1">Copertine</h1>
        <p className="typ-caption mt-1">Cover verticali, orizzontali e hero per ogni format. Conversione auto in WebP.</p>
      </div>

      {formatsLoading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-7 h-7 border-2 border-[color:var(--accent-raw)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : formatsError ? (
        <div className="card card-body flex items-start gap-3" style={{ borderColor: 'color-mix(in oklab, var(--danger) 30%, transparent)', background: 'color-mix(in oklab, var(--danger) 8%, var(--card))' }}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
          <div>
            <p className="typ-label" style={{ color: 'var(--danger)' }}>Errore caricamento format</p>
            <p className="typ-caption mt-1">{formatsError}</p>
            <button onClick={loadFormats} className="btn btn-ghost btn-sm mt-2">Riprova</button>
          </div>
        </div>
      ) : supaFormats.length === 0 ? (
        <div className="card card-body text-center">
          <ImageIcon className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
          <p className="typ-caption">Nessun format in <code>content_formats</code>.</p>
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: isWide && selectedFmt ? 'minmax(320px, 420px) 1fr' : '1fr' }}>
          <div className="vstack-tight">
            {supaFormats.map(fmt => {
              const selected = selectedFmt?.id === fmt.id;
              const missing = [fmt.cover_vertical_url, fmt.cover_horizontal_url, fmt.hero_url].filter(v => !v).length;
              return (
                <div
                  key={fmt.id}
                  onClick={() => setEditingFormatId(fmt.id)}
                  className="card card-hover"
                  style={{
                    cursor: 'pointer', padding: 12, display: 'flex', alignItems: 'center', gap: 12,
                    borderColor: selected ? 'var(--accent-raw)' : 'var(--hairline-soft)',
                    boxShadow: selected ? 'none' : 'var(--shadow-card)',
                  }}
                >
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
                      {missing > 0
                        ? <span className="pill pill-warn ml-auto" style={{ fontSize: 10, padding: '1px 6px' }}>{missing} mancant{missing === 1 ? 'e' : 'i'}</span>
                        : <span className="pill pill-ok ml-auto" style={{ fontSize: 10, padding: '1px 6px' }}><CheckCircle2 className="w-3 h-3" /> completo</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detail panel (wide only) */}
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
                        onPicker={() => openPicker(selectedFmt.id, slot.key)}
                        onRemove={() => handleFormatRemove(selectedFmt.id, slot.key)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sheet editor (mobile/iPad portrait) */}
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
                        onPicker={() => openPicker(fmt.id, slot.key)}
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

      <MediaPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={handlePickerSelect} />
    </div>
  );
}
