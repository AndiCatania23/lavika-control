// Gemini 2.5 Flash Image (Nano Banana) — versione minima.
// 3 input → 1 chiamata: base template + foto soggetto + testo pill.

const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image';
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
 * Genera la cover. Inputs minimi:
 *  - baseImage: template (Image 1)
 *  - subjectImage: foto soggetto fornita dall'utente (Image 2)
 *  - pillContent: testo pill (NO titolo)
 */
export async function generateCover(opts: {
  baseImage: { data: Buffer; mimeType: string };
  subjectImage: { data: Buffer; mimeType: string };
  pillContent: string;
}): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY mancante');

  const prompt = `Compose a 16:9 sports magazine cover by combining the two attached images.

Image 1 is the layout base — keep its left-side white panel with halftone dots and the two thin diagonal navy/red lines, and keep the diagonal red stripe accent on the right. Replace the center and right area with new content as described.

Image 2 is the central hero element of the composition — use it as the main visual in the center, slightly right-of-center, 3/4 framing. Cut it out from its original background and integrate it cleanly into the new dark blue gradient center area. Add a soft "ghost echo" of image 2 behind it (same image desaturated to monochrome blue, low opacity ~30%, offset to upper-left).

The right side should show a subtle, desaturated atmospheric backdrop (an ultras crowd, stadium lights, smoke from flares, or similar mood-matching scene) — keep it muted so it never competes with the central element. The diagonal red stripe accent stays on top.

Mood reference text (use this to pick the atmosphere — do NOT render any of this text in the image):
"""
${opts.pillContent}
"""

Style: premium editorial sports cover, cinematic lighting, deep shadows.

Strict constraints: no text, no words, no numbers, no captions, no emoji rendered anywhere. The title will be overlaid by the app afterwards.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType: opts.baseImage.mimeType, data: opts.baseImage.data.toString('base64') } },
          { inlineData: { mimeType: opts.subjectImage.mimeType, data: opts.subjectImage.data.toString('base64') } },
        ],
      }],
      generationConfig: { responseModalities: ['IMAGE'], temperature: 0.9 },
    }),
    signal: AbortSignal.timeout(60_000),
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
