import { NextResponse } from 'next/server';
import type { AppNotification } from '@/mocks/notifications';
import { listGithubRuns } from '@/lib/githubWorkflows';

const SOURCE_LABELS: Array<{ keys: string[]; label: string }> = [
  { keys: ['catanista-live', 'catanista live'], label: 'CATANISTA LIVE' },
  { keys: ['serie-c-2025-2026', 'highlights'], label: 'HIGHLIGHTS' },
  { keys: ['catania-press-conference', 'press conference', 'conferenza pre-gara'], label: 'PRESS CONFERENCE' },
];

function inferFormatLabel(text: string): string | null {
  const normalized = text.toLowerCase();
  for (const source of SOURCE_LABELS) {
    if (source.keys.some(key => normalized.includes(key))) {
      return source.label;
    }
  }
  return null;
}

function mapRunToNotification(run: Awaited<ReturnType<typeof listGithubRuns>>[number]): AppNotification | null {
  if (run.status !== 'completed') return null;

  const titleBase = run.name || 'Job Sync';
  const runNumber = run.run_number ?? run.id;
  const timestamp = run.updated_at ?? run.run_started_at ?? run.created_at;

  if (run.conclusion === 'failure') {
    return {
      id: `run_${run.id}_failed`,
      type: 'run_failed',
      title: `Errore job: ${titleBase}`,
      message: `Run #${runNumber} terminata con errore. Apri il dettaglio per capire cosa e successo.`,
      timestamp,
      href: `/errors/gh_${run.id}`,
    };
  }

  if (run.conclusion === 'cancelled') {
    return {
      id: `run_${run.id}_cancelled`,
      type: 'run_cancelled',
      title: `Run annullata: ${titleBase}`,
      message: `Run #${runNumber} annullata prima del completamento.`,
      timestamp,
      href: `/errors/gh_${run.id}`,
    };
  }

  if (run.conclusion === 'success') {
    const formatLabel = inferFormatLabel(`${run.name ?? ''} ${run.display_title ?? ''}`);
    return {
      id: `run_${run.id}_success`,
      type: formatLabel ? 'new_video' : 'run_success',
      title: formatLabel ? `Nuovo video in ${formatLabel}` : `Job completato: ${titleBase}`,
      message: formatLabel
        ? `La sincronizzazione ha pubblicato nuovi contenuti per ${formatLabel}.`
        : `Run #${runNumber} completata con successo.`,
      timestamp,
      href: `/jobs/runs/${run.id}`,
    };
  }

  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get('limit') ?? 3);
  const offsetParam = Number(searchParams.get('offset') ?? 0);
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 20)) : 3;
  const offset = Number.isFinite(offsetParam) ? Math.max(0, offsetParam) : 0;

  const runs = await listGithubRuns();
  const notifications = runs
    .map(mapRunToNotification)
    .filter((item): item is AppNotification => Boolean(item))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(offset, offset + limit);

  return NextResponse.json(notifications);
}
