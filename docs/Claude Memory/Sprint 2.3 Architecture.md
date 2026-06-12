# Sprint 2.3 — Bot Section Real Execution (Architecture)

> Created: 2026-04-17 (Session 21) — Mythos
> Status: Backend wired complete; live flags held pre-funding (Monday 2026-04-20)
> Principle: Intent Layer records intent. Execution Layer moves real money. Never conflate.

---

## Goal

```
User deploys bot → funded Polygon wallet → real Polymarket CLOB trades
  → profits swept Polygon → Base (CCTP) → optional card settle → Visa credit
```

---

## The six architectural decisions (locked 2026-04-17)

**Q1 — Agent wallet: SEPARATE HD on Polygon.** Not the user's Base vault. CLOB compromise ≠ full vault loss. Canonical derivation lives in [polymarket.ts:15](Cashly_Source_Code/src/polymarket.ts:15) — `ethers.utils.id(PRIVATE_KEY + 'agent_' + agentId)`.

**Q2 — Bet settlement via Gamma API, not CLOB positions.** `agent_bets.tokenId` + `entry_price` are deterministic; on close, payout = `amount/entry_price` USDC if outcome matches. Cheaper than CLOB reads.

**Q3 — Profit sweep via user Base vault.** When `payout_destination` starts with `card`, reuse `enqueueCardSettlement` ([execution-dispatch.ts:134-165](Cashly_Source_Code/src/execution-dispatch.ts:134)) — the Sprint B fee+forward plumbing is already proven. For `vault` destination, CCTP direct Polygon→Base vault. Trigger = balance threshold (`free ≥ $2`), NOT per-bet.

**Q4 — Funding via intent table + sweep.** New `agent_fundings` table (migration 021). `POST /agents/:id/fund` inserts intent. `sweepAgentFundings` executes CCTP Base→Polygon. Observe-only pre-funding (controlled by `AGENT_FUNDING_OBSERVE_ONLY` env var).

**Q5 — Dual-source P&L.** DB counters (`agents.total_funded/invested/swept`) drive UI; `reconcileAgentPnL` drift-checks against on-chain balance every cycle. Drift > $0.50 → execution_log alert (Sprint D pattern).

**Q6 — Advisory lock per agent_id.** `hashtext('agent_' || agentId)` wrapping bet placement, settlement, and profit sweep. Same primitive as Sprint 2.1 Slice-1a in [nuro-routes.ts:2760](Cashly_Source_Code/src/nuro-routes.ts:2760). Chain lock on agent wallet address (137) for actual on-chain USDC moves.

---

## Component diagram

```
             ┌───────── Intent Layer (Postgres) ─────────┐
             │ agents · agent_bets · agent_fundings       │
             │ agent_profit_sweeps · users.payout_dest    │
             └──────┬───────────────────┬─────────────────┘
   POST /agents/:id/fund           runAlphaBotCycle() (60s)
   POST /agents/:id/bets                ▲
             │                          │ advisory_lock('agent_' || id)
             ▼                          │
┌─ execution-dispatch.ts :: runSweepCycle (60s, Promise.allSettled) ─┐
│ sweepAgentFundings      — CCTP Base→Polygon | vault→agent          │
│ sweepAlphaBotCycle      — scan + CLOB post (alpha-bot.ts delegate) │
│ sweepAgentBetSettlements — Gamma poll · mark won/lost · upd agents │
│ sweepAgentProfits       — threshold · CCTP Polygon→Base (vault)    │
│ sweepCardSettlements    — vault→Issuer (EXISTING Sprint B path)    │
│ reconcileAgentPnL       — drift alert (Sprint D pattern)           │
└──────┬──────────────────────────────┬────────────────────────────────┘
       │ chainLock(137, agent.addr)   │ chainLock(8453, vault.addr)
       ▼                              ▼
  Polymarket CLOB ──bet settles──► Polygon agent wallet ──CCTP──► Base USDC
                                                                     │
                                                                     ▼
                                                        (card dest only)
                                                        sweepCardSettlements
                                                        → Issuer Base deposit
                                                        → Visa credit
```

---

## State machines

