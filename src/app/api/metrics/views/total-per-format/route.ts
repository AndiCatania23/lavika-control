import { NextResponse } from 'next/server';
import { loadViewStartEvents, totalPerFormat } from '@/lib/metrics/viewMetrics';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const formatId = searchParams.get('format_id');

  if (!formatId) {
    return NextResponse.json({ error: 'format_id is required' }, { status: 400 });
  }

  const rows = await loadViewStartEvents(formatId);
  return NextResponse.json({ format_id: formatId, total_views: totalPerFormat(rows) });
}
