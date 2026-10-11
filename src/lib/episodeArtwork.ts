type EpisodeArtwork = { thumbnail_url: string | null };

/** The database materializes Control's manual > speaker > generic decision. */
export async function withEpisodeArtwork<T extends EpisodeArtwork>(episodes: T[]) {
  return episodes.map(episode => ({ ...episode, effective_thumbnail_url: episode.thumbnail_url }));
}
