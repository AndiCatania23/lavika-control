# Anti-Hallucination Pipeline — Technical Spec

**Problema risolto**: prevenire che il caption engine inventi o contraddica
fatti della pill (es. dire "Caturano segna" se la pill dice "Caturano non
ha mai vinto i playoff").

**Approccio**: NON confidare nel prompt LLM. Guardrail strutturali multi-stage
deterministici + 1 stage LLM semantico calibrato.

## Pipeline 4-step

### Step 1 — Fact Extractor

**Input**: pill (title + content)
**Model**: `gemma3:12b` JSON-mode, temperature 0.2
**Latency**: ~7s
**Output JSON**:

```json
{
  "entities": [
    {"name": "Salvatore Caturano", "role": "player", "polarity": "negative"}
  ],
  "numbers": ["8", "7", "3"],
  "key_claim": "Salvatore Caturano cerca di sfatare il tabù playoff",
  "sentiment": "sober",
  "forbidden_claims": [
    "Caturano ha vinto i playoff",
    "Caturano ha stagione positiva",
    "Caturano contribuito alla vittoria del Catania in Serie B"
  ]
}
```

Il campo critico è **`polarity`** per ogni entità:
- `positive`: entità in stato positivo (ha segnato, in forma, ha vinto)
- `negative`: entità in stato negativo (infortunata, squalificata, in crisi, ha
  perso, NON ha fatto X)
- `neutral`: menzionata senza valenza specifica

Il fact extractor è chiamato a estrarre **forbidden_claims**: 3-5 affermazioni
che sarebbero contraddizioni della pill, usate come constraint negativo nel
prompt del generator (step 2).

### Step 2 — Hook Generator (constrained)

**Input**: pill + facts da step 1
**Model**: `gemma3:12b` JSON-mode, temperature 0.85
**Latency**: ~10s

Il prompt impone come **regole inviolabili**:
1. Usa SOLO `allowed_entities` (estratte da step 1)
2. Usa SOLO `allowed_numbers`
3. NON affermare mai `forbidden_claims`
4. Per entità con `polarity=negative`, NON usare verbi positivi (segna, vince,
   in forma, trionfa, in campo) vicino al loro nome
5. Max 138 caratteri il hook
6. Max 2 emoji, narrativi, dalla whitelist
7. Niente engagement bait, niente "Link in bio"

**Output JSON**:
```json
{
  "variants": [
    {
      "hook": "8 playoff alle spalle, 7 senza gioie. 🙈 Per Caturano è una vera e propria sfida personale.",
      "framework": "negation",
      "char_count": 96,
      "facts_used": ["8 partecipazioni", "7 senza trionfo"]
    },
    ...3 totali
  ]
}
```

### Step 3 — Validator multi-stage

Per ogni hook generato, esegue 5 sub-check in pipeline (early exit non
applicato — tutti i check girano per audit completo):

#### 3a. Entity Check (regex + safe-list)

**Latency**: ~5ms

Estrae parole capitalized dal hook. Per ogni parola:
- Skip se in `SAFE_CAPITALIZED` (start-of-sentence common: "Il", "Sai", "Cosa",
  giorni della settimana, mesi, "Catania", "Massimino", numeri scritti...)
- Match fuzzy: il token lowercased deve essere substring di — o contenere —
  almeno un token estratto dalle `allowed_entities` (split su spazi/apostrofi/
  trattini, lemma >= 4 char)

**Esempio**:
- Hook: *"Caturano salva il Catania"*
- allowed_entities: `["Salvatore Caturano", "Catania FC"]`
- valid_tokens: `{salvatore, caturano, catania}`
- Hook capitalized: `["Caturano", "Catania"]`
- Match: ✅

#### 3b. Number Check (regex)

**Latency**: ~5ms

Estrae token numerici dal hook (`\d+(?:[.,]\d+)*(?:°|ª|'|")?`).
Ogni numero deve essere substring di qualche `allowed_numbers` (o viceversa,
normalizzati senza simboli `° ' "`).

Catches: gemma3 che inventa un minuto di partita, una stagione, una cifra
ingaggi sbagliata.

#### 3c. Polarity Check — IL CHECK CRITICO

**Latency**: ~10ms

Per ogni entità con `polarity=negative` (es. Caturano squalificato/infortunato/
in crisi), il check cerca se nel hook compare un verbo dalla `POSITIVE_VERBS`
blocklist entro 30 caratteri dall'entità:

```python
POSITIVE_VERBS = [
    r"segn\w*",        # segna, segnato
    r"trionf\w*",      # trionfa
    r"vinc\w*",        # vince, vincente, vinto
    r"vittor\w*",
    r"in\s+gran\s+forma",
    r"in\s+forma",
    r"protagonist\w*",
    r"in\s+campo",
    r"titolar\w*",
    r"giocher\w*",
    r"gioca\b",
    r"sblocca\b",
    r"decid\w*",
    r"sbanca\b",
    r"esult\w*",
]
```

**Match window** = 30 caratteri (avanti o indietro dall'entità).

Se trovato → REJECT con flag `polarity_violation`.

**Esempio test reale (POC pill #4 Caturano tabù)**: il generator (con
temperature 0.85) non ha mai prodotto un hook tipo "Caturano segna i playoff"
grazie ai constraint del prompt + forbidden_claims. Il polarity check ha
agito da fail-safe ridondante.

#### 3d. NLI Semantic Check

**Model**: `llama3.1:8b` temperature 0.0
**Latency**: ~3s
**Prompt**: calibrato per essere TOLLERANTE su tono/idiomi e RIGOROSO solo su
fatti.

```
FLAGGA contradiction=true SOLO SE caption:
- afferma X→Y mentre news dice X→¬Y
- usa numeri/date diversi
- attribuisce azione alla persona/squadra sbagliata
- contraddice esplicitamente

NON FLAGGARE per:
- differenze di tono/atmosfera
- espressioni idiomatiche
- sintesi compressa
- domande retoriche
- sinonimi semantici
- inferenze ragionevoli sul tema
```

Catches: claim sottili che sfuggono ai regex (es. attribuzione errata, "Pisa
ha vinto" vs "Catania ha vinto", giorni della settimana sbagliati).

#### 3e. Embedding Similarity

**Model**: `nomic-embed-text`
**Latency**: ~150ms
**Threshold**: cosine >= 0.45

Calcola cosine similarity tra embedding del hook e embedding della pill.
Catches: hook completamente off-topic (caption su tifosi quando la pill parla
di mercato).

### Step 4 — Approve / Retry / Flag

```
≥ 1 hook che passa TUTTI i 5 sub-check → save in social_variants
0 hook validi                          → retry generation max 2 volte
0 hook validi dopo retry               → flag manual + Telegram alert
                                       + fallback caption template hardcoded
                                         (no factual claim, generica safe)
```

**Audit log**: ogni reject loggato in `caption_validation_log` con stage + reason.
Permette di analizzare nel tempo dove il sistema rejecta più spesso e
calibrare il prompt.

## Performance attesa (verificata POC v2)

Su 10 pill rappresentative (positive, negative, infortuni, squalifiche, rivali,
storia, redemption, numeri specifici):

| Metrica | Risultato |
|---|---|
| Hook validi all-stage | 23/30 = **76%** |
| Polarity violations | 0/30 = **0%** |
| Number invented | 0/30 = **0%** |
| Length violations | 0/30 = **0%** |
| Bait patterns | 0/30 = **0%** |
| Embed off-topic | 0/30 = **0%** |
| Entity false-positives (residui) | 5/30 = 16% |
| NLI over-zealous (residui) | 2/30 = 6% |
| Pill con ≥1 hook valido | **10/10 = 100%** |

## Adversarial test set (P0 release gate)

Prima del deploy in produzione, eseguire batch su 20 pill ostili:
- Doppia negazione (non è vero che non gioca)
- Ironia/sarcasmo (titoli con virgolette)
- Citazioni rivali (chi ha detto cosa)
- Confusioni cross-team (D'Ausilio: segnò CONTRO Catania, oggi gioca PER Catania)
- Date storiche multiple in stessa pill
- Numeri vicini ma diversi (14M monte ingaggi vs 4M gap)
- Sconfitte pesanti (≥3 gol scarto)
- Lutti / morte ex-giocatori
- Squalifiche multiple
- Pill con verbi al passato remoto ambiguo

**Release gate**: pass rate ≥ 70% sull'adversarial set + **0 polarity violations**.

## Edge cases — manuali (override)

Pill che innescano `external_context` non-standard richiedono override del
generator (caption con tono speciale o stop pubblicazione):

| Trigger | Override |
|---|---|
| `external_context = lutto` | STOP pubblicazione auto 24h. Solo Andrea manuale. |
| `external_context = scandalo_societa` | STOP auto 48h. |
| `external_context = sciopero_tifosi` | No post celebrativo curva 72h. |
| `match_result = blowout_loss` (≥3 scarto) | Caption ≤ 60c, no emoji, no "torneremo". |
| `match_result = heartbreak` (90'+) | Solo score + 1 frase fattuale. |

Implementazione: tabella `caption_safeguards` con regole. Prima di lanciare il
generator, verifica `external_context` e applica override.

## File implementation reference

- POC Python (validato): `~/LAVIKA-SPORT/poc-hook-engine/poc.py`
- Risultati POC: `~/LAVIKA-SPORT/poc-hook-engine/results_v2.json`
- Implementation TS: `src/lib/social/caption/` (P0 in progress)
