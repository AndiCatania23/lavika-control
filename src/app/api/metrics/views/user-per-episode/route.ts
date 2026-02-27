import { NextResponse } from 'next/server';
import { buildEpisodeNameMap, groupUserPerEpisode, loadUserNameMap, loadViewStartEvents } from '@/lib/metrics/viewMetrics';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const formatId = searchParams.get('format_id') ?? undefined;

  const rows = await loadViewStartEvents(formatId);
  const [episodeNameMap, userNameMap] = await Promise.all([
    Promise.resolve(buildEpisodeNameMap(rows)),
    loadUserNameMap(rows),
  ]);

  return NextResponse.json(groupUserPerEpisode(rows, episodeNameMap, userNameMap));
}
