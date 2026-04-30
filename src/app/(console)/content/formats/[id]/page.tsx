'use client';

/**
 * /content/formats/[id] — Dettaglio format (FASE 5.A piano onboarding)
 *
 * Mostra:
 *  - Hero con cover_horizontal_url + titolo + slug + badge
 *  - Sezione Identità: edit inline title/description/category/badge/sort_order/offset
 *  - Sezione Cover: preview h+v + link "Modifica in /media/covers"
 *  - Sezione Source: lista video_sources collegati + toggle enabled
 *  - Sezione Episodi: counts + link a /media/episodes?format_id={id}
 *
 * Cover gestite altrove (decisione utente: solo /media/covers).
 * Upload video manuale rimandato a F5.B.
 *
 * Slug + format_id IMMUTABILI dopo creazione (vincolo R2).
 */
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft, Edit2, Save, X, RefreshCw, ExternalLink, Eye, EyeOff,
  Image as ImageIcon, Film, Settings, Database,
} from 'lucide-react';

interface FormatRow {
  id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  team_id: string | null;
  default_min_badge: string;
  sort_order: number;
  sync_trigger_offset_minutes: number;
  cover_horizontal_url: string | null;
  cover_vertical_url: string | null;
  hero_url: string | null;
  created_at: string;
  updated_at: string;
}

interface SourceRow {
  id: string;
  name: string | null;
  platform: string;
  channel: string | null;
  enabled: boolean;
  scan_window: number;
  max_videos_per_run: number;
  schedule_cron: string | null;
  created_at: string;
}

interface EpisodeStats {
  total: number;
  active: number;
  byFormat: Record<string, { total: number; active: number }>;
}

const PLACEHOLDER = '/immagini/placeholder.webp';

