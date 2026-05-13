/**
 * Ollama HTTP client locale.
 * Default URL: http://localhost:11434 (Mac Mini daemon, modelli pre-caricati).
 *
 * Modelli usati:
 *   - gemma3:12b           — gen JSON-mode (fact extractor + hook generator)
 *   - llama3.1:8b          — NLI semantic check
 *   - nomic-embed-text     — embedding similarity
 *
 * Vedi docs/social-engine/02-anti-hallucination-pipeline.md
 */

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
// Default '0' = unload subito dopo ogni request. Override via env per match-day burst.
const KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE || '0';

export const GEN_MODEL = process.env.OLLAMA_GEN_MODEL || 'gemma3:12b';
export const NLI_MODEL = process.env.OLLAMA_NLI_MODEL || 'llama3.1:8b';
export const EMB_MODEL = process.env.OLLAMA_EMB_MODEL || 'nomic-embed-text';

export interface OllamaGenerateOptions {
  model?: string;
  system?: string;
  jsonMode?: boolean;
  temperature?: number;
  numPredict?: number;
  timeoutMs?: number;
}

export async function ollamaGenerate(prompt: string, opts: OllamaGenerateOptions = {}): Promise<string> {
  const model = opts.model || GEN_MODEL;
  const body: Record<string, unknown> = {
    model,
    prompt,
    stream: false,
    keep_alive: KEEP_ALIVE,
    options: {
      temperature: opts.temperature ?? 0.7,
      num_predict: opts.numPredict ?? 800,
    },
  };
  if (opts.system) body.system = opts.system;
  if (opts.jsonMode) body.format = 'json';

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 180_000);
  try {
    const r = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`Ollama ${model} HTTP ${r.status}: ${await r.text().catch(() => '')}`);
    const j = await r.json();
    return j.response as string;
  } finally {
    clearTimeout(timeout);
  }
}

export async function ollamaEmbed(text: string, model = EMB_MODEL): Promise<number[]> {
  const r = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: text, keep_alive: KEEP_ALIVE }),
  });
  if (!r.ok) throw new Error(`Ollama embed HTTP ${r.status}: ${await r.text().catch(() => '')}`);
  const j = await r.json();
  return j.embedding as number[];
}

/** Parsing JSON tollerante (gestisce ```fences```, prefix testo, trailing). */
export function safeJsonParse<T = unknown>(text: string): T | null {
  let t = text.trim();
  if (t.startsWith('```')) t = t.replace(/^```(json)?\n?/, '').replace(/\n?```$/, '');
  try { return JSON.parse(t) as T; } catch { /* fallthrough */ }
  const m = t.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (m) { try { return JSON.parse(m[1]) as T; } catch { return null; } }
  return null;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Warmup tutti i modelli (chiamato all'avvio del daemon). */
export async function warmupModels(): Promise<void> {
  await Promise.allSettled([
    ollamaGenerate('ok', { model: GEN_MODEL, numPredict: 2, temperature: 0 }),
    ollamaGenerate('ok', { model: NLI_MODEL, numPredict: 2, temperature: 0 }),
    ollamaEmbed('warmup'),
  ]);
}

/**
 * Forza l'unload del modello dalla RAM/VRAM Ollama (TTL 0).
 * Da chiamare in `finally` dopo call LLM per liberare immediatamente.
 *
 * Use case: il Mac Mini ha 24GB di RAM e gira anche app/sync/control,
 * non vogliamo che gemma3:12b (~9.5GB) resti caricata dopo che il job
 * social asset è finito. KEEP_ALIVE=0 nelle request fa il suo lavoro
 * ma con job consecutivi ravvicinati il modello può restare caricato.
 *
 * Implementazione: chiama `POST /api/generate` con keep_alive=0 e
 * prompt minimo "." → Ollama unloads il modello al termine.
 * Fire-and-forget: non blocchiamo il caller, ignoriamo errori.
 */
export async function ollamaUnloadModel(model: string): Promise<void> {
  try {
    await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: '',
        keep_alive: 0,         // numero 0 = unload immediato dopo questa request
        stream: false,
        options: { num_predict: 1 },
      }),
    });
  } catch {
    // Ignora errori — best-effort cleanup
  }
}
