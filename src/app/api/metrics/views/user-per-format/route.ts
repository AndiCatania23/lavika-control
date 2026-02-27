import { NextResponse } from 'next/server';
import { loadUserNameMap, loadViewStartEvents, userPerFormat } from '@/lib/metrics/viewMetrics';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const formatId = searchParams.get('format_id');

  if (!formatId) {
    return NextResponse.json({ error: 'format_id is required' }, { status: 400 });
  }

  const rows = await loadViewStartEvents(formatId);
  const userNameMap = await loadUserNameMap(rows);
  return NextResponse.json(userPerFormat(rows, userNameMap));
}
