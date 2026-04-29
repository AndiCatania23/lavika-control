'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Wand2, CalendarDays, Inbox, ArrowRight, Megaphone,
  Instagram, Facebook, CheckCircle2, FolderOpen,
  TrendingUp, TrendingDown, Minus, BarChart3, Sparkles,
} from 'lucide-react';

interface HubStats {
  drafts: number;
  scheduled: number;
  publishedToday: number;
  awaitingApproval: number;
}

interface InsightsSummary {
  ig: { followers: number | null; delta7d: number | null; delta30d: number | null; reach28d: number | null } | null;
  fb: { followers: number | null; delta7d: number | null; delta30d: number | null } | null;
  avgEngRate14d: number | null;
  postsCount14d: number;
  daysOfData: number;
  mode: 'early' | 'active';
  refreshedAt: string | null;
}

const IG_COLOR = '#E1306C';
const FB_COLOR = '#1877F2';

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

// ============================================================================
// WIDGET INSIGHTS HERO
// ============================================================================
function DeltaBadge({ value, showDelta }: { value: number | null | undefined; showDelta: boolean }) {
  if (!showDelta) return null;
  if (value == null || value === 0) {
    return (
      <span className="flex items-center gap-0.5" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        <Minus className="w-3 h-3" /> 0
      </span>
    );
  }
  const positive = value > 0;
  return (
    <span
      className="flex items-center gap-0.5"
      style={{ fontSize: 11, color: positive ? 'var(--ok)' : 'var(--danger)', fontWeight: 600 }}
    >
      {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {positive ? '+' : ''}{fmtNum(value)}
    </span>
  );
}

function InsightsKpi({
  icon, iconColor, label, value, delta, showDelta,
}: {
  icon?: React.ReactNode;
  iconColor?: string;
  label: string;
  value: string;
  delta?: number | null;
  showDelta: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <div className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {icon && <span style={{ color: iconColor, display: 'inline-flex' }}>{icon}</span>}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </span>
        <DeltaBadge value={delta} showDelta={showDelta} />
      </div>
    </div>
  );
}

function InsightsHeroWidget({ data }: { data: InsightsSummary | null }) {
  const loading = data === null;
  const showDelta = data?.mode === 'active';
  const subtitle = loading
    ? 'Caricamento…'
    : data.mode === 'early'
      ? `Early-days · ${data.daysOfData}g di dati`
      : `${data.postsCount14d} post in 14g`;

  return (
    <Link
      href="/social/insights"
      className="card card-hover"
      style={{
        textDecoration: 'none', color: 'inherit',
        padding: 'var(--s5)',
        display: 'flex', flexDirection: 'column', gap: 'var(--s3)',
        background: `linear-gradient(135deg, color-mix(in oklab, var(--warn) 5%, var(--card)) 0%, var(--card) 60%)`,
      }}
    >
      <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
        <div
          className="inline-grid place-items-center rounded-[var(--r)] shrink-0"
          style={{ width: 36, height: 36, background: 'color-mix(in oklab, var(--warn) 14%, var(--card))' }}
        >
          <BarChart3 className="w-5 h-5" style={{ color: 'var(--warn)' }} strokeWidth={1.75} />
        </div>
        <div className="grow" style={{ minWidth: 0 }}>
          <h2 className="typ-h2" style={{ margin: 0, lineHeight: 1.1 }}>Insights</h2>
          <div
            className="flex items-center gap-1.5"
            style={{
              fontSize: 12, color: 'var(--text-muted)', marginTop: 2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {data?.mode === 'early' && <Sparkles className="w-3 h-3 shrink-0" style={{ color: 'var(--accent-raw)' }} />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</span>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
      </div>

      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        }}
      >
        <InsightsKpi
          icon={<Instagram className="w-3.5 h-3.5" />}
          iconColor={IG_COLOR}
          label="IG follower"
          value={fmtNum(data?.ig?.followers)}
          delta={data?.ig?.delta7d}
          showDelta={showDelta}
        />
        <InsightsKpi
          icon={<Facebook className="w-3.5 h-3.5" />}
          iconColor={FB_COLOR}
          label="FB follower"
          value={fmtNum(data?.fb?.followers)}
          delta={data?.fb?.delta7d}
          showDelta={showDelta}
        />
        <InsightsKpi
          label="Reach 28g (IG)"
          value={fmtNum(data?.ig?.reach28d)}
          showDelta={false}
        />
        <InsightsKpi
          label="Eng. rate 14g"
          value={fmtPct(data?.avgEngRate14d)}
          showDelta={false}
        />
      </div>
    </Link>
  );
}

// ============================================================================
// CARD STRIPE
// ============================================================================
interface StripeCard {
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number; style?: React.CSSProperties }>;
  title: string;
  desc: string;
  stat: string;
  accent: string;
  live: boolean;
}

function CardStripe({ card }: { card: StripeCard }) {
  const Icon = card.icon;
  const inner = (
    <div
      className={card.live ? 'card card-hover' : 'card'}
      style={{
        padding: 'var(--s4)',
        display: 'flex', alignItems: 'center', gap: 'var(--s4)',
        opacity: card.live ? 1 : 0.62,
        cursor: card.live ? 'pointer' : 'default',
        minHeight: 80,
      }}
    >
      <div
        className="inline-grid place-items-center rounded-[var(--r)] shrink-0"
        style={{
          width: 44, height: 44,
          background: `color-mix(in oklab, ${card.accent} 12%, var(--card))`,
        }}
      >
        <Icon className="w-5 h-5" style={{ color: card.accent }} strokeWidth={1.75} />
      </div>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 2 }}>
          <h3 className="typ-h3" style={{ margin: 0, lineHeight: 1.2 }}>{card.title}</h3>
          {!card.live && (
            <span className="pill" style={{ fontSize: 10, padding: '1px 8px' }}>presto</span>
          )}
        </div>
        <p
          className="typ-caption"
          style={{
            margin: 0, color: 'var(--text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis',
            display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
          }}
        >
          {card.desc}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span
          className="typ-micro hide-on-mobile"
          style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: 0.4 }}
        >
          {card.stat}
        </span>
        {card.live && <ArrowRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />}
      </div>
    </div>
  );
  return card.live ? (
    <Link href={card.href} style={{ textDecoration: 'none', color: 'inherit' }}>
      {inner}
    </Link>
  ) : (
    <div>{inner}</div>
  );
}