**`agents.status`:** `draft → funding → active ↔ paused → archived` (terminal)
- `draft → funding` on first POST /agents/:id/fund
- `funding → active` when on-chain balance ≥ min (agent becomes eligible for sweeps)
- `active ↔ paused` via PATCH or N consecutive CLOB failures
- `* → archived` terminal (no further sweeps)

**`agent_bets.status`:** `queued → open → (won | lost | cancelled)`
- `queued → open` on CLOB success ([alpha-bot.ts:183](Cashly_Source_Code/src/alpha-bot.ts:183))
- `open → won/lost` in sweepAgentBetSettlements (Gamma close + outcome match)
- `* → cancelled` admin-only

**`agent_fundings.status`:** `pending → (burning → attesting → completed | failed | skipped_observe_only)`

**`agent_profit_sweeps.status`:** `pending → burning → completed | failed`

Pure-helper guards enforce valid transitions: [agent-helpers.ts:50-74](Cashly_Source_Code/src/agent-helpers.ts:50).

---

## Sweep / lock table

| Sweep | Interval | Advisory Lock | Chain Lock | On-chain? |
|---|---|---|---|---|
| `sweepAgentFundings` | 60s | (future) `agent_id` | `chainLock(8453, vault)` | Base→Polygon CCTP (observe-only pre-Monday) |
| `sweepAlphaBotCycle` | 60s | per-market dedup at DB layer | `chainLock(137, agent)` when CLOB fires | Polygon CLOB (gated by `AGENT_CLOB_TRADES_ENABLED`) |
| `sweepAgentBetSettlements` | 60s | `agent_id` per bet row | — | DB-only |
| `sweepAgentProfits` | 60s | `agent_id` | `chainLock(137, agent)` then `chainLock(8453, vault)` if card-settle | Polygon→Base CCTP (live-ready) |
| `reconcileAgentPnL` | 60s | none (read-only) | — | 1 RPC/agent (balanceOf) |

All registered via `Promise.allSettled` in [execution-dispatch.ts:1297](Cashly_Source_Code/src/execution-dispatch.ts:1297).

---

## Full-stack path: "User funds agent" → "Card credited"

Every hop from FE click to on-chain:

1. **FE:** user clicks **Fund** on an agent card →
2. **Frontend API:** calls `POST /agents/:id/fund` with `{ amount }` →
3. **Backend endpoint:** [nuro-routes.ts POST /agents/:id/fund](Cashly_Source_Code/src/nuro-routes.ts) — advisory-lock tx, inserts `agent_fundings` with `status='pending'`, transitions agent draft→funding →
4. **Execution dispatch sweep:** [execution-dispatch.ts sweepAgentFundings](Cashly_Source_Code/src/execution-dispatch.ts) — picks up pending rows. In observe-only: logs to `execution_log`. In live: CCTP Base→Polygon →
5. **Alpha bot cycle:** [alpha-bot.ts runAlphaBotCycle](Cashly_Source_Code/src/alpha-bot.ts:216) — scans Gamma for >85% confidence markets, places CLOB trade via [polymarket.ts placePolymarketTrade](Cashly_Source_Code/src/polymarket.ts:43), inserts `agent_bets` →
6. **Bet settlement sweep:** [execution-dispatch.ts sweepAgentBetSettlements](Cashly_Source_Code/src/execution-dispatch.ts) — polls Gamma `/markets/:id`, matches outcome, computes PnL via [agent-helpers.ts calculatePnL](Cashly_Source_Code/src/agent-helpers.ts:16), updates `agent_bets.status` + `agents` counters →
7. **Profit sweep:** [execution-dispatch.ts sweepAgentProfits](Cashly_Source_Code/src/execution-dispatch.ts) — when `onChainBalance − reserved ≥ $2`, inserts `agent_profit_sweeps`, calls [bridge.ts cctpBurnAndMint](Cashly_Source_Code/src/bridge.ts:246) (Polygon→Base) →
8. **Card settlement (if `payout_destination='card'`):** [execution-dispatch.ts enqueueCardSettlement](Cashly_Source_Code/src/execution-dispatch.ts:134) — inserts `card_settlements` row →
9. **Card settle sweep:** `sweepCardSettlements` (Sprint B existing) — vault → FEE_VAULT (5%) → Issuer Base deposit →
10. **Issuer:** detects Base deposit → credits Visa card →
11. **Reconcile loop:** [execution-dispatch.ts reconcileAgentPnL](Cashly_Source_Code/src/execution-dispatch.ts) — every cycle, on-chain vs expected. Drift > $0.50 → alert in `execution_log`.

