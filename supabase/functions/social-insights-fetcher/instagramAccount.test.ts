import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchInstagramAccountMetrics } from './instagramAccount.ts';

const now = Date.parse('2026-09-21T18:59:50.025Z');
// Sanitized observed payload shape. These totals are test fixtures, not a claim
// that the historical snapshot had a verified 28-day reporting window.
const fixture = { data: [
  { name: 'reach', total_value: { value: 16702 } },
  { name: 'profile_views', total_value: { value: 871 } },
  { name: 'views', total_value: { value: 259894 } },
] };

test('account mapping stores reach/profile totals and keeps views separate from impressions', async () => {
  const requests: Record<string, string>[] = [];
  const result = await fetchInstagramAccountMetrics(async (params) => {
    requests.push(params);
    return fixture;
  }, now);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].metric_type, 'total_value');
  assert.equal(requests[0].period, 'day');
  assert.equal(Number(requests[0].until) - Number(requests[0].since), 28 * 86400);
  assert.equal(Number(requests[0].until), Math.floor(now / 1000));
  assert.deepEqual(result.columns, { reach_28d: 16702, impressions_28d: null, profile_views_28d: 871 });
  assert.equal(result.measurement.views_28d, 259894);
  assert.equal(result.measurement.fallback_used, false);
  assert.deepEqual(result.measurement.requested_window, {
    since: Number(requests[0].since), until: Number(requests[0].until),
  });
  assert.deepEqual(result.insights, fixture);
});

test('fallback reduces metrics but preserves both bounds and records the retry', async () => {
  const requests: Record<string, string>[] = [];
  const result = await fetchInstagramAccountMetrics(async (params) => {
    requests.push(params);
    if (requests.length === 1) throw new Error('Optional metric unavailable');
    return fixture;
  }, now);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].metric, 'reach,views,profile_views');
  for (const key of ['since', 'until', 'period', 'metric_type']) {
    assert.equal(requests[1][key], requests[0][key]);
  }
  assert.equal(result.columns.reach_28d, 16702);
  assert.equal(result.measurement.fallback_used, true);
});

test('two failed requests propagate an error instead of producing a zero snapshot', async () => {
  let calls = 0;
  await assert.rejects(fetchInstagramAccountMetrics(async () => {
    calls++;
    throw new Error('Meta unavailable');
  }, now), /Meta unavailable/);
  assert.equal(calls, 2);
});

test('empty response remains unavailable', async () => {
  const result = await fetchInstagramAccountMetrics(async () => ({ data: [] }), now);
  assert.deepEqual(result.columns, { reach_28d: null, impressions_28d: null, profile_views_28d: null });
  assert.equal(result.measurement.views_28d, null);
});

test('real zeros survive the account mapping', async () => {
  const result = await fetchInstagramAccountMetrics(async () => ({ data: [
    { name: 'reach', total_value: { value: 0 } },
    { name: 'profile_views', total_value: { value: 0 } },
    { name: 'views', total_value: { value: 0 } },
  ] }), now);
  assert.equal(result.columns.reach_28d, 0);
  assert.equal(result.columns.profile_views_28d, 0);
  assert.equal(result.measurement.views_28d, 0);
});

test('unexpected daily series cannot become unique 28-day reach', async () => {
  const result = await fetchInstagramAccountMetrics(async () => ({ data: [
    { name: 'reach', values: [{ value: 100 }, { value: 80 }] },
  ] }), now);
  assert.equal(result.columns.reach_28d, null);
  assert.equal(result.insights.data?.[0].values?.length, 2);
});

test('invalid clock cannot issue an unbounded account request', async () => {
  let called = false;
  await assert.rejects(fetchInstagramAccountMetrics(async () => {
    called = true;
    return fixture;
  }, NaN), /Invalid Instagram snapshot time/);
  assert.equal(called, false);
});
