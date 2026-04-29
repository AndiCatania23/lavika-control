'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowLeft, RefreshCw, CheckCircle2, AlertTriangle, XCircle,
  Instagram, Facebook, Key, Send, ExternalLink,
} from 'lucide-react';

interface TestResponse {
  ok: boolean;
  error?: string;
  config?: { appId: string; pageId: string; igBusinessId: string };
  token?: {
    valid: boolean;
    type: string;
    scopes: string[];
    expiry: { status: 'never_expires' | 'expires'; message?: string; expiresAt?: string; daysRemaining?: number };
  };
  fbPage?: {
    id: string; name: string; category?: string;
    followers?: number; picture?: string;
  };
  igAccount?: {
    id: string; username: string; name?: string; biography?: string;
    followers?: number; following?: number; mediaCount?: number;
    profilePicture?: string;
  };
}

export default function ConnectionStatusPage() {
  const [data, setData] = useState<TestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshAt, setRefreshAt] = useState(Date.now());

  useEffect(() => {
    setLoading(true);
    fetch('/api/social/meta/test', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setData(d))
      .catch(err => setData({ ok: false, error: err instanceof Error ? err.message : 'Errore' }))
      .finally(() => setLoading(false));
  }, [refreshAt]);

  return (
    <div className="vstack" style={{ gap: 'var(--s5)' }}>
      <div className="flex items-center gap-2 flex-wrap">
        <Link href="/social" className="btn btn-ghost btn-sm">
          <ArrowLeft className="w-4 h-4" /> Social
        </Link>
        <div className="grow" />
        <button
          onClick={() => setRefreshAt(Date.now())}
          disabled={loading}
          className="btn btn-ghost btn-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Ricarica
        </button>
      </div>

      <div>
        <h1 className="typ-h1">Stato Connessione Meta</h1>
        <p className="typ-caption mt-1">
          Verifica integrazione Facebook + Instagram via Page Access Token (single-account, no OAuth runtime).
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-32">
          <div className="w-7 h-7 border-2 border-[color:var(--accent-raw)] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && data && !data.ok && (
        <div
          className="card card-body flex items-start gap-3"
          style={{
            borderColor: 'color-mix(in oklab, var(--danger) 30%, transparent)',
            background: 'color-mix(in oklab, var(--danger) 8%, var(--card))',
          }}
        >
          <XCircle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
          <div>
            <p className="typ-label" style={{ color: 'var(--danger)' }}>Connessione fallita</p>
            <p className="typ-caption mt-1" style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{data.error}</p>
          </div>
        </div>
      )}

      {!loading && data?.ok && (
        <>
          {/* Token health */}
          <section>
            <h2 className="typ-label" style={{ marginBottom: 8 }}>Token</h2>
            <div className="card card-body vstack-tight">
              <div className="flex items-center gap-3">
                <Key className="w-5 h-5 shrink-0" style={{ color: data.token!.valid ? 'var(--ok)' : 'var(--danger)' }} />
                <div className="grow">
                  <div className="typ-label">
                    {data.token!.valid ? 'Token valido' : 'Token non valido'}
                    <span className="pill ml-2" style={{ fontSize: 10, padding: '1px 6px' }}>{data.token!.type}</span>
                  </div>
                  <div className="typ-caption mt-1" style={{ color: 'var(--text-muted)' }}>
                    {data.token!.expiry.status === 'never_expires'
                      ? '✓ Mai scade (Page token a vita)'
                      : `Scade tra ${data.token!.expiry.daysRemaining} giorni (${data.token!.expiry.expiresAt?.slice(0, 10)})`}
                  </div>
                </div>
                {data.token!.valid
                  ? <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: 'var(--ok)' }} />
                  : <AlertTriangle className="w-5 h-5 shrink-0" style={{ color: 'var(--danger)' }} />
                }
              </div>
              <div style={{ paddingTop: 8, borderTop: '1px solid var(--hairline-soft)' }}>
                <div className="typ-micro mb-1.5" style={{ color: 'var(--text-muted)' }}>Permessi attivi ({data.token!.scopes.length}):</div>
                <div className="flex gap-1 flex-wrap">
                  {data.token!.scopes.map(s => (
                    <span key={s} className="pill" style={{ fontSize: 10, padding: '2px 6px', fontFamily: 'monospace' }}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* FB Page */}
          <section>
            <h2 className="typ-label" style={{ marginBottom: 8 }}>Facebook Page</h2>
            <div
              className="card card-body flex items-center gap-3"
              style={{ borderColor: '#1877F2' + '30' }}
            >
              {data.fbPage!.picture ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={data.fbPage!.picture} alt={data.fbPage!.name} className="rounded-full shrink-0" style={{ width: 56, height: 56, objectFit: 'cover' }} />
              ) : (
                <div className="rounded-full shrink-0 inline-grid place-items-center" style={{ width: 56, height: 56, background: 'var(--card-muted)' }}>
                  <Facebook className="w-6 h-6" style={{ color: '#1877F2' }} />
                </div>
              )}
              <div className="grow min-w-0">
                <div className="flex items-center gap-2">
                  <Facebook className="w-4 h-4 shrink-0" style={{ color: '#1877F2' }} />
                  <span className="typ-label">{data.fbPage!.name}</span>
                </div>
                <div className="typ-caption" style={{ color: 'var(--text-muted)' }}>
                  {data.fbPage!.category} · {data.fbPage!.followers ?? 0} follower
                </div>
                <div className="typ-micro mt-1" style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  id: {data.fbPage!.id}
                </div>
              </div>
              <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: 'var(--ok)' }} />
            </div>
          </section>

          {/* IG Account */}
          <section>
            <h2 className="typ-label" style={{ marginBottom: 8 }}>Instagram Business</h2>
            <div
              className="card card-body vstack-tight"
              style={{ borderColor: '#E1306C' + '30' }}
            >
              <div className="flex items-center gap-3">
                {data.igAccount!.profilePicture ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={data.igAccount!.profilePicture} alt={data.igAccount!.username} className="rounded-full shrink-0" style={{ width: 56, height: 56, objectFit: 'cover' }} />
                ) : (
                  <div className="rounded-full shrink-0 inline-grid place-items-center" style={{ width: 56, height: 56, background: 'var(--card-muted)' }}>
                    <Instagram className="w-6 h-6" style={{ color: '#E1306C' }} />
                  </div>
                )}
                <div className="grow min-w-0">
                  <div className="flex items-center gap-2">
                    <Instagram className="w-4 h-4 shrink-0" style={{ color: '#E1306C' }} />
                    <span className="typ-label">@{data.igAccount!.username}</span>
                  </div>
                  <div className="typ-caption" style={{ color: 'var(--text-muted)' }}>{data.igAccount!.name}</div>
                  <div className="typ-micro mt-1" style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    id: {data.igAccount!.id}
                  </div>
                </div>
                <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: 'var(--ok)' }} />
              </div>
              {data.igAccount!.biography && (
                <div className="typ-caption" style={{ paddingTop: 8, borderTop: '1px solid var(--hairline-soft)', whiteSpace: 'pre-wrap' }}>
                  {data.igAccount!.biography}
                </div>
              )}
              <div className="flex items-center gap-4" style={{ paddingTop: 8, borderTop: '1px solid var(--hairline-soft)' }}>
                <div className="typ-caption">
                  <strong>{data.igAccount!.followers ?? 0}</strong> <span style={{ color: 'var(--text-muted)' }}>follower</span>
                </div>
                <div className="typ-caption">
                  <strong>{data.igAccount!.following ?? 0}</strong> <span style={{ color: 'var(--text-muted)' }}>seguiti</span>
                </div>
                <div className="typ-caption">
                  <strong>{data.igAccount!.mediaCount ?? 0}</strong> <span style={{ color: 'var(--text-muted)' }}>post</span>
                </div>
              </div>
            </div>
          </section>

          {/* Config IDs (for debugging) */}
          <section>
            <h2 className="typ-label" style={{ marginBottom: 8 }}>Configurazione</h2>
            <div className="card card-body" style={{ background: 'var(--card-muted)' }}>
              <pre className="typ-micro" style={{ margin: 0, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
{`META_APP_ID=${data.config!.appId}
META_PAGE_ID=${data.config!.pageId}
META_IG_BUSINESS_ID=${data.config!.igBusinessId}`}
              </pre>
            </div>
          </section>

          {/* Test publish */}
          <TestPublish />
        </>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Test publish — pubblica una foto + caption a FB/IG per validare
   che il publisher Meta funzioni davvero.
   ────────────────────────────────────────────────────────────────── */

interface PublishResult {
  platform: 'fb' | 'ig';
  ok: boolean;
  postId?: string;
  permalink?: string;
  error?: string;
}

const DEFAULT_TEST_IMAGE = 'https://pub-caae50e77b854437b46967f95fd48914.r2.dev/pills/pill-stat-h.webp';

function TestPublish() {
  const [imageUrl, setImageUrl] = useState(DEFAULT_TEST_IMAGE);
  const [caption, setCaption] = useState('Test post LAVIKA Social Manager — feel free to delete.');
  const [platforms, setPlatforms] = useState<{ fb: boolean; ig: boolean }>({ fb: true, ig: false });
  const [publishing, setPublishing] = useState(false);
  const [results, setResults] = useState<PublishResult[] | null>(null);

  const isWebp = imageUrl.toLowerCase().endsWith('.webp');
  const igEnabled = platforms.ig;
  const igWillFail = isWebp && igEnabled;

  const handlePublish = async () => {
    const selected = (['fb', 'ig'] as const).filter(p => platforms[p]);
    if (selected.length === 0) return;
    setPublishing(true);
    setResults(null);
    try {
      const res = await fetch('/api/social/meta/test-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, caption, platforms: selected }),
      });
      const data = await res.json() as { results: PublishResult[] };
      setResults(data.results);
    } catch (err) {
      setResults([{ platform: 'fb', ok: false, error: err instanceof Error ? err.message : 'Errore' }]);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <section>
      <h2 className="typ-label" style={{ marginBottom: 8 }}>Test pubblicazione</h2>
      <div
        className="card card-body vstack-tight"
        style={{
          borderColor: 'color-mix(in oklab, var(--warn) 28%, transparent)',
          background: 'color-mix(in oklab, var(--warn) 5%, var(--card))',
        }}
      >
        <p className="typ-caption" style={{ color: 'var(--text-muted)' }}>
          Pubblica una foto di prova per verificare che il publisher funzioni end-to-end.
          Niente brand check, niente persistenza in DB. Cancella manualmente il post dopo il test.
        </p>

        {/* URL image */}
        <div className="vstack-tight">
          <label className="typ-micro">URL immagine pubblica (HTTPS)</label>
          <input
            value={imageUrl}
            onChange={e => setImageUrl(e.target.value)}
            placeholder="https://..."
            className="input w-full"
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
          {isWebp && (
            <p className="typ-micro" style={{ color: 'var(--warn)' }}>
              ⚠️ WebP funziona su Facebook ma NON su Instagram. Per IG serve JPEG/PNG.
            </p>
          )}
        </div>

        {/* Caption */}
        <div className="vstack-tight">
          <label className="typ-micro">Caption</label>
          <textarea
            value={caption}
            onChange={e => setCaption(e.target.value)}
            rows={3}
            className="input"
            style={{ resize: 'vertical', minHeight: 60 }}
          />
        </div>

        {/* Platform toggles */}
        <div className="vstack-tight">
          <label className="typ-micro">Pubblica su</label>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setPlatforms(p => ({ ...p, fb: !p.fb }))}
              className="btn btn-sm"
              style={{
                background: platforms.fb ? '#1877F2' : 'var(--card)',
                color: platforms.fb ? '#fff' : 'var(--text-hi)',
                border: `1px solid ${platforms.fb ? '#1877F2' : 'var(--hairline)'}`,
                fontWeight: platforms.fb ? 600 : 500,
              }}
            >
              <Facebook className="w-3.5 h-3.5" /> Facebook Page
            </button>
            <button
              onClick={() => setPlatforms(p => ({ ...p, ig: !p.ig }))}
              className="btn btn-sm"
              style={{
                background: platforms.ig ? '#E1306C' : 'var(--card)',
                color: platforms.ig ? '#fff' : 'var(--text-hi)',
                border: `1px solid ${platforms.ig ? '#E1306C' : 'var(--hairline)'}`,
                fontWeight: platforms.ig ? 600 : 500,
              }}
            >
              <Instagram className="w-3.5 h-3.5" /> Instagram
            </button>
          </div>
          {igWillFail && (
            <p className="typ-micro" style={{ color: 'var(--warn)' }}>
              ⚠️ IG fallirà con WebP. Cambia URL a un JPEG/PNG, oppure pubblica solo su FB.
            </p>
          )}
        </div>

        {/* Publish button */}
        <button
          onClick={handlePublish}
          disabled={publishing || (!platforms.fb && !platforms.ig)}
          className="btn btn-primary"
        >
          {publishing
            ? <><RefreshCw className="w-4 h-4 animate-spin" /> Pubblicazione…</>
            : <><Send className="w-4 h-4" /> Test pubblica</>}
        </button>

        {/* Results */}
        {results && (
          <div className="vstack-tight" style={{ paddingTop: 8, borderTop: '1px solid var(--hairline-soft)', marginTop: 4 }}>
            <p className="typ-micro" style={{ color: 'var(--text-muted)' }}>Risultato:</p>
            {results.map((r, i) => (
              <div
                key={i}
                className="card card-body"
                style={{
                  borderColor: r.ok
                    ? 'color-mix(in oklab, var(--ok) 30%, transparent)'
                    : 'color-mix(in oklab, var(--danger) 30%, transparent)',
                  background: r.ok
                    ? 'color-mix(in oklab, var(--ok) 8%, var(--card))'
                    : 'color-mix(in oklab, var(--danger) 8%, var(--card))',
                }}
              >
                <div className="flex items-center gap-2">
                  {r.platform === 'fb'
                    ? <Facebook className="w-4 h-4" style={{ color: '#1877F2' }} />
                    : <Instagram className="w-4 h-4" style={{ color: '#E1306C' }} />}
                  <span className="typ-label">
                    {r.platform === 'fb' ? 'Facebook' : 'Instagram'}
                  </span>
                  <span className="grow" />
                  {r.ok
                    ? <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--ok)' }} />
                    : <XCircle className="w-4 h-4" style={{ color: 'var(--danger)' }} />}
                </div>
                {r.ok ? (
                  <div className="typ-caption mt-2" style={{ color: 'var(--text-muted)' }}>
                    Post ID: <code style={{ fontFamily: 'monospace' }}>{r.postId}</code>
                    {r.permalink && (
                      <a
                        href={r.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 ml-2"
                        style={{ color: 'var(--accent-raw)' }}
                      >
                        Apri post <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="typ-micro mt-2" style={{ color: 'var(--danger)', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                    {r.error}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