Every `execution_log` entry records: `entity_type`, `entity_id`, `action`, `status`, `tx_hash`, `detail`, `error_message` ([execution-dispatch.ts:37](Cashly_Source_Code/src/execution-dispatch.ts:37)).

---

## Real-money risks (and mitigations in code)

| Risk | Mitigation |
|---|---|
| Polygon gas exhaustion mid-sweep | Chain lock + `getFreshNonce` prevents nonce reuse ([nonce-manager.ts](Cashly_Source_Code/src/nonce-manager.ts)); failed tx logged, row stays in retry state |
| CCTP attestation timeout (13-19 min) | Bridge already waits 20 min ([bridge.ts:321](Cashly_Source_Code/src/bridge.ts:321) — Decision 2026-04-13_007) |
| Polymarket CLOB downtime | [polymarket.ts:61](Cashly_Source_Code/src/polymarket.ts:61) returns `fallbackMessage`; bet stays `queued`, retry next cycle |
| Gamma API claims win but USDC hasn't arrived | (TODO slice-2) cross-check on-chain balance delta before marking `won`; defer `redeem()` to slice-2 |
| Double-trigger from UI | Advisory lock idempotent within cycle; auto-releases on txn end |
| Over-withdrawal during open bet | `reserved_for_open_bets` subtracted from free balance ([agent-helpers.ts:31](Cashly_Source_Code/src/agent-helpers.ts:31)) |
| Silent drift between counters and chain | `reconcileAgentPnL` every cycle; drift > $0.50 alerts ([agent-helpers.ts:83-92](Cashly_Source_Code/src/agent-helpers.ts:83)) |

---

## Feature flags (gate live behavior)

| Env var | Default | Effect when `true` |
|---|---|---|
| `AGENT_FUNDING_OBSERVE_ONLY` | `true` | Funding sweep logs intent, marks rows `skipped_observe_only`; NO on-chain tx. Flip to `false` when reverse CCTP ships. |
| `AGENT_CLOB_TRADES_ENABLED` | `false` | Alpha bot cycle scans and places live CLOB trades. When `false`, bets still queue via POST but stay `queued`. |

---

## Gate-check before flipping flags (Monday)

Before `AGENT_FUNDING_OBSERVE_ONLY=false`:
- [ ] Migration 021 applied on VPS
- [ ] Reverse CCTP Base→Polygon function shipped (`cctpBurnAndMintReverse` or parameterized dest)
- [ ] Deployer wallet has Base gas (~0.005 ETH)
- [ ] User vault balance verified ≥ funding amount

Before `AGENT_CLOB_TRADES_ENABLED=true`:
- [ ] `@polymarket/clob-client` installed on VPS
- [ ] Agent wallet funded with USDC on Polygon (via above)
- [ ] Agent wallet has MATIC for gas (~0.5 MATIC reserve)
- [ ] USDC approval set for Polymarket exchange contract
- [ ] Run tier-B2 sweep test (manual $3 transfer → observe CCTP success)

Both checklists should eventually be automated via a `/gate-check` skill.

---

## Test coverage (Tier A, green on commit)

- **A1** `calculatePnL` — 9 case matrix + invalid-input rejection
- **A2** `calculateReservedForOpenBets` + `calculateFreeBalance` — sum correctness, string NUMERIC handling, non-negative guard
- **A3** Agent + bet state machine — 11 transition cases each (valid + invalid)
- **A5** `shouldEnqueueCardSettlement` — 9 prefix permutations
- **A6** `computeExpectedAgentBalance` + `shouldAlertDrift` + `shouldSweepProfits` — 12 cases across reconciliation logic

Total: **55 tests, ~10ms runtime, 100% on Tier A critical-money logic**.

Gated by: `tsconfig.backend.json` typecheck + `vitest run` via [.github/workflows/backend-ci.yml](Cashly_Source_Code/.github/workflows/backend-ci.yml) + [.husky/pre-push](Cashly_Source_Code/.husky/pre-push).

---

*Related: [[V2 Feature Set & Marathons]] · [[Session 21 Handoff]] · [[Architecture]]*
