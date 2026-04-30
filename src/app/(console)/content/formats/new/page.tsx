'use client';

/**
 * /content/formats/new — Wizard creazione format (FASE 4 piano onboarding format)
 *
 * 4 step lineari, mobile-first, salvataggio bozza in localStorage cross-step:
 *  1. Identità    → slug, title, categoria, default_min_badge, sort_order
 *  2. Source      → platform (youtube/manual), channel URL + Test connessione
 *  3. Filtri      → durata min/max, parole include/exclude, scanWindow, maxVideosPerRun
 *  4. Schedule    → cron preset + sync_trigger_offset_minutes + Test Dry-Run + Submit
 *
 * Submit:
 *   POST /api/console/formats          → crea content_formats row
 *   POST /api/console/video-sources    → crea video_sources row collegato
 *   redirect /content/formats/[id]
 *
 * Cover NON sono qui — vanno caricate dopo la creazione, dalla pagina dettaglio
 * format (riusa /api/media/upload esistente). Questo è esplicito al Step 4.
 *
 * Feature flag enable_format_wizard verificato lato pagina lista — qui assumiamo
 * accesso autorizzato (admin Control).
 *
 * NB: Facebook NON è platform supportata dal wizard (decisione Opzione A piano).
 *     Per FB, l'utente usa CLI legacy `add-source.js` finché non aggiungiamo
 *     supporto multi-canale FB in feature dedicata.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Loader2, AlertCircle } from 'lucide-react';

const DRAFT_KEY = 'lavika-wizard-format-draft-v1';

type Platform = 'youtube' | 'facebook' | 'manual';
type Badge = 'bronze' | 'silver' | 'gold';
type SchedulePreset = 'manual' | 'daily-22' | 'weekly-fri-18' | 'custom';

interface WizardState {
  // Step 1
  id: string;
  id_touched: boolean;
  title: string;
  category: string;
  default_min_badge: Badge;
  sort_order: string;
  description: string;

  // Step 2
  platform: Platform;
  channel: string;
  validate_status: 'idle' | 'checking' | 'ok' | 'fail';
  validate_message: string;

  // Step 3
  min_duration: string;          // sec
  max_duration: string;          // sec
  title_contains: string;        // comma-separated
  exclude_words: string;         // comma-separated
  scan_window: string;           // days
  max_videos_per_run: string;

  // Step 4
  schedule_preset: SchedulePreset;
  schedule_cron_custom: string;
  sync_trigger_offset_minutes: string;
}

function makeDefault(): WizardState {
  return {
    id: '', id_touched: false, title: '', category: '',
    default_min_badge: 'bronze', sort_order: '100', description: '',
    platform: 'youtube', channel: '', validate_status: 'idle', validate_message: '',
    min_duration: '60', max_duration: '14400',
    title_contains: '', exclude_words: 'Allenamento, Primavera, Under, Femminile',
    scan_window: '14', max_videos_per_run: '100',
    schedule_preset: 'daily-22', schedule_cron_custom: '0 22 * * *',
    sync_trigger_offset_minutes: '15',
  };
}

function slugify(value: string): string {
  return value
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function presetToCron(preset: SchedulePreset, custom: string): string | null {
  if (preset === 'manual') return null;
  if (preset === 'daily-22') return '0 22 * * *';
  if (preset === 'weekly-fri-18') return '0 18 * * 5';
  return custom.trim() || null;
}

function toCsv(s: string): string[] {
  return s.split(',').map(x => x.trim()).filter(x => x.length > 0);
}

const SLUG_RE = /^[a-z0-9-]+$/;

export default function FormatWizardPage() {
  const router = useRouter();
  const [state, setState] = useState<WizardState>(makeDefault);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Restore draft from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<WizardState>;
        setState(prev => ({ ...prev, ...parsed }));
      }
    } catch { /* ignore */ }
  }, []);

  // Persist draft on every change
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
    } catch { /* ignore */ }
  }, [state]);

  const update = useCallback(<K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setState(prev => ({ ...prev, [key]: value }));
  }, []);

  // Auto-slug from title (until user edits id manually)
  const onTitleChange = useCallback((title: string) => {
    setState(prev => ({
      ...prev,
      title,
      id: prev.id_touched ? prev.id : slugify(title),
    }));
  }, []);

  const onIdChange = useCallback((id: string) => {
    setState(prev => ({ ...prev, id: slugify(id), id_touched: true }));
  }, []);

  // Step 1 validation
  const step1Valid = useMemo(() => {
    return SLUG_RE.test(state.id) && state.id.length > 0 && state.title.trim().length > 0;
  }, [state.id, state.title]);

  // Step 2 validation
  const step2Valid = useMemo(() => {
    if (state.platform === 'manual') return true;
    if (state.platform === 'youtube' || state.platform === 'facebook') {
      return state.channel.trim().length > 0
        && state.validate_status === 'ok';
    }
    return false;
  }, [state.platform, state.channel, state.validate_status]);

  // Step 3 + 4 mostly defaults validati
  const step3Valid = useMemo(() => {
    const min = Number(state.min_duration);
    const max = Number(state.max_duration);
    const sw = Number(state.scan_window);
    const mv = Number(state.max_videos_per_run);
    return Number.isFinite(min) && min > 0
      && Number.isFinite(max) && max > min
      && Number.isFinite(sw) && sw > 0 && sw <= 365
      && Number.isFinite(mv) && mv > 0 && mv <= 5000;
  }, [state.min_duration, state.max_duration, state.scan_window, state.max_videos_per_run]);

  const step4Valid = useMemo(() => {
    const offset = Number(state.sync_trigger_offset_minutes);
    if (!Number.isFinite(offset) || offset <= 0 || offset > 1440) return false;
    if (state.schedule_preset === 'custom' && !state.schedule_cron_custom.trim()) return false;
    return true;
  }, [state.sync_trigger_offset_minutes, state.schedule_preset, state.schedule_cron_custom]);

  const onValidateChannel = useCallback(async () => {
    if (state.platform !== 'youtube' && state.platform !== 'facebook') return;
    update('validate_status', 'checking');
    update('validate_message', '');
    try {
      const res = await fetch('/api/console/sources/validate-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: state.platform, channel: state.channel }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        update('validate_status', 'ok');
        update('validate_message', `Raggiungibile (HTTP ${data.detail?.http_status ?? '?'})`);
      } else {
        update('validate_status', 'fail');
        update('validate_message', data.error ?? 'Validazione fallita');
      }
    } catch (err) {
      update('validate_status', 'fail');
      update('validate_message', err instanceof Error ? err.message : 'Errore rete');
    }
  }, [state.platform, state.channel, update]);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      // 1. Crea format
      const formatPayload = {
        id: state.id,
        title: state.title.trim(),
        description: state.description.trim() || undefined,
        category: state.category.trim() || undefined,
        default_min_badge: state.default_min_badge,
        sort_order: Number(state.sort_order) || 100,
        sync_trigger_offset_minutes: Number(state.sync_trigger_offset_minutes),
      };
      const fmtRes = await fetch('/api/console/formats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formatPayload),
      });
      const fmtData = await fmtRes.json();
      if (!fmtRes.ok) throw new Error(fmtData.error ?? 'Crea format fallito');

      // 2. Crea video_source collegato (sempre, per qualsiasi platform supportata)
      {
        const sourceId = `${state.id}-source`; // convenzione: <slug>-source per il primo
        // Filtri specifici per platform: FB ha textContains anziché titleContains
        const titleFilters = toCsv(state.title_contains);
        const excludeFilters = toCsv(state.exclude_words);
        const filtersByPlatform: Record<string, unknown> = {
          minDuration: Number(state.min_duration),
          maxDuration: Number(state.max_duration),
          excludeWords: excludeFilters,
        };
        if (state.platform === 'facebook') {
          filtersByPlatform.textContains = titleFilters;
        } else {
          filtersByPlatform.titleContains = titleFilters;
        }

        const sourcePayload = {
          id: sourceId,
          format_id: state.id,
          name: state.title.trim().toUpperCase(),
          platform: state.platform,
          channel: state.platform === 'manual' ? null : state.channel.trim(),
          filters: filtersByPlatform,
          processing: {
            order: 'uploadDate-asc',
            resolveMissingUploadDate: true,
            skipThumbnail: true,  // riusa cover format come fallback (default piano)
            ...(state.platform === 'facebook' ? { initialBackfillUnlimited: true } : {}),
          },
          metadata: { folder: state.id },  // R2 folder = slug (convenzione lowercase)
          season: { strategy: 'year-from-upload-date' },
          category: state.id,
          subcategory: state.platform === 'manual' ? 'manual' : 'live',
          schedule_cron: presetToCron(state.schedule_preset, state.schedule_cron_custom),
          scan_window: Number(state.scan_window),
          max_videos_per_run: Number(state.max_videos_per_run),
          enabled: true,
          notifications: { onNewVideo: true, onError: true },
          ui_format: {
            type: 'netflix',
            sorting: 'date-desc',
            display: { showBadge: true, badgeText: state.title.trim(), badgeColor: '#e30613', showCategory: true, showDate: true },
            thumbnail: { aspectRatio: '16:9', size: 'large', showDuration: true },
          },
          naming: { strategy: 'prefix-date', prefix: state.title.trim().toUpperCase() },
        };
        const srcRes = await fetch('/api/console/video-sources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sourcePayload),
        });
        const srcData = await srcRes.json();
        if (!srcRes.ok) {
          throw new Error(`Format creato ma source fallita: ${srcData.error ?? 'errore'}`);
        }
      }

      // 3. Pulisci draft + redirect a dettaglio
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      router.push(`/content/formats/${encodeURIComponent(state.id)}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Errore sconosciuto');
      setSubmitting(false);
    }
  }, [state, router]);

  const onAbort = () => {
    if (confirm('Annulli la creazione? La bozza verrà cancellata.')) {
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      router.push('/content/formats');
    }
  };

  return (
    <div className="page-container vstack" style={{ gap: 'var(--s4)' }}>
      {/* Header */}
      <div className="hstack" style={{ gap: 'var(--s2)', alignItems: 'center' }}>
        <Link href="/content/formats" className="btn btn-ghost" title="Indietro">
          <ArrowLeft size={16} />
        </Link>
        <div style={{ flex: 1 }}>
          <h1 className="typ-h2">Nuovo Format</h1>
          <p className="typ-body" style={{ color: 'var(--text-muted)' }}>
            Step {step} di 4 · Bozza salvata localmente
          </p>
        </div>
        <button onClick={onAbort} className="btn btn-ghost typ-micro" style={{ color: 'var(--danger)' }}>
          Annulla
        </button>
      </div>

      {/* Stepper */}
      <div className="hstack" style={{ gap: 'var(--s2)', justifyContent: 'space-between' }}>
        {[1, 2, 3, 4].map(n => (
          <div key={n} className="vstack" style={{
            flex: 1, alignItems: 'center', gap: 4,
            opacity: n <= step ? 1 : 0.4,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: n < step ? 'var(--accent)' : n === step ? 'var(--primary)' : 'var(--card-muted)',
              color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 600, fontSize: 12,
            }}>
              {n < step ? <Check size={14} /> : n}
            </div>
            <span className="typ-micro" style={{ textAlign: 'center' }}>
              {n === 1 && 'Identità'}
              {n === 2 && 'Source'}
              {n === 3 && 'Filtri'}
              {n === 4 && 'Schedule'}
            </span>
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="card card-body vstack" style={{ gap: 'var(--s3)' }}>
        {/* STEP 1 — Identità */}
        {step === 1 && (
          <>
            <div>
              <label className="typ-micro block mb-1.5">Nome format *</label>
              <input
                type="text"
                value={state.title}
                onChange={e => onTitleChange(e.target.value)}
                className="input"
                placeholder="Es. Sicilia Sport Live"
                maxLength={80}
                autoFocus
              />
            </div>
            <div>
              <label className="typ-micro block mb-1.5">Slug (id) *</label>
              <input
                type="text"
                value={state.id}
                onChange={e => onIdChange(e.target.value)}
                className="input"
                placeholder="es. sicilia-sport-live"
                style={{ fontFamily: 'var(--font-mono)' }}
              />
              <p className="typ-micro" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                Solo lowercase, numeri, trattini. Non modificabile dopo creazione (sarebbe orfano R2).
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="typ-micro block mb-1.5">Categoria</label>
                <input
                  type="text"
                  value={state.category}
                  onChange={e => update('category', e.target.value)}
                  className="input"
                  placeholder="Es. Intrattenimento"
                />
              </div>
              <div>
                <label className="typ-micro block mb-1.5">Badge minimo</label>
                <select
                  value={state.default_min_badge}
                  onChange={e => update('default_min_badge', e.target.value as Badge)}
                  className="input"
                >
                  <option value="bronze">Bronze</option>
                  <option value="silver">Silver</option>
                  <option value="gold">Gold</option>
                </select>
              </div>
            </div>
            <div>
              <label className="typ-micro block mb-1.5">Descrizione (opzionale)</label>
              <textarea
                value={state.description}
                onChange={e => update('description', e.target.value)}
                className="input"
                rows={2}
                placeholder="Una frase che descrive il format..."
              />
            </div>
            <div className="card card-body" style={{ background: 'var(--info-soft)', fontSize: 13 }}>
              📁 R2 layout per questo format:
              <pre style={{ fontSize: 11, marginTop: 4, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
{`lavika-media/formats/${state.id || '<slug>'}/cover-horizontal.webp
lavika-media/formats/${state.id || '<slug>'}/cover-vertical.webp
lavika-videos/${state.id || '<slug>'}/<season>/hls/...`}
              </pre>
              <p style={{ marginTop: 4, color: 'var(--text-muted)' }}>
                Le cover si caricano dopo la creazione, dalla pagina dettaglio format.
              </p>
            </div>
          </>
        )}

        {/* STEP 2 — Source */}
        {step === 2 && (
          <>
            <div>
              <label className="typ-micro block mb-1.5">Piattaforma</label>
              <div className="hstack" style={{ gap: 'var(--s2)', flexWrap: 'wrap' }}>
                {(['youtube', 'facebook', 'manual'] as Platform[]).map(p => (
                  <button
                    key={p}
                    onClick={() => { update('platform', p); update('validate_status', 'idle'); update('validate_message', ''); }}
                    className={`btn ${state.platform === p ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ flex: 1, minWidth: 100 }}
                  >
                    {p === 'youtube' ? '📺 YouTube' : p === 'facebook' ? '📘 Facebook' : '⬆️ Manual'}
                  </button>
                ))}
              </div>
            </div>

            {(state.platform === 'youtube' || state.platform === 'facebook') && (
              <>
                <div>
                  <label className="typ-micro block mb-1.5">
                    {state.platform === 'youtube' ? 'URL canale o playlist YouTube *' : 'URL pagina Facebook *'}
                  </label>
                  <input
                    type="url"
                    value={state.channel}
                    onChange={e => { update('channel', e.target.value); update('validate_status', 'idle'); }}
                    className="input"
                    placeholder={
                      state.platform === 'youtube'
                        ? 'https://www.youtube.com/@canale/streams'
                        : 'https://www.facebook.com/<page>/live_videos'
                    }
                  />
                  <p className="typ-micro" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                    {state.platform === 'youtube'
                      ? <>Pattern: <code>/@canale</code>, <code>/playlist?list=</code>, <code>/channel/</code>, <code>/c/</code>, <code>/user/</code></>
                      : <>Pattern: <code>https://www.facebook.com/&lt;page&gt;/live_videos</code>. La discovery via Puppeteer scraperà gli URL video.</>
                    }
                  </p>
                </div>
                <div className="hstack" style={{ gap: 'var(--s2)', alignItems: 'center' }}>
                  <button
                    onClick={onValidateChannel}
                    disabled={!state.channel.trim() || state.validate_status === 'checking'}
                    className="btn btn-ghost"
                  >
                    {state.validate_status === 'checking' ? <Loader2 size={14} className="animate-spin" /> : '🔍'}
                    Test connessione
                  </button>
                  {state.validate_status === 'ok' && (
                    <span className="typ-micro" style={{ color: 'var(--success)' }}>
                      ✓ {state.validate_message}
                    </span>
                  )}
                  {state.validate_status === 'fail' && (
                    <span className="typ-micro" style={{ color: 'var(--danger)' }}>
                      ✗ {state.validate_message}
                    </span>
                  )}
                </div>
                {state.platform === 'facebook' && (
                  <div className="card card-body" style={{ background: 'var(--warning-soft)', fontSize: 13 }}>
                    ⚠ Facebook richiede cookie validi sul Mac (controllati settimanalmente
                    via GH Action <code>check-cookies.yml</code>). Se la discovery fallisce,
                    rigenera i cookie via il check workflow.
                  </div>
                )}
              </>
            )}

            {state.platform === 'manual' && (
              <div className="card card-body" style={{ background: 'var(--info-soft)', fontSize: 13 }}>
                🛠 Modalità Manual: nessun canale automatico. I video andranno caricati uno
                per uno dalla pagina dettaglio format dopo la creazione (richiede FASE 5).
              </div>
            )}
          </>
        )}

        {/* STEP 3 — Filtri */}
        {step === 3 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="typ-micro block mb-1.5">Durata min (sec) *</label>
                <input
                  type="number" min={1}
                  value={state.min_duration}
                  onChange={e => update('min_duration', e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="typ-micro block mb-1.5">Durata max (sec) *</label>
                <input
                  type="number" min={1}
                  value={state.max_duration}
                  onChange={e => update('max_duration', e.target.value)}
                  className="input"
                />
              </div>
            </div>
            <div>
              <label className="typ-micro block mb-1.5">Includi solo titoli con (CSV)</label>
              <input
                type="text"
                value={state.title_contains}
                onChange={e => update('title_contains', e.target.value)}
                className="input"
                placeholder="parola1, parola2, ..."
              />
            </div>
            <div>
              <label className="typ-micro block mb-1.5">Escludi titoli con (CSV)</label>
              <input
                type="text"
                value={state.exclude_words}
                onChange={e => update('exclude_words', e.target.value)}
                className="input"
                placeholder="Allenamento, Primavera, ..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="typ-micro block mb-1.5">Finestra scan (giorni)</label>
                <input
                  type="number" min={1} max={365}
                  value={state.scan_window}
                  onChange={e => update('scan_window', e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="typ-micro block mb-1.5">Max video / run</label>
                <input
                  type="number" min={1} max={5000}
                  value={state.max_videos_per_run}
                  onChange={e => update('max_videos_per_run', e.target.value)}
                  className="input"
                />
              </div>
            </div>
          </>
        )}

        {/* STEP 4 — Schedule + Submit */}
        {step === 4 && (
          <>
            <div>
              <label className="typ-micro block mb-1.5">Schedule sync</label>
              <select
                value={state.schedule_preset}
                onChange={e => update('schedule_preset', e.target.value as SchedulePreset)}
                className="input"
              >
                <option value="manual">Manuale (no auto, solo via palinsesto)</option>
                <option value="daily-22">Daily 22:00 UTC</option>
                <option value="weekly-fri-18">Weekly Venerdì 18:00 UTC</option>
                <option value="custom">Custom cron</option>
              </select>
            </div>
            {state.schedule_preset === 'custom' && (
              <div>
                <label className="typ-micro block mb-1.5">Cron expression</label>
                <input
                  type="text"
                  value={state.schedule_cron_custom}
                  onChange={e => update('schedule_cron_custom', e.target.value)}
                  className="input"
                  style={{ fontFamily: 'var(--font-mono)' }}
                  placeholder="0 22 * * *"
                />
              </div>
            )}
            <div>
              <label className="typ-micro block mb-1.5">Sync trigger offset (min dopo fine evento palinsesto) *</label>
              <input
                type="number" min={1} max={1440}
                value={state.sync_trigger_offset_minutes}
                onChange={e => update('sync_trigger_offset_minutes', e.target.value)}
                className="input"
              />
              <p className="typ-micro" style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                Quando il palinsesto schedula un evento per questo format, il sync parte
                <code> start_at + duration_minutes(card) + offset(format)</code> minuti dopo. Default 15.
              </p>
            </div>
            <div className="card card-body" style={{ background: 'var(--warning-soft)', fontSize: 13 }}>
              ⚠ Dopo la creazione il format apparirà in <code>/content/formats</code>. Le
              cover (16:9 + 9:16) si caricano dalla pagina dettaglio. Il primo sync
              automatico parte allo schedule scelto, oppure manualmente da <code>/jobs</code>.
            </div>
            {submitError && (
              <div className="card card-body" style={{ background: 'var(--danger-soft)', color: 'var(--danger)', fontSize: 13 }}>
                <AlertCircle size={14} style={{ display: 'inline', marginRight: 4 }} />
                {submitError}
              </div>
            )}
          </>
        )}
      </div>

      {/* Navigation */}
      <div className="hstack" style={{ gap: 'var(--s2)', justifyContent: 'space-between' }}>
        <button
          onClick={() => setStep(s => (Math.max(1, s - 1) as 1 | 2 | 3 | 4))}
          disabled={step === 1}
          className="btn btn-ghost"
        >
          <ArrowLeft size={14} /> Indietro
        </button>
        {step < 4 ? (
          <button
            onClick={() => setStep(s => (Math.min(4, s + 1) as 1 | 2 | 3 | 4))}
            disabled={
              (step === 1 && !step1Valid)
              || (step === 2 && !step2Valid)
              || (step === 3 && !step3Valid)
            }
            className="btn btn-primary"
          >
            Avanti <ArrowRight size={14} />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!step4Valid || submitting}
            className="btn btn-primary"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {submitting ? 'Creo...' : 'Crea format'}
          </button>
        )}
      </div>
    </div>
  );
}
