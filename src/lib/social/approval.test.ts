import assert from 'node:assert/strict';
import test from 'node:test';
import { canPublishApprovedDraft, validateApproval } from './approval';

test('blocca approvazione mentre un asset è ancora in lavorazione', () => {
  const result = validateApproval(
    { status: 'review', requires_approval: true },
    [{ status: 'asset_pending', asset_url: null }],
  );
  assert.equal(result.ok, false);
});

test('approva un pacchetto con varianti pronte', () => {
  const result = validateApproval(
    { status: 'review', requires_approval: true },
    [{ status: 'asset_ready', asset_url: 'https://media.example/image.jpg' }],
  );
  assert.deepEqual(result, { ok: true });
});

test('la pubblicazione richiede approvazione esplicita quando configurata', () => {
  assert.equal(canPublishApprovedDraft({ requires_approval: true, approved_at: null, status: 'review' }), false);
  assert.equal(canPublishApprovedDraft({ requires_approval: true, approved_at: '2026-08-22T12:00:00Z' }), true);
  assert.equal(canPublishApprovedDraft({ requires_approval: false, approved_at: null }), true);
});
