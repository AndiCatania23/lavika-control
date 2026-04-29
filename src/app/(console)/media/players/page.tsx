'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Upload, AlertTriangle, CheckCircle2, RefreshCw, Search, Trash2, Users, ArrowLeft,
} from 'lucide-react';

interface PlayerCutoutRow {
  id: string; slug: string | null; full_name: string;
  position: string | null; shirt_number: string | null;
  photo_url: string | null; cutout_url: string | null;
  cutout_updated_at: string | null; team_id: string | null;
  hasCustomCutout: boolean; cutoutBucketKey: string | null;
}

export default function PlayersMediaPage() {
  const [players, setPlayers] = useState<PlayerCutoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [uploadState, setUploadState] = useState<Record<string, { progress: number; error: string | null; done: boolean }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/media/players', { cache: 'no-store' });
      const data = await r.json() as { players?: PlayerCutoutRow[] };
      setPlayers(data.players ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (player: PlayerCutoutRow, file: File) => {
    if (!player.slug) return;
    const key = player.id;
    setUploadState(prev => ({ ...prev, [key]: { progress: 0, error: null, done: false } }));
    try {
      const fd = new FormData();
      fd.append('type', 'player-cutout');
      fd.append('playerSlug', player.slug);
      fd.append('file', file);
      const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.url) throw new Error(payload.error || `HTTP ${res.status}`);
      const patch = await fetch('/api/media/players', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: player.id, cutout_url: payload.url }) });
      if (!patch.ok) throw new Error('Salvataggio DB fallito');
      setUploadState(prev => ({ ...prev, [key]: { progress: 100, error: null, done: true } }));
      setPlayers(prev => prev.map(p => p.id === player.id ? { ...p, cutout_url: payload.url as string, cutout_updated_at: new Date().toISOString(), hasCustomCutout: true } : p));
    } catch (err) {
      setUploadState(prev => ({ ...prev, [key]: { progress: 0, error: err instanceof Error ? err.message : 'Errore', done: false } }));
    }
  };

  const handleRemove = async (player: PlayerCutoutRow) => {
    if (!window.confirm(`Rimuovere cutout di ${player.full_name}? Il file WebP resta su R2 ma non sarà più linkato.`)) return;
    const res = await fetch('/api/media/players', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: player.id, cutout_url: null }) });
    if (!res.ok) return;
    setPlayers(prev => prev.map(p => p.id === player.id ? { ...p, cutout_url: null, cutout_updated_at: null, hasCustomCutout: false } : p));
  };

  const filtered = players.filter(p => {
    if (onlyMissing && p.hasCustomCutout) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.full_name.toLowerCase().includes(q) && !(p.slug || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const missing = players.filter(p => !p.hasCustomCutout).length;

  return (
    <div className="vstack" style={{ gap: 'var(--s5)' }}>
      <div className="flex items-center gap-2 flex-wrap">
        <Link href="/media" className="btn btn-ghost btn-sm">
          <ArrowLeft className="w-4 h-4" /> Media
        </Link>
        <div className="grow" />
        <button onClick={load} className="btn btn-ghost btn-sm">
          <RefreshCw className="w-4 h-4" /> <span className="hidden md:inline">Ricarica</span>
        </button>
      </div>

      <div>
        <h1 className="typ-h1">Giocatori</h1>
        <p className="typ-caption mt-1">
          Cutout (mezzo busto, sfondo trasparente) per ogni giocatore/staff. Salvato in{' '}
          <code style={{ background: 'var(--card-muted)', padding: '1px 6px', borderRadius: 4 }}>lavika-media/players/{'{'}slug{'}'}/cutout.webp</code>.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 flex-wrap">
        <div className="typ-caption">
          <strong className="typ-label">{players.length}</strong> giocatori ·{' '}
          <span style={{ color: missing > 0 ? 'var(--warn)' : 'var(--ok)' }}>{missing} senza cutout</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 typ-caption cursor-pointer select-none">
            <input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} style={{ accentColor: 'var(--accent-raw)' }} />
            Solo mancanti
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca giocatore..." className="input pl-10" style={{ width: 220 }} />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-7 h-7 border-2 border-[color:var(--accent-raw)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map(player => {
            const state = uploadState[player.id];
            return (
              <div key={player.id} className="card card-body vstack-tight">
                <div className="relative aspect-[3/4] rounded-[var(--r)] overflow-hidden" style={{ background: 'var(--card-muted)', border: '1px solid var(--hairline-soft)' }}>
                  {player.cutout_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={player.cutout_url} alt={player.full_name} className="w-full h-full object-contain" />
                  ) : player.photo_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={player.photo_url} alt={player.full_name} className="w-full h-full object-cover" style={{ opacity: 0.3 }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Users className="w-8 h-8" style={{ color: 'var(--text-muted)' }} />
                    </div>
                  )}
                  <span
                    className={player.hasCustomCutout ? 'pill pill-ok' : 'pill pill-warn'}
                    style={{ position: 'absolute', top: 8, right: 8 }}
                  >
                    {player.hasCustomCutout ? <><CheckCircle2 className="w-3 h-3" />OK</> : <><AlertTriangle className="w-3 h-3" />manca</>}
                  </span>
                </div>
                <div>
                  <div className="typ-label truncate">{player.full_name}</div>
                  <div className="typ-micro truncate">{player.position || '—'}{player.shirt_number ? ` · #${player.shirt_number}` : ''}</div>
                </div>
                <label className={`btn btn-ghost btn-sm ${state && !state.error && !state.done ? 'opacity-60 pointer-events-none' : ''}`}>
                  <Upload className="w-3.5 h-3.5" />
                  {state && !state.error && !state.done ? 'Upload…' : player.hasCustomCutout ? 'Sostituisci' : 'Carica cutout'}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/heic" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) { handleUpload(player, f); e.target.value = ''; } }} />
                </label>
                {player.hasCustomCutout && (
                  <button onClick={() => handleRemove(player)} className="typ-caption inline-flex items-center justify-center gap-1" style={{ color: 'var(--danger)', textDecoration: 'underline', cursor: 'pointer' }}>
                    <Trash2 className="w-3 h-3" /> Rimuovi link
                  </button>
                )}
                {state?.error && <div className="typ-caption truncate-2" style={{ color: 'var(--danger)' }}>{state.error}</div>}
                {state?.done  && <div className="typ-caption" style={{ color: 'var(--ok)' }}>Caricato ✓</div>}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full card card-body text-center">
              <div className="typ-caption">Nessun giocatore.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
