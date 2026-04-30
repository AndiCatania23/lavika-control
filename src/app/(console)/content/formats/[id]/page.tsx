'use client';

/**
 * /content/formats/[id] — Dettaglio format (FASE 5.A piano onboarding)
 *
 * Layout mobile-first compatto:
 *  - Header sticky: back + titolo + refresh
 *  - Stats row VISIBILE (non nel hero, leggibile sempre)
 *  - Hero cover (16:9) con fallback placeholder se URL non carica
 *  - Sezioni dense: Identità (key/value), Cover, Source, Episodi
 *  - Padding-bottom 96px per evitare bottom-nav su mobile
 *
 * Cover NON gestite qui (link a /media/covers).
 * Upload video manuale rimandato a F5.B.
 */
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft, Edit2, Save, X, RefreshCw, ExternalLink, Eye, EyeOff, Image as ImageIcon,
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

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'ora';
  if (min < 60) return `${min}m fa`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h fa`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}g fa`;
  return d.toLocaleDateString('it-IT');
}

export default function FormatDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? '';

  const [format, setFormat] = useState<FormatRow | null>(null);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [stats, setStats] = useState<EpisodeStats | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coverError, setCoverError] = useState(false);

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
    setCoverError(false);
    try {
      const [fmtRes, statsRes, listRes] = await Promise.all([
        fetch(`/api/console/formats/${encodeURIComponent(id)}`, { cache: 'no-store' }),
        fetch('/api/media/episodes/stats', { cache: 'no-store' }),
        fetch('/api/console/formats', { cache: 'no-store' }),
      ]);
      const fmtData = await fmtRes.json();
      const statsData = await statsRes.json();
      const listData = await listRes.json();
      if (!fmtRes.ok) throw new Error(fmtData.error ?? 'Format non trovato');
      setFormat(fmtData.format);
      setSources(fmtData.sources ?? []);
      setStats(statsData);
      const myRow = (listData.items ?? []).find((r: FormatRow & { last_sync_at?: string | null }) => r.id === id);
      setLastSyncAt(myRow?.last_sync_at ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore caricamento');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (id) void load(); }, [id, load]);

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

  const submitEdit = useCallback(async () => {
    setSaving(true);
    try {
      const offset = Number(editForm.sync_trigger_offset_minutes);
      const sortOrder = Number(editForm.sort_order);
      if (!Number.isFinite(offset) || offset <= 0 || offset > 1440) throw new Error('Sync offset 1..1440');
      if (!Number.isFinite(sortOrder)) throw new Error('Sort order non valido');
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
    if (source.enabled && !confirm(`Disattivare "${source.id}"?`)) return;
    const res = await fetch(`/api/console/video-sources/${encodeURIComponent(source.id)}`, {
      method: source.enabled ? 'DELETE' : 'PATCH',
      headers: source.enabled ? {} : { 'Content-Type': 'application/json' },
      body: source.enabled ? undefined : JSON.stringify({ enabled: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) await load();
    else alert(data.error ?? 'Errore');
  }, [load]);

  if (loading) {
    return <div className="page-container"><div className="card card-body" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Caricamento…</div></div>;
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
  const sourcesEnabled = sources.filter(s => s.enabled).length;

  return (
    <div className="page-container vstack" style={{ gap: 'var(--s3)', paddingBottom: 96 }}>
      {/* Header — minimal, mobile-friendly */}
      <div className="hstack" style={{ gap: 'var(--s2)', alignItems: 'center' }}>
        <Link href="/content/formats" className="btn btn-ghost" title="Indietro" style={{ flexShrink: 0 }}>
          <ArrowLeft size={16} />
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="typ-h2" style={{ marginBottom: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {format.title ?? format.id}
          </h1>
          <p className="typ-micro" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 0 }}>
            {format.id}
          </p>
        </div>
        <button onClick={() => void load()} className="btn btn-ghost" title="Ricarica" style={{ flexShrink: 0 }}>
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Stats row — sempre visibili, NO sopra hero */}
      <div className="hstack" style={{ gap: 'var(--s2)', flexWrap: 'wrap' }}>
        <Pill label={format.default_min_badge.toUpperCase()} variant="primary" />
        {format.category && <Pill label={format.category} />}
        <Pill label={`${epStats.total} ep`} />
        <Pill label={`${sourcesEnabled}/${sources.length} src`} variant={sourcesEnabled > 0 ? 'success' : 'muted'} />
        <Pill label={`sync ${formatRelative(lastSyncAt)}`} variant="muted" />
      </div>

      {/* Hero cover — più piccolo (21:9), con fallback */}
      <div
        className="card"
        style={{
          aspectRatio: '21 / 9',
          overflow: 'hidden',
          position: 'relative',
          background: 'var(--card-muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {format.cover_horizontal_url && !coverError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={format.cover_horizontal_url}
            alt={format.title ?? format.id}
            onError={() => setCoverError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div className="vstack" style={{ alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
            <ImageIcon size={28} />
            <span className="typ-micro">Cover non disponibile</span>
          </div>
        )}
      </div>

      {/* Sezione Identità */}
      <Section
        title="Identità"
        action={
          !editing ? (
            <button onClick={startEdit} className="btn btn-ghost typ-micro"><Edit2 size={12} /> Modifica</button>
          ) : (
            <div className="hstack" style={{ gap: 'var(--s2)' }}>
              <button onClick={() => setEditing(false)} disabled={saving} className="btn btn-ghost typ-micro"><X size={12} /></button>
              <button onClick={() => void submitEdit()} disabled={saving} className="btn btn-primary typ-micro">
                <Save size={12} /> {saving ? '…' : 'Salva'}
              </button>
            </div>
          )
        }
      >
        {!editing ? (
          <dl className="vstack" style={{ gap: 'var(--s2)', margin: 0 }}>
            <Row label="Titolo" value={format.title} />
            <Row label="Descrizione" value={format.description} multiline />
            <Row label="Categoria" value={format.category} />
            <Row label="Badge" value={format.default_min_badge} />
            <Row label="Sort order" value={String(format.sort_order)} />
            <Row label="Sync offset" value={`${format.sync_trigger_offset_minutes} min`} />
          </dl>
        ) : (
          <div className="vstack" style={{ gap: 'var(--s2)' }}>
            <Field label="Titolo" value={editForm.title} onChange={v => setEditForm(p => ({ ...p, title: v }))} />
            <FieldArea label="Descrizione" value={editForm.description} onChange={v => setEditForm(p => ({ ...p, description: v }))} />
            <Field label="Categoria" value={editForm.category} onChange={v => setEditForm(p => ({ ...p, category: v }))} />
            <div>
              <label className="typ-micro block mb-1.5">Badge minimo</label>
              <select value={editForm.default_min_badge}
                onChange={e => setEditForm(p => ({ ...p, default_min_badge: e.target.value }))}
                className="input">
                <option value="bronze">Bronze</option>
                <option value="silver">Silver</option>
                <option value="gold">Gold</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field type="number" label="Sort" value={editForm.sort_order} onChange={v => setEditForm(p => ({ ...p, sort_order: v }))} />
              <Field type="number" label="Offset (min)" value={editForm.sync_trigger_offset_minutes} onChange={v => setEditForm(p => ({ ...p, sync_trigger_offset_minutes: v }))} />
            </div>
          </div>
        )}
      </Section>

      {/* Sezione Cover */}
      <Section
        title="Cover"
        action={
          <Link href="/media/covers" className="btn btn-ghost typ-micro">
            <ExternalLink size={12} /> /media/covers
          </Link>
        }
      >
        <div className="hstack" style={{ gap: 'var(--s2)', alignItems: 'flex-start' }}>
          <ThumbPreview label="16:9" url={format.cover_horizontal_url} aspect="16/9" width={160} />
          <ThumbPreview label="9:16" url={format.cover_vertical_url} aspect="9/16" width={64} />
        </div>
      </Section>

      {/* Sezione Source */}
      <Section title={`Source (${sources.length})`}>
        {sources.length === 0 ? (
          <p className="typ-micro" style={{ color: 'var(--text-muted)', margin: 0 }}>
            Nessuna source. Usa il wizard "+ Nuovo Format" per aggiungerne.
          </p>
        ) : (
          <div className="vstack" style={{ gap: 'var(--s2)' }}>
            {sources.map(src => (
              <div key={src.id} style={{
                background: 'var(--card-muted)', borderRadius: 8, padding: 'var(--s2) var(--s3)',
                display: 'flex', gap: 'var(--s2)', alignItems: 'center',
                opacity: src.enabled ? 1 : 0.6,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="hstack" style={{ gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{src.name ?? src.id}</span>
                    <Pill label={src.platform} small />
                    {!src.enabled && <Pill label="off" variant="danger" small />}
                  </div>
                  <p className="typ-micro" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all', margin: 0 }}>
                    {src.id}
                  </p>
                  <p className="typ-micro" style={{ color: 'var(--text-muted)', margin: 0 }}>
                    {src.scan_window}gg · {src.max_videos_per_run}/run · {src.schedule_cron ?? 'manuale'}
                  </p>
                </div>
                <button onClick={() => void toggleSource(src)}
                  className="btn btn-ghost typ-micro" style={{ flexShrink: 0 }}
                  title={src.enabled ? 'Disabilita' : 'Riabilita'}>
                  {src.enabled ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Sezione Episodi */}
      <Section
        title="Episodi"
        action={
          <Link href={`/media/episodes?format_id=${encodeURIComponent(id)}`} className="btn btn-ghost typ-micro">
            <ExternalLink size={12} /> /media/episodes
          </Link>
        }
      >
        <div className="hstack" style={{ gap: 'var(--s4)' }}>
          <BigStat label="Totali" value={epStats.total} />
          <BigStat label="Attivi" value={epStats.active} />
          <BigStat label="Inattivi" value={epStats.total - epStats.active} muted />
        </div>
      </Section>
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────── */

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card card-body vstack" style={{ gap: 'var(--s2)', padding: 'var(--s3)' }}>
      <div className="hstack" style={{ justifyContent: 'space-between', alignItems: 'center', minHeight: 28 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text)' }}>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Pill({ label, variant = 'default', small }: {
  label: string; variant?: 'default' | 'primary' | 'success' | 'muted' | 'danger'; small?: boolean;
}) {
  const styles: Record<string, React.CSSProperties> = {
    default: { background: 'var(--card-muted)', color: 'var(--text)' },
    primary: { background: 'var(--primary)', color: 'white' },
    success: { background: 'var(--success-soft, #dcfce7)', color: 'var(--success, #166534)' },
    muted:   { background: 'var(--card-muted)', color: 'var(--text-muted)' },
    danger:  { background: 'var(--danger-soft, #fee2e2)', color: 'var(--danger, #991b1b)' },
  };
  return (
    <span style={{
      display: 'inline-block',
      padding: small ? '1px 6px' : '3px 8px',
      borderRadius: 999,
      fontSize: small ? 11 : 12,
      fontWeight: 500,
      lineHeight: 1.4,
      whiteSpace: 'nowrap',
      ...styles[variant],
    }}>{label}</span>
  );
}

function Row({ label, value, multiline }: { label: string; value: string | null; multiline?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 'var(--s2)', alignItems: multiline ? 'flex-start' : 'baseline' }}>
      <dt className="typ-micro" style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, margin: 0 }}>
        {label}
      </dt>
      <dd style={{ margin: 0, fontSize: 14, lineHeight: 1.4, wordBreak: 'break-word' }}>
        {value ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
      </dd>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="typ-micro block mb-1.5">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className="input" />
    </div>
  );
}

function FieldArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="typ-micro block mb-1.5">{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} className="input" rows={2} />
    </div>
  );
}

function ThumbPreview({ label, url, aspect, width }: { label: string; url: string | null; aspect: string; width: number }) {
  const [err, setErr] = useState(false);
  return (
    <div style={{ flexShrink: 0 }}>
      <p className="typ-micro" style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
      <div style={{
        width, aspectRatio: aspect, borderRadius: 6, overflow: 'hidden',
        background: 'var(--card-muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {url && !err ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} onError={() => setErr(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <ImageIcon size={16} style={{ color: 'var(--text-muted)' }} />
        )}
      </div>
    </div>
  );
}

function BigStat({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div>
      <p style={{ fontSize: 24, fontWeight: 700, margin: 0, lineHeight: 1, color: muted ? 'var(--text-muted)' : 'var(--text)' }}>
        {value}
      </p>
      <p className="typ-micro" style={{ color: 'var(--text-muted)', margin: 0, marginTop: 2 }}>
        {label}
      </p>
    </div>
  );
}
