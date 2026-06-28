#!/usr/bin/env bash
set -euo pipefail

# Runtime config (can be overridden at execution time)
APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
PORT="${PORT:-3008}"
HOSTNAME="${HOSTNAME:-0.0.0.0}"
MEMORY_MB="${MEMORY_MB:-2048}"
RUN_BUILD="${RUN_BUILD:-1}"

cd "$APP_DIR"

echo "[start-app] APP_DIR=$APP_DIR"
echo "[start-app] PORT=$PORT"
echo "[start-app] HOSTNAME=$HOSTNAME"
echo "[start-app] MEMORY_MB=$MEMORY_MB"
echo "[start-app] RUN_BUILD=$RUN_BUILD"

npm ci

if [ "$RUN_BUILD" = "1" ]; then
  NODE_OPTIONS="--max-old-space-size=${MEMORY_MB}" npm run build
fi

exec env \
  PORT="$PORT" \
  HOSTNAME="$HOSTNAME" \
  NODE_OPTIONS="--max-old-space-size=${MEMORY_MB}" \
  npm start
