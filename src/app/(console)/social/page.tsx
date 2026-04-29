'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Wand2, CalendarDays, Inbox, BarChart3, ArrowRight, Megaphone,
  Instagram, Facebook,
} from 'lucide-react';

interface HubStats {
  drafts: number;
  scheduled: number;
  publishedToday: number;
  awaitingApproval: number;
}

export default function SocialHubPage() {
  const [stats, setStats] = useState<HubStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/social/drafts/stats')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d) setStats(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const cards = [
    {
      href: '/social/composer',
      icon: Wand2,
      title: 'Composer',
      desc: 'Crea pacchetti social da pill, episodi o da zero. Multi-platform, multi-formato.',
      stat: stats ? `${stats.drafts} bozze · ${stats.awaitingApproval} in attesa` : '…',
      accent: 'var(--accent-raw)',
      live: true,
    },
    {
      href: '/social/calendar',
      icon: CalendarDays,
      title: 'Calendar',
      desc: 'Pianifica post nel tempo, vedi cosa esce quando, sposta drag&drop.',
      stat: stats ? `${stats.scheduled} programmati` : '…',
      accent: 'var(--info)',
      live: false,
    },
    {
      href: '/social/inbox',
      icon: Inbox,
      title: 'Inbox',
      desc: 'Commenti e DM da tutte le piattaforme. AI suggerisce reply nel brand voice.',
      stat: '— prossimamente',
      accent: 'var(--ok)',
      live: false,
    },
    {
      href: '/social/analytics',
      icon: BarChart3,
      title: 'Analytics',
      desc: 'Cosa funziona, cosa no. Reach, engagement, app installs da social.',
      stat: stats ? `${stats.publishedToday} post oggi` : '…',
      accent: 'var(--warn)',
      live: false,
    },
  ];

  return (
    <div className="vstack" style={{ gap: 'var(--s5)' }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="typ-h1">Social</h1>
          <p className="typ-caption mt-1">Crea, schedula e monitora i contenuti dei canali LAVIKA.</p>
        </div>
        <Link href="/social/composer" className="btn btn-primary btn-sm">
          <Wand2 className="w-4 h-4" /> Nuovo pacchetto
        </Link>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 pill" style={{ padding: '4px 10px' }}>
          <Instagram className="w-3.5 h-3.5" style={{ color: '#E1306C' }} />
          <span className="typ-caption">Instagram</span>
        </div>
        <div className="flex items-center gap-1.5 pill" style={{ padding: '4px 10px' }}>
          <Facebook className="w-3.5 h-3.5" style={{ color: '#1877F2' }} />
          <span className="typ-caption">Facebook</span>
        </div>
        <div className="flex items-center gap-1.5 pill" style={{ padding: '4px 10px', opacity: 0.5 }}>
          <Megaphone className="w-3.5 h-3.5" />
          <span className="typ-caption">+ TikTok prossimamente</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cards.map(card => {
          const Icon = card.icon;
          const inner = (
            <div
              className={card.live ? 'card card-hover' : 'card'}
              style={{
                padding: 'var(--s5)',
                display: 'flex', flexDirection: 'column', gap: 'var(--s3)',
                minHeight: 200,
                opacity: card.live ? 1 : 0.6,
                cursor: card.live ? 'pointer' : 'default',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className="inline-grid place-items-center rounded-[var(--r)] shrink-0"
                  style={{ width: 48, height: 48, background: `color-mix(in oklab, ${card.accent} 12%, var(--card))` }}
                >
                  <Icon className="w-6 h-6" style={{ color: card.accent }} strokeWidth={1.75} />
                </div>
                {card.live ? (
                  <ArrowRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                ) : (
                  <span className="pill" style={{ fontSize: 10, padding: '2px 8px' }}>presto</span>
                )}
              </div>
              <div className="grow">
                <h2 className="typ-h1">{card.title}</h2>
                <p className="typ-caption mt-1">{card.desc}</p>
              </div>
              <div className="typ-micro" style={{ color: 'var(--text-muted)' }}>{card.stat}</div>
            </div>
          );
          return card.live ? (
            <Link key={card.href} href={card.href} style={{ textDecoration: 'none', color: 'inherit' }}>
              {inner}
            </Link>
          ) : (
            <div key={card.href}>{inner}</div>
          );
        })}
      </div>

      {/* Footer note */}
      <div className="card card-body" style={{ background: 'var(--card-muted)', borderColor: 'var(--hairline-soft)' }}>
        <p className="typ-caption">
          🚧 <strong>Step 0 in corso.</strong> Modulo in costruzione. App Meta in attesa di review (necessaria per posting Instagram + Facebook).
          Le altre sezioni (Calendar, Inbox, Analytics) verranno abilitate progressivamente.
        </p>
      </div>
    </div>
  );
}
