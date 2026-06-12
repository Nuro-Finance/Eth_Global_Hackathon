# ✅ Pending Tasks — AFI (Agentic Finance Intelligence)
> Updated: 2026-05-09 (S35 Day-5 close — **DEMO POLISH ITERATION**. 16 source commits, zero migrations. Day-5 was almost entirely demo-killer hunting with Richard walking through the app and reporting bugs. Highlights: WebGL ASCII matrix login bg, full BYOK 3-provider streaming chat, sell-token picker now opens with full catalog + brand SVGs (was a dead button when empty), spend-threshold persistence + alert enforcement on the SD3 sync path (was unenforced), MyCard1 stale-while-revalidate localStorage cache (paints instantly, no flash of default), Reload step-1 one-click wallet-send restored (was advancing to QR step manually), wagmi config 4→7 chains (BSC/AVAX/OP), wallet portfolio queries 7 chains + AVAX/BNB native pricing fixed, sidebar name flicker root-caused (two-writer race on localStorage.user) + fixed, Privy embedded-wallet preference fix (always show user's external wallet), Resend email scaffold + activation (smoke-test delivered, domain verification in flight), card-secrets rate-limit 5→50/hr + 429 surfacing pattern. T-5 days to capital event May 14. **Chris handling pitch deck.** Day-6 priorities: Resend domain follow-through, Overview deck stale-while-revalidate, SidebarProfile wallet preference. See `docs/What We Did Today/5-9-2026 (Marathon 11 Day-5).md` and `Decision Journal/2026-05-09_001.md`.)
> **PREVIOUS**: 2026-05-08 (S35 Day-4 close — **DEMO-KILLER SWEEP + SD3 PCI-GRADE CARD-REVEAL SHIPPED**. 18 source commits + 1 migration + identity swap + Privy/Google auth restored. Today removed every demo-killer Richard found walking through the app: logout-confirm modal, varchar(50) tx-sync overflow (14h blind spot), $128K mock-fallback on /my-wallet, $4.94 lying card balance, payment-events-as-income (recovered $248), card metadata real last4+expiry, **full SD3 RSA-OAEP + AES-128-GCM CVV reveal end-to-end working** (skill encoded as `sd3-card-secrets`), identity swap (Richard→Chris/demo@nuro.finance), landing→login redirect, cash-flow chart Y-axis derived from data, Google OAuth restored via NextAuth.)
> **PREVIOUS**: 2026-05-07 (S35 Day-3 close — **Marathon 11 Day-3 SHIPPED ENORMOUS**. 14 commits today: Plaid + Upstash + LZ-monitor noise + 3rd-pass dashboard hardening + design system refactor (Chris/Graphite + Lucide + Geist) + neo-bank narrative pivot + Norse pantheon (Yggdrasil/Bifröst/Heimdall/Huginn/Muninn/Allfather) + /agents repositioning + LayerZero+CCTP messaging + npm scripts + 'watch autonomous action happen' unified CTA + 4 skill detail pages + scripts/deploy-fe.sh.)
> **PREVIOUS**: 2026-05-06 (S35 Day-2 close — 7 commits, cache layer, external connector, SD3 incident triage, GitHub link sanitization, neural-dashboard 4-pass debug saga, Decision Journal entry. Test count 119/119.)
> **PREVIOUS**: 2026-05-06 morning (S35 Day-1 morning — Marathon 11 ACTIVE. Day 1 contracts.html committed `0f47348`.)
> **PREVIOUS**: 2026-04-27 ~00:30 (Session 34 close — 10 commits, 2 migrations, BE→FE gap closure, Tier A 5-tab Agent Detail panel + Sprint 9.2 + 9.3, Marathon 9+10 docs, Scaling Roadmap, architecture card 13.)
> **PREVIOUS**: 2026-04-26 ~19:30 (Session 33 close — 30 commits, 2 migrations, x402 Phase 1+2 + entire Tier 0 + entire Tier 1 + X4 agent-bus pricing + X5 Phase 1 facilitator routing + brain visualization marathon failure + admin onclick escape emergency fix.)
> **EARLIER**: 2026-04-26 ~01:30 (Session 32 close — 9 commits, 2 migrations, HL audit + S32 batch + sandbox build + balance-spoof P0 closure.)
> **PRINCIPLE**: Intent Layer records intent. Execution Layer moves real money. Heimdall sees both. Huginn counsels before the action. Reputation accrues from outcomes. **Audit passes are a defense surface complementary to Heimdall — wire findings via `logCriticalFinding()`.**
> **MASTER BUILD PLAN**: `Neural Net/Claude Memory/V2 Feature Set & Marathons.md`
> **VISION**: `Neural Net/Claude Memory/AFI Vision.md`
> **CARD API**: `Cashly_Source_Code/docs/Claude Memory/SD3 Card API/`
> **LATEST SESSION DOCS**: [[Session 34 Recap]] · [[Session 35 Handoff]] · [[5-7-2026 (Marathon 11 Day-3)]] · [[5-8-2026 (Marathon 11 Day-4)]] · [[5-9-2026 (Marathon 11 Day-5)]] · [[2026-05-09_001]]
> **🔴 ACTIVE MARATHON**: [[Marathon 11 — Capital Event Sprint]] (May 6 → May 14, 9 days, pitch-critical)
> **PARKED MARATHONS**: [[Marathon 9 — Agent Control Plane FE]] · [[Marathon 10 — Treasury Automation]] · [[Scaling Roadmap]]
> **POLICY DOCS**: [[Memecoin Allowlist Policy]] · [[Swap Risk Policy]] · [[Hyperliquid Audit Rubric]]
> **CORVUS**: [[Marathon 8 — Corvus]] · [[Heimdall — Rule Catalog]] · [[Heimdall — State of the Watchman]] · [[Heimdall — Eval Cases]]
> **AUDITS**: [[../Audits/2026-04-25_functionality-audit]] (S32 — full-stack)
> **DESIGN DOCS**: [[Sandbox Design]] (v2 sign-off-locked S32)

---

## 🔴 Marathon 11 — Capital Event Sprint (May 6 → May 14, ACTIVE)

> **Pitch-critical 9-day sprint.** See **[[Marathon 11 — Capital Event Sprint]]** for full plan. Marathon 9 B-tier + Marathon 10 Treasury Automation are PARKED until post-pitch.

### Day 1 — May 5 ✅ DONE
- [x] **Public contracts page + admin sub-tab** — `0f47348`
- [x] **Marathon 11 doc + Pending Tasks update**
- [x] **Skill library landing at `/skills`** — Moonpay-pattern, 4 interactive demo tabs, competitive comparison, 4 pillars, install CTA
- [x] **Supabase migration LIVE** — 169K rows, Pro tier, IPv4 add-on enabled, 5 composite indexes deployed
- [x] **YIELD sidebar hidden** + neural-dashboard pass-1 fix
- [x] **One-line CLI install** — `npx @nuro/agent init`, zero deps, Stripe-style API key UX
- [x] **logrotate setup script** committed (`scripts/setup-logrotate.sh`) — awaiting VPS run

### Day 2 — May 6 ✅ DONE (this session)
- [x] **Tier-1 Redis cache layer** — `src/cache.ts` (in-memory + Upstash optional), wraps `getBudgetSnapshot`, write-side invalidation, 11 tests, `/health/cache` diag
- [x] **External agent connector — BE + FE** — migration 045 + `src/connectors.ts` + 7 endpoints + `/dashboard/connectors` page + 12 tests
- [x] **SD3 transaction sync incident response** — migration 046 v2 (drop partial, recreate non-partial unique index) + defensive `WHERE issuer_transaction_id IS NOT NULL` on ON CONFLICT. Latent migration-016 inference bug closed.
- [x] **Public-link sanitization** — stripped all `RichardTheBruce/Cashly` references from public surfaces
- [x] **Neural-dashboard 4-pass debug saga** — pass 4 found the actual bug (`d.query.slice` unguarded). Working artifact. Diagnostic pattern (window.error + unhandledrejection + step badge + try/catch) reusable.
- [x] **Decision Journal entry** — `2026-05-06_001.md`, 4 decisions, DJ 2 load-bearing

### Day 3 — May 7 (NEXT — start here tomorrow)
- [ ] **Plaid scaffold** (~3h) — read-only OAuth, Connect Bank button on `/dashboard`, balance display. Full transfers deferred post-pitch.
- [ ] **Apply 3rd-pass diagnostic instrumentation to unified + sub-agents dashboards** (~1h) — same pattern that saved neural-dashboard. Defense against demo-time crashes.
- [ ] **VPS ops batch** (~30 min) — run `bash scripts/setup-logrotate.sh` as root; optionally hook up Upstash Redis.
- [ ] **VPS SSH key auth setup** (~2 min) — prevent recurrence of today's password-rotation lockout.
- [ ] **LZ-monitor noise triage** (~30 min) — `[lz-monitor] spoke ... read failed` for zkSync/Scroll/Celo/Gnosis/BSC every 5 min. Pre-existing, not blocking, but visually noisy.

### Day 4 — May 8 ✅ DONE
- [x] **NUR-23 logout confirmation modal** — `08d530f`. Shared `useLogoutWithConfirm()` primitive, 3 trigger sites (sidebar button, sidebar profile menu, header dropdown). Dialog as sibling so it survives dropdown unmount.
- [x] **NUR-26 tx-sync varchar(50) overflow / 14h blind spot** — `48b35bd` + migration 048. Widened `merchant_category_raw` 50→255 + `merchant_name` 200→255. Defensive truncation in `mapSd3SpendToCardTx`. After re-sync: 22 rows recovered (CAFE WEST, AMAZON MKTPLACE, EASTON DELI, etc.).
- [x] **My-wallet $128K mock-fallback removed** — `ccc433a`. `TopAssetCardsStrip` now trusts live portfolio once status resolves to success/error; demo cards only used during loading.
- [x] **Card balance dedupe ($4.94 → $1.65)** — `609f782`. Two layers: BE skips phantom (`issuer_card_id IS NULL`) cards in sync; FE filters total to issuer-linked via new `isIssuerLinked` flag. Phantoms restored to seed values via one-shot SQL.
- [x] **NUR-26 payment events as income** — `95949be`. SD3 `payment` events (USDC bridge top-ups, no `cardId` in payload) were being skipped. Now fall back to user's primary issuer-linked card. `is_incoming = true` set on payment-type rows. After re-sync: 30 income rows inserted, $248.20 total.
- [x] **NUR-26 SD3 metadata mapper** — `b755636`. `getIssuerCardNumber` now reads `last4`, `expirationMonth`, `expirationYear` (the actual fields the metadata endpoint returns) — was reading non-existent `cardNumber`/`expiryDate`/`cvv`. Real masked PAN + MM/YY render.
- [x] **NUR-26 SD3 RSA-OAEP card-secrets reveal flow** — `69dbe9d` + `6fb3a2f` + `433f6d9`. **THE BIG ONE.** End-to-end CVV reveal: random 16-byte secret → base64(raw bytes) → RSA-OAEP/SHA-1 → SessionId header → AES-128-GCM decrypt of `{encryptedPan,encryptedCvc}` response. Verified live on Richard's card (PAN 16 digits ending 0918, CVV 3 digits). Skill `sd3-card-secrets` permanently encodes the protocol.
- [x] **Identity swap to demo@nuro.finance / Chris Brignola** — DB-only. Renamed seeded mock demo user to `demo-archive@nuro.finance` (FK-safe), updated Richard's row email + name + first_name + last_name + kyc_status=approved. KYC banners + CardDetails inline gate all clear; cardholder name on Visa face matches SD3 KYC.
- [x] **Landing page → login redirect** — `dc09af4`. `/[locale]/page.tsx` replaced with server-side `redirect("/[locale]/login")`. No flash of marketing landing.
- [x] **Cash flow chart Y-axis derived from data** — `7f99763`. `niceCeil()` + `formatAxisTick()` + useMemo. Was hardcoded `CHART_MAX = 6000` with mismatched "$2/$4/$6" labels — now scales to actual data with $20 floor.
- [x] **Google OAuth restored via NextAuth** — `c56a462`. Routed Google button to `signIn("google")` (the original April 9 path), bypassing Privy's disabled `google_oauth`. Added `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` to FE `.env.local`. Fixed `NEXTAUTH_URL=http://localhost:2800` → `https://app.nuro.finance` (was causing `redirect_uri_mismatch`).
- [x] **Telegram social login dropped** — `a0b01ae`. Confirmed via git history: never wired (placeholder since `ff65d0f` Apr 9). Removed from `SOCIAL_PROVIDERS`. Single-provider grid layout.

### Day 5 — May 9 ✅ DONE
- [x] **Login background — Chris's WebGL ASCII matrix-fog** — `a1a77df`. Pure WebGL via ogl, 112×56 grid, mouse-follow burst, bottom-fade mask. Direct file swap from Chris's design drop.
- [x] **BYOK streaming chat — full Chris implementation** — `063ff13`, `dd5cf92`, `71eedb1`. New `/api/assistant/verify-key` (3-provider validator with `1234` dev-bypass) + rewrote `/api/chat` for multi-provider streaming (OpenAI, Anthropic, Gemini). FE localStorage key storage. Stop button with abort controller. Three brand-icon SVGs added to `/public`.
- [x] **Card-controls GET/PATCH normalization** — `7cbafb8`. `rowToCardControls` exposes both `per_tx_limit` (FE-canonical) and `per_transaction_limit` (DB-canonical) fields.
- [x] **Swap quick-pick onError fallbacks** — `2a86782`. Buy-side pills + selected-asset chip now have onError → hide → reveal sibling fallback span pattern.
- [x] **Sell-token picker — opens when empty + brand SVGs** — `44e13ba`. Dropped `length > 0` click gate; trigger button avatar now uses real `iconSrcForSymbol(symbol)` SVG with onError fallback. Added `bnb` to icon map.
- [x] **Spend-threshold actually fires alerts** — `c00f953`. Two-layer fix: (1) PATCH `/cards/:id` syncs to `card_controls` via `INSERT … ON CONFLICT (card_id) DO UPDATE` (was silent no-op when controls row didn't exist yet); (2) SD3 sync path in `upsertCardTransaction` now checks `alert_threshold` and inserts `card_alerts` row on breach (was unenforced — the direct `/card-transactions` POST had it but real charges flow through the sync path).
- [x] **5-fix demo-killer batch** — `cb20bc7`. Overview deck eye-icon reveals full PAN+CVV+MM/YY (was masked-only). MyCard1 + Overview deck: skeleton/opacity gates eliminate flash of default noir. `/agent-cards` KYC gate fixed (cardId prop wired to CardDetailsPane). Swap sell-picker shows full token catalog when portfolio is empty (let wallet handle insufficient funds). CardDetails Show/Hide reveals all three (Number+Date+CVV) together, not just CVV.
- [x] **Card-secrets rate limit bump 5→50/hr + 429 surfacing** — `21d8ae0`. Cap was burning through during normal iteration; FE was silently console.warning. Now cap is 50/hr; FE renders inline "Too many reveals — try again in Ns" message on 429 in My Card panel.
- [x] **Theme label "Graphite" → "Dark"** — `858787a` + `1c85ea1`. Dropdown items relabeled; underlying value stays `"graphite"` so design pass keeps applying. DOM still gets `.dark .graphite` class combo.
- [x] **Duplicate close-X removed from Send/Receive modals** — `1c85ea1`. shadcn `DialogContent` already renders X at top-right; manual `<DialogClose>` in title bar dropped. Cleaned up unused imports.
- [x] **My Card lag eliminated via stale-while-revalidate** — `5fa6b90`. New `nuro:myCard1:snapshot` localStorage key holds card snapshot; useState initializers read it synchronously on mount → modal paints instantly with user's real values on every subsequent visit. `/api/cards` runs in background for refresh.
- [x] **Reload step-1 one-click wallet-send restored** — `5fa6b90`. Step-1 button now renders `WalletDepositButton` for EVM stables/natives on supported chains (was advancing to QR step manually). Wagmi config bumped 4→7 chains (added Optimism, Avalanche, BSC). Per-chain USDC addresses + BSC's 18-decimal Binance-Peg via `getChainDecimals`.
- [x] **Sidebar name flicker — root caused + fixed** — `f72d1a1`. `BackendUserSync` now mirrors corrected user back to `localStorage.user` so subsequent `checkAuthStatus` reads return Chris Brignola instead of PrivyAuthSync's "Nuro User <digits>" fallback.
- [x] **Wallet portfolio expanded 4→7 chains + native pricing** — `f72d1a1` + `862ad5c`. `/api/wallet-portfolio` queries Optimism/Avalanche/BSC (was only Ethereum/Base/Arbitrum/Polygon). `GLOBAL_NATIVE_IDS` extended to include `avalanche-2` + `binancecoin` so AVAX/BNB native balances actually price.
- [x] **Privy embedded-wallet preference fix** — `2ce3f19`. `usePrivyWalletAddress` prefers `connectorType !== "embedded"` so users see their MetaMask/Rabby/Coinbase address, not the auto-created Privy embedded one.
- [x] **Resend email scaffold + activation** — `2ce3f19` + VPS env. New `src/email.ts` with gated-on-key pattern; wired into `issuer-sync.ts` high-value alert branch with execution_log audit. Richard signed up at resend.com, key set on VPS, BE restarted with `--update-env`, smoke-test delivered (Resend message id `023addcb-83c6-4f64-a951-b572a5f158e8`). Domain verification for `nuro.finance` in flight; once verified, flip `EMAIL_FROM=alerts@nuro.finance`.

### Day 6 — May 10 (PARTIAL — IN PROGRESS)

**Shipped today**:
- [x] Apply stale-while-revalidate to Overview deck card — `9ff5a04`
- [x] External-wallet preference for SidebarProfile address — `9ff5a04` (ConnectWallet header pill + my-wallet identity strip; SidebarProfile only shows name not address)
- [x] Reload chain picker gated to CCTP-only — `9ff5a04`
- [x] Skill library polish — huginn-counsel / markets-resolved / sandbox-spawn full SDK wrappers — `abb0d5d`
- [x] **LZ bridge wire toolchain SOLVED + dry-run runs end-to-end** (Node 18 + isolated env + 10 distinct toolchain fixes) — see `docs/runbooks/lz-bridge-activation.md`
- [x] **DVN verification GREEN** (16 PASS, 1 acceptable WARN, 0 FAIL) — `scripts/verify-lz-dvns.ts`
- [x] **Caught 3 production-config bugs in LZ libraries** (Scroll/Celo/BSC had wrong sendUln302/receiveUln302/executor addresses; dry-run safety net worked)
- [x] **enforcedOptions added to all 10 connections** (9× EVM 80k + 1× ZKSYNC 100k) — `lz-wire/layerzero.config.hardened.ts`
- [x] **Dry-run v2 clean**: 36 ops queued (12 ULN setConfig + 10 send-lib + 8 receive-lib + 6 enforced-options)
- [x] **Polling disabled to save Alchemy CU**: `LZ_MONITOR=off`, `AGENT_GAS_SYNC_OFF=true`. Main deposit monitor stays paused at 24h.

**Blocked — needs Chris funding**:
- [ ] **FUND DEPLOYER WALLET for LZ wire + E2E test all chains** — deployer is `0x27FbEAD2B527AaDAf4EA7B3Af065244A3964ECBC`. Needs gas on Arbitrum/zkSync/BSC (Scroll/Celo/Gnosis already funded):
  - Arbitrum: 0.005 ETH (~$15) — hub gets ~15 txs
  - zkSync: 0.003 ETH (~$9)
  - BSC: 0.01 BNB (~$6)
  - **Total ~$30**. Once funded, ping me. Then: real wire → fund Arbitrum hub adapter with ~$2k USDC reserve → $1 smoke test BSC→Base → flip `LZ_BRIDGE_ENABLED=true` → re-enable BSC/zkSync/Scroll/Celo/Gnosis in FE chain picker. Total post-funding execution time: ~30 min.

**Awaiting Chris**:
- [ ] **Resend domain verification follow-through** — once `nuro.finance` shows "Verified" in Resend (Chris is doing DNS), flip `EMAIL_FROM=alerts@nuro.finance` on VPS + `pm2 restart cashly-middleware --update-env`. Then test end-to-end with a real threshold breach.

**Carryover (defer-to-Day-7-or-post-pitch)**:
- [ ] **Live chat window** — drop unless Chris specifically wants it for the deck (BYOK floating-panel chat already serves this purpose).
- [ ] **NUR-18 sign-up via email triggers OTP** (~3h) — Google OAuth is primary path; defer post-pitch.
- [ ] **NUR-17 auth page test** — once Google + email login verified, run E2E signup walkthrough.

### Day 7 — May 11
- [ ] **Pitch deck v2** — refinement after v1 review (Chris owns)
- [ ] **External connector polish** — webhook delivery (POST policy decisions back to agent's webhook_url), per-agent event detail page

### Day 8 — May 12
- [ ] **Demo flow E2E rehearsal** (~4h) — deposit → settle → spend → SD3 sync → connector attach → policy decision → settlement card. Full live walkthrough.

### Day 9 — May 13
- [ ] **Final rehearsals + smoke testing all four pillars**

### Day 10 — May 14
- [ ] **PITCH** to Uber, lvlup ventures, 16 other companies

---

## Open threads from Day-2 (carry forward)

- Migration 046 already applied to Supabase production schema; idempotent `IF NOT EXISTS` so backend deploy applying it again is safe. Document in next deploy notes.
- 5 `neural-dashboard.html` copies on VPS — orphan dir at `/home/cash/neural-dashboard/` deleted today. Two `docs/Decision Journal/` copies inside repos are tracked-but-unused; will come back on `git pull`. Post-pitch cleanup.
- pg_indexes audit script (from DJ4 of Decision Journal) — prevents next migration disaster. Post-pitch acceptable.
- External connector webhook delivery not yet implemented — sufficient for demo (inbound flow is the impressive half), flag for post-pitch.

### Day 6-7 — May 11-12
- [ ] **Demo flow E2E test** on Supabase prod — every click, every edge case
- [ ] **Pitch deck refinement** — 8 slides, hero claim "Financial control plane for autonomous AI agents"

### Day 8-9 — May 13-14
- [ ] **Pitch rehearsal + bug-bash + backup recording** (Day 8)
- [ ] **PITCH DAY** (Day 9, May 14)

### What's PARKED (post-pitch)
- All Marathon 9 B-tier (sandbox toggle, vault drill-down, HL deposit, position close)
- All Marathon 10 (Treasury Automation)
- Etherscan source-code verification
- Daily fee-vault digest
- Consumer features (dress-picker, daily-spender)
- A3 deeper fix (per-bet agent attribution propagation)
- MyOFTAdapter on remaining chains (Mode, Mantle)

### Time-gated — DO NOT START
- Tier 0 #2 phase 2 — DROP COLUMN `card_number` after 2026-05-03 (7d obs window from S33)
- HEIM-205 enforce flip — wait until 2026-05-25 (30d FP-rate obs)
- X-MAINNET x402 flip — funding-gated; scheduled agent fires 2026-05-10

### Tier 1 scaling mitigations (when ~100 sustained users)
- pg.Pool 10 → 50, Redis cache layer (Upstash free), heimdall_events composite indexes, logrotate cron, /notifications cursor pagination. ~1-2 weeks. See [[Scaling Roadmap]].

---

## ✅ Session 34 accomplishments (closed)

**Marathon 9 Tier A — fully shipped:**
- ✅ Tier A 5-tab Agent Detail panel (Overview / Budget / Reputation / Counsel / Security) — `66bc402`
- ✅ A1 user-facing budget top-up endpoint + form — `72802ee`
- ✅ A2 strategy + risk_limit config slider — `72802ee`
- ✅ A3 enforceTxCap on agent-initiated bets with proper agent_id attribution — `8fc8918`
- ✅ A4 reputation sparkline rebuild (fixed [-1,+1] axis, tier zones, zero baseline, legend) — `72802ee`

**Marathon 9 Sprint 9.2 — fully shipped:**
- ✅ Settle queue split (in-flight vs completed sweeps in Overview tab) — `f53e4e5`
- ✅ Issuer sync indicator (green/yellow/red dot + relative-time label) — `f53e4e5`

**Marathon 9 Sprint 9.3 — fully shipped:**
- ✅ Notification feed aggregating 5 sources (manual + heimdall + card_alerts + settlements + huginn dissents) — `d2c383b`
- ✅ notification_reads tracker — synthetic row read/dismiss state persists — `14527b2`

**S32/S33 carry-forward sweep — ALL CLOSED:**
- ✅ Pre-push admin `<script>` parse gate (Gate 4) — closes S33 escape-bug regression class — `8b08245`
- ✅ FP labeling UI completion (7d FP rate, 30d trend sparkline, ready-to-enforce ●/○) — `8b08245`
- ✅ card_transactions date/created_at consolidation (migration 043 + INSERT fixes) — `8b08245`
- ✅ x402 X5 Phase 2 — in-house EIP-3009 verify for internal payers + 12-test fixture — `8b08245`
- ✅ FE proxy gap caught + fixed live (`/agents/:id/details`, `/api/agents/:id/budget/topup`) — `ae8ea86`

**Strategy docs delivered:**
- ✅ Marathon 9 doc (Agent Control Plane FE) — full 6-tier punch list, ~46-58hr roadmap
- ✅ Marathon 10 doc (Treasury Automation) — 5-sprint roadmap, ~3 weeks, OBSERVE-only buildable
- ✅ Scaling Roadmap (1K → 10K → 100K DAU) — capacity ladder + treasury automation plan
- ✅ Architecture card 13 + scaling-roadmap.html sub-page — 4 standalone tier diagrams (1 / 2 / 3 cloud / 3 alt own-hardware) with delta panels (Added / Removed / Changed)

**Production state at close:**
- BE+FE both at HEAD `631e9e1` on Build_Branch
- BUILD_ID `8o8oyc99fjldn5VGRVQCA` (built 2026-04-27 04:28:03)
- Migrations through 044 applied
- 96 tests passing throughout
- 4 pre-push gates active (verify-deps + typecheck + tests + admin-parse-check)

---

## ✅ Session 33 accomplishments (closed)

**S32+S33 carry-forward sweep (commit `8b08245`):**
- ✅ Pre-push admin `<script>` parse gate — `scripts/check-admin-script.js` + `.husky/pre-push` Gate 4. Closes the S33 escape-bug regression class permanently. Verified positive (passes on current code) AND negative (catches deliberately-injected `\'` regression with clean error + temp-file preservation).
- ✅ Per-rule FP labeling UI completion — added 7d FP rate column, 30d trend sparkline (inline SVG), ready-to-enforce ●/○ indicator with hover tooltips, "X rules ready" header badge to admin Heimdall events tab.
- ✅ card_transactions date/created_at consolidation — migration 043 backfills NULLs + sets `DEFAULT now()`. Both INSERT call sites (nuro-routes.ts:1424 + monitor.ts:607) now populate `date` explicitly. Closes silent-data-loss bug where analytics queries (24h/7d/12mo windows) dropped rows with NULL date.
- ✅ x402 X5 Phase 2 — in-house EIP-3009 verify for internal-payer authorizations. `/facilitator/verify` no longer forwards to public x402.org for our HD-derived agents. New `verifyInternalAuthorization()` validates network/asset, expiry, recipient, amount, nonce dedup, EIP-712 signature recovery, AND budget remaining via agent_budgets. Fails closed on DB outage. Settle log now includes `authNonce` for cross-route dedup. **12 unit tests** cover every branch (96 backend tests total, all pass).

**Tier A — Agent Control Plane FE (commit pending):**
- ✅ `GET /api/agents/:id/details` — bundled snapshot endpoint (user-auth + ownership check), mirrors admin Mythos POV: budgets + reputation + reputationHistory + recentCounsel + recentLedger + recentEvents (dual-keyed agent.id + user.id) + recentBets + recentFundings + recentSettlements. Per-query graceful degradation (sub-query failure logs and returns empty rather than 500).
- ✅ AgentCard 5-tab Detail panel in `agent-wallet/page.tsx` — Overview / Budget / Reputation / Counsel / Security. Inline-SVG sparkline on Reputation. Empty states explain what each tab will show when data populates. Single round-trip via the new endpoint, lazy-loaded on first expand.

**BE→FE gap review delivered** — see [[Marathon 9 — Agent Control Plane FE]].

---

## ✅ Session 33 accomplishments (closed)

**Tier 0** (entire tier — security cleanup):
- ✅ #1 Mask PAN in admin (SQL projection masking; admin no longer sees raw PAN)
- ✅ #2 card_number → card_last_4 migration phase 1 (parallel writes; column drop = follow-up after 7d observation, target ~2026-05-03)
- ✅ #3 Rate-limit + audit /cards/:id/secrets (5/hour cap + execution_log row per attempt — exfil throttle)

**Tier 1** (entire tier — except follow-up sweep #5b which also shipped):
- ✅ #4 Wire enforceTxCap into 5 money paths (withdrawals, buy-from-card, transfers, /markets/:id/bet, /api/hl/withdraw)
- ✅ #5 + #5b Agent settle integrity (intent fix: pending row + truthful UX; sweep integration: card_settlements processes agent rows + decrements total_profit on completion)
- ✅ #6 Vault Withdraw real wiring (alert() stub → real POST /withdrawals)
- ✅ #7 Report Lost/Stolen handler + endpoint (FE button → POST /cards/:id/report-lost → freezeCard + card_alerts incident)
- ✅ #8 Phantom $128K mock removal (ConnectedWalletDashboard fallback)
- ✅ #9 SANDBOX_MODE gate on POST /card-transactions (production rejects; sandbox-only fixture)
- ✅ #10 Schema drift reconciliation (cards.status → is_active; card_alerts message/metadata → description/amount)
- ✅ #13 HEIM-001..007 ingress prompt-injection scanner LIVE (caught real "ignore previous instructions" payload on /huginn/counsel)
- ✅ #13++ Scanner expanded to /markets, /transfers, /cards/:id/report-lost, agent-bus publish
- ✅ #15 Audit dispatch endpoint + auditor SKILL.md DISPATCH protocol
- ✅ #16 Heimdall self-test endpoint + admin Status sub-tab (53 rules, armed/mode/24h-count)
- ✅ #17 Per-rule FP 30d trend + readyToEnforce flag (stable-7d guard)

**x402 protocol**:
- ✅ X1 Programmatic Agent Treasury (Phase 1 client; 2 latent bugs fixed: createSigner await, useFacilitator import path)
- ✅ Phase 2 server-side (x402Route wrapper, network-aware, @coinbase/x402 wired)
- ✅ X3 Productize 4 paid endpoints (/demo/echo $0.001, /heimdall/threat-intel $0.10, /markets/resolved $0.001, /huginn/counsel $0.005). Real Sepolia loopback proven (basescan tx 0x2cf24ca... and 0x775bb85e...)
- ✅ X4 Agent-bus topic pricing (migration 042, publish() integration, admin CRUD, 2 priced topics live)
- ✅ X5 Phase 1 Self-hosted facilitator routing layer at /facilitator/{verify,settle,supported} with off-chain ledger fast-path for internal payers (HD-derived address detection)
- ⏳ X-MAINNET (top priority on funding arrival) — flip Sepolia → Base mainnet. Auto-handled by scheduled remote agent fires 2026-05-10; Pending Tasks "🟡 BLOCKED ON FUNDING" tracks the 4-step flip checklist

**Other**:
- ✅ Neural Net visualization v2 (codebase-graph.html) — file-size dimension + tight physics (charge-22, link-18, center-0.14) + gradient edges with size-weighted dominance + sum-of-degrees thickness scale (5× width, 3× opacity variance)
- ✅ Admin onclick escape bug emergency fix (`\'` → `\\'` in 4 sites; rendered admin script now node --check clean)

**Open follow-ups** (carried into Session 34):
- **codebase-graph.html — REVERT or REPLACE** (TOP, ~30 min). Late-S33 paint-mode iteration failed (5h marathon, see DJ 2026-04-26_004). Three paths: revert to commit `0a68c62`, OR drop the pre-baked Cosmograph CSVs (`public/architecture/cosmo-{nodes,links}.csv`) into cosmograph.app/run/ and embed the result, OR set REPLICATE_API_TOKEN and use the new `scripts/generate-image.js`. **Do NOT iterate further on hand-rolled D3 brain rendering** — that path is exhausted.
- node --check admin <script> pre-push gate (~30 min) — prevents the S33 escape regression class from ever shipping again
- Tier 0 #2 phase 2 — DROP COLUMN card_number after 7d observation (~2026-05-03)
- X5 Phase 2 — bring EIP-3009 verify in-house (~2-3 days)
- HEIM-205 enforce flip — wait until 2026-05-25 for 30d FP-rate observation
- Per-rule FP labeling UI buttons on events tab (~1 hr)
- card_transactions date/created_at consolidation (~30 min)

## ✅ Session 32 accomplishments (closed)

All 5 high-priority + the bonus deep work:
- ✅ Per-vault HL audit closed: Growi HF + L/S Grids approved (29/40 each, high-risk), HyperGrowth deprecated (26/40)
- ✅ Budget-low → Huginn → Telegram E2E loop wired
- ✅ Period-rollover budget cron piggybacking on reputation (6h cadence)
- ✅ AgentId plumbed through 7 enforceTxCap call sites (bridge.ts + swap.ts + execution-dispatch.ts + monitor.ts)
- ✅ HL Phase 1.2 endpoints + position-sync cron scaffold (on-chain driver stubbed for funded smoke-test)
- ✅ Reputation arc fixed-axis [-1,+1] in admin Mythos POV
- ✅ ReloadFlow / WalletDepositButton CHAIN_NAME_TO_ID unified into `lib/chains.ts`
- ✅ Mythos counsel-on-action wrapper + admin endpoint
- ✅ Gas balance sync cron (1h cadence, per-chain provider.getBalance + USD)
- ✅ Per-rule false-positive labeling in admin UI (migration 039 + endpoints + UI panel)
- ✅ KycReloadHint component in ReloadFlow + ReloadModal v2
- ✅ Hardhat compile workflow under Node 18 via nvm — system-level fix (3-layer defense + postinstall ink/react fix)
- ✅ Sandbox harness M1-M7: Anvil install + orchestrator + scratch schema + AsyncLocalStorage scope + REST API + cleanup cron + E2E smoke (migration 040)
- ✅ **P0 SECURITY**: balance-spoof → withdraw exploit chain CLOSED (PATCH balance refused, Issuer-authoritative reads on /withdrawals + /buy-from-card)
- ✅ Sub-Agents registry updated: Huginn promoted to Autonomous category, Heimdall as Security Plane, 9 internal modules listed
- ✅ Functionality audit published: 4 tiers of prioritized to-dos
- ✅ Telegram spam dampening (approval-pipeline only HIGH-risk fires; watchdog 2h→24h threshold)
- ✅ `logCriticalFinding()` helper + retroactive log of balance-spoof finding (event 12cb048e)

---

## 🔴 Session 33 Priorities

See **[[Session 33 Handoff]]** for full context + verification commands.

### 🟡 BLOCKED ON FUNDING — MAINNET FLIP (highest-priority on funding arrival)

**X-MAINNET. Flip x402 settlement Sepolia → Base Mainnet** (~30 min once unblocked)

> **Why deferred (S33):** Public x402.org facilitator only supports v1 testnets
> (base-sepolia, solana-devnet) per its `/supported` endpoint. Base mainnet
> requires Coinbase Developer Platform credentials via `@coinbase/x402` — no
> CDP creds currently provisioned, no USDC funding available. Richard expects
> $15-30K within 1-2 weeks; mainnet flip executes immediately upon arrival.

**Current state (sandbox / sepolia):**
- VPS `.env`: `X402_SETTLEMENT_NETWORK=base-sepolia` (added S33, marked for removal)
- Public facilitator at `https://x402.org/facilitator` handles verify+settle
- Mythos vault `0xe9e54C01Eea4fB8a429BE8975567077AFA6929aa` funded with sepolia USDC via Circle faucet
- Code is fully network-aware — flipping is env-only, no code change

**Trigger criteria:** Funding arrives → Richard can provision (a) CDP API key (free at https://docs.cdp.coinbase.com), (b) ~$5-10 real USDC for Mythos vault on Base mainnet.

**Flip checklist:**
1. Sign up at https://docs.cdp.coinbase.com → create API key → save `CDP_API_KEY_ID` + `CDP_API_KEY_SECRET`
2. Send ~$5 USDC to Mythos vault `0xe9e54C01Eea4fB8a429BE8975567077AFA6929aa` on Base mainnet (chainId 8453)
3. Edit VPS `~/Cashly/.env`:
   - **Remove** `X402_SETTLEMENT_NETWORK=base-sepolia` line
   - **Add** `CDP_API_KEY_ID=<id>` and `CDP_API_KEY_SECRET=<secret>`
4. `pm2 restart cashly-middleware --update-env`
5. Smoke test: `curl https://api.nuro.finance/api/x402/demo/echo` should show `network:"base"`, `asset:"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"`
6. Loopback: `POST /api/x402/test-payment` body `{"url":"https://api.nuro.finance/api/x402/demo/echo","agentId":"mythos","maxValueUsd":0.01}` — expect `payment.transactionHash` populated, basescan.org tx visible
7. Delete the Pending Tasks "🟡 BLOCKED ON FUNDING" section entirely
8. Decision Journal entry: `2026-XX-XX_x402-mainnet-flip.md` with the basescan tx as proof-of-life

**Code already supports this** — see `src/x402/server.ts` `getFacilitator()` + `NETWORK_CONFIG` map. No edits needed, just env.

**Target date:** ~2026-05-10 (2 weeks from S33 if Richard's funding lands at the late end of his estimate). A scheduled remote agent will nudge if past due.

---

### High-priority first-up (Tier 0 — security cleanup, ~3.5hr total)

1. **Mask PAN in admin console** — `admin-console.ts:154-158, 3754-3760` renders full PAN in HTML. PCI scope explosion. Fix: `'•••• ' || RIGHT(card_number, 4) AS card_number` in SQL projection. ~30 min.
2. **Migrate `card_number` → `card_last_4`** — drop unencrypted PAN column. Backfill last_4, ALTER TABLE DROP COLUMN. Update consumers; full PAN comes from `/cards/:id/secrets` (already SD3-backed). ~2 hr.
3. **Rate-limit + audit-log `/cards/:id/secrets`** — currently no rate limit on CVV reveal, no audit. Add execution_log entry per fetch + 5/hour cap + (optional) 2FA step-up. ~1 hr.

### Tier 1 (S33–S34, before any agent-ready milestone)

4. **Wire enforceTxCap into 5 missing money paths** (~5 hr): `/withdrawals` (`nuro-routes.ts:2846`), `/transfers` (`:3467`), `/buy-from-card` (`:3105, 3111`), `/markets/:id/bet` (`:4653`), `/api/hl/withdraw` (`hl-routes.ts:355-417`). Each: `enforceTxCap({ source, txKind, valueUsd, chainId, agentId: userId })`. ~1hr per site.
5. **Fix agent settle integrity** — `nuro-routes.ts:4308-4346` zeros `total_profit` with no money movement. Insert `card_settlements` pending row, sweep cron does the bridge+credit, decrement only on `status='completed'`. ~2 hr.
6. **Vault page Withdraw real wiring** — `vault/page.tsx:297` is `alert()` stub. Wire to `POST /api/withdrawals`. Replace static stats with real counts. ~3 hr.
7. **Report Lost/Stolen handler + endpoint** — `CardDetails.tsx:413` button + missing endpoint. Add `POST /api/cards/:id/report-lost` → calls existing `freezeCard()` + creates incident record. ~2 hr.
8. **Mock-data fallback removal** in `ConnectedWalletDashboard.tsx:1536` — kills the phantom $128K portfolio. ~30 min.
9. **Gate `POST /card-transactions` behind SANDBOX_MODE** — currently lets users INSERT fictional rows. ~30 min.
10. **Schema drift reconciliation** — `cards.status`, `transactions.created_at`/`timestamp`, `card_transactions` column variance across call sites. ~1 hr.

### Tier 1 — x402 agent-payment rails (NEW S33 — agentic finance moat)

> **Strategic frame**: x402 is Coinbase + Cloudflare's HTTP-402 payment standard for AI agents. ~$600M annualized as of March 2026, 119M Base tx + 35M Solana tx, zero protocol fees, no KYC. Already de facto standard for agent → API payments. **AFI's positioning**: be the rails layer agents prefer because we wrap their payments in budget + counsel + Heimdall + reputation under ONE policy surface — Visa, USDC, x402 all gated identically.
>
> **Phasing**:
> - **Phase 1** (S33 today): client-side. Our agents pay external x402 services. ✅ in-progress
> - **Phase 2** (S33+1 — S34): server-side. Charge external agents to consume our APIs.
> - **Phase 3** (S35+): facilitator-side. We run the rails for the broader ecosystem.

**X1. ✅ Programmatic Agent Treasury (Phase 1, SHIPPED S33)** — `src/x402/client.ts`
- Wraps `fetch` so any AFI agent calls any x402-protected URL via our middleware
- Pre-flight chain LIVE: `enforceTxCap` (HEIM-105) → `huginn.counsel()` → `recordSpend()` → EIP-3009 sign → facilitator settle
- Admin endpoints LIVE: `GET /api/x402/agent-address`, `POST /api/x402/test-payment`
- Mythos POV "recent x402 spend" panel LIVE
- Sandbox-aware via existing `scope.ts`
- 2 latent bugs surfaced + fixed during Phase 2 loopback: (a) `createSigner` returns `Promise<Signer>` and was being used un-awaited, (b) `useFacilitator` lives in `x402/verify`, not `x402/facilitator` (the .d.ts misleads)
- See commits `f2b029a`, `c77f614`, `2de3ac7`

**X2. Card ↔ x402 unified spend surface (#2 — Phase 2)** — ~3-4 days, gated on SD3 setLimit/setMcc
The differentiator nobody else can match. Treat an x402 payment as a "swipe" with `chain=usdc-base, merchant=<api-host>`. Same `card_controls` gate it: daily limit, per-tx cap, MCC denylist. `available_balance` becomes one pool spendable on Visa OR x402. When SD3 finally exposes setLimit/setMcc, x402 inherits same rules automatically.
- Build effort high; ROI 10/10 (the agentic-Visa frame). Schedule after Tier 0 security + X1 land.

**X3. ✅ AFI-as-x402-server (Phase 2 — FOUNDATION SHIPPED S33)** — `src/x402/server.ts`
Server-side wrapper LIVE:
- `x402Route(opts, handler)` — Express middleware that gates any handler behind x402 USDC payment
- Network-aware via `NETWORK_CONFIG` map + `X402_SETTLEMENT_NETWORK` env (base ↔ base-sepolia)
- Coinbase facilitator wired via `@coinbase/x402` for mainnet (when CDP creds set)
- Public facilitator fallback for sepolia testing
- Demo endpoint LIVE: `GET /api/x402/demo/echo` ($0.001 USDC)
- Public revenue address LIVE: `GET /api/x402/revenue-address` returns `0x050cdf3608664bD667586393986cF8803f1Cd1B8` (HD-derived from `nuro-revenue` agentId, separate from agent SPEND vaults for clean ledger)
- Loopback E2E proven on sepolia: full chain (signature → verify → settle → tx hash → execution_log) verified
- See commits `afe1fcf`, `a4b9543`, `e634f0f`

**Productize the listings (next session work):** wrap existing Mythos/Huginn/Heimdall endpoints with `x402Route()` to start charging:
- `GET /api/x402/hl-audits/latest` — $0.01 — Mythos's vault audit findings
- `POST /api/x402/huginn/counsel` — $0.005 — synchronous counsel for any agent's proposal
- `GET /api/x402/heimdall/threat-intel` — $0.10/day — daily Heimdall scan output (FP-labeled)
- `POST /api/x402/sandbox/spawn` — $0.50 — external agent spawns a 1h sandbox
- `GET /api/x402/markets/resolved` — $0.001 — resolved-market history feed

**X4. x402-gated agent bus topics — agent labor market (#5 — Phase 2)** — ~2 days, needs critical mass
Self-priced labor between agents. Today bus is free. Add: certain topics require x402 payment (`huginn-counsel-request`, `mythos-audit-request`). Receiver's reputation tier sets the price. Per-message ledger entry: who paid whom, for what, outcome → reputation feedback. Unique to AFI — only platform with bus + reputation + budget already wired.

**X5. Run our own x402 facilitator at `facilitator.nuro.finance` (#3 — Phase 3)** — ~1 week, infrastructure moat
Strategic infrastructure play. Spin up our own facilitator service. Third parties point at us; charge ~5bps. For OUR agents: settlement is **off-chain** (just a `agent_budget_ledger` debit) — instant, zero gas, zero finality wait. Heimdall monitors all flows. Stretch goal — depends on X1+X3 proven first.

### Tier 1 — Heimdall implementation roadmap (TS-feasible without Rust proxy)

11. **HEIM-105B (NEW)** — *"PATCH/PUT/POST endpoint accepts authoritative monetary fields (`balance`, `usd_*`, `*_remaining`) from request body"*. The rule that would have caught the S32 balance-spoof exploit. TS-side: scan all router.patch/post handlers for body destructuring of authoritative-shape field names. ~2 hr.
12. **HEIM-202** — Decision Journal append-only enforcement via filesystem hook on Mythos write paths. Catalog says Phase 1+ but TS-feasible today. ~2 hr.
13. **HEIM-001 to HEIM-007** (ingress prompt-injection scanner) — request middleware that runs canonical phrase + base64-blob + chat-template-marker checks on inbound user content. ~1 day.
14. **HEIM-205** enforce-mode flip — already armed in observe; wait for 30d FP-rate observation (target 2026-05-25), then evaluate.
15. **Audit dispatch wiring** — every audit pass agent terminates by calling `logCriticalFinding()` for each P0 finding. Auto-fires Telegram + admin event + DJ stub. ~1 hr per audit-spawning entry point. Should be plumbed into the standard audit prompt template.
16. **Heimdall self-test endpoint** — `GET /admin/api/heimdall/self-test` returns per-rule status + last-fired timestamp. Today operator parses boot logs. ~2 hr.
17. **Per-rule false-positive rate trending** — already shipped per-rule rate panel; add 30d trend graph + auto-flag "ready to enforce" when FP < 5%. ~3 hr.

### Carryover — vault audit cycle re-eval (next quarterly: 2026-07-25)
- HyperGrowth re-evaluation if drawdown discipline holds + age crosses 12mo without retest of prior 45% trough
- Monthly TVL/drawdown/accepting-deposits sweep next due 2026-05-25
3. **Period-rollover cron for budgets** (~30 min). Piggyback on reputation cron — at every cycle, scan agents whose `last_reset_at` is older than period, reset `usd_remaining = usd_authority`, log to ledger as `period-reset`. Otherwise budgets only refill via manual admin endpoint.
4. **Auto-record-spend agentId plumbing** (~2-3 hr). bridge.ts + execution-dispatch.ts + swap.ts enforceTxCap call sites currently pass no agentId, so ledger stays empty until each plumbs it. Per-site work.
5. **Budget-low Huginn integration** (~30 min). When Mythos's `usd_remaining < 20%`, publish on bus topic `agent-budget-low`. Huginn subscribes + auto-counsels Richard to top up. Demos bus → Huginn → counsel → Telegram-alert E2E loop.
6. **Safe-to-fail sandbox — DESIGN PASS first** (~2 hr design, 4-6 hr build). Write `Sandbox Design.md` before any code: DB snapshot vs forked RPC vs hybrid? Per-session scratch schemas? State-freezing semantics? Cleanup self-expiry? Build comes after design sign-off.

### Medium-priority

7. **Per-rule false-positive labeling** in admin UI (~1.5 hr) — operator marks event as "FP" → feeds rule sensitivity tuning. Foundation for self-learning loop.
8. **Mythos counsel-on-action wiring** (~1 hr) — auto-call `huginn.counsel()` from Mythos's hot paths, surface verdict in Decision Journal entry. Today the call is admin-curl-only.
9. **Reputation arc fixed-axis** (~10 min) — currently min/max-normalized; fix to [-1, +1] for cross-agent comparability.
10. **Gas balance sync cron** (~1 hr) — `agent_gas_balances` schema is there but no per-chain `provider.getBalance()` refresh job yet.
11. **HEIM-105 / 101 / etc. enforce-mode flips** — after 30 days of FP-rate observation (target 2026-05-25), evaluate per-rule enforce flips via admin UI toggles.
12. **ReloadFlow / ReloadModal CHAIN_NAME_TO_ID unification** — drift class same as the SidebarProof one we fixed. ~20 min.
13. **Postgres MCP tunnel status** — verify, debug if still -32603'ing.
14. **Surface depositRoutingActive=false** with "Complete KYC to auto-credit" CTA in Reload modal — currently silent for non-KYC users.
15. **Hardened LZ contract compile + deploy** — still blocked on Node 22 hardhat env fix on VPS. Multi-session lift.
16. **POST /buy-from-bank transfer initiation route** — scaffolds shipped S28; pending Plaid + Dwolla creds Richard hasn't provisioned.

### Bigger lifts (multi-session)

- **Marathon 8 Phase 1 — Rust ingress proxy on isolated Pi 5**. Per Watchman roadmap, moves Heimdall 5/10 → 7/10. ~3-4 weeks focused work + ~$300-500 hardware. Open decisions: Pi 5 vs cluster of 2 Pis, Rust dev resourcing, deploy timing.
- **Future Muninn (proto-memory-curator sub-agent)** — same dual-life arc as Huginn. Build when memory consolidation needs first-class agent treatment beyond `/encode` skill.
- **HLP family vault evaluation** — pre-excluded from S31 audit cycle for portfolio-thesis reasons; revisit if HL house APR turns positive or Richard wants "safest index" exposure.

### Carryover loose ends

- `usePersistedIdOrder.ts` 2-line ES2020 simplification (dead code path now)
- `my-wallet/index.tsx` 4 cosmetic additions (send-tx pill + page-refresh motion variants) — deferred from Chris pass
- ProtectedRoute has no server-side variant — middleware.ts integration is its own design doc
- Next.js build warnings (`@react-native-async-storage/async-storage`, `@farcaster/mini-app-solana` Module-not-found) — non-breaking
- Monitor still PAUSED at 24h polling (un-pause for E2E tests, re-pause after)
- Sprint 1.2 chain-matrix tests — ~$30-50, not funded
- Twitter $10 credit activation — cheapest funding unlock
- 23 remaining FE TS errors (pre-S28 baseline)
- 2 deleted Solana deposit rows (users will regenerate fresh per-user addresses on next request — verify when they return)
- POPCAT was a Mythos editorial pick (admin can disable via Solana allowlist UI; recorded in audit trail)
- Heimdall TS bridge IS the source of truth for now — TS const + Markdown duplicated. When Rust proxy lands, TS becomes canonical export and markdown derives.

---

## 🔮 Exploration — Hyperliquid native market orders from Nuro

> Flagged by Richard S30 overtime, 2026-04-24: "for hyperliquid, we basically
> just are a hop skip over to their system, can we build a simple system, or
> pull in their data and let people execute market orders on our site that
> route to hyperliquid?"
>
> Not a build decision — a DESIGN decision to be made deliberately. Queued
> for S31+ exploration. Answer the questions first, THEN build.

### The opportunity
Users already see Hyperliquid funding rates + markets on our Yield page
(S30 `1fa5d24`). Letting them click-to-execute a perp long/short without
leaving Nuro is the natural next step. HL has the best perp liquidity on
any DEX right now; routing users to it positions Nuro as the "neobank that
trades for you" rather than yet-another-wallet.

### The three architectural options

**A. Deep-link redirect (shipped today, good enough floor)**
- Each row already links to `app.hyperliquid.xyz/trade/<SYMBOL>`
- User leaves Nuro, trades on HL, comes back
- Pros: zero custody risk, zero engineering, zero ongoing maintenance
- Cons: user bounces out of our UX; no attribution; no position-sync back

**B. Embedded HL API — we execute on user's behalf**
- HL has a REST API for order entry. Uses EIP-712 signed orders posted
  to `api.hyperliquid.xyz/exchange`. User signs with their HL-approved
  wallet (could be the Privy EVM wallet since HyperEVM is EVM-compatible).
- We build: Order-entry form (market/limit, size, leverage, reduce-only)
  → HL API `POST /exchange` with signed action → we display fill + PnL.
- Pros: stays in Nuro UX; we can show portfolio-aware context; we can
  charge a thin fee on top; opens a whole perp-trading-as-a-service
  product line.
- Cons: regulatory — operating a leveraged-derivatives front-end may
  require registrations we don't have today (CFTC swap dealer? depends
  on jurisdiction + user geofencing); HL API rate limits; needs robust
  nonce management for order uniqueness; must handle partial fills,
  rejections, and stale state.
- Unlocks: vault deposits (HL vault APYs), HYPE staking, funding-rate
  farming strategies run automatically by a Nuro agent.

**C. HL vault deposits only (lighter touch than option B)**
- Users deposit USDC into curated HL vaults via a Nuro-issued deposit
  tx. HL's vaults are their "keeper-bot" strategies — predefined, run
  by verified market-makers.
- No order-entry surface — just "deposit, see APR, withdraw."
- Pros: much smaller regulatory attack surface (looks like a DeFi
  deposit, not a derivatives brokerage); clean fit with the Yield page;
  HYPE staking is nearly free to add in the same sprint.
- Cons: less differentiated; competes with every DeFi aggregator. But
  fits our "agentic banking" frame: "pick a vault, agent allocates for
  you, you see daily APR."

### Decision questions to answer before building
1. **Regulatory posture** — which option does our legal structure permit
   today? Option A is safe. Option B likely needs counsel. Option C is
   probably fine as a "DeFi deposit interface" as long as we don't pool
   user funds.
2. **Custody model** — for options B/C, does the user's Privy EVM wallet
   sign the HL-action EIP-712? Or do we derive a new agent-owned wallet
   that the user pre-funds? The latter matches our existing agent-wallet
   architecture but costs a bridge hop.
3. **HYPE token obtainment** — HL-native execution requires gas on HyperEVM.
   Do we bundle a HYPE top-up for every new Nuro user? From where —
   bridge from ETH? Buy on Sonic? (We already allowlist HYPE in our swap
   flow, so the buy path exists.)
4. **Fee model** — do we take a spread on the fill price? A flat fee per
   trade? Nothing? Affects legal classification significantly.
5. **Vault curation** — if option C, which HL vaults do we surface? HL has
   hundreds. We need an audit rubric: min TVL, min age, verified leader,
   no recent drawdown spikes.

### Recommended next step
Write a 2-page design doc (`Neural Net/Claude Memory/Hyperliquid
Integration Design.md`) that:
  - Picks one of A/B/C (or a hybrid — e.g. C now, B later after legal)
  - Answers the 5 questions above with explicit decisions
  - Sketches the data flow + endpoint list
  - Estimates build time honestly, with separate milestones for the
    regulatory review gate
Nothing ships until that doc is signed off. Current momentum says
option C first (ship vault deposits as a "Hyperliquid Yield Vault" card
on the Yield page) is the highest-leverage + lowest-risk play.

### Adjacent
Heimdall (Marathon 8 Layer 4.5) should gain rules for HL-action order
signing — signature scope bounded to the user's expected account, order
size below a policy cap, reject orders that drift away from current
mid-price by > N%. This is HEIM-105-class (on-chain-tx cap) extended to
off-chain-EIP-712-signed orders.

---

## Session 31 accomplishments (DONE — the agent-stack day, 25 commits + 6 migrations, ~14 hr)

### Heimdall plumbing batch (4 commits)
- ✅ **HEIM-101 surface coverage** (`f0aa4e8`) — 4 axios clients (issuers/plaid/dwolla/hyperliquid) + global axios catch-all + ~50-host allowlist before observer turned on
- ✅ **HEIM-105 tx-cap** (`6a662c6`) — bridge.ts (LZ), execution-dispatch (4 USDC sites), swap.ts (2 sites)
- ✅ **HEIM-201/202/203 fs-guard scaffold** (`1ee9300`) — heimdallGuardedWrite for Neural Net + skills paths
- ✅ **Admin UI per-rule enforce toggles** (`c5d2a9c`) — 3 stacked control rows + audit logging
- ✅ db.ts test-env safety (`14db029`) — POSTGRES_URL fallback for vitest

### Heimdall hardening pass (1 big commit)
- ✅ **5 new defenders** (`193de9c`):
  - HEIM-501 compound-signal detector + Gjallarhorn state machine (migration 035)
  - HEIM-205 mass-write counter (60s sliding window per source)
  - HEIM-401/403 reasoning detectors (8 bypass-meta + 6 identity-shift patterns)
  - HEIM-208 Merkle manifest (boot integrity check; first-run auto-baselines)
  - Watchdog (HEIM-CTRL-001, alerts on Heimdall silence > 2h)
- ✅ Sports feed allowlist (`0480db8`) — www.thesportsdb.com caught flooding HEIM-101 logs

### Doc-monitor scanners (2 commits)
- ✅ **Daily LZ + CCTP doc-drift cron** (`6b9c857`, `d489699`) — generic external-doc-monitor framework + 2 implementations. 11 baseline snapshots + 11 Telegram alerts. First publisher onto the inter-agent bus.

### HL ecosystem (4 commits + 1 doc + 1 audit)
- ✅ **HL Phase 1 read-only slice** (`f3e3adf`) — migration 034, hl-vault-client + routes + Yield card empty-state
- ✅ **HEIM-105 native-value sites** (`8b0c7a5`) — native-price.ts + hype-bridge + gas.ts coverage
- ✅ **HL follow-ons** (`d27bbbb`, `5a5022b`) — funding sparkline column + HYPE staking stats card. 30 validators / 2.14% APR / 428M HYPE staked. Unit-scaling hot fix mid-deploy.
- ✅ **HyperSwap LP-yield panel** (`22b885e`) — 151 V2/V3 pools via DefiLlama proxy + audit script
- ✅ **Hyperliquid Audit Rubric SOP doc** + **Hyperliquid Integration Design doc** (Neural Net)
- ✅ **Initial 3-vault audit cycle** (Decision Journal `2026-04-25_001.md`) — Slate B (Growi + HyperGrowth + L/S Grids) seeded as `pending`

### Multi-token 0x execution path (1 commit)
- ✅ **Lift "preview only" caveat** (`59cf90c`) — BuyTokenOverride plumbed through fetchZeroExQuote / getNativeSwapQuote / getErc20SwapQuote / previewSwapQuote + routes + FE wallet swap panel

### Quick wins (2 commits)
- ✅ **Address-book per-row delete + favorite toggle UI** (`962cb0e`) — backend endpoints existed, FE was missing. Plus SidebarProof config unification (kills 2-config drift). Plus HEIM-201 scope doc.
- ✅ **FE copy fix** (`ede7986`) — vault empty-state Neural Net path → mailto:dev@nuro.finance

### Inter-agent bus + budgets + reputation + Huginn (5 commits + 3 migrations)
- ✅ **Inter-agent message bus** (`f3905b1`) — migration 036, signed envelopes (HMAC + AES at rest), 8 endpoints, doc-monitor as first publisher, AGENT_BUS_MASTER_KEY provisioned
- ✅ **Agent budget core** (`fbfe744`) — migration 037, schema + read/write API + admin endpoints, $2,500 weekly budget seeded for Mythos
- ✅ **Reputation Score With Teeth** (`81dc2e0`) — migration 038, predictions + outcomes + tier multiplier (novice/trusted/expert/penalized), 3 vault-survival predictions seeded with 90d horizon
- ✅ **Huginn the wise-advisor** (`9b40171`) — sub-agent runtime + 6-rule bank + bus subscriber + counsel endpoint. Sub-agents.json regenerated 20→21 agents (new "counsel" category). Smoke test: $12.5K tx → block-recommend confidence 0.8.

### Hotfix + integration + Mythos POV (3 commits)
- ✅ **Boot-log hotfix** (`18a78c7`) — HEIM-CTRL added to catalog + __system__ excluded from Gjallarhorn + requireAuthOrAdminKey middleware
- ✅ **Integration batch** (`9b1c60b`) — HEIM-105 budget-aware via getEffectiveUsdCap, auto-record-spend in enforceTxCap, reputation→risk_limit auto-apply with $25 floor + 100× ceiling clamps + lazy base_risk_limit_usd column
- ✅ **Mythos POV dashboard** (`7d8375a`) — `/admin/api/mythos/pov` bundled endpoint + Heimdall sub-tab with reputation arc inline-SVG + counsel/predictions/ledger tables

### Architectural decisions ([Decision Journal 2026-04-25_002])

7 non-obvious decisions documented: budget home (B: own home, not Heimdall), Huginn naming (proto → LLM dual-life arc), bus signatures (mandatory day 1), Spot APR semantics (LP-yield via DefiLlama), reputation tier model (4 tiers + clamps), Heimdall hardening timing (ship 5 defenders now vs wait for Phase 1 Rust), Mythos POV placement (sub-tab on Heimdall).

### Stats
- 25 commits, 6 migrations, 11 new modules
- 84/84 backend tests green at every push
- PM2 middleware restarts: 297 → 329; frontend 78 → 84
- Heimdall defenders: 2 → 6 armed in observe mode
- Sub-agents: 20 → 21 (Huginn + new "counsel" category)
- True Heimdall vision: 3/10 → 5/10 per Watchman roadmap
- 5 new Neural Net docs

---

## Session 30 accomplishments (DONE — full 18-hour cook day):

### Act 1 (morning, 6 commits, encoded mid-day at 95% token limit)

- ✅ **Migrations 028 + 029 applied to VPS prod** — Plaid/Dwolla columns + execution_log.user_id. Silent withdrawal audit log loss stopped bleeding.
- ✅ **Chris cosmetic ports `38b99b6`** — 3 surgical wins (Swap quick-picks, Send Address Book, Buy provider cards). "Never trust Chris functionality, port only cosmetic" rule.
- ✅ **LZ reserve monitor wired `2fe2fe0`** + LZ checklist audit `21e735a`.
- ✅ **Hyperliquid yield feed `1fa5d24`** — funding-rate page first-try working.
- ✅ **🔒 ProtectedRoute auth-flash gate + /auth/login 404 shim `f02dab3`** — 250ms pre-redirect data leak fixed.
- ✅ **🚨 FE DEPLOY PATH GAP DISCOVERED** — ~/nuro-finance-dashboard 85 commits behind GitHub; `pm2 restart` doesn't rebuild Next.js. Documented correct sequence.

### Act 2 (post-encode marathon, 36 commits, 3 migrations, ~13 hrs)

- ✅ **Google OAuth bridge + JWKS hardening `6283d8d` + `e19fc4a`** — find-or-create users by email then Richard demanded the trust gap closed. Replaced body-trust with full id_token JWKS verification (jwks-rsa added). Provider-agnostic verifier ready for Apple Sign In etc.
- ✅ **KYC 3-in-1 `629b790`** — SD3 crash from dropped userId param + pre-KYC card-info gate + name-prompt modal before /kyc/start. Migration 028's first_name/last_name columns finally used.
- ✅ **Card-info KYC gating consistency `ea19aed`** — drift fix: /my-card-1 was leaking partial card details pre-KYC while /agent-cards correctly hid them.
- ✅ **Backend user sync `365cb76`** — sidebar showed "Nuro User XXXX" Privy fallback instead of backend `users.name`. New `BackendUserSync` provider patches Redux.
- ✅ **SidebarProof Hyperliquid fix `f76307e`** — two-nav-config drift bug; SidebarProof has its own hardcoded nav inline.
- ✅ **Limit panel polish `f479f1a` + `630488a`** — balance gate, styled dropdown replacing native <select>, token picker SVG fixes + dedup, market-price autofetch with delta hint.
- ✅ **FE + BE deploy automation scripts `819579c`** — `scripts/deploy-fe-vps.sh` + `deploy-be-vps.sh` lock in S30 deploy lessons. Dogfooded all day.
- ✅ **Solana memecoin → card-credit aggregator (Phase 1 → 3c, 9 commits + migration 030)** — full one-signature flagship feature:
  - Phase 1: Jupiter quote previews for 9-token Solana catalog
  - Phase 2: `/quote/best` aggregator with declarative probe registry (0x + Jupiter, parallel fan-out)
  - Phase 2.5: DB-backed `solana_allowlist` (migration 030) + admin UI panel
  - Phase 3a: BE Jupiter firm-swap construction (`/quote/swap-solana/firm`)
  - Phase 3b: FE `useJupiterSwapExecutor` + Privy Solana signer + Sign-and-swap CTA
  - Phase 3c: Auto-derive Nuro deposit USDC ATA → swap output flows directly to CCTP-monitored reserve in same signature
- ✅ **1inch probe `fbabb9e`** — third aggregator source, env-gated by ONEINCH_API_KEY. Activates when Richard provisions key.
- ✅ **Solana deposit address derivation bug `b941e1e`** — 3 call sites passed no userId, fell back to master wallet, 2 prod users shared an address. Fixed + 2 stale rows deleted.
- ✅ **Notifications "Mark All Read" → "Clear All" `7d9420e`** — UX semantics drift. SQL audit confirmed zero actual duplicate inserts; bug was 100% read-vs-dismiss mismatch.
- ✅ **Address-book CRUD (migration 031) `79f74d5`** — saved contacts table + endpoints + SendModal "+ Save" button. The empty placeholder from S30 morning's Chris batch is now real.
- ✅ **Heimdall H1 `38c138c` + H2 + Eval Cases** — Marathon 8 Layer 4.5 first runtime enforcement:
  - Migration 032 — `heimdall_events` audit log
  - `src/heimdall/` module: 52-rule catalog as TS const, HEIM-108 LIVE log-scanner (8 secret shapes), HEIM-101 OBSERVE-MODE egress observer (Jupiter/1inch/Hyperliquid clients + ~25 host baseline + RPC URLs from env)
  - Admin 🛡️ Heimdall tab: rule catalog grouped by Norse category, recent events, egress allowlist, runtime egress-mode toggle
  - `Heimdall — Eval Cases.md` — 20 attack scenarios (EC-001..EC-020), every critical rule covered
- ✅ **Hyperliquid spot markets panel `909de5d`** — companion to funding rates on Yield page. Pivot from "Vault Index" (HL gated `vaultSummaries`). 8+ real markets surface.
- ✅ **Solana reload connect-wallet `4607eec`** + depositRoutingActive surfacing `148e37e` — clickable button triggers Privy createWallet/connectWallet, success copy reflects whether output went to user wallet (no KYC) vs deposit ATA (auto-credit).
- ✅ **Session 30 Recap (full-day rewrite) + Session 31 Handoff (refresh) + Decision Journal 2026-04-24_003 (7 entries)** encoded end-of-day.

---

## Session 29 accomplishments (DONE — skip):

- ✅ **Auth fix shipped + verified** — `3e894bd` unifies CASHLY_API_URL across FE/BE + adds NEXTAUTH_SECRET v4/v5 compat + adds role default + removes dup login/login route + shows visible Privy-disabled notice. Backend `/auth/register` returns valid JWT per curl test.
- ✅ **Heimdall Layer 4.5 designed** — full threat model (grounded in Anthropic Claude Mythos Preview sandbox-escape disclosure), 5 functions (ingress/egress/integrity/credentials/Gjallarhorn), Pi-based hardware ($650), Rust/Go stack, CLI, agent integration matrix. ~180 lines in `Marathon 8 — Corvus.md`.
- ✅ **Bridge-defense.html shipped** — investor-facing Kelp-response artifact. Card 11 in architecture hub. Live at `https://app.nuro.finance/architecture/bridge-defense.html` behind nginx basic auth.
- ✅ **Marathon 8 Corvus master-doc updated** — now "13 agents + 1 security plane," Phase 1.5 Heimdall deploy added, budget raised to $78K + $650 hardware.

---

## Session 28 accomplishments (DONE — skip):

- ✅ **Buy 1 backend route** — `/buy-from-card` flag-gated, non-atomic SD3-first ordering w/ reconciliation path (`transactions.status='debited_pending_transfer'`)
- ✅ **Plaid + Dwolla scaffolds** — `src/plaid-client.ts` + `src/dwolla-client.ts` (axios-only, no new deps), link-token/link-complete routes, FE PlaidLinkButton
- ✅ **SolanaWalletCard FE** — consumes existing `useSolanaWalletPortfolio` hook
- ✅ **TS errors 38 → 28** — framer-motion Variants annotation in wallet modals
- ✅ **Engagement-fetcher** — dry-run mode + PollResult + static analysis (all code paths verified correct)
- ✅ **Admin agent creation form** — `/admin/api/agents/create` + `/admin/api/users/lookup` email→userId + inline collapsible form in agents panel
- ✅ **30 docs synced** to `docs/Claude Memory/` + `docs/Decision Journal/`
- ✅ **Migration 029** — execution_log.user_id VARCHAR(36) + partial index. NOT YET RUN on VPS.
- ✅ **Kelp hardening bundle** — hardened MyOFTAdapter.sol w/ per-message + per-peer caps + pause + events, `lz-reserve-monitor.ts`, `LZ_BRIDGE_ENABLED` flag, `layerzero.config.hardened.ts` with on-chain verified DVN addresses (and discovered: pre-hardening config had broken DVN addresses for Arbitrum + zkSync)
- ✅ **403 retry-loop fix** — `getUserBaseDepositAddress` returns null on 403 + 404 (was throw on 403). User `49418fc8` stranded correctly instead of infinite-loop burning Issuer quota.
- ✅ **Admin JS root-cause fix** — 5 syntax errors in inline `<script>` block from under-escaped `\'` + `\n` in TS template literals. Discovered via offline `vm.Script` parse of template-processed output.
- ✅ **Marathon 8 Corvus canonical spec** — 450-line doc in Neural Net. 12-agent topology, BOM, phased budget.

---

## Session 27 accomplishments (DONE — skip):

(Full list in [[Session 27 Recap]]. Summary: 14 commits + migration 027 + 3 extension blocks. Webhook flip LIVE, nginx basic auth gating 14 strategic doc pages, /en/auth/login 404 fix, SD3 rate-limit backoff, Twitter OAuth 5-pack, user-ID migration.)

### Session 26 accomplishments (DONE — skip):

- ✅ **Deleted stale deposit_addresses** — Richard's personal MetaMask `0x75Aa3B70…` no longer mapped to ghost test userIds
- ✅ **Multi-chain sell in Swap panel** — `switchChainAsync` before firm quote, CTA label reflects switch-needed
- ✅ **Real token-list whitelist** — `useTokenWhitelist.ts` hook fetches `/api/supported-tokens`, 10-min cache, scam filter early-exits on match (LINK/UNI/SHIB/PEPE now legit at $0 price)
- ✅ **Overview BarChart wired to real per-chain portfolio allocation** — was 100% mock, now shows live on-chain USD split with brand colors + "Live · on-chain" chip
- ✅ **Sprint 2.4 polish deployed** — `rowToTransaction()` extended with merchantName/MCC/transactionType/sourceVerified; description cell branches on Visa spend, green ✓ badge when sync+webhook both saw it
- ✅ **Sprint 2.1 vault exposure** — new `GET /users/me/vault` backend endpoint (Base vault address + USDC/ETH balance + open positions + totalAtRisk), FE proxy at `/api/users/me/vault`, new "Base Vault" card on `/en/dashboard/vault` page with address + copy button
- ✅ **Sprint 6.5 Deposit Funnel endpoint + HTML panel** — `/admin/api/deposit-funnel` returns per-chain + overall counts/rates for 24h, 4-stat card strip renders on Dashboard tab
- ✅ **Sprint 6.5 Chain Health endpoint + pill strip** — `/admin/api/chain-health` returns green/yellow/red per chain via stuck_pending, recent_failures, last-confirmed age thresholds
- ✅ **Sprint 6.5 Ops Alerts cron** — `src/ops-alerts.ts` every 10 min, Telegram admin alert on `status='pending' AND created_at < now() - 30min`, de-duped via `execution_log` entity_type='ops_alert'
- ✅ **Growth agent market watcher** — `src/growth-agent/skills/market-watcher.ts` every 15 min, scans new active markets (crypto/politics/culture, last 2h) + big positions (≥$50, last 2h), composes Moltbook preview, routes through existing `submitForApproval()` for Telegram Approve/Reject → auto-post
- ✅ **In-House Ramp doc updated** — Phase 8 now explicit "Buy 1 + Buy 2 launch in parallel, not sequential", UI mock with dual-CTA sketch, Plaid/Dwolla sandbox kickoff synchronized with Buy 1 start
- ✅ **Decision Journal 2026-04-20_001** — 6 DJs on the non-obvious calls (auto-switch vs manual, positive allowlist vs heuristic-tuning, execution_log dedup vs new table, etc.)
- ✅ **Session 26 EOD extension (Apr 20 late → Apr 21 early)** — 8 more tasks shipped:
  - Diagnose Base chain 76h red flag (not broken, monitor paused as designed)
  - Migration 026 `confirmed_at` column + backfill + call-site updates
  - Buy tab dual-CTA scaffold (Buy 1 + Buy 2, flag-gated disabled)
  - MCC → category labels (`src/lib/mcc.ts`, ~100 codes)
  - Prediction markets page polish (search, sort, counted pills, image, explorer links)
  - Deposit funnel sparklines + 24h/7d toggle
  - Session 26 Recap write
  - Growth agent thought-engine top-market path (2h cron)
- ✅ **Session 26 EOD extension part 2 (Apr 21 early)** — 10 more tasks shipped:
  - Diagnose $6.84 vs $4.45 discrepancy (user-ID mismatch, queued for Session 27 fix)
  - Chain-health `monitor_paused` signal (thresholds relax to 48h/7d when paused)
  - Sprint 6.4 `failed_restart` admin panel + Telegram boot alert
  - Admin skip-row UUID → tx detail modal linking
  - Sprint 2.4 webhook `card.updated` + `card.deleted` handlers + `/admin/api/issuer-webhooks` visibility
  - Stuck-dust systemic fix: new `stranded` status + dedup non-retry + 22 rows backfilled + admin endpoint
  - Sprint 2.6 scheduled-intents admin countdown panel
  - GoPlus token-audit helper + "Run audit" button on allowlist Add form
  - `/market` slash command (prediction market specialist)
  - Learning-loop v1 groundwork (weighted tone/format with 20% exploration, admin summary endpoint)
  - Session 27 Handoff refresh with verification checklist

### Session 25 accomplishments (DONE — skip):

### Session 25 accomplishments (DONE — skip):
- ✅ Cherry-picked Chris's ConnectedWalletDashboard (83KB) + 2 deep modals + DraggableStatCards subtree + usePersistedIdOrder
- ✅ `NEXT_PUBLIC_PRIVY_APP_ID` set on VPS (dev-mode app supports 150 users)
- ✅ **Backend**: new `/wallet-portfolio` + `/wallet-activity` endpoints (Alchemy proxies, 30s cache, IP rate limit); new `/quote/swap/firm` endpoint returning executable 0x tx payload
- ✅ **FE**: `useWalletPortfolio` rewritten to use proxy, new `useWalletActivity`, new `SendModal` (multi-token + chain-switch + ERC-20), new `ReceiveModal` (address + QR)
- ✅ **Phase 4 firm Swap**: wagmi `useSendTransaction` with backend-provided tx payload, full state machine, explorer links
- ✅ **Phase 5 ERC-20 Swap**: sell-token dropdown from portfolio, approval flow via `useWriteContract(erc20Abi, 'approve')`, fresh re-quote after approval confirms
- ✅ **Pre-flight balance check**: Max button + amber "Insufficient balance" banner, CTA disabled when over-spending
- ✅ **Scam filter**: `looksLikeScam()` heuristic (t.me/, visit-to-claim, emoji clusters, TLDs, >40-char names), applied to All Assets + Recent Activity, Hide Scams defaults ON
- ✅ **Token logos** from Alchemy metadata in All Assets (graceful fallback chip)
- ✅ **Explorer links** on All Assets overflow menu (Etherscan / Basescan / Arbiscan / Polygonscan / Optimism)
- ✅ **Live refresh every 60s** + optimistic activity-bump CustomEvent on local tx confirmation
- ✅ **Modal overlay fix**: explicit `bg-black/75 + backdrop-blur-[6px]` instead of the low-contrast CSS var
- ✅ **Tabs honest state**: Limit/Buy/Sell now `text-white/25 cursor-not-allowed` with tooltip (no fake "Coming soon" banners)
- ✅ **Admin console visual refresh**: neural-net cosmic aesthetic (Inter font, glass cards, gradient title, pulsing badges)
- ✅ **Admin Phase 2 motion**: LIVE heartbeat pill, stat-value flash animation, ambient breath on background glows
- ✅ **Admin log drill-down modal**: click any execution_log row → full JSON + Etherscan link + copy button
- ✅ **Architecture docs rework**: 10 sub-pages at `/public/architecture/*` with worked examples (HD derivation, CCTP 2-hop, HyperEVM full route), service cards, scroll-story, domain-split ER diagrams
- ✅ **nginx** `/admin` + `/telegram/webhook` proxies live (versioned under `ops/nginx-nuro.conf`)
- ✅ **Hotfixes**: CoinGecko rate-limit stale-cache fallback, CoinGecko batch-400 chunking, Alchemy L2 `internal` category guard
- ✅ **Zero new env vars**: Alchemy key auto-extracted from `RPC_URL_POLYGON` on boot

### Session 24 accomplishments (DONE — skip):
- ✅ `/auditor` skill expanded — 4 new Session 23 bug classes + risk policy cross-refs + calibration
- ✅ `/gate-check` 3 new gates — `erc20-swap-live`, `erc20-memecoin-live`, `heygen-live`
- ✅ `/encode` skill built — session-close auto-ritual (10 steps, templates, calibration)
- ✅ Admin UI for erc20_allowlist — table + toggle + add-token form, force-refresh on write
- ✅ Context7 integration in `/researcher`, `/bridge`, `/deployer`
- ✅ Engagement fetcher cron — Moltbook `/posts/:id/metrics` + Twitter v2 `/tweets/:id` with `public_metrics`, hourly setInterval
- ✅ Memory consolidation pass — `tech_decisions_afi.md` Sessions 22-24 additions + `user_profile.md` session-close ritual + `MEMORY.md` index
- ✅ Dashboard cross-linking — live skill-health feed, invocation heat, `?skill=X` cross-filter, neural-dashboard style parity with sub-agents
- ✅ Admin JS fix — template-literal escape-collision (`\'` → `'` bug that broke whole admin console)

### Session 23 accomplishments (DONE — skip):
- ✅ Chain logos via @web3icons/react (ALL 23 chains brand-accurate via NetworkIcon component)
- ✅ Marathon 7 MVP — native→USDC swap pipeline across 13 chains
- ✅ ERC-20 allowlist — DB-backed (migration 025), admin CRUD endpoints, seed with 10 bluechips + 4 memecoins
- ✅ FE 3-category token picker (Stables / Natives / Memecoins) on BOTH reload surfaces (my-card-1 side panel + my-card-v2 overview popup)
- ✅ Live swap quote preview via 0x /price endpoint (debounced, graceful degrade)
- ✅ Dynamic chain picker — token-aware filtering prevents unsupported combinations
- ✅ WalletDepositButton — one-click wagmi send (ends copy-paste UX)
- ✅ Telegram approve/deny buttons responsive (60m poll → 10s poll)
- ✅ post_engagement table + seed hook (migration 024) — infra for learning loop
- ✅ HeyGen gated behind flag (kills daily log spam)
- ✅ Transactions date-column bug fixed (was showing same time for all rows)
- ✅ Admin "Native→USDC Swaps" telemetry panel (matches Sprint 6.1 Monitor Skips pattern)
- ✅ Sub-agents-dashboard.html deployed
- ✅ Risk architecture policy documented (user eats volatility)
- ✅ context7 MCP wired (4 MCPs total now)

### Session 22 accomplishments (DONE — skip):
- ✅ Deploy Sprint 6.1 + 6.2 to VPS (and Sprint 6.4 on top)
- ✅ ADMIN_KEY rotated
- ✅ MCP postgres + github + filesystem all ✓ Connected
- ✅ SSH key auth Windows → VPS
- ✅ 4 of 5 hooks wired (Stop + SessionStart + /auditor + /gate-check)
- ✅ All 15 sub-agent docs backfilled
- ✅ Admin console Monitor Skips panel live

### Medium-priority
- **Ship `pino-http`** (tier-1 library pick from Session 22 scouting — 5-min win: `npm install pino-http` + 2-line add in `src/index.ts`)
- **Admin console skip-panel widget** (Sprint 6.1 remainder — surface `execution_log WHERE entity_type='monitor' AND status='skipped'`)
- Manual $3 Base→Polygon live CCTP test (precondition for `agent-funding-live` gate)
- First live slice-1 E2E bot test (once funding works)
- Fix Solana $0.81 stuck sweep ("Simulation failed")
- Fix user `49418fc8` stuck Ethereum $1.00 deposit
- Add `agent-bet-settlement-source` advisory gate (from 2026-04-17 audit)
- Verify Sunday 2026-04-19 10:03 AM scheduled audit ran
- Marathon 6 Sprints 6.4 (mid-restart safety) + 6.5 (observability) — full scope in V2 Marathons doc
- Sprint 2.6 thin slices: FE date/time picker verify, execution-time notification, admin countdown widget (Sprint 2.6 is otherwise shipped per Session 22 audit)

### Tech debt
- Stripe type errors — `as any` throughout; proper types Q2
- growth-agent type errors (temporarily patched)
- Solana native bindings warning (`npm rebuild` on VPS)
- `@farcaster/mini-app-solana` missing peer dep
- `/deployer` skill — rewrite DONE Session 22 (`.claude/skills/deployer/SKILL.md`) but `.claude/skills/` is untracked-by-default; optional: commit if team-share desired
- Delete stale pre-Sprint-2.3 test user records causing stuck-sweep errors
- 78 npm audit vulnerabilities (30 low, 29 moderate, 17 high, 2 critical) surfaced during FE `npm ci` — run `npm audit` and plan response

### Tier 2/3 library picks from Session 22 scouting (Decision Journal `_007`)
- **Tier 2 (half-day builds)**: DB Migration Safety Auditor skill (extends /gate-check pattern), E2E Playwright plugin trial on my-card-1 page
- **Tier 3 (post-funding, multi-day)**: `@sentry/node` (error tracking), `@tanstack/react-query` (deposit-flow state fragmentation fix), `drizzle-orm` (2-3 day ORM marathon replacing raw `pool.query()`)

---

## ✅ Session 21 Shipped (2026-04-17)

### Sprint 2.3 Bot Section Real Execution — DONE
- Migration 021 + 022 + 023 (agent_fundings, agent_profit_sweeps, settlement cols, schema_migrations tracking)
- 5 new sweeps in execution-dispatch: sweepAgentFundings, sweepAlphaBotCycle, sweepAgentBetSettlements, sweepAgentProfits, reconcileAgentPnL
- POST /agents/:id/fund + GET /agents/:id/fundings + GET /agents/:id/sweeps endpoints
- 3 observe-only flags: AGENT_FUNDING_OBSERVE_ONLY, AGENT_CLOB_TRADES_ENABLED, AGENT_PROFIT_SWEEP_ENABLED
- Reverse CCTP (cctpBaseToPolygon) — Monday flag-flip blocker cleared

### Backend CI gate
- `tsconfig.backend.json` scoped Node typecheck + 75 Vitest tests
- `.github/workflows/backend-ci.yml` on every PR
- `.husky/pre-push` local gate
- `/gate-check` skill with 6 gates + gate-check-sanity meta
- `gate-completeness-audit` scheduled sub-agent (Sundays 10:03 AM)

### Investor Day (2026-04-17, 1pm PST)
- 11 prep artifacts in `Neural Net/Investor Prep/2026-04-17_Meeting/`
- 4 live bugs debugged + fixed + deployed during prep hour (all CI-gated)
- 3 successful Base→Base bridges during prep hour (tx hashes on admin panel)
- Admin panel: 38 → 41 on-chain txs, $6.33 → $6.75 volume

### Sub-Agents registry
- `Neural Net/Sub-Agents/` scaffold with INDEX, _Conflict-Resolution.md, orchestrator-mythos.md
- 2 new per-agent docs (gate-check + scheduled audit)
- `export-sub-agents.js` D3 generator
- 15 existing skill docs pending backfill (Session 22)

---

## 🟢 Session 20 Completed (2026-04-16) — MASSIVE SESSION (10 commits)

### Three marathons shipped
- **Sprint 2.4 Issuer Integration** — HMAC webhook + tx sync + migration 016/017
- **Sprint 2.1 Slice-1a (Bet Hardening)** — advisory lock + per-address chain lock + fresh nonce across 4 paths
- **Sprint 2.1 Slice-1b (Card Settlement)** — vault → Issuer auto-settle with `payout_destination` prefix:args system + frontend dropdown + migration 018
- **Sprint C (Creator Stake + Rewards)** — $5 USDC stake, 0.5% volume reward, `sweepCreatorPayouts` + migration 019
- **Sprint D (Card Balance Safeguards)** — `card-balance-sync.ts` shared helper + drift telemetry + migration 020

### Cleanup bundle (Sprint 2.6 finisher + hardening + routing)
- `DELETE /transfers/:id` cancellation endpoint (Sprint 2.6 final piece)
- `autoComplete` attributes on login + register password fields
- Next.js `middleware.ts` — root `/` now redirects to `/en` (was 404)
- Closed unclosed `<section>` tag at agent-wallet:117 (Error Log #8 resolved)
- `ecosystem.config.js` at repo root for permanent PM2 naming

### Incidents resolved same session
- **Default login credentials leak** (`admin@dashboard.com` / `Admin@123` baked into bundle)
- **`NEXT_PUBLIC_DESIGN_MODE` bypass** + `tester@nuro.finance` backdoor
- **GitHub PAT leak** in git remote URLs (revoked + regenerated + stripped from remotes)
- **Privy crash → full-site outage** (placeholder in .env.local)
- **PM2 ts-node crash loop** (migrated to `tsx`, Error Log #9)

---

## 🟢 Session 19 Completed (2026-04-14) — MASSIVE SESSION (19 commits)

### Marathon 2 Pen Test — ALL SPRINTS COMPLETE
- ✅ **Sprint 1.1**: Card secrets endpoint, CVV fix, sync card creation
- ✅ **Sprint 1.4**: Solana per-user addresses, Base caching, withdrawal execution, double-spend prevention
- ✅ **Sprint 1.5**: Monitor resilience (restart locks, auto-retry, float dedup, agent sweep lock)

### Money Movement — 5 Critical Gaps Closed
- ✅ **Withdrawal execution** — real on-chain USDC transfers from deployer
- ✅ **Withdrawal cancellation** — DELETE /withdrawals/:id
- ✅ **Double-spend prevention** — SELECT...FOR UPDATE atomic lock
- ✅ **P2P email resolution** — transfers resolve to Nuro users by email
- ✅ **Rate limiting** — withdrawals 1/5min, transfers 1/2min

### Chris Design Integration (60 files)
- ✅ **SidebarProof layout** — fixed sidebar/header/content positioning
- ✅ **Graphite theme** — selector with 4 options (Light, Dark, Graphite, System)
- ✅ **My Wallet page** restored with proper nav icons
- ✅ **DESIGN_MODE disabled** — was bypassing auth with fake data
- ✅ **Settings Cards** wired to real API (was 4 hardcoded fake cards)
- ✅ **Sidebar theme fix** — responds to light/dark/graphite

---

## 🟢 Session 19 Completed (2026-04-14) — MASSIVE SESSION (19 commits)

### Marathon 2 Pen Test — ALL SPRINTS COMPLETE
- ✅ **Sprint 1.1**: Card secrets endpoint, CVV fix, sync card creation
- ✅ **Sprint 1.4**: Solana per-user addresses, Base caching, withdrawal execution, double-spend prevention
- ✅ **Sprint 1.5**: Monitor resilience (restart locks, auto-retry, float dedup, agent sweep lock)

### Money Movement — 5 Critical Gaps Closed
- ✅ **Withdrawal execution** — real on-chain USDC transfers from deployer
- ✅ **Withdrawal cancellation** — DELETE /withdrawals/:id
- ✅ **Double-spend prevention** — SELECT...FOR UPDATE atomic lock
- ✅ **P2P email resolution** — transfers resolve to Nuro users by email
- ✅ **Rate limiting** — withdrawals 1/5min, transfers 1/2min

### Chris Design Integration (60 files)
- ✅ **SidebarProof layout** — fixed sidebar/header/content positioning
- ✅ **Graphite theme** — selector with 4 options (Light, Dark, Graphite, System)
- ✅ **My Wallet page** restored with proper nav icons
- ✅ **DESIGN_MODE disabled** — was bypassing auth with fake data
- ✅ **Settings Cards** wired to real API (was 4 hardcoded fake cards)
- ✅ **Sidebar theme fix** — responds to light/dark/graphite

### Bridge & Deposits
- ✅ **HyperEVM CCTP** — chain 999, monitor detection
- ✅ **LZ DVN wiring** — Celo, Gnosis, BSC with per-chain infra
- ✅ **Bridge deposits merged** into transactions — "USDC Deposit from [Chain]"
- ✅ **Source Chain column** with colored dots
- ✅ **waitForArbUsdc** timeout 300s → 1200s

### HyperEVM CCTP Integration
- ✅ **HyperEVM added to monitor.ts** — chain 999, CCTP domain 19, deposits now auto-detected
- ✅ **Bridge routing confirmed** — HyperEVM uses CCTP direct (not LZ 2-hop), domain 19 already in CCTP_DOMAINS
- ✅ **Admin console** — HyperEVM already in CHAIN_NAMES, added Hyperscan block explorer link
- ✅ **Config** — RPC `https://rpc.hyperliquid.xyz/evm`, USDC `0xb88339CB7199b77E23DB6E890353E22632Ba630f`

### LayerZero DVN Wiring (Celo, Gnosis, BSC)
- ✅ **3 new DVN addresses added** — Celo (`0x75b0...`), Gnosis (`0x11bb...`), BSC (`0xfd68...`)
- ✅ **LZ_INFRA registry created** — per-chain library/executor addresses (standard, arbitrum, gnosis, bsc, zksync, scroll)
- ✅ **CRITICAL FIX: Gnosis uses UNIQUE infra** — standard SendUln302/ReceiveUln302/Executor are EOAs on Gnosis, NOT contracts
- ✅ **CRITICAL FIX: BSC uses unique ReceiveUln302 + Executor** — only shares SendUln302 with standard
- ✅ **6 new bidirectional connections** — Celo↔Arb, Gnosis↔Arb, BSC↔Arb in layerzero.config.ts
- ✅ **Existing connections refactored** — zkSync↔Arb and Scroll↔Arb now use LZ_INFRA constants

### Bridge Reliability
- ✅ **waitForArbUsdc timeout 300s → 1200s (20min)** — LZ delivery can take 10-20min, was timing out
- ✅ **Progressive logging** — elapsed/remaining timer, 10s poll intervals instead of 5s
- ✅ **Admin console** — block explorer links for HyperEVM, zkSync, Scroll, Celo, Gnosis, Avalanche

### Neural Net Maintenance
- ✅ **Card controls "bouncing back"** — CLOSED (non-issue per Richard, confirmed 3x)
- ✅ **Stale Owen reference** — layerzero.config.ts comment updated to "Issuer"
- ✅ **Decision Journal** — Session 19 entries logged

---

## 🟢 Session 18 Completed (2026-04-13)

### LayerZero 2-Hop Bridge — CONFIRMED E2E
- ✅ **zkSync → Arbitrum (LZ)** — Options V3 bug found and fixed (`0x0011` → `0x0021`, 4+ hours debugging)
- ✅ **Arbitrum → Base (CCTP)** — CCTP 2nd hop completed, attestation `complete`
- ✅ **Issuer card credited** — Owen Base went from $6.69 → $6.78 USDC
- ✅ **Root cause** — optionLength was 17 bytes but actual data is 33 bytes (type+gas+value = 1+16+16)

### Owen → Issuer Full Rename
- ✅ **298 occurrences renamed** across entire codebase + docs + skills
- ✅ **Migration 012** — DB columns renamed (owen_user_id → issuer_user_id, etc.)
- ✅ **Migration deployed on VPS** — fixed $0.00 balance display
- ✅ **Backward-compatible config** — reads ISSUER_API_BASE first, falls back to OWENS_API_BASE

### Fee Architecture Redesign
- ✅ **Fees collected AFTER bridge delivery** — never before (user flagged as attack vector)
- ✅ **sweepFeeAfterBridge()** — helper collects fee on source chain post-confirmation
- ✅ **Base direct** — fee + forward atomic (same chain, no risk)
- ✅ **Cross-chain** — bridge full amount first, then sweep fee

### Admin Console
- ✅ **Error context** — failed txs show red error text with hover for full message
- ✅ **LEFT JOIN execution_log** — error details from execution_log table

### Neural Net Decision Journal
- ✅ **5 decision entries logged** — Owen rename, LZ debugging (3), fee architecture
- ✅ **D3.js neural visualization** — animated force-directed graph with neuron-firing playback
- ✅ **export-decisions.js** — converts markdown entries to JSON for D3 rendering

### Nonce Manager
- ✅ **Per-address mutex locks** — prevents bridge race conditions
- ✅ **Public RPC nonces** — Alchemy caches aggressively, using publicnode.com instead

---

## 🟢 Session 17 Completed (2026-04-12)

### Sprint F: Fee Structure & Transaction Type System
- ✅ **Transaction Type Taxonomy** — 17 types defined: deposit, withdrawal, p2p_transfer, card_purchase, card_subscription, bridge_in, bridge_out, market_bet, market_payout, market_creator, agent_bet, agent_settle, card_load, card_to_card, swap, oft_create, oft_trade
- ✅ **`src/fees.ts` created** — ONFT-aware dynamic fee calculator with `calculateFee()`, `calculateFeeForUser()`, `estimateCardLoadFees()`, `getFeeSummary()`
- ✅ **ONFT discount tiers** — default (0%), bronze (10%), silver (20%), gold (35%), platinum (50%)
- ✅ **Admin console TBD replaced** — Execution Layer tab now shows real volume/fees from `getFeeSummary()`
- ✅ **Fee API endpoints** — `GET /fees/schedule`, `GET /fees/estimate`, `GET /fees/estimate-card-load`
- ✅ **Migration 009** — `onft_tier` on users, `transaction_type`/`fee_amount`/`fee_tier` on card_transactions

### Agent System
- ✅ **Migration 010** — `agents` + `agent_bets` tables created (16 columns, 14 columns, 5 indexes)
- ✅ **Polymarket proxy** — already existed at `/polymarket/markets` (line 1814), confirmed working

### Memetropolis Integration (Sprint G)
- ✅ **G1: Bridge Config Reference** — `src/bridge-config-reference.ts` with all LZ V2 configs for 12 chains (DVN, executor, send/receive libs, gas, confirmations, USDC addresses, DEX router addresses)
- ✅ **G2: Business OFT Launchpad** — `contracts/BusinessTokenFactory.sol` with bonding curve architecture, `POST /tokens/create` + `GET /tokens` endpoints
- ✅ **G3: Card-Loadable OFT Swaps** — `src/swap-router.ts` (Uniswap V2 integration), `GET /card/load-quote`, `POST /card/load-from-token` endpoints
- ✅ **G4: Cross-Chain Prediction Markets** — `POST /markets/:id/bet-crosschain` endpoint (bridge + bet intent recording with fee calculation)

### Growth Agent Enhancement
- ✅ **Scheduler confirmed** — already wired in index.ts (gated by `ENABLE_GROWTH_AGENT=true`), hourly + daily cycles
- ✅ **Telegram enhanced** — 56→250 lines, added 8 command handlers (/markets, /prices, /sports, /bet, /alerts, /portfolio, /help, /start), command polling, inline keyboard support
- ✅ **Twitter enhanced** — 80→180 lines, added quote tweet, engagement metrics (`getTweetMetrics()`), content formatters (`formatMarketThread()`, `formatPriceAlert()`, `formatResolution()`)
- ✅ **Security fix** — hardcoded HeyGen API key removed from tiktok.ts, moved to env var
- ✅ **avatar.ts created** — NEW skill: HeyGen avatar management, video generation, presets (market_alert, educational, breaking_news), performance tracking

### New Files Created
| File | Lines | Purpose |
|------|-------|---------|
| `src/fees.ts` | ~250 | ONFT-aware dynamic fee calculator |
| `src/bridge-config-reference.ts` | ~280 | Memetropolis-proven LZ V2 chain configs |
| `src/swap-router.ts` | ~260 | Uniswap V2 token→USDC swap for card loading |
| `contracts/BusinessTokenFactory.sol` | ~200 | Business OFT token factory + bonding curves |
| `src/growth-agent/skills/avatar.ts` | ~230 | AI video avatar management |
| `src/migrations/009_fee_system.sql` | ~15 | Fee system DB columns |
| `src/migrations/010_agents.sql` | ~45 | Agent system tables |

---

## 🟢 Session 16 Completed (2026-04-12)

### Memetropolis Migration
- ✅ Cloned 5 repos from GBlock-GG org (frontend, backend, contract, subgraph, technical-documents)
- ✅ Rewrote all 810 commits across 16+ authors to `RichardTheBruceWayne@gmail.com` (preserving original dates)
- ✅ Created 5 private repos under RichardTheBruce personal GitHub
- ✅ All commits showing on GitHub contribution graph
- ✅ Created `Memetropolis Intelligence.md` — full technical scan of LayerZero V2 OApp/OFT architecture

### Admin Console Updates
- ✅ **Execution Layer tab** — 5 sub-tabs: All Transactions, Chain Breakdown, On-Chain Log, Withdrawals, Deposits
- ✅ Fixed Invalid Date timestamps (numeric Date.now() → proper date conversion)
- ✅ Volume/fees showing "TBD" until fee structure finalized (failed txs were inflating totals)
- ✅ **API Keys & Socials panel** — X, HeyGen, Telegram, Moltbook, YouTube, TikTok, Instagram, LinkedIn cards

### Frontend Fixes
- ✅ **Withdraw button wired** on Overview page (WithdrawModal portal, mirrors ReloadModal pattern)
- ✅ **isSubmitting bug fixed** — prop was missing from WithdrawStep1 interface/destructuring

### Git History Cleanup
- ✅ Removed ALL `Co-Authored-By: Claude Opus` lines from commits
- ✅ Force-pushed cleaned history to both repos
- ✅ VPS synced with `git reset --hard origin/Build_Branch`

### Chris Investigation
- ✅ Verified all 22 cherry-picked files identical between branches
- ✅ `dark.graphite.css` was never committed to any branch — waiting on Chris

### Agent System Plan
- ✅ Architecture designed: User → Agent → HD wallet → Polymarket CLOB → profits → CCTP → Issuer card
- ✅ DB schema drafted (agents + agent_bets tables)
- ✅ API endpoints spec'd (CRUD agents, place bets, settle profits)

---

## 🟢 Session 14 Completed (2026-04-09)

### Execution Dispatch Engine — NEW (`src/execution-dispatch.ts`)
- ✅ 4 sweep loops running on 60s interval (gated by `ENABLE_EXECUTION_DISPATCH=true`)
  1. **Card Transactions**: pending deposits → verify Issuer received USDC → mark completed
  2. **Market Bets**: pending positions → vault→escrow USDC transfer on Base → mark executed
  3. **Market Payouts**: won positions → escrow→vault USDC on Base → mark paid
  4. **Issuer Balance Sync**: READ from Issuer API → cache in cards.balance → tracks balance_synced_at
- ✅ HD wallet derivation: vault = `HD(PRIVATE_KEY + 'vault_' + userId)`, escrow = `HD(PRIVATE_KEY + 'market_' + marketId)`
- ✅ All operations on Base (settlement layer)

### Issuer Sync Functions — NEW (in `src/issuers.ts`)
- ✅ `syncIssuerBalance(issuerUserId)` — reads balance from Issuer (cents), NEVER writes
- ✅ `getIssuerTransactions(issuerUserId)` — fetches real card transactions
- ✅ `getIssuerCardNumber(owenCardId)` — fetches real PAN/expiry from Issuer

### Centralized Error Reporter — NEW (`src/error-reporter.ts`)
- ✅ All errors from all layers → `execution_log` table
- ✅ Express error middleware for unhandled route errors
- ✅ Process-level uncaughtException + unhandledRejection → execution_log

### Admin API Endpoints — NEW
- ✅ `GET /admin/execution-log` — paginated, filterable by entity_type/status
- ✅ `GET /admin/execution-summary` — 24h dashboard with pending counts
- ✅ `GET /admin/pending-intents` — all pending card txs, market positions, transfers

### DB Migration — `src/migrations/003_execution_dispatch.sql`
- ✅ `execution_log` table with indexes
- ✅ `execution_tx_hash`, `payout_tx_hash`, `executed_at`, `paid_at` on market_positions
- ✅ `escrow_tx_hash`, `escrow_address` on markets
- ✅ `execution_tx_hash`, `updated_at` on card_transactions
- ✅ `balance_synced_at` on cards

### Auditor Violations Fixed (from Session 13)
- ✅ ZERO `UPDATE cards SET balance` writes remain (except Issuer sync cache)
- ✅ `generateDemoCard` KILLED — no fake card data in frontend
- ✅ `generateCardNumber`/`generateExpiryDate` → Issuer placeholders (`**** **** **** ****`)
- ✅ `DEMO_CREDENTIALS` removed from authSlice
- ✅ 8 debug console.logs removed
- ✅ Download receipt wired to real text file download
- ✅ Dead `if(false)` card write block removed
- ✅ Deposits `card_transactions` status `'pending'` until Issuer confirms

### Deploy
- ✅ All commits pushed to `origin/Build_Branch`
- ✅ VPS deployed: migrations 003-006 run, PM2 8+9 restarted, frontend rebuilt
- ✅ Git history rewritten: 124 commits → `103602349+RichardTheBruce@users.noreply.github.com`
- ✅ Branch protection re-enabled

### Growth Agent (Marathon 5) — Infrastructure Built
- ✅ `src/growth-agent/` — 8 files, 849 lines
- ✅ Content Brain, Moltbook, Twitter, Telegram, TikTok, YouTube skills
- ✅ Daily autonomous loop + hourly real-time alerts
- ⚠️ **BLOCKED**: Need `MOLTBOOK_API_KEY` from Chris
- ⚠️ **BLOCKED**: Need Twitter API keys, TikTok token, YouTube OAuth, HeyGen key

### Session 14 Commits (10 total)
| Commit | Description |
|--------|-------------|
| `6b3cd3d` | Execution dispatch engine, Issuer sync, error reporter |
| `4e86c47` | Admin console, card freeze logging, balance sync |
| `2adbd2d` | Sprint 2.2 API feeds + Issuer webhooks |
| `1585f72` | P2P vault-to-vault transfers + admin feeds tab |
| `a21ebe2` | Feed proxy routes, market source badges, P2P by email |
| `a448e72` | Market Oracle auto-resolution (crypto + sports) |
| `36a5e0b` | Admin refresh fix, CoinGecko rate limit fix |
| `714f7d2` | 3-tier P2P (wallet/card/agent destination) |
| `3a8c2ef` | Growth Agent infrastructure (6 platform skills) |
| force push | 124 commits rewritten to GitHub-linked email |

---

## 🟡 Issuer/SD3 Integration — Full Task List (Session 14)

> **Reality**: Issuer unlikely to push webhooks TO us. We DERIVE everything from them via polling.
> **Webhook handler exists** at `POST /issuer-webhook` IF they ever do grant us event subscriptions.
> **Strategy**: Poll-based sync until we have client volume that justifies webhook access.

### Polling-Based Sync (Build Next)
- [ ] **Balance Poller**: Poll `GET /users/:userId/balances` every 60s for all users with Issuer IDs
  - Already partially built in execution-dispatch.ts (Sweep 4: Issuer Balance Sync)
  - Needs: `ENABLE_EXECUTION_DISPATCH=true` env var on VPS to activate
- [ ] **Transaction Poller**: Poll `GET /transactions?userId=` for real card spend data
  - `getIssuerTransactions()` exists in `issuers.ts` — needs periodic sweep
  - Sync real Issuer transactions into card_transactions table (status='completed', source='owen')
- [ ] **KYC Poller**: Poll `GET /users/:userId` for KYC status changes
  - `getIssuerUserStatus()` exists in `issuers.ts` — needs periodic sweep
  - Update `users.kyc_status` when Issuer status changes

### Card Lifecycle
- [x] `listIssuerCards()` — fetch existing Issuer cards before creating ✅ Session 14
- [x] POST /cards tries list first, create only if none ✅ Session 14
- [ ] **Complete Richard's KYC** — camera needed (weekend task)
- [ ] **Full card E2E test**: create card → get real PAN/CVV → check balance → freeze/unfreeze → check transactions
- [ ] **Card number display**: replace placeholder `**** **** **** ****` with Issuer real PAN (SessionId encrypted)

### Webhook (IF Issuer grants access)
- [ ] Register webhook URL: `http://74.50.109.203:3000/issuer-webhook`
- [ ] Events: `transaction.completed`, `application.updated`, `card.created`
- [ ] Add HMAC signature verification (`ISSUER_WEBHOOK_SECRET` env var)
- [ ] Handler already built: stores in `issuer_webhook_events` table, routes to correct DB updates

### Git History
- [x] All 123 commits rewritten to `103602349+RichardTheBruce@users.noreply.github.com` ✅ Session 14
- [ ] **Force push blocked** — branch protection needs to be fully disabled (including "Do not allow bypassing")
- [ ] **Tell Chris**: after force push, he needs `git fetch origin && git reset --hard origin/Build_Branch`

---

## 🔴 Critical / Blocking

### 1. OFT Adapter — Audit, Fix Deployments, Wire bridge.ts ~~(TOP PRIORITY)~~
**Status**: ✅ COMPLETE — all peers live, CCTP V2 confirmed, critical bridge bug fixed

#### What we know (discovered 2026-03-27):
**Architecture** (correct, already in codebase):
```
exotic chain → Arbitrum (LayerZero OFT Adapter both ends) → Base (CCTP V2) → Issuer credits card
```
- OFT Adapter must be on BOTH source chain AND Arbitrum
- Real USDC locked on source → real USDC released on Arbitrum → CCTP to Base
- Issuer ONLY accepts real USDC. Synthetics/wrapped tokens will FAIL.
- The FIRST failed attempt deployed adapter ONLY on Base = synthetic USDC = wrong

**bridge.ts is already written for this architecture** (LZ+CCTP two-step is coded):
- `LZ_CHAIN_MAP` and `LZ_ADAPTER` config at top of bridge.ts
- `bridgeAndForward()` already routes: CCTP chains → direct, non-CCTP → LZ then CCTP
- Route label already says: `LZ+CCTP (chain -> Arbitrum -> Base)`

**Deployed contract addresses** (from `/home/cash/Cashly/deployments/`):
| Chain | Address | Status |
|-------|---------|--------|
| Arbitrum | `0xd58C1412e50fF00212770B170D86e2387D2d2b18` | ✅ Hub — unique address, likely correct |
| Celo | `0xA150EC8B718C22E12036f916d90FF72af14B3E96` | ⚠️ SAME as gnosis/scroll/zksync — suspicious |
| Gnosis | `0xA150EC8B718C22E12036f916d90FF72af14B3E96` | ⚠️ SAME address — needs verification |
| Scroll | `0xA150EC8B718C22E12036f916d90FF72af14B3E96` | ⚠️ SAME address — needs verification |
| zkSync | `0xA150EC8B718C22E12036f916d90FF72af14B3E96` | ⚠️ SAME address — needs verification |
| BSC | ❌ NOT DEPLOYED | needs deploy + fund |

**⚠️ IMPORTANT**: Celo/Gnosis/Scroll/zkSync all showing `0xA150EC8B718C22E12036f916d90FF72af14B3E96` is suspicious. Each chain MUST have a unique contract address. These may be:
- Correctly deployed using CREATE2 with same salt (unlikely across different chains)
- Deployment JSON files may have been copied/corrupted
- **First task next session**: verify on-chain that the contract exists at that address on each chain

**Peer connections wired** (layerzero.config.ts):
- ✅ zkSync ↔ Arbitrum (full config with DVN, send/receive libs)
- ✅ Scroll ↔ Arbitrum (full config)
- ⚠️ Celo → Arbitrum: deployed but NOT in connections array
- ⚠️ Gnosis → Arbitrum: deployed but NOT in connections array
- ⚠️ BSC → Arbitrum: NOT deployed, NOT connected
- ❌ Moonbeam, Mode, Mantle: commented out, not deployed

**CCTP-native chains** (don't need OFT adapter, CCTP directly to Base):
- Ethereum (1), Arbitrum (42161), Optimism (10), Polygon (137), Avalanche (43114)
- Note: `deployments/ethereum|optimism|polygon|avalanche` have `MyOFT.json` (from old attempt) — ignore

**USDC token addresses** (already in hardhat.config.ts):
| Chain | USDC Address |
|-------|-------------|
| Arbitrum | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |
| zkSync | `0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4` |
| Scroll | `0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4` |
| Celo | `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` |
| Moonbeam | `0x931715FEE2d06333043d11F658C8CE934aC61D0c` |
| Mode | `0xd988097fb8612cc24eeC14542bC03424c656005f` |
| Mantle | `0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9` |
| Gnosis | `0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83` |
| BSC | `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` |

**DVN addresses** (already in layerzero.config.ts):
- Arbitrum: `0x23DE2FE932d9043291f870324B74F820e11dc81A`
- zkSync: `0x620A9DF73D2F1015eA75aea1067227571A4dE1b5`
- Scroll: `0xbe0d08a85EeBFCC6eDA0A843521f7CBB1180D2e2`

#### Completed 2026-03-27:
- ✅ Verified all 10 bidirectional LZ peers already live on-chain — nothing to deploy
- ✅ Confirmed CCTP V2 deployed on all 17 Circle chains
- ✅ Fixed critical `bridge.ts` bug: `to` address was `arbitrumAdapterAddress` (self-transfer no-op) → fixed to deployer wallet
- ✅ Fixed `waitForArbUsdc` to poll deployer wallet, not adapter
- ✅ Fixed `cctpArbitrumToBase` to use deployer wallet balance
- ✅ Fixed 3 fallback RPC URLs (XDC, Plume, Codex)

#### Remaining:
- ⚠️ **Fund deployer wallet with ETH on Arbitrum** — needs ETH for CCTP gas
- ⚠️ **Re-enable monitor** once first LZ tx confirmed: `sed -i 's/86400000/60000/' /home/cash/Cashly/src/monitor.ts && pm2 restart 0`
- ⚠️ **Test with small amount** on zkSync → Arbitrum → Base

---

### 2. NotificationsDropdown — ✅ WIRED 2026-04-02, UPDATED 2026-04-03
**Status**: COMPLETE (re-wired after Chris amalgamation overwrote original work)
**What Was Done (original 04-02):**
1. Created `/api/notifications` proxy route (GET/PATCH/POST) — same pattern as transactions proxy
2. Rewrote `useNotifications.ts` hook: real `GET /api/notifications` fetch, optimistic mark-read, mark-all-read
3. Type mapping layer: `mapDbTypeToFe()` — transaction→success, security→warning, alert→error, system/kyc→info
4. Relative time computation: `getRelativeTime()` — "2m", "1h", "3d", "1w", "Mar 28"
5. Frontend build clean, deployed to PM2 id:7
**What Was Re-Done (04-03 — Chris amalgamation overwrote proxy routes + hook):**
1. Re-created all proxy routes (GET, POST read-all, PATCH mark-read)
2. Re-wrote `useNotifications.ts` with `markAsRead`, `markAllAsRead`, `removeNotification`
3. Added `is_dismissed` column to notifications table (BOOLEAN DEFAULT false)
4. Added `PATCH /notifications/:id/dismiss` backend route
5. Updated `GET /notifications` to filter `WHERE is_dismissed = false`
6. Created `/api/notifications/[id]/dismiss` proxy route
7. X button now persists dismissal to DB — dismissed notifications don't return on reload

### 3. ✅ P0: useTransferSubmit.ts — WIRED (Session 5)
**Status**: ✅ COMPLETE — wired to real POST /api/transfers

### 4. ✅ P0: AddTransactionDialog — WIRED (Session 5)
**Status**: ✅ COMPLETE — handleAddTransaction wired to POST /api/card-transactions

### 5. ✅ P0: Phase 5 Proxy Routes — ALL DEPLOYED (Session 5)
**Status**: ✅ COMPLETE — all proxy routes live on VPS, settings components rewritten

### 6. ✅ P1: WithdrawFlow — WIRED (Session 5)
**Status**: ✅ COMPLETE — POST /withdrawals endpoint + proxy + real API call

### 7. ✅ P1: cardActions.config — MOCK_CARDS_DATA DELETED (Session 6)
**Status**: ✅ COMPLETE — MOCK_CARDS_DATA removed (unused), CardListItem settings→navigate to my-card-1, report→toast

### 8. Intent Layer → Execution Layer Contract Test
**Status**: NOT STARTED
**What's Needed:**
1. Confirm `POST /transfers` intent records correctly flow to on-chain execution when RPC is enabled
2. Test: submit transfer → DB records intent with status "pending" → bridge/CCTP picks up → status updates to "completed" → card balance deducted
3. Verify card_controls limits are enforced at intent layer AND honored by execution layer
4. Test failure path: on-chain failure → status updates to "failed" → balance NOT deducted
**Blocked By:** RPC execution layer currently disabled. Enable when ready for live test with small amount.

### 4. POST /card-transactions — Backend Endpoint
**Status**: ✅ COMPLETE — `de7d60e` on Build_Branch (2026-04-03)
**What Was Built:**
- Full card_controls validation: input validation, card lookup, balance check
- Per-transaction / daily / monthly limits with auto-reset boundaries
- High-value alert insertion into `card_alerts`
- Balance deduct (purchase/subscription) or credit (deposit)
- Notification row creation for every transaction
- Safe error logging (one-line, no axios dump)
- End-to-end verified: Frontend proxy → Backend → PostgreSQL

### 4. $1 USDC Recovery — richard@nuro.finance
**Status**: Deferred — waiting for KYC
**Root cause**: Issuer ID `49418fc8` has `applicationStatus: notStarted` → `/contracts` 404 → no Base destination
**USDC**: `0xaBcc89d0aD4Cf75eB4e8d3729B25c8B26eB1f0F4` on Ethereum, $1.00, SAFE
**Action**: richard@nuro.finance completes KYC → Issuer provisions card → re-enable monitor → auto-retries

### 5. Issuer Card ID Null for New Cards
**Status**: Waiting on Issuer/SD3 to enable card creation API endpoint
**Workaround**: DB freeze toggle works locally

---

---

## 🟡 SPRINT: FE Wiring Audit — EVERY BUTTON MUST WORK
> **Master Spreadsheet**: `Neural Net/Cashly/FE_Wiring_Audit.xlsx` (47 items, 3 sheets)
> **Old Sprint Sheet**: `Neural Net/Cashly/FE_Wiring_Sprint.xlsx` (phases 1-5, now merged into audit)
> **Branch**: `Build_Branch` on `RichardTheBruce/Cashly.git`
> **Current Commits**: FE `61b1bea` | BE `d3a4abb` (Stripe integration 04-05)
> **Chris Amalgamation**: `2e982c3` (906 files, 151K lines merged)
> **Status**: Phases 1-5 COMPLETE. P0-P1 ALL DONE. Stripe UNBLOCKED (Session 7). Phase 6 needs backend aggregation API. Phase 7: Privy still blocked.
> **Audit Stats (Session 7)**: ~33 WIRED | 2 BLOCKED (Privy/TOTP) | ~5 MOCK (analytics charts) | 8 DEAD
>
> ⚠️ **DO NOT DEVIATE FROM THE AUDIT SPREADSHEET.** Check it every session. Update status as items complete.

### Phase 1 — Auth (P0) ~2h ✅ COMPLETE
- [x] **T10** Wire login form to POST /auth/login via NextAuth → `useLoginForm.ts` + `useLogin.ts` ✅
  - Added `CASHLY_API_URL=http://localhost:3000` to `.env.local`
  - Set `NEXT_PUBLIC_DESIGN_MODE=false` (disables login bypass)
  - Verified end-to-end: Browser → NextAuth → Express `/auth/login` → PostgreSQL → JWT → session cookie
  - Real login confirmed with `richardthebrucewayne@gmail.com` / fresh `authjs.session-token` (2026 expiry)

### Phase 2 — Cards Core (P0) ~8h ✅ COMPLETE
- [x] **T1** Wire `useCardsState` to `GET /cards` (Agent Cards, My Card) ✅ (wired Session 4)
- [x] **T2** Wire card balance to `GET /cards` sum (Overview hero) ✅ replaced `defaultBalance=2800.28` mock with real `/api/cards` fetch
- [x] **T3** Wire CardLimits to `GET/PATCH /cards/:id/controls` (My Card → Limits tab) ✅ (wired Session 4)
- [x] **T4** Wire Freeze toggle to `PATCH /cards/:id/freeze` (My Card, Agent Cards) ✅ (wired Session 4)
- [x] **T5** Wire card name edit to `PATCH /cards/:id` (Card Controls → Details) ✅ (wired Session 4)
- [x] **T6** Wire Card Details PAN/expiry to real data (`useCardNumber.ts` — UI toggle only, data from useCardsState) ✅

### Phase 3 — Transactions (P0-P1) ~3.5h ✅ COMPLETE
- [x] **T7** Remove MOCK_TRANSACTIONS_DATA fallback — ✅ proxy bypass removed `7dd758b`
- [x] **T8** Wire Overview TransactionsPanel to real DB data — replaced hardcoded "Pierre DC" config with `useTransactionsState` hook ✅
- [x] **T9** Wire `useRecentTransactions` to proxy route — fixed broken `NEXT_PUBLIC_API_URL=localhost:0` → relative `/api/transactions` ✅
  - Cosmetic tail items: isIncoming logic, translation key leaking, "Deposit" label for all types

### Phase 4 — Notifications (P1) ~3.5h ✅ COMPLETE
- [x] **T14** Wire NotificationsDropdown to `GET /notifications` → created `/api/notifications` proxy route ✅
- [x] **T15** Wire mark-read to `PATCH /notifications/:id/read` → created `/api/notifications/[id]/read` proxy, verified DB persistence ✅
- [x] **T16** Wire read-all to `POST /notifications/read-all` → wired via POST to `/api/notifications` proxy ✅
  - Rewrote `useNotifications.ts` from mock (hardcoded 12 items) to real API with `markAsRead`, `markAllAsRead`, `removeNotification`
  - Fixed function scope bug (removeNotification was inserted outside useNotifications closure)

### Phase 5 — User Profile & Settings (P1-P2) ~5h ✅ COMPLETE
- [x] **T10b** Wire Greeting component to real user name from NextAuth session ✅
- [x] **T11** Wire Profile settings to `GET/PATCH /users/me` + `/users/profile` ✅ (Session 5)
- [x] **T12** Wire Security (change password) to `POST /users/change-password` ✅ (Session 5)
- [x] **T13** Wire Notification prefs to `PATCH /users/notifications` ✅ (Session 5)
- [x] **T-new** Wire PreferencesContent to `GET/PATCH /users/preferences` ✅ (Session 6 — new JSONB column)
- [x] **T-new** Wire PrivacyDataContent Export to `GET /users/export-data` ✅ (Session 6 — real download)
- [x] **T-new** Wire PlanBillingContent to real plans/subscriptions/billing ✅ (Session 6 — 3 new tables, 4 new routes)
- [x] **T-new** Wire CardSettings alerts/threshold/gradient to `PATCH /cards/:id` ✅ (Session 6 — new DB columns)
- [x] **T-new** Wire TransactionFilterDialog to real query params ✅ (Session 6 — useTransactionsState→/api/card-transactions)

### Phase 6 — Dashboard Viz (P3) ~12.5h — NEEDS BACKEND AGGREGATION API
- [ ] **T17** Wire Overview CardStack to real card data
- [x] **T18** Wire Overview TransactionsPanel to real data ✅
- [x] **T19** Wire BarChart/RevenueChart to real transaction aggregates ✅ (Session 9 — `GET /analytics/revenue`)
- [x] **T20** Wire StatisticsChart to real data ✅ (Session 9 — `GET /analytics/statistics`)
- [x] **T21** Wire CategoryChart to real spending categories ✅ (Session 9 — `GET /analytics/categories`)
- [x] **T22** Wire WeeklyActivity to real data ✅ (Session 9 — `GET /analytics/weekly`)

### Phase 7 — Future (P3-P4) ~14h — BLOCKED: external integrations
- [ ] **T23** Wire Wallets settings (`MOCK_WALLETS` → real) — blocked on Privy
- [x] **T24** Subscription page — ✅ DONE (Session 6 tables/routes + Session 7 Stripe webhooks/checkout/portal). Full Stripe integration live.
- [x] **T25** Wire Data & Privacy export — ✅ DONE (Session 6 — `/api/users/export-data`)

### New Proxy Routes — ALL CREATED ✅
- [x] **T26** `/api/users/me` ✅ (Session 5)
- [x] **T27** `/api/users/profile` ✅ (Session 5)
- [x] **T28** `/api/users/change-password` ✅ (Session 5)
- [x] **T29** `/api/notifications` ✅ (Session 4)
- [x] **T30** `/api/card-transactions` ✅ (Session 5)
- [x] **T31** `/api/users/preferences` ✅ (Session 6)
- [x] **T32** `/api/users/export-data` ✅ (Session 6)
- [x] **T33** `/api/plans` ✅ (Session 6)
- [x] **T34** `/api/subscriptions/me` ✅ (Session 6)
- [x] **T35** `/api/subscriptions/upgrade` ✅ (Session 6)
- [x] **T36** `/api/billing/history` ✅ (Session 6)
- [x] **T37** `/api/stripe/create-checkout-session` ✅ (Session 7)
- [x] **T38** `/api/stripe/create-portal-session` ✅ (Session 7)
- [x] **T39** `/api/stripe/seed-prices` ✅ (Session 7)
- [x] **T40** `/api/kyc/status` ✅ (Session 10)
- [x] **T41** `/api/kyc/start` ✅ (Session 10)
- [x] **T42** `/api/deposit-addresses` ✅ (Session 10)
- [x] **T43** `/api/auth/register` ✅ (Session 10)
- [x] **T44** `/api/analytics/revenue` ✅ (Session 9)
- [x] **T45** `/api/analytics/statistics` ✅ (Session 9)
- [x] **T46** `/api/analytics/categories` ✅ (Session 9)
- [x] **T47** `/api/analytics/weekly` ✅ (Session 9)
- [x] **T48** `/api/analytics/stats` ✅ (Session 9)

### 🔴 Session 8 Regressions (reported by Richard 04-05, fixed in Session 8)
- [x] **R1** Card Controls (limits/settings) don't persist after navigating away — **FIXED**: my-card-1/index.tsx now fetches real card data from API on mount, freeze toggle persists via PATCH /api/cards/:id
- [x] **R2** Card Name saves in display but doesn't persist after navigation — **FIXED**: CardDetails.handleSaveName now calls PATCH /api/cards/:id with card_name, cardId passed from parent
- [x] **R3** Card number appears fake / generated — **FIXED**: my-card-1 now loads real cardNumber/expiryDate from API, defaults changed from hardcoded fake values to empty strings. Copy button now shows Check icon + green "Copied" feedback via isCopied state in useCardNumber hook
- [x] **R4** Agent Cards not saving card name or card details — **FIXED**: same root cause as My Card, useCardsState.handleCardNameChange already has PATCH call. Agent Cards shares the hook. The fix to card API route ensures real data flows.
- [x] **R5** Transactions still showing mock data — **FIXED**: useTransactionsState no longer defaults to mock data. Starts with empty array + isLoading=true, fetches from /api/card-transactions. Removed MOCK_TRANSACTIONS_DATA import and mock fallback paths.
- [x] **R-bonus** Balance display $0,000.00 format — **FIXED**: BalanceDisplay.tsx now dynamically computes Counter places array based on balance magnitude instead of hardcoded [1000, 100, 10, 1]
- [ ] **R6** Freeze Card ("Spending is disabled") — UI works and now persists to DB via PATCH. Still need to verify Issuer/SD3 API communication
- [ ] **R7** Wallet Connect button doesn't trigger connect — need to integrate Privy system per Chris's request (currently blocked on Privy env vars)

### Cosmetic Tail Items (not blocking, log for later)
- [x] ~~Balance display shows `$0,000.00` instead of `$144.50`~~ ✅ (Session 8 — dynamic places array in BalanceDisplay.tsx)
- [x] ~~Transactions all show "Deposit" with green~~ ✅ (Session 9 — isIncoming logic fixed)
- [x] ~~"Dashboard.groceries" translation key leaks~~ ✅ (Session 9 — missing keys added to EN/AR)
- [x] ~~Greeting shows email prefix not proper name~~ ✅ (Session 10 — `name` added to JWT payload in login/register)
- [ ] Greeting display name should be selectable (first name, alias, card name) in settings
- [ ] FastTransferSection Send button — widget has no editable inputs, needs UI redesign (P3)
- [ ] Smart Invest "More" link → Coming Soon toast (no backend for yield agents yet)
- [x] ~~Analytics charts (BarChart, StatisticsChart, CategoryChart, WeeklyActivity)~~ ✅ (Session 9 ��� 5 endpoints + 5 proxy routes + 5 chart components wired)
- [ ] WorldMapWidget transfer markers — needs geolocation data on transfers
- [ ] DateRangePicker on Overview — buildFilterQuery exists, needs to surface on Overview page
- [ ] `useWallets` Privy console warning (harmless, Privy disabled)
- [x] ~~Subscription payment processing~~ ✅ (Session 7 — Stripe webhooks, Checkout, Portal, price seeding all live)

---

## 🟢 Completed (2026-04-05 Session 10) — Card Controls Enforcement + Site Audit + Proxy Routes

- [x] **card_controls enforcement in POST /card-transactions** — auto-upsert defaults, enforce daily/monthly/per-tx limits, fire alerts at >80% usage ✅
- [x] **CardContent overlay re-enabled** — card number, holder name, expiry, brand rendered on PNG card graphic ✅
- [x] **KYC banner fixed** — uses /api/kyc proxy routes instead of direct NEXT_PUBLIC_API_URL ✅
- [x] **Transaction filter subtotals** — income/debits/net summary bar shown when filters active ✅
- [x] **JWT name field** — `name` added to JWT payload in login + register endpoints ✅
- [x] **4 new proxy routes** — /api/kyc/status, /api/kyc/start, /api/deposit-addresses, /api/auth/register ✅
- [x] **All direct API_URL calls fixed** — DepositModal, ReloadModal, useKycPolling, RegisterLayout → /api/ proxy ✅
- [x] **Mock data cleanup** — dashboard stats zeroed, auth auto-login removed, demo transactions cleared, settings defaults cleaned ✅
- [x] **Language selector** — all languages now functional (was English-only) ✅
- [x] **Miscellaneous** — "Loading2026" typo, empty onClick handlers, arena mock agents cleared ✅
- [x] **Deployed** — commit `9c1866a`, both PM2 services restarted, build clean ✅

## 🟢 Completed (2026-04-05 Session 9) — Root Cause Fix + Analytics Pipeline

- [x] **ROOT CAUSE FIX: /api/cards/route.ts design mode bypass removed** — mock data returned when NODE_ENV=development ✅
- [x] **Transaction filter case mismatch fixed** — case-insensitive in useTableColumns.tsx ✅
- [x] **CardLimits cardId prop passed** — was undefined, skipping all API calls ✅
- [x] **Translation key leaks fixed** — missing category keys added to EN/AR ✅
- [x] **isIncoming logic fixed** — purchases correctly show as outgoing (red) ✅
- [x] **5 analytics backend endpoints + 5 proxy routes + 5 chart components** wired to real data ✅

---

## 🟢 Completed (2026-04-03 Session 2) — FE Wiring Sprint Phases 1-5

### Phase 1: Auth ✅
- [x] Added `CASHLY_API_URL=http://localhost:3000` to `.env.local`
- [x] Set `NEXT_PUBLIC_DESIGN_MODE=false` — login bypass disabled
- [x] Verified full auth pipeline: Browser → NextAuth → Express → PostgreSQL → JWT → session cookie
- [x] Confirmed with `richardthebrucewayne@gmail.com` / `Nuro2026` — real login works

### Phase 2: Cards Core ✅ (5 of 6 already wired from Session 4, 1 fixed)
- [x] `useAccountBalance` — replaced `defaultBalance=2800.28` mock with real `/api/cards` sum via `useSession`

### Phase 3: Transactions ✅
- [x] Overview TransactionsPanel — killed "Pierre DC" hardcoded config, wired to `useTransactionsState` (real DB data)
- [x] `useRecentTransactions` — fixed broken `NEXT_PUBLIC_API_URL=http://localhost:0` → relative proxy `/api/transactions`

### Phase 4: Notifications ✅
- [x] Created proxy routes: `/api/notifications` (GET+POST), `/api/notifications/[id]/read` (PATCH), `/api/notifications/[id]/dismiss` (PATCH)
- [x] Rewrote `useNotifications.ts` from 12-item hardcoded mock to real DB fetch with `markAsRead`, `markAllAsRead`, `removeNotification`
- [x] Added `is_dismissed` column to notifications table
- [x] Added `PATCH /notifications/:id/dismiss` backend route (sets `is_dismissed=true`)
- [x] Updated `GET /notifications` to filter `WHERE is_dismissed = false`
- [x] Fixed scope bug — `removeNotification` was inserted outside function closure

### Phase 5: Profile (partial) ✅
- [x] auth.ts JWT callback now stores and passes `user.name` through session
- [x] `Greeting.tsx` reads from NextAuth `session.user.name` with Redux + "User" fallbacks

### Commits
- `ff4cf4a` — feat: notification dismiss endpoint + filter dismissed from GET (backend)
- `50142aa` — feat: FE wiring sprint phases 1-5 (frontend, 11 files, 243 ins, 201 del)
- Backend push rejected (Chris pushed to Build_Branch) — needs pull+reconcile next session
- Frontend pushed successfully `7dd758b..50142aa`

---

## 🟢 Completed (2026-04-03 Session 1) — POST /card-transactions + Chris FE Amalgamation + Pipeline Wiring

### Backend: POST /card-transactions with card_controls validation
- [x] Replaced bare-bones stub (line 456, 13 lines) with full 87-line handler ✅
- [x] Input validation: name, type, amount, category with specific error messages ✅
- [x] Card lookup with fallback to first unlocked card, lock check ✅
- [x] Balance check for debit transactions (purchase, subscription) ✅
- [x] card_controls enforcement: per_transaction_limit, daily_limit (with auto-reset), monthly_limit (with auto-reset) ✅
- [x] High-value alert insertion into card_alerts when threshold exceeded ✅
- [x] Balance deduct/credit + transaction INSERT + notification INSERT ✅
- [x] Safe error logging (one-line, no axios dump) ✅
- [x] Committed `de7d60e` → pushed to `origin/Build_Branch` ✅

### Chris FE Amalgamation — Merged to Build_Branch
- [x] Chris initialized git, connected to `RichardTheBruce/Cashly.git`, pushed to `Build_Branch` ✅
- [x] 906 files changed, 151,267 insertions — unified pages, layouts, components ✅
- [x] Verified Chris didn't touch backend files (issuers.ts, monitor.ts, nuro-routes.ts, db.ts, config.ts) ✅
- [x] `.env.local` clean — no creds, just localhost URLs + Privy (design mode) ✅
- [x] SD3 docs are public PDFs, not credentials ✅
- [x] Build passes clean: `npx next build` zero errors ✅
- [x] Commit `2e982c3` — linear history on top of `de7d60e` ✅

### VPS Frontend Deployment
- [x] Switched VPS frontend from `main` to `Build_Branch` (backup on `backup-main-before-switch`) ✅
- [x] Fixed missing `start` script in package.json (Chris's Hardhat pkg.json overwrote Next.js scripts) ✅
- [x] Removed design mode mock data bypass from `/api/transactions/route.ts` (was returning "Google Cloud" / "Amazon") ✅
- [x] Added `BACKEND_URL=http://localhost:3000` to `.env.local` ✅
- [x] Removed invalid `NEXT_PUBLIC_PRIVY_APP_ID` causing "Cannot initialize Privy provider" crash ✅
- [x] End-to-end pipeline verified: Frontend proxy → Express → PostgreSQL → back ("Pipeline Test" round-trip) ✅
- [x] Committed `7dd758b` → pushed to `cashly/Build_Branch` ✅

### Monitor Crash Loop Fix (from earlier 04-03 session)
- [x] Diagnosed 1,947 PM2 restarts hammering Issuer API → applicant deactivated ✅
- [x] Root cause: in-memory `lastSeen` Map reset on restart → re-detect → Issuer 404 → error dump → crash ✅
- [x] Three-layer fix: `seedLastSeenFromDb()` + dedup check + safe error logging ✅
- [x] Cleaned 15 duplicate failed transaction rows, kept 1 for audit ✅
- [x] Committed `337f4a3` → pushed to `origin/Build_Branch` ✅

### Build_Branch History (linear, both repos aligned)
```
50142aa  feat: FE wiring sprint phases 1-5 (FE repo) ← LATEST
ff4cf4a  feat: notification dismiss + is_dismissed filter (BE repo) ← needs push (rejected, pull first)
7dd758b  fix: Next.js scripts, mock bypass, BACKEND_URL (FE repo)
2e982c3  feat: Chris FE amalgamation (FE repo)
de7d60e  feat: POST /card-transactions with card_controls (BE repo)
337f4a3  fix: monitor crash loop (BE repo)
ec51170  feat: notifications API routes (BE repo)
```

### FE Wiring Sprint Plan Created
- [x] Audited all mock data sources, API proxy routes, hooks, config files ✅
- [x] Mapped 30 tasks across 7 phases with priority/status/dependency tracking ✅
- [x] Created `FE_Wiring_Sprint.xlsx` with Sprint Plan, Summary, and Phases sheets ✅
- [x] P0+P1 tasks total ~21 hours, Phases 1-5 require no new backend endpoints ✅

---

## 🟢 Completed (2026-03-27) — Bridge Audit + Fix

- [x] LZ peer audit — 10/10 bidirectional peers confirmed live on-chain (no deploy needed)
- [x] CCTP V2 audit — 17/17 chains confirmed deployed (TOKEN_MESSENGER_V2 `0x28b5...`)
- [x] Critical `bridge.ts` bug fixed — `to: arbitrumAdapterAddress` (self no-op) → `to: deployer wallet`
- [x] `waitForArbUsdc` fixed — polls deployer wallet, not adapter
- [x] `cctpArbitrumToBase` fixed — uses deployer wallet balance
- [x] RPC URL fixes — XDC (`rpc.xdc.org`), Plume, Codex paths corrected
- [x] Architecture.md updated — LZ bridge section added, TODO removed
- [x] Daily log 3-27-2026.md written

## 🟢 Completed (2026-04-02) — FE/DB Rebase + DB Tables + Transfer API + NotificationsDropdown Wiring

### Chris FE Rebase onto DB-Wired Backend
- [x] **Audited all 6 Chris commits on `origin/build`** — 5 already cherry-picked, 6th (`47840a2` theme base) unnecessary (content carried forward by later picks) ✅
- [x] **Investigated 5 target files** — my-card-v2, useCardsState, ReloadFlow, CardLimits, wallet-1 ✅
- [x] **my-card-v2/index.tsx fully rewritten** — merged Chris's 3-column layout (FeaturedCard + QuickActions | UpcomingPayments + RecentTransactions + CardControls | SpendingChart + AvailableCards) with our DB hooks (`useCardsState`, `useRecentTransactions`, `ReloadModal`, `SkinPicker`, card name PATCH) ✅
- [x] **CardLimits.tsx theme-tokenized** — swapped hardcoded colors for Chris's CSS variables (`var(--color-success)`, `var(--color-bg-input)`, `var(--color-warning)`, etc.) while keeping real `useCardControls(cardId)` DB wiring ✅
- [x] **useCardsState.ts — kept ours** — Chris's version was pure mock (`MOCK_CARDS_DATA`), ours has real `/api/cards` fetch with auth token ✅
- [x] **ReloadFlow.tsx — no change needed** — both versions already matched from prior cherry-picks ✅
- [x] **wallet-1/index.tsx — kept ours** — our version has `WalletPrivyContent` + `Wallet1Feature` guard shell with "Coming Soon" fallback. Chris's would crash without PrivyProvider ✅
- [x] **Deployed to VPS** — base64 file transfer, build clean, PM2 id:7 restarted ✅
- [x] **Committed `32c9483`** — "feat: rebase Chris's FE design onto DB-wired backend" ✅
- [x] **Pushed to `cashly/frontend`** — 15 commits ahead of `origin/main` ✅

### DB Tables + Transfer API + NotificationsDropdown Wiring

- [x] **`transfers` table created on VPS** — 12 cols, 3 indexes, CHECK constraints (amount 1-1M, currency USD/GBP/JPY, status pending/completed/failed/cancelled) ✅
- [x] **`social_auth` table created on VPS** — 7 cols, 2 indexes, UNIQUE(provider, provider_id), FK to users ✅
- [x] **`POST /transfers` endpoint built** — full validation chain: auth → card lookup → balance check → card_controls limits (per_transaction_limit, daily, monthly) → INSERT → deduct balance → update controls used → create notification ✅
- [x] **`GET /transfers` endpoint built** — paginated history with status filtering ✅
- [x] **`per_tx_limit` renamed to `per_transaction_limit`** — DB column + all code + all docs ✅
- [x] **NotificationsDropdown wired to real API** — rewrote `useNotifications.ts` hook from mock (12 hardcoded items) to real `GET /api/notifications` with type mapping + relative time computation ✅
- [x] **`/api/notifications` proxy route created** — GET (fetch), PATCH (mark read), POST (mark all read) ✅
- [x] **DB Contract Library expanded** — 12→16 modals, 57→67 data objects, Chris's Zod schemas mapped ✅
- [x] **Boot kernel updated** — all paths from `Keys/Cashly/` → `AFI/Neural Net/`, 3 new rules (#16-18) ✅
- [x] **Chris's origin/build audited** — 3 new nav commits (all CSS/theme, no data impact) ✅

## 🟢 Completed (2026-04-01) — Documentation Rebuild

- [x] **Modal Library.md completely rebuilt** — expanded from 10 to 13 entries, added NotificationsDropdown, CardLimits, CardControls (Alerts). Added status summary table, priority wiring order, type mapping docs, "Wired" dates. ✅
- [x] **API Endpoints.md updated** — added Card Transactions, Notifications (3 routes), Card Controls (3 routes) sections that were missing. ✅
- [x] **Database.md updated** — added notifications, card_transactions, card_controls, card_alerts table schemas with row counts and seed data info. Added migration history entries. ✅
- [x] **DB & Modal Graph.md updated** — added NotificationsDropdown, CardLimits, CardControls to modal mapping table. ✅
- [x] **INDEX.md priorities refreshed** — updated from stale 2026-03-28 priorities to current state. ✅
- [x] **Pending Tasks.md updated** — marked 2026-03-31 work, added new items. ✅
- [x] **Missing dates fixed** across completed items in all docs. ✅

## 🟢 Completed (2026-03-31) — Notifications Backend + Seed Data + Vault Restructure

- [x] **notifications table created** — 9 columns, 4 indexes (including partial unread index), FK cascade to users ✅
- [x] **3 notification API routes built** — `GET /notifications`, `PATCH /notifications/:id/read`, `POST /notifications/read-all` in nuro-routes.ts. All use `requireAuth` + `db.query()` pattern. ✅
- [x] **Notification seed data** — 8 realistic rows (transaction deposits, card frozen, KYC approved, spending alerts, login detection) ✅
- [x] **card_transactions seed data** — 12 new rows (Whole Foods, Netflix, Uber, Amazon, Starbucks, Spotify, Shell, Target, Chipotle, USDC deposits/withdrawals) — table went from 1 row to 13 ✅
- [x] **Backend commit** — `ec51170` on `Build_Branch` (notification routes) ✅
- [x] **Obsidian vault restructure** — Created `Schema & Tables/` folder (9 docs), `Claude_Memory/Modal Library.md`, `Claude_Memory/DB & Modal Graph.md`. Migrated Claude_Memory/ to root. Deleted recursive nested `Cashly/` dirs. ✅
- [x] **Wikilinks audit** — Added 4-7+ links to all 30+ .md files for Obsidian graph visualization ✅
- [x] **Frontend build verified** — 37/37 static pages, 0 errors, both PM2 services stable ✅

## 🟢 Completed (2026-03-29 Session 4) — Login Fix + Real Data Wiring + Mock Cleanup

- [x] **Login fixed** — `useLogin.ts` rewritten to call NextAuth `signIn("credentials", ...)` instead of Redux `loginUser` thunk (which had hardcoded demo credentials and never hit backend) ✅
- [x] **`/api/auth/login` proxy route added** — proxies POST to backend `POST /auth/login` ✅
- [x] **`router.push("/dashboard")` → `/en/dashboard`** — locale prefix required ✅
- [x] **useCardsState real data** — fetches from `/api/cards` with NextAuth session token, `handleAddCard` calls `POST /api/cards`, `handleLockToggle` persists `PATCH /api/cards/${cardId}`, `handleCardNameChange` persists card_name ✅
- [x] **useCardsStats real data** — removed hardcoded `$428` average daily spend and `12.5%` change, now computes from real card data ✅
- [x] **useTransactionsState mock removal** — replaced all `setTransactions(mockTransactions)` fallbacks with `setTransactions([])` ✅
- [x] **Card Controls bug fixed** — `useCardControls.ts` had escaped template literals (`Bearer \${token}`) causing all API calls to silently fail ✅
- [x] **Card name persistence fixed (Agent Cards)** — `handleCardNameChange` was writing to `cardType` instead of `cardName` in state; CardsGrid was initializing from `cardType` instead of `cardName` ✅
- [x] **Card name persistence fixed (My Card)** — was hardcoded to `"My Card"`, added `handleSaveCardName` with backend PATCH, useEffect sync from selectedCard ✅
- [x] **ReloadFlow chain names** — replaced fake "Chain 1, 2, 3..." with 20 real network names (Ethereum, Arbitrum, Optimism, etc.) ✅
- [x] **Cherry-picked Chris's Agent Cards** — 3 commits from `origin/build`, resolved 3 merge conflicts ✅
- [x] **DB cleanup** — deleted 8 fake $0 cards, cleaned 8 orphaned card_controls, seeded real $21.93 USDC deposit transaction ✅
- [x] **POST handler added to `/api/cards/route.ts`** — proxy for card creation ✅
- [ ] ⚠️ **UNCOMMITTED on VPS** — All auth fixes, useCardsState rewrite, useCardControls fixes, proxy routes, stats fixes, chain names, card name persistence, mock data removal

## 🟢 Completed (2026-03-28 Session 3) — Build Crisis + Auth + Routing Fix

- [x] Diagnosed 130 Turbopack errors from `thread-stream` (pino → @walletconnect → @privy-io/react-auth) ✅
- [x] Downgraded Next.js 16.0.10 → 15.5.14 — Turbopack crash gone ✅
- [x] Added `export const dynamic = "force-dynamic"` to `[locale]/layout.tsx` — prevents static prerender ✅
- [x] Cleaned up `next.config.js` — removed `resolveAlias`, kept `serverExternalPackages` ✅
- [x] Deleted `src/stubs/pino.js` — not needed on Next.js 15 ✅
- [x] Fixed runtime SSR crash — added `SessionProvider` to `Providers.tsx` (NextAuth v5 requires it) ✅
- [x] Fixed `ProtectedRoute.tsx` — added `mounted` guard for SSR safety ✅
- [x] Fixed sidebar routing — `my-card-1` route didn't exist, redirected "My Card" to `my-card-v2` ✅
- [x] Added "Activate My Card" sidebar item → `/dashboard/my-card` ✅
- [x] First commit pushed: `8f175cb` → `cashly/frontend` (NJ15 downgrade + force-dynamic) ✅
- [ ] ⚠️ Second commit NOT pushed — SessionProvider, ProtectedRoute, sidebar config still uncommitted
- [ ] ⚠️ `navigation.config.tsx` may have syntax error from sed — verify before building

## 🟢 Completed (2026-03-28 Session 2) — Major Visual Upgrade + Transaction Wiring

- [x] CreditCard redesigned — now uses PNG card face images (black/blue/green/purple/white) ✅
- [x] Chris's full UI pulled selectively — overview, settings, sidebar, header, auth, transactions ✅
- [x] CardSection merged — Chris's frozen coral animations + our real `useCardsState` data ✅
- [x] `src/app/api/transactions/route.ts` added — proxies to backend `/card-transactions` ✅
- [x] `useTransactionsState` updated — fetches real data via session token, falls back to mock ✅
- [x] `TransactionsPanel` overview widget — fetches real transactions, groups by today/older ✅
- [x] Wallet-1 white page fixed — split into shell + PrivyContent, graceful fallback when no Privy ✅
- [x] `src/lib/blockExplorer.ts` added — EVM chain explorer URL helpers ✅
- [x] TypeScript: 0 errors ✅
- [x] Pushed to `RichardTheBruce/Cashly` `frontend` branch — commit `427f0a7` ✅

## 🟢 Completed (2026-03-28 Session 1) — Card Graphic Fixes

- [x] UUID on card graphic fixed — `id: c.id` (DB UUID) → `id: cardType label ("VISA")` ✅
- [x] React key decoupled from display label — `key={card.id}` → `key={card-${originalIndex}}` ✅
- [x] "VIRA" typo fixed globally — backend default, DB (8 rows), demo config all updated ✅

---

## 🟢 Completed (2026-03-27) — Frontend Tier 1+2 + ReloadModal

- [x] Balance display fix — `getBalancePlaces()` dynamic digit slots ✅ 3-27
- [x] Statistics/Stock/Transfer demo data removed — empty states ✅ 3-27
- [x] Freeze subtitle wired to `isFrozen` state ✅ 3-27
- [x] `card_name` DB column + `PATCH /cards/:id` saves name ✅ 3-27
- [x] `useCardFreeze` hook — optimistic UI → Issuer freeze API ✅ 3-27
- [x] `useCardData` hook — real card fetch from backend ✅ 3-27
- [x] USDT + DAI added to ReloadModal token picker ✅ 3-27
- [x] Chris's 5 VPS commits recovered from git reflog + merged ✅ 3-27
- [x] 6 TypeScript build errors in Chris's code fixed ✅ 3-27
- [x] Frontend build clean: `✓ Compiled in 6.3s`, TypeScript passing ✅ 3-27
- [x] `RichardTheBruce/Cashly` Build_Branch synced — commit `327435e` ✅ 3-27
- [x] `nurostack/nuro-finance-dashboard` main synced — commit `7fb8f19` ✅ 3-27

## 🟢 Completed (2026-03-27) — Card Controls

- [x] Card Controls DB migration (`card_controls`, `card_alerts` tables) ✅ 3-27
- [x] GET/PATCH /cards/:id/controls + GET /cards/:id/controls/alerts API routes ✅ 3-27
- [x] CardLimits.tsx rewritten — fetches real data, saves via PATCH, real progress bars ✅ 3-27
- [x] my-card-1/index.tsx patched — fetches cardId and passes to CardLimits ✅ 3-27
- [x] Clean build + deploy (PM2 id:7, 185ms) ✅ 3-27

## 🟢 Completed (2026-03-26)

- [x] CardSection props fix (my-card-1 build errors resolved) ✅ 3-26
- [x] my-card-1 wired into sidebar nav as "My Card" → /dashboard/my-card-1 ✅ 3-26
- [x] Monitor paused (86400s) — re-enable: `sed -i 's/86400000/60000/' /home/cash/Cashly/src/monitor.ts && pm2 restart 0` ✅ 3-26
- [x] Base chain fix in ReloadModal ✅ 3-26
- [x] Monitor balance update after bridge (updateCardBalance) ✅ 3-26
- [x] POST /cards crash fixed ✅ 3-26
- [x] Deposit-addresses endpoint fixed ✅ 3-26
- [x] Monitor reduced from 15s to 60s ✅ 3-26

---

## 🔵 Backlog — UI/UX Fixes (Easiest → Hardest)

> Updated 2026-03-27 from screenshot review session

---

### 🟢 Tier 1 — Pure Frontend (No DB/API Changes)

- [x] **Balance display fix** — `getBalancePlaces()` dynamic digit slots — no more leading zeros ✅ 3-27
- [x] **Statistics chart demo data** — Replaced with empty state (📈 "No data yet") ✅ 3-27
- [x] **Fast Transfer section fake data** — Replaced with empty state ✅ 3-27
- [x] **Smart Invest fake tickers** — Removed TFLO/DVCR/CNIN/FSLB, shows empty state ✅ 3-27
- [x] **Freeze subtitle hardcoded** — Now reads from `isFrozen` state ✅ 3-27
- [x] **Copy buttons** — HTTP clipboard fallback via `execCommand` (no HTTPS required) ✅ 3-27. Toast confirmation still pending.
- [x] **UUID on card graphic** — Fixed: card now shows "VISA" label top-right, real card number center ✅ 3-28
- [x] **Copy buttons toast** — "Copied!" check icon on CardNumberRow, address copy in ReloadModal ✅ 3-28
- [ ] **Card color → card visual sync** — Color swatch picker disconnected from actual card gradient.

---

### 🟡 Tier 2 — Simple DB Column + Endpoint

- [x] **Card name persistence** — `card_name` column added, `PATCH /cards/:id` saves it, frontend fires on checkmark ✅ 3-27
- [x] **Freeze Card → Issuer API** — `useCardFreeze` hook wired: optimistic UI → `PATCH /api/cards/[id]/freeze` → Express → `freezeCard()` → Issuer ✅ 3-27
- [x] **Real card data fetch** — `useCardData` hook: `GET /api/cards` → id, balance, is_locked, card_name ✅ 3-27
- [x] **USDT + DAI in ReloadModal** — Interactive token picker with USDC/USDT/DAI, icons, drives all modal labels ✅ 3-27
- [ ] **Add Card button** — Currently adds fake random card UI only. Needs real `POST /cards` via Issuer API to provision a real card, then store in DB.
- [x] **Card display name on card graphic** — CardContent shows cardholder name only (avoids PNG overlap) ✅ Session 10
- [x] **KYC "Verify Now" banner** — Now uses /api/kyc proxy routes, hides when status=approved ✅ Session 10

### Session 10b Catches (from Richard's testing)
- [x] **Card graphic text overlay clash** — CardContent was rendering card number + expiry + VISA on top of PNG that already has them. Fixed to only show cardholder name positioned above crypto icons ✅ Session 10b
- [x] **Copy button fails on HTTP** — CardDetails used `navigator.clipboard.writeText` (HTTPS-only). Switched to `copyToClipboard()` with execCommand fallback ✅ Session 10b
- [x] **Agent Cards: CardLimits missing cardId** — `<CardLimits />` → `<CardLimits cardId={selectedCard?.id} />` so controls fetch+save to correct card ✅ Session 10b
- [x] **Agent Cards: gradient not persisting** — `handleCardColorChange` had no PATCH call. Added `fetch /api/cards/${cardId}` with `{ gradient }` ✅ Session 10b
- [x] **Transaction filter tabs not matching** — Income/Debits filters used translated category names ("Income"/"Transfer") but DB has raw types ("deposit"/"purchase"). Fixed to filter by `type` column with actual DB values ✅ Session 10b
- [x] **CardContent overlay removed** — PNG card face already contains all visual elements. Overlay was clashing with crypto icons and VISA logo ✅ Session 10c
- [x] **CardSettings saving to wrong card** — Was always fetching first card from /api/cards. Now accepts `cardId` prop and targets correct card for gradient/alert/threshold saves ✅ Session 10c

### Session 11 (2026-04-07)
- [x] **GitHub branch protection** — Build_Branch requires 1 PR approval before merge, stale approvals dismissed ✅
- [x] **Bridge Test 1 verified** — DB confirmed $0.10 on card ad9aac89, tx hash on-chain ✅
- [x] **Bridge Test 2 (CCTP Eth→Base)** — Deposit detected, burn tx sent, attestation started but user cancelled (time). CCTP burn is on-chain, can be completed later ⚠️
- [x] **Monitor fixes** — seedLastSeenFromDb now only seeds pending (not confirmed), threshold gt→gte + 0.1→0.01, Ethereum RPC swapped from dead Alchemy to publicnode ✅
- [x] **Issuer card creation 400 fix** — "Card limit reached" because Issuer limits 1 card/user. POST /cards now reuses existing issuer_card_id ✅
- [x] **per_transaction_limit column fix** deployed to VPS ✅
- [x] **ReloadFlow chain names** — Replaced fake "Chain 2, 3..." with 23 real network names in my-card-1 ✅
- [x] **DB cleanup** — Deleted 7 duplicate cards, consolidated $145.30 balance on main card ✅
- [x] **KYC banner on ALL pages** — Added to dashboard layout.tsx so it shows everywhere until KYC approved ✅

### Session 11 Continued (2026-04-07 afternoon)
- [x] **Issuer API investigation** — card creation returns "Card limit reached" (1 card per user). POST /cards now reuses existing issuer_card_id ✅
- [x] **DB cleanup** — Deleted 7 duplicate cards, consolidated $145.30 on main card b2e45dbc ✅
- [x] **ReloadFlow chain names** — Replaced "Chain 2, 3..." with 23 real network names in my-card-1 ✅
- [x] **KYC banner on ALL pages** — Added to dashboard layout.tsx, shows everywhere until KYC approved ✅
- [x] **Polymarket integration** — Replaced SmartInvest with live Polymarket Gamma API (Trending/Politics/Crypto tabs) ✅
- [x] **Agent system backend** — Full CRUD: POST/GET/PATCH agents, POST/GET bets, POST settle. HD wallet derivation per agent ✅
- [x] **Agent DB tables** — `agents` + `agent_bets` created with indexes ✅
- [x] **First agent created** — "Alpha Bot" with wallet 0x9536...5d28, linked to card, $50 risk limit ✅
- [x] **Polymarket proxy** — Backend + Next.js proxy to avoid CORS ✅
- [x] **7 new API proxy routes** — polymarket/markets, agents CRUD, bets, settle ✅

### Still Open
- [ ] **Issuer card ID backfill** — Issuer API returned 502, retry when available
- [ ] **CCTP attestation completion** — Ethereum burn tx 0xf791... happened but attestation timed out (user cancelled). Funds may auto-complete via Circle
- [ ] **Polygon direct deposits** — Issuer has Polygon contract at 0x3092B..., can accept USDC directly
- [ ] **Issuer "PROBLEMATIC_APPLICANT_DATA"** — User 72459d0e has this flag, check with Issuer

---

## 🚀 NEW SPRINT: Agent System + Security Hardening

### Agent System — Polymarket Integration (P0)
**Vision:** Users deploy AI agents that bet on Polymarket, earn USDC, and route winnings through Cashly cards.

**Two modes:**
1. **Bot Mode** — User connects a Polymarket bot repo → deploys to agent wallet → bot trades autonomously → wins route to card via bridge
2. **Manual Mode** — User gets an agent wallet → plays Polymarket manually → wins auto-sweep to card

**Architecture:**
```
User → Creates Agent → Gets HD-derived wallet on Polygon (Polymarket chain)
  → Agent/User bets on Polymarket CLOB API
  → Wins accumulate as USDC in agent wallet
  → Auto-sweep: Agent Wallet → CCTP Bridge → Base → Issuer Card
  → User spends with Visa card
```

**Tasks:**
- [x] **Agent frontend** — Arena page wired to real API, Deploy Agent button, leaderboard table ✅ Session 11
- [ ] **Polymarket bet modal** — Build Buy/Sell modal (Up/Down prices, amount input, +$1/+$5/+$10/+$100/Max, Trade button) that records bets to agent_bets table. Replace current alert() on Yes/No buttons
- [ ] **Polymarket widget embed** — Embed Polymarket's trading widget directly in our UI instead of redirecting. Show market title + Buy/Sell interface inline
- [ ] **Bot directory** — Research top 100 Polymarket bots on GitHub, curate "Public Bots" section. Add "Attach Private Bot" option with fee-sharing model
- [ ] **Bot repo connector** — UI to paste GitHub repo URL, validate, deploy to agent wallet
- [ ] **Agent wallet funding** — User deposits USDC to agent wallet address
- [ ] **Polymarket CLOB integration** — Place orders via agent wallet (requires Polygon USDC approval + CLOB API key)
- [ ] **Auto-sweep profits** — Monitor agent wallets for USDC gains, trigger CCTP bridge to Base → card
- [ ] **Agent performance dashboard** — P&L chart, bet history, win/loss ratio, settle button
- [ ] **Leaderboard** — Arena page shows all agents ranked by APY

### Security Hardening (P0 — Issuer requirement)
- [x] **Rate limiting** — In-memory rate limiter on login/register (10 per 15min per IP) ✅ Session 11
- [ ] **HTTPS/SSL** — Waiting on Chris for TLD info, then Let's Encrypt + nginx. Can use nip.io for immediacy
- [ ] **Request encryption** — TLS handles this once HTTPS is live
- [ ] **Account lockout** — Lock account after N failed login attempts

### Agent System Sprint — Mini Sprints (Session 11+)

**Sprint A: Arena = Agent vs Agent Competition**
- [ ] Agent leaderboard ranked by profit across ALL users (not just yours)
- [ ] Monthly competition rounds with lottery prize pool
- [ ] Winner's user earns lottery reward
- [ ] Spectator view — watch other agents trade in real-time

**Sprint B: Agent Cards Page → Agent Wallet Dashboard (NEXT PRIORITY)**
- [ ] Transform Agent Cards page to show ALL agents (not credit cards)
- [ ] Each agent card shows: name, wallet address, on-chain USDC balance, linked card
- [ ] Bet history per agent (GET /agents/:id/bets)
- [ ] P&L display: total invested, total profit, win/loss ratio
- [ ] Fund button with QR code for agent wallet address
- [ ] Settle profits button (calls POST /agents/:id/settle)
- [ ] Agent status controls (pause/resume/stop)
- [ ] Agent deployment cost notice: "Fund $X to activate"

**Sprint C: Yield Agents Page = Bot Testing Ground**
- [ ] List available bots to test/deploy (from bot directory)
- [ ] Show overall performance metrics per bot across all users
- [ ] "Suggest a New Bot" submission form
- [ ] Scam protection: sandbox testing mode, verified badges, community ratings
- [ ] Test bots with new wallets before committing real capital

**CRITICAL: What's Real vs Fake (Session 11 End State)**
| Feature | Status | What's needed to make real |
|---------|--------|---------------------------|
| Bridge (user deposits) | ✅ REAL | Working, tested mainnet |
| Agent wallet addresses | ✅ REAL | HD-derived, fundable on Polygon |
| Card connection | ✅ REAL | DB link persists |
| Issuer per-user contracts | ✅ REAL | getUserBaseDepositAddress() works |
| Auto-sweep → Issuer bridge | ✅ REAL CODE | Not tested yet (needs funded agent wallet) |
| $99 Invested counter | ❌ FAKE | Just DB increment from modal, no real money |
| Bet history "open" | ❌ FAKE | DB records from modal clicks, not Polymarket |
| Pause/Resume | ⚠️ DB ONLY | No running bot to actually pause |
| Alpha Bot "passive betting" | ❌ NO BOT CODE | Need to build actual trading strategy |
| Connect Wallet (header) | ❌ BROKEN | Privy not configured |
| Agent "deployed" | ⚠️ DB ONLY | Wallet exists but no bot code runs on it |

**Sprint D: Polymarket CLOB Integration (REAL TRADING)**
- [x] Bet modal UI built (Buy/Sell, Up/Down, amounts, queue) ✅ Session 11
- [ ] **Polymarket CLOB API integration** — agent wallet signs real trades on Polygon
  - Requires: `@polymarket/clob-client` or direct API calls
  - Agent wallet derives private key for signing: `getAgentPrivateKey(agentId)`
  - Flow: User clicks Buy → backend signs tx with agent wallet → submits to CLOB → trade executes
  - Fallback: "Fund agent wallet with $X USDC on Polygon to enable live trading"
- [ ] Issuer contract per user (NOT one address) — each user has unique Base contract from `getUserBaseDepositAddress(issuerUserId)`. Sweep correctly targets per-user contract ✅ already implemented
- [ ] Real-time position tracking via Polymarket WebSocket
- [ ] P&L updates from resolved markets

**Sprint D.5: Alpha Bot — REAL Passive Trading Engine**
- [ ] Build Alpha Bot strategy code (actual running process)
  - Fetches high-confidence markets from Gamma API (>80% YES or <20% YES)
  - Signs real trades via Polymarket CLOB using agent wallet private key
  - Risk management: per-bet limit, daily limit, stop-loss
  - Runs as background task in monitor.ts or separate worker
- [ ] Agent execution lifecycle: funded → active → trading → profit sweep
- [ ] Remove fake "invested" counter — only count REAL on-chain transactions
- [ ] Remove card option (unlink/disconnect)
- [ ] Fix Connect Wallet header button or remove it
- [ ] Alpha Bot default: auto-attach to card on creation, show funding instructions
- [ ] Display "Bot not funded" state clearly vs "Bot actively trading" state

**Sprint E: Revenue Model**
- [ ] Private bot submission with 10% revenue share
- [ ] Bot creator payout system (auto-settle to their card)
- [ ] Platform fee on agent profits (e.g. 2.5%)
- [ ] Subscription tiers for agent deployment limits

**Sprint F: Fee Structure & Transaction ID System** *(added 2026-04-11)*
- [ ] **Transaction type taxonomy** — Define all tx types: deposit, withdrawal, p2p_transfer, card_load, bridge, agent_bet, agent_settle
- [ ] **ID structure for P2P transfers** — Unique ID format for peer-to-peer money movement (user→user, user→card, card→card)
- [ ] **Fee schedule by transaction type**:
  - Deposits (external→card): 5% current — review if competitive
  - P2P transfers (user→user): 1-2% max, possibly free for same-platform
  - Card-to-card transfers: flat fee or percentage TBD
  - Withdrawals (card→wallet): flat fee + gas TBD
  - Agent profits settlement: platform cut TBD
- [ ] **Only count successful txs in volume/fee stats** — Execution Layer currently counts failed txs
- [ ] **Fee earned tracking** — Separate table or column for actual fees collected vs theoretical
- [ ] **Peer debit card transfers** — Send money directly to another user's debit card (Visa Direct / push-to-card)
- [ ] **Update Execution Layer admin panel** — Show real volume/fees once fee logic is finalized

**Sprint G: OFT/ONFT Expansion — Memetropolis Integration** *(added 2026-04-12)*
- [ ] **Memetropolis as config reference** — Use battle-tested DVN/executor/gas params from 7 mainnet deployments when expanding to new chains (not a new feature, just a proven reference)
- [ ] **Business OFT Launchpad** — Businesses create branded OFTs from dashboard: loyalty tokens, community-gated spending, immediately liquid on bonding curve, no DEX listing needed. Revenue: creation fee + trade percentage
- [ ] **Any-Token Card Loading (swap-before-bridge)** — User holds ANY token on ANY chain → one-click sell on DEX/curve → USDC → existing bridge to Base → Issuer card. Turns every token holder into a card user. Needs: swap router integration (Uniswap V2 addresses already in Memetropolis config)
- [ ] **Cross-chain market participation** — Users bet from any chain without bridging first; OApp message carries intent to Base for settlement, payout routes back. UX enhancement to existing prediction markets.
- [ ] **ONFT card tiers & badges** — Future: Platinum/Black/Diamond tiers + achievement badges as cross-chain ONFTs
- [ ] **Solana OFT support** — Port Anchor IDL patterns from Memetropolis for Solana deposit/bridge

### Bridge Completion
- [ ] **Complete CCTP Eth→Base attestation** — Check if Circle auto-completed, else manually call receiveMessage
- [ ] **Test LZ two-hop** — zkSync → Arbitrum → Base (Test 3, deferred from Session 11)
- [ ] **Polygon direct deposits** — Wire Issuer Polygon contract as deposit option

### Infrastructure
- [ ] **Solana deposit monitoring** — Enable for Solana reload option
- [ ] **CRITICAL: Richard's Issuer account** — userId `4422e442-f5d3-4f72-aa36-980be3114c9f`. DB updated ✅. KYC link works but camera broken — retry with working camera. After KYC approved:
  1. Create card: `POST /users/4422e442.../cards` with `{ configuration: {...} }` — need Issuer for exact schema (400 "missing configuration")
  2. Get cardId from response
  3. Update DB: `UPDATE cards SET issuer_card_id = '<cardId>' WHERE id = 'b2e45dbc...'`
  4. Get real PAN/CVV via `/cards/:cardId/secrets` with SessionId
  5. Get deposit address via `/users/:userId/contracts`
  6. Wire everything end-to-end REAL
- [ ] **Issuer Card Secrets Integration** — Issuer provided full API docs for PAN/CVV/PIN retrieval via SessionId (RSA-OAEP encrypted). Frontend generates SessionId, calls /cards/:cardId/secrets. Implementation code provided by Issuer in chat.
- [ ] **Issuer card ID for Chris (72459d0e)** — Card exists but ID unknown. No list/delete endpoint. DELETE returns 405. Must ask Chris directly.
- [ ] **Card creation requires `configuration` body** — `{ configuration: { type: 'virtual' } }` returns 400 "missing configuration". Need exact schema from Issuer. Current createCard() in issuers.ts sends empty body — MUST be updated.
- [ ] **Richard's KYC status: needsInformation** — `applicationReason: BAD_PROOF_OF_IDENTITY`. Camera was broken. KYC URL: `https://cardmemberportal.com/kyc?userId=4422e442-f5d3-4f72-aa36-980be3114c9f&signature=CiQAmdPUf...`. Complete with working camera, then create card.
- [ ] **Card balance $12.13 is REAL on Issuer contract** — DB was inflated to $145.30, corrected to $12.13. All future balances must come from Issuer contracts API, not DB writes.
- [ ] **Clean up Neural Net** — Remove deprecated files, update all docs to current state
- [ ] **Install @polymarket/clob-client on VPS** — `cd /home/cash/Cashly && npm install @polymarket/clob-client`
- [ ] **Remove or fix My Wallet page** — Requires Privy (not configured). Either set up Privy or replace with agent wallet redirect
- [ ] **Remove Connect Wallet header button** — Broken without Privy. Replace with profile/logout

---

## 📊 MARATHON BUILD LIST (Priority Order)

### Session 12 Completed (2026-04-08)
- [x] **World Map widget removed** (100% fake data) ✅
- [x] **Notification checkmark** now removes notification from view ✅
- [x] **Transaction stats** — removed fake hardcoded percentages ✅
- [x] **Deposit address** — ReloadFlow now fetches real address from /api/deposit-addresses ✅
- [x] **Delete agents** from Yield Agents page ✅
- [x] **Chain logos** — major chains use real images from llamao.fi CDN ✅
- [x] **Spend threshold** — syncs to card_controls.alert_threshold for real enforcement ✅
- [x] **Fake card_transactions deleted** — all 12 seeded transactions removed ✅
- [x] **CLOB integration verified** — returns real balance check + proper fallback messages ✅
- [x] **Full site audit** — 28 issues identified across 15 files ✅
- [x] **Bridge audit** — CCTP working, LZ 2-hop coded but untested, chain support documented ✅

### Session 12 Final — MASSIVE BUILD
- [x] Alpha Bot brain (passive high-confidence strategy) ✅
- [x] Bot connector (real GitHub validation + DB storage) ✅
- [x] Agent vs Agent leaderboard + arena stats API ✅
- [x] Solana deposit monitoring + CCTP bridge ✅
- [x] **AFI Prediction Market Engine** — AMM pricing, betting, resolution, auto-payouts to card ✅
- [x] **Markets frontend page** — card grid, bet modal, category filters, chain banner ✅
- [x] Markets sidebar navigation ✅
- [x] Ghost card creation disabled ✅
- [x] All fake data removed (world map, transactions, stats, cards) ✅
- [x] Chain logos from CDN ✅
- [x] Spend threshold syncs to card_controls ✅
- [x] Notification checkmark fix ✅
- [x] Delete agents from Yield Agents ✅
- [x] Real deposit address in ReloadFlow ✅
- [x] AFI Vision document created ✅

### NEXT SESSION START HERE
1. ~~Markets page: chain filters~~ ✅ DONE — abstracted chains away, clean omnichain UX
1b. **Markets page deployed + Bank Vault page** ✅ DONE
1c. **Notification improvements** — better agent messages ("Bot took position", "You earned $X"), filterable by type in settings
1d. ~~Transaction names~~ ✅ DONE — now shows "Market Bet: YES — Will Bitcoin hit $100K..."
1e. **Transaction detail modal** — View Details should open full log showing:
  - Full market question + description
  - Link to market page where bet was placed
  - Timestamp (exact UTC + relative)
  - Executed by: User / Alpha Bot / Agent name
  - Entry price, shares received, current market price
  - Position status (open/won/lost)
  - Source chain + bridge route used
  - Card balance before/after
1f. **Bank Vault page** ✅ DONE — crypto wallet with deposit addresses, withdraw, off-ramp
2. **Create Market form** — let users create their own prediction markets (with stake/review)
3. **Market detail page** — full market view with order book, position history, resolution info
4. **Wire Arena to /arena/leaderboard + /arena/stats APIs**
5. **Complete KYC** → real Issuer card → real PAN/CVV
6. **CCTP Test 2** — check Eth→Base attestation
7. **LZ 2-hop test** — zkSync → Arbitrum → Base

### Sprint 1: Make Agent System REAL (NEXT SESSION START HERE)
1. Install `@polymarket/clob-client` on VPS — `cd /home/cash/Cashly && npm install @polymarket/clob-client`
2. Fund agent wallet with $5 USDC on Polygon, test REAL Polymarket trade
3. Build Alpha Bot strategy (high-confidence passive betting)
4. Remove fake invested counters — only count real on-chain trades
5. Make pause/resume actually stop/start the bot process
6. Add unlink card option on Agent Wallet page
7. Fix duplicate bot deploy — check DB before allowing re-deploy of same bot
8. Fix Yield Agents to show ALL deployed agents (not just latest)
9. Make spend threshold persist to DB (currently UI-only)
10. Make Private Bot Connector + Suggest Bot REAL (backend submission)
11. Fix Connect Wallet button (either Privy or custom wallet connect)
12. Deduplicate "Polymarket Agents Official" — prevent double deploy

### Sprint 2: Security + SSL
7. Get A record from Chris → install nginx + certbot
8. HTTPS everywhere
9. Account lockout after failed attempts
10. Remove hardcoded demo credentials from login page

### Sprint 3: Complete Bridge Testing
11. Complete CCTP Eth→Base attestation (check Circle status)
12. Test LZ two-hop (zkSync → Arb → Base)
13. Polygon direct deposits (Issuer has Polygon contract)

### Sprint 4: Bot Ecosystem
14. Bot repo connector (validate GitHub repos)
15. Bot submission backend (store in DB, not just alert)
16. Revenue sharing model implementation (10% creator cut)
17. Bot performance tracking (real P&L per bot across all users)
18. Community bot ratings

### Sprint 5: Polish + Production
19. Chain logos (actual images, not text abbreviations)
20. Fix My Wallet page (remove or replace)
21. Fix Connect Wallet button
22. Issuer card ID backfill
23. Agent vs Agent competition (leaderboard across all users)
24. Lottery system for Arena winners

---

### 🟠 Tier 3 — Data Wiring (Tables Exist, Need Real Queries)

- [x] **Transaction history — Recent Transactions panel** — Frontend wired ✅ 3-28. Needs backend `/card-transactions` endpoint to actually return data for logged-in user.
  - `GET /cards/:id/transactions` endpoint with pagination
  - Frontend: fetch on load, support Income/Debits/Pending/Complete filter tabs
  - Search bar filtering

- [x] **Transaction category sums** — Filter subtotal bar shows income/debits/net when filters active ✅ Session 10

- [x] **card_controls enforcement in POST /card-transactions** — Auto-upserts controls, enforces daily/monthly/per-tx limits, fires alerts at >80% usage ✅ Session 10

---

### 🔴 Tier 4 — New Tables + External Data

- [x] **Statistics chart — real data** ✅ (Session 9 — wired to GET /analytics/statistics, 7-day spending trend)

- [ ] **Real market data — Smart Invest panel** — Replace fake tickers with real data:
  - Crypto: CoinGecko free API (BTC, ETH, SOL, USDC yield rates)
  - Stocks: Yahoo Finance or Polygon.io (free tier)
  - Yield opportunities: on-chain APY from DeFi protocols (Aave, Compound, etc.)
  - New table: `market_cache` (symbol, price, change_24h, fetched_at) — refresh every 15 min via cron
  - Filter tabs (Popular / Tech / Social Media → replace with Crypto / Stocks / Yield)

- [ ] **Agent <-> Card activity tab** — Show what each agent earned/spent on behalf of the user:
  - New table: `agent_transactions` (agent_id, card_id, user_id, type, amount, description, timestamp)
  - New page: `/dashboard/agent-cards` → per-agent breakdown
  - Display: agent name, total earned, total spent, net, last active, transaction list
  - Income entries show positive (agent earned USDC doing X), expense entries show cost of agent operation

---

### 🔴 Tier 5 — Complex Systems (Leave for Later)

- [ ] **Abnormality detection + email alerts + agent spending approval** (IV from screenshot review):
  - Real-time transaction pattern analysis (velocity, geo-anomaly, amount spike vs. baseline)
  - Email service integration (SendGrid or Resend) → "Did you approve this?"
  - Agent spending approval queue: agent requests >threshold → user gets approve/decline notification
  - New tables: `anomaly_events`, `approval_requests`
  - Webhook or websocket push to frontend for real-time alerts

- [ ] **Transfer to other users (crypto)** — Send USDC/USDT/DAI to other Nuro users:
  - Resolve recipient by username, email, or wallet address
  - On-chain USDC transfer from user's deposit wallet OR internal ledger transfer
  - New table: `p2p_transfers`
  - Confirmation + 2FA before send

---

### 🔵 Infrastructure Backlog

- [ ] Solana deposit monitoring
- [ ] Moonbeam, Mode, Mantle OFT adapter deployment (commented out, needs funding)
- [ ] Agent Cards sidebar page (`/dashboard/agent-cards`) — currently likely 404 or empty
- [ ] Transactions sidebar page (`/dashboard/transactions`) — full transaction history across all cards

---
*Related: [[Neural Net/Claude Memory/V2 Feature Set & Marathons]] · [[Neural Net/Claude Memory/Deploy History]] · [[Neural Net/Claude Memory/INDEX]] · [[Neural Net/Claude Memory/Session Starter]] · [[Neural Net/Claude Memory/DB & Modal Graph]]*