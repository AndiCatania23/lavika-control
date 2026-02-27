import { NextResponse } from 'next/server';
import { buildSeasonNameMap, groupTotalPerSeason, loadViewStartEvents } from '@/lib/metrics/viewMetrics';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const formatId = searchParams.get('format_id') ?? undefined;

  const rows = await loadViewStartEvents(formatId);
  const seasonNameMap = buildSeasonNameMap(rows);
  return NextResponse.json(groupTotalPerSeason(rows, seasonNameMap));
}
