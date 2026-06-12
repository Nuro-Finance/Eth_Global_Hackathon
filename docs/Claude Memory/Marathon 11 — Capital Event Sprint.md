# Marathon 11 — Capital Event Sprint (9 days, May 6 → May 14)

> Created: 2026-05-06 (S35 morning) after Richard returned from a week
> away. The market validated the agentic-finance category in his
> absence: Mastercard launched Agent Pay, Moonpay shipped a public
> skills library, Plaid stepped up developer outreach. Same week.
>
> **Mission**: Stop building agents. Become the financial operating
> system for *anyone's* agents. 9-day sprint to refocus the narrative,
> ship the distribution surface, prove the orchestration moat, and
> walk into the May 14 capital event with an end-to-end demo that
> says "Mastercard validated our thesis on Tuesday — here's the
> implementation, six months ahead of any competitor."
>
> **17 companies presenting. Uber + lvlup ventures + others.** This
> marathon is funding-critical. Every cut is justified, every ship
> is intentional.

---

## The strategic refocus (not a pivot)

**Old framing:** "We built AFI agents."

**New framing:** "Nuro is the financial control plane for autonomous AI agents. Every other agent platform — yours, ours, Coinbase's, Anthropic's, Mastercard's — needs us to actually transact safely. Connect any agent. Assign a card. Set the policy. Watch performance."

This is the same shift Stripe made (don't compete with merchants, make payments invisible) and Plaid made (don't be a bank, be the bank API). We don't compete with agent-builders; we provide the financial body.

The code we've shipped becomes MORE valuable in this framing, not less:
- `agent_budgets` per-agent caps + rollover ← the policy plane
- `agent_reputation` tier-driven risk multipliers ← the trust layer
- `huginn.counsel()` advisory verdicts ← the "should I?" gate
- `enforceTxCap()` HEIM-105 platform cap ← the safety net
- M1-M7 sandbox harness ← test before live (nobody else has this)
- x402 client + facilitator ← agent-to-agent micropayment rails
- 23-chain bridge + Visa card off-ramp ← the omnichain settlement layer

Mastercard has rails but no policy plane. Moonpay has skill distribution but no card off-ramp. **We have both. The moat is the combination, not any single component.**

---

## 9-day plan

### Day 1 — May 6 (TODAY) — Sharpen + show

- [x] **Public contracts page + admin sub-tab** (~45 min) — proof of existence at `app.nuro.finance/contracts.html` + admin Contracts tab. Sets the tone: "we ship public surfaces."
- [ ] **Marathon 11 doc + Pending Tasks update** (~30 min) — this file. Single source of truth for the 9 days.
- [ ] **Skill library landing at `/skills`** (~3-4 hr) — Moonpay-pattern. Shipping skeleton + first endpoint (Claude-skill markdown for `/heimdall/threat-intel`). Visible proof we're agent-ready.

### Day 2 — May 7 — Make the infra story honest (Supabase + Tier 1)

The current "single VPS collapses at 102 users" architecture is an investor red flag. Pre-pitch we migrate to managed Postgres + lock in Tier 1 scaling mitigations from the [[Scaling Roadmap]]. After this day, the pitch can honestly say "managed multi-AZ Postgres, Redis cache layer, indexed event tables — designed for 1K DAU today, scales linearly with the Tier 2 roadmap."

- [ ] **Supabase migration** (~½ day, $25/mo Pro plan)
    - Create Supabase project (US-East to minimize VPS→DB latency)
    - Apply all 44 migrations sequentially via `supabase db push` or direct psql
    - `pg_dump` from VPS Postgres → `pg_restore` to Supabase (preserve user data, agents, heimdall_events)
    - Update VPS `.env`: `DATABASE_URL` → Supabase pooled connection (port 6543, transaction-mode PgBouncer baked in)
    - Update BE `pg.Pool` config for SSL + connection-string-based init
    - Restart middleware, smoke test admin console + agent-wallet
    - **Keep VPS Postgres alive 7 days as fallback** before decommissioning
