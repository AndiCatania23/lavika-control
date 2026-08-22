import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEditorialRadar } from './editorialRadar';

const now = new Date('2026-08-22T10:00:00Z');

test('nessun match imminente non genera trigger match inventati', () => {
  assert.equal(buildEditorialRadar({ match: null, sources: [], now }).length, 0);
});

test('match imminente genera solo trigger rilevabili e nessuna formazione', () => {
  const triggers = buildEditorialRadar({ match: { id: 'm1', label: 'CAT–INT', kickoffAt: '2026-08-23T10:00:00Z', status: 'scheduled' }, sources: [], now });
  assert.ok(triggers.some((item) => item.type === 'MATCH_MINUS_24H'));
  assert.ok(triggers.some((item) => item.type === 'MATCH_ENDED'));
  assert.ok(triggers.every((item) => item.type !== ('LINEUP_AVAILABLE' as never)));
});

test('nuova Pill genera CTA Composer e Pill già coperta no', () => {
  const base = { type: 'pill' as const, title: 'Pill mercato', publishedAt: '2026-08-22T09:00:00Z', imageUrl: 'x', contentType: 'market' as const };
  const triggers = buildEditorialRadar({ match: null, sources: [{ ...base, id: 'new', alreadyDrafted: false }, { ...base, id: 'done', alreadyDrafted: true }], now });
  assert.equal(triggers.length, 1);
  assert.equal(triggers[0].href, '/social/composer?pill_id=new');
});

test('nuovo episodio e press conference sono distinti', () => {
  const triggers = buildEditorialRadar({ match: null, sources: [
    { id: 'e1', type: 'episode', title: 'Nuovo episodio', publishedAt: '2026-08-22T08:00:00Z', imageUrl: 'x', contentType: 'episode', alreadyDrafted: false },
    { id: 'e2', type: 'episode', title: 'Conferenza stampa pre gara', publishedAt: '2026-08-22T09:00:00Z', imageUrl: 'x', contentType: 'episode', alreadyDrafted: false },
  ], now });
  assert.ok(triggers.some((item) => item.type === 'NEW_EPISODE'));
  assert.ok(triggers.some((item) => item.type === 'NEW_PRESS_CONFERENCE'));
});
