'use client';

import { useEffect, useState, useCallback } from 'react';
import { SectionHeader } from '@/components/SectionHeader';
import { ModalConfirm } from '@/components/ModalConfirm';
import { getPills, createPill, updatePill, deletePill } from '@/lib/data';
import type { Pill } from '@/lib/data';
import { useToast } from '@/lib/toast';
import {
  Plus,
  ChevronLeft,
  Eye,
  MousePointerClick,
  BellRing,
  Clock,
  BarChart3,
  BookOpen,
  X,
  Check,
  Ban,
  Undo2,
  Pencil,
  Trash2,
  Zap,
  Sparkles,
  Upload,
} from 'lucide-react';

// ── Helpers ──────────────────────────────────────────

function formatDateIT(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateShort(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-yellow-500/10', text: 'text-yellow-500', label: 'Draft' },
  scheduled: { bg: 'bg-blue-500/10', text: 'text-blue-500', label: 'Scheduled' },
  published: { bg: 'bg-green-500/10', text: 'text-green-500', label: 'Published' },
  rejected: { bg: 'bg-red-500/10', text: 'text-red-500', label: 'Rejected' },
};

const categoryConfig: Record<string, { bg: string; text: string }> = {
  flash:  { bg: 'bg-white/10',       text: 'text-white' },
  numeri: { bg: 'bg-cyan-500/10',    text: 'text-cyan-500' },
  rivali: { bg: 'bg-violet-500/10',  text: 'text-violet-400' },
  storia: { bg: 'bg-amber-500/10',   text: 'text-amber-500' },
};

const typeLabels: Record<string, string> = {
  stat: 'Stat',
  update: 'Update',
  quote: 'Quote',
  clip: 'Clip',
  trivia: 'Trivia',
};

const PILL_TYPES = ['stat', 'update', 'quote', 'clip', 'trivia'] as const;
const PILL_CATEGORIES = ['numeri', 'flash', 'rivali', 'storia'] as const;

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] || { bg: 'bg-muted', text: 'text-muted-foreground', label: status };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.bg} ${cfg.text}`}>
      <span className="w-1 h-1 rounded-full bg-current mr-1.5" />
      {cfg.label}
    </span>
  );
}

function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return <span className="text-xs text-muted-foreground">-</span>;
  const cfg = categoryConfig[category] || { bg: 'bg-muted', text: 'text-muted-foreground' };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.bg} ${cfg.text}`}>
      {category.toUpperCase()}
    </span>
  );
}

// ── Dashboard KPI cards ─────────────────────────────

function PillsDashboard({ pills }: { pills: Pill[] }) {
  const draftCount = pills.filter(p => p.status === 'draft').length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const publishedToday = pills.filter(p => {
    if (p.status !== 'published' || !p.published_at) return false;
    const d = new Date(p.published_at);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  }).length;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentPills = pills.filter(p => {
    if (!p.published_at) return false;
    return new Date(p.published_at) >= sevenDaysAgo && p.impressions > 0;
  });
  const avgCTR = recentPills.length > 0
    ? recentPills.reduce((acc, p) => acc + (p.views / p.impressions), 0) / recentPills.length * 100
    : 0;

  const cards = [
    { label: 'Da approvare', value: draftCount, color: draftCount > 0 ? 'text-yellow-500' : 'text-foreground' },
    { label: 'Pubblicate oggi', value: publishedToday, color: 'text-green-500' },
    { label: 'CTR medio (7gg)', value: avgCTR > 0 ? `${avgCTR.toFixed(1)}%` : '-', color: 'text-foreground' },
  ];

  return (
    <div className="grid grid-cols-3 gap-3 mb-6">
      {cards.map(c => (
        <div key={c.label} className="bg-card border border-border rounded-lg p-3">
          <span className="text-xs text-muted-foreground">{c.label}</span>
          <div className={`text-xl font-semibold mt-0.5 ${c.color}`}>{c.value}</div>
        </div>
      ))}
    </div>
  );
}

