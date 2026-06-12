#!/bin/bash
# scripts/setup-logrotate.sh
# Run ONCE on the VPS (74.50.109.203) as root.
#
#   ssh root@74.50.109.203
#   bash /tmp/setup-logrotate.sh
#
# What this does:
#   - Installs `pm2-logrotate` PM2 module (rotation handled inside PM2 itself).
#   - Configures: 10 MB max per file, 14 days retention, gzip compression,
#     daily rotation, retains last 30 archived files.
#   - Adds an OS-level logrotate config too (belt-and-suspenders for any
#     non-PM2 logs that land in /var/log/).
#
# Why pm2-logrotate over plain logrotate:
#   PM2 buffers stdout in-process; OS-level logrotate can't truncate
#   PM2's open file handles cleanly without `pm2 reloadLogs`.
#   pm2-logrotate hooks PM2 directly, no signal dance.
#
# Idempotent: re-running just rewrites the config + restarts the module.

set -euo pipefail

echo "==> Installing pm2-logrotate module..."
pm2 install pm2-logrotate

echo "==> Configuring pm2-logrotate..."
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'  # daily at 00:00
pm2 set pm2-logrotate:workerInterval 30           # check every 30s
pm2 set pm2-logrotate:rotateModule true            # rotate the module's own logs too

echo "==> Showing pm2-logrotate config..."
pm2 conf pm2-logrotate

echo "==> Setting OS-level logrotate for /var/log/nuro/*.log (if used)..."
cat > /etc/logrotate.d/nuro <<'EOF'
/var/log/nuro/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
EOF

echo "==> Verifying logrotate config..."
logrotate -d /etc/logrotate.d/nuro 2>&1 | head -20

echo ""
echo "✓ Logrotate wired. PM2 logs will rotate at 10MB or daily, kept 30 days."
echo ""
echo "Verify with:"
echo "  pm2 conf pm2-logrotate"
echo "  ls -lh /root/.pm2/logs/"
