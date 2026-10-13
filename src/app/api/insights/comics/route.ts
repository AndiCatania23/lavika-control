import { NextResponse } from 'next/server';
import { loadComicsInsights } from '@/lib/insights/comicsQueries';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
 const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
 const data = await loadComicsInsights(token);
 return NextResponse.json(data, {status: data.available ? 200 : 403, headers: {'Cache-Control': 'private, no-store'}});
}
