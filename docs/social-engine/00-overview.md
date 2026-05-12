# LAVIKA Caption Hook Engine — Overview

**Stato**: P0 in implementazione (maggio 2026)
**Maintainer**: Andrea + Claude

Sistema on-premise per generare caption-as-hook + hashtag tier per i post social
(Instagram + Facebook) di LAVIKA Sport, partendo da pill / episodi / match events.

## Filosofia

1. **Caption ≠ riassunto della notizia**. La notizia è già nella pill stessa. La
   caption è un **HOOK** che crea curiosity gap per spingere il tap → apri app.
   Stile Bleacher Report / DAZN, non testata giornalistica.

2. **Zero API LLM a pagamento**. Tutto on-premise sul Mac Mini M4 Pro:
   - `gemma3:12b` (Ollama) per fact extraction + hook generation
   - `llama3.1:8b` (Ollama) per NLI semantic check
   - `nomic-embed-text` (Ollama) per embedding similarity
   - Costo: €0/mese (energia trascurabile)

3. **Anti-hallucination strutturale**, non confidato al prompt. Pipeline a 4 step
   con guardrail deterministici. Vedi [02-anti-hallucination-pipeline.md](./02-anti-hallucination-pipeline.md).

4. **Data-driven**: caption performance loop weekly aggiorna `winning_patterns`
   letti come few-shot dinamici la settimana successiva. Vedi
   [05-feedback-loop.md](./05-feedback-loop.md).

## Architettura ad alto livello

```
┌──────────────────────────────────────────────────────────────────────┐
│  TRIGGER  (pill published / episode ready / match event)             │
└──────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
        ┌────────────────────────────────────────────────────┐
        │ Composer / API   POST /api/social/drafts/from-pill │
        │ → INSERT caption_jobs (queue)                      │
        └────────────────────────────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  Mac daemon `caption-engine.ts` (launchd KeepAlive)         │
   │  ────────────────────────────────────────────────────────    │
   │  Pipeline per ogni job:                                      │
   │   1. Fact Extractor   (gemma3 JSON-mode, ~7s)                │
   │      → entities, numbers, polarity, key_claim,               │
   │        forbidden_claims                                       │
   │   2. Hook Generator   (gemma3 constrained, ~10s)             │
   │      → 3 varianti con framework diverso                      │
   │   3. Validator 4-stage:                                       │
   │      3a. Entity check  (regex + safe-list, ~5ms)             │
   │      3b. Number check  (regex, ~5ms)                          │
   │      3c. Polarity check (forbidden verbs vs negative ents,   │
   │           ~10ms) ← critico anti-"Caturano segna/non-segna"  │
   │      3d. NLI semantic  (llama3.1, ~3s)                       │
   │      3e. Embed similarity (nomic, ~150ms)                    │
   │   4. Approve / retry / flag                                   │
   └─────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
        ┌────────────────────────────────────────────────────┐
        │ Hashtag Picker  (deterministico, no LLM, ~5ms)     │
        │ tier-based: brand · core · niche · geo · event     │
        │ cap: IG 5 (limite IG dec 2025), FB 0-1             │
        └────────────────────────────────────────────────────┘
                                  │
                                  ▼
        ┌────────────────────────────────────────────────────┐
        │ social_variants UPDATE: caption + hashtags +       │
        │ caption_metadata + caption_facts                    │
        └────────────────────────────────────────────────────┘
                                  │
                                  ▼
        ┌────────────────────────────────────────────────────┐
        │ Composer UI → Andrea review/edit → Publish (Meta)  │
        └────────────────────────────────────────────────────┘
                                  │
                                  ▼
        ┌────────────────────────────────────────────────────┐
        │ social_post_insights raccoglie reach/saves/comments│
        └────────────────────────────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │  Mac cron weekly sabato 04:00 `caption-tuner.ts`            │
   │  ────────────────────────────────────────────────────────    │
   │  - Aggrega engagement_rate per (archetype × framework ×     │
   │    platform) su 28gg                                        │
   │  - Promuove winning_patterns (sample ≥ 8, conf ≥ 0.6)       │
   │  - Aggiorna hashtag scoring                                  │
   │  - Ruota AB dimension settimanale                           │
   │  - Report Telegram @LVK_Atlas_Bot top5/bottom5              │
   └─────────────────────────────────────────────────────────────┘
```

