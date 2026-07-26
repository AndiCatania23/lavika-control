'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  Activity,
  BellRing,
  CheckCircle2,
  ExternalLink,
  Play,
  RefreshCw,
  Rss,
  Server,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';

type ActionStatus = 'idle' | 'loading' | 'success' | 'error';

type FeedCheck = {
  id: string;
  slug: string;
  display_name: string;
  feed_url: string;
  state: 'ok' | 'warn' | 'error';
  httpStatus: number | null;
  elapsedMs: number | null;
  message: string;
};

type RssCheckResponse = {
  summary?: { total: number; ok: number; warn: number; error: number };
  feeds?: FeedCheck[];
  error?: string;
};

type FeedSource = {
  id: string;
  slug: string;
  display_name: string;
  feed_url: string;
  enabled: boolean;
  priority: number;
  notes: string | null;
};

type MacStatusResponse = {
  daemon?: {
    state: string;
    ageSeconds: number | null;
    hostname: string | null;
    pid: number | null;
  };
  queue?: {
    pending: number;
    pendingStuck: number;
    running: number;
    failed24h: number;
  };
  error?: string;
};

type PushHealthResponse = {
  subscriptions?: {
    active: number;
    inactive: number;
    inactiveOlderThan30d: number;
    activeByPlatform: Record<string, number>;
  };
  jobs?: {
    byStatus: Record<string, number>;
  };
  deliveries24h?: {
    sent: number;
    failed: number;
    pending: number;
    byStatus: Record<string, number>;
  };
  recentFailedDeliveries?: Array<{
    id: string;
    jobId: string | null;
    userId: string | null;
    error: string | null;
    updatedAt: string | null;
  }>;
  error?: string;
};

function fmtAge(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '-';
  if (seconds < 60) return `${seconds}s fa`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m fa`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h fa`;
  return `${Math.floor(hours / 24)}g fa`;
}

function statePill(state: string): string {
  if (state === 'ok' || state === 'online' || state === 'success') return 'pill pill-ok';
  if (state === 'warn' || state === 'stale') return 'pill pill-warn';
  if (state === 'error' || state === 'offline') return 'pill pill-err';
  return 'pill pill-info';
}

