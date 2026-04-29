'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Wand2, Pill as PillIcon, Film, Sparkles,
  Instagram, Facebook, Music2, AlertTriangle,
} from 'lucide-react';

/* ────────────────────────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────────────────────────── */

type Platform = 'instagram' | 'facebook' | 'tiktok';

type Format =
  | 'feed_post'
  | 'story'
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
    enabled: false,  // attivo dopo Meta App Review
    formats: [
      { id: 'feed_post', label: 'Feed Post',  aspect: '1:1',  type: 'image' },
      { id: 'carousel',  label: 'Carousel',   aspect: '1:1',  type: 'album' },
      { id: 'story',     label: 'Story',      aspect: '9:16', type: 'image' },
      { id: 'reel',      label: 'Reel',       aspect: '9:16', type: 'video' },
    ],
  },
  {
    id: 'facebook',
    label: 'Facebook',
    Icon: Facebook,
    color: '#1877F2',
    enabled: false,  // attivo dopo Meta App Review
    formats: [
      { id: 'feed_post', label: 'Feed Post',  aspect: '4:5',  type: 'image' },
      { id: 'reel',      label: 'Reel',       aspect: '9:16', type: 'video' },
      { id: 'story',     label: 'Story',      aspect: '9:16', type: 'image' },
    ],
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    Icon: Music2,
    color: '#000',
    enabled: false,
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

  // Selection: which (platform, format) couples are active
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const cellKey = (p: Platform, f: Format) => `${p}:${f}`;
  const toggleCell = (p: Platform, f: Format) =>
    setSelected(prev => ({ ...prev, [cellKey(p, f)]: !prev[cellKey(p, f)] }));

  // Load sources for picker
  useEffect(() => {
    if (sourceKind === 'pill' && pills.length === 0) {
      setLoadingSources(true);
      fetch('/api/console/pills?limit=20&status=published')
        .then(r => r.ok ? r.json() : { items: [] })
        .then((d: { items: SourcePill[] }) => setPills(Array.isArray(d.items) ? d.items : []))
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

  const canGenerate = selectedCount > 0 && (sourceKind === 'manual' || sourceId);

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

      {/* App Review notice */}
      <div className="card card-body flex items-start gap-3" style={{ borderColor: 'color-mix(in oklab, var(--warn) 28%, transparent)', background: 'color-mix(in oklab, var(--warn) 8%, var(--card))' }}>
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--warn)' }} />
        <div>
          <p className="typ-label" style={{ color: 'var(--warn)' }}>App Meta in attesa di review</p>
          <p className="typ-caption mt-1">
            Pubblicazione disabilitata finché Meta non approva l&apos;app per Instagram + Facebook.
            Puoi creare bozze e configurare pacchetti — saranno pronti al go-live.
          </p>
        </div>
      </div>

      {/* Step 1: Source */}
      <div>
        <h2 className="typ-label" style={{ marginBottom: 8 }}>1. Sorgente</h2>
        <div className="grid grid-cols-3 gap-2">
          {([
            { id: 'pill',    label: 'Pill',     Icon: PillIcon },
            { id: 'episode', label: 'Episodio', Icon: Film },
            { id: 'manual',  label: 'Da zero',  Icon: Sparkles },
          ] as const).map(opt => {
            const active = sourceKind === opt.id;
            const Icon = opt.Icon;
            return (
              <button
                key={opt.id}
                onClick={() => { setSourceKind(opt.id); setSourceId(''); }}
                className="card card-hover"
                style={{
                  padding: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  borderColor: active ? 'var(--accent-raw)' : 'var(--hairline-soft)',
                  background: active ? 'var(--accent-soft)' : 'var(--card)',
                  fontWeight: active ? 600 : 500, cursor: 'pointer',
                }}
              >
                <Icon className="w-4 h-4" />
                {opt.label}
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

      {/* Step 3: Generate (placeholder) */}
      <div>
        <h2 className="typ-label" style={{ marginBottom: 8 }}>3. Genera</h2>
        <div className="card card-body text-center" style={{ padding: 'var(--s5)' }}>
          {canGenerate ? (
            <>
              <p className="typ-caption mb-3">
                Pronti a generare <strong>{selectedCount}</strong> variant{selectedCount === 1 ? 'e' : 'i'}.
                <br />
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                  (Generazione asset disabilitata in Step 0 — verrà abilitata col Mac asset-builder daemon.)
                </span>
              </p>
              <button disabled className="btn btn-primary">
                <Wand2 className="w-4 h-4" /> Genera pacchetto
              </button>
            </>
          ) : (
            <p className="typ-caption">Seleziona sorgente e almeno una variant per generare.</p>
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
