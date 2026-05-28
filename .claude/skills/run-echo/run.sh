#!/usr/bin/env bash
# One-shot harness: export Echo as a web bundle, serve it with SPA fallback,
# drive it with Playwright. On success leaves the server up so an agent can
# attach `chromium-cli` or curl it for ad-hoc poking.
#
#   bash .claude/skills/run-echo/run.sh [--no-smoke]
#
# Run from the project root. Screenshots land in ./screenshots/.

set -euo pipefail

cd "$(dirname "$0")/../../.."   # project root

PORT=${ECHO_PORT:-8080}
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SMOKE=1
for a in "$@"; do
  case "$a" in
    --no-smoke) SMOKE=0 ;;
  esac
done

# Free the port (an old server from a previous run is the most common
# cause of EADDRINUSE here).
if ss -ltn 2>/dev/null | grep -q ":${PORT}\b"; then
  echo "→ port ${PORT} busy, freeing"
  fuser -k -TERM "${PORT}/tcp" 2>/dev/null || true
  sleep 1
fi

if [ ! -d node_modules ]; then
  echo "→ npm install"
  npm install --no-audit --no-fund --loglevel=error
fi

echo "→ expo export --platform web"
rm -rf dist
CI=1 npx expo export --platform web --output-dir dist >/tmp/echo-export.log 2>&1 || {
  tail -40 /tmp/echo-export.log
  exit 1
}

echo "→ serve dist on :${PORT}"
node "$SKILL_DIR/serve-spa.mjs" --dir dist --port "$PORT" > /tmp/echo-serve.log 2>&1 &
SERVE_PID=$!
echo "$SERVE_PID" > /tmp/echo-serve.pid

# Wait for server up.
for _ in $(seq 1 30); do
  if curl -sf -o /dev/null "http://localhost:${PORT}/"; then break; fi
  sleep 0.1
done

echo "→ server: http://localhost:${PORT}"

if [ "$SMOKE" = "1" ]; then
  echo "→ smoke"
  ECHO_URL="http://localhost:${PORT}" \
  PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}" \
    node "$SKILL_DIR/smoke.mjs"
fi

echo "→ done. Server still running (PID $SERVE_PID, port ${PORT})."
echo "  Stop with: kill \$(cat /tmp/echo-serve.pid)"
