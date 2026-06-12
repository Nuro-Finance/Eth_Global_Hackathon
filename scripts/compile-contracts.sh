#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# compile-contracts.sh — Hardhat compile under Node 18 via nvm (S32)
#
# Why this script exists: the LayerZero toolchain (@layerzerolabs/toolbox-
# hardhat + downstream devtools) ships .mjs files with bare-subpath imports
# (`import 'hardhat/config'`, no .js extension) and no `exports` map in
# their package.json. Node 19+ enforces strict ESM resolution which rejects
# these. Node 18 was the last release with the legacy fallback resolver.
#
# Production services (nuro-api, nuro-frontend) MUST stay on
# Node 20 (system /usr/bin/node) — they're tested + stable there. Hardhat
# compile is the ONLY workflow that needs Node 18.
#
# This script bridges the gap: it sources nvm, switches to Node 18 for
# its own runtime, runs hardhat compile, then exits cleanly. The shell
# that invoked it is unaffected.
#
# Usage:
#   ./scripts/compile-contracts.sh             # compile all
#   ./scripts/compile-contracts.sh clean       # clean + compile
#   ./scripts/compile-contracts.sh <task>...   # any hardhat task
#
# Exit codes:
#   0  — compile succeeded
#   2  — nvm not installed (manual setup needed)
#   3  — Node 18 not installed via nvm
#   $? — hardhat's exit code on compile failure
#
# Reproducibility: install nvm + Node 18 with these commands once per host:
#   curl -sSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
#   source "$HOME/.nvm/nvm.sh"
#   nvm install 18.20.4
#   nvm alias default system   # CRITICAL — keeps system Node 20 as default
#
# After install, this script "just works."
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

NODE_VERSION="${NODE_VERSION_HARDHAT:-18.20.4}"

# Locate nvm. Default install dir is ~/.nvm. Honor NVM_DIR env override.
NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  echo "ERROR: nvm not found at $NVM_DIR/nvm.sh" >&2
  echo "Install with:" >&2
  echo "  curl -sSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash" >&2
  echo "  source \"\$HOME/.nvm/nvm.sh\"" >&2
  echo "  nvm install $NODE_VERSION" >&2
  echo "  nvm alias default system" >&2
  exit 2
fi

# Source nvm in a way that doesn't touch the parent shell's env.
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"

# Verify Node 18 is installed under nvm.
if ! nvm ls "$NODE_VERSION" >/dev/null 2>&1; then
  echo "ERROR: Node $NODE_VERSION not installed via nvm." >&2
  echo "Install with: nvm install $NODE_VERSION" >&2
  exit 3
fi

# Switch this script's runtime to Node 18. Doesn't affect the parent shell
# because we're a subshell.
nvm use "$NODE_VERSION" >/dev/null

# Sanity: confirm Node version + that hardhat is reachable.
ACTIVE_NODE="$(node -v)"
if [[ "$ACTIVE_NODE" != v18* ]]; then
  echo "ERROR: nvm use $NODE_VERSION did not activate Node 18 (got $ACTIVE_NODE)" >&2
  exit 3
fi

echo "[compile-contracts] Using Node $ACTIVE_NODE (system Node remains $(/usr/bin/node -v 2>/dev/null || echo 'unknown'))"

# Move into the repo root (script may be invoked from anywhere).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Force ts-node to use CommonJS module output for hardhat.config.ts.
# Repo's top-level tsconfig.json sets `module: esnext` (Next.js FE
# requirement). ts-node honors that, leaving `import` statements untouched
# in the .ts → .js transpile, which Node's CJS loader can't execute.
# Hardhat 2.x requires CJS — this override scopes the fix to this script
# only without forking the FE tsconfig.
# module: commonjs requires moduleResolution: node (legacy CJS) — repo
# default `bundler` is incompatible with CJS module output.
export TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}'

# Default to `compile` if no args provided. Pass-through any args otherwise
# (`clean`, `flatten`, `verify`, etc. — full hardhat task surface).
if [ "$#" -eq 0 ]; then
  exec npx hardhat compile
fi

exec npx hardhat "$@"
