import { NextResponse } from 'next/server';
import type { AppNotification } from '@/mocks/notifications';
import { supabaseServer } from '@/lib/supabaseServer';

const SOURCE_LABELS: Array<{ keys: string[]; label: string }> = [
  { keys: ['catanista-live', 'catanista live'], label: 'CATANISTA LIVE' },
  { keys: ['serie-c-2025-2026', 'highlights'], label: 'HIGHLIGHTS' },
  { keys: ['catania-press-conference', 'press conference', 'conferenza pre-gara'], label: 'PRESS CONFERENCE' },
  { keys: ['unica-sport-live'], label: 'UNICA SPORT' },
  { keys: ['match-reaction-2025-2026', 'match reaction'], label: 'MATCH REACTION' },
];

function inferFormatLabel(source: string | null): string | null {
  if (!source) return null;
  const normalized = source.toLowerCase();
  for (const entry of SOURCE_LABELS) {
    if (entry.keys.some(key => normalized.includes(key))) {
      return entry.label;
    }
  }
  return null;
}

interface JobQueueRow {
  id: string;
  status: string;
  source: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

function mapRowToNotification(row: JobQueueRow): AppNotification | null {
  const timestamp = row.finished_at ?? row.started_at ?? row.created_at;
  const formatLabel = inferFormatLabel(row.source);
  const title = formatLabel ?? row.source ?? 'Job Sync';

  if (row.status === 'failed') {
    return {
      id: `run_${row.id}_failed`,
      type: 'run_failed',
      title: `Errore sync: ${title}`,
      message: `Il job sul Mac mini è terminato con errore. Apri il dettaglio per capire cosa è successo.`,
      timestamp,
      href: `/jobs/runs/${row.id}`,
    };
  }

  if (row.status === 'cancelled') {
    return {
      id: `run_${row.id}_cancelled`,
      type: 'run_cancelled',
      title: `Sync annullato: ${title}`,
      message: `Job annullato prima del completamento.`,
      timestamp,
      href: `/jobs/runs/${row.id}`,
    };
  }

  if (row.status === 'success') {
    return {
      id: `run_${row.id}_success`,
      type: formatLabel ? 'new_video' : 'run_success',
      title: formatLabel ? `Nuovo sync in ${formatLabel}` : `Sync completato`,
      message: formatLabel
        ? `La sincronizzazione ha processato nuovi contenuti per ${formatLabel}.`
        : `Job completato con successo.`,
      timestamp,
      href: `/jobs/runs/${row.id}`,
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

  if (!supabaseServer) {
    return NextResponse.json([]);
  }

  const { data } = await supabaseServer
    .from('job_queue')
    .select('id, status, source, started_at, finished_at, created_at')
    .in('status', ['success', 'failed', 'cancelled'])
    .order('created_at', { ascending: false })
    .range(offset, offset + limit * 2);

  const notifications = ((data ?? []) as JobQueueRow[])
    .map(mapRowToNotification)
    .filter((item): item is AppNotification => Boolean(item))
    .slice(0, limit);

  return NextResponse.json(notifications);
}
