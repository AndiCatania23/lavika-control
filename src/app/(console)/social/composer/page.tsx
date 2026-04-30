'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Wand2, Pill as PillIcon, Film, Sparkles,
  Instagram, Facebook, Music2, RefreshCw, AlertTriangle,
} from 'lucide-react';
import { splitEditorialTitle, needsHeadlineWarning, HEADLINE_SOFT_MAX } from '@/lib/social/headlineSplit';

/* ────────────────────────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────────────────────────── */

type Platform = 'instagram' | 'facebook' | 'tiktok';

type Format =
  | 'feed_post'
  | 'story'           // Story 9:16 image (24h)
  | 'story_video'     // Story 9:16 video (24h, MP4 via Remotion)
  | 'reel'
  | 'carousel'
  | 'photo_mode'
  | 'channel_post';

interface PlatformDef {
  id: Platform;
  label: string;
  Icon: typeof Instagram;
  color: string;
  enabled: boolean;        // se richiede App Review pendente, false
  formats: Array<{ id: Format; label: string; aspect: string; type: 'image' | 'video' | 'album' }>;
}

const PLATFORMS: PlatformDef[] = [
  {
    id: 'instagram',
    label: 'Instagram',
    Icon: Instagram,
    color: '#E1306C',
    enabled: true,
    formats: [
      { id: 'feed_post',   label: 'Feed Post',     aspect: '4:5',  type: 'image' },
      { id: 'carousel',    label: 'Carousel',      aspect: '1:1',  type: 'album' },
      { id: 'story',       label: 'Story (Image)', aspect: '9:16', type: 'image' },
      { id: 'story_video', label: 'Story (Video)', aspect: '9:16', type: 'video' },
      { id: 'reel',        label: 'Reel',          aspect: '9:16', type: 'video' },
    ],
  },
  {
    id: 'facebook',
    label: 'Facebook',
    Icon: Facebook,
    color: '#1877F2',
    enabled: true,
    formats: [
      { id: 'feed_post',   label: 'Feed Post',     aspect: '4:5',  type: 'image' },
      { id: 'story',       label: 'Story (Image)', aspect: '9:16', type: 'image' },
      { id: 'story_video', label: 'Story (Video)', aspect: '9:16', type: 'video' },
      { id: 'reel',        label: 'Reel',          aspect: '9:16', type: 'video' },
    ],
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    Icon: Music2,
    color: '#000',
    enabled: false,    // TODO: TikTok Content API audit
    formats: [
      { id: 'reel',       label: 'Video',      aspect: '9:16', type: 'video' },
      { id: 'photo_mode', label: 'Photo Mode', aspect: '9:16', type: 'album' },
    ],
  },
];

/* ────────────────────────────────────────────────────────────────────
   Source picker (placeholder — selettore pill/episodio reale arriva dopo)
   ──────────────────────────────────────────────────────────────────── */

interface SourcePill { id: string; title: string; type: string; image_url: string | null; }
interface SourceEp   { id: string; title: string | null; format_id: string; thumbnail_url: string | null; }

