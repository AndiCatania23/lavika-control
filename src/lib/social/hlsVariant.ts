/* ──────────────────────────────────────────────────────────────────
   hlsVariant — resolver da HLS master playlist al variant migliore

   Quando il content_episodes.hls_url punta a un MASTER playlist con
   ladder multi-bitrate (es. 360p / 480p / 720p), FFmpeg by default
   sceglie il PRIMO variant elencato — tipicamente il più basso per
   fast adaptive startup. Per i render Story Video LAVIKA preferiamo
   720p (più che sufficiente per 1080×1920 zoom 1.18, peso 1.5-2x
   inferiore a 1080p).

   Usage:
     const visualUrl = await resolveBestHlsVariant(masterUrl, 720);
     // → URL del variant 720p (o massimo disponibile sotto 720p)

   Se l'URL passato è già un variant playlist (no #EXT-X-STREAM-INF)
   o non è raggiungibile, ritorna l'URL originale (graceful).
   ────────────────────────────────────────────────────────────────── */

export interface HlsVariantInfo {
  width: number;
  height: number;
  bandwidth: number;
  uri: string;
}

export async function parseHlsMaster(masterUrl: string): Promise<HlsVariantInfo[] | null> {
  try {
    const res = await fetch(masterUrl, { redirect: 'follow' });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.includes('#EXT-X-STREAM-INF')) {
      // Già variant playlist (singolo bitrate), niente da risolvere
      return null;
    }
    const lines = text.split('\n');
    const variants: HlsVariantInfo[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line.startsWith('#EXT-X-STREAM-INF')) continue;
      const resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/);
      const bwMatch = line.match(/BANDWIDTH=(\d+)/);
      // URI è la riga non-commento successiva
      let uri = '';
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (!next || next.startsWith('#')) continue;
        uri = next;
        break;
      }
      if (!uri || !resMatch) continue;
      variants.push({
        width: parseInt(resMatch[1], 10),
        height: parseInt(resMatch[2], 10),
        bandwidth: bwMatch ? parseInt(bwMatch[1], 10) : 0,
        uri,
      });
    }
    return variants.length > 0 ? variants : null;
  } catch {
    return null;
  }
}

/**
 * Risolve HLS master → URL del variant più adatto al preferHeight.
 * Preferenza: variant con height più alto ≤ preferHeight (es. 720p).
 * Se nessun variant ≤ preferHeight, prende il più grande disponibile.
 * Se masterUrl è già variant o irraggiungibile, ritorna masterUrl as-is.
 */
export async function resolveBestHlsVariant(
  masterUrl: string,
  preferHeight = 720,
): Promise<string> {
  const variants = await parseHlsMaster(masterUrl);
  if (!variants) return masterUrl;

  // Ordina decrescente per height
  const sorted = [...variants].sort((a, b) => b.height - a.height);
  // Preferisci il più alto ≤ preferHeight, altrimenti il più alto disponibile
  const preferred = sorted.find((v) => v.height <= preferHeight) ?? sorted[0];
  if (!preferred) return masterUrl;

  // Resolve URI relativo rispetto al master
  try {
    return new URL(preferred.uri, masterUrl).toString();
  } catch {
    return masterUrl;
  }
}
