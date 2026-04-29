'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowLeft, RefreshCw, Wand2, FileText, ImageIcon, ChevronRight,
  CheckCircle2, AlertTriangle, Clock,
} from 'lucide-react';

interface DraftItem {
  id: string;
  title: string;
  source_type: string;
  source_id: string | null;
  status: string;
  requires_approval: boolean;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  variantsSummary: {
    total: number; ready: number; published: number; failed: number; pending: number;
  };
  sourceImage: string | null;
}

const STATUS_FILTERS = [
  { id: '',           label: 'Tutte' },
  { id: 'review',     label: 'In review' },
  { id: 'approved',   label: 'Approvate' },
  { id: 'scheduled',  label: 'Programmate' },
  { id: 'published',  label: 'Pubblicate' },
  { id: 'failed',     label: 'Errori' },
] as const;

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft:      { label: 'Bozza',       color: 'var(--text-muted)' },
  review:     { label: 'In review',   color: 'var(--accent-raw)' },
  approved:   { label: 'Approvata',   color: 'var(--info)' },
  scheduled:  { label: 'Programmata', color: 'var(--info)' },
  published:  { label: 'Pubblicata',  color: 'var(--ok)' },
  failed:     { label: 'Errore',      color: 'var(--danger)' },
  cancelled:  { label: 'Annullata',   color: 'var(--text-muted)' },
};

export default function DraftsListPage() {
  const [items, setItems] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [total, setTotal] = useState(0);

  const load = (statusFilter: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    params.set('limit', '50');
    fetch(`/api/social/drafts?${params}`, { cache: 'no-store' })
      .then(r => r.json())
      .then((d: { items: DraftItem[]; total: number }) => {
        setItems(d.items ?? []);
        setTotal(d.total ?? 0);
      })
      .catch(() => { setItems([]); setTotal(0); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(filter); }, [filter]);

  return (
    <div className="vstack" style={{ gap: 'var(--s5)' }}>
      <div className="flex items-center gap-2 flex-wrap">
        <Link href="/social" className="btn btn-ghost btn-sm">
          <ArrowLeft className="w-4 h-4" /> Social
        </Link>
        <div className="grow" />
        <button onClick={() => load(filter)} className="btn btn-ghost btn-sm">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <Link href="/social/composer" className="btn btn-primary btn-sm">
          <Wand2 className="w-4 h-4" /> Nuovo
        </Link>
      </div>

      <div>
        <h1 className="typ-h1">Bozze</h1>
        <p className="typ-caption mt-1">
          Tutti i pacchetti social creati. Clicca per aprire e gestire le varianti.
        </p>
      </div>

      {/* Status filter */}
      <div className="flex gap-1.5 flex-wrap">
        {STATUS_FILTERS.map(f => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className="btn btn-sm"
              style={{
                background: active ? 'var(--accent-raw)' : 'var(--card)',
                color: active ? '#fff' : 'var(--text-hi)',
                border: `1px solid ${active ? 'var(--accent-raw)' : 'var(--hairline)'}`,
                fontWeight: active ? 600 : 500,
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-7 h-7 border-2 border-[color:var(--accent-raw)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="card card-body text-center" style={{ padding: 'var(--s5)' }}>
          <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
          <p className="typ-label">Nessuna bozza</p>
          <p className="typ-caption mt-1" style={{ color: 'var(--text-muted)' }}>
            {filter ? 'Cambia filtro o crea un pacchetto.' : 'Crea il tuo primo pacchetto social dal Composer.'}
          </p>
          <Link href="/social/composer" className="btn btn-primary btn-sm mt-3" style={{ alignSelf: 'center' }}>
            <Wand2 className="w-4 h-4" /> Crea pacchetto
          </Link>
        </div>
      ) : (
        <>
          <div className="typ-caption" style={{ color: 'var(--text-muted)' }}>
            {total} {total === 1 ? 'bozza' : 'bozze'} {filter ? `(filtro: ${STATUS_FILTERS.find(s => s.id === filter)?.label})` : ''}
          </div>
          <div className="vstack-tight">
            {items.map(d => <DraftRow key={d.id} draft={d} />)}
          </div>
        </>
      )}
    </div>
  );
}

function DraftRow({ draft }: { draft: DraftItem }) {
  const status = STATUS_LABEL[draft.status] ?? { label: draft.status, color: 'var(--text-muted)' };
  const v = draft.variantsSummary;

  return (
    <Link
      href={`/social/composer/draft/${draft.id}`}
      className="card card-hover"
      style={{
        padding: 12,
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: 12,
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      {/* Source thumbnail */}
      <div
        className="rounded-[var(--r-sm)] shrink-0"
        style={{
          width: 64, height: 64, background: 'var(--card-muted)',
          overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {draft.sourceImage ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={draft.sourceImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <ImageIcon className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
        )}
      </div>

      {/* Title + meta */}
      <div className="min-w-0">
        <div className="typ-label" style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {draft.title}
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-1 typ-micro" style={{ color: 'var(--text-muted)' }}>
          <span className="pill" style={{ fontSize: 9, padding: '1px 6px' }}>{draft.source_type}</span>
          <span
            className="pill"
            style={{ fontSize: 9, padding: '1px 6px', color: status.color, borderColor: status.color }}
          >
            {status.label}
          </span>
          <span>{v.total} variant{v.total === 1 ? 'e' : 'i'}</span>
          {v.ready > 0      && <span style={{ color: 'var(--ok)' }}><CheckCircle2 className="w-3 h-3 inline" /> {v.ready} ready</span>}
          {v.published > 0  && <span style={{ color: 'var(--ok)' }}><CheckCircle2 className="w-3 h-3 inline" /> {v.published} pubbl</span>}
          {v.failed > 0     && <span style={{ color: 'var(--danger)' }}><AlertTriangle className="w-3 h-3 inline" /> {v.failed}</span>}
          {v.pending > 0    && <span style={{ color: 'var(--info)' }}><Clock className="w-3 h-3 inline" /> {v.pending}</span>}
          <span style={{ marginLeft: 'auto' }}>
            {new Date(draft.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
    </Link>
  );
}