function ComposerInner() {
  const params = useSearchParams();
  const router = useRouter();
  const initialPillId    = params.get('pill_id');
  const initialEpisodeId = params.get('episode_id');

  type SourceKind = 'pill' | 'episode' | 'manual';
  const [sourceKind, setSourceKind] = useState<SourceKind>(
    initialPillId ? 'pill' : initialEpisodeId ? 'episode' : 'manual'
  );
  const [sourceId, setSourceId] = useState<string>(initialPillId ?? initialEpisodeId ?? '');

  const [pills,    setPills]    = useState<SourcePill[]>([]);
  const [episodes, setEpisodes] = useState<SourceEp[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Headline override per asset (Strategy #1 audit 2026-04-30).
  // Si attiva SOLO quando il pill.title supera HEADLINE_SOFT_MAX (60 char).
  // Default = headline proposta dallo split editoriale; utente può editare.
  const [headlineOverride, setHeadlineOverride] = useState<string>('');
  const [headlineDirty, setHeadlineDirty]       = useState<boolean>(false);

  // Selection: which (platform, format) couples are active
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const cellKey = (p: Platform, f: Format) => `${p}:${f}`;
  const toggleCell = (p: Platform, f: Format) =>
    setSelected(prev => ({ ...prev, [cellKey(p, f)]: !prev[cellKey(p, f)] }));

  // Load sources for picker
  useEffect(() => {
    if (sourceKind === 'pill' && pills.length === 0) {
      setLoadingSources(true);
      // Lazy import to keep the bundle slim
      import('@/lib/data').then(({ getPills }) => getPills())
        .then(allPills => {
          // Show only published or scheduled pills with an image (publishable)
          const filtered = allPills
            .filter(p => (p.status === 'published' || p.status === 'scheduled') && p.image_url)
            .slice(0, 30)
            .map(p => ({ id: p.id, title: p.title, type: p.type, image_url: p.image_url ?? null }));
          setPills(filtered);
        })
        .catch(() => setPills([]))
        .finally(() => setLoadingSources(false));
    }
    if (sourceKind === 'episode' && episodes.length === 0) {
      setLoadingSources(true);
      fetch('/api/media/episodes?format_id=highlights&page=1&pageSize=20')
        .then(r => r.ok ? r.json() : { items: [] })
        .then((d: { items: SourceEp[] }) => setEpisodes(Array.isArray(d.items) ? d.items : []))
        .catch(() => setEpisodes([]))
        .finally(() => setLoadingSources(false));
    }
  }, [sourceKind, pills.length, episodes.length]);

  const selectedCount = useMemo(() => Object.values(selected).filter(Boolean).length, [selected]);

  // Pill attualmente selezionata (per warning headline lungo)
  const selectedPill = useMemo(
    () => sourceKind === 'pill' && sourceId ? pills.find(p => p.id === sourceId) : undefined,
    [sourceKind, sourceId, pills]
  );
  const headlineNeedsWarning = !!(selectedPill && needsHeadlineWarning(selectedPill.title));
  const autoHeadline = useMemo(
    () => selectedPill ? splitEditorialTitle(selectedPill.title).headline : '',
    [selectedPill]
  );

  // Sync default headline quando cambia la pill selezionata e l'utente non l'ha
  // ancora editata a mano (headlineDirty=false).
  useEffect(() => {
    if (!headlineDirty) {
      setHeadlineOverride(autoHeadline);
    }
  }, [autoHeadline, headlineDirty]);

  // Quando cambia source, reset dirty flag (ricominciamo a tracciare auto vs manuale)
  useEffect(() => {
    setHeadlineDirty(false);
  }, [sourceId, sourceKind]);

  const togglePresetAllIG    = () => {
    const ig = PLATFORMS.find(p => p.id === 'instagram')!;
    const allOn = ig.formats.every(f => selected[cellKey('instagram', f.id)]);
    const next: Record<string, boolean> = { ...selected };
    ig.formats.forEach(f => { next[cellKey('instagram', f.id)] = !allOn; });
    setSelected(next);
  };
  const togglePresetAllFB    = () => {
    const fb = PLATFORMS.find(p => p.id === 'facebook')!;
    const allOn = fb.formats.every(f => selected[cellKey('facebook', f.id)]);
    const next: Record<string, boolean> = { ...selected };
    fb.formats.forEach(f => { next[cellKey('facebook', f.id)] = !allOn; });
    setSelected(next);
  };
  const togglePresetAll  = () => {
    const enabled = PLATFORMS.filter(p => p.enabled);
    const allOn = enabled.every(p => p.formats.every(f => selected[cellKey(p.id, f.id)]));
    const next: Record<string, boolean> = { ...selected };
    enabled.forEach(p => p.formats.forEach(f => { next[cellKey(p.id, f.id)] = !allOn; }));
    setSelected(next);
  };

  const canGenerate = selectedCount > 0 && sourceKind !== 'manual' && !!sourceId;

  const handleGenerate = async () => {
    if (!canGenerate || generating) return;
    setGenerating(true);
    setGenerateError(null);

    // Build variants array from selected matrix
    const variants: Array<{ platform: Platform; format: Format }> = [];
    for (const [key, on] of Object.entries(selected)) {
      if (!on) continue;
      const [platform, format] = key.split(':') as [Platform, Format];
      variants.push({ platform, format });
    }

    const endpoint = sourceKind === 'pill'
      ? '/api/social/drafts/from-pill'
      : '/api/social/drafts/from-episode';
    const idKey = sourceKind === 'pill' ? 'pillId' : 'episodeId';

    // Per pill: include headline override se differisce dal pill.title intero.
    // Se utente non ha toccato e pill ≤ 60 char, headlineOverride === pill.title → omettiamo
    // (il backend applica splitEditorialTitle che ritorna identity per ≤ 60).
    const body: Record<string, unknown> = { [idKey]: sourceId, variants };
    if (sourceKind === 'pill' && selectedPill) {
      const trimmed = headlineOverride.trim();
      if (trimmed && trimmed !== selectedPill.title) {
        body.headlineOverride = trimmed;
      }
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok: boolean; redirectTo?: string; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      router.push(data.redirectTo ?? '/social');
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Errore sconosciuto');
      setGenerating(false);
    }
  };

  return (
    <div className="vstack" style={{ gap: 'var(--s5)' }}>
      <div className="flex items-center gap-2 flex-wrap">
        <Link href="/social" className="btn btn-ghost btn-sm">
          <ArrowLeft className="w-4 h-4" /> Social
        </Link>
        <div className="grow" />
      </div>

      <div>
        <h1 className="typ-h1">Composer</h1>
        <p className="typ-caption mt-1">
          Crea un pacchetto social: scegli sorgente, piattaforme e formati. L&apos;AI genera caption + asset, tu approvi e schedulati.
        </p>
      </div>


      {/* Step 1: Source */}
      <div>
        <h2 className="typ-label" style={{ marginBottom: 8 }}>1. Sorgente</h2>
        <div className="grid grid-cols-3 gap-2">
          {([
            { id: 'pill',    label: 'Pill',      sub: 'da pill esistente',   Icon: PillIcon },
            { id: 'episode', label: 'Episodio',  sub: 'da video pubblicato', Icon: Film },
            { id: 'manual',  label: 'Da zero',   sub: 'contenuto custom',    Icon: Sparkles },
          ] as const).map(opt => {
            const active = sourceKind === opt.id;
            const Icon = opt.Icon;
            return (
              <button
                key={opt.id}
                onClick={() => { setSourceKind(opt.id); setSourceId(''); }}
                className="card card-hover"
                style={{
                  padding: '14px 8px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                  borderColor: active ? 'var(--accent-raw)' : 'var(--hairline-soft)',
                  background: active ? 'var(--accent-soft)' : 'var(--card)',
                  cursor: 'pointer',
                  textAlign: 'center',
                  minHeight: 84,
                }}
              >
                <Icon className="w-5 h-5 shrink-0" style={{ color: active ? 'var(--accent-raw)' : 'var(--text-muted)' }} />
                <span style={{ fontSize: 14, fontWeight: active ? 600 : 500, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                  {opt.label}
                </span>
                <span className="hidden sm:inline" style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.2 }}>
                  {opt.sub}
                </span>
              </button>
            );
          })}
        </div>

        {sourceKind !== 'manual' && (
          <div style={{ marginTop: 10 }}>
            {loadingSources ? (
              <div className="typ-caption" style={{ color: 'var(--text-muted)' }}>Carico…</div>
            ) : sourceKind === 'pill' ? (
              <select value={sourceId} onChange={e => setSourceId(e.target.value)} className="input w-full">
                <option value="">— Seleziona pill —</option>
                {pills.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            ) : (
              <select value={sourceId} onChange={e => setSourceId(e.target.value)} className="input w-full">
                <option value="">— Seleziona episodio —</option>
                {episodes.map(e => <option key={e.id} value={e.id}>{e.title || e.id}</option>)}
              </select>
            )}
          </div>
        )}
      </div>

      {/* Headline warning + override (Strategy #1 audit 2026-04-30).
          Si attiva solo quando la pill selezionata ha titolo > HEADLINE_SOFT_MAX.
          La caption usa SEMPRE il titolo intero — l'override tocca solo la
          headline visibile sull'asset. */}
      {headlineNeedsWarning && selectedPill && (
        <div className="card" style={{
          padding: 14,
          background: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
        }}>
          <div className="flex items-start gap-2" style={{ marginBottom: 10 }}>
            <AlertTriangle size={18} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
            <div className="typ-body-sm" style={{ flex: 1 }}>
              <strong>Titolo lungo ({selectedPill.title.length} caratteri).</strong>{' '}
              Sopra {HEADLINE_SOFT_MAX} char la headline sull&apos;asset viene splittata
              automaticamente sui break editoriali (`:`, `—`, `,`).
              Puoi accettare la proposta o riscrivere la headline.
              <br />
              <span style={{ color: 'var(--text-muted)' }}>
                La caption userà sempre il titolo completo.
              </span>
            </div>
          </div>
          <div className="typ-caption" style={{ color: 'var(--text-muted)', marginBottom: 4 }}>
            Headline asset
          </div>
          <input
            type="text"
            className="input w-full"
            value={headlineOverride}
            onChange={e => { setHeadlineOverride(e.target.value); setHeadlineDirty(true); }}
            placeholder={autoHeadline}
            maxLength={70}
          />
          <div className="flex items-center justify-between" style={{ marginTop: 6 }}>
            <span className="typ-caption" style={{ color: 'var(--text-muted)' }}>
              {headlineOverride.length} / 70 char
            </span>
            {headlineDirty && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => { setHeadlineOverride(autoHeadline); setHeadlineDirty(false); }}
              >
                <RefreshCw size={12} /> Reset proposta
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Platforms × Formats matrix */}
      <div>
        <div className="flex items-center justify-between flex-wrap gap-2" style={{ marginBottom: 8 }}>
          <h2 className="typ-label">2. Canali e formati</h2>
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={togglePresetAllIG} className="btn btn-ghost btn-sm">Tutto IG</button>
            <button onClick={togglePresetAllFB} className="btn btn-ghost btn-sm">Tutto FB</button>
            <button onClick={togglePresetAll}   className="btn btn-ghost btn-sm">Tutto</button>
          </div>
        </div>

        <div className="vstack-tight">
          {PLATFORMS.map(plat => {
            const PlatIcon = plat.Icon;
            return (
              <div
                key={plat.id}
                className="card"
                style={{
                  padding: 12,
                  opacity: plat.enabled ? 1 : 0.55,
                  background: 'var(--card)',
                  border: '1px solid var(--hairline-soft)',
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <PlatIcon className="w-4 h-4" style={{ color: plat.color }} />
                  <span className="typ-label">{plat.label}</span>
                  {!plat.enabled && (
                    <span className="pill" style={{ fontSize: 10, padding: '1px 6px', marginLeft: 'auto' }}>
                      in attesa review
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {plat.formats.map(f => {
                    const k = cellKey(plat.id, f.id);
                    const on = !!selected[k];
                    return (
                      <button
                        key={f.id}
                        disabled={!plat.enabled}
                        onClick={() => toggleCell(plat.id, f.id)}
                        className="btn btn-sm"
                        style={{
                          background: on ? plat.color : 'var(--card)',
                          color: on ? '#fff' : 'var(--text-hi)',
                          border: `1px solid ${on ? plat.color : 'var(--hairline)'}`,
                          fontWeight: on ? 600 : 500,
                          opacity: plat.enabled ? 1 : 0.5,
                          flexDirection: 'column',
                          height: 'auto',
                          paddingBlock: 8,
                        }}
                      >
                        <span style={{ fontSize: 12 }}>{f.label}</span>
                        <span className="typ-micro" style={{ opacity: 0.7, fontSize: 10 }}>{f.aspect} · {f.type}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step 3: Generate */}
      <div>
        <h2 className="typ-label" style={{ marginBottom: 8 }}>3. Genera</h2>
        <div className="card card-body text-center" style={{ padding: 'var(--s5)' }}>
          {canGenerate ? (
            <>
              <p className="typ-caption mb-3">
                Pronti a generare <strong>{selectedCount}</strong> variant{selectedCount === 1 ? 'e' : 'i'}.
                <br />
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                  Il Mac processa gli asset in background, poi vai alla pagina anteprima per approvare e pubblicare.
                </span>
              </p>
              <button onClick={handleGenerate} disabled={generating} className="btn btn-primary">
                {generating
                  ? <><RefreshCw className="w-4 h-4 animate-spin" /> Creazione bozza…</>
                  : <><Wand2 className="w-4 h-4" /> Genera pacchetto</>}
              </button>
              {generateError && (
                <p className="typ-caption mt-3" style={{ color: 'var(--danger)' }}>{generateError}</p>
              )}
            </>
          ) : (
            <p className="typ-caption">
              {!sourceId && sourceKind !== 'manual'
                ? 'Seleziona prima una pill o un episodio.'
                : sourceKind === 'manual'
                  ? 'La modalità "Da zero" è in arrivo. Per ora seleziona pill o episodio.'
                  : 'Spunta almeno una variant nella matrice qui sopra.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ComposerPage() {
  return (
    <Suspense fallback={<div className="typ-caption">Carico…</div>}>
      <ComposerInner />
    </Suspense>
  );
}
