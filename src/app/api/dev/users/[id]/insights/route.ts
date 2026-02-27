import { NextResponse } from 'next/server';
import { emptyUserInsights, loadUserContentInsights } from '@/lib/metrics/userInsights';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const insights = await loadUserContentInsights(id);
    return NextResponse.json(insights);
  } catch {
    return NextResponse.json(emptyUserInsights(id));
  }
}
