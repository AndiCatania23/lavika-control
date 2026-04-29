# Social Asset Builder daemon — install on macOS

Daemon Mac che consuma la queue Supabase `social_asset_jobs` e genera
gli asset image/video per i pacchetti social via Sharp / Remotion / FFmpeg.

## Requisiti
- macOS con Apple Silicon
- Node 20+ via Homebrew (`/opt/homebrew/bin/node`)
- `~/LAVIKA-SPORT/repos/control/.env.local` configurato con:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`

## Install (one-shot)

```bash
# 1. Copia wrapper bash in ~/LAVIKA-SPORT/scripts/
cp scripts/daemons/install/social-asset-builder.sh \
   ~/LAVIKA-SPORT/scripts/social-asset-builder.sh
chmod +x ~/LAVIKA-SPORT/scripts/social-asset-builder.sh

# 2. Copia plist in ~/Library/LaunchAgents/
cp scripts/daemons/install/com.lavika.social-asset-builder.plist \
   ~/Library/LaunchAgents/com.lavika.social-asset-builder.plist

# 3. Crea cartella logs (se non esiste)
mkdir -p ~/LAVIKA-SPORT/logs

# 4. Carica + avvia
launchctl load -w ~/Library/LaunchAgents/com.lavika.social-asset-builder.plist
```

## Verifica

```bash
# Lista daemon caricati
launchctl list | grep social-asset-builder

# Output atteso: <PID> 0 com.lavika.social-asset-builder
# Se PID = "-" → non è running, controlla log

# Logs
tail -f ~/LAVIKA-SPORT/logs/social-asset-builder.log
tail -f ~/LAVIKA-SPORT/logs/social-asset-builder-error.log
```

## Stop / restart

```bash
launchctl unload  ~/Library/LaunchAgents/com.lavika.social-asset-builder.plist
launchctl load -w ~/Library/LaunchAgents/com.lavika.social-asset-builder.plist
```

## Behavior
- `RunAtLoad=true` + `KeepAlive=true` → autostart al login + restart se crash
- `ThrottleInterval=10s` → no busy-loop in caso di crash ripetuti
- Polling fallback ogni 2s + Supabase realtime su INSERT
- Claim atomico via RPC `claim_social_asset_jobs` (max 3 attempts/job)
- Reclaim job stale > 5 min
