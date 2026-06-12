#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-fe-vps.sh — idempotent FE deploy for ~/Nuro-Finance on VPS (main branch)
#
# WHY THIS EXISTS
#   Session 30, 2026-04-24: discovered the FE deploy path had been silently
#   broken for ~85 commits. The historical sequence `git pull && pm2 restart 1`
#   was wrong on two counts:
#     1. The wrong repo was being pulled (~/Nuro-Finance instead of
#        ~/Nuro-Finance). PM2 id 1 serves from the FE repo;
#        id 4 serves the BE.
#     2. Next.js production (`next start`) serves pre-built assets from
#        .next/. `pm2 restart` alone restarts the Node process but does
#        NOT rebuild. Every git pull since ~S27 had been restarting a
#        server serving weeks-old compiled JS.
#     3. `pnpm run build` is not defined in package.json; the correct
#        invocation is `npx next build` directly.
#     4. `pm2 restart` without --update-env keeps the env vars frozen
#        from process-start. Changing .env.local does NOT propagate
#        unless you pass --update-env or restart the whole pm2 daemon.
#
#   This script encodes the correct sequence so nobody rediscovers these
#   facts the hard way.
#
# USAGE
#   Run on the VPS (not locally):
#     ssh nuro@74.50.109.203 "bash -s" < scripts/deploy-fe-vps.sh
#
#   Or copied to VPS home:
#     ssh nuro@74.50.109.203 "bash ~/deploy-fe.sh"
#
# EXIT CODES
#   0 — success (deploy complete or no-op)
#   1 — pre-flight check failed (wrong host, missing dir, etc.)
#   2 — git pull failed (conflicts, network, auth)
#   3 — pnpm install failed (registry, lockfile, disk)
#   4 — next build failed (TS error, runtime issue)
#   5 — pm2 restart failed
#   6 — post-deploy verification failed
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────────────
FE_REPO="${FE_REPO:-$HOME/Nuro-Finance}"
GIT_BRANCH="${GIT_BRANCH:-main}"
PM2_ID="${PM2_ID:-1}"
PM2_NAME="${PM2_NAME:-nuro-frontend}"
BUILD_TIMEOUT="${BUILD_TIMEOUT:-240}"  # seconds
SKIP_INSTALL="${SKIP_INSTALL:-auto}"   # auto | yes | no
SKIP_BUILD="${SKIP_BUILD:-no}"         # yes to only pull + restart (emergency)

# ── Colors ───────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; CYAN=$'\033[36m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
else
  RED=""; GREEN=""; YELLOW=""; CYAN=""; BOLD=""; RESET=""
fi
step() { echo "${BOLD}${CYAN}▸ $*${RESET}"; }
ok()   { echo "${GREEN}  ✓ $*${RESET}"; }
warn() { echo "${YELLOW}  ⚠ $*${RESET}"; }
die()  { echo "${RED}  ✗ $*${RESET}" >&2; exit "${2:-1}"; }

# ── Pre-flight ───────────────────────────────────────────────────────────────
step "Pre-flight checks"
[ -d "$FE_REPO" ] || die "FE repo not found at $FE_REPO (override with FE_REPO env)" 1
[ -d "$FE_REPO/.git" ] || die "$FE_REPO is not a git repository" 1
[ -f "$FE_REPO/package.json" ] || die "$FE_REPO missing package.json" 1
command -v pnpm  >/dev/null || die "pnpm not installed" 1
command -v npx   >/dev/null || die "npx not installed" 1
command -v pm2   >/dev/null || die "pm2 not installed" 1
ok "tools + repo OK"

cd "$FE_REPO"

# ── Git pull ─────────────────────────────────────────────────────────────────
step "Git pull (fast-forward only, branch: $GIT_BRANCH)"
OLD_HEAD=$(git rev-parse HEAD)
git fetch origin "$GIT_BRANCH"
git checkout "$GIT_BRANCH"
if ! git pull --ff-only origin "$GIT_BRANCH" 2>&1 | tail -6; then
  die "git pull failed — resolve conflicts or network/auth issues" 2
