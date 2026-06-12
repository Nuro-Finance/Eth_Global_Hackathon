#!/bin/bash
# Install the Session 25 nginx config with /admin + /telegram/webhook proxies.
# Idempotent: takes a fresh backup, copies /tmp/nginx-nuro.conf into place,
# validates with nginx -t, reloads on success, rolls back on failure.
#
# Usage (from dev machine):
#   scp ops/nginx-nuro.conf ops/install-nginx-nuro.sh cash@74.50.109.203:/tmp/
#   ssh -t cash@74.50.109.203 "sudo bash /tmp/install-nginx-nuro.sh"

set -e

TARGET=/etc/nginx/sites-available/nuro
SRC=/tmp/nginx-nuro.conf
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP="${TARGET}.bak-${STAMP}"

if [ ! -f "$SRC" ]; then
  echo "[!] Source config not found at $SRC — scp it up first"
  exit 1
fi

echo "[1/4] Backing up current config -> $BACKUP"
cp "$TARGET" "$BACKUP"

echo "[2/4] Installing new config"
cp "$SRC" "$TARGET"

echo "[3/4] Running nginx -t"
if ! nginx -t; then
  echo ""
  echo "[!] Validation FAILED — rolling back to $BACKUP"
  cp "$BACKUP" "$TARGET"
  echo "[!] Old config restored. Run again after fixing $SRC."
  exit 1
fi

echo "[4/4] Reloading nginx"
systemctl reload nginx

echo ""
echo "==> Done. Live config now includes /admin + /telegram/webhook proxies."
echo "==> Test:"
echo "    curl -sI https://app.nuro.finance/admin | head -3"
echo "    curl -sI https://app.nuro.finance/telegram/webhook | head -3"
