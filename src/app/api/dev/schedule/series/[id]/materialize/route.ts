import { NextResponse } from 'next/server';
import { materializeSeries } from '@/lib/schedule/materializer';

export async function POST(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const result = await materializeSeries({ seriesId: id });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Materializzazione non riuscita.' },
      { status: 500 }
    );
  }
}
