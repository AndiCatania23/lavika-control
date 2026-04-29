/**
 * /social/insights
 *
 * Dashboard analytics LAVIKA Social. Server Component con ISR 5min.
 *
 * Architettura:
 * - Vista materializzata `v_social_insights_summary` pre-aggregata in DB
 * - 1 SELECT che ritorna 0-2 row (~2KB total) — egress minimo
 * - Refresh dati ogni 1h via pg_cron Supabase
 * - Modalità early/active automatica dal flag `mode` della vista
 */

import Link from 'next/link';
import { ArrowLeft, Instagram, Facebook, RefreshCw, TrendingUp, TrendingDown, Minus, Sparkles, Trophy, AlertTriangle, ExternalLink } from 'lucide-react';
import { supabaseServer } from '@/lib/supabaseServer';
import { Sparkline } from '@/components/social/Sparkline';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

const IG_COLOR = '#E1306C';
const FB_COLOR = '#1877F2';

// ============================================================================
// TYPES
// ============================================================================
interface SparklinePoint { d: string; f: number | null; r: number | null; }
interface PostObj {
  id: string;
  caption?: string;
  thumb?: string | null;
  permalink?: string | null;
  reach?: number;
  likes?: number;
  comments?: number;
  eng?: number;
  mediaType?: string;
  publishedAt?: string;
}

interface SummaryRow {
  platform: 'instagram' | 'facebook';
  snapshot_date: string | null;
  followers_count: number | null;
  reach_28d: number | null;
  impressions_28d: number | null;
  profile_views_28d: number | null;
  followers_delta_7d: number | null;
  reach_delta_7d: number | null;
  followers_delta_30d: number | null;
  sparkline_30d: SparklinePoint[];
  avg_eng_rate_14d: number | null;
  posts_count_14d: number;
  top_posts_7d: PostObj[];
  bottom_posts_7d: PostObj[];
  days_of_data: number;
  first_snapshot: string | null;
  mode: 'early' | 'active';
  refreshed_at: string | null;
}

// ============================================================================
// DATA
// ============================================================================
async function loadSummary(): Promise<{ ig: SummaryRow | null; fb: SummaryRow | null; refreshedAt: Date | null }> {
  if (!supabaseServer) return { ig: null, fb: null, refreshedAt: null };
  const { data } = await supabaseServer
    .from('v_social_insights_summary')
    .select('*');
  const rows = (data ?? []) as SummaryRow[];
  const ig = rows.find(r => r.platform === 'instagram') ?? null;
  const fb = rows.find(r => r.platform === 'facebook') ?? null;
  const refreshedAt =
    ig?.refreshed_at ? new Date(ig.refreshed_at)
      : fb?.refreshed_at ? new Date(fb.refreshed_at)
      : null;
  return { ig, fb, refreshedAt };
}

// ============================================================================
// HELPERS
// ============================================================================
function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${(n / 1000).toFixed(0)}k`;
  if (Math.abs(n) >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

function fmtDelta(n: number | null | undefined): { label: string; color: string; Icon: typeof TrendingUp } {
  if (n == null || n === 0) return { label: '0', color: 'var(--text-muted)', Icon: Minus };
  if (n > 0) return { label: `+${fmtNum(n)}`, color: 'var(--ok)', Icon: TrendingUp };
  return { label: fmtNum(n), color: 'var(--danger)', Icon: TrendingDown };
}

function fmtRelativeTime(date: Date | null): string {
  if (!date) return 'mai';
  const ms = Date.now() - date.getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'ora';
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h fa`;
  const days = Math.floor(hours / 24);
  return `${days} g fa`;
}

// ============================================================================
// COMPONENTS
// ============================================================================
function PlatformBadge({ platform }: { platform: 'instagram' | 'facebook' }) {
  const Icon = platform === 'instagram' ? Instagram : Facebook;
  const color = platform === 'instagram' ? IG_COLOR : FB_COLOR;
  return (
    <div
      className="flex items-center gap-1.5"
      style={{ fontSize: 12, color: 'var(--text-muted)' }}
    >
      <Icon className="w-3.5 h-3.5" style={{ color }} />
      <span style={{ textTransform: 'capitalize' }}>{platform}</span>
    </div>
  );
}

