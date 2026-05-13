'use client';

/**
 * EpisodePickerSheet — bottom sheet mobile-first per scegliere un
 * episodio nel composer social.
 *
 * Sostituisce il vecchio <select> che mostrava solo `title` di episodi
 * filtrati a `format_id=highlights`. Adesso:
 *  - Carica TUTTI i format dove ci sono episodi (no hardcoded filter)
 *  - Ordina per data desc (pagination 100 alla volta)
 *  - Mostra thumbnail + badge format colorato + match info + durata
 *  - Filtri chip per format ("Tutti / Highlights / Reaction / Conf / ...")
 *  - Search box per titolo
 *  - Bottom sheet 75% schermo su mobile, drawer laterale su desktop
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, Calendar, Clock, ChevronDown } from 'lucide-react';

/* ──────────────────────────────────────────────────────────────────
   Types & format catalog
   ────────────────────────────────────────────────────────────────── */

interface MatchTeam { normalized_name: string | null; short_name: string | null; }
interface MatchObj {
  id: string;
  kickoff_at: string | null;
  matchday: number | null;
  home_team: MatchTeam | MatchTeam[] | null;
  away_team: MatchTeam | MatchTeam[] | null;
}
interface SpeakerObj {
  id: string;
  full_name: string;
}

export interface EpisodeOption {
  id: string;
  title: string | null;
  format_id: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  duration_secs: number | null;
  speaker: SpeakerObj | SpeakerObj[] | null;
  match: MatchObj | MatchObj[] | null;
}

/**
 * Format catalog con label "umana" + colore badge.
 * Mappato sui format reali presenti in DB (vedi query content_formats).
 * Format senza episodi sono comunque tollerati (label fallback = ID title-cased).
 */
const FORMAT_CATALOG: Record<string, { label: string; color: string }> = {
  'highlights':         { label: 'Highlights',      color: '#10B981' }, // verde
  'match-reaction':     { label: 'Match Reaction',  color: '#F59E0B' }, // arancio
  'press-conference':   { label: 'Conferenza',      color: '#3B82F6' }, // blu
  'unica-sport':        { label: 'Unica Sport',     color: '#8B5CF6' }, // viola
  'catanista':          { label: 'Catanista',       color: '#EF4444' }, // rosso
  'catania':            { label: 'Catania',         color: '#6B7280' }, // grigio
  'one-to-one':         { label: 'One to One',      color: '#0EA5E9' },
  'match-preview':      { label: 'Match Preview',   color: '#A78BFA' },
  'days-of-glory':      { label: 'Days of Glory',   color: '#D97706' },
};

