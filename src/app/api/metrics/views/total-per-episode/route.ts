import { NextResponse } from 'next/server';
import { buildEpisodeNameMap, groupTotalPerEpisode, loadViewStartEvents } from '@/lib/metrics/viewMetrics';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const formatId = searchParams.get('format_id') ?? undefined;

  const rows = await loadViewStartEvents(formatId);
  const episodeNameMap = buildEpisodeNameMap(rows);
  return NextResponse.json(groupTotalPerEpisode(rows, episodeNameMap));
}
