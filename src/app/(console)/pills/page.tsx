'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ModalConfirm } from '@/components/ModalConfirm';
import { getPills, createPill, updatePill, deletePill } from '@/lib/data';
import type { Pill } from '@/lib/data';
import { useToast } from '@/lib/toast';
import {
  Plus, X, Check, Ban, Undo2, Pencil, Trash2, Zap, Sparkles, Upload,
  AlertTriangle, Rss, ExternalLink, Search, Eye, BookOpen, Clock, BellRing,
  MousePointerClick, BarChart3, ChevronLeft, Filter, ImagePlus, RefreshCw,
} from 'lucide-react';

/* ==================================================================
   Config
   ================================================================== */
const PILL_TYPES      = ['stat', 'update', 'quote', 'clip', 'trivia'] as const;
const PILL_CATEGORIES = ['numeri', 'flash', 'rivali', 'storia'] as const;

const typeLabels: Record<string, string> = {
  stat: 'Stat', update: 'Update', quote: 'Quote', clip: 'Clip', trivia: 'Trivia',
};

function statusPill(status: string): { cls: string; label: string } {
  switch (status) {
    case 'draft':     return { cls: 'pill pill-warn',   label: 'Draft' };
    case 'scheduled': return { cls: 'pill pill-info',   label: 'Programmata' };
    case 'published': return { cls: 'pill pill-ok',     label: 'Pubblicata' };
    case 'rejected':  return { cls: 'pill pill-err',    label: 'Rifiutata' };
    default:          return { cls: 'pill',             label: status };
  }
}

function categoryPill(c: string | null): { cls: string; label: string } | null {
  if (!c) return null;
  return { cls: 'pill pill-accent', label: c.toUpperCase() };
}

