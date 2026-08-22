import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTodayActions, buildTodayContext } from './operations';

test('nessun match imminente produce continuità editoriale', () => {
  const context = buildTodayContext({ match: null, sources: [], now: new Date('2026-08-22T10:00:00Z') });
  assert.match(context.objective, /continuità editoriale/i);
});

test('match imminente diventa contesto prioritario', () => {
  const context = buildTodayContext({ match: { id: 'm1', label: 'Catania–Crotone', kickoffAt: '2026-08-23T12:00:00Z', status: 'scheduled' }, sources: [], now: new Date('2026-08-22T10:00:00Z') });
  assert.match(context.subtitle, /Catania–Crotone domani/);
});

test('nuova Pill non coperta genera CTA verso il Composer esistente', () => {
  const actions = buildTodayActions({ approvalDrafts: [], match: null, sources: [{ id: 'p1', type: 'pill', title: 'Nuova Pill', publishedAt: '2026-08-22T09:00:00Z', imageUrl: 'x', contentType: 'news', alreadyDrafted: false }] });
  assert.equal(actions[0].href, '/social/composer?pill_id=p1');
  assert.equal(actions[0].actionLabel, 'GENERA');
});