## File correlati nel repo

| Path | Cosa |
|---|---|
| `social-caption-research.md` (root) | Ricerca pattern competitor (Gazzetta/DAZN/B/R) — VOICE foundations |
| `social-brand-book.md` (root) | Brand voice rules, vocabolario, do/don't |
| `docs/social-engine/00-overview.md` | (questo file) — sintesi engine |
| `docs/social-engine/01-hook-playbook.md` | 7 hook framework + decision tree + 50 hook cold-start |
| `docs/social-engine/02-anti-hallucination-pipeline.md` | Pipeline 4-step technical spec |
| `docs/social-engine/03-hashtag-strategy.md` | Hashtag tier, pool, cap per platform |
| `docs/social-engine/04-poc-results.md` | Risultati POC v1+v2 con metriche reali |
| `docs/social-engine/05-feedback-loop.md` | Performance loop weekly, winning_patterns |
| `src/lib/social/caption/ollamaClient.ts` | Client HTTP Ollama (gen/embed/JSON-mode) |
| `src/lib/social/caption/factExtractor.ts` | Step 1 |
| `src/lib/social/caption/hookGenerator.ts` | Step 2 |
| `src/lib/social/caption/validators.ts` | Step 3 (4 sub-stage) |
| `src/lib/social/caption/engine.ts` | Orchestratore pipeline completo |
| `src/lib/social/hashtag/picker.ts` | Hashtag picker tier-based |
| `scripts/daemons/caption-engine.ts` | Mac daemon |
| `scripts/daemons/caption-tuner.ts` | Cron weekly (P1 / Tier 2) |

## Benchmark (M4 Pro, verificati POC + smoke test live)

**Config produzione**: `OLLAMA_KEEP_ALIVE=0` (modelli scaricati subito dopo ogni job).
**Filosofia**: caption sono on-demand (click "Genera" dal Composer), non daemon continuo. RAM Ollama idle = 0 GB.

| Stato | RAM Ollama | Latency per draft |
|---|---|---|
| Idle (nessuno usa Composer) | **0 GB** | n/a |
| Job processing (cold start, primo dopo idle) | 9 GB temp | **~47s** |
| Job processing (warm, consecutivo entro keep_alive) | 9 GB temp | ~30s |
| Subito dopo job | **0 GB** | n/a |

Breakdown latency:
| Step | Cold | Warm |
|---|---|---|
| gemma3 load | ~5s | 0s |
| Fact extraction | ~7s | ~7s |
| llama3.1 load | ~2s | 0s |
| Hook gen 3 varianti | ~10s | ~10s |
| Validator 3 hook (NLI + embed) | ~10s | ~10s |
| **Totale** | **~47s** | **~30s** |

**RAM totale Mac durante job**: gemma3:12b (9GB) + llama3.1:8b (4.9GB) + nomic (300MB) + altri daemon Mac (sync, notification, asset-builder, ~3-5GB) + macOS ~5GB = ~22GB peak. Restano ~2GB liberi → no swap heavy.

**RAM totale Mac idle**: ~14GB (solo daemon Node leggeri + macOS), Ollama 0.

## Metriche di successo POC (mantenute in P0)

- **Pass rate ≥ 75%** (v2 = 76%)
- **Zero polarity violations** (60/60 hook su POC v1+v2)
- **Zero number/length/bait fail** (60/60)
- **100% pill coverage** (≥1 hook valido per pill)
- **Pubblicabilità ≥ 90%** (giudizio umano post-validator)
