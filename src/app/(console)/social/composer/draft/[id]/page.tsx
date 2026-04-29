'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, RefreshCw, Send, CheckCircle2, AlertTriangle, ImageIcon,
  Instagram, Facebook, ExternalLink, Trash2, Save, Clock, X,
} from 'lucide-react';

interface Variant {
  id: string;
  draft_id: string;
  platform: 'instagram' | 'facebook' | 'tiktok';
  format: string;
  caption: string | null;
  hashtags: string[] | null;
  asset_url: string | null;
  asset_type: 'image' | 'video' | 'album' | null;
  asset_meta: { width?: number; height?: number; mime?: string; recipe?: string } | null;
  scheduled_at: string | null;
  published_at: string | null;
  external_post_id: string | null;
  external_post_url: string | null;
  status: 'draft' | 'asset_pending' | 'asset_ready' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'skipped';
  error: string | null;
  latestJob: { status: string; error: string | null; attempts: number } | null;
}

interface Source {
  id: string;
  title?: string | null;
  image_url?: string | null;
  thumbnail_url?: string | null;
  type?: string;
  pill_category?: string | null;
}

interface DraftResponse {
  draft: {
    id: string;
    title: string;
    source_type: string;
    status: string;
    requires_approval: boolean;
    created_at: string;
  };
  variants: Variant[];
  source: Source | null;
}

const PLATFORM_META = {
  instagram: { Icon: Instagram, color: '#E1306C', label: 'Instagram' },
  facebook:  { Icon: Facebook,  color: '#1877F2', label: 'Facebook'  },
  tiktok:    { Icon: ImageIcon, color: '#000',    label: 'TikTok'    },
} as const;

const STATUS_LABEL: Record<Variant['status'], { label: string; color: string }> = {
  draft:         { label: 'Bozza',         color: 'var(--text-muted)' },
  asset_pending: { label: 'Asset in coda', color: 'var(--info)'       },
  asset_ready:   { label: 'Pronto',        color: 'var(--ok)'         },
  scheduled:     { label: 'Programmato',   color: 'var(--accent-raw)' },
  publishing:    { label: 'In pubblicazione', color: 'var(--info)'    },
  published:     { label: 'Pubblicato',    color: 'var(--ok)'         },
  failed:        { label: 'Errore',        color: 'var(--danger)'     },
  skipped:       { label: 'Saltato',       color: 'var(--text-muted)' },
};

