'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Film, ImageIcon, Users, Cloud, Database, ArrowRight } from 'lucide-react';

interface HubStats {
  formats: number;
  episodes: number;
  episodesActive: number;
  players: number;
  playersWithCutout: number;
}

export default function MediaHubPage() {
  const [stats, setStats] = useState<HubStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [fmtRes, plRes, epRes] = await Promise.all([
          fetch('/api/media/formats').then(r => r.ok ? r.json() : []),
          fetch('/api/media/players').then(r => r.ok ? r.json() : { players: [] }),
          fetch('/api/media/episodes/stats').then(r => r.ok ? r.json() : null).catch(() => null),
        ]);
        if (cancelled) return;
        const formats = Array.isArray(fmtRes) ? fmtRes.length : 0;
        const players = Array.isArray(plRes?.players) ? plRes.players.length : 0;
        const playersWithCutout = Array.isArray(plRes?.players)
          ? plRes.players.filter((p: { cutout_url: string | null }) => !!p.cutout_url).length
          : 0;
        setStats({
          formats,
          episodes: epRes?.total ?? 0,
          episodesActive: epRes?.active ?? 0,
          players,
          playersWithCutout,
        });
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const cards = [
    {
      href: '/media/episodes',
      icon: Film,
      title: 'Episodi',
      desc: 'Modifica titolo, match collegato, visibilità in app, badge accesso.',
      stat: stats ? `${stats.episodesActive} attivi · ${stats.episodes} totali` : '…',
      accent: 'var(--accent-raw)',
    },
    {
      href: '/media/covers',
      icon: ImageIcon,
      title: 'Copertine',
      desc: 'Cover verticali, orizzontali e hero per ogni format.',
      stat: stats ? `${stats.formats} format` : '…',
      accent: 'var(--info)',
    },
    {
      href: '/media/players',
      icon: Users,
      title: 'Giocatori',
      desc: 'Cutout (sfondo trasparente) per hero pagine giocatore.',
      stat: stats ? `${stats.playersWithCutout}/${stats.players} con cutout` : '…',
      accent: 'var(--ok)',
    },
  ];

  return (
    <div className="vstack" style={{ gap: 'var(--s5)' }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="typ-h1">Media</h1>
          <p className="typ-caption mt-1">Gestione contenuti serviti dall&apos;app pubblica.</p>
        </div>
        <Link href="/media/archive" className="btn btn-ghost btn-sm" title="Browser dello storage R2 — debug">
          <Cloud className="w-4 h-4" /> Archivio R2
        </Link>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 pill" style={{ padding: '4px 10px' }}>
          <Cloud className="w-3.5 h-3.5" style={{ color: 'var(--accent-raw)' }} />
          <span className="typ-caption">lavika-media</span>
        </div>
        <div className="flex items-center gap-1.5 pill" style={{ padding: '4px 10px' }}>
          <Database className="w-3.5 h-3.5" style={{ color: 'var(--info)' }} />
          <span className="typ-caption">Supabase</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={card.href}
              className="card card-hover"
              style={{
                padding: 'var(--s5)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--s3)',
                textDecoration: 'none',
                color: 'inherit',
                minHeight: 200,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className="inline-grid place-items-center rounded-[var(--r)] shrink-0"
                  style={{ width: 48, height: 48, background: `color-mix(in oklab, ${card.accent} 12%, var(--card))` }}
                >
                  <Icon className="w-6 h-6" style={{ color: card.accent }} strokeWidth={1.75} />
                </div>
                <ArrowRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              </div>
              <div className="grow">
                <h2 className="typ-h1">{card.title}</h2>
                <p className="typ-caption mt-1">{card.desc}</p>
              </div>
              <div className="typ-micro" style={{ color: 'var(--text-muted)' }}>{card.stat}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
