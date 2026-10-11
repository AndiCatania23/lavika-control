import { z } from 'zod';

const APP_ORIGIN = 'https://lavikasport.app';
const cardPath = z.string().regex(/^\/immagini\/match-reaction\/[a-z0-9_]+\.(jpg|webp|png)$/);
const registrySchema = z.object({ generic: cardPath, speakers: z.record(z.string(), cardPath) });
type EpisodeArtwork = {
  format_id: string;
  thumbnail_url: string | null;
  speaker?: { full_name?: string | null } | { full_name?: string | null }[] | null;
};

/** Display-only artwork: never overwrite the editable episode thumbnail. */
export async function withEpisodeArtwork<T extends EpisodeArtwork>(episodes: T[]) {
  let registry: z.infer<typeof registrySchema> | null = null;
  if (episodes.some(episode => episode.format_id === 'match-reaction')) {
    try {
      const response = await fetch(`${APP_ORIGIN}/immagini/match-reaction/cards.json`, {
        next: { revalidate: 60 }, signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`Card registry HTTP ${response.status}`);
      registry = registrySchema.parse(await response.json());
    } catch (error) {
      console.warn('[episodeArtwork] Card registry unavailable:', error instanceof Error ? error.message : 'invalid response');
    }
  }
  return episodes.map(episode => {
    let effective = episode.thumbnail_url;
    if (episode.format_id === 'match-reaction' && registry) {
      const speaker = Array.isArray(episode.speaker) ? episode.speaker[0] : episode.speaker;
      const key = (speaker?.full_name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      const path = Object.hasOwn(registry.speakers, key) ? registry.speakers[key] : registry.generic;
      effective = `${APP_ORIGIN}${path}`;
    }
    return { ...episode, effective_thumbnail_url: effective };
  });
}
