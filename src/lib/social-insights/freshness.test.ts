import assert from 'node:assert/strict';
import test from 'node:test';
import { datasetFreshness } from './freshness';

const now = new Date('2026-08-22T12:00:00.000Z');

test('distingue fresh, stale e partial', () => {
  assert.equal(datasetFreshness({ source: 'Meta', updatedAt: '2026-08-22T11:30:00Z', staleAfterMinutes: 60, now }).status, 'fresh');
  assert.equal(datasetFreshness({ source: 'Meta', updatedAt: '2026-08-22T09:00:00Z', staleAfterMinutes: 60, now }).status, 'stale');
  assert.equal(datasetFreshness({ source: 'Meta', updatedAt: '2026-08-22T11:30:00Z', staleAfterMinutes: 60, now, partial: true }).status, 'partial');
});

test('assenza, errore e timestamp non valido non diventano fresh', () => {
  assert.equal(datasetFreshness({ source: 'Meta', updatedAt: null, staleAfterMinutes: 60, now }).status, 'unavailable');
  assert.equal(datasetFreshness({ source: 'Meta', updatedAt: null, staleAfterMinutes: 60, now, error: 'provider' }).status, 'error');
  assert.equal(datasetFreshness({ source: 'Meta', updatedAt: 'non-data', staleAfterMinutes: 60, now }).status, 'error');
});