function fmtDateIT(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDateShort(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/* ==================================================================
   Swipe hook — pointer events, reveals actions on horizontal drag
   ================================================================== */
type SwipeDir = 'left' | 'right' | null;

function useSwipe(onSwipe: (dir: 'left' | 'right') => void, opts?: { threshold?: number }) {
  const threshold = opts?.threshold ?? 88;
  const surfaceRef = useRef<HTMLDivElement>(null);
  const startX = useRef<number>(0);
  const deltaX = useRef<number>(0);
  const dragging = useRef<boolean>(false);
  const [revealed, setRevealed] = useState<SwipeDir>(null);

  const onDown = (e: React.PointerEvent) => {
    // Ignore if tap landed on action buttons
    if ((e.target as HTMLElement).closest('[data-swipe-action]')) return;
    dragging.current = true;
    startX.current = e.clientX;
    deltaX.current = 0;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    deltaX.current = e.clientX - startX.current;
    // Only track horizontal swipes; let vertical pass through
    if (Math.abs(deltaX.current) > 8 && surfaceRef.current) {
      const x = Math.max(-140, Math.min(140, deltaX.current));
      surfaceRef.current.style.transform = `translateX(${x}px)`;
    }
  };
  const onUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const dx = deltaX.current;
    if (surfaceRef.current) {
      surfaceRef.current.style.transform = '';
    }
    if (Math.abs(dx) > threshold) {
      const dir: 'left' | 'right' = dx > 0 ? 'right' : 'left';
      setRevealed(dir);
      onSwipe(dir);
      // auto snap back after small delay
      setTimeout(() => setRevealed(null), 480);
    } else {
      setRevealed(null);
    }
  };

  return { surfaceRef, revealed, handlers: { onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp } };
}

/* ==================================================================
   Swipeable pill card (mobile-first). On wide viewports swipe is disabled
   because master-detail takes over. A tap selects the pill.
   ================================================================== */
function PillRow({
  pill, selected, enableSwipe, onSelect, onApprove, onReject,
}: {
  pill: Pill;
  selected: boolean;
  enableSwipe: boolean;
  onSelect: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const swipe = useSwipe((dir) => {
    if (dir === 'right') onApprove();
    else onReject();
  });

  const st = statusPill(pill.status);
  const cat = categoryPill(pill.pill_category);
  const canSwipe = enableSwipe && pill.status === 'draft';

  return (
    <div
      className="swipe-row card"
      style={{ boxShadow: 'none', border: selected ? '1px solid var(--accent-raw)' : '1px solid var(--hairline-soft)', borderRadius: 'var(--r)' }}
      data-swiped={swipe.revealed ?? undefined}
    >
      {/* Actions revealed on swipe */}
      {canSwipe && (
        <div className="swipe-actions">
          <button
            data-swipe-action
            aria-label="Rifiuta"
            className="swipe-action swipe-action-reject"
            onClick={onReject}
          >
            <Ban className="w-5 h-5 mr-1" />
            Rifiuta
          </button>
          <button
            data-swipe-action
            aria-label="Approva"
            className="swipe-action swipe-action-approve"
            onClick={onApprove}
          >
            <Check className="w-5 h-5 mr-1" />
            Approva
          </button>
        </div>
      )}
      <div
        ref={swipe.surfaceRef}
        className="swipe-row-surface"
        onClick={onSelect}
        style={{ cursor: 'pointer', padding: 14 }}
        {...(canSwipe ? swipe.handlers : {})}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className={st.cls}>{st.label}</span>
          {cat && <span className={cat.cls}>{cat.label}</span>}
          {pill.audit_flags && pill.audit_flags.length > 0 && (
            <span className="pill pill-warn">
              <AlertTriangle className="w-3 h-3" /> review
            </span>
          )}
          <span className="typ-micro ml-auto">{typeLabels[pill.type] || pill.type}</span>
        </div>
        <div className="typ-label truncate-2 mt-2" style={{ fontSize: 16 }}>{pill.title}</div>
        {pill.content && (
          <div className="typ-caption truncate-2 mt-1">{pill.content}</div>
        )}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-[color:var(--hairline-soft)]">
          <span className="typ-caption">{pill.generated_by}</span>
          <span className="typ-caption">{fmtDateShort(pill.scheduled_at || pill.created_at)}</span>
        </div>
      </div>
    </div>
  );
}

/* ==================================================================
   Pill Detail (side panel on wide, bottom sheet on mobile)
   ================================================================== */
function PillDetail({
  pill, onClose, onAction, saving,
}: {
  pill: Pill;
  onClose: () => void;
  onAction: (action: 'approve' | 'reject' | 'cancel' | 'edit' | 'delete' | 'publish' | 'generate-cover') => void;
  saving: boolean;
}) {
  const st = statusPill(pill.status);
  const cat = categoryPill(pill.pill_category);
  const ctr = pill.impressions > 0 ? ((pill.views / pill.impressions) * 100).toFixed(1) : '-';
  const avgReadTime = pill.total_reads > 0 ? Math.round(pill.total_read_time_ms / pill.total_reads / 1000) : 0;

  return (
    <div className="vstack" style={{ gap: 'var(--s5)' }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="typ-micro">Pill · {typeLabels[pill.type] || pill.type}</div>
          <h2 className="typ-h1 mt-1">{pill.title}</h2>
        </div>
        <button className="btn btn-quiet btn-icon btn-sm" onClick={onClose} aria-label="Chiudi">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className={st.cls}>{st.label}</span>
        {cat && <span className={cat.cls}>{cat.label}</span>}
      </div>

      {pill.audit_flags && pill.audit_flags.length > 0 && (
        <div className="card" style={{ background: 'color-mix(in oklab, var(--warn) 8%, var(--card))', borderColor: 'color-mix(in oklab, var(--warn) 28%, transparent)' }}>
          <div className="card-body flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0" style={{ color: 'var(--warn)' }} />
            <div>
              <div className="typ-label" style={{ color: 'var(--warn)' }}>Review consigliata</div>
              <div className="typ-caption mt-1">
                Nomi non presenti nel roster Catania né negli articoli sorgente:{' '}
                <strong>{pill.audit_flags.map(f => f.term).join(', ')}</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card card-body">
        <p className="typ-body" style={{ whiteSpace: 'pre-wrap' }}>{pill.content}</p>
        {pill.source_attribution && (
          <div className="pill mt-3">
            <span className="typ-micro">Fonte</span> {pill.source_attribution}
          </div>
        )}
        {pill.image_url && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={pill.image_url} alt="" className="w-full rounded-[var(--r)] mt-3" style={{ maxHeight: 260, objectFit: 'cover' }} />
        )}
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: Eye, label: 'Impressions', value: pill.impressions.toLocaleString('it-IT') },
          { icon: BookOpen, label: 'Views', value: pill.views.toLocaleString('it-IT') },
          { icon: MousePointerClick, label: 'Clicks', value: pill.clicks.toLocaleString('it-IT') },
          { icon: BellRing, label: 'Da push', value: pill.opened_from_push.toLocaleString('it-IT') },
          { icon: BarChart3, label: 'CTR', value: ctr === '-' ? '-' : `${ctr}%` },
          { icon: Clock, label: 'Avg read', value: avgReadTime > 0 ? `${avgReadTime}s` : '-' },
        ].map(m => {
          const Ic = m.icon;
          return (
            <div key={m.label} className="card card-body">
              <div className="flex items-center gap-1.5 mb-1">
                <Ic className="w-[14px] h-[14px] text-[color:var(--text-muted)]" strokeWidth={1.75} />
                <span className="typ-micro truncate">{m.label}</span>
              </div>
              <div className="typ-label" style={{ fontSize: 16, fontWeight: 600 }}>{m.value}</div>
            </div>
          );
        })}
      </div>

      {/* Timestamps */}
      <div className="card card-body grid grid-cols-2 gap-x-3 gap-y-2">
        <div>
          <div className="typ-micro">Generata da</div>
          <div className="typ-label mt-0.5">{pill.generated_by}</div>
        </div>
        <div>
          <div className="typ-micro">Creata</div>
          <div className="typ-label mt-0.5">{fmtDateIT(pill.created_at)}</div>
        </div>
        <div>
          <div className="typ-micro">Programmata</div>
          <div className="typ-label mt-0.5">{fmtDateIT(pill.scheduled_at)}</div>
        </div>
        <div>
          <div className="typ-micro">Pubblicata</div>
          <div className="typ-label mt-0.5">{fmtDateIT(pill.published_at)}</div>
        </div>
      </div>

      {/* Cover AI — solo per draft. Apre file picker → upload foto soggetto → Nano Banana */}
      {pill.status === 'draft' && (
        <button
          className="btn btn-ghost"
          disabled={saving}
          onClick={() => onAction('generate-cover')}
          title="Scegli una foto del soggetto e genera la cover con Nano Banana"
        >
          {pill.image_url ? <RefreshCw className="w-4 h-4" /> : <ImagePlus className="w-4 h-4" />}
          {pill.image_url ? 'Rigenera cover (scegli foto)' : 'Genera cover (scegli foto)'}
        </button>
      )}

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        {pill.status === 'draft' && (
          <>
            <button className="btn btn-primary" disabled={saving} onClick={() => onAction('approve')}>
              <Check className="w-4 h-4" /> Approva
            </button>
            <button className="btn btn-ghost" disabled={saving} onClick={() => onAction('publish')}>
              <Zap className="w-4 h-4" /> Pubblica ora
            </button>
            <button className="btn btn-danger col-span-2" disabled={saving} onClick={() => onAction('reject')}>
              <Ban className="w-4 h-4" /> Rifiuta
            </button>
          </>
        )}
        {pill.status === 'scheduled' && (
          <>
            <button className="btn btn-primary" disabled={saving} onClick={() => onAction('publish')}>
              <Zap className="w-4 h-4" /> Pubblica
            </button>
            <button className="btn btn-ghost" disabled={saving} onClick={() => onAction('cancel')}>
              <Undo2 className="w-4 h-4" /> Torna draft
            </button>
          </>
        )}
        {pill.status === 'published' && (
          <button className="btn btn-ghost col-span-2" disabled={saving} onClick={() => onAction('cancel')}>
            <Undo2 className="w-4 h-4" /> Depubblica
          </button>
        )}
        {pill.status === 'rejected' && (
          <>
            <button className="btn btn-primary" disabled={saving} onClick={() => onAction('approve')}>
              <Check className="w-4 h-4" /> Approva
            </button>
            <button className="btn btn-ghost" disabled={saving} onClick={() => onAction('cancel')}>
              <Undo2 className="w-4 h-4" /> Riapri (in draft)
            </button>
          </>
        )}
        <button className="btn btn-ghost" disabled={saving} onClick={() => onAction('edit')}>
          <Pencil className="w-4 h-4" /> Modifica
        </button>
        <button className="btn btn-danger" disabled={saving} onClick={() => onAction('delete')}>
          <Trash2 className="w-4 h-4" /> Elimina
        </button>
      </div>
    </div>
  );
}

/* ==================================================================
   Pill Form (create / edit). NO title character limit.
   ================================================================== */
function PillForm({
  initial, onSave, onCancel, saving,
}: {
  initial?: Partial<Pill>;
  onSave: (data: Partial<Pill>) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState(initial?.title || '');
  const [content, setContent] = useState(initial?.content || '');
  const [type, setType] = useState<string>(initial?.type || 'update');
  const [pillCategory, setPillCategory] = useState(initial?.pill_category || '');
  const [scheduledAt, setScheduledAt] = useState(() => {
    if (!initial?.scheduled_at) return '';
    const d = new Date(initial.scheduled_at);
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  });
  const [imageUrl, setImageUrl] = useState(initial?.image_url || '');
  const [sourceAttribution, setSourceAttribution] = useState(initial?.source_attribution || '');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingImage(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('type', 'pill-image');
      fd.append('file', file);
      if (initial?.id) fd.append('pillId', initial.id);
      const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.url) throw new Error(payload.error || `Upload fallito (${res.status})`);
      setImageUrl(payload.url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Errore upload');
    } finally {
      setUploadingImage(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await onSave({
      title,
      content,
      type: type as Pill['type'],
      pill_category: pillCategory || null,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      image_url: imageUrl || null,
      source_attribution: sourceAttribution.trim() || null,
    });
  };

  return (
    <form onSubmit={submit} className="vstack" style={{ gap: 'var(--s5)' }}>
      <div>
        <label className="typ-micro block mb-1.5">Titolo *</label>
        <input
          className="input"
          value={title}
          onChange={e => setTitle(e.target.value)}
          required
          placeholder="Titolo della pill — libero, emoji iniziale consigliata"
        />
        <div className="typ-caption mt-1">{title.length} caratteri</div>
      </div>

      <div>
        <label className="typ-micro block mb-1.5">Contenuto *</label>
        <textarea
          className="textarea"
          value={content}
          onChange={e => setContent(e.target.value)}
          required
          placeholder="Corpo della pill"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="typ-micro block mb-1.5">Tipo *</label>
          <select className="input" value={type} onChange={e => setType(e.target.value)}>
            {PILL_TYPES.map(t => <option key={t} value={t}>{typeLabels[t]}</option>)}
          </select>
        </div>
        <div>
          <label className="typ-micro block mb-1.5">Categoria</label>
          <select className="input" value={pillCategory} onChange={e => setPillCategory(e.target.value)}>
            <option value="">—</option>
            {PILL_CATEGORIES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="typ-micro block mb-1.5">Programmata (opzionale)</label>
        <input type="datetime-local" className="input" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
      </div>

      <div>
        <label className="typ-micro block mb-1.5">Fonte</label>
        <input
          className="input"
          value={sourceAttribution}
          onChange={e => setSourceAttribution(e.target.value)}
          placeholder="es. La Sicilia, Tutto Calcio Catania..."
        />
      </div>

      <div>
        <label className="typ-micro block mb-1.5">Immagine</label>
        <div className="vstack-tight">
          {imageUrl && (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="" className="w-full rounded-[var(--r)] border border-[color:var(--hairline-soft)]" style={{ maxHeight: 240, objectFit: 'cover' }} />
              <button type="button" onClick={() => setImageUrl('')} className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/70 text-white inline-flex items-center justify-center" aria-label="Rimuovi">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <label className={`btn btn-ghost w-full ${uploadingImage ? 'opacity-60 pointer-events-none' : ''}`}>
            <Upload className="w-4 h-4" />
            {uploadingImage ? 'Carico…' : imageUrl ? 'Sostituisci' : 'Carica'}
            <input type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
          </label>
          <input className="input" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="o incolla URL..." />
          {uploadError && <span className="typ-caption" style={{ color: 'var(--danger)' }}>{uploadError}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-2">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Annulla</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvo…' : 'Salva'}</button>
      </div>
    </form>
  );
}

/* ==================================================================
   Gemini generator sheet
   ================================================================== */
function GenerateSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState<typeof PILL_CATEGORIES[number]>('flash');
  const [type, setType] = useState<typeof PILL_TYPES[number]>('update');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const generate = async () => {
    if (!topic.trim()) { setError('Inserisci un topic'); return; }
    setGenerating(true); setError(null);
    try {
      const res = await fetch('/api/console/pills/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), category, type }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.pill?.id) throw new Error(payload.error || `HTTP ${res.status}`);
      showToast('success', 'Pill generata (draft)');
      onCreated(payload.pill.id as string);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-grip" />
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5 text-[color:var(--accent-raw)]" />
          <h2 className="typ-h1 grow">Genera con Gemini</h2>
          <button className="btn btn-quiet btn-icon btn-sm" onClick={onClose} aria-label="Chiudi"><X className="w-4 h-4" /></button>
        </div>
        <div className="vstack" style={{ gap: 'var(--s4)' }}>
          <div>
            <label className="typ-micro block mb-1.5">Topic / notizia</label>
            <textarea
              className="textarea"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="es. Infortunio di Sturaro, Classifica girone C g30..."
              autoFocus
            />
            <div className="typ-caption mt-1">Cerca news recenti e produce una draft in italiano.</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="typ-micro block mb-1.5">Categoria</label>
              <select className="input" value={category} onChange={e => setCategory(e.target.value as typeof category)}>
                {PILL_CATEGORIES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="typ-micro block mb-1.5">Tipo</label>
              <select className="input" value={type} onChange={e => setType(e.target.value as typeof type)}>
                {PILL_TYPES.map(t => <option key={t} value={t}>{typeLabels[t]}</option>)}
              </select>
            </div>
          </div>
          {error && (
            <div className="typ-caption" style={{ color: 'var(--danger)', background: 'color-mix(in oklab, var(--danger) 8%, transparent)', padding: 10, borderRadius: 'var(--r)' }}>{error}</div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
            <button className="btn btn-primary" onClick={generate} disabled={generating || !topic.trim()}>
              <Sparkles className="w-4 h-4" /> {generating ? 'Generazione…' : 'Genera'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ==================================================================
   RSS Sources sheet
   ================================================================== */
interface RssFeed { id: string; slug: string; display_name: string; feed_url: string; priority: number; enabled: boolean; last_fetched_at: string | null; last_article_at: string | null; articles_total: number; notes: string | null; }

function SourcesSheet({ onClose }: { onClose: () => void }) {
  const [feeds, setFeeds] = useState<RssFeed[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dev/pill-sources', { cache: 'no-store' });
      const p = await res.json().catch(() => ({})) as { feeds?: RssFeed[] };
      setFeeds(p.feeds ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (feed: RssFeed) => {
    const updated = feeds.map(f => f.id === feed.id ? { ...f, enabled: !feed.enabled } : f);
    setFeeds(updated);
    const res = await fetch('/api/dev/pill-sources', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: feed.id, enabled: !feed.enabled }) });
    if (!res.ok) { showToast('error', 'Aggiornamento fallito'); load(); }
  };

  const fmt = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso); const h = (Date.now() - d.getTime()) / 3600_000;
    if (h < 24) return `${Math.round(h)}h`;
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-grip" />
        <div className="flex items-center gap-2 mb-3">
          <Rss className="w-5 h-5 text-[color:var(--accent-raw)]" />
          <h2 className="typ-h1 grow">Fonti RSS</h2>
          <button className="btn btn-quiet btn-icon btn-sm" onClick={onClose} aria-label="Chiudi"><X className="w-4 h-4" /></button>
        </div>
        <p className="typ-caption mb-4">Testate monitorate dal generator. Peso 0–3 = priorità alta (contenuto passato intero a Gemini).</p>
        {loading ? (
          <div className="typ-caption text-center py-6">Carico…</div>
        ) : (
          <div className="vstack-tight">
            {feeds.map(feed => (
              <div key={feed.id} className="card card-body" style={{ opacity: feed.enabled ? 1 : 0.55 }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="grow min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Rss className={`w-[14px] h-[14px] ${feed.enabled ? 'text-[color:var(--accent-raw)]' : 'text-[color:var(--text-muted)]'}`} />
                      <span className="typ-label truncate">{feed.display_name}</span>
                      {feed.priority <= 3 && <span className="pill pill-ok" style={{ padding: '1px 6px', fontSize: 10 }}>priorità</span>}
                    </div>
                    <a href={feed.feed_url} target="_blank" rel="noopener noreferrer" className="typ-caption inline-flex items-center gap-1 mt-1 truncate max-w-full">
                      {feed.feed_url}<ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                    <div className="typ-caption mt-1">{feed.articles_total} articoli · ultimo {fmt(feed.last_article_at)}</div>
                  </div>
                  <button
                    onClick={() => toggle(feed)}
                    className={feed.enabled ? 'pill pill-ok' : 'pill'}
                    style={{ cursor: 'pointer' }}
                  >
                    {feed.enabled ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>
            ))}
            {feeds.length === 0 && <div className="typ-caption text-center py-6">Nessuna fonte configurata.</div>}
          </div>
        )}
      </div>
    </>
  );
}

/* ==================================================================
   MAIN PAGE
   ================================================================== */

type View = 'list' | 'create' | 'edit';

export default function PillsPage() {
  const [pills, setPills] = useState<Pill[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPill, setSelectedPill] = useState<Pill | null>(null);
  const [view, setView] = useState<View>('list');
  const [saving, setSaving] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterGeneratedBy, setFilterGeneratedBy] = useState('');
  const [search, setSearch] = useState('');

  // Read ?filter= query param on mount
  useEffect(() => {
    const url = new URL(window.location.href);
    const f = url.searchParams.get('filter');
    if (f === 'draft' || f === 'scheduled' || f === 'published' || f === 'rejected') setFilterStatus(f);
  }, []);

  const [confirmModal, setConfirmModal] = useState<{
    open: boolean; title: string; message: string; variant: 'default' | 'danger'; onConfirm: () => void;
  }>({ open: false, title: '', message: '', variant: 'default', onConfirm: () => {} });

  const { showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getPills();
    setPills(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => pills.filter(p => {
    if (filterStatus && p.status !== filterStatus) return false;
    if (filterCategory && p.pill_category !== filterCategory) return false;
    if (filterGeneratedBy && p.generated_by !== filterGeneratedBy) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.title.toLowerCase().includes(q) && !p.content.toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    if (a.status === 'draft' && b.status !== 'draft') return -1;
    if (a.status !== 'draft' && b.status === 'draft') return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  }), [pills, filterStatus, filterCategory, filterGeneratedBy, search]);

  // Keep selected pill fresh when pills reload
  const freshSelected = selectedPill ? (pills.find(p => p.id === selectedPill.id) || selectedPill) : null;

  // ── Actions ──

  const doUpdate = async (id: string, patch: Partial<Pill>, okMsg: string) => {
    setSaving(true);
    try {
      await updatePill(id, patch);
      showToast('success', okMsg);
      await load();
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const doCreate = async (data: Partial<Pill>) => {
    setSaving(true);
    try {
      await createPill(data);
      showToast('success', 'Pill creata');
      await load();
      setView('list');
    } catch (e) { showToast('error', (e as Error).message); }
    finally { setSaving(false); }
  };

  const doEdit = async (data: Partial<Pill>) => {
    if (!selectedPill) return;
    setSaving(true);
    try {
      await updatePill(selectedPill.id, data);
      showToast('success', 'Aggiornata');
      await load();
      setView('list');
    } catch (e) { showToast('error', (e as Error).message); }
    finally { setSaving(false); }
  };

  const doDelete = async (pill: Pill) => {
    setSaving(true);
    try {
      await deletePill(pill.id);
      showToast('success', 'Eliminata');
      setSelectedPill(null);
      await load();
    } catch (e) { showToast('error', (e as Error).message); }
    finally { setSaving(false); }
  };

  const handleQuickApprove = (pill: Pill) => doUpdate(pill.id, { status: 'scheduled' }, 'Pill approvata');
  const handleQuickReject  = (pill: Pill) => doUpdate(pill.id, { status: 'rejected' }, 'Pill rifiutata');

  const coverFileInputRef = useRef<HTMLInputElement>(null);
  const coverPillRef = useRef<Pill | null>(null);

  const doGenerateCover = async (pill: Pill, file: File) => {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('pill_id', pill.id);
      fd.append('subject', file);
      const res = await fetch('/api/console/pills/cover', { method: 'POST', body: fd });
      const payload = (await res.json().catch(() => ({}))) as { error?: string; image_url?: string };
      if (!res.ok || !payload.image_url) {
        throw new Error(payload.error ?? `Errore HTTP ${res.status}`);
      }
      showToast('success', 'Cover generata');
      await load();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Errore generazione cover');
    } finally {
      setSaving(false);
    }
  };

  const onCoverFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so same file can be re-picked
    const pill = coverPillRef.current;
    coverPillRef.current = null;
    if (!file || !pill) return;
    void doGenerateCover(pill, file);
  };

  const handleAction = (pill: Pill, action: 'approve' | 'reject' | 'cancel' | 'edit' | 'delete' | 'publish' | 'generate-cover') => {
    if (action === 'edit') { setSelectedPill(pill); setView('edit'); return; }
    if (action === 'approve') return setConfirmModal({ open: true, title: 'Approva', message: `Approvare "${pill.title}"? Verrà programmata.`, variant: 'default', onConfirm: () => { setConfirmModal(m => ({ ...m, open: false })); doUpdate(pill.id, { status: 'scheduled' }, 'Approvata'); } });
    if (action === 'reject')  return setConfirmModal({ open: true, title: 'Rifiuta', message: `Rifiutare "${pill.title}"?`, variant: 'danger', onConfirm: () => { setConfirmModal(m => ({ ...m, open: false })); doUpdate(pill.id, { status: 'rejected' }, 'Rifiutata'); } });
    if (action === 'cancel')  return setConfirmModal({ open: true, title: 'Torna draft', message: `Riportare "${pill.title}" in draft?`, variant: 'default', onConfirm: () => { setConfirmModal(m => ({ ...m, open: false })); doUpdate(pill.id, { status: 'draft' }, 'In draft'); } });
    if (action === 'publish') return setConfirmModal({ open: true, title: 'Pubblica ora', message: `Pubblicare "${pill.title}" immediatamente?`, variant: 'default', onConfirm: () => { setConfirmModal(m => ({ ...m, open: false })); doUpdate(pill.id, { status: 'published' }, 'Pubblicata'); } });
    if (action === 'delete')  return setConfirmModal({ open: true, title: 'Elimina', message: `Eliminare "${pill.title}"? Irreversibile.`, variant: 'danger', onConfirm: () => { setConfirmModal(m => ({ ...m, open: false })); doDelete(pill); } });
    if (action === 'generate-cover') {
      coverPillRef.current = pill;
      coverFileInputRef.current?.click();
      return;
    }
  };

  // Master-detail split at >=1024 (iPad landscape + desktop). Below = sheet.
  const [isWide, setIsWide] = useState<boolean>(typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  useEffect(() => {
    const onResize = () => setIsWide(window.innerWidth >= 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const showMobileDetail = !isWide && freshSelected !== null && view === 'list';

  // Count
  const drafts = pills.filter(p => p.status === 'draft').length;

  return (
    <div className="vstack" style={{ gap: 'var(--s5)' }}>

      {/* Hidden file input per "Genera cover AI" */}
      <input
        ref={coverFileInputRef}
        type="file"
        accept="image/*"
        onChange={onCoverFilePicked}
        style={{ display: 'none' }}
      />

      {/* Toolbar — mobile: search fullwidth, buttons row below; wide: single row */}
      <div className="flex items-center gap-2 flex-col sm:flex-row sm:flex-wrap">
        <div className="relative w-full sm:grow" style={{ minWidth: 220 }}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--text-muted)] pointer-events-none" />
          <input
            type="text"
            placeholder="Cerca titolo o contenuto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button className="btn btn-ghost btn-sm" onClick={() => setShowFilters(v => !v)} aria-label="Filtri" title="Filtri">
            <Filter className="w-4 h-4" />
            <span className="hidden md:inline">Filtri</span>
            {(filterStatus || filterCategory || filterGeneratedBy) && <span className="dot dot-warn" />}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSourcesOpen(true)} aria-label="Fonti" title="Fonti RSS">
            <Rss className="w-4 h-4" />
            <span className="hidden md:inline">Fonti</span>
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setGenerateOpen(true)} aria-label="Genera con Gemini" title="Genera con Gemini">
            <Sparkles className="w-4 h-4" />
            <span className="hidden md:inline">Gemini</span>
          </button>
          <button className="btn btn-primary btn-sm grow sm:grow-0" onClick={() => { setSelectedPill(null); setView('create'); }}>
            <Plus className="w-4 h-4" />
            <span>Nuova</span>
          </button>
        </div>
      </div>

      {/* Expandable filters */}
      {showFilters && (
        <div className="card card-body grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="typ-micro block mb-1">Stato</label>
            <select className="input" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">Tutti</option>
              <option value="draft">Draft</option>
              <option value="scheduled">Programmata</option>
              <option value="published">Pubblicata</option>
              <option value="rejected">Rifiutata</option>
            </select>
          </div>
          <div>
            <label className="typ-micro block mb-1">Categoria</label>
            <select className="input" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
              <option value="">Tutte</option>
              {PILL_CATEGORIES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
            </select>
          </div>
          <div>
            <label className="typ-micro block mb-1">Generatore</label>
            <select className="input" value={filterGeneratedBy} onChange={e => setFilterGeneratedBy(e.target.value)}>
              <option value="">Tutti</option>
              <option value="gemini">Gemini</option>
              <option value="gemini-manual">Gemini (manuale)</option>
              <option value="history">History</option>
              <option value="manual">Manuale</option>
            </select>
          </div>
        </div>
      )}

      {/* Hint row (mobile swipe tip) */}
      {!isWide && drafts > 0 && view === 'list' && (
        <div className="typ-caption" style={{ paddingLeft: 4 }}>
          Swipe → per approvare · swipe ← per rifiutare (solo draft).
        </div>
      )}

      {/* Main area: list alone on mobile, master-detail on wide */}
      {view === 'list' && (
        <div className="grid gap-4" style={{ gridTemplateColumns: isWide && freshSelected ? 'minmax(320px, 380px) 1fr' : '1fr' }}>
          {/* LIST */}
          <div className="vstack-tight">
            {loading ? (
              <div className="typ-caption text-center py-6">Carico…</div>
            ) : filtered.length === 0 ? (
              <div className="card card-body text-center">
                <div className="typ-label">Nessuna pill</div>
                <div className="typ-caption mt-1">Prova a rimuovere i filtri o genera con Gemini.</div>
              </div>
            ) : (
              filtered.map(pill => (
                <PillRow
                  key={pill.id}
                  pill={pill}
                  selected={freshSelected?.id === pill.id}
                  enableSwipe={!isWide}
                  onSelect={() => setSelectedPill(pill)}
                  onApprove={() => handleQuickApprove(pill)}
                  onReject={() => handleQuickReject(pill)}
                />
              ))
            )}
          </div>

          {/* DETAIL — wide only, inline */}
          {isWide && freshSelected && (
            <div className="card card-body" style={{ position: 'sticky', top: 80, alignSelf: 'start', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
              <PillDetail
                pill={freshSelected}
                onClose={() => setSelectedPill(null)}
                onAction={(a) => handleAction(freshSelected, a)}
                saving={saving}
              />
            </div>
          )}
        </div>
      )}

      {/* DETAIL sheet — mobile only */}
      {showMobileDetail && freshSelected && (
        <>
          <div className="sheet-backdrop" onClick={() => setSelectedPill(null)} />
          <div className="sheet">
            <div className="sheet-grip" />
            <PillDetail
              pill={freshSelected}
              onClose={() => setSelectedPill(null)}
              onAction={(a) => handleAction(freshSelected, a)}
              saving={saving}
            />
          </div>
        </>
      )}

      {/* CREATE */}
      {view === 'create' && (
        <div className="card card-body">
          <div className="flex items-center gap-2 mb-4">
            <button className="btn btn-quiet btn-icon btn-sm" onClick={() => setView('list')} aria-label="Indietro"><ChevronLeft className="w-4 h-4" /></button>
            <h2 className="typ-h1 grow">Nuova Pill</h2>
          </div>
          <PillForm onSave={doCreate} onCancel={() => setView('list')} saving={saving} />
        </div>
      )}

      {/* EDIT */}
      {view === 'edit' && freshSelected && (
        <div className="card card-body">
          <div className="flex items-center gap-2 mb-4">
            <button className="btn btn-quiet btn-icon btn-sm" onClick={() => setView('list')} aria-label="Indietro"><ChevronLeft className="w-4 h-4" /></button>
            <h2 className="typ-h1 grow">Modifica</h2>
          </div>
          <PillForm initial={freshSelected} onSave={doEdit} onCancel={() => setView('list')} saving={saving} />
        </div>
      )}

      <ModalConfirm
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal(m => ({ ...m, open: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        confirmLabel="Conferma"
        cancelLabel="Annulla"
        isLoading={saving}
      />

      {generateOpen && <GenerateSheet onClose={() => setGenerateOpen(false)} onCreated={async (id) => { await load(); const fresh = pills.find(p => p.id === id); if (fresh) setSelectedPill(fresh); }} />}
      {sourcesOpen  && <SourcesSheet  onClose={() => setSourcesOpen(false)} />}
    </div>
  );
}
