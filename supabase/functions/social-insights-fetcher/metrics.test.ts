import assert from 'node:assert/strict';
import test from 'node:test';
import { engagementRate, firstAvailableMetric, firstMetricValue, pipelineStatus, sumKnownMetrics, sumMetricValues, totalMetricValue } from './metrics.ts';

test('total_value recupera la fixture account senza dipendere da values', () => {
  const response = { data: [
    { name: 'reach', total_value: { value: 16702 } },
    { name: 'profile_views', total_value: { value: '871' } },
  ] };
  assert.equal(totalMetricValue(response, 'reach'), 16702);
  assert.equal(totalMetricValue(response, 'profile_views'), 871);
});

test('total_value distingue zero, assenza e valori non validi', () => {
  assert.equal(totalMetricValue({ data: [{ name: 'reach', total_value: { value: 0 } }] }, 'reach'), 0);
  assert.equal(totalMetricValue({}, 'reach'), null);
  for (const value of [null, undefined, '', ' ', 'invalid', Infinity, NaN, {}, true]) {
    assert.equal(totalMetricValue({ data: [{ name: 'reach', total_value: { value } }] }, 'reach'), null);
  }
});

test('le serie legacy restano supportate dai lettori esistenti, senza inventare reach unica', () => {
  const response = { data: [{ name: 'reach', values: [{ value: 100 }, { value: 80 }] }] };
  assert.equal(firstMetricValue(response, 'reach'), 100);
  assert.equal(sumMetricValues(response, 'reach'), 180);
  assert.equal(totalMetricValue(response, 'reach'), null);
});

test('dato reach mancante resta null e non diventa zero', () => {
  assert.equal(firstMetricValue({ data: [] }, 'reach'), null);
  assert.equal(sumMetricValues({}, 'reach'), null);
});

test('uno zero realmente restituito da Meta resta zero', () => {
  const response = { data: [{ name: 'reach', values: [{ value: 0 }] }] };
  assert.equal(firstMetricValue(response, 'reach'), 0);
  assert.equal(sumMetricValues(response, 'reach'), 0);
});

test('fallback usa nullish semantics e non scarta uno zero valido', () => {
  assert.equal(firstAvailableMetric(0, 42), 0);
  assert.equal(firstAvailableMetric(null, 42), 42);
});

test('engagement senza denominatore valido non viene inventato', () => {
  assert.equal(engagementRate(12, null), null);
  assert.equal(engagementRate(12, 0), null);
  assert.equal(engagementRate(null, 100), null);
  assert.equal(engagementRate(12, 100), 0.12);
});

test('somma interazioni note senza trasformare assenza totale in zero', () => {
  assert.equal(sumKnownMetrics([null, null]), null);
  assert.equal(sumKnownMetrics([0, null]), 0);
  assert.equal(sumKnownMetrics([4, 2, null]), 6);
});

test('un errore Meta parziale non viene dichiarato come pipeline sana', () => {
  assert.equal(pipelineStatus([]), 'success');
  assert.equal(pipelineStatus(['Meta reach unavailable']), 'partial');
});
