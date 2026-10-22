#!/usr/bin/env bash
# ORBIT e2e regression: production build + local PGlite (never Neon) + headless Chrome 390x844.
# Usage: e2e/run.sh [--no-build]
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR=/workspace/backup
BAK="$BACKUP_DIR/orbit-env-local.e2e-run.bak"
RUN_DIR="${ORBIT_E2E_RUN_DIR:-/workspace/e2e-run}"
SCREENS="${ORBIT_E2E_SCREENS:-/workspace/screens}"
PORT="${ORBIT_E2E_PORT:-3917}"
mkdir -p "$BACKUP_DIR" "$SCREENS"
MOVED=0
SERVER_PID=""
restore() {
  local code=$?
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  pkill -f "$ROOT/.output/server/index.mjs orbit-e2e-server" 2>/dev/null
  if [ "$MOVED" = 1 ] && [ -f "$BAK" ]; then
    if [ -e "$ROOT/.env.local" ]; then echo "WARN: .env.local reappeared; keeping it, backup stays at $BAK"; else mv "$BAK" "$ROOT/.env.local" && echo "restored .env.local"; fi
  fi
  exit $code
}
trap restore EXIT
trap 'exit 130' INT TERM HUP
if [ -f "$ROOT/.env.local" ]; then
  cp -p "$ROOT/.env.local" "$BAK" && rm "$ROOT/.env.local" && MOVED=1 && echo "moved .env.local aside -> $BAK"
fi
# Як на проді (wrangler vars): скрипт платформи вимкнено, CSP його не пускає.
export VITE_GROK_EXTENSIONS=0
unset DATABASE_URL STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET ORBIT_DEV_MAIL_CODE NETLIFY_AUTH_TOKEN
cd "$ROOT"
if [ "${1:-}" != "--no-build" ]; then
  echo "building…"
  HOST_NODE=1 node scripts/with-app-env.mjs npx vite build > "$RUN_DIR.build.log" 2>&1 || { echo "BUILD FAILED (see $RUN_DIR.build.log)"; exit 2; }
fi
# Nitro bundles PGlite JS but not its wasm/data assets — copy them next to the bundled lib.
cp node_modules/@electric-sql/pglite/dist/{pglite.data,pglite.wasm,initdb.wasm} .output/server/_libs/ || { echo "pglite assets missing"; exit 2; }
export ORBIT_E2E_ROOT="$ROOT" ORBIT_E2E_RUN_DIR="$RUN_DIR" ORBIT_E2E_SCREENS="$SCREENS" ORBIT_E2E_PORT="$PORT"
node --import "$ROOT/scripts/ts-register.mjs" "$ROOT/e2e/suite.mjs"
