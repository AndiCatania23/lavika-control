import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

const VALID_CATEGORIES = ['numeri', 'flash', 'rivali', 'storia'] as const;
const VALID_TYPES = ['stat', 'update', 'quote', 'clip', 'trivia'] as const;

type Category = (typeof VALID_CATEGORIES)[number];
type PillType = (typeof VALID_TYPES)[number];

interface GenerateRequest {
  topic: string;
  category: Category;
  type: PillType;
}

interface GeminiCandidate {
  content?: { parts?: Array<{ text?: string }> };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

const CATEGORY_HINT: Record<Category, string> = {
  numeri: 'dato numerico/statistica (es. gol segnati, media punti, trend)',
  flash: 'notizia fresca del giorno (news, dichiarazione, evento recente)',
  rivali: 'contesto competizione/avversari del girone C (rivali, classifica, playoff)',
  storia: 'aneddoto storico del Catania (ricorrenza, leggenda, memoria)',
};

function buildPrompt(topic: string, category: Category, type: PillType): string {
  return `Sei l'editor delle "Pills" di LAVIKA, app dei tifosi del Catania FC (Serie C, girone C).
Usa Google Search per trovare notizie RECENTI (ultimi 7 giorni) sul topic richiesto e produci UNA pill pronta alla pubblicazione.

Topic richiesto dall'utente: """${topic}"""
Categoria: ${category} — ${CATEGORY_HINT[category]}
Tipo: ${type}

Regole rigide:
- Titolo: max 60 caratteri, in italiano, diretto, con UNA emoji iniziale pertinente.
- Contenuto: 2-4 frasi in italiano, max 400 caratteri totali, tono giornalistico sintetico e coinvolgente. NESSUNA emoji nel contenuto.
- Prospettiva: focus sul Catania; se la notizia riguarda rivali/girone, evidenzia sempre l'impatto sul Catania.
- Niente frasi filler, niente disclaimer, niente richieste all'utente.
- 🚫 ANTI-INVENZIONE (CRITICA): NON inventare nomi di persone (allenatori, dirigenti, giocatori, presidenti). Ogni cognome che scrivi DEVE comparire letteralmente negli articoli reali trovati via Google Search. Se non trovi un nome preciso per un ruolo, scrivi "la società"/"il club"/"lo staff tecnico" — MAI un cognome plausibile dalla tua conoscenza generale. L'allenatore attuale del Catania è Domenico "Mimmo" Toscano (richiamato ad aprile 2026 dopo l'esonero di William Viali).

Fonte:
- Identifica la testata/pubblicazione principale da cui proviene la notizia (es. "La Sicilia", "Tutto Calcio Catania", "BlogSicilia", "Gazzetta dello Sport").
- Se non riesci a identificare una testata univoca, lascia il campo source vuoto ("").
- NON inserire URL o link nel campo source — solo il nome pulito della testata.

Rispondi SOLO con un oggetto JSON valido (nessun markdown, nessun testo fuori), schema:
{"title": string, "content": string, "source": string}`;
}

function extractJsonBlock(text: string): { title: string; content: string; source: string | null } | null {
  if (!text) return null;
  // Strip markdown fences if present
  const cleaned = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  const slice = cleaned.slice(start, end + 1);
  try {
    const parsed = JSON.parse(slice) as { title?: unknown; content?: unknown; source?: unknown };
    if (typeof parsed.title !== 'string' || typeof parsed.content !== 'string') return null;
    const title = parsed.title.trim();
    const content = parsed.content.trim();
    if (!title || !content) return null;
    const source = typeof parsed.source === 'string' ? parsed.source.trim() : '';
    return { title, content, source: source || null };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!supabaseServer) {
    return NextResponse.json({ error: 'Supabase non configurato' }, { status: 500 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY mancante' }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as Partial<GenerateRequest> | null;
  if (!body || typeof body.topic !== 'string' || !body.topic.trim()) {
    return NextResponse.json({ error: 'Campo topic mancante' }, { status: 400 });
  }
  if (!body.category || !VALID_CATEGORIES.includes(body.category)) {
    return NextResponse.json({ error: 'Categoria non valida' }, { status: 400 });
  }
  if (!body.type || !VALID_TYPES.includes(body.type)) {
    return NextResponse.json({ error: 'Tipo non valido' }, { status: 400 });
  }

  const topic = body.topic.trim().slice(0, 500);
  const prompt = buildPrompt(topic, body.category, body.type);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  let geminiData: GeminiResponse;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1200,
        },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      return NextResponse.json(
        { error: `Gemini HTTP ${res.status}: ${errBody.slice(0, 300)}` },
        { status: 502 },
      );
    }
    geminiData = (await res.json()) as GeminiResponse;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Gemini fetch failed: ${message}` }, { status: 502 });
  }

  const rawText = geminiData.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
  const parsed = extractJsonBlock(rawText);
  if (!parsed) {
    return NextResponse.json(
      { error: 'Gemini ha restituito un formato non valido', raw: rawText.slice(0, 500) },
      { status: 502 },
    );
  }

  const { data: inserted, error: insertErr } = await supabaseServer
    .from('pills')
    .insert({
      title: parsed.title.slice(0, 60),
      content: parsed.content.slice(0, 800),
      type: body.type,
      pill_category: body.category,
      status: 'draft',
      generated_by: 'gemini-manual',
      source: 'editorial',
      source_attribution: parsed.source ? parsed.source.slice(0, 120) : null,
      is_published: false,
    })
    .select()
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json(
      { error: insertErr?.message ?? 'Insert failed' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, pill: inserted });
}
