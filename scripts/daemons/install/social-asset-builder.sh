#!/bin/bash
# Wrapper for launchd: sources Control .env.local then exec node daemon.
# launchd KeepAlive=true relaunches if node exits.
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

ENV_FILE="$HOME/LAVIKA-SPORT/repos/control/.env.local"
WORKER_TS="$HOME/LAVIKA-SPORT/repos/control/scripts/daemons/social-asset-builder.ts"

if [ ! -f "$ENV_FILE" ]; then
  echo "FATAL: $ENV_FILE not found" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# Bridge NEXT_PUBLIC_SUPABASE_URL → SUPABASE_URL (server-side daemon expects no NEXT_ prefix)
export SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-${SUPABASE_URL:-}}"

# Daemon-specific overrides (default optional)
export WORKER_ID="${WORKER_ID:-mac-social-asset-builder}"
export POLL_INTERVAL_MS="${POLL_INTERVAL_MS:-2000}"
export CLAIM_BATCH_SIZE="${CLAIM_BATCH_SIZE:-3}"
export MAX_ATTEMPTS="${MAX_ATTEMPTS:-3}"

cd "$HOME/LAVIKA-SPORT/repos/control"
exec /opt/homebrew/bin/node ./node_modules/.bin/tsx "$WORKER_TS"