// ── Pill Form (create / edit) ───────────────────────

interface PillFormProps {
  initial?: Partial<Pill>;
  onSave: (data: Partial<Pill>) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}

function PillForm({ initial, onSave, onCancel, saving }: PillFormProps) {
  const [title, setTitle] = useState(initial?.title || '');
  const [content, setContent] = useState(initial?.content || '');
  const [type, setType] = useState<string>(initial?.type || 'update');
  const [pillCategory, setPillCategory] = useState(initial?.pill_category || '');
  const [scheduledAt, setScheduledAt] = useState(() => {
    if (!initial?.scheduled_at) return '';
    const d = new Date(initial.scheduled_at);
    // Convert to local datetime string for the input
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  });
  const [imageUrl, setImageUrl] = useState(initial?.image_url || '');
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
      if (!res.ok || !payload.url) {
        throw new Error(payload.error || `Upload fallito (${res.status})`);
      }
      setImageUrl(payload.url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Errore upload');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({
      title,
      content,
      type: type as Pill['type'],
      pill_category: pillCategory || null,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      image_url: imageUrl || null,
    });
  };

  const inputCls = 'w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary';
  const labelCls = 'block text-xs font-medium text-muted-foreground mb-1';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={labelCls}>Titolo *</label>
        <input
          className={inputCls}
          value={title}
          onChange={e => setTitle(e.target.value)}
          maxLength={60}
          required
          placeholder="Max 60 caratteri, con emoji iniziale"
        />
        <span className="text-[10px] text-muted-foreground mt-0.5 block">{title.length}/60</span>
      </div>

      <div>
        <label className={labelCls}>Contenuto *</label>
        <textarea
          className={`${inputCls} min-h-[120px] resize-y`}
          value={content}
          onChange={e => setContent(e.target.value)}
          required
          placeholder="Corpo della pill"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Tipo *</label>
          <select className={inputCls} value={type} onChange={e => setType(e.target.value)}>
            {PILL_TYPES.map(t => (
              <option key={t} value={t}>{typeLabels[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Categoria</label>
          <select className={inputCls} value={pillCategory} onChange={e => setPillCategory(e.target.value)}>
            <option value="">-- nessuna --</option>
            {PILL_CATEGORIES.map(c => (
              <option key={c} value={c}>{c.toUpperCase()}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>Pubblicazione programmata</label>
        <input
          type="datetime-local"
          className={inputCls}
          value={scheduledAt}
          onChange={e => setScheduledAt(e.target.value)}
        />
      </div>

      <div>
        <label className={labelCls}>Immagine di riferimento</label>
        <div className="space-y-2">
          {imageUrl && (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt=""
                className="rounded-lg max-h-40 w-auto border border-border"
              />
              <button
                type="button"
                onClick={() => setImageUrl('')}
                className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-1 hover:bg-black"
                aria-label="Rimuovi immagine"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <label
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-border cursor-pointer hover:bg-muted/40 ${uploadingImage ? 'opacity-60 pointer-events-none' : ''}`}
            >
              <Upload className="w-3.5 h-3.5" />
              {uploadingImage ? 'Caricamento…' : imageUrl ? 'Sostituisci immagine' : 'Carica immagine'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImagePick}
              />
            </label>
            <input
              className={`${inputCls} flex-1`}
              value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
              placeholder="o incolla URL..."
            />
          </div>
          {uploadError && <span className="text-xs text-red-500">{uploadError}</span>}
          <span className="text-[10px] text-muted-foreground">
            Qualsiasi formato (JPEG/PNG/HEIC) — convertito in WebP e salvato su R2.
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? 'Salvataggio...' : 'Salva'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-foreground hover:bg-muted rounded-lg"
        >
          Annulla
        </button>
      </div>
    </form>
  );
}

// ── Pill Detail View ────────────────────────────────

interface PillDetailProps {
  pill: Pill;
  onBack: () => void;
  onAction: (action: 'approve' | 'reject' | 'cancel' | 'edit' | 'delete' | 'publish') => void;
}

function PillDetail({ pill, onBack, onAction }: PillDetailProps) {
  const ctr = pill.impressions > 0 ? ((pill.views / pill.impressions) * 100).toFixed(1) : '-';
  const avgReadTime = pill.total_reads > 0 ? Math.round(pill.total_read_time_ms / pill.total_reads / 1000) : 0;

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="w-4 h-4" /> Torna alla lista
      </button>

      <div className="bg-card border border-border rounded-lg p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={pill.status} />
              <CategoryBadge category={pill.pill_category} />
              <span className="text-[11px] text-muted-foreground">{typeLabels[pill.type] || pill.type}</span>
            </div>
            <h3 className="text-lg font-semibold text-foreground break-words">{pill.title}</h3>
          </div>
        </div>

        <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{pill.content}</p>

        {pill.image_url && (
          <img
            src={pill.image_url}
            alt=""
            className="rounded-lg max-h-48 object-cover border border-border"
          />
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="text-muted-foreground">Generata da: <span className="text-foreground">{pill.generated_by}</span></div>
          <div className="text-muted-foreground">Creata: <span className="text-foreground">{formatDateIT(pill.created_at)}</span></div>
          <div className="text-muted-foreground">Programmata: <span className="text-foreground">{formatDateIT(pill.scheduled_at)}</span></div>
          <div className="text-muted-foreground">Pubblicata: <span className="text-foreground">{formatDateIT(pill.published_at)}</span></div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { icon: Eye, label: 'Impressions', value: pill.impressions.toLocaleString('it-IT') },
          { icon: BookOpen, label: 'Views', value: pill.views.toLocaleString('it-IT') },
          { icon: MousePointerClick, label: 'Clicks', value: pill.clicks.toLocaleString('it-IT') },
          { icon: BellRing, label: 'Da push', value: pill.opened_from_push.toLocaleString('it-IT') },
          { icon: BarChart3, label: 'CTR', value: ctr === '-' ? '-' : `${ctr}%` },
          { icon: Clock, label: 'Avg read', value: avgReadTime > 0 ? `${avgReadTime}s` : '-' },
        ].map(m => (
          <div key={m.label} className="bg-card border border-border rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <m.icon className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">{m.label}</span>
            </div>
            <span className="text-base font-semibold text-foreground">{m.value}</span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        {pill.status === 'draft' && (
          <>
            <button
              onClick={() => onAction('approve')}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700"
            >
              <Check className="w-4 h-4" /> Approva
            </button>
            <button
              onClick={() => onAction('publish')}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              <Zap className="w-4 h-4" /> Pubblica ora
            </button>
            <button
              onClick={() => onAction('reject')}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700"
            >
              <Ban className="w-4 h-4" /> Rifiuta
            </button>
          </>
        )}
        {pill.status === 'scheduled' && (
          <>
            <button
              onClick={() => onAction('publish')}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              <Zap className="w-4 h-4" /> Pubblica ora
            </button>
            <button
              onClick={() => onAction('cancel')}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-muted"
            >
              <Undo2 className="w-4 h-4" /> Torna draft
            </button>
          </>
        )}
        {pill.status === 'published' && (
          <button
            onClick={() => onAction('cancel')}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-muted"
          >
            <Undo2 className="w-4 h-4" /> Depubblica
          </button>
        )}

        {/* Modifica e Elimina sempre visibili */}
        <button
          onClick={() => onAction('edit')}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Pencil className="w-4 h-4" /> Modifica
        </button>
        <button
          onClick={() => onAction('delete')}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-red-600/30 text-red-500 hover:bg-red-600/10"
        >
          <Trash2 className="w-4 h-4" /> Elimina
        </button>
      </div>
    </div>
  );
}

// ── Gemini Generate Modal ───────────────────────────

interface GenerateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (pillId: string) => void;
}

function GenerateModal({ open, onClose, onCreated }: GenerateModalProps) {
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState<typeof PILL_CATEGORIES[number]>('flash');
  const [type, setType] = useState<typeof PILL_TYPES[number]>('update');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  if (!open) return null;

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setError('Inserisci un topic');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/console/pills/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), category, type }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.pill?.id) {
        throw new Error(payload.error || `HTTP ${res.status}`);
      }
      showToast('success', 'Pill generata (draft)');
      setTopic('');
      onCreated(payload.pill.id as string);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore sconosciuto');
    } finally {
      setGenerating(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary';
  const labelCls = 'block text-xs font-medium text-muted-foreground mb-1';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl p-5 w-full max-w-md space-y-4 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="text-base font-semibold text-foreground">Genera con Gemini</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <label className={labelCls}>Topic / notizia</label>
          <textarea
            className={`${inputCls} min-h-[80px] resize-y`}
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="es. 'Infortunio di Sturaro', oppure 'Classifica girone C dopo giornata 30', oppure incolla un titolo di news..."
          />
          <span className="text-[10px] text-muted-foreground">
            Gemini cerca news recenti via Google Search e produce una draft pronta in italiano.
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Categoria</label>
            <select
              className={inputCls}
              value={category}
              onChange={e => setCategory(e.target.value as typeof category)}
            >
              {PILL_CATEGORIES.map(c => (
                <option key={c} value={c}>{c.toUpperCase()}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Tipo</label>
            <select
              className={inputCls}
              value={type}
              onChange={e => setType(e.target.value as typeof type)}
            >
              {PILL_TYPES.map(t => (
                <option key={t} value={t}>{typeLabels[t]}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="text-xs text-red-500 bg-red-500/10 rounded-lg p-2 border border-red-500/20">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm text-foreground hover:bg-muted/40 rounded-lg"
          >
            Annulla
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating || !topic.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {generating ? 'Generazione…' : 'Genera'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────

type View = 'list' | 'detail' | 'create' | 'edit';

export default function PillsPage() {
  const [pills, setPills] = useState<Pill[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [selectedPill, setSelectedPill] = useState<Pill | null>(null);
  const [saving, setSaving] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    variant: 'default' | 'danger';
    onConfirm: () => void;
  }>({ open: false, title: '', message: '', variant: 'default', onConfirm: () => {} });

  // Filters
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterGeneratedBy, setFilterGeneratedBy] = useState('');
  const [search, setSearch] = useState('');

  const { showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getPills();
    setPills(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filtered & sorted: drafts first, then by created_at desc
  const filtered = pills.filter(p => {
    if (filterStatus && p.status !== filterStatus) return false;
    if (filterCategory && p.pill_category !== filterCategory) return false;
    if (filterGeneratedBy && p.generated_by !== filterGeneratedBy) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.title.toLowerCase().includes(q) && !p.content.toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    // Drafts always on top
    if (a.status === 'draft' && b.status !== 'draft') return -1;
    if (a.status !== 'draft' && b.status === 'draft') return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const handleApprove = async (pill: Pill) => {
    setSaving(true);
    try {
      await updatePill(pill.id, { status: 'scheduled' });
      showToast('success', 'Pill approvata e programmata');
      await load();
      setView('list');
      setSelectedPill(null);
    } catch (e) {
      showToast('error', (e as Error).message);
    }
    setSaving(false);
  };

  const handleReject = async (pill: Pill) => {
    setSaving(true);
    try {
      await updatePill(pill.id, { status: 'rejected' });
      showToast('success', 'Pill rifiutata');
      await load();
      setView('list');
      setSelectedPill(null);
    } catch (e) {
      showToast('error', (e as Error).message);
    }
    setSaving(false);
  };

  const handleCancelScheduled = async (pill: Pill) => {
    setSaving(true);
    try {
      await updatePill(pill.id, { status: 'draft' });
      showToast('success', 'Pill tornata in draft');
      await load();
      setView('list');
      setSelectedPill(null);
    } catch (e) {
      showToast('error', (e as Error).message);
    }
    setSaving(false);
  };

  const handleCreate = async (data: Partial<Pill>) => {
    setSaving(true);
    try {
      await createPill(data);
      showToast('success', 'Pill creata');
      await load();
      setView('list');
    } catch (e) {
      showToast('error', (e as Error).message);
    }
    setSaving(false);
  };

  const handleEdit = async (data: Partial<Pill>) => {
    if (!selectedPill) return;
    setSaving(true);
    try {
      await updatePill(selectedPill.id, data);
      showToast('success', 'Pill aggiornata');
      await load();
      setView('list');
      setSelectedPill(null);
    } catch (e) {
      showToast('error', (e as Error).message);
    }
    setSaving(false);
  };

  const handlePublish = async (pill: Pill) => {
    setSaving(true);
    try {
      await updatePill(pill.id, { status: 'published' });
      showToast('success', 'Pill pubblicata');
      await load();
      setView('list');
      setSelectedPill(null);
    } catch (e) {
      showToast('error', (e as Error).message);
    }
    setSaving(false);
  };

  const handleDelete = async (pill: Pill) => {
    setSaving(true);
    try {
      await deletePill(pill.id);
      showToast('success', 'Pill eliminata');
      await load();
      setView('list');
      setSelectedPill(null);
    } catch (e) {
      showToast('error', (e as Error).message);
    }
    setSaving(false);
  };

  const handleDetailAction = (pill: Pill, action: 'approve' | 'reject' | 'cancel' | 'edit' | 'delete' | 'publish') => {
    if (action === 'edit') {
      setSelectedPill(pill);
      setView('edit');
      return;
    }
    if (action === 'approve') {
      setConfirmModal({
        open: true,
        title: 'Approva Pill',
        message: `Approvare "${pill.title}"? Verra\' programmata per la pubblicazione.`,
        variant: 'default',
        onConfirm: () => { setConfirmModal(m => ({ ...m, open: false })); handleApprove(pill); },
      });
      return;
    }
    if (action === 'reject') {
      setConfirmModal({
        open: true,
        title: 'Rifiuta Pill',
        message: `Rifiutare "${pill.title}"? Non verra\' mai pubblicata.`,
        variant: 'danger',
        onConfirm: () => { setConfirmModal(m => ({ ...m, open: false })); handleReject(pill); },
      });
      return;
    }
    if (action === 'cancel') {
      setConfirmModal({
        open: true,
        title: 'Annulla programmazione',
        message: `Riportare "${pill.title}" in draft?`,
        variant: 'default',
        onConfirm: () => { setConfirmModal(m => ({ ...m, open: false })); handleCancelScheduled(pill); },
      });
      return;
    }
    if (action === 'publish') {
      setConfirmModal({
        open: true,
        title: 'Pubblica ora',
        message: `Pubblicare "${pill.title}" immediatamente?`,
        variant: 'default',
        onConfirm: () => { setConfirmModal(m => ({ ...m, open: false })); handlePublish(pill); },
      });
      return;
    }
    if (action === 'delete') {
      setConfirmModal({
        open: true,
        title: 'Elimina Pill',
        message: `Eliminare "${pill.title}"? Questa azione e\' irreversibile.`,
        variant: 'danger',
        onConfirm: () => { setConfirmModal(m => ({ ...m, open: false })); handleDelete(pill); },
      });
    }
  };

  // ── Render ──

  if (view === 'detail' && selectedPill) {
    // Refresh selected pill from loaded data
    const fresh = pills.find(p => p.id === selectedPill.id) || selectedPill;
    return (
      <div className="space-y-6">
        <SectionHeader title="Dettaglio Pill" />
        <PillDetail
          pill={fresh}
          onBack={() => { setView('list'); setSelectedPill(null); }}
          onAction={(action) => handleDetailAction(fresh, action)}
        />
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
      </div>
    );
  }

  if (view === 'create') {
    return (
      <div className="space-y-6">
        <SectionHeader title="Nuova Pill" />
        <button
          onClick={() => setView('list')}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-4 h-4" /> Torna alla lista
        </button>
        <div className="bg-card border border-border rounded-lg p-5">
          <PillForm onSave={handleCreate} onCancel={() => setView('list')} saving={saving} />
        </div>
      </div>
    );
  }

  if (view === 'edit' && selectedPill) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Modifica Pill" />
        <button
          onClick={() => { setView('detail'); }}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-4 h-4" /> Torna al dettaglio
        </button>
        <div className="bg-card border border-border rounded-lg p-5">
          <PillForm initial={selectedPill} onSave={handleEdit} onCancel={() => setView('detail')} saving={saving} />
        </div>
      </div>
    );
  }

  // ── LIST VIEW ──

  const selectCls = 'px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary';

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Pillole"
        description="Gestisci le pills generate automaticamente e crea contenuti manuali"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setGenerateOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-muted/40"
            >
              <Sparkles className="w-4 h-4" /> Genera con Gemini
            </button>
            <button
              onClick={() => setView('create')}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="w-4 h-4" /> Nuova Pill
            </button>
          </div>
        }
      />

      <PillsDashboard pills={pills} />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <input
            type="text"
            placeholder="Cerca titolo o contenuto..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-3 pr-8 py-1.5 bg-card border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <select className={selectCls} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Tutti gli stati</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="published">Published</option>
          <option value="rejected">Rejected</option>
        </select>
        <select className={selectCls} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="">Tutte le categorie</option>
          {PILL_CATEGORIES.map(c => (
            <option key={c} value={c}>{c.toUpperCase()}</option>
          ))}
        </select>
        <select className={selectCls} value={filterGeneratedBy} onChange={e => setFilterGeneratedBy(e.target.value)}>
          <option value="">Tutti i generatori</option>
          <option value="gemini">Gemini (auto)</option>
          <option value="gemini-manual">Gemini (manuale)</option>
          <option value="history">History</option>
          <option value="manual">Manuale</option>
        </select>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-sm text-muted-foreground text-center py-8">Caricamento...</div>
      )}

      {/* Mobile cards */}
      {!loading && (
        <div className="md:hidden space-y-3">
          {filtered.map(pill => (
            <div
              key={pill.id}
              onClick={() => { setSelectedPill(pill); setView('detail'); }}
              className="bg-card border border-border rounded-lg p-3 space-y-2 cursor-pointer active:scale-[0.99]"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={pill.status} />
                <CategoryBadge category={pill.pill_category} />
                <span className="text-[10px] text-muted-foreground ml-auto">{typeLabels[pill.type] || pill.type}</span>
              </div>
              <div className="text-sm font-medium text-foreground line-clamp-1">{pill.title}</div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{pill.generated_by}</span>
                <span>{formatDateShort(pill.scheduled_at || pill.created_at)}</span>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="bg-card border border-border rounded-lg p-6 text-center text-sm text-muted-foreground">
              Nessuna pill trovata
            </div>
          )}
        </div>
      )}

      {/* Desktop table */}
      {!loading && (
        <div className="hidden md:block border border-border rounded-lg overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-[100px]">Stato</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-[80px]">Cat.</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Titolo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-[70px]">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-[140px]">Programmata</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-[90px]">Generata</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(pill => (
                <tr
                  key={pill.id}
                  onClick={() => { setSelectedPill(pill); setView('detail'); }}
                  className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3"><StatusBadge status={pill.status} /></td>
                  <td className="px-4 py-3"><CategoryBadge category={pill.pill_category} /></td>
                  <td className="px-4 py-3 text-sm text-foreground max-w-0 truncate">{pill.title}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{typeLabels[pill.type] || pill.type}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{formatDateShort(pill.scheduled_at)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{pill.generated_by}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Nessuna pill trovata
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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

      <GenerateModal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onCreated={async (pillId) => {
          await load();
          const fresh = (await getPills()).find(p => p.id === pillId);
          if (fresh) {
            setSelectedPill(fresh);
            setView('detail');
          }
        }}
      />
    </div>
  );
}
