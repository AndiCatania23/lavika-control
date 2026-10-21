# T01 — Instagram account metrics in Control

Scope: `AndiCatania23/lavika-control` only. This patch does not change the public
app, auth, core-action tracking, analytics certification, schema or configuration.
It has not been deployed and does not backfill stored snapshots.

## Defect and correction

The account request asks for `metric_type=total_value`, but the existing parser
reads only `values[].value`. A sanitized response with reach 16702 and profile
views 871 therefore becomes unavailable on master. The previously inspected
live v4 implementation instead returns false zeros for the same response shape.

The account adapter now reads `total_value.value`, preserving real zero and
returning null for absent/non-numeric values. Existing legacy series readers for
Facebook and individual media are unchanged. A daily reach series is not summed
into a unique 28-day audience: overlapping daily users cannot be deduplicated.

Both the primary request and the reduced-metric retry retain the same `since`
and `until` (28 × 86400 seconds). If both fail, the error reaches the existing
account error handler; no replacement account row is constructed from that
failure. There is no undated fallback masquerading as a 28-day result.

`raw.measurement` records the requested window, metric type, period and retry
flag. This describes the request, not independently verified provider coverage.
`raw.igInfo` and `raw.igInsights` remain available for existing consumers.

Instagram views are retained as `raw.measurement.views_28d`; they are no longer
written into `impressions_28d`, which is null for this Instagram contract.
Facebook impressions remain unchanged. The current Control account KPI displays
reach; it does not display this Instagram views field. No new views card is
introduced. Consumers must not treat a missing impressions value as zero.

## Verification

Offline fixture tests cover the observed response shape, real zeros, missing and
invalid values, legacy readers, non-additive reach, request bounds, retry bounds,
retry failure and separation of views/impressions. No production credentials or
live writes are needed. The tests are included in both the social suite and the
existing Insights integrity CI job, without workflow changes.

```sh
node --import tsx --test src/lib/social-insights/*.test.ts src/lib/social/approval.test.ts supabase/functions/social-insights-fetcher/*.test.ts
npm run test:insights
```

Local Node 24 results: social suite 34/34; Insights suite 20/20. The metrics,
adapter and test files pass TypeScript checking. `npm run test:social` uses the
tsx CLI, whose IPC socket is blocked in the execution environment; the equivalent
Node/tsx loader command above runs the same files successfully.

## Activation requires a separate decision

This branch corrects source code; existing production zeros and historical
unknown windows do not change merely because the PR exists or is merged.
The inspected live Edge Function v4 differs from master beyond this patch:
review that drift before any separately authorized deployment. This work did
not run the Deno handler against live Meta/Supabase or validate provider coverage
with a new live snapshot. After an authorized deployment, validate a fresh
snapshot's raw totals, normalized totals, window and Control readout. Historical
snapshots must not be relabeled as verified 28-day values without evidence.

No migration, backfill, credential rotation, public-app change or deploy is part
of this PR. A rollback of this source patch would restore the known parsing
defect; do not present that as a data repair.