export default function DraftPreviewPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const draftId = params.id;

  const [data, setData] = useState<DraftResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingDraft, setDeletingDraft] = useState(false);

  const deleteDraft = async () => {
    if (!confirm(`Eliminare l'intero pacchetto "${data?.draft.title}" e tutti gli asset R2?`)) return;
    setDeletingDraft(true);
    try {
      const r = await fetch(`/api/social/drafts/${draftId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
      router.push('/social/drafts');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Errore eliminazione');
      setDeletingDraft(false);
    }
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/social/drafts/${draftId}`, { cache: 'no-store' });
      const json = await res.json() as DraftResponse | { error: string };
      if (!res.ok) {
        setError((json as { error: string }).error || `HTTP ${res.status}`);
      } else {
        setData(json as DraftResponse);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore');
    } finally {
      setLoading(false);
    }
  }, [draftId]);

  useEffect(() => { load(); }, [load]);

  // Polling: while any variant is in asset_pending or publishing, refresh every 3s
  useEffect(() => {
    if (!data) return;
    const needsPolling = data.variants.some(v => v.status === 'asset_pending' || v.status === 'publishing');
    if (!needsPolling) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [data, load]);

  if (loading && !data) {
    return (
      <div className="vstack" style={{ gap: 'var(--s5)' }}>
        <div className="flex items-center justify-center h-32">
          <div className="w-7 h-7 border-2 border-[color:var(--accent-raw)] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="vstack" style={{ gap: 'var(--s5)' }}>
        <Link href="/social" className="btn btn-ghost btn-sm self-start">
          <ArrowLeft className="w-4 h-4" /> Social
        </Link>
        <div className="card card-body" style={{ borderColor: 'var(--danger)' }}>
          <p style={{ color: 'var(--danger)' }}>Errore: {error}</p>
        </div>
      </div>
    );
  }

  const { draft, variants, source } = data;
  const sourceImage = source?.image_url ?? source?.thumbnail_url;

  return (
    <div className="vstack" style={{ gap: 'var(--s5)' }}>
      <div className="flex items-center gap-2 flex-wrap">
        <Link href="/social/drafts" className="btn btn-ghost btn-sm">
          <ArrowLeft className="w-4 h-4" /> Bozze
        </Link>
        <div className="grow" />
        <button onClick={load} className="btn btn-ghost btn-sm">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Ricarica
        </button>
        <button
          onClick={deleteDraft}
          disabled={deletingDraft}
          className="btn btn-ghost btn-sm"
          style={{ color: 'var(--danger)' }}
        >
          {deletingDraft
            ? <><RefreshCw className="w-4 h-4 animate-spin" /> Eliminazione…</>
            : <><X className="w-4 h-4" /> Elimina pacchetto</>}
        </button>
      </div>

      <div>
        <h1 className="typ-h1">{draft.title}</h1>
        <p className="typ-caption mt-1" style={{ color: 'var(--text-muted)' }}>
          Pacchetto {draft.source_type} · {variants.length} variant{variants.length === 1 ? 'e' : 'i'} ·
          stato bozza: <strong>{draft.status}</strong>
        </p>
      </div>

      {/* Source preview */}
      {sourceImage && (
        <div className="card card-body flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sourceImage} alt="" style={{ width: 80, height: 80, borderRadius: 'var(--r-sm)', objectFit: 'cover' }} />
          <div className="grow min-w-0">
            <div className="typ-micro" style={{ color: 'var(--text-muted)' }}>Sorgente</div>
            <div className="typ-label truncate">{source?.title ?? source?.id}</div>
          </div>
        </div>
      )}

      {/* Variants */}
      <div className="vstack" style={{ gap: 'var(--s4)' }}>
        {variants.map(v => (
          <VariantCard key={v.id} variant={v} onChanged={load} />
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   VariantCard — preview asset + caption editor + publish button
   ────────────────────────────────────────────────────────────────── */

function VariantCard({ variant, onChanged }: { variant: Variant; onChanged: () => void }) {
  const meta = PLATFORM_META[variant.platform] ?? PLATFORM_META.instagram;
  const Icon = meta.Icon;
  const statusInfo = STATUS_LABEL[variant.status];

  const [captionDraft, setCaptionDraft] = useState(variant.caption ?? '');
  const [savingCaption, setSavingCaption] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const captionDirty = captionDraft !== (variant.caption ?? '');

  const saveCaption = async () => {
    setSavingCaption(true);
    setActionError(null);
    try {
      const r = await fetch(`/api/social/variants/${variant.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption: captionDraft }),
      });
      if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
      onChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Errore');
    } finally {
      setSavingCaption(false);
    }
  };

  const publishNow = async () => {
    if (publishing) return;
    if (!confirm(`Pubblicare ora su ${meta.label}? Andrà online subito sulla pagina LAVIKA.`)) return;
    setPublishing(true);
    setActionError(null);
    try {
      const r = await fetch(`/api/social/variants/${variant.id}/publish`, { method: 'POST' });
      const data = await r.json() as { ok: boolean; error?: string };
      if (!r.ok || !data.ok) throw new Error(data.error || `HTTP ${r.status}`);
      onChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Errore');
    } finally {
      setPublishing(false);
    }
  };

  const removeVariant = async () => {
    if (!confirm('Rimuovere questa variante dal pacchetto?')) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/social/variants/${variant.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
      onChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Errore');
    } finally {
      setDeleting(false);
    }
  };

  const isImage = variant.asset_type === 'image';
  const isVideo = variant.asset_type === 'video';
  const canPublish = variant.asset_url && (variant.status === 'asset_ready' || variant.status === 'scheduled' || variant.status === 'failed');
  const isPublished = variant.status === 'published';

  // Constrain preview height on mobile so the card stays usable.
  // On tablet+ (md), switch to 2-col side-by-side.
  return (
    <div
      className="card variant-card"
      style={{
        padding: 16,
        borderColor: isPublished ? 'color-mix(in oklab, var(--ok) 30%, transparent)' : 'var(--hairline-soft)',
      }}
    >
      <div className="variant-card-grid">
        {/* Asset preview */}
        <div className="variant-asset" style={{
          background: 'var(--card-muted)',
          borderRadius: 'var(--r-sm)',
          overflow: 'hidden',
          aspectRatio: variant.asset_meta?.width && variant.asset_meta?.height
            ? `${variant.asset_meta.width} / ${variant.asset_meta.height}`
            : '4 / 5',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}>
          {variant.asset_url && isImage && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={variant.asset_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
          {variant.asset_url && isVideo && (
            <video
              src={variant.asset_url}
              controls
              muted
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
          {!variant.asset_url && variant.status === 'asset_pending' && (
            <div className="vstack-tight items-center" style={{ color: 'var(--text-muted)' }}>
              <div className="w-7 h-7 border-2 border-[color:var(--accent-raw)] border-t-transparent rounded-full animate-spin" />
              <span className="typ-caption">In generazione…</span>
            </div>
          )}
          {!variant.asset_url && variant.status === 'failed' && (
            <div className="vstack-tight items-center" style={{ color: 'var(--danger)' }}>
              <AlertTriangle className="w-7 h-7" />
              <span className="typ-caption">Errore generazione</span>
            </div>
          )}
        </div>

      {/* Right side: meta + caption + actions */}
      <div className="vstack-tight" style={{ minWidth: 0 }}>
        <div className="flex items-center gap-2 flex-wrap">
          <Icon className="w-4 h-4" style={{ color: meta.color }} />
          <span className="typ-label">{meta.label}</span>
          <span className="pill" style={{ fontSize: 10, padding: '2px 8px' }}>{variant.format}</span>
          <span className="grow" />
          <span
            className="pill"
            style={{ fontSize: 10, padding: '2px 8px', color: statusInfo.color, borderColor: statusInfo.color }}
          >
            {statusInfo.label}
          </span>
        </div>

        {variant.asset_meta?.width && (
          <div className="typ-micro" style={{ color: 'var(--text-muted)' }}>
            {variant.asset_meta.width}×{variant.asset_meta.height}
            {variant.asset_meta.recipe && <> · {variant.asset_meta.recipe}</>}
          </div>
        )}

        {/* Caption editor */}
        <div style={{ marginTop: 8 }}>
          <label className="typ-micro block mb-1" style={{ color: 'var(--text-muted)' }}>Caption</label>
          <textarea
            value={captionDraft}
            onChange={e => setCaptionDraft(e.target.value)}
            disabled={isPublished || publishing}
            rows={4}
            className="input"
            style={{ resize: 'vertical', minHeight: 80, fontFamily: 'inherit', fontSize: 13 }}
          />
          {captionDirty && !isPublished && (
            <button onClick={saveCaption} disabled={savingCaption} className="btn btn-ghost btn-sm mt-2">
              {savingCaption
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Salvataggio…</>
                : <><Save className="w-3.5 h-3.5" /> Salva caption</>}
            </button>
          )}
        </div>

        {/* Error from variant or action */}
        {(variant.error || actionError) && (
          <div className="card card-body mt-2" style={{ borderColor: 'var(--danger)', background: 'color-mix(in oklab, var(--danger) 8%, var(--card))', padding: '8px 12px' }}>
            <p className="typ-micro" style={{ color: 'var(--danger)', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
              {actionError || variant.error}
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap mt-3">
          {canPublish && (
            <button onClick={publishNow} disabled={publishing} className="btn btn-primary btn-sm">
              {publishing
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Pubblicazione…</>
                : <><Send className="w-3.5 h-3.5" /> Pubblica subito</>}
            </button>
          )}
          {isPublished && variant.external_post_url && (
            <a
              href={variant.external_post_url}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--ok)' }}
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Apri post <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {!isPublished && (
            <>
              <button disabled className="btn btn-ghost btn-sm" title="Schedule arriva nel prossimo step">
                <Clock className="w-3.5 h-3.5" /> Programma
              </button>
              <button onClick={removeVariant} disabled={deleting} className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}>
                <Trash2 className="w-3.5 h-3.5" /> Rimuovi
              </button>
            </>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
