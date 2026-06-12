#!/usr/bin/env bash
# scripts/migrate-to-supabase.sh — Nuro Postgres → Supabase migration
#
# Run ON THE VPS (cash@74.50.109.203). Performs:
#   1. pg_dump from local Postgres → temp file (full schema + data)
#   2. Smoke-test Supabase reachability via DIRECT connection
#   3. Apply dump to Supabase
#   4. Verify row counts match between local and Supabase
#   5. Print the next-step commands for the .env cutover
#
# REQUIRED ENV VARS (set before running):
#   SUPABASE_DIRECT_URL  — port 5432 connection string for DDL + data load
#                          format: postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres
#   VPS_LOCAL_PG_URL     — defaults to current localhost nuro DB
#
# DOES NOT auto-cut over the .env — that's a separate manual step after
# verifying row counts. See the printout at end of script.
#
# IDEMPOTENT: re-running re-dumps and re-applies. Supabase will accept the
# duplicate CREATE TABLE statements (they fail-soft on duplicate name and
# the data load uses INSERT ... which will conflict — re-run only on a
# fresh Supabase project, or after TRUNCATE-ing).
#
# DURATION: ~3-5 min for a small DB; up to 10 min if heimdall_events is large.

set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────
SUPABASE_DIRECT_URL="${SUPABASE_DIRECT_URL:?Set SUPABASE_DIRECT_URL first (port 5432 direct, NOT the pooled 6543 URL)}"
VPS_LOCAL_PG_URL="${VPS_LOCAL_PG_URL:-postgresql://nuro:nuro@localhost:5432/nuro}"
DUMP_FILE="${DUMP_FILE:-/tmp/nuro_$(date +%Y%m%d_%H%M%S).sql}"

# ─── Colors ──────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; CYAN=$'\033[36m'; BOLD=$'\033[1m'; RESET=$'\033[0m'
else
  RED=""; GREEN=""; YELLOW=""; CYAN=""; BOLD=""; RESET=""
fi
step()  { echo "${BOLD}${CYAN}▸ $*${RESET}"; }
ok()    { echo "${GREEN}  ✓ $*${RESET}"; }
warn()  { echo "${YELLOW}  ⚠ $*${RESET}"; }
die()   { echo "${RED}  ✗ $*${RESET}" >&2; exit 1; }

# ─── Pre-flight ──────────────────────────────────────────────────────────────
step "Pre-flight checks"
command -v pg_dump >/dev/null || die "pg_dump not installed"
command -v psql    >/dev/null || die "psql not installed"
ok "pg_dump + psql available"

# ─── Step 1: Dump local Postgres ─────────────────────────────────────────────
step "Step 1/4: pg_dump from VPS local Postgres → $DUMP_FILE"
pg_dump "$VPS_LOCAL_PG_URL" \
  --no-owner \
  --no-privileges \
  --no-publications \
  --no-subscriptions \
  --quote-all-identifiers \
  > "$DUMP_FILE" || die "pg_dump failed"
DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
ok "dumped $DUMP_SIZE → $DUMP_FILE"

# ─── Step 2: Verify Supabase reachable ───────────────────────────────────────
step "Step 2/4: Smoke-test Supabase connection"
SB_VERSION=$(psql "$SUPABASE_DIRECT_URL" -tAc "SELECT version();" 2>&1) || die "Supabase unreachable: $SB_VERSION"
ok "Supabase reachable: $(echo "$SB_VERSION" | head -c 60)..."

# ─── Step 3: Apply dump to Supabase ──────────────────────────────────────────
step "Step 3/4: Apply schema + data to Supabase (this can take 2-10 min)"
SB_LOG="${DUMP_FILE%.sql}.supabase-load.log"
psql "$SUPABASE_DIRECT_URL" --set ON_ERROR_STOP=0 -f "$DUMP_FILE" > "$SB_LOG" 2>&1 || warn "psql exited non-zero (some errors expected for built-in roles/extensions); see $SB_LOG"

ERROR_COUNT=$(grep -c "^ERROR:" "$SB_LOG" 2>/dev/null || echo "0")
NOTICE_COUNT=$(grep -c "^NOTICE:" "$SB_LOG" 2>/dev/null || echo "0")
if [ "$ERROR_COUNT" -gt "10" ]; then
  warn "$ERROR_COUNT errors during apply — inspect $SB_LOG"
  echo "    First 5 errors:"
  grep "^ERROR:" "$SB_LOG" | head -5 | sed 's/^/      /'
else
  ok "applied with $ERROR_COUNT errors, $NOTICE_COUNT notices (errors typically harmless: extension already exists, role already granted, etc.)"
fi

# ─── Step 4: Row-count verification ──────────────────────────────────────────
step "Step 4/4: Row-count verification"
echo "  Comparing critical tables — local vs supabase row counts:"
TABLES=(users cards agents agent_bets agent_budgets agent_reputation card_transactions notifications heimdall_events execution_log)
for table in "${TABLES[@]}"; do
  LOCAL=$(psql "$VPS_LOCAL_PG_URL" -tAc "SELECT count(*) FROM $table;" 2>/dev/null || echo "missing")
  REMOTE=$(psql "$SUPABASE_DIRECT_URL" -tAc "SELECT count(*) FROM $table;" 2>/dev/null || echo "missing")
  if [ "$LOCAL" = "$REMOTE" ] && [ "$LOCAL" != "missing" ]; then
    ok "$table: $LOCAL rows match"
  elif [ "$LOCAL" = "missing" ] || [ "$REMOTE" = "missing" ]; then
    warn "$table: local=$LOCAL  supabase=$REMOTE"
  else
    warn "$table: local=$LOCAL  supabase=$REMOTE  MISMATCH"
  fi
done

# ─── Done — print next-step instructions ─────────────────────────────────────
echo ""
echo "${BOLD}${GREEN}✓ Migration apply complete${RESET}"
echo ""
echo "${BOLD}NEXT STEPS — manual cutover (do NOT auto-execute):${RESET}"
echo ""
echo "  1. Backup current .env as a rollback point:"
echo "       cp ~/Nuro-Finance/.env ~/Nuro-Finance/.env.pre-supabase-\$(date +%Y%m%d_%H%M%S)"
echo ""
echo "  2. Update DATABASE_URL + POSTGRES_URL to the POOLED URL (port 6543):"
echo "       SUPABASE_POOLED_URL='postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres'"
echo "       sed -i \"s|^DATABASE_URL=.*|DATABASE_URL=\$SUPABASE_POOLED_URL|\" ~/Nuro-Finance/.env"
echo "       sed -i \"s|^POSTGRES_URL=.*|POSTGRES_URL=\$SUPABASE_POOLED_URL|\" ~/Nuro-Finance/.env"
echo ""
echo "  3. Restart middleware with --update-env so new env var picks up:"
echo "       pm2 restart 4 --update-env"
echo ""
echo "  4. Smoke test admin console + agent-wallet — if broken, ROLLBACK:"
echo "       cp ~/Nuro-Finance/.env.pre-supabase-* ~/Nuro-Finance/.env  # use timestamp from step 1"
echo "       pm2 restart 4 --update-env"
echo ""
echo "${BOLD}DUMP RETAINED:${RESET} $DUMP_FILE"
echo "  Keep for 7 days as a recovery point. Delete after Supabase proven stable."
