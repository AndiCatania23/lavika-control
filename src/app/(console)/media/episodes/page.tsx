'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, RefreshCw, Search, Film, Eye, EyeOff, ChevronLeft, ChevronRight,
  X, Save, Upload, ImageIcon, Calendar, Trophy, User, Award,
} from 'lucide-react';
import { MediaPicker } from '@/components/media/MediaPicker';
import { uploadFile } from '@/lib/mediaUpload';

/* ──────────────────────────── Types ──────────────────────────── */

interface SupaFormat { id: string; title: string | null; }

interface TeamRef {
  normalized_name: string;
  short_name: string | null;
  logo_url?: string | null;
}

interface MatchRef {
  id: string;
  matchday: number | null;
  kickoff_at: string | null;
  home_team: TeamRef | null;
  away_team: TeamRef | null;
}

interface SpeakerRef {
  id: string;
  full_name: string;
  slug: string | null;
}

interface EpisodeRow {
  id: string;
  video_id: string | null;
  format_id: string;
  title: string | null;
  description: string | null;
  season: string | null;
  published_at: string | null;
  thumbnail_url: string | null;
  min_badge: 'bronze' | 'silver' | 'gold' | null;
  duration_secs: number | null;
  match_id: string | null;
  speaker_id: string | null;
  is_active: boolean;
  hls_url: string | null;
  speaker: SpeakerRef | null;
  match: MatchRef | null;
}

interface MatchPickerItem {
  id: string;
  matchday: number | null;
  kickoff_at: string | null;
  home_team: TeamRef | null;
  away_team: TeamRef | null;
}

interface PlayerLite {
  id: string;
  full_name: string;
  slug: string | null;
}

const PAGE_SIZE = 50;
const BADGES = [
  { value: null,     label: 'Nessuno', color: 'var(--text-muted)' },
  { value: 'bronze', label: 'Bronze',  color: '#cd7f32' },
  { value: 'silver', label: 'Silver',  color: '#9aa3a8' },
  { value: 'gold',   label: 'Gold',    color: '#d4a017' },
] as const;

/* ──────────────────────────── Helpers ──────────────────────────── */

function formatMatchLabel(m: MatchRef | MatchPickerItem | null): string {
  if (!m) return '';
  const home = m.home_team?.short_name ?? m.home_team?.normalized_name ?? 'HOM';
  const away = m.away_team?.short_name ?? m.away_team?.normalized_name ?? 'AWA';
  const date = m.kickoff_at ? new Date(m.kickoff_at) : null;
  const dateLabel = date
    ? `${date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })} ${date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`
    : '';
  return `${home} – ${away}${dateLabel ? ` · ${dateLabel}` : ''}`;
}

function toLocalInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/* ──────────────────────────── Match Picker (modal/sheet) ──────────────────────────── */

