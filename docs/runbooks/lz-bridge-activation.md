# LZ Bridge Activation Runbook — Multi-DVN Wire + Flag Flip

> **Status as of 2026-05-10 night**: DVN verification complete (16 PASS, 1 WARN, 0 FAIL). Hardhat dry-run blocked by Node version mismatch — needs Node 18 or toolbox patch. Real wire is a daylight task with a fresh sleep first.

## Why this runbook exists

`LZ_BRIDGE_ENABLED=false` has been the production state since Session 28 Kelp-hardening (2026-04-18). The hardened pieces are all built:

- ✅ `contracts/MyOFTAdapter.sol` — 4 defense layers (pause, per-msg cap, 24h cap, rich events)
- ✅ Deployed on Arbitrum / Base / BSC / Celo / Gnosis / Scroll / zkSync
- ✅ `layerzero.config.hardened.ts` — 2-of-3 DVN structure (2-of-2 on zkSync)
- ✅ `src/lz-reserve-monitor.ts` — running on VPS, 5-min cadence

What's pending is the on-chain **wire** + flag flip. This runbook is the execution sequence.

## Session-2 progress notes (2026-05-10 evening, ~5 hr of toolchain spelunking)

✅ **Toolchain solved** via isolated `lz-wire/` env at `C:\Users\Richa\AFI\lz-wire`. See `lz-wire/README.md` for full recipe (10 distinct fixes from Node 18 install through ABI-copy through library-address corrections).

✅ **Dry-run runs end-to-end** with full transaction diff. Output archived to `docs/runbooks/lz-dry-run-output-2026-05-10.txt` (1,387 lines, 30 operations across 6 chains).

🟡 **Discovered 3 wrong library addresses in the original prod config** during dry-run:
  - **Scroll** sendLib `0x1e6F2AEa...` had ZERO bytecode on-chain (would have silently broken every Scroll bridge). Canonical: `0x9BbEb2B2184B9313Cf5ed4a4DDFEa2ef62a2a03B`.
  - **Celo** used "standard" set (Ethereum addresses) — wrong for non-Ethereum chains. Canonical send: `0x42b4E9C6495B4cFDaE024B1eC32E09F28027620e`.
  - **BSC** same problem — used standard Ethereum addresses. Canonical send: `0x9F8C645f2D0b2159767Bd6E0839DE4BE49e823DE`.

  All three fixed in `lz-wire/layerzero.config.hardened.ts`. The dry-run was the right safety net — these errors would have wired bad configs onto 3 chains' worth of pathways before anyone noticed.