export default function FormatDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? '';

  const [format, setFormat] = useState<FormatRow | null>(null);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [stats, setStats] = useState<EpisodeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit identity
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '', description: '', category: '',
    default_min_badge: 'bronze', sort_order: '100',
    sync_trigger_offset_minutes: '15',
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fmtRes, statsRes] = await Promise.all([
        fetch(`/api/console/formats/${encodeURIComponent(id)}`, { cache: 'no-store' }),
        fetch('/api/media/episodes/stats', { cache: 'no-store' }),
      ]);
      const fmtData = await fmtRes.json();
      const statsData = await statsRes.json();
      if (!fmtRes.ok) throw new Error(fmtData.error ?? 'Format non trovato');
      setFormat(fmtData.format);
      setSources(fmtData.sources ?? []);
      setStats(statsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore caricamento');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) void load();
  }, [id, load]);

  const startEdit = () => {
    if (!format) return;
    setEditForm({
      title: format.title ?? '',
      description: format.description ?? '',
      category: format.category ?? '',
      default_min_badge: format.default_min_badge,
      sort_order: String(format.sort_order),
      sync_trigger_offset_minutes: String(format.sync_trigger_offset_minutes),
    });
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const submitEdit = useCallback(async () => {
    setSaving(true);
    try {
      const offset = Number(editForm.sync_trigger_offset_minutes);
      const sortOrder = Number(editForm.sort_order);
      if (!Number.isFinite(offset) || offset <= 0 || offset > 1440) {
        throw new Error('Sync offset deve essere 1..1440');
      }
      if (!Number.isFinite(sortOrder)) {
        throw new Error('Sort order non valido');
      }
      const payload = {
        title: editForm.title.trim() || null,
        description: editForm.description.trim() || null,
        category: editForm.category.trim() || null,
        default_min_badge: editForm.default_min_badge,
        sort_order: sortOrder,
        sync_trigger_offset_minutes: offset,
      };
      const res = await fetch(`/api/console/formats/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Patch fallita');
      setFormat(data.item);
      setEditing(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Errore salvataggio');
    } finally {
      setSaving(false);
    }
  }, [editForm, id]);

  const toggleSource = useCallback(async (source: SourceRow) => {
    if (source.enabled) {
      // Disable via DELETE soft
      if (!confirm(`Disattivare la source "${source.id}"?`)) return;
      const res = await fetch(`/api/console/video-sources/${encodeURIComponent(source.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) await load();
      else alert(data.error ?? 'Errore');
    } else {
      // Re-enable via PATCH
      const res = await fetch(`/api/console/video-sources/${encodeURIComponent(source.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      const data = await res.json();
      if (res.ok) await load();
      else alert(data.error ?? 'Errore');
    }
  }, [load]);

  if (loading) {
    return (
      <div className="page-container">
        <div className="card card-body" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          Caricamento...
        </div>
      </div>
    );
  }

  if (error || !format) {
    return (
      <div className="page-container vstack" style={{ gap: 'var(--s3)' }}>
        <Link href="/content/formats" className="btn btn-ghost"><ArrowLeft size={14} /> Indietro</Link>
        <div className="card card-body" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
          {error ?? 'Format non trovato'}
        </div>
      </div>
    );
  }

  const epStats = stats?.byFormat[id] ?? { total: 0, active: 0 };

  return (
    <div className="page-container vstack" style={{ gap: 'var(--s4)' }}>
      {/* Header */}
      <div className="hstack" style={{ gap: 'var(--s2)', alignItems: 'center' }}>
        <Link href="/content/formats" className="btn btn-ghost" title="Indietro">
          <ArrowLeft size={16} />
        </Link>
        <div style={{ flex: 1 }}>
          <h1 className="typ-h2">{format.title ?? format.id}</h1>
          <p className="typ-micro" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {format.id}
          </p>
        </div>
        <button onClick={() => void load()} className="btn btn-ghost" title="Ricarica">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Hero cover */}
      <div
        className="card"
        style={{
          aspectRatio: '16 / 9', overflow: 'hidden', position: 'relative',
          background: 'var(--card-muted)',
          backgroundImage: `url(${format.cover_horizontal_url || PLACEHOLDER})`,
          backgroundSize: 'cover', backgroundPosition: 'center',
        }}
      >
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: 'var(--s3)',
          background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)',
          color: 'white',
        }}>
          <div className="hstack" style={{ gap: 'var(--s2)', flexWrap: 'wrap' }}>
            <span className="badge">{format.default_min_badge}</span>
            {format.category && <span className="badge" style={{ background: 'rgba(255,255,255,0.2)' }}>{format.category}</span>}
            <span className="badge" style={{ background: 'rgba(255,255,255,0.2)' }}>{epStats.total} ep</span>
            <span className="badge" style={{ background: 'rgba(255,255,255,0.2)' }}>{sources.filter(s => s.enabled).length}/{sources.length} src</span>
          </div>
        </div>
      </div>

      {/* Sezione Identità */}
      <div className="card card-body vstack" style={{ gap: 'var(--s3)' }}>
        <div className="hstack" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="typ-h3"><Settings size={16} style={{ display: 'inline' }} /> Identità</h3>
          {!editing ? (
            <button onClick={startEdit} className="btn btn-ghost typ-micro"><Edit2 size={12} /> Modifica</button>
          ) : (
            <div className="hstack" style={{ gap: 'var(--s2)' }}>
              <button onClick={cancelEdit} disabled={saving} className="btn btn-ghost typ-micro"><X size={12} /> Annulla</button>
              <button onClick={() => void submitEdit()} disabled={saving} className="btn btn-primary typ-micro">
                <Save size={12} /> {saving ? 'Salvo...' : 'Salva'}
              </button>
            </div>
          )}
        </div>

        {!editing ? (
          <div className="vstack" style={{ gap: 'var(--s2)' }}>
            <Field label="Titolo" value={format.title} />
            <Field label="Descrizione" value={format.description} multiline />
            <Field label="Categoria" value={format.category} />
            <Field label="Badge minimo" value={format.default_min_badge} />
            <Field label="Sort order" value={String(format.sort_order)} />
            <Field label="Sync trigger offset (min)" value={String(format.sync_trigger_offset_minutes)} />
          </div>
        ) : (
          <div className="vstack" style={{ gap: 'var(--s2)' }}>
            <Input label="Titolo" value={editForm.title} onChange={v => setEditForm(p => ({ ...p, title: v }))} />
            <Textarea label="Descrizione" value={editForm.description} onChange={v => setEditForm(p => ({ ...p, description: v }))} />
            <Input label="Categoria" value={editForm.category} onChange={v => setEditForm(p => ({ ...p, category: v }))} />
            <div>
              <label className="typ-micro block mb-1.5">Badge minimo</label>
              <select
                value={editForm.default_min_badge}
                onChange={e => setEditForm(p => ({ ...p, default_min_badge: e.target.value }))}
                className="input"
              >
                <option value="bronze">Bronze</option>
                <option value="silver">Silver</option>
                <option value="gold">Gold</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input type="number" label="Sort order" value={editForm.sort_order} onChange={v => setEditForm(p => ({ ...p, sort_order: v }))} />
              <Input type="number" label="Sync trigger offset (min)" value={editForm.sync_trigger_offset_minutes} onChange={v => setEditForm(p => ({ ...p, sync_trigger_offset_minutes: v }))} />
            </div>
          </div>
        )}
      </div>

      {/* Sezione Cover */}
      <div className="card card-body vstack" style={{ gap: 'var(--s3)' }}>
        <div className="hstack" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="typ-h3"><ImageIcon size={16} style={{ display: 'inline' }} /> Cover</h3>
          <Link href="/media/covers" className="btn btn-ghost typ-micro">
            <ExternalLink size={12} /> Modifica in /media/covers
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <CoverPreview label="Orizzontale (16:9)" url={format.cover_horizontal_url} aspect="16/9" />
          <CoverPreview label="Verticale (9:16)" url={format.cover_vertical_url} aspect="9/16" />
        </div>
        {format.hero_url && <CoverPreview label="Hero" url={format.hero_url} aspect="16/9" />}
      </div>

      {/* Sezione Source */}
      <div className="card card-body vstack" style={{ gap: 'var(--s3)' }}>
        <h3 className="typ-h3"><Database size={16} style={{ display: 'inline' }} /> Source ({sources.length})</h3>
        {sources.length === 0 ? (
          <p className="typ-micro" style={{ color: 'var(--text-muted)' }}>
            Nessuna source collegata. Usa il wizard "Nuovo Format" per crearne una.
          </p>
        ) : (
          <div className="vstack" style={{ gap: 'var(--s2)' }}>
            {sources.map(src => (
              <div key={src.id} className="hstack card-body" style={{
                background: 'var(--card-muted)', borderRadius: 8, padding: 'var(--s2)',
                gap: 'var(--s2)', alignItems: 'center',
                opacity: src.enabled ? 1 : 0.5,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="hstack" style={{ gap: 'var(--s2)', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600 }}>{src.name ?? src.id}</span>
                    <span className="badge">{src.platform}</span>
                    {!src.enabled && <span className="badge" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>disabled</span>}
                  </div>
                  <p className="typ-micro" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                    {src.id} · {src.channel ?? '(nessun channel)'}
                  </p>
                  <p className="typ-micro" style={{ color: 'var(--text-muted)' }}>
                    Scan {src.scan_window}gg · max {src.max_videos_per_run}/run · cron {src.schedule_cron ?? 'manuale'}
                  </p>
                </div>
                <button
                  onClick={() => void toggleSource(src)}
                  className={`btn ${src.enabled ? 'btn-ghost' : 'btn-primary'} typ-micro`}
                  title={src.enabled ? 'Disabilita' : 'Riabilita'}
                >
                  {src.enabled ? <><EyeOff size={12} /> Disabilita</> : <><Eye size={12} /> Riabilita</>}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sezione Episodi */}
      <div className="card card-body vstack" style={{ gap: 'var(--s3)' }}>
        <div className="hstack" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="typ-h3"><Film size={16} style={{ display: 'inline' }} /> Episodi</h3>
          <Link
            href={`/media/episodes?format_id=${encodeURIComponent(id)}`}
            className="btn btn-ghost typ-micro"
          >
            <ExternalLink size={12} /> Gestisci in /media/episodes
          </Link>
        </div>
        <div className="hstack" style={{ gap: 'var(--s4)' }}>
          <Stat label="Totali" value={epStats.total} />
          <Stat label="Attivi" value={epStats.active} />
          <Stat label="Inattivi" value={epStats.total - epStats.active} />
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────── */

function Field({ label, value, multiline }: { label: string; value: string | null; multiline?: boolean }) {
  return (
    <div>
      <p className="typ-micro" style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</p>
      <p className={multiline ? 'typ-body' : 'typ-body'} style={{ wordBreak: 'break-word' }}>
        {value ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
      </p>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div>
      <label className="typ-micro block mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className="input" />
    </div>
  );
}

function Textarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="typ-micro block mb-1.5">{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} className="input" rows={2} />
    </div>
  );
}

function CoverPreview({ label, url, aspect }: { label: string; url: string | null; aspect: string }) {
  return (
    <div>
      <p className="typ-micro" style={{ color: 'var(--text-muted)', marginBottom: 6 }}>{label}</p>
      <div
        style={{
          aspectRatio: aspect, borderRadius: 6, overflow: 'hidden',
          background: 'var(--card-muted)',
          backgroundImage: url ? `url(${url})` : undefined,
          backgroundSize: 'cover', backgroundPosition: 'center',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {!url && <span className="typ-micro" style={{ color: 'var(--text-muted)' }}>nessuna</span>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="typ-h2" style={{ marginBottom: 0 }}>{value}</p>
      <p className="typ-micro" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </div>
  );
}
