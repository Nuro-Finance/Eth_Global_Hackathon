# Hardhat Compile Setup — Node 18 via nvm

> **TL;DR**: Production runs Node 20. Hardhat compile needs Node 18. We use nvm to keep both available without conflict. Compile via `npm run compile:hardhat:nvm`.

---

## Why Node 18 specifically

The LayerZero toolchain (`@layerzerolabs/toolbox-hardhat`, `devtools-evm-hardhat`, etc.) and Hardhat 2.x ship `.mjs` files containing bare-subpath imports like `import 'hardhat/config'` (no `.js` extension). They also do not declare an `exports` map in their `package.json`.

**Node 19+ enforces strict ESM resolution** — these imports fail with `ERR_MODULE_NOT_FOUND`. The cascade reaches `@ethersproject/*`, `fp-ts`, `hardhat/types/*`, and dozens more packages.

**Node 18 was the last release** that supported the `--experimental-specifier-resolution=node` legacy fallback. On Node 18, all these imports just resolve.

Patching every dependency in-place is fragile (lost on every `npm install`). Patching via `patch-package` is a half-day of work that grows with every dep update. **Using Node 18 for the single compile workflow is the cleanest long-term answer** — production stays on the well-tested Node 20, and the hardhat-specific concern stays scoped to that one command.

Full diagnosis: see `Neural Net/Decision Journal/2026-04-25_004.md` and `2026-04-25_005.md`.

---

## One-time host setup

### 1. Install nvm

```bash
curl -sSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
```

The installer adds nvm-init to `~/.bashrc`. Open a new shell or:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```

### 2. Install Node 18.20.4 (LTS)

```bash
nvm install 18.20.4
```

### 3. **CRITICAL**: pin the default to system Node

```bash
nvm alias default system
```

This step is **non-negotiable**. Without it, every new shell auto-switches to Node 18, which means production-targeting workflows (pm2 restart, npm publish, etc.) would silently start running on Node 18.

Verify:

```bash
# In a fresh shell with nvm sourced:
node -v   # should print v20.x.x — system Node
nvm exec 18 node -v   # should print v18.20.4 — explicit nvm
```

### 4. Verify pm2 services unaffected

The repo's `ecosystem.config.js` pins `env.PATH` to a system-only path that excludes `~/.nvm/versions/*/bin`. Even if a future operator forgets the `nvm alias default system` step, pm2 services keep using `/usr/bin/node` v20.

```bash
pm2 list   # cashly-middleware + cashly-frontend should be online
pm2 describe cashly-middleware | grep PATH
# → /usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin (no nvm)
```

---

## Daily workflow

### Compile contracts

```bash
npm run compile:hardhat:nvm
```

The wrapper at `scripts/compile-contracts.sh` sources nvm, switches to Node 18 for its own runtime, runs `npx hardhat compile`, then exits. Your shell's Node version is unaffected.

### Run other Hardhat tasks under Node 18

The wrapper passes through any args:

```bash
npm run compile:hardhat:nvm clean
npm run compile:hardhat:nvm verify --network base 0xDeployedAddress
npm run compile:hardhat:nvm node    # local hardhat dev node
```

### Override Node version

```bash
NODE_VERSION_HARDHAT=18.20.5 npm run compile:hardhat:nvm
```

(Stick with 18.x.x — 19+ has the same ESM-strict issue we're working around.)

---

## Why pm2 stays safe

Three layers of defense, in order of robustness:

1. **`nvm alias default system`** keeps fresh shells on Node 20.
2. **`ecosystem.config.js` pins `env.PATH`** to a system-only path. Even if someone forgets layer 1 and runs `pm2 kill && pm2 start ecosystem.config.js` from an nvm-loaded shell, the spawned services see clean PATH.
3. **PM2 daemon resolves `node` at child-process spawn time** from PATH. With layers 1+2 holding, that's always `/usr/bin/node` v20.

The compile wrapper is a leaf process (subshell exits cleanly), so it can never leak Node 18 into pm2's environment.

---

## Troubleshooting

### `nvm not found at ~/.nvm/nvm.sh`

The wrapper expects nvm at `$HOME/.nvm`. Override with `NVM_DIR=/some/other/path`. If nvm isn't installed at all, follow step 1 of "One-time host setup."

### `Node 18.20.4 not installed via nvm`

Run `nvm install 18.20.4`. Or set `NODE_VERSION_HARDHAT` to whatever 18.x.x you have.

### `nvm use 18.20.4 did not activate Node 18`

Means a previous `nvm` command in the same subshell already aliased to a different version. Shouldn't happen via this wrapper (it forks a fresh subshell each invocation). If it does, check shell aliases for hardhat or hardcoded `node` paths.

### Compile succeeds locally but fails in CI

CI is likely on Node 20+. Either:
- Add a `nvm install 18 && nvm use 18` step before `npm run compile:hardhat`, OR
- Use `npm run compile:hardhat:nvm` (which handles the switch internally) if CI has nvm.

---

## Future migration

When Hardhat 3 ships and the LayerZero toolchain follows, this workaround becomes obsolete. At that point:

1. Run a smoke compile under Node 20 directly: `npx hardhat compile`
2. If it succeeds, the workaround is no longer needed.
3. Remove `compile:hardhat:nvm` from `package.json`, delete `scripts/compile-contracts.sh`, delete this doc.
4. Optionally `nvm uninstall 18.20.4` to free disk.

Until then, this is the canonical path.