function MatchPicker({
  open, onClose, onSelect, currentMatchId,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (m: MatchPickerItem | null) => void;
  currentMatchId: string | null;
}) {
  const [items, setItems] = useState<MatchPickerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSearch('');
    fetch('/api/media/matches?limit=400')
      .then(r => r.ok ? r.json() : { items: [] })
      .then((d: { items: MatchPickerItem[] }) => setItems(d.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(m => {
      const h = m.home_team?.normalized_name?.toLowerCase() ?? '';
      const a = m.away_team?.normalized_name?.toLowerCase() ?? '';
      const md = m.matchday ? `g${m.matchday}` : '';
      return h.includes(q) || a.includes(q) || md.includes(q);
    });
  }, [items, search]);

  if (!open) return null;

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} style={{ zIndex: 70 }} />
      <div className="sheet" style={{ maxHeight: '80vh', zIndex: 71 }}>
        <div className="sheet-grip" />
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-5 h-5 text-[color:var(--accent-raw)]" />
          <h2 className="typ-h1 grow">Collega Match</h2>
          <button onClick={onClose} className="btn btn-quiet btn-icon btn-sm" aria-label="Chiudi"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="relative grow">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca squadra o giornata (es. catania, g12)..." className="input pl-10 w-full" autoFocus />
          </div>
          {currentMatchId && (
            <button onClick={() => { onSelect(null); onClose(); }} className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}>
              <X className="w-3.5 h-3.5" /> Scollega
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-7 h-7 border-2 border-[color:var(--accent-raw)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card card-body text-center">
            <Trophy className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
            <p className="typ-caption">Nessun match.</p>
          </div>
        ) : (
          <div className="vstack-tight" style={{ maxHeight: '55vh', overflowY: 'auto', paddingBottom: 8 }}>
            {filtered.map(m => {
              const isCurrent = m.id === currentMatchId;
              const home = m.home_team?.short_name ?? m.home_team?.normalized_name ?? 'HOM';
              const away = m.away_team?.short_name ?? m.away_team?.normalized_name ?? 'AWA';
              const date = m.kickoff_at ? new Date(m.kickoff_at) : null;
              return (
                <button
                  key={m.id}
                  onClick={() => { onSelect(m); onClose(); }}
                  className="card-hover text-left w-full"
                  style={{
                    padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14,
                    border: `1px solid ${isCurrent ? 'var(--accent-raw)' : 'var(--hairline-soft)'}`,
                    borderRadius: 'var(--r-lg)',
                    background: isCurrent ? 'var(--accent-soft)' : 'var(--card)',
                    boxShadow: 'var(--shadow-card)',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    className="shrink-0 inline-grid place-items-center rounded-[var(--r-sm)]"
                    style={{
                      width: 44, height: 44,
                      background: isCurrent ? 'rgba(255,255,255,0.6)' : 'var(--card-muted)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <span className="typ-micro" style={{ fontWeight: 600, fontSize: 11 }}>G{m.matchday ?? '—'}</span>
                  </div>
                  <div className="grow min-w-0">
                    <div className="typ-label" style={{ fontSize: 15, lineHeight: 1.25 }}>
                      {home} – {away}
                    </div>
                    {date && (
                      <div className="typ-caption" style={{ marginTop: 2, color: 'var(--text-muted)' }}>
                        {date.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short' })}
                        {' · '}
                        {date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </div>
                  {isCurrent && (
                    <span className="pill pill-ok shrink-0" style={{ fontSize: 10, padding: '2px 8px' }}>Collegato</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

/* ──────────────────────────── Drawer (episode editor) ──────────────────────────── */

interface EpisodeDraft {
  title: string;
  description: string;
  is_active: boolean;
  match_id: string | null;
  match_label: string;
  speaker_id: string | null;
  min_badge: 'bronze' | 'silver' | 'gold' | null;
  published_at: string;
  thumbnail_url: string | null;
}

function EpisodeDrawer({
  episode, onClose, onSaved, players,
}: {
  episode: EpisodeRow;
  onClose: () => void;
  onSaved: (updated: Partial<EpisodeRow> & { id: string }) => void;
  players: PlayerLite[];
}) {
  const [draft, setDraft] = useState<EpisodeDraft>({
    title: episode.title ?? '',
    description: episode.description ?? '',
    is_active: episode.is_active,
    match_id: episode.match_id,
    match_label: formatMatchLabel(episode.match),
    speaker_id: episode.speaker_id,
    min_badge: episode.min_badge,
    published_at: toLocalInputValue(episode.published_at),
    thumbnail_url: episode.thumbnail_url,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchPickerOpen, setMatchPickerOpen] = useState(false);
  const [thumbPickerOpen, setThumbPickerOpen] = useState(false);
  const [thumbUploading, setThumbUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof EpisodeDraft>(k: K, v: EpisodeDraft[K]) => setDraft(d => ({ ...d, [k]: v }));

  const handleThumbUpload = async (file: File) => {
    setThumbUploading(true);
    setError(null);
    try {
      const season = (episode.season ?? '').replace(/\//g, '-');
      const url = await uploadFile(file, 'episode-thumbnail', {
        formatId: episode.format_id,
        season,
        episodeId: episode.id,
      });
      set('thumbnail_url', url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload fallito');
    } finally {
      setThumbUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const patch: Record<string, unknown> = {
        title: draft.title.trim() || null,
        description: draft.description.trim() || null,
        is_active: draft.is_active,
        match_id: draft.match_id,
        speaker_id: draft.speaker_id,
        min_badge: draft.min_badge,
        published_at: fromLocalInputValue(draft.published_at),
        thumbnail_url: draft.thumbnail_url,
      };
      const res = await fetch('/api/media/episodes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: episode.id, patch }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onSaved({ id: episode.id, ...patch, ...(data.episode ?? {}) });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Salvataggio fallito');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} style={{ zIndex: 60 }} />
      <div
        className="card card-body"
        style={{
          position: 'fixed',
          top: 0, right: 0, bottom: 0,
          width: 'min(560px, 100vw)',
          maxWidth: '100vw',
          zIndex: 61,
          borderRadius: 0,
          borderLeft: '1px solid var(--hairline)',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-card-hi)',
          display: 'flex', flexDirection: 'column', gap: 'var(--s4)',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2 sticky top-0" style={{ background: 'var(--card)', paddingBottom: 8, borderBottom: '1px solid var(--hairline-soft)', marginInline: 'calc(-1 * var(--s5))', paddingInline: 'var(--s5)', zIndex: 1 }}>
          <div className="min-w-0 grow pt-1">
            <h2 className="typ-h1 truncate">Modifica Episodio</h2>
            <p className="typ-micro typ-mono truncate" style={{ color: 'var(--text-muted)' }}>{episode.video_id ?? episode.id}</p>
          </div>
          <button onClick={onClose} className="btn btn-quiet btn-icon btn-sm" aria-label="Chiudi"><X className="w-4 h-4" /></button>
        </div>

        {/* Thumbnail preview + actions */}
        <div className="vstack-tight">
          <label className="typ-label">Thumbnail</label>
          <div
            className="relative aspect-video rounded-[var(--r)] overflow-hidden cursor-pointer"
            style={{ background: 'var(--card-muted)', border: '1px dashed var(--hairline)' }}
            onClick={() => !thumbUploading && fileRef.current?.click()}
          >
            {draft.thumbnail_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={draft.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1" style={{ color: 'var(--text-muted)' }}>
                <ImageIcon className="w-6 h-6" />
                <span className="typ-caption">Nessuna thumbnail</span>
              </div>
            )}
            {thumbUploading && (
              <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.85)' }}>
                <div className="w-7 h-7 border-2 border-[color:var(--accent-raw)] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <button onClick={() => fileRef.current?.click()} disabled={thumbUploading} className="btn btn-ghost btn-sm">
              <Upload className="w-3.5 h-3.5" /> Carica
            </button>
            <button onClick={() => setThumbPickerOpen(true)} disabled={thumbUploading} className="btn btn-ghost btn-sm">
              <ImageIcon className="w-3.5 h-3.5" /> Libreria
            </button>
            <button
              onClick={() => set('thumbnail_url', null)}
              disabled={!draft.thumbnail_url || thumbUploading}
              className="btn btn-ghost btn-sm"
              style={{ color: draft.thumbnail_url ? 'var(--danger)' : undefined }}
            >
              <X className="w-3.5 h-3.5" /> Rimuovi
            </button>
          </div>
          <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) { handleThumbUpload(f); e.target.value = ''; } }} />
        </div>

        {/* Title */}
        <div className="vstack-tight">
          <label className="typ-label">Titolo</label>
          <input
            value={draft.title}
            onChange={e => set('title', e.target.value)}
            placeholder="Titolo episodio"
            className="input"
          />
        </div>

        {/* Description */}
        <div className="vstack-tight">
          <label className="typ-label">Descrizione</label>
          <textarea
            value={draft.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Descrizione (opzionale)"
            rows={3}
            className="input"
            style={{ resize: 'vertical', minHeight: 72 }}
          />
        </div>

        {/* Match link */}
        <div className="vstack-tight">
          <label className="typ-label">Match collegato</label>
          <button
            onClick={() => setMatchPickerOpen(true)}
            className="card card-hover text-left w-full"
            style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}
          >
            <Trophy className="w-4 h-4 shrink-0" style={{ color: draft.match_id ? 'var(--accent-raw)' : 'var(--text-muted)' }} />
            <span className="grow truncate typ-label" style={{ color: draft.match_id ? 'var(--text-hi)' : 'var(--text-muted)' }}>
              {draft.match_label || 'Nessun match — clicca per collegare'}
            </span>
            <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {/* Speaker (player) */}
        <div className="vstack-tight">
          <label className="typ-label inline-flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Speaker / Soggetto</label>
          <select
            value={draft.speaker_id ?? ''}
            onChange={e => set('speaker_id', e.target.value || null)}
            className="input"
          >
            <option value="">— Nessuno —</option>
            {players.map(p => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
        </div>

        {/* Visibility */}
        <div
          style={{
            padding: '20px 20px',
            border: '1px solid var(--hairline-soft)',
            borderRadius: 'var(--r-lg)',
            background: 'var(--card)',
            boxShadow: 'var(--shadow-card)',
            display: 'flex', alignItems: 'center', gap: 16,
          }}
        >
          <div className="grow min-w-0">
            <div
              className="inline-flex items-center gap-2"
              style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}
            >
              {draft.is_active
                ? <Eye className="w-4 h-4 shrink-0" style={{ color: 'var(--ok)' }} />
                : <EyeOff className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />}
              Visibile in app
            </div>
            <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.45, color: 'var(--text-muted)' }}>
              {draft.is_active
                ? 'Visibile in catalogo, home e ricerche.'
                : 'Nascosto da tutte le viste pubbliche.'}
            </div>
          </div>
          <button
            onClick={() => set('is_active', !draft.is_active)}
            role="switch"
            aria-checked={draft.is_active}
            className="shrink-0"
            style={{
              width: 52, height: 30, borderRadius: 15, position: 'relative', cursor: 'pointer',
              background: draft.is_active ? 'var(--ok)' : 'var(--hairline)',
              border: 'none', transition: 'background 150ms',
            }}
          >
            <span style={{
              position: 'absolute', top: 3, left: draft.is_active ? 25 : 3,
              width: 24, height: 24, borderRadius: '50%', background: '#fff',
              transition: 'left 150ms', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </button>
        </div>

        {/* Min badge */}
        <div className="vstack-tight">
          <label className="typ-label inline-flex items-center gap-1.5"><Award className="w-3.5 h-3.5" /> Badge accesso minimo</label>
          <div className="grid grid-cols-4 gap-1.5">
            {BADGES.map(b => {
              const active = draft.min_badge === b.value;
              return (
                <button
                  key={b.label}
                  onClick={() => set('min_badge', b.value)}
                  className="btn btn-sm"
                  style={{
                    background: active ? b.color : 'var(--card)',
                    color: active ? '#fff' : 'var(--text-hi)',
                    border: `1px solid ${active ? b.color : 'var(--hairline)'}`,
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  {b.label}
                </button>
              );
            })}
          </div>
          <p className="typ-caption">Override del default del format. Vuoto = usa default format.</p>
        </div>

        {/* Published at */}
        <div className="vstack-tight">
          <label className="typ-label inline-flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Pubblicato il</label>
          <input
            type="datetime-local"
            value={draft.published_at}
            onChange={e => set('published_at', e.target.value)}
            className="input"
          />
        </div>

        {error && (
          <div className="card card-body" style={{ borderColor: 'var(--danger)', background: 'color-mix(in oklab, var(--danger) 8%, var(--card))' }}>
            <p className="typ-caption" style={{ color: 'var(--danger)' }}>{error}</p>
          </div>
        )}

        {/* Sticky footer */}
        <div className="sticky" style={{
          bottom: 0, marginInline: 'calc(-1 * var(--s5))', marginTop: 'auto',
          paddingInline: 'var(--s5)', paddingBlock: 'var(--s3)',
          background: 'var(--card)', borderTop: '1px solid var(--hairline-soft)',
          display: 'flex', gap: 8,
        }}>
          <button onClick={onClose} disabled={saving} className="btn btn-ghost grow">Annulla</button>
          <button onClick={handleSave} disabled={saving || thumbUploading} className="btn btn-primary grow">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salva
          </button>
        </div>
      </div>

      <MatchPicker
        open={matchPickerOpen}
        onClose={() => setMatchPickerOpen(false)}
        currentMatchId={draft.match_id}
        onSelect={m => {
          if (m === null) {
            set('match_id', null);
            set('match_label', '');
          } else {
            set('match_id', m.id);
            set('match_label', formatMatchLabel(m));
          }
        }}
      />

      <MediaPicker
        open={thumbPickerOpen}
        onClose={() => setThumbPickerOpen(false)}
        onSelect={url => set('thumbnail_url', url)}
      />
    </>
  );
}

/* ──────────────────────────── Main page ──────────────────────────── */

export default function EpisodesPage() {
  const [formats, setFormats] = useState<SupaFormat[]>([]);
  const [players, setPlayers] = useState<PlayerLite[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string>('');
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'hidden'>('all');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<EpisodeRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [seasons, setSeasons] = useState<string[]>([]);

  const [drawerEpisode, setDrawerEpisode] = useState<EpisodeRow | null>(null);

  // Initial load: formats + players
  useEffect(() => {
    fetch('/api/media/formats')
      .then(r => r.ok ? r.json() : [])
      .then((data: SupaFormat[]) => {
        const list = Array.isArray(data) ? data : [];
        setFormats(list);
        if (list.length > 0) setSelectedFormat(list[0].id);
      })
      .catch(() => setFormats([]));

    fetch('/api/media/players')
      .then(r => r.ok ? r.json() : { players: [] })
      .then((d: { players: PlayerLite[] }) => setPlayers(Array.isArray(d.players) ? d.players : []))
      .catch(() => setPlayers([]));
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearchDebounced(search); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [search]);

  // Load seasons whenever format changes
  useEffect(() => {
    if (!selectedFormat) { setSeasons([]); setSelectedSeason(''); return; }
    fetch(`/api/media/formats/${encodeURIComponent(selectedFormat)}/episodes`)
      .then(r => r.ok ? r.json() : [])
      .then((data: Array<{ season: string | null }>) => {
        const list = Array.isArray(data) ? data : [];
        const ss = [...new Set(list.map(ep => ep.season).filter(Boolean))] as string[];
        ss.sort((a, b) => b.localeCompare(a));
        setSeasons(ss);
        setSelectedSeason(ss[0] ?? '');
        setPage(1);
      })
      .catch(() => { setSeasons([]); setSelectedSeason(''); });
  }, [selectedFormat]);

  // Reset page on filter changes
  useEffect(() => { setPage(1); }, [selectedFormat, selectedSeason, activeFilter]);

  const loadEpisodes = useCallback(async () => {
    if (!selectedFormat) { setItems([]); setTotal(0); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('format_id', selectedFormat);
      if (selectedSeason) params.set('season', selectedSeason);
      if (searchDebounced) params.set('q', searchDebounced);
      if (activeFilter === 'active') params.set('active', 'true');
      if (activeFilter === 'hidden') params.set('active', 'false');
      params.set('page', String(page));
      params.set('pageSize', String(PAGE_SIZE));

      const res = await fetch(`/api/media/episodes?${params.toString()}`);
      const data = await res.json() as { items: EpisodeRow[]; total: number };
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(data.total ?? 0);
    } catch {
      setItems([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [selectedFormat, selectedSeason, searchDebounced, activeFilter, page]);

  useEffect(() => { loadEpisodes(); }, [loadEpisodes]);

  const handleToggleActive = async (ep: EpisodeRow) => {
    const next = !ep.is_active;
    setItems(prev => prev.map(e => e.id === ep.id ? { ...e, is_active: next } : e));
    try {
      const res = await fetch('/api/media/episodes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ep.id, patch: { is_active: next } }),
      });
      if (!res.ok) throw new Error('failed');
    } catch {
      setItems(prev => prev.map(e => e.id === ep.id ? { ...e, is_active: ep.is_active } : e));
    }
  };

  const handleSaved = (updated: Partial<EpisodeRow> & { id: string }) => {
    setItems(prev => prev.map(e => e.id === updated.id ? { ...e, ...updated } as EpisodeRow : e));
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="vstack" style={{ gap: 'var(--s5)' }}>
      <div className="flex items-center gap-2 flex-wrap">
        <Link href="/media" className="btn btn-ghost btn-sm">
          <ArrowLeft className="w-4 h-4" /> Media
        </Link>
        <div className="grow" />
        <button onClick={loadEpisodes} className="btn btn-ghost btn-sm">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> <span className="hidden md:inline">Ricarica</span>
        </button>
      </div>

      <div>
        <h1 className="typ-h1">Episodi</h1>
        <p className="typ-caption mt-1">Modifica titolo, match collegato, visibilità in app, badge di accesso e thumbnail per ogni episodio.</p>
      </div>

      {/* Format chips */}
      <div className="vstack-tight">
        <label className="typ-micro">Format</label>
        <div className="flex gap-1.5 flex-wrap">
          {formats.map(f => {
            const active = f.id === selectedFormat;
            return (
              <button
                key={f.id}
                onClick={() => setSelectedFormat(f.id)}
                className="btn btn-sm"
                style={{
                  background: active ? 'var(--accent-raw)' : 'var(--card)',
                  color: active ? '#fff' : 'var(--text-hi)',
                  border: `1px solid ${active ? 'var(--accent-raw)' : 'var(--hairline)'}`,
                  fontWeight: active ? 600 : 500,
                }}
              >
                {f.title ?? f.id}
              </button>
            );
          })}
        </div>
      </div>

      {/* Season + active filter + search */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <label className="typ-micro block mb-1.5">Stagione</label>
          <select
            value={selectedSeason}
            onChange={e => setSelectedSeason(e.target.value)}
            disabled={seasons.length === 0}
            className="input w-full"
          >
            {seasons.length === 0 && <option value="">Tutte</option>}
            <option value="">Tutte</option>
            {seasons.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="typ-micro block mb-1.5">Visibilità</label>
          <div className="grid grid-cols-3 gap-1 p-1 rounded-[var(--r)]" style={{ background: 'var(--card-muted)', border: '1px solid var(--hairline-soft)' }}>
            {([
              { id: 'all',    label: 'Tutti'    },
              { id: 'active', label: 'Attivi'   },
              { id: 'hidden', label: 'Nascosti' },
            ] as const).map(opt => {
              const active = activeFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => setActiveFilter(opt.id)}
                  className="h-9 px-2 rounded-[calc(var(--r)-2px)] typ-label transition-colors"
                  style={{
                    background: active ? 'var(--card)' : 'transparent',
                    color: active ? 'var(--text-hi)' : 'var(--text-muted)',
                    boxShadow: active ? 'var(--shadow-card)' : 'none',
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="typ-micro block mb-1.5">Cerca titolo</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtra per titolo..." className="input pl-10 w-full" />
          </div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-7 h-7 border-2 border-[color:var(--accent-raw)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="card card-body text-center">
          <Film className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
          <p className="typ-caption">{!selectedFormat ? 'Seleziona un format.' : 'Nessun episodio trovato.'}</p>
        </div>
      ) : (
        <>
          <div className="typ-caption" style={{ color: 'var(--text-muted)' }}>
            {total} episod{total === 1 ? 'io' : 'i'} · pagina {page} di {totalPages}
          </div>
          <div className="vstack-tight">
            {items.map(ep => {
              const matchLabel = formatMatchLabel(ep.match);
              return (
                <div
                  key={ep.id}
                  className="card"
                  style={{
                    padding: 10, display: 'flex', alignItems: 'center', gap: 12,
                    borderColor: ep.is_active ? 'var(--hairline-soft)' : 'var(--hairline)',
                    opacity: ep.is_active ? 1 : 0.65,
                  }}
                >
                  {/* Thumbnail */}
                  <div className="shrink-0 rounded-[var(--r-sm)] overflow-hidden" style={{ width: 96, aspectRatio: '16/9', background: 'var(--card-muted)' }}>
                    {ep.thumbnail_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={ep.thumbnail_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="grow min-w-0">
                    <div className="typ-label truncate">{ep.title || ep.video_id || ep.id}</div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap typ-micro" style={{ color: 'var(--text-muted)' }}>
                      {matchLabel && (
                        <span className="inline-flex items-center gap-1">
                          <Trophy className="w-3 h-3" /> {matchLabel}
                        </span>
                      )}
                      {ep.speaker?.full_name && (
                        <span className="inline-flex items-center gap-1">
                          <User className="w-3 h-3" /> {ep.speaker.full_name}
                        </span>
                      )}
                      {ep.min_badge && (
                        <span className="pill" style={{ fontSize: 10, padding: '1px 6px', color: BADGES.find(b => b.value === ep.min_badge)?.color }}>
                          {ep.min_badge}
                        </span>
                      )}
                      {ep.published_at && (
                        <span>{new Date(ep.published_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: '2-digit' })}</span>
                      )}
                    </div>
                  </div>

                  {/* Toggle active */}
                  <button
                    onClick={() => handleToggleActive(ep)}
                    role="switch"
                    aria-checked={ep.is_active}
                    aria-label={ep.is_active ? 'Nascondi in app' : 'Mostra in app'}
                    title={ep.is_active ? 'Visibile in app' : 'Nascosto in app'}
                    className="shrink-0"
                    style={{
                      width: 38, height: 22, borderRadius: 11, position: 'relative', cursor: 'pointer',
                      background: ep.is_active ? 'var(--ok)' : 'var(--hairline)',
                      border: 'none', transition: 'background 150ms',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 2, left: ep.is_active ? 18 : 2,
                      width: 18, height: 18, borderRadius: '50%', background: '#fff',
                      transition: 'left 150ms', boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                    }} />
                  </button>

                  {/* Open drawer */}
                  <button
                    onClick={() => setDrawerEpisode(ep)}
                    className="btn btn-ghost btn-sm shrink-0"
                  >
                    Modifica <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn btn-ghost btn-sm"
              >
                <ChevronLeft className="w-4 h-4" /> Indietro
              </button>
              <span className="typ-caption px-3">Pagina {page} di {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="btn btn-ghost btn-sm"
              >
                Avanti <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Drawer */}
      {drawerEpisode && (
        <EpisodeDrawer
          episode={drawerEpisode}
          players={players}
          onClose={() => setDrawerEpisode(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
