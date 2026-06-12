#!/bin/bash
# deploy-staging.sh — pulls latest `staging` branch on VPS, rebuilds, restarts PM2 staging.
#
# Usage (on VPS):
#   bash /home/nuro/Nuro-Finance/scripts/deploy-staging.sh
#
# Layer 3 (S36 — 2026-05-24). Companion to:
#   - ecosystem.config.js (nuro-frontend-staging entry on port 2801)
#   - promote-staging-to-prod.sh (ff-merge staging → main + prod deploy)
#   - docs/STAGING_WORKFLOW.md (the full runbook)
#
# Safety:
#   - Surgically preserves .env.local (production secrets) — never blown away.
#   - Uses --frozen-lockfile by default; fall back to --no-frozen-lockfile only if needed.
#   - Atomic restart: pm2 restart happens IMMEDIATELY after build to avoid grey-screen
#     (per Chris Drop Integration Pattern Rule 9 — never leave next start running on
#     empty/stale .next).

set -euo pipefail

STAGING_DIR="/home/nuro/Nuro-Finance"
LOG_FILE="/tmp/deploy-staging-$(date +%Y%m%d-%H%M%S).log"

echo "[deploy-staging] starting → log: $LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

cd "$STAGING_DIR"
echo "[deploy-staging] cwd: $STAGING_DIR"
echo "[deploy-staging] HEAD before: $(git log --oneline -1)"

# Stash tracked-file drift before pulling. .env.local is gitignored and
# survives `git reset --hard` natively — we do NOT touch it here.
#
# 2026-05-25 BUG FIXED: the previous version of this script had a
# "restore .env.local from stash" step that ran on EVERY deploy whenever
# any old "auto-stash before staging deploy" entry existed in the stash
# list. Since the stash check matched ANY historical stash (not just
# this run's), the script kept restoring .env.local from a stale stash
# from weeks ago — silently wiping any new env vars added between
# deploys. That ate Richard's NEXT_PUBLIC_PRIVY_APP_ID for 3 days.
#
# Fix: don't touch .env.local. It's untracked, gitignored, and
# `git reset --hard` doesn't move it. The "restore" was paranoia that
# turned into the actual bug.
if [ -n "$(git status --short)" ]; then
  STASH_MSG="auto-stash before staging deploy $(date +%Y%m%d-%H%M%S)"
  echo "[deploy-staging] stashing tracked-file drift: $STASH_MSG"
  git stash push -m "$STASH_MSG"
fi

echo "[deploy-staging] fetching nuro/staging"
git fetch origin staging
git checkout staging
git reset --hard origin/staging
echo "[deploy-staging] HEAD after: $(git log --oneline -1)"

echo "[deploy-staging] pnpm install"
if ! pnpm install --frozen-lockfile; then
  echo "[deploy-staging] frozen failed, falling back to non-frozen (lockfile drift)"
  pnpm install --no-frozen-lockfile
fi

echo "[deploy-staging] pnpm build"
rm -rf .next
pnpm build

echo "[deploy-staging] pm2 restart nuro-frontend-staging"
pm2 restart nuro-frontend-staging --update-env

sleep 3
echo "[deploy-staging] status:"
pm2 list --no-color | grep -E '(nuro-frontend-staging|name)' || true

echo "[deploy-staging] smoke test:"
curl -sk --max-time 10 -o /dev/null -w "  /en/dashboard → %{http_code}\n" http://127.0.0.1:2801/en/dashboard
curl -sk --max-time 10 -o /dev/null -w "  /api/users/me → %{http_code} (401 expected)\n" http://127.0.0.1:2801/api/users/me

echo "[deploy-staging] ✓ done. log: $LOG_FILE"
