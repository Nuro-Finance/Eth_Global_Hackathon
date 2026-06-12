# Testing Strategy — AFI E2E Verification
> Last updated: 2026-04-13 (Session 19)

---

## E2E Bridge Test Results

| # | Chain | Route | Amount | Fee | Issuer Credit | Status | Session |
|---|-------|-------|--------|-----|-------------|--------|---------|
| 1 | **Base** | Direct → Issuer | $0.10 | $0.005 | +$0.09 | PASSED | 17 |
| 2 | **Ethereum** | CCTP → Base → Issuer | $0.10 | $0.005 | +$0.09 | PASSED | 17 |
| 3 | **Arbitrum** | CCTP → Base → Issuer | $0.10 | $0.005 | +$0.08 | PASSED | 17 |
| 4 | **Solana** | Bridge Kit → Base → Issuer | $1.00 | $0.00* | +$1.09 | PASSED | 17 |
| 5 | **zkSync** | LZ 2-hop → Arb → CCTP → Base | ~$0.09 | $0.00 | +$0.09 | PASSED | 18 |

\* Solana fee vault ATA not initialized — full amount bridged

### Wired but Untested (18 remaining)

**CCTP 1-Hop (should work, needs gas funding):**
Optimism, Polygon, Avalanche, Linea, Unichain, Sonic, World Chain, Ink, Codex, Monad, Sei, XDC, Plume, HyperEVM

**LayerZero 2-Hop (DVN configs now wired in Session 19, needs funded deposit + Arb ETH):**
Scroll, Celo, Gnosis, BSC

### Key Reliability Fixes (Session 19)
- `waitForArbUsdc` timeout increased 300s → 1200s (was timing out before LZ delivery)
- Progressive logging: elapsed/remaining countdown in PM2 logs
- LZ_INFRA registry: per-chain library/executor addresses (Gnosis + BSC use non-standard!)
- HyperEVM added to monitor.ts CHAINS (was missing, deposits wouldn't be detected)

## Test Procedure Per Chain

### Prerequisites
- [ ] Deposit address has ETH/native gas on source chain
- [ ] Deposit address has ETH on Arbitrum (for LZ 2-hop chains)
- [ ] Monitor enabled: `sed -i 's/86400000/30000/' src/monitor.ts && pm2 restart 4`
- [ ] Fee vault has initialized ATA (Solana only)

### Steps
1. Send $0.10 USDC to deposit address `0x75Aa...45fC` on target chain
2. Wait 30s for monitor to detect
3. Watch logs: `pm2 logs 4 --nostream | grep -i bridge`
4. Verify bridge route fires (CCTP or LZ)
5. Verify Issuer Base address receives USDC
6. Verify Issuer card balance increases via `/owen-status`
7. Verify admin console shows transaction as confirmed

### Post-Test
- [ ] Pause monitor: `sed -i 's/30000/86400000/' src/monitor.ts && pm2 restart 4`
- [ ] Record result in this table
- [ ] Update chain status in V2 Feature Set & Marathons.md

## Bugs Found During E2E Testing

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Nonce race condition | Concurrent poll cycles collide | `nonce-manager.ts` — per-address locks |
| Issuer sync undefined | Read `balance` but Issuer returns `spendingPower` | Fixed field name in `issuers.ts` |
| Issuer sync fire-and-forget | Balance returned before sync completed | Sync BEFORE responding |
| Solana VARCHAR(42) | Solana addresses are 44 chars | Expanded to VARCHAR(64) |
| Solana tx hash too long | Solana sigs are 88 chars | Expanded to VARCHAR(100) |
| Circle CCTP no routes | V2 has no remote domains on Solana | Switched to Bridge Kit |
| Alchemy stale nonces | Alchemy caches getTransactionCount | Use publicnode.com for nonces |
| Admin "Unknown" chain | source_chain=0 not mapped | Added 22 chain names |

## Unit Test Coverage

| Area | Tests | Location |
|------|-------|----------|
| OFT Adapter | 1 test file | `test/hardhat/MyOFTAdapter.test.ts` |
| Frontend | 0 | No test framework configured |
| Backend | 0 | No test framework configured |
| Bridge | 0 (manual E2E only) | — |

## Test Debt
- No automated test suite for any backend route
- No frontend component tests
- Bridge testing is entirely manual (send real USDC, watch logs)
- Market oracle resolution not tested with edge cases
- Agent trading not tested (needs funded Polygon wallet)

---

*Related: [[Neural Net/Claude Memory/Architecture]] · [[Neural Net/Claude Memory/Bridge & Monitor]] · [[Neural Net/Claude Memory/V2 Feature Set & Marathons]] · [[Neural Net/Claude Memory/Pending Tasks]]*
