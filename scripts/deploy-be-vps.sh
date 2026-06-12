#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-be-vps.sh — idempotent backend deploy for ~/Nuro-Finance on VPS
#
# BE is simpler than FE because tsx interprets TypeScript on-the-fly, so
# there's no build step. But `pm2 restart` without --update-env still
# freezes env vars — so if you changed .env you MUST include --update-env.
#
# Sibling to scripts/deploy-fe-vps.sh. See that script's header for the
# full story of why we now have dedicated deploy scripts.
#
# USAGE
#   ssh nuro@74.50.109.203 "bash -s" < scripts/deploy-be-vps.sh
#
# EXIT CODES
#   0 success · 1 pre-flight · 2 pull · 3 install · 5 restart · 6 verify
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

BE_REPO="${BE_REPO:-$HOME/Nuro-Finance}"
GIT_BRANCH="${GIT_BRANCH:-main}"
PM2_ID="${PM2_ID:-4}"
PM2_NAME="${PM2_NAME:-nuro-api}"
SKIP_INSTALL="${SKIP_INSTALL:-auto}"

if [ -t 1 ]; then
  RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; CYAN=$'\033[36m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
else
  RED=""; GREEN=""; YELLOW=""; CYAN=""; BOLD=""; RESET=""
fi
step() { echo "${BOLD}${CYAN}▸ $*${RESET}"; }
ok()   { echo "${GREEN}  ✓ $*${RESET}"; }
warn() { echo "${YELLOW}  ⚠ $*${RESET}"; }
die()  { echo "${RED}  ✗ $*${RESET}" >&2; exit "${2:-1}"; }

step "Pre-flight"
[ -d "$BE_REPO/.git" ] || die "$BE_REPO is not a git repo (override with BE_REPO env)" 1
command -v npm >/dev/null || die "npm not installed" 1
command -v pm2 >/dev/null || die "pm2 not installed" 1
ok "OK"

cd "$BE_REPO"

step "Git pull (ff-only, branch: $GIT_BRANCH)"
OLD_HEAD=$(git rev-parse HEAD)
git fetch origin "$GIT_BRANCH"
git checkout "$GIT_BRANCH"
git pull --ff-only origin "$GIT_BRANCH" 2>&1 | tail -4 || die "git pull failed" 2
NEW_HEAD=$(git rev-parse HEAD)
if [ "$OLD_HEAD" = "$NEW_HEAD" ]; then
  ok "already at HEAD"
  NO_CODE_CHANGES=1
else
  ok "advanced $OLD_HEAD → $NEW_HEAD"
  NO_CODE_CHANGES=0
fi

INSTALL=0
if [ "$SKIP_INSTALL" = "yes" ]; then INSTALL=0
elif [ "$SKIP_INSTALL" = "no" ]; then INSTALL=1
elif [ "$NO_CODE_CHANGES" = "1" ]; then INSTALL=0
else
  if git diff --name-only "$OLD_HEAD" "$NEW_HEAD" | grep -qE '^(package\.json|package-lock\.json)$'; then
    INSTALL=1
  fi
fi
if [ "$INSTALL" = "1" ]; then
  step "npm install (package.json/lockfile changed)"
  npm install 2>&1 | tail -4 || die "npm install failed" 3
  ok "deps installed"
else
  step "npm install — skipped"
fi

step "pm2 restart $PM2_ID --update-env"
pm2 restart "$PM2_ID" --update-env 2>&1 | tail -3 || die "pm2 restart failed" 5
ok "process restarted"

step "Post-deploy verification"
sleep 2
STATE=$(pm2 jlist 2>/dev/null | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    try {
      const list=JSON.parse(d);
      const p=list.find(x=>x.pm_id==$PM2_ID||x.name==='$PM2_NAME');
      if (!p) { console.log('missing'); process.exit(0); }
      console.log(p.pm2_env.status + ' ' + p.pm2_env.restart_time);
    } catch(e) { console.log('parse_error'); }
  });
" 2>/dev/null || echo "unknown")
case "$STATE" in
  online\ *)
    ok "$PM2_NAME online (restart count: $(echo "$STATE" | awk '{print $2}'))"
    ;;
  *)
    die "process state = $STATE — check 'pm2 logs $PM2_ID'" 6
    ;;
esac

echo ""
echo "${BOLD}${GREEN}✓ BE deploy complete${RESET}"
echo "  HEAD:     $NEW_HEAD"
echo "  PM2 id:   $PM2_ID ($PM2_NAME)"