⚠️ **enforcedOptions block removed during debugging** — must be re-added per-connection (each connection's `config.enforcedOptions: [...]` array) before the real wire. Without it, every cross-chain message gambles on executor gas estimation. The correct shape is `[{ msgType: 1, optionType: ExecutorOptionType.LZ_RECEIVE, gas: 80000, value: 0 }]` for EVM, gas: 100000 for zkSync.

## Tomorrow morning resume sequence (15 min)

1. `cd C:\Users\Richa\AFI\lz-wire`
2. Add `enforcedOptions` to each of the 10 connections in `layerzero.config.hardened.ts`. zkSync→Arbitrum gets EVM (80k); Arbitrum→zkSync gets ZKSYNC (100k); all others EVM.
3. Re-run dry-run, confirm `setEnforcedOptions` operations appear in output.
4. Verify deployer balances — `node debug-config.js` shows the deployer address, then check native gas on each of arbitrum/zksync/scroll/celo/gnosis/bsc.
5. Go through Steps 4 → 8 below (real wire → fund hub → smoke test → flip flag → re-enable FE chains).

## Step 0 — DVN verification (DONE 2026-05-10)

`scripts/verify-lz-dvns.ts` ran clean:
- 16 PASS — all required + optional DVNs respond to `getFee()` with sensible quotes
- 1 WARN — Scroll polyhedra (`0x8ddf05f9...cb24`) has 2.2KB bytecode (likely minimal proxy delegating). Pathway is resilient: Scroll requires lzLabs + 1-of-{nethermind, polyhedra}, so Polyhedra flakiness doesn't break delivery.
- 0 FAIL

Verification command (re-runnable anytime):
```bash
ssh cash@74.50.109.203 "cd ~/Cashly && env \$(grep -E '^RPC_URL_(ARBITRUM|ZKSYNC|SCROLL|CELO|GNOSIS|BSC)=' .env | xargs) ./node_modules/.bin/tsx scripts/verify-lz-dvns.ts"
```

## Step 1 — Resolve Node version constraint (~10 min)

The LZ toolbox `@layerzerolabs/toolbox-hardhat/dist/index.mjs` does:
```js
import 'hardhat/config'  // missing .js extension → fails on Node 20+
```

**Pick one**:
- **(A)** Install Node 18 LTS locally via `nvm`/`fnm`/direct binary, run wire there. Cleanest.
- **(B)** Patch `node_modules/@layerzerolabs/toolbox-hardhat/dist/index.mjs` to use `'hardhat/config.js'`. Quick + dirty; resets on `npm install`.
- **(C)** Run via `NODE_OPTIONS='--experimental-specifier-resolution=node'` env. Deprecated in Node 17 but may still work as escape hatch.

Recommended: (A) — use a Node-18 dev shell for the wire then go back to your main Node version. nvm-windows install: https://github.com/coreybutler/nvm-windows/releases

## Step 2 — Dry-run wire (~5 min)

Confirms what config changes would land on each chain. **No tx submitted; safe to run repeatedly.**

```bash
cd ~/Cashly  # or local dir if running on Windows
pnpm hardhat lz:oapp:wire --oapp-config layerzero.config.hardened.ts --dry-run
```

Eyeball the output. For each pathway you should see:
- `setPeer` (bidirectional) — confirms the OApp on chain A knows about the OApp on chain B
- `setSendLibrary` + `setReceiveLibrary` — explicit libraries per chain (no LZ defaults)
- `setConfig` (executor) — `maxMessageSize: 10000` + per-chain executor address
- `setConfig` (ULN) — `requiredDVNs` + `optionalDVNs` + `optionalDVNThreshold`
- `setEnforcedOptions` — gas budget for `LZ_RECEIVE` (80k EVM, 100k zkSync)

**Red flags to watch for**:
- Any `setPeer` with a peer address that doesn't match a known MyOFTAdapter deployment
- Any DVN address that doesn't appear in the verified `scripts/verify-lz-dvns.ts` output
- `requiredDVNs: []` with `optionalDVNs: []` (1-of-1 = Kelp risk class)

If anything looks wrong, **STOP**. Don't proceed to Step 3 until the dry-run is clean.

## Step 3 — Pre-fund deployer wallets (~10 min)

The wire writes config on 6 chains. Deployer wallet (`PRIVATE_KEY` in `.env`) needs native gas on each:

| Chain | Gas needed | At current prices |
|---|---|---|
| Arbitrum | ~0.001 ETH | $2-4 |
| BSC | ~0.005 BNB | $3-5 |
| Celo | ~0.5 CELO | $0.30-0.50 |
| Gnosis | ~0.001 xDAI | $0.001 |
| Scroll | ~0.001 ETH | $2-4 |
| zkSync | ~0.002 ETH | $4-6 |

Total: ~$15-25 in native tokens across all 6. Treasury wallet should already have these — `scripts/check-wallets.ts` can verify balances.

## Step 4 — Execute the wire (~10 min)

```bash
pnpm hardhat lz:oapp:wire --oapp-config layerzero.config.hardened.ts
```

Drop `--dry-run`. Hardhat will submit txs in sequence and wait for confirmations. Each pathway is multiple txs (setPeer × 2, setLibrary × 2, setConfig × N). Total: ~30-50 txs across 6 chains.

**Watch for**:
- Any failed tx → fix root cause before re-running (idempotent — re-runs skip already-applied config)
- Owner mismatch errors → confirm deployer address is owner on every adapter via `owner()` read

## Step 5 — Top up Arbitrum hub reserve (~5 min)

The hardened OFTAdapter on Arbitrum holds real USDC as backing reserve. For demo headroom, fund it with **~$2k USDC**:

```bash
# Send from treasury wallet to:
# Arbitrum MyOFTAdapter: 0xd58C1412e50fF00212770B170D86e2387D2d2b18
```

The reserve-monitor at `src/lz-reserve-monitor.ts` will start tracking the `balanceOf(adapter) >= sum(spoke totalSupply)` invariant immediately.

## Step 6 — Smoke test (~10 min)

Bridge $1 USDC from BSC → Arbitrum → Base end-to-end:

```bash
# Find a BSC-funded test wallet, send $1 worth of BSC USDC to the bridge
# adapter on BSC: 0xce4c2270890267aC860fdc72b6946359d0898675
# (use ethers/web3 with the OFTAdapter ABI's send() method)

# Then watch:
ssh cash@74.50.109.203 "pm2 logs cashly-middleware --lines 100 | grep -iE 'lz|bridge|reserve'"
```

Expected within ~5 minutes:
1. BSC adapter emits `OFTSent` event
2. DVNs (lzLabs + nethermind primary, googleCloud optional) attest
3. Arbitrum adapter emits `OFTInboundReceived` event
4. Reserve monitor logs `lz_reserve_ok` row in execution_log
5. CCTP path picks up the Arbitrum USDC → mints on Base
6. SD3 sync detects Base USDC arrival → credits card

If anything stalls, **`setPaused(true)` on the affected adapter** stops further messages. Single-block kill-switch.

## Step 7 — Flip the kill-switch (~2 min)

Only after Step 6 smoke test passes end-to-end:

```bash
ssh cash@74.50.109.203 "sed -i 's|^LZ_BRIDGE_ENABLED=.*|LZ_BRIDGE_ENABLED=true|' ~/Cashly/.env || echo 'LZ_BRIDGE_ENABLED=true' >> ~/Cashly/.env"
ssh cash@74.50.109.203 "pm2 restart cashly-middleware --update-env"
```

Verify:
```bash
ssh cash@74.50.109.203 "pm2 env 4 | grep LZ_BRIDGE_ENABLED"
# Should show: LZ_BRIDGE_ENABLED: 'true'
```

## Step 8 — Re-enable LZ chains in the FE chain picker (~5 min)

Edit `src/lib/chains.ts` — add the now-supported chains to `SETTLEMENT_SUPPORTED_CHAIN_IDS` and `SETTLEMENT_SUPPORTED_CHAIN_NAMES`:

```ts
export const SETTLEMENT_SUPPORTED_CHAIN_IDS = new Set<number>([
    // ... existing 6 CCTP chains ...
    56,     // BSC (via LZ)
    324,    // zkSync (via LZ)
    534352, // Scroll (via LZ)
    42220,  // Celo (via LZ)
    100,    // Gnosis (via LZ)
])
export const SETTLEMENT_SUPPORTED_CHAIN_NAMES = new Set<string>([
    // ... existing 6 ...
    "BSC", "zkSync", "Scroll", "Celo", "Gnosis",
])
```

Commit → push → FE deploy. Users can now Reload from any of the 11 chains.

## Rollback procedure

If anything goes wrong post-Step 7:

1. **Immediate**: `setPaused(true)` on the Arbitrum hub adapter — stops all inbound messages.
2. **Soft rollback**: Set `LZ_BRIDGE_ENABLED=false` + restart middleware. FE chain picker still shows LZ chains but backend won't dispatch bridges through them. Deposits would sit until Step 7 re-enabled.
3. **Hard rollback**: Re-wire pathways back to old DVN config (`layerzero.config.ts`). Same `pnpm hardhat lz:oapp:wire` command with the original config file.

## Risk-bounded by hardened adapter

Even if a DVN compromise happened mid-demo:
- Per-message cap = 100k USDC. Max single forged message drains 100k.
- Per-peer 24h cap = 500k USDC. Max daily drain via any single pathway capped.
- `setPaused(true)` is a 1-block kill-switch.
- Reserve monitor alerts within 5 min of any drift.

Worst-case blast radius: $100k single + $500k daily, with operator alert + pause capability within minutes. Vs. Kelp's $292M = ~580x lower exposure ceiling for our worst case.

---

*Related: [[layerzero.config.hardened.ts]] · [[contracts/MyOFTAdapter.sol]] · [[src/lz-reserve-monitor.ts]] · [[scripts/verify-lz-dvns.ts]]*