export function OpsActionsPanel() {
  const router = useRouter();
  const [rssStatus, setRssStatus] = useState<ActionStatus>('idle');
  const [rssResult, setRssResult] = useState<RssCheckResponse | null>(null);
  const [macStatus, setMacStatus] = useState<ActionStatus>('idle');
  const [macResult, setMacResult] = useState<MacStatusResponse | null>(null);
  const [syncStatus, setSyncStatus] = useState<ActionStatus>('idle');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<ActionStatus>('idle');
  const [pushResult, setPushResult] = useState<PushHealthResponse | null>(null);
  const [pushCleanupStatus, setPushCleanupStatus] = useState<ActionStatus>('idle');
  const [pushCleanupMessage, setPushCleanupMessage] = useState<string | null>(null);
  const [feedsStatus, setFeedsStatus] = useState<ActionStatus>('idle');
  const [feeds, setFeeds] = useState<FeedSource[]>([]);
  const [feedBusyId, setFeedBusyId] = useState<string | null>(null);
  const [feedUrlDrafts, setFeedUrlDrafts] = useState<Record<string, string>>({});

  const brokenFeeds = useMemo(
    () => (rssResult?.feeds ?? []).filter((feed) => feed.state !== 'ok'),
    [rssResult],
  );

  async function checkRss() {
    setRssStatus('loading');
    setRssResult(null);
    try {
      const response = await fetch('/api/dev/ops/rss-check', { cache: 'no-store' });
      const payload = await response.json() as RssCheckResponse;
      setRssResult(payload);
      setRssStatus(response.ok ? 'success' : 'error');
    } catch (error) {
      setRssResult({ error: error instanceof Error ? error.message : 'Errore rete' });
      setRssStatus('error');
    }
  }

  async function loadFeeds() {
    setFeedsStatus('loading');
    try {
      const response = await fetch('/api/dev/pill-sources', { cache: 'no-store' });
      const payload = await response.json() as { feeds?: FeedSource[]; error?: string };
      if (!response.ok) {
        setRssResult((current) => ({ ...(current ?? {}), error: payload.error ?? `Fonti non caricate (${response.status})` }));
        setFeedsStatus('error');
        return;
      }
      const nextFeeds = payload.feeds ?? [];
      setFeeds(nextFeeds);
      setFeedUrlDrafts(Object.fromEntries(nextFeeds.map((feed) => [feed.id, feed.feed_url])));
      setFeedsStatus('success');
    } catch (error) {
      setRssResult((current) => ({ ...(current ?? {}), error: error instanceof Error ? error.message : 'Errore rete' }));
      setFeedsStatus('error');
    }
  }

  async function verifyDaemon() {
    setMacStatus('loading');
    setMacResult(null);
    try {
      const response = await fetch('/api/dev/mac-status', { cache: 'no-store' });
      const payload = await response.json() as MacStatusResponse;
      setMacResult(payload);
      setMacStatus(response.ok ? 'success' : 'error');
    } catch (error) {
      setMacResult({ error: error instanceof Error ? error.message : 'Errore rete' });
      setMacStatus('error');
    }
  }

  async function checkPushHealth() {
    setPushStatus('loading');
    setPushCleanupMessage(null);
    try {
      const response = await fetch('/api/dev/ops/push-health', { cache: 'no-store' });
      const payload = await response.json() as PushHealthResponse;
      setPushResult(payload);
      setPushStatus(response.ok ? 'success' : 'error');
    } catch (error) {
      setPushResult({ error: error instanceof Error ? error.message : 'Errore rete' });
      setPushStatus('error');
    }
  }

  async function cleanupOldInactivePush() {
    const count = pushResult?.subscriptions?.inactiveOlderThan30d ?? 0;
    const confirmed = window.confirm(`Eliminare ${count} token push gia' inattivi da oltre 30 giorni?\n\nNon tocca token attivi. I device validi si registrano di nuovo all'apertura app.`);
    if (!confirmed) return;

    setPushCleanupStatus('loading');
    setPushCleanupMessage(null);
    try {
      const response = await fetch('/api/dev/ops/push-health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-old-inactive', olderThanDays: 30 }),
      });
      const payload = await response.json().catch(() => null) as { deleted?: number; error?: string } | null;
      if (!response.ok) {
        setPushCleanupStatus('error');
        setPushCleanupMessage(payload?.error ?? `Pulizia fallita (${response.status})`);
        return;
      }
      setPushCleanupStatus('success');
      setPushCleanupMessage(`Rimossi ${payload?.deleted ?? 0} token inattivi`);
      await checkPushHealth();
    } catch (error) {
      setPushCleanupStatus('error');
      setPushCleanupMessage(error instanceof Error ? error.message : 'Errore rete');
    }
  }

  async function queueVideoSync() {
    setSyncStatus('loading');
    setSyncMessage(null);
    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: 'job_sync_video', triggeredBy: 'ops-mobile' }),
      });
      const payload = await response.json().catch(() => null) as { error?: string; run?: { id?: string } } | null;
      if (!response.ok) {
        setSyncStatus('error');
        setSyncMessage(payload?.error ?? `Errore ${response.status}`);
        return;
      }
      setSyncStatus('success');
      setSyncMessage(payload?.run?.id ? `Job accodato: ${payload.run.id}` : 'Job accodato');
      router.refresh();
    } catch (error) {
      setSyncStatus('error');
      setSyncMessage(error instanceof Error ? error.message : 'Errore rete');
    }
  }

  async function disableFeed(feed: FeedCheck) {
    const confirmed = window.confirm(`Disabilitare la fonte RSS "${feed.display_name}"?\n\nAzione reversibile da Fonti RSS.`);
    if (!confirmed) return;

    setFeedBusyId(feed.id);
    try {
      const response = await fetch('/api/dev/pill-sources', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: feed.id,
          enabled: false,
          notes: `Disabilitata da Ops mobile dopo check ${feed.message}`,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        setRssResult((current) => ({
          ...(current ?? {}),
          error: payload?.error ?? `Disabilitazione fallita (${response.status})`,
        }));
        return;
      }
      await checkRss();
      router.refresh();
    } finally {
      setFeedBusyId(null);
    }
  }

  async function updateFeedUrl(feed: FeedCheck | FeedSource) {
    const nextUrl = feedUrlDrafts[feed.id]?.trim();
    if (!nextUrl) {
      setRssResult((current) => ({ ...(current ?? {}), error: 'URL fonte mancante' }));
      return;
    }

    setFeedBusyId(feed.id);
    try {
      const response = await fetch('/api/dev/pill-sources', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: feed.id,
          feed_url: nextUrl,
          enabled: true,
          notes: `URL aggiornato da Ops mobile`,
        }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setRssResult((current) => ({
          ...(current ?? {}),
          error: payload?.error ?? `Aggiornamento fonte fallito (${response.status})`,
        }));
        return;
      }
      await Promise.all([checkRss(), loadFeeds()]);
      router.refresh();
    } finally {
      setFeedBusyId(null);
    }
  }

  async function enableFeed(feed: FeedSource) {
    setFeedBusyId(feed.id);
    try {
      const response = await fetch('/api/dev/pill-sources', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: feed.id, enabled: true, notes: `Riabilitata da Ops mobile` }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setRssResult((current) => ({
          ...(current ?? {}),
          error: payload?.error ?? `Riabilitazione fallita (${response.status})`,
        }));
        return;
      }
      await Promise.all([checkRss(), loadFeeds()]);
      router.refresh();
    } finally {
      setFeedBusyId(null);
    }
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="w-4 h-4 text-[color:var(--accent-raw)]" strokeWidth={1.75} />
        <h2 className="typ-h2 grow">Interventi sicuri</h2>
        <span className="typ-micro">mobile first</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="card">
          <div className="card-head items-start">
            <div className="min-w-0">
              <div className="typ-micro">Editoriale</div>
              <h3 className="typ-h2 mt-1">Fonti RSS pills</h3>
            </div>
            <Rss className="w-5 h-5 text-[color:var(--accent-raw)]" strokeWidth={1.75} />
          </div>
          <div className="card-body vstack-tight">
            <p className="typ-caption text-[color:var(--text-muted-hi)]">
              Controlla le fonti attive e disabilita solo quelle rotte. Non genera pills e non pubblica nulla.
            </p>
            <button onClick={checkRss} disabled={rssStatus === 'loading'} className="btn btn-primary btn-sm w-full">
              <RefreshCw className={rssStatus === 'loading' ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
              {rssStatus === 'loading' ? 'Controllo…' : 'Controlla RSS'}
            </button>
            <button onClick={loadFeeds} disabled={feedsStatus === 'loading'} className="btn btn-ghost btn-sm w-full">
              <Rss className="w-4 h-4" />
              {feedsStatus === 'loading' ? 'Carico…' : 'Gestisci fonti'}
            </button>
            {rssResult?.summary && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="pill pill-ok">{rssResult.summary.ok} ok</span>
                <span className={rssResult.summary.warn > 0 ? 'pill pill-warn' : 'pill pill-info'}>{rssResult.summary.warn} warn</span>
                <span className={rssResult.summary.error > 0 ? 'pill pill-err' : 'pill pill-info'}>{rssResult.summary.error} error</span>
              </div>
            )}
            {rssResult?.error && <div className="typ-caption text-[color:var(--danger)]">{rssResult.error}</div>}
            {brokenFeeds.length > 0 && (
              <div className="vstack-tight">
                {brokenFeeds.map((feed) => (
                  <div key={feed.id} className="rounded-[var(--r-sm)] border border-[color:var(--hairline-soft)] p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 grow">
                        <div className="typ-label break-words">{feed.display_name}</div>
                        <div className="typ-caption break-words">{feed.slug} · {feed.message}</div>
                      </div>
                      <span className={statePill(feed.state)}>{feed.state}</span>
                    </div>
                    <input
                      className="input mt-3"
                      value={feedUrlDrafts[feed.id] ?? feed.feed_url}
                      onChange={(event) => setFeedUrlDrafts((current) => ({ ...current, [feed.id]: event.target.value }))}
                      placeholder="URL RSS"
                    />
                    <button
                      onClick={() => updateFeedUrl(feed)}
                      disabled={feedBusyId === feed.id}
                      className="btn btn-ghost btn-sm w-full mt-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      {feedBusyId === feed.id ? 'Salvo…' : 'Salva URL e riabilita'}
                    </button>
                    <button
                      onClick={() => disableFeed(feed)}
                      disabled={feedBusyId === feed.id}
                      className="btn btn-danger btn-sm w-full mt-3"
                    >
                      <XCircle className="w-4 h-4" />
                      {feedBusyId === feed.id ? 'Disabilito…' : 'Disabilita fonte'}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {feeds.filter((feed) => !feed.enabled).length > 0 && (
              <div className="vstack-tight">
                <div className="typ-micro">Fonti disabilitate</div>
                {feeds.filter((feed) => !feed.enabled).map((feed) => (
                  <div key={feed.id} className="rounded-[var(--r-sm)] border border-[color:var(--hairline-soft)] p-3">
                    <div className="typ-label break-words">{feed.display_name}</div>
                    <div className="typ-caption break-words">{feed.slug}</div>
                    <input
                      className="input mt-3"
                      value={feedUrlDrafts[feed.id] ?? feed.feed_url}
                      onChange={(event) => setFeedUrlDrafts((current) => ({ ...current, [feed.id]: event.target.value }))}
                      placeholder="URL RSS"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      <button onClick={() => updateFeedUrl(feed)} disabled={feedBusyId === feed.id} className="btn btn-ghost btn-sm">
                        Salva URL
                      </button>
                      <button onClick={() => enableFeed(feed)} disabled={feedBusyId === feed.id} className="btn btn-primary btn-sm">
                        Riabilita
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Link href="/pills" className="btn btn-ghost btn-sm w-full">
              <ExternalLink className="w-4 h-4" />
              Apri gestione pills
            </Link>
          </div>
        </div>

        <div className="card">
          <div className="card-head items-start">
            <div className="min-w-0">
              <div className="typ-micro">Video</div>
              <h3 className="typ-h2 mt-1">Queue sync</h3>
            </div>
            <Activity className="w-5 h-5 text-[color:var(--accent-raw)]" strokeWidth={1.75} />
          </div>
          <div className="card-body vstack-tight">
            <p className="typ-caption text-[color:var(--text-muted-hi)]">
              Accoda un sync video usando la queue esistente. Se un sync è già in corso, l&apos;API lo blocca.
            </p>
            <button onClick={queueVideoSync} disabled={syncStatus === 'loading'} className="btn btn-primary btn-sm w-full">
              <Play className="w-4 h-4" />
              {syncStatus === 'loading' ? 'Accodo…' : 'Accoda sync video'}
            </button>
            {syncMessage && (
              <div className={syncStatus === 'error' ? 'typ-caption text-[color:var(--danger)]' : 'typ-caption text-[color:var(--ok)]'}>
                {syncMessage}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Link href="/jobs" className="btn btn-ghost btn-sm">
                Job
              </Link>
              <Link href="/jobs/runs" className="btn btn-ghost btn-sm">
                Runs
              </Link>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head items-start">
            <div className="min-w-0">
              <div className="typ-micro">Mac Mini</div>
              <h3 className="typ-h2 mt-1">Daemon e push</h3>
            </div>
            <Server className="w-5 h-5 text-[color:var(--accent-raw)]" strokeWidth={1.75} />
          </div>
          <div className="card-body vstack-tight">
            <p className="typ-caption text-[color:var(--text-muted-hi)]">
              Verifica heartbeat e queue. Per i push, il worker disattiva già i token invalidi confermati.
            </p>
            <button onClick={verifyDaemon} disabled={macStatus === 'loading'} className="btn btn-primary btn-sm w-full">
              <RefreshCw className={macStatus === 'loading' ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
              Verifica daemon
            </button>
            {macResult?.error && <div className="typ-caption text-[color:var(--danger)]">{macResult.error}</div>}
            {macResult?.daemon && macResult.queue && (
              <div className="rounded-[var(--r-sm)] border border-[color:var(--hairline-soft)] p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={statePill(macResult.daemon.state)}>
                    {macResult.daemon.state === 'online' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    {macResult.daemon.state}
                  </span>
                  <span className="pill pill-info">heartbeat {fmtAge(macResult.daemon.ageSeconds)}</span>
                </div>
                <div className="typ-caption mt-2">
                  Queue: {macResult.queue.pending} pending · {macResult.queue.running} running · {macResult.queue.failed24h} failed 24h
                </div>
              </div>
            )}
            <Link href="/notifications" className="btn btn-ghost btn-sm w-full">
              <BellRing className="w-4 h-4" />
              Apri notifiche
            </Link>
            <button onClick={checkPushHealth} disabled={pushStatus === 'loading'} className="btn btn-ghost btn-sm w-full">
              <BellRing className="w-4 h-4" />
              {pushStatus === 'loading' ? 'Controllo push…' : 'Push health'}
            </button>
            {pushResult?.error && <div className="typ-caption text-[color:var(--danger)]">{pushResult.error}</div>}
            {pushResult?.subscriptions && pushResult.deliveries24h && (
              <div className="rounded-[var(--r-sm)] border border-[color:var(--hairline-soft)] p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="pill pill-ok">{pushResult.subscriptions.active} attivi</span>
                  <span className="pill pill-info">{pushResult.subscriptions.inactive} inattivi</span>
                  <span className={pushResult.deliveries24h.failed > 0 ? 'pill pill-warn' : 'pill pill-ok'}>
                    {pushResult.deliveries24h.failed} failed 24h
                  </span>
                </div>
                <div className="typ-caption mt-2">
                  Invii 24h: {pushResult.deliveries24h.sent} sent · {pushResult.deliveries24h.pending} pending
                </div>
                <div className="typ-caption mt-1">
                  Piattaforme attive: {Object.entries(pushResult.subscriptions.activeByPlatform).map(([key, value]) => `${key} ${value}`).join(' · ') || '-'}
                </div>
                {pushResult.recentFailedDeliveries && pushResult.recentFailedDeliveries.length > 0 && (
                  <div className="mt-3 vstack-tight">
                    <div className="typ-micro">Ultimi fallimenti</div>
                    {pushResult.recentFailedDeliveries.slice(0, 3).map((delivery) => (
                      <div key={delivery.id} className="typ-caption break-words">
                        {delivery.error ?? 'Errore non specificato'}
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={cleanupOldInactivePush}
                  disabled={(pushResult.subscriptions.inactiveOlderThan30d ?? 0) === 0 || pushCleanupStatus === 'loading'}
                  className="btn btn-danger btn-sm w-full mt-3"
                >
                  <Trash2 className="w-4 h-4" />
                  {pushCleanupStatus === 'loading' ? 'Pulisco…' : `Pulisci inattivi >30g (${pushResult.subscriptions.inactiveOlderThan30d})`}
                </button>
                {pushCleanupMessage && (
                  <div className={pushCleanupStatus === 'error' ? 'typ-caption mt-2 text-[color:var(--danger)]' : 'typ-caption mt-2 text-[color:var(--ok)]'}>
                    {pushCleanupMessage}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
