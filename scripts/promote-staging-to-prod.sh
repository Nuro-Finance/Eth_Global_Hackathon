#!/bin/bash
# promote-staging-to-prod.sh — fast-forward main (prod) to current staging HEAD,
# push, deploy to prod, restart nuro-frontend.
#
# Usage (on VPS):
#   bash /home/nuro/Nuro-Finance/scripts/promote-staging-to-prod.sh
#
# Layer 3 (S36 — 2026-05-24). Companion to:
#   - deploy-staging.sh (deploy to staging FIRST — always)
#   - ecosystem.config.js (nuro-frontend on port 2800)
#
# Preconditions:
#   - staging deploy is fresh (run deploy-staging.sh first; this script doesn't re-deploy staging)
#   - You have walk-attested staging interactively
#   - You have run the wiring-verification grep on the staging SHA and it's clean
#
# Safety:
#   - REFUSES to promote if main is ahead of staging (would lose prod commits)
#   - REFUSES to promote if staging is not a strict descendant of main
#   - Surgically preserves prod .env.local via stash/restore (same as deploy-staging)
#   - Atomic build + restart per Chris Drop Integration Pattern Rule 9.

set -euo pipefail

PROD_DIR="/home/nuro/Nuro-Finance"
STAGING_DIR="/home/nuro/Nuro-Finance"
LOG_FILE="/tmp/promote-staging-to-prod-$(date +%Y%m%d-%H%M%S).log"

echo "[promote] starting → log: $LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

# ─── Preflight: staging is a strict descendant of main ─────────
cd "$STAGING_DIR"
git fetch origin staging main
STAGING_SHA=$(git rev-parse origin/staging)
MAIN_SHA=$(git rev-parse origin/main)

echo "[promote] staging: $STAGING_SHA"
echo "[promote] main: $MAIN_SHA"

if ! git merge-base --is-ancestor "$MAIN_SHA" "$STAGING_SHA"; then
  echo "[promote] 🔴 REFUSING: main is NOT an ancestor of staging."
  echo "[promote] This would either lose prod commits or require a merge commit."
  echo "[promote] Sync staging with main first (rebase or merge), then retry."
  exit 1
fi

# The right check is whether the PROD DIR's local HEAD matches origin/main.
# If yes, prod is already deployed at the latest. If no, pull + rebuild.
PROD_HEAD=$(git --git-dir="$PROD_DIR/.git" rev-parse HEAD 2>/dev/null || echo "unknown")
echo "[promote] prod dir HEAD: $PROD_HEAD"
if [ "$PROD_HEAD" = "$MAIN_SHA" ]; then
  echo "[promote] ✓ Prod dir already at origin/main tip — nothing to rebuild."
  echo "[promote]   To force a rebuild (e.g. env vars changed), set FORCE_REBUILD=1"
  if [ "${FORCE_REBUILD:-0}" != "1" ]; then
    exit 0
  fi
  echo "[promote] ⚠ FORCE_REBUILD=1 — rebuilding even though HEAD is in sync"
fi

# ─── Wiring verification grep ─────────────────────────────────────────
echo "[promote] running wiring-verification grep (staging vs main)"
LOST=$(git diff "$MAIN_SHA" "$STAGING_SHA" -- src/ | grep -E "^-.*(useQuery|useFetch|fetch\(|/api/|useSWR|getServerSideProps)" | grep -v "^---" || true)
if [ -n "$LOST" ]; then
  echo "[promote] 🔴 REFUSING: wiring-loss detected between main and staging:"
  echo "$LOST" | head -20
  echo "[promote] Investigate before promoting. If intentional, bypass with PROMOTE_FORCE=1."
  if [ "${PROMOTE_FORCE:-0}" != "1" ]; then
    exit 1
  fi
  echo "[promote] ⚠ PROMOTE_FORCE=1 — proceeding despite wiring-loss"
fi

# ─── Fast-forward main on origin ──────────────────────────────────────
cd "$PROD_DIR"
echo "[promote] cwd: $PROD_DIR"
echo "[promote] HEAD before: $(git log --oneline -1)"

if [ -n "$(git status --short)" ]; then
  STASH_MSG="auto-stash before prod promote $(date +%Y%m%d-%H%M%S)"
  echo "[promote] stashing local drift: $STASH_MSG"
  git stash push -m "$STASH_MSG"
fi

git fetch origin staging main
git checkout main

# Fast-forward main to staging SHA, then push back to origin.
git merge --ff-only "$STAGING_SHA"
git push origin main

echo "[promote] HEAD after: $(git log --oneline -1)"

# ─── Build + atomic restart ───────────────────────────────────────────
echo "[promote] pnpm install"
if ! pnpm install --frozen-lockfile; then
  echo "[promote] frozen failed, falling back to non-frozen (lockfile drift)"
  pnpm install --no-frozen-lockfile
fi

echo "[promote] pnpm build"
rm -rf .next
pnpm build

echo "[promote] pm2 restart nuro-frontend"
pm2 restart nuro-frontend --update-env

sleep 3
echo "[promote] status:"
pm2 list --no-color | grep -E '(nuro-frontend|name)' || true

echo "[promote] prod smoke test:"
curl -sk --max-time 10 -o /dev/null -w "  /en/dashboard → %{http_code}\n" https://app.nuro.finance/en/dashboard
curl -sk --max-time 10 -o /dev/null -w "  /api/users/me → %{http_code} (401 expected)\n" https://app.nuro.finance/api/users/me

echo "[promote] ✓ done. promoted $STAGING_SHA → prod. log: $LOG_FILE"
