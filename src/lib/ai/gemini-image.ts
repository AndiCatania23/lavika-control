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

  const prompt = `You are a senior art director. Generate a premium 16:9 editorial sports magazine cover by COMPOSING — not stamping — using the brand identity from Image 1 plus the content assets that follow.

🎨 IMAGE 1 = BRAND IDENTITY & LAYOUT GRAMMAR (use it as a visual blueprint, not as a flat background to overlay)
Take from Image 1:
- The left-side white textured panel with halftone dots and the two thin diagonal navy/red accent lines
- The deep blue central area as palette/atmosphere
- The diagonal RED stripe accent on the right
- The 16:9 proportions and overall composition grammar (left-graphic / center-hero / right-context)
Recreate this brand identity faithfully in the output, but the center and right-context areas must be NEWLY COMPOSED with the assets below — this is generative editorial design, not flat overlay.

📥 CONTENT ASSETS TO INTEGRATE (${assetCount} attached: ${assetList}):
Use ALL of them and decide intelligently where each belongs:
- A **PHOTO of a person/scene** → becomes the central HERO, slightly right-of-center, 3/4 cinematic framing. Cut out and re-lit to fit the deep blue gradient atmosphere. CRITICAL FRAMING: the subject must NOT touch the top border of the cover — leave clear breathing room (~10-15% padding) above the head. Crop the subject from chest/waist up; do NOT extend full-body floor-to-ceiling. Add a soft "ghost echo" of the same image behind (monochrome blue, ~25% opacity, offset upper-left), but the ghost echo MUST stay entirely INSIDE the deep blue central area — it MUST NOT bleed into or overlap the white left panel.
- A **LOGO/CREST** (transparent square) → becomes a smaller branded accent: applied on a player's kit, floating subtly in the corner, or as small decorative element. Never inflated to fill the canvas.
- **Mixed**: hero photo dominates, logos are integrated as small editorial accents around or on the hero.

🌆 RIGHT-SIDE CONTEXT AREA (under the red stripe):
Newly composed contextual scene that fits the pill mood — desaturated, atmospheric, never competing with the hero (e.g. ultras crowd, stadium lights, smoke from flares, training ground, press conference). The diagonal RED stripe stays bold on top.

📝 MOOD & STORY (use this to drive the artistic interpretation — do NOT render any of this text):
"""
${opts.pillContent}
"""

OUTPUT:
- A finished, premium-looking sports magazine cover where the brand identity of Image 1 is unmistakable AND the assets are beautifully integrated
- Cinematic lighting, deep shadows, controlled highlights
- 16:9
- NO text, NO words, NO numbers, NO captions, NO emoji rendered anywhere`;

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
      generationConfig: { responseModalities: ['IMAGE'], temperature: 0.85 },
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
