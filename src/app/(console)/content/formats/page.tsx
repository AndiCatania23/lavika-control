'use client';

/**
 * /content/formats — lista format con stats (FASE 3 piano onboarding format)
 *
 * Mobile-first. Mostra per ogni format:
 *  - thumbnail (cover_horizontal_url o placeholder)
 *  - titolo + categoria + slug
 *  - counts: episodi attivi/totali, source enabled/totale
 *  - ultimo sync (se presente)
 *  - badge default
 *
 * Filtri: search per titolo, filtro categoria, toggle "vuoti" (Coming Soon).
 *
 * CTA "+ Nuovo Format" è placeholder per wizard FASE 4 (alert per ora).
 *
 * Dati live da GET /api/console/formats.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Search, ChevronRight, Lock } from 'lucide-react';

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
  episodes_total: number;
  episodes_active: number;
  sources_total: number;
  sources_enabled: number;
  last_sync_at: string | null;
}

const PLACEHOLDER = '/immagini/placeholder.webp';

function formatRelative(iso: string | null): string | null {
  if (!iso) return null;
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

export default function FormatsPage() {
  const router = useRouter();
  const [formats, setFormats] = useState<FormatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showEmpty, setShowEmpty] = useState(true);
  const [wizardEnabled, setWizardEnabled] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fmtRes, flagsRes] = await Promise.all([
        fetch('/api/console/formats', { cache: 'no-store' }),
        fetch('/api/console/feature-flags', { cache: 'no-store' }),
      ]);
      const fmtData = await fmtRes.json();
      const flagsData = await flagsRes.json();
      if (fmtRes.ok) setFormats(fmtData.items ?? []);
      else console.error('formats fetch error', fmtData);
      setWizardEnabled(Boolean(flagsData?.enable_format_wizard?.enabled));
    } catch (err) {
      console.error('formats fetch failed', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const f of formats) if (f.category) set.add(f.category);
    return ['all', ...Array.from(set).sort()];
  }, [formats]);

  const filtered = useMemo(() => {
    return formats.filter(f => {
      if (!showEmpty && f.episodes_total === 0) return false;
      if (categoryFilter !== 'all' && f.category !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (f.title ?? '').toLowerCase().includes(q) || f.id.toLowerCase().includes(q);
      }
      return true;
    });
  }, [formats, search, categoryFilter, showEmpty]);

  return (
    <div className="page-container vstack" style={{ gap: 'var(--s4)' }}>
      {/* Header */}
      <div className="hstack" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--s3)' }}>
        <div>
          <h1 className="typ-h2">Format</h1>
          <p className="typ-body" style={{ color: 'var(--text-muted)' }}>
            {formats.length} format · {filtered.length} visibili
          </p>
        </div>
        <div className="hstack" style={{ gap: 'var(--s2)' }}>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="btn btn-ghost"
            title="Ricarica"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          {wizardEnabled ? (
            <button
              onClick={() => router.push('/content/formats/new')}
              className="btn btn-primary"
            >
              <Plus size={16} /> Nuovo Format
            </button>
          ) : (
            <button
              disabled
              className="btn btn-ghost"
              title="Wizard disabilitato. Abilita il flag enable_format_wizard in sync_config per attivarlo."
            >
              <Lock size={16} /> Nuovo Format
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="card card-body vstack" style={{ gap: 'var(--s3)' }}>
        <div className="hstack" style={{ gap: 'var(--s2)', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cerca per titolo o slug..."
              className="input"
              style={{ paddingLeft: 28 }}
            />
          </div>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="input"
            style={{ minWidth: 160 }}
          >
            {categories.map(c => (
              <option key={c} value={c}>{c === 'all' ? 'Tutte le categorie' : c}</option>
            ))}
          </select>
          <label className="hstack" style={{ gap: 'var(--s2)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showEmpty}
              onChange={e => setShowEmpty(e.target.checked)}
            />
            <span className="typ-micro">Mostra Coming Soon</span>
          </label>
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="card card-body" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          Caricamento...
        </div>
      ) : filtered.length === 0 ? (
        <div className="card card-body" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          Nessun format trovato.
        </div>
      ) : (
        <div className="vstack" style={{ gap: 'var(--s2)' }}>
          {filtered.map(f => (
            <Link
              key={f.id}
              href={`/content/formats/${encodeURIComponent(f.id)}`}
              className="card card-body hstack"
              style={{ gap: 'var(--s3)', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}
            >
              <div
                style={{
                  width: 64, height: 36, flexShrink: 0,
                  borderRadius: 6, overflow: 'hidden',
                  background: 'var(--card-muted)',
                  backgroundImage: `url(${f.cover_horizontal_url || PLACEHOLDER})`,
                  backgroundSize: 'cover', backgroundPosition: 'center',
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="hstack" style={{ gap: 'var(--s2)', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="typ-body" style={{ fontWeight: 600 }}>{f.title ?? f.id}</span>
                  <span className="badge">{f.default_min_badge}</span>
                  {f.episodes_total === 0 && (
                    <span className="badge" style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}>
                      Coming Soon
                    </span>
                  )}
                </div>
                <div className="hstack typ-micro" style={{ gap: 'var(--s2)', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{f.id}</span>
                  {f.category && <span>· {f.category}</span>}
                  <span>· {f.episodes_active}/{f.episodes_total} ep</span>
                  <span>· {f.sources_enabled}/{f.sources_total} src</span>
                  {formatRelative(f.last_sync_at) && (
                    <span>· sync {formatRelative(f.last_sync_at)}</span>
                  )}
                </div>
              </div>
              <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
