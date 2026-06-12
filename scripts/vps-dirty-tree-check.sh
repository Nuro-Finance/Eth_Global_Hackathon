#!/usr/bin/env bash
# Pre-deploy gate: verify VPS working tree is clean before any `git pull`.
#
# Exits 0 if the tree is clean.
# Exits 1 if there are uncommitted changes, with a remediation hint.
#
# Usage:
#   ./scripts/vps-dirty-tree-check.sh [ssh-target]
#   ./scripts/vps-dirty-tree-check.sh nuro@74.50.109.203

set -e

TARGET="${1:-nuro@74.50.109.203}"
APP_DIR="~/Nuro-Finance"

EXIT=0

STATUS=$(ssh "$TARGET" "cd $APP_DIR && git status --porcelain" 2>&1)
if [[ -z "$STATUS" ]]; then
    echo "✓ $APP_DIR clean"
else
    echo "✗ $APP_DIR has uncommitted changes:"
    echo "$STATUS" | sed 's/^/    /'
    echo ""
    echo "  Fix: SSH in and either"
    echo "    (a) commit the local change:  cd $APP_DIR && git add … && git commit -m …"
    echo "    (b) stash it temporarily:     cd $APP_DIR && git stash push -m 'pre-deploy'"
    echo "    (c) discard if junk:          cd $APP_DIR && git checkout -- <file>"
    echo ""
    EXIT=1
fi

if [[ $EXIT -ne 0 ]]; then
    echo ""
    echo "⚠️  Dirty-tree gate FAILED. Resolve the above before running git pull on VPS."
    exit 1
fi

echo ""
echo "✓ VPS tree clean — safe to pull."