fi
NEW_HEAD=$(git rev-parse HEAD)
if [ "$OLD_HEAD" = "$NEW_HEAD" ]; then
  ok "already at HEAD ($NEW_HEAD)"
  NO_CODE_CHANGES=1
else
  ok "advanced $OLD_HEAD → $NEW_HEAD"
  NO_CODE_CHANGES=0
fi

# ── Detect whether pnpm install is needed ────────────────────────────────────
INSTALL=0
if [ "$SKIP_INSTALL" = "yes" ]; then
  INSTALL=0
  warn "SKIP_INSTALL=yes — skipping pnpm install"
elif [ "$SKIP_INSTALL" = "no" ]; then
  INSTALL=1
elif [ "$NO_CODE_CHANGES" = "1" ]; then
  INSTALL=0
else
  # auto — install only if package.json or lockfile changed in this pull
  if git diff --name-only "$OLD_HEAD" "$NEW_HEAD" | grep -qE '^(package\.json|pnpm-lock\.yaml|package-lock\.json)$'; then
    INSTALL=1
  fi
fi

if [ "$INSTALL" = "1" ]; then
  step "pnpm install (package.json or lockfile changed)"
  pnpm install 2>&1 | tail -6 || die "pnpm install failed" 3
  ok "deps installed"
else
  step "pnpm install — skipped (deps unchanged)"
fi

# ── Next build ───────────────────────────────────────────────────────────────
if [ "$SKIP_BUILD" = "yes" ]; then
  warn "SKIP_BUILD=yes — skipping next build (pm2 will restart stale .next)"
else
  step "Running npx next build (~1-2 min)"
  # `timeout` guards against hanging builds (e.g. infinite loop in getStaticProps).
  if ! timeout "$BUILD_TIMEOUT" npx next build 2>&1 | tail -8; then
    die "next build failed or timed out after ${BUILD_TIMEOUT}s" 4
  fi
  ok "build complete"
fi

# ── PM2 restart with --update-env ────────────────────────────────────────────
step "pm2 restart $PM2_ID --update-env"
if ! pm2 restart "$PM2_ID" --update-env 2>&1 | tail -4; then
  die "pm2 restart failed" 5
fi
ok "process restarted"

# ── Post-deploy verification ─────────────────────────────────────────────────
step "Post-deploy verification"
sleep 3
PM2_STATUS=$(pm2 jlist 2>/dev/null | node -e "
  let d=''; process.stdin.on('data', c=>d+=c); process.stdin.on('end', () => {
    try {
      const list = JSON.parse(d);
      const p = list.find(x => x.pm_id == $PM2_ID || x.name === '$PM2_NAME');
      if (!p) { console.log('missing'); process.exit(0); }
      console.log(p.pm2_env.status + ' ' + p.pm2_env.restart_time);
    } catch(e) { console.log('parse_error'); }
  });
" 2>/dev/null || echo "unknown")
case "$PM2_STATUS" in
  online\ *)
    RESTART_COUNT=$(echo "$PM2_STATUS" | awk '{print $2}')
    ok "nuro-frontend online (restart count: $RESTART_COUNT)"
    ;;
  errored*|stopped*|missing)
    die "pm2 process state = $PM2_STATUS — check 'pm2 logs $PM2_ID'" 6
    ;;
  *)
    warn "could not parse pm2 state ($PM2_STATUS) — manual check recommended"
    ;;
esac

if [ -f "$FE_REPO/.next/BUILD_ID" ]; then
  BUILD_ID=$(cat "$FE_REPO/.next/BUILD_ID")
  BUILD_MTIME=$(stat -c %y "$FE_REPO/.next/BUILD_ID" 2>/dev/null | cut -d'.' -f1 || echo "unknown")
  ok "BUILD_ID=$BUILD_ID (built $BUILD_MTIME)"
else
  warn ".next/BUILD_ID not found — build may be corrupt"
fi

echo ""
echo "${BOLD}${GREEN}✓ FE deploy complete${RESET}"
echo "  HEAD:      $NEW_HEAD"
echo "  PM2 id:    $PM2_ID ($PM2_NAME)"
echo "  Next step: test https://app.nuro.finance in incognito"
