#!/usr/bin/env bash
# Start local Postgres (Docker) and apply migrations.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTAINER="${NURO_PG_CONTAINER:-nuro-postgres}"
DB_URL="${POSTGRES_URL:-postgresql://nuro:nuro@localhost:5432/nuro}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not found. Install Docker Desktop or set POSTGRES_URL to an existing Postgres."
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    echo "→ Starting existing container $CONTAINER"
    docker start "$CONTAINER" >/dev/null
  else
    echo "→ Creating Postgres container $CONTAINER"
    docker run -d \
      --name "$CONTAINER" \
      -e POSTGRES_USER=nuro \
      -e POSTGRES_PASSWORD=nuro \
      -e POSTGRES_DB=nuro \
      -p 5432:5432 \
      postgres:16 >/dev/null
  fi
  echo "→ Waiting for Postgres..."
  for _ in $(seq 1 30); do
    if docker exec "$CONTAINER" pg_isready -U nuro >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi

export POSTGRES_URL="$DB_URL"
export DATABASE_URL="$DB_URL"
bash "$ROOT/scripts/run-migrations.sh"

echo ""
echo "✓ Local database ready at $DB_URL"
echo "  Next: pnpm dev:api   (terminal 1, port 3000)"
echo "        pnpm dev       (terminal 2, port 2800)"