// ============================================================================
// PAGE
// ============================================================================
export default function SocialHubPage() {
  const [stats, setStats] = useState<HubStats | null>(null);
  const [insights, setInsights] = useState<InsightsSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/social/drafts/stats').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/social/insights/summary').then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([s, i]) => {
      if (cancelled) return;
      if (s) setStats(s);
      if (i) setInsights(i);
    });
    return () => { cancelled = true; };
  }, []);

  const cards: StripeCard[] = [
    {
      href: '/social/composer',
      icon: Wand2,
      title: 'Composer',
      desc: 'Crea pacchetto da pill, episodio o da zero.',
      stat: 'Crea nuovo',
      accent: 'var(--accent-raw)',
      live: true,
    },
    {
      href: '/social/drafts',
      icon: FolderOpen,
      title: 'Bozze',
      desc: 'Pacchetti creati. Edita caption, vedi asset, pubblica.',
      stat: stats ? `${stats.drafts} bozze · ${stats.awaitingApproval} review` : '…',
      accent: '#7c4dff',
      live: true,
    },
    {
      href: '/social/calendar',
      icon: CalendarDays,
      title: 'Calendar',
      desc: 'Pianifica post, vedi cosa esce quando, drag&drop.',
      stat: stats ? `${stats.scheduled} programmati` : '…',
      accent: 'var(--info)',
      live: false,
    },
    {
      href: '/social/inbox',
      icon: Inbox,
      title: 'Inbox',
      desc: 'Commenti e DM aggregati. AI reply nel brand voice.',
      stat: 'Prossimamente',
      accent: 'var(--ok)',
      live: false,
    },
  ];

  return (
    <div className="vstack" style={{ gap: 'var(--s5)' }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="typ-h1">Social</h1>
          <p className="typ-caption mt-1">Crea, schedula e monitora i contenuti dei canali LAVIKA.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/social/connection" className="btn btn-ghost btn-sm" title="Stato connessione Meta">
            <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--ok)' }} /> Connesso
          </Link>
          <Link href="/social/composer" className="btn btn-primary btn-sm">
            <Wand2 className="w-4 h-4" /> Nuovo pacchetto
          </Link>
        </div>
      </div>

      {/* Platform pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 pill" style={{ padding: '4px 10px' }}>
          <Instagram className="w-3.5 h-3.5" style={{ color: IG_COLOR }} />
          <span className="typ-caption">Instagram</span>
        </div>
        <div className="flex items-center gap-1.5 pill" style={{ padding: '4px 10px' }}>
          <Facebook className="w-3.5 h-3.5" style={{ color: FB_COLOR }} />
          <span className="typ-caption">Facebook</span>
        </div>
        <div className="flex items-center gap-1.5 pill" style={{ padding: '4px 10px', opacity: 0.5 }}>
          <Megaphone className="w-3.5 h-3.5" />
          <span className="typ-caption">+ TikTok prossimamente</span>
        </div>
      </div>

      {/* HERO INSIGHTS WIDGET */}
      <InsightsHeroWidget data={insights} />

      {/* CARDS STRIPE: 1 col mobile, 2 col tablet+ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {cards.map(card => <CardStripe key={card.href} card={card} />)}
      </div>

      {/* Footer note */}
      <div className="card card-body" style={{ background: 'var(--card-muted)', borderColor: 'var(--hairline-soft)' }}>
        <p className="typ-caption" style={{ margin: 0 }}>
          ✓ <strong>Composer · Bozze · Insights attivi.</strong> Calendar e Inbox prossimamente.
          Per pubblicare apri una bozza e premi &ldquo;Pubblica subito&rdquo;.
        </p>
      </div>

      {/* Helper styles per stats nascosti su mobile */}
      <style jsx>{`
        @media (max-width: 480px) {
          :global(.hide-on-mobile) { display: none !important; }
        }
      `}</style>
    </div>
  );
}
