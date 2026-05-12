# Installazione daemon caption-engine

Pre-requisiti:
- Ollama installato + modelli `gemma3:12b`, `llama3.1:8b`, `nomic-embed-text` (verifica con `ollama list`)
- File `~/LAVIKA-SPORT/repos/control/.env.local` con `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
- Logs dir: `mkdir -p ~/LAVIKA-SPORT/logs`

## Installazione

```bash
# 1. Permessi wrapper
chmod +x ~/LAVIKA-SPORT/scripts/caption-engine.sh

# 2. Copia plist in LaunchAgents
cp ~/LAVIKA-SPORT/repos/control/scripts/daemons/install/com.lavika.caption-engine.plist.template \
   ~/Library/LaunchAgents/com.lavika.caption-engine.plist

# 3. Load
launchctl load ~/Library/LaunchAgents/com.lavika.caption-engine.plist

# 4. Verifica
launchctl list | grep caption-engine
tail -f ~/LAVIKA-SPORT/logs/caption-engine.log
```

## Smoke test manuale (senza launchd)

```bash
cd ~/LAVIKA-SPORT/repos/control
source .env.local
export SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL"
./node_modules/.bin/tsx scripts/daemons/caption-engine.ts
```

## Trigger un job di test

Inserisci manualmente un caption_job che punta a una pill esistente:

```sql
-- 1. Crea una variant draft per una pill nota
INSERT INTO social_variants(draft_id, platform, format, status)
  VALUES (gen_random_uuid(), 'instagram', 'ig_feed_4_5', 'queued')
  RETURNING id;

-- 2. Crea il caption_job
INSERT INTO caption_jobs(variant_id, source_type, source_id, platform, format)
  VALUES ('<variant_id_above>', 'pill', '<pill_id>', 'instagram', 'ig_feed_4_5');
```

Il daemon dovrebbe processare in ~33s, poi:
- `social_variants.caption` = best hook + hashtag
- `caption_facts` = facts estratti
- `caption_metadata` = framework + char_count + valid_count
- `caption_validation_log` = 8 righe per ogni hook (3 hooks × 8 stage = 24 righe tipicamente)
- `caption_jobs.status` = `completed`

## Stop

```bash
launchctl unload ~/Library/LaunchAgents/com.lavika.caption-engine.plist
```

## Troubleshooting

- **"connection refused localhost:11434"** → Ollama non running. `ollama serve` o avvia Ollama.app.
- **"model not found"** → `ollama pull gemma3:12b` (o llama3.1:8b o nomic-embed-text).
- **`claim_caption_jobs` RPC error 42883** → migrazione DB non applicata. Vedi `docs/social-engine/02-anti-hallucination-pipeline.md`.
- **Memory pressure** → controlla `vm_stat` durante run. Con gemma3:12b + llama3.1:8b caldi servono ~16GB liberi. Su 24GB Mac Mini è OK ma chiudi browser pesanti.
