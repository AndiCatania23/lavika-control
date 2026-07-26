import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

type PushSubscriptionRow = {
  id: string;
  platform: string | null;
  is_active: boolean | null;
  updated_at: string | null;
  last_seen_at: string | null;
};

type NotificationJobRow = {
  id: string;
  topic: string | null;
  status: string | null;
  scheduled_at: string | null;
  updated_at: string | null;
};

type DeliveryRow = {
  id: string;
  job_id: string | null;
  user_id: string | null;
  status: string | null;
  error_message: string | null;
  updated_at: string | null;
};

function countBy<T extends string>(values: Array<T | null | undefined>): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    const key = value || 'unknown';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function oldInactiveCutoff(days = 30): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function GET() {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const inactiveCutoff = oldInactiveCutoff();

  const [
    subscriptionsRes,
    inactiveOldRes,
    jobsRes,
    deliveriesRes,
    failedDeliveriesRes,
  ] = await Promise.all([
    supabaseServer
      .from('push_subscriptions')
      .select('id, platform, is_active, updated_at, last_seen_at')
      .order('updated_at', { ascending: false })
      .limit(5000),
    supabaseServer
      .from('push_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', false)
      .lt('updated_at', inactiveCutoff),
    supabaseServer
      .from('notification_jobs')
      .select('id, topic, status, scheduled_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(200),
    supabaseServer
      .from('notification_deliveries')
      .select('id, job_id, user_id, status, error_message, updated_at')
      .gte('updated_at', since24h)
      .order('updated_at', { ascending: false })
      .limit(1000),
    supabaseServer
      .from('notification_deliveries')
      .select('id, job_id, user_id, status, error_message, updated_at')
      .eq('status', 'failed')
      .order('updated_at', { ascending: false })
      .limit(10),
  ]);

  const firstError = subscriptionsRes.error ?? jobsRes.error ?? deliveriesRes.error ?? failedDeliveriesRes.error ?? inactiveOldRes.error;
  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 });
  }

  const subscriptions = (subscriptionsRes.data ?? []) as PushSubscriptionRow[];
  const jobs = (jobsRes.data ?? []) as NotificationJobRow[];
  const deliveries = (deliveriesRes.data ?? []) as DeliveryRow[];
  const failedDeliveries = (failedDeliveriesRes.data ?? []) as DeliveryRow[];

  const activeSubscriptions = subscriptions.filter((row) => row.is_active);
  const inactiveSubscriptions = subscriptions.filter((row) => !row.is_active);
  const deliveryStatus = countBy(deliveries.map((row) => row.status));
  const jobStatus = countBy(jobs.map((row) => row.status));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    subscriptions: {
      totalSampled: subscriptions.length,
      active: activeSubscriptions.length,
      inactive: inactiveSubscriptions.length,
      inactiveOlderThan30d: inactiveOldRes.count ?? 0,
      activeByPlatform: countBy(activeSubscriptions.map((row) => row.platform)),
    },
    jobs: {
      sampled: jobs.length,
      byStatus: jobStatus,
      recent: jobs.slice(0, 5),
    },
    deliveries24h: {
      sampled: deliveries.length,
      sent: deliveryStatus.sent ?? 0,
      failed: deliveryStatus.failed ?? 0,
      pending: deliveryStatus.pending ?? 0,
      byStatus: deliveryStatus,
    },
    recentFailedDeliveries: failedDeliveries.map((row) => ({
      id: row.id,
      jobId: row.job_id,
      userId: row.user_id,
      error: row.error_message,
      updatedAt: row.updated_at,
    })),
  });
}

export async function POST(request: NextRequest) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const body = await request.json().catch(() => null) as { action?: string; olderThanDays?: number } | null;
  if (body?.action !== 'delete-old-inactive') {
    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  }

  const olderThanDays = Math.max(7, Math.min(365, Math.floor(body.olderThanDays ?? 30)));
  const cutoff = oldInactiveCutoff(olderThanDays);

  const { data, error } = await supabaseServer
    .from('push_subscriptions')
    .delete()
    .eq('is_active', false)
    .lt('updated_at', cutoff)
    .select('id');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    deleted: data?.length ?? 0,
    olderThanDays,
    cutoff,
  });
}