function formatLabel(id: string | null): string {
  if (!id) return 'Episodio';
  return FORMAT_CATALOG[id]?.label ?? id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function formatColor(id: string | null): string {
  if (!id) return '#6B7280';
  return FORMAT_CATALOG[id]?.color ?? '#6B7280';
}

/* ──────────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────────── */

function firstObj<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function teamShort(t: MatchTeam | MatchTeam[] | null): string | null {
  const obj = firstObj(t);
  if (!obj) return null;
  return obj.short_name || obj.normalized_name;
}

function buildMatchLabel(match: MatchObj | MatchObj[] | null): string | null {
  const obj = firstObj(match);
  if (!obj) return null;
  const home = teamShort(obj.home_team);
  const away = teamShort(obj.away_team);
  if (!home && !away) return obj.matchday ? `Giornata ${obj.matchday}` : null;
  return `${home ?? '?'} vs ${away ?? '?'}`;
}

function buildSpeakerLabel(speaker: SpeakerObj | SpeakerObj[] | null): string | null {
  const obj = firstObj(speaker);
  return obj?.full_name ?? null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const months = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

function fmtDuration(secs: number | null): string {
  if (!secs || secs <= 0) return '';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function buildEpisodeSubtitle(ep: EpisodeOption): string {
  const match = buildMatchLabel(ep.match);
  const speaker = buildSpeakerLabel(ep.speaker);
  const parts = [match, speaker].filter(Boolean) as string[];
  return parts.join(' · ');
}

/* ──────────────────────────────────────────────────────────────────
   Component: Trigger (closed state) + Sheet (open state)
   ────────────────────────────────────────────────────────────────── */

interface Props {
  value: string;
  onChange: (episodeId: string, episode: EpisodeOption | null) => void;
  /** Preload con un id ricevuto da `?episode_id=...` (deep link da pagina episode). */
  prefillId?: string;
}

export function EpisodePickerSheet({ value, onChange, prefillId }: Props) {
  const [open, setOpen] = useState(false);
  const [episodes, setEpisodes] = useState<EpisodeOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterFormat, setFilterFormat] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<EpisodeOption | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  /* Load on first open OR when value/prefillId changes (per deep-link) */
  useEffect(() => {
    if (episodes.length > 0) return;
    if (!open && !value && !prefillId) return;
    setLoading(true);
    // Carichiamo i 100 episodi più recenti (~1 mese di pubblicazione) attraverso
    // tutti i format. Sufficiente per il composer; chi cerca un episodio vecchio
    // usa la search.
    fetch('/api/media/episodes?page=1&pageSize=100&active=true')
      .then(r => (r.ok ? r.json() : { items: [] }))
      .then((d: { items: EpisodeOption[] }) => {
        setEpisodes(Array.isArray(d.items) ? d.items : []);
      })
      .catch(() => setEpisodes([]))
      .finally(() => setLoading(false));
  }, [open, value, prefillId, episodes.length]);

  /* Resolve `selected` quando arriva l'id (sia da prop value sia da prefillId) */
  useEffect(() => {
    const id = value || prefillId;
    if (!id) { setSelected(null); return; }
    const found = episodes.find(e => e.id === id);
    if (found) setSelected(found);
  }, [value, prefillId, episodes]);

  /* Lock body scroll quando sheet aperto */
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  /* ESC chiude sheet (desktop) */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  /* Format chip list — solo i format effettivamente presenti negli episodi caricati */
  const availableFormats = useMemo(() => {
    const set = new Set<string>();
    for (const ep of episodes) {
      if (ep.format_id) set.add(ep.format_id);
    }
    return [...set];
  }, [episodes]);

  /* Filtered list */
  const filtered = useMemo(() => {
    let list = episodes;
    if (filterFormat !== 'all') {
      list = list.filter(e => e.format_id === filterFormat);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(e => {
        const t = (e.title ?? '').toLowerCase();
        const match = (buildMatchLabel(e.match) ?? '').toLowerCase();
        const speaker = (buildSpeakerLabel(e.speaker) ?? '').toLowerCase();
        return t.includes(q) || match.includes(q) || speaker.includes(q);
      });
    }
    return list;
  }, [episodes, filterFormat, search]);

  const handlePick = (ep: EpisodeOption) => {
    setSelected(ep);
    onChange(ep.id, ep);
    setOpen(false);
  };

  /* ──── Trigger (chiuso) ──── */
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="input w-full"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s3)',
          padding: 'var(--s3)',
          cursor: 'pointer',
          textAlign: 'left',
          minHeight: 56,
        }}
      >
        {selected ? (
          <>
            {selected.thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selected.thumbnail_url}
                alt=""
                style={{
                  width: 40, height: 40, objectFit: 'cover',
                  borderRadius: 'var(--r-s)', flexShrink: 0,
                  background: 'var(--card-muted)',
                }}
              />
            ) : (
              <div
                style={{
                  width: 40, height: 40, borderRadius: 'var(--r-s)',
                  background: 'var(--card-muted)', flexShrink: 0,
                }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '.04em',
                  color: formatColor(selected.format_id),
                  marginBottom: 2,
                }}
              >
                {formatLabel(selected.format_id)}
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--text)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {selected.title || buildMatchLabel(selected.match) || selected.id}
              </div>
            </div>
            <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
          </>
        ) : (
          <>
            <span style={{ color: 'var(--text-muted)', flex: 1 }}>
              — Scegli episodio —
            </span>
            <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
          </>
        )}
      </button>

      {/* ──── Sheet aperto ──── */}
      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          {/* Backdrop */}
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.45)',
              backdropFilter: 'blur(2px)',
            }}
          />

          {/* Sheet */}
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Scegli episodio"
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 560,
              maxHeight: '85vh',
              background: 'var(--card)',
              borderTopLeftRadius: 'var(--r-l)',
              borderTopRightRadius: 'var(--r-l)',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.25)',
              display: 'flex',
              flexDirection: 'column',
              animation: 'sheet-slide-up 240ms cubic-bezier(.2,.8,.2,1)',
            }}
          >
            {/* Drag handle visivo + header */}
            <div
              style={{
                padding: 'var(--s3) var(--s4) var(--s2) var(--s4)',
                borderBottom: '1px solid var(--hairline-soft)',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 4,
                  background: 'var(--n-200)',
                  borderRadius: 2,
                  margin: '0 auto var(--s3) auto',
                }}
              />
              <div className="flex items-center justify-between gap-2">
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                  Scegli episodio
                </h3>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn btn-ghost btn-sm"
                  style={{ width: 36, height: 36, padding: 0, justifyContent: 'center' }}
                  aria-label="Chiudi"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Search */}
              <div
                style={{
                  position: 'relative',
                  marginTop: 'var(--s3)',
                }}
              >
                <Search
                  className="w-4 h-4"
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                  }}
                />
                <input
                  type="search"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Cerca per titolo, match, speaker…"
                  className="input w-full"
                  style={{ paddingLeft: 36 }}
                />
              </div>

              {/* Filtri chip */}
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  marginTop: 'var(--s3)',
                  overflowX: 'auto',
                  paddingBottom: 4,
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                <FilterChip
                  label="Tutti"
                  active={filterFormat === 'all'}
                  color="var(--accent-raw)"
                  onClick={() => setFilterFormat('all')}
                />
                {availableFormats.map(fid => (
                  <FilterChip
                    key={fid}
                    label={formatLabel(fid)}
                    active={filterFormat === fid}
                    color={formatColor(fid)}
                    onClick={() => setFilterFormat(fid)}
                  />
                ))}
              </div>
            </div>

            {/* Lista episodi (scrollable) */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                padding: 'var(--s2) var(--s2) var(--s5) var(--s2)',
              }}
            >
              {loading ? (
                <div className="typ-caption" style={{ padding: 'var(--s5)', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Carico…
                </div>
              ) : filtered.length === 0 ? (
                <div className="typ-caption" style={{ padding: 'var(--s5)', textAlign: 'center', color: 'var(--text-muted)' }}>
                  {search.trim()
                    ? `Nessun episodio per "${search}".`
                    : 'Nessun episodio disponibile.'}
                </div>
              ) : (
                filtered.map(ep => (
                  <EpisodeRow
                    key={ep.id}
                    episode={ep}
                    isSelected={selected?.id === ep.id}
                    onPick={() => handlePick(ep)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Keyframes locali */}
          <style jsx>{`
            @keyframes sheet-slide-up {
              from { transform: translateY(100%); }
              to   { transform: translateY(0); }
            }
          `}</style>
        </div>
      )}
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Sub-components
   ────────────────────────────────────────────────────────────────── */

function FilterChip({
  label, active, color, onClick,
}: { label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flexShrink: 0,
        padding: '6px 12px',
        borderRadius: 'var(--r-pill)',
        border: `1px solid ${active ? color : 'var(--hairline-soft)'}`,
        background: active ? `color-mix(in oklab, ${color} 14%, transparent)` : 'var(--card)',
        color: active ? color : 'var(--text)',
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

function EpisodeRow({
  episode, isSelected, onPick,
}: { episode: EpisodeOption; isSelected: boolean; onPick: () => void }) {
  const color = formatColor(episode.format_id);
  const subtitle = buildEpisodeSubtitle(episode);
  const duration = fmtDuration(episode.duration_secs);
  const date = fmtDate(episode.published_at);

  return (
    <button
      type="button"
      onClick={onPick}
      style={{
        display: 'flex',
        gap: 'var(--s3)',
        padding: 'var(--s3)',
        width: '100%',
        textAlign: 'left',
        border: 'none',
        background: isSelected ? 'var(--accent-soft)' : 'transparent',
        borderRadius: 'var(--r-m)',
        cursor: 'pointer',
        alignItems: 'flex-start',
      }}
    >
      {episode.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={episode.thumbnail_url}
          alt=""
          style={{
            width: 56, height: 56, objectFit: 'cover',
            borderRadius: 'var(--r-s)', flexShrink: 0,
            background: 'var(--card-muted)',
          }}
        />
      ) : (
        <div
          style={{
            width: 56, height: 56, borderRadius: 'var(--r-s)',
            background: 'var(--card-muted)', flexShrink: 0,
          }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '.05em',
            color,
            marginBottom: 3,
          }}
        >
          {formatLabel(episode.format_id)}
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--text)',
            lineHeight: 1.3,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {episode.title || buildMatchLabel(episode.match) || episode.id}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {subtitle}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            gap: 'var(--s3)',
            marginTop: 4,
            fontSize: 11,
            color: 'var(--text-muted)',
          }}
        >
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" /> {date}
          </span>
          {duration && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {duration}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
