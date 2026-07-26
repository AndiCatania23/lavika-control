import { NextResponse } from 'next/server';
import { getOpsSnapshot } from '@/lib/devControl/opsSnapshot';

export async function GET() {
  const snapshot = await getOpsSnapshot();
  return NextResponse.json(snapshot);
}
