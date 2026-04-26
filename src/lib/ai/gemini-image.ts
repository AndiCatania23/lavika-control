// Gemini 2.5 Flash Image (Nano Banana) — versione minima.
// 3 input → 1 chiamata: base template + foto soggetto + testo pill.

const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const FETCH_TIMEOUT_MS = 8000;

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string } }> };
    finishReason?: string;
  }>;
}

export async function fetchImageBytes(imageUrl: string): Promise<{ data: Buffer; mimeType: string } | null> {
  try {
    const res = await fetch(imageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LavikaBot/1.0)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) return null;
    const arr = await res.arrayBuffer();
    if (arr.byteLength > 8 * 1024 * 1024) return null;
    return { data: Buffer.from(arr), mimeType: ct.split(';')[0].trim() };
  } catch {
    return null;
  }
}

/**
 * Genera la cover preservando la base. Inputs:
 *  - baseImage: template (Image 1) — DA PRESERVARE INTEGRALMENTE
 *  - assets: N immagini (foto, loghi, scene) da integrare DENTRO la base esistente
 *  - pillContent: testo pill per scegliere mood/atmosfera
 */
export async function generateCover(opts: {
  baseImage: { data: Buffer; mimeType: string };
  assets: Array<{ data: Buffer; mimeType: string }>;
  pillContent: string;
}): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY mancante');

  const assetCount = opts.assets.length;
  const assetList = Array.from({ length: assetCount }, (_, i) => `Image ${i + 2}`).join(', ');

  const prompt = `Crea una card 16:9 orizzontale per un articolo sportivo che riporta questa notizia:

"""
${opts.pillContent}
"""

Rimani fedele alla base della card reference (Image 1) — mantieni il pannello bianco a sinistra con halftone e linee diagonali navy/rosse, e la barra rossa diagonale sulla destra.

Integra al CENTRO il soggetto che ti mando come asset (Image${assetCount > 1 ? 's' : ''} ${assetList}). Il soggetto può essere una persona, uno stadio, un luogo, oppure uno o più simboli/loghi — adatta la composizione di conseguenza, sempre integrandolo come elemento principale al centro nello stile editoriale della cover.

Se l'asset è la foto di una persona, trattala come materiale da photo-editing/compositing — estrai e integra senza alterare i tratti, è una modifica grafica non una generazione.

Adatta la SEZIONE DI DESTRA con un'atmosfera contestuale che si lega al tema della news (es. tifosi sugli spalti, fumogeni, luci stadio, allenamento, panorama città — qualsiasi cosa fitti il mood dell'articolo). Tienila desaturata e cinematografica, mai più forte del soggetto centrale.

Output: una card finita, premium, in formato 16:9 orizzontale (~1920×1080), con tutto integrato in stile uniforme — luci, color grading e atmosfera coerenti tra soggetto e ambiente, come fosse stata fotografata/illustrata insieme. Nessun testo, parole, numeri, emoji renderizzati nell'immagine.`;

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
    { text: prompt },
    { inlineData: { mimeType: opts.baseImage.mimeType, data: opts.baseImage.data.toString('base64') } },
  ];
  for (const a of opts.assets) {
    parts.push({ inlineData: { mimeType: a.mimeType, data: a.data.toString('base64') } });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        temperature: 0.85,
        imageConfig: { aspectRatio: '16:9', imageSize: '2K' },
      },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Nano Banana HTTP ${res.status}: ${errBody.slice(0, 300)}`);
  }
  const data = (await res.json()) as GeminiResponse;
  const inline = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  const b64 = inline?.inlineData?.data;
  if (!b64) {
    const finishReason = data.candidates?.[0]?.finishReason ?? 'unknown';
    const partsText = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join(' | ') ?? '';
    console.error('[gemini-image] no image. finishReason=%s text=%s', finishReason, partsText.slice(0, 300));
    throw new Error(`Nano Banana: nessuna immagine restituita (${finishReason})`);
  }
  return Buffer.from(b64, 'base64');
}