- [ ] **Tier 1 scaling mitigations** (~½ day) — locks in the 1K DAU story
    - `pg.Pool` config bump (Supabase pooler handles pool exhaustion automatically)
    - Redis cache layer (Upstash free tier) — agent_budgets, agent_reputation, card balance, notification snapshot, 60s TTL
    - `heimdall_events (occurred_at, agent_id, severity)` composite index
    - `notifications(user_id, is_dismissed, created_at DESC)` index
    - `logrotate` daily cron, 7-day retention
    - `/notifications` cursor pagination at LIMIT 50
- [ ] **Update Architecture diagrams** to reflect Supabase + Redis (Tier 1 → live, not aspirational)

### Day 3 — May 8 — Distribution layer

- [ ] **One-line CLI install** (~1 day) — `npx @nuro/agent init`
    - Prompts for Nuro API key
    - Generates HD-derived agent vault address
    - Drops `nuro.config.json` with risk_limit, daily_cap, allowed_markets
    - Prints "your agent can now spend up to $X via card or x402, with budget cap and counsel"
    - Same UX magic as `npx create-next-app`
    - npm package published to `@nuro/agent` (or `@nurofinance/agent-cli`)
- [ ] **Skill library — fill out** — markdowns for `/heimdall/threat-intel`, `/huginn/counsel`, `/markets/resolved`, `/sandbox/spawn`
    - Per endpoint: curl example, Claude-skill .md, OpenAI tool-spec JSON, LangChain wrapper Python snippet
    - Payment flow explainer (x402 mechanics, where the USDC goes)
    - Pricing matrix

### Day 4 — May 9 — The moat (external agent connector pt 1)

- [ ] **External agent connector — backend** (~1 day)
    - New endpoint `POST /api/connectors/agent` — registers an external agent (webhook URL or API key) with the user's account
    - `connected_agents` table — agent_id (their identifier), connector_type, webhook_url, encrypted_credentials, user_id, risk_limit, daily_cap
    - When the external agent attempts a spend, hit our wrapper `POST /api/connectors/:id/spend` → runs full enforceTxCap + huginn.counsel + recordSpend → forwards to the agent's webhook with verdict
    - Their agent keeps its brain. We provide the financial body.
- [ ] **Per-connector heimdall events** — events tagged with `connected_agent_id` so the user's Detail panel shows their external agents the same way it shows native ones

### Day 5 — May 10 — External agent connector pt 2 + Plaid scaffold