function KpiCard({
  platform,
  label,
  value,
  delta,
  showDelta,
  unit,
}: {
  platform?: 'instagram' | 'facebook';
  label: string;
  value: string;
  delta?: number | null;
  showDelta: boolean;
  unit?: string;
}) {
  const d = showDelta && delta != null ? fmtDelta(delta) : null;
  return (
    <div className="card" style={{ padding: 'var(--s5)', display: 'flex', flexDirection: 'column', gap: 'var(--s2)' }}>
      <div className="flex items-center justify-between gap-2">
        {platform ? <PlatformBadge platform={platform} /> : <span className="typ-micro" style={{ color: 'var(--text-muted)' }}>{label}</span>}
        {d && (
          <div className="flex items-center gap-1" style={{ fontSize: 12, color: d.color, fontWeight: 600 }}>
            <d.Icon className="w-3 h-3" />
            <span>{d.label}</span>
          </div>
        )}
      </div>
      {platform && <div className="typ-micro" style={{ color: 'var(--text-muted)' }}>{label}</div>}
      <div className="flex items-baseline gap-1">
        <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        {unit && <div className="typ-caption" style={{ color: 'var(--text-muted)' }}>{unit}</div>}
      </div>
      {showDelta && delta == null && (
        <div className="typ-micro" style={{ color: 'var(--text-muted)' }}>vs 7g fa: dati insufficienti</div>
      )}
      {showDelta && delta != null && (
        <div className="typ-micro" style={{ color: 'var(--text-muted)' }}>vs 7g fa</div>
      )}
    </div>
  );
}

function PostCard({ post, platform, accent }: { post: PostObj; platform: 'instagram' | 'facebook'; accent: 'top' | 'bottom' }) {
  const eng = post.eng ?? 0;
  const accentColor = accent === 'top' ? 'var(--ok)' : 'var(--warn)';
  return (
    <a
      href={post.permalink ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="card card-hover"
      style={{
        display: 'flex', gap: 'var(--s3)', padding: 'var(--s3)',
        textDecoration: 'none', color: 'inherit',
        borderLeft: `3px solid ${accentColor}`,
      }}
    >
      {post.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.thumb}
          alt=""
          style={{
            width: 64, height: 64, objectFit: 'cover',
            borderRadius: 'var(--r-s)', flexShrink: 0,
            background: 'var(--card-muted)',
          }}
        />
      ) : (
        <div
          style={{
            width: 64, height: 64, borderRadius: 'var(--r-s)',
            background: 'var(--card-muted)', flexShrink: 0,
            display: 'grid', placeItems: 'center',
            color: 'var(--text-muted)', fontSize: 10,
          }}
        >
          {post.mediaType ?? 'post'}
        </div>
      )}
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="flex items-center gap-2 mb-1">
          <PlatformBadge platform={platform} />
          <span className="typ-micro" style={{ color: 'var(--text-muted)' }}>•</span>
          <span className="typ-micro" style={{ color: 'var(--text-muted)' }}>
            {post.publishedAt ? new Date(post.publishedAt).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }) : '—'}
          </span>
        </div>
        <p
          className="typ-caption"
          style={{
            margin: 0,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            color: 'var(--text)',
          }}
        >
          {post.caption?.trim() || <em style={{ color: 'var(--text-muted)' }}>(nessuna caption)</em>}
        </p>
        <div className="flex items-center gap-3 mt-1.5" style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
          <span><strong style={{ color: accentColor }}>{fmtPct(eng)}</strong> eng</span>
          <span>{fmtNum(post.reach)} reach</span>
          <span>{fmtNum(post.likes)} ❤︎</span>
          {(post.comments ?? 0) > 0 && <span>{fmtNum(post.comments)} 💬</span>}
        </div>
      </div>
      <ExternalLink className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 2 }} />
    </a>
  );
}

