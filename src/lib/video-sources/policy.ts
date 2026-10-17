export function sourceProcessingError(platform: unknown, processing: Record<string, unknown> | null | undefined): string | null {
  if (!processing) return null;
  if (processing.youtubeOnly === true && platform !== 'youtube') return 'La modalità solo YouTube richiede una sorgente YouTube.';
  const interval = processing.discoveryIntervalMinutes;
  if (interval !== undefined && (typeof interval !== 'number' || !Number.isInteger(interval) || interval < 15 || interval > 1440)) return 'Intervallo di ricerca: da 15 a 1440 minuti.';
  if (processing.descriptionMode !== undefined && !['source', 'participants-after-date'].includes(String(processing.descriptionMode))) return 'Modalità info episodio non valida.';
  if (processing.youtubeLanguage !== undefined && !/^[a-z]{2}(?:-[A-Za-z]{2})?$/.test(String(processing.youtubeLanguage))) return 'Lingua YouTube non valida.';
  return null;
}
