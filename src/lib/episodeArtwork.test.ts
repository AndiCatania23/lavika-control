import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withEpisodeArtwork } from './episodeArtwork';

const registry = { generic: '/immagini/match-reaction/match_reaction_generica.jpg', speakers: { roberto_insigne: '/immagini/match-reaction/match_reaction_roberto_insigne.jpg' } };
test('uses the shared speaker card without changing editable thumbnails; falls back for unknown speakers', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json(registry); };
  try {
    const rows = await withEpisodeArtwork([
      { format_id: 'match-reaction', thumbnail_url: 'original.jpg', speaker: { full_name: 'Roberto Insigne' } },
      { format_id: 'match-reaction', thumbnail_url: null, speaker: [{ full_name: 'Unknown' }] },
      { format_id: 'highlights', thumbnail_url: 'highlights.jpg', speaker: null },
    ]);
    assert.equal(calls, 1);
    assert.equal(rows[0].effective_thumbnail_url, 'https://lavikasport.app' + registry.speakers.roberto_insigne);
    assert.equal(rows[0].thumbnail_url, 'original.jpg');
    assert.equal(rows[1].effective_thumbnail_url, 'https://lavikasport.app' + registry.generic);
    assert.equal(rows[2].effective_thumbnail_url, 'highlights.jpg');
  } finally { globalThis.fetch = original; }
});
test('keeps episodes available when registry is unavailable or contains invalid paths', async () => {
  const original = globalThis.fetch;
  try {
    for (const response of [new Response(null, { status: 503 }), Response.json({ ...registry, generic: 'https://untrusted.example/image.jpg' })]) {
      globalThis.fetch = async () => response;
      const [episode] = await withEpisodeArtwork([{ format_id: 'match-reaction', thumbnail_url: 'original.jpg' }]);
      assert.equal(episode.effective_thumbnail_url, 'original.jpg');
    }
  } finally { globalThis.fetch = original; }
});
