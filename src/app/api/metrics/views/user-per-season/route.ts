import { NextResponse } from 'next/server';
import { buildSeasonNameMap, groupUserPerSeason, loadUserNameMap, loadViewStartEvents } from '@/lib/metrics/viewMetrics';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const formatId = searchParams.get('format_id') ?? undefined;

  const rows = await loadViewStartEvents(formatId);
  const [seasonNameMap, userNameMap] = await Promise.all([
    Promise.resolve(buildSeasonNameMap(rows)),
    loadUserNameMap(rows),
  ]);

  return NextResponse.json(groupUserPerSeason(rows, seasonNameMap, userNameMap));
}
