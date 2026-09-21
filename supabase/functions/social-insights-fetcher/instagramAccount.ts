import { totalMetricValue, type MetaMetricSeries } from './metrics.ts';

type FetchInsights = (params: Record<string, string>) => Promise<MetaMetricSeries>;

/** Both requests cover the same window. A failed retry must remain an error. */
export async function fetchInstagramAccountMetrics(fetchInsights: FetchInsights, nowMs: number) {
  if (!Number.isFinite(nowMs)) throw new Error('Invalid Instagram snapshot time');
  const until = Math.floor(nowMs / 1000);
  const since = until - 28 * 86_400;
  const params = {
    period: 'day',
    metric_type: 'total_value',
    since: String(since),
    until: String(until),
  };
  let fallbackUsed = false;
  let insights: MetaMetricSeries;
  try {
    insights = await fetchInsights({
      ...params,
      metric: 'reach,views,profile_views,accounts_engaged,total_interactions',
    });
  } catch {
    fallbackUsed = true;
    insights = await fetchInsights({ ...params, metric: 'reach,views,profile_views' });
  }

  // Account requests explicitly ask for total_value. Legacy daily series cannot
  // establish a unique 28-day reach or a complete window: retain them only in raw.
  const reach = totalMetricValue(insights, 'reach');
  const profileViews = totalMetricValue(insights, 'profile_views');
  const views = totalMetricValue(insights, 'views');
  return {
    insights,
    columns: {
      reach_28d: reach,
      impressions_28d: null, // Views and impressions are different metrics.
      profile_views_28d: profileViews,
    },
    measurement: {
      contract: 'instagram_account_total_value_v1',
      requested_window: { since, until },
      period: params.period,
      metric_type: params.metric_type,
      fallback_used: fallbackUsed,
      views_28d: views, // JSON metadata; no new database column or migration.
    },
  };
}