- [ ] **External agent connector — frontend** (~½ day)
    - New page `/dashboard/connectors` — list connected agents, "Add connector" button, per-agent risk slider + daily cap
    - Use existing AgentCard 5-tab pattern (Detail panel) for each connector
    - Card auto-sweep configurable per connector (route their profits to user's Visa)
- [ ] **Plaid scaffold** (~½ day) — read-only OAuth
    - `/api/plaid/link-token` endpoint
    - `/api/plaid/exchange` endpoint
    - "Connect bank" button on `/dashboard/wallet-1` and on the new `/dashboard/connectors`
    - Surface bank balance + last-4 of account number
    - Full transfers (on-ramp deposit) deferred to post-pitch — for the demo, "your bank is connected, and tomorrow we'll route real USD into your card from here" is enough story

### 🟡 Funding-gated parallel track: LZ Bridge Activation (before May 14)

Tonight (2026-05-10) we proved the full wire works in dry-run. Toolchain
solved (Node 18 + isolated env), DVN verification GREEN, 3 prod-config
bugs caught and patched, 36 ops queued.

**Blocker**: deployer wallet `0x27FbEAD2B527AaDAf4EA7B3Af065244A3964ECBC`
needs gas top-up on 3 chains (~$30 total — Arbitrum/zkSync/BSC).
Chris funding pending.

**Post-funding sequence (~30 min execution)**:
1. Re-run `check-deployer-balances.js` to confirm all 6 chains green
2. Real wire (drop `--dry-run`) — submits 36 txs across 6 chains
3. Fund Arbitrum hub adapter reserve with ~$2k USDC
4. $1 smoke-test BSC → Arbitrum → Base
5. Flip `LZ_BRIDGE_ENABLED=true` + re-enable `LZ_MONITOR` on VPS
6. Re-enable BSC/zkSync/Scroll/Celo/Gnosis in FE chain picker

All work captured in `docs/runbooks/lz-bridge-activation.md` +
`docs/runbooks/lz-dry-run-output-v2-2026-05-10.txt` + `C:\Users\Richa\AFI\lz-wire\`
isolated env. Resumable in any future session.

### Day 6 — May 11 — Polish + buffer (probably hits Day 7)

- [ ] **Demo flow E2E test** on prod (Supabase) — every step Richard will click on stage
    - Connect a test external agent
    - Set risk + daily cap
    - Use the CLI to bootstrap a sample agent
    - Watch agent execute a sandbox-bound action
    - See performance aggregate in Detail panel
    - Settle profits to card, see in-flight sweep visualization
    - Plaid bank connect (read-only)
- [ ] **Edge case handling** — what if the agent throws? What if the network blips? What if the user clicks the wrong button? Each becomes a demo-killer if not handled.

### Day 7 — May 12 — Pitch deck refinement

- [ ] **Slide 1: hero claim** — "Financial control plane for autonomous AI agents"
- [ ] **Slide 2: market validation** — Mastercard Agent Pay launched April 2025. Moonpay shipping skill libraries. Plaid courting devs. Category exists.
- [ ] **Slide 3: what we are** — control plane diagram. Heimdall + Huginn + reputation + card + x402 + 23 chains.
- [ ] **Slide 4: moat** — Mastercard has rails not policy. Moonpay has distribution not card. We have both, six months ahead.
- [ ] **Slide 5: revenue path** — x402 endpoints already live ($0.001-$0.10 per call), card-fee economics, agent-to-agent labor market
- [ ] **Slide 6: 9-day proof** — Live demo: external agent + risk control + sandbox test + card settle + Plaid on-ramp
- [ ] **Slide 7: scaling readiness** — Tier 1 → Tier 2 → Tier 3 (the [[Scaling Roadmap]] page). Today on Tier 1 (Supabase), 6-week path to Tier 2 (10K DAU)
- [ ] **Slide 8: ask** — what we want from this round + what we'll build with it

### Day 8 — May 13 — Final polish

- [ ] **Pitch rehearsal** — Richard runs the deck end-to-end + demo
- [ ] **Live demo dry run #1** — full flow on prod, every click, time it
- [ ] **Bug-bash** — anything that surfaces in rehearsal gets a fix-or-cut decision
- [ ] **Backup demo recording** — if live demo crashes during the pitch, the recording is the fallback

### Day 9 — May 14 — PITCH DAY

- [ ] **Morning** — final smoke test on prod
- [ ] **Pitch event** — present
- [ ] **Aftercare** — capture every question + concern raised, file as Marathon 12 input

---

## What's CUT (non-negotiable)

To make 9 days work, we explicitly cut:

- **Marathon 9 B-tier** (sandbox toggle, vault drill-down, HL deposit, position close) — agent control plane is already strong enough; B-tier is depth, not breadth, and depth doesn't change the pitch.
- **Marathon 10 Treasury Automation** — still right, doesn't ship in this window. Pre-funding work; can begin after pitch lands the capital.
- **Etherscan source-code verification** — low investor signal vs. effort. Defer.
- **Daily fee-vault digest** — operational nice-to-have; doesn't move the pitch.
- **Consumer features** — dress-picker, daily-spender, autonomous shopping. These are downstream product surface; investors don't need to see them. Pitch is rails, not retail.
- **Per-bet agent attribution propagation (A3 deeper fix)** — current dual-key fallback is fine for the demo.
- **MyOFTAdapter to remaining chains** (Mode, Mantle) — 7 chains is enough for "omnichain" claim.

---

## Honest read on competition (informs the pitch)

| Competitor | Their move | Our defensible position |
|------------|-----------|------------------------|
| **Mastercard** (Agent Pay, April 2025) | Token Authentication Framework, partnered Microsoft + Anthropic | Crypto-native + cross-chain + open/non-custodial. They're fiat-only on Agent Pay rails. |
| **Moonpay** (skills library) | Public agent skills, dev-friendly distribution | We have card off-ramp + multi-chain. They're single-chain + on-ramp-focused. |
| **Plaid** (plaid-postman) | Bank rails commoditizing | We integrate them, not compete with them. |
| **Coinbase** (x402) | Crypto micropayments | We're already integrated. Friend, not foe. |

**Reading the field**: Mastercard wins distribution forever. Don't try to out-build them. Out-MOVE them. They ship in quarters; we ship in days. Moonpay is the real near-peer; whoever claims "OS for agents" positioning fastest wins that mindshare.

---

## What success looks like at end of Day 9

1. Investors can hit `app.nuro.finance/skills` and see a Moonpay-quality distribution surface.
2. Investors can run `npx @nuro/agent init` on their laptop and watch a working agent vault appear.
3. Investors can click through `app.nuro.finance/dashboard/connectors` and see external agents being orchestrated by the policy stack.
4. Investors can see `app.nuro.finance/architecture/scaling-roadmap.html` and understand the path from 1K → 100K DAU.
5. Investors can hit `app.nuro.finance/contracts.html` and verify everything we said exists on-chain.
6. Live demo doesn't crash.
7. Pitch deck takes <8 min, demo takes <5 min, Q&A is 100% confident.

---

## Daily check-in protocol

End of each day: 10-min review with Mythos —
- Did we ship what was scheduled?
- What blocked / what surprised?
- Does the pitch claim still feel true?
- What gets cut to keep Day 9 on time?

Discipline > velocity. We can ship 80% of this plan and still win the pitch. We CANNOT ship 100% with bad infra or a broken demo. Cuts are first-order moves, not failures.

---

## Actual day-by-day status (live tracking)

> The day-by-day plan above was the *intent*; this section is the *outcome*. Updated at end of each day's encode. Variance commentary explains why we deviated — both wins and slippage. Linked Day-N close docs are the canonical source for what shipped.

### Day 1 — May 5 ✅ DONE (variance: significantly over-shipped)
**Planned**: contracts page, Marathon 11 doc, skill library landing.
**Actually shipped** (commit `0f47348`):
- ✅ Public contracts page + admin sub-tab
- ✅ Marathon 11 doc + Pending Tasks update
- ✅ Skill library landing at `/skills` with 4 interactive demo tabs, competitive comparison, 4 pillars, install CTA
- ✅ **Bonus** — Supabase migration LIVE (169K rows, Pro tier, IPv4 add-on, 5 composite indexes deployed). This was Day-2 work pulled forward.
- ✅ **Bonus** — `npx @nuro/agent init` one-line CLI install scaffolded. Day-3 work pulled forward.
- ✅ logrotate setup script committed
- ✅ YIELD sidebar hidden + neural-dashboard pass-1 fix
**Why over-shipped**: Richard returned with full energy from a week away. Capacity exceeded estimate.

### Day 2 — May 6 ✅ DONE (variance: at-plan, narrative pivot mid-day)
**Planned**: Tier 1 scaling mitigations.
**Actually shipped** (7 commits):
- ✅ Tier-1 Redis cache layer — `src/cache.ts` (in-memory + Upstash optional), wraps `getBudgetSnapshot`, write-side invalidation, 11 tests, `/health/cache` diag endpoint
- ✅ External agent connector backend + frontend — migration 045 + `src/connectors.ts` + 7 endpoints + `/dashboard/connectors` page + 12 tests
- ✅ SD3 transaction-sync incident response — migration 046 v2 (drop partial, recreate non-partial unique index) + defensive `WHERE issuer_transaction_id IS NOT NULL` on ON CONFLICT. Latent migration-016 inference bug closed.
- ✅ Public-link sanitization — stripped `RichardTheBruce/Cashly` references from public surfaces
- ✅ Neural-dashboard 4-pass debug saga — pass 4 found the actual bug (`d.query.slice` unguarded); reusable `unhandledrejection` + step-badge + try/catch diagnostic pattern
- ✅ Decision Journal entry `2026-05-06_001.md` — 4 decisions, DJ 2 load-bearing
**Variance**: External connector pulled forward from Day 4 (capacity available); Day-3 Plaid scaffold pushed to Day 3 evening. Test count 119/119 maintained.

### Day 3 — May 7 ✅ DONE (variance: shipped enormous, narrative pivot to Norse pantheon)
**Planned**: One-line CLI publish + skill library fill-out.
**Actually shipped** (14 commits):
- ✅ Plaid scaffold complete (`0cc2c4a`) — migration 047 `plaid_accounts`, 5 endpoints, `/dashboard/banks` page with Plaid Link CDN, sidebar nav entry
- ✅ Tier-1 dashboard hardening (`f381099`) — 3rd-pass diagnostic instrumentation on `unified-dashboard.html` + `sub-agents-dashboard.html`
- ✅ LZ-monitor noise silenced (`4affd06`) — per-chain log rate-limiter, 1500 lines/day → ~0
- ✅ Upstash Redis LIVE on production (`trusting-goblin-115377.upstash.io`)
- ✅ **Design system research + refactor** (`01e1ddf`) — Founder pushed back on /skills as "amateur"; design-research subagent surveyed Stripe / Linear / Vercel / Anthropic / Resend / Coinbase Developer; built `/public/styles/graphite.css` (monochrome-first, single-accent, hairline-defined, dark-primary, Geist Sans + Geist Mono, Lucide at 1.5px). Rebuilt `/agents`, `/skills` from scratch using new system. Founder reaction: "🔥🔥🔥 THE DESIGN LANDED."
- ✅ Routing fixes (`ab00d3f`) — `/contracts` rewrite + `/styles/*` middleware exclusion + `scripts/deploy-fe.sh` auto-detect build-needed
- ✅ **Narrative pivot — neo-bank framing** (`cfb96ce`) — "we ARE the neo-bank, the human is the co-pilot, agents work for you and deposit back". Norse pantheon locked: Yggdrasil / Bifröst / Heimdall / Huginn / Muninn / Allfather.
- ✅ npm CLI published (`@nuro-finance/cli@0.1.0` + `0.1.1` em-dash hotfix) — verified Windows + sandbox installs
- ✅ 4 dashboard page redesigns (Connectors / Banks / Vault / Agent Wallet) per a research-driven design pass
- ✅ 89+ em-dashes purged site-wide
- ✅ Decision Journal entry `2026-05-07_001.md` — 5 decisions, DJ 1 (build real CLI vs cosmetic) load-bearing
**Variance**: Design-system rebuild was unplanned but founder-flagged. The "amateur" pushback on /skills directly produced the `design-pass` skill formalizing the four-phase research → audit → spec → implement process so we don't vibe-code design again.

### Day 4 — May 8 ✅ DONE (variance: at-plan-ish, demo-killer sweep + SD3 reveal protocol)
**Planned**: External agent connector pt 1 (already shipped Day 2). Implicitly: dashboard polish round 1.
**Actually shipped** (18 commits):
- ✅ NUR-23 logout confirmation modal (`08d530f`) — shared `useLogoutWithConfirm()`, 3 trigger sites, dialog-as-sibling pattern
- ✅ NUR-26 tx-sync varchar(50) overflow / 14h blind spot (`48b35bd` + migration 048) — recovered 22 stranded rows
- ✅ My-wallet $128K mock-fallback removed (`ccc433a`) — empty wallet now renders empty
- ✅ Card balance dedupe ($4.94 → $1.65) (`609f782`) — 2 layers of phantom protection (BE sync + FE sum)
- ✅ NUR-26 payment events as income (`95949be`) — recovered 30 income rows, $248.20 total
- ✅ NUR-26 SD3 metadata mapper (`b755636`) — real masked PAN + MM/YY render
- ✅ NUR-26 **SD3 RSA-OAEP card-secrets reveal flow** (`69dbe9d` + `6fb3a2f` + `433f6d9`) — **THE BIG ONE.** End-to-end CVV reveal verified on Richard's real card. Skill `sd3-card-secrets` permanently encodes the protocol. Two protocol traps captured as lessons (DJ 4 of 2026-05-08).
- ✅ Identity swap to demo@nuro.finance / Chris Brignola — DB-only. KYC banners + CardDetails inline gate all clear.
- ✅ Landing-page → login redirect (`dc09af4`) — server-side redirect, no flash
- ✅ Cash flow chart Y-axis derived from data (`7f99763`) — replaced hardcoded $6K ceiling with `niceCeil()` data-fitted scale
- ✅ Google OAuth restored via NextAuth (`c56a462`) — bypassed Privy for OAuth (Privy stays wallet-connect path); fixed `NEXTAUTH_URL` from localhost to prod
- ✅ Telegram social login dropped (`a0b01ae`) — never wired, removed cleanly
- ✅ **Encode skill expanded** — 4 steps → 16 steps + explicit failure modes + full close report template; design-pass enforcement codified into System Rules
- ✅ Decision Journal entry `2026-05-08_001.md` — 6 decisions, DJ 2 (CVV-storage push-back) load-bearing
- ✅ Day-4 close doc + Linear sync (NUR-26 + NUR-21 → Done; NUR-52 + NUR-53 filed as followups)
**Variance**: Dashboard polish was much heavier than "round 1" — Richard walked through and identified 12 demo-killer surfaces, all fixed. SD3 reveal protocol was the surprise unlock — not in the original plan, became possible mid-day after Owen confirmed the issuer-facing endpoint exists.

### Day 5 — May 9 ✅ DONE (variance: pure demo-polish iteration, no new features)
**Planned**: CVV on Overview deck (~30 min), live chat window, NUR-18 OTP, NUR-17 auth E2E test.
**Actually shipped** (16 commits):
- ✅ Login background — Chris's WebGL ASCII matrix-fog (`a1a77df`)
- ✅ BYOK 3-provider streaming chat (`063ff13` + `dd5cf92` + `71eedb1`) — `/api/assistant/verify-key` + multi-provider `/api/chat` + abort-controller stop button + 3 brand SVGs
- ✅ Card-controls GET/PATCH normalization (`7cbafb8`) — both `per_tx_limit` and `per_transaction_limit` now exposed
- ✅ Swap quick-pick onError fallbacks (`2a86782`) — buy-side pills + selected-asset chip resilient to SVG load failures
- ✅ Sell-token picker — full catalog + brand SVGs (`44e13ba`) — opens regardless of portfolio state, real `iconSrcForSymbol` icons with onError fallback, BNB added to icon map
- ✅ **Spend-threshold actually fires alerts** (`c00f953`) — two-layer fix: (1) PATCH `/cards/:id` upserts to `card_controls` (was silent UPDATE no-op when controls row didn't exist); (2) SD3 sync path in `upsertCardTransaction` checks threshold + inserts `card_alerts` row on breach (was unenforced — only direct POST `/card-transactions` had it)
- ✅ **5-fix demo-killer batch** (`cb20bc7`) — Overview deck eye-icon reveals full PAN+CVV+MM/YY (Day-4's CVV-on-Overview promise delivered as part of broader sweep); skeleton/opacity gates remove default-noir flash on first paint; `/agent-cards` KYC gate fixed by passing `cardId` prop; swap sell-picker shows full token catalog when portfolio empty (let wallet handle insufficient funds); CardDetails Show/Hide toggles all three (Number+Date+CVV) together
- ✅ Card-secrets rate limit 5→50/hr + 429 surfacing (`21d8ae0`) — fix the silent failure that made earlier reveals look broken on iteration
- ✅ Theme label "Graphite" → "Dark" (`858787a` + `1c85ea1`) — UI label flip while keeping `.graphite` class for design-pass
- ✅ Duplicate close-X removed from Send/Receive modals (`1c85ea1`)
- ✅ **My Card lag eliminated via stale-while-revalidate** (`5fa6b90`) — new `nuro:myCard1:snapshot` localStorage key; useState initializers paint instantly with last-known values; `/api/cards` runs in background. Pattern slated for Overview deck Day-6.
- ✅ **Reload step-1 one-click wallet-send restored** (`5fa6b90`) — was reduced to `onNext()`/QR flow; now renders `WalletDepositButton` on EVM stables/natives. Wagmi config bumped 4→7 chains (Optimism/Avalanche/BSC); BSC's 18-decimal Binance-Peg USDC handled via `getChainDecimals`.
- ✅ Sidebar name flicker root-caused (`f72d1a1`) — two-writer race on `localStorage.user` between PrivyAuthSync's "Nuro User" fallback and BackendUserSync's correction. Fixed by mirroring corrected user back to localStorage in BackendUserSync.
- ✅ Wallet portfolio expanded 4→7 chains (`f72d1a1`) — Optimism + Avalanche + BSC added to backend Alchemy host map + `DEFAULT_CHAINS` + `CHAIN_META`. Plus native pricing fix (`862ad5c`) — `GLOBAL_NATIVE_IDS` extended to `avalanche-2` + `binancecoin` (was hardcoded ETH/MATIC).
- ✅ Privy embedded-wallet preference fix (`2ce3f19`) — `usePrivyWalletAddress` prefers `connectorType !== "embedded"` so external wallets (MetaMask/Rabby/Coinbase) win over auto-created Privy embedded.
- ✅ **Resend email scaffold + activation** (`2ce3f19`) — new `src/email.ts` gated on `RESEND_API_KEY`; `sendThresholdAlertEmail` wired into `issuer-sync.ts` high-value branch with execution_log audit. Richard signed up at resend.com mid-session, key set on VPS, smoke-test email delivered (Resend message id `023addcb-83c6-4f64-a951-b572a5f158e8`). Domain verification for `nuro.finance` in flight.
- ✅ Decision Journal entry `2026-05-09_001.md` — 5 decisions; DJ 2 (stale-while-revalidate vs UI gate) and DJ 3 (two-writer cache race) are durable patterns to compound.
- ✅ Day-5 close doc

**Variance**: Day-4 had set Day-5 priorities as CVV-on-Overview / live-chat / OTP. CVV-on-Overview shipped as part of `cb20bc7`. Live-chat + OTP slipped to Day-6 — Richard's app-walkthrough surfaced 16 demo-killers that took precedence. Net: original Day-5 plan was 4 items; we shipped 16 commits but only 1 of the planned 4. The polish work was higher-value than the planned items would have been; no concern about velocity.

### Day 6 — May 10 (NEXT)
**Carryover from Day 5 + new priorities** — see `Pending Tasks.md` Day 6 section. Headline items:
- Resend domain verification follow-through (flip `EMAIL_FROM=alerts@nuro.finance` once verified)
- Apply stale-while-revalidate pattern to Overview deck card
- External-wallet preference for SidebarProfile address
- Live chat window (carryover from Day-5 plan)
- NUR-18 OTP (carryover)
- NUR-17 auth E2E test (carryover)
- Skill library polish (carryover)

### Days 7–9
**Unchanged from original plan above.** Day 7 pitch deck refinement, Day 8 final polish + rehearsal, Day 9 PITCH.

---

*Related: [[Pending Tasks]] · [[Scaling Roadmap]] · [[Marathon 9 — Agent Control Plane FE]] · [[Marathon 10 — Treasury Automation]] · [[AFI Vision]] · [[5-6-2026 (Marathon 11 Day-2)]] · [[5-7-2026 (Marathon 11 Day-3)]] · [[5-8-2026 (Marathon 11 Day-4)]] · [[5-9-2026 (Marathon 11 Day-5)]] · [[2026-05-06_001]] · [[2026-05-07_001]] · [[2026-05-08_001]] · [[2026-05-09_001]]*
