#!/usr/bin/env bash
# Apply bootstrap + numbered SQL migrations in order.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

DB_URL="${POSTGRES_URL:-${DATABASE_URL:-postgresql://nuro:nuro@localhost:5432/nuro}}"

run_sql() {
  local file="$1"
  echo "→ $(basename "$file")"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$file" >/dev/null
}

command -v psql >/dev/null || { echo "psql not found. Install PostgreSQL client."; exit 1; }

echo "Using database: ${DB_URL//:*@/@***@}"

run_sql "$ROOT/src/migrations/000_bootstrap_core.sql"
run_sql "$ROOT/migrations/001_deposit_addresses.sql"

while IFS= read -r file; do
  base="$(basename "$file")"
  case "$base" in
    000_bootstrap_core.sql) continue ;;
  esac
  run_sql "$file"
done < <(find "$ROOT/src/migrations" -maxdepth 1 -name '*.sql' | sort)

echo "✓ Migrations complete"