function GrowthChart({ ig, fb }: { ig: SummaryRow | null; fb: SummaryRow | null }) {
  const igSeries = ig?.sparkline_30d ?? [];
  const fbSeries = fb?.sparkline_30d ?? [];

  const igFollowers = igSeries.map(p => p.f ?? null);
  const fbFollowers = fbSeries.map(p => p.f ?? null);

  // Numero di giorni con almeno 1 punto
  const daysCovered = Math.max(igSeries.length, fbSeries.length);

  return (
    <div className="card" style={{ padding: 'var(--s5)', display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="typ-h2" style={{ margin: 0 }}>Crescita follower 30gg</h2>
        <span className="typ-micro" style={{ color: 'var(--text-muted)' }}>
          {daysCovered} {daysCovered === 1 ? 'giorno' : 'giorni'} di dati
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Instagram className="w-4 h-4" style={{ color: IG_COLOR }} />
            <span className="typ-caption">Instagram</span>
            <span className="grow" />
            <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {fmtNum(ig?.followers_count)}
            </span>
          </div>
          <Sparkline values={igFollowers} stroke={IG_COLOR} height={56} width={400} ariaLabel="IG follower 30gg" />
        </div>
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Facebook className="w-4 h-4" style={{ color: FB_COLOR }} />
            <span className="typ-caption">Facebook</span>
            <span className="grow" />
            <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {fmtNum(fb?.followers_count)}
            </span>
          </div>
          <Sparkline values={fbFollowers} stroke={FB_COLOR} height={56} width={400} ariaLabel="FB follower 30gg" />
        </div>
      </div>
    </div>
  );
}

function EarlyModeBanner({ daysOfData, firstSnapshot }: { daysOfData: number; firstSnapshot: string | null }) {
  const daysToActive = Math.max(0, 14 - daysOfData);
  const daysSince = firstSnapshot ? Math.floor((Date.now() - new Date(firstSnapshot).getTime()) / 86_400_000) : 0;

  return (
    <div
      className="card"
      style={{
        padding: 'var(--s4)',
        background: 'color-mix(in oklab, var(--accent-raw) 8%, var(--card))',
        borderColor: 'color-mix(in oklab, var(--accent-raw) 20%, var(--hairline-soft))',
        display: 'flex', alignItems: 'flex-start', gap: 'var(--s3)',
      }}
    >
      <Sparkles className="w-5 h-5 shrink-0" style={{ color: 'var(--accent-raw)', marginTop: 2 }} />
      <div className="grow">
        <div className="typ-h3" style={{ margin: 0 }}>Modalità early-days</div>
        <p className="typ-caption" style={{ margin: '4px 0 0 0' }}>
          Stiamo raccogliendo i dati delle pagine. {daysOfData < 1 ? (
            <>Oggi parte la macchina, primo snapshot stanotte alle 04:00 UTC.</>
          ) : (
            <>Hai {daysOfData} {daysOfData === 1 ? 'giorno' : 'giorni'} di storico ({daysSince}gg dal primo snapshot).</>
          )} Confronti, top/bottom post e trend significativi appariranno {daysToActive > 0 ? `tra ${daysToActive} giorni` : 'a breve'}, quando avremo abbastanza dataset.
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// PAGE
// ============================================================================
export default async function SocialInsightsPage() {
  const { ig, fb, refreshedAt } = await loadSummary();

  // Modalità: early se almeno una platform è in early o se non abbiamo dati
  const mode: 'early' | 'active' =
    !ig && !fb ? 'early'
    : (ig?.mode === 'active' || fb?.mode === 'active') ? 'active'
    : 'early';

  const showDelta = mode === 'active';
  const igFollowers = ig?.followers_count ?? null;
  const fbFollowers = fb?.followers_count ?? null;
  const igReach7d = ig?.reach_28d ?? null;
  const totalEngRate14d =
    ig?.avg_eng_rate_14d != null && fb?.avg_eng_rate_14d != null
      ? (ig.avg_eng_rate_14d + fb.avg_eng_rate_14d) / 2
      : ig?.avg_eng_rate_14d ?? fb?.avg_eng_rate_14d ?? null;
  const totalPosts14d = (ig?.posts_count_14d ?? 0) + (fb?.posts_count_14d ?? 0);

  const igTop = ig?.top_posts_7d ?? [];
  const fbTop = fb?.top_posts_7d ?? [];
  const igBottom = ig?.bottom_posts_7d ?? [];
  const fbBottom = fb?.bottom_posts_7d ?? [];

  // Top/bottom merged sorted (max 3 each)
  const topMerged = [
    ...igTop.map(p => ({ ...p, _platform: 'instagram' as const })),
    ...fbTop.map(p => ({ ...p, _platform: 'facebook' as const })),
  ].sort((a, b) => (b.eng ?? 0) - (a.eng ?? 0)).slice(0, 3);

  const bottomMerged = [
    ...igBottom.map(p => ({ ...p, _platform: 'instagram' as const })),
    ...fbBottom.map(p => ({ ...p, _platform: 'facebook' as const })),
  ].sort((a, b) => (a.eng ?? 0) - (b.eng ?? 0)).slice(0, 3);

  const daysOfData = Math.max(ig?.days_of_data ?? 0, fb?.days_of_data ?? 0);
  const firstSnapshot = ig?.first_snapshot ?? fb?.first_snapshot ?? null;

  return (
    <div className="vstack" style={{ gap: 'var(--s5)' }}>
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <Link href="/social" className="btn btn-ghost btn-sm">
          <ArrowLeft className="w-4 h-4" /> Social
        </Link>
        <div className="grow" />
        <div className="typ-micro flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
          <RefreshCw className="w-3 h-3" />
          Aggiornato {fmtRelativeTime(refreshedAt)}
        </div>
      </div>

      <div>
        <h1 className="typ-h1">Insights</h1>
        <p className="typ-caption mt-1">
          Crescita, engagement e cosa funziona sui canali LAVIKA. Dati Meta Graph aggiornati ogni 6h.
        </p>
      </div>

      {/* Early mode banner */}
      {mode === 'early' && <EarlyModeBanner daysOfData={daysOfData} firstSnapshot={firstSnapshot} />}

      {/* KPI grid 2x2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          platform="instagram"
          label="Followers"
          value={fmtNum(igFollowers)}
          delta={ig?.followers_delta_7d}
          showDelta={showDelta}
        />
        <KpiCard
          platform="facebook"
          label="Followers"
          value={fmtNum(fbFollowers)}
          delta={fb?.followers_delta_7d}
          showDelta={showDelta}
        />
        <KpiCard
          label="Reach 28gg (IG)"
          value={fmtNum(igReach7d)}
          delta={ig?.reach_delta_7d}
          showDelta={showDelta}
        />
        <KpiCard
          label="Eng. rate medio 14gg"
          value={totalEngRate14d != null ? fmtPct(totalEngRate14d) : '—'}
          showDelta={false}
          unit={totalPosts14d > 0 ? `(${totalPosts14d} post)` : ''}
        />
      </div>

      {/* Crescita 30gg */}
      <GrowthChart ig={ig} fb={fb} />

      {/* Top / Bottom posts */}
      {mode === 'active' && (topMerged.length > 0 || bottomMerged.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="vstack" style={{ gap: 'var(--s3)' }}>
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4" style={{ color: 'var(--ok)' }} />
              <h2 className="typ-h2" style={{ margin: 0 }}>Top 3 settimana</h2>
            </div>
            {topMerged.length > 0 ? (
              topMerged.map(p => <PostCard key={`top-${p._platform}-${p.id}`} post={p} platform={p._platform} accent="top" />)
            ) : (
              <div className="card card-body typ-caption" style={{ color: 'var(--text-muted)' }}>
                Nessun post negli ultimi 7 giorni.
              </div>
            )}
          </div>
          <div className="vstack" style={{ gap: 'var(--s3)' }}>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" style={{ color: 'var(--warn)' }} />
              <h2 className="typ-h2" style={{ margin: 0 }}>Da migliorare</h2>
            </div>
            {bottomMerged.length > 0 ? (
              bottomMerged.map(p => <PostCard key={`bot-${p._platform}-${p.id}`} post={p} platform={p._platform} accent="bottom" />)
            ) : (
              <div className="card card-body typ-caption" style={{ color: 'var(--text-muted)' }}>
                Servono almeno 3-5 post per il confronto.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer info */}
      <div className="card card-body" style={{ background: 'var(--card-muted)', borderColor: 'var(--hairline-soft)' }}>
        <p className="typ-caption" style={{ margin: 0 }}>
          ✓ <strong>Pipeline attiva.</strong> Snapshot account ogni 24h alle 04:00 UTC, post insights ogni 6h, refresh dashboard ogni 1h.
          Retention storica: account snapshots per sempre, post insights 60 giorni.
        </p>
      </div>
    </div>
  );
}
