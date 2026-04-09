import { NextResponse } from 'next/server';
import type { Job } from '@/mocks/jobs';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (id !== 'job_sync_video') {
    return NextResponse.json(null, { status: 404 });
  }

  // Get latest run
  const latestRun = supabaseServer
    ? (await supabaseServer
        .from('job_queue')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      ).data
    : null;

  const job: Job = {
    id: 'job_sync_video',
    name: 'Sync Video',
    description: 'Scarica e sincronizza i video dagli archivi delle singole risorse',
    schedule: null,
    lastRun: latestRun?.created_at ?? null,
    status: 'active',
    nextRun: null,
  };

  return NextResponse.json(job);
}
