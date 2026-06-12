#!/bin/bash
# scripts/deploy-fe.sh — frontend deploy on the VPS (monorepo, main branch).
#
# Run on the VPS after pushing FE changes to main.
# Auto-detects whether a Next.js rebuild is needed:
#   - Source changes (src/, next.config.js, package.json)  → pnpm build (~90s)
#   - Static-only changes (public/*)                       → skip rebuild
# Then restarts nuro-frontend so PM2 picks up new file timestamps.
#
# Usage:
#   ssh nuro@74.50.109.203 "bash ~/Nuro-Finance/scripts/deploy-fe.sh"
#
# Or if already SSH'd in:
#   bash ~/Nuro-Finance/scripts/deploy-fe.sh

set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/Nuro-Finance}"
GIT_BRANCH="${GIT_BRANCH:-main}"

if [ ! -d "$APP_DIR" ]; then
    echo "✗ App directory not found at $APP_DIR" >&2
    echo "  Set APP_DIR env var if it lives elsewhere." >&2
    exit 1
fi

cd "$APP_DIR"

echo "→ Pulling latest from origin/$GIT_BRANCH in $APP_DIR..."
git fetch origin "$GIT_BRANCH"
git checkout "$GIT_BRANCH"
git pull --ff-only origin "$GIT_BRANCH"

echo "→ Checking what changed..."
CHANGED_FILES=$(git diff "HEAD@{1}" HEAD --name-only 2>/dev/null || true)

if [ -z "$CHANGED_FILES" ]; then
    echo "  No file changes detected (already up to date or first deploy)."
    NEEDS_BUILD=0
elif echo "$CHANGED_FILES" | grep -qE "^(src/|next\.config\.js|package\.json|tsconfig\.json|\.env)"; then
    echo "  Source-level changes detected — full rebuild required."
    echo "$CHANGED_FILES" | grep -E "^(src/|next\.config\.js|package\.json|tsconfig\.json|\.env)" | head -10 | sed 's/^/    /'
    NEEDS_BUILD=1
else
    echo "  Static-only changes (public/* / docs/* / scripts/*) — skipping rebuild."
    echo "$CHANGED_FILES" | head -10 | sed 's/^/    /'
    NEEDS_BUILD=0
fi

if [ "$NEEDS_BUILD" -eq 1 ]; then
    echo "→ Running pnpm build (this takes ~90s)..."
    pnpm build
fi

echo "→ Restarting nuro-frontend via PM2..."
pm2 restart nuro-frontend --update-env

echo ""
echo "✓ Deploy complete. Smoke-testing public surfaces..."
sleep 3

for path in /skills /agents /contracts; do
    code=$(curl -sI "https://app.nuro.finance$path" | head -1 | awk '{print $2}' || echo "ERR")
    if [ "$code" = "200" ]; then
        printf "  \033[0;32m✓\033[0m %-12s %s\n" "$path" "$code"
    else
        printf "  \033[0;31m✗\033[0m %-12s %s (expected 200)\n" "$path" "$code"
    fi
done

echo ""
echo "Done. Hard-reload your browser (Ctrl+Shift+R) to see changes."
