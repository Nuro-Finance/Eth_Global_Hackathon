# 📦 Deploy History — Cashly / Nuro Finance

---

> ✅ **BACKFILL COMPLETE 2026-05-08**: Sessions 21–34 (~14 sessions, ~210 commits, 27 migrations) backfilled below from the per-session recap docs. The encode skill (Step 12) is now load-bearing — Deploy History append is mandatory on every deploy-touching session, so this gap won't recur. Each entry below cross-references the canonical Session N Recap for full narrative; this file is the deploy ledger only.

---

## 2026-05-09 — S35 Day-5: Demo-polish iteration (no migrations, 16 commits)

### Commits (16 total on `Build_Branch`)

**Frontend (mostly):**
- `a1a77df` feat(login): swap purple aurora -> Chris's WebGL ASCII matrix-fog
- `063ff13` feat(chat): real BYOK streaming chat -- Chris's UX + 3-provider live LLM
- `dd5cf92` fix(verify-key): move dev-bypass before length check so "1234" works
- `71eedb1` fix(chat): add the 3 provider brand SVGs missing from public/
- `2a86782` fix(swap): onError fallback on swap quick-pick + selected-asset icons
- `44e13ba` fix(swap): sell-token picker — open even when empty + brand SVGs
- `cb20bc7` fix(cards/swap): 5 demo-killers — reveal, flash, KYC gate, swap catalog
- `858787a` fix(identity/theme): sidebar shows real name + retire Dark for Graphite
- `1c85ea1` fix(ui): label Graphite as 'Dark' + drop duplicate close-X on wallet modals
- `5fa6b90` fix(my-card): instant first paint + one-click wallet-send on Reload step 1
- `f72d1a1` fix(identity/wallet): stop name flicker + show portfolio on BSC/AVAX/OP

**Backend (cross-stack):**
- `7cbafb8` fix(card-controls): normalize GET/PATCH response so FE reads per_tx_limit
- `c00f953` fix(spend-threshold): make the card-controls alert actually fire
- `21d8ae0` fix(card-secrets): bump rate limit + surface 429 to user
- `862ad5c` fix(wallet-portfolio): price native AVAX + BNB (was hardcoded ETH/MATIC)
- `2ce3f19` fix(wallet/threshold): prefer external wallet + email on high-value alert

### Migrations applied: **0** (zero this session — all code-level)

### One-shot DB scripts (production-state-changing, no migration)
- `card_controls.alert_threshold` reconciliation — UPDATE on rows where `cards.spend_threshold IS NOT NULL AND cc.alert_threshold IS DISTINCT FROM c.spend_threshold`. Affected 1 row (Richard's card, was $500 default → $100 user-set).

### VPS env changes
- BE `~/Cashly/.env`:
  - Added `RESEND_API_KEY=re_Fca48LEZ_...` (Resend transactional email API key, signed up by Richard mid-session)
  - Added `EMAIL_FROM=onboarding@resend.dev` (Resend sandbox sender — restricted to verified email; flip to `alerts@nuro.finance` post-domain-verification)

### PM2 restart counts
- `cashly-frontend`: 184 → 193 (+9 restarts across 11 FE-touching deploys)
- `cashly-middleware`: 636 → 657 (+21 restarts across 5 BE-touching deploys + env additions + smoke-test reboots)

### Smoke tests / verifications
- `/api/wallet-portfolio?address=...` returns 7 chains with `chainStatuses: "ok"` (was 4 chains)
- Direct Resend API smoke-test: `POST https://api.resend.com/emails` returned message id `023addcb-83c6-4f64-a951-b572a5f158e8` — confirms key + sender wiring before relying on the in-flow path

### Rollbacks: **0**

### Cross-references
- Day-5 close doc: `Cashly_Source_Code/docs/What We Did Today/5-9-2026 (Marathon 11 Day-5).md`
- Decision Journal: `Neural Net/Decision Journal/2026-05-09_001.md`
- Marathon: `Neural Net/Claude Memory/Marathon 11 — Capital Event Sprint.md` Day-5 section

---

## 2026-05-08 — S35 Day-4: Demo-killer sweep + SD3 PCI-grade card-reveal protocol

### Commits (18 total on `Build_Branch`)

**Backend / cross-stack:**
- `48b35bd` fix(tx-sync): widen merchant_category_raw + defensive truncate [NUR-26]
- `609f782` fix(card-balance): stop overwriting phantom cards + dedupe wallet total
- `95949be` fix(tx-sync): credit user-scoped payment events as income [NUR-26]
- `b755636` fix(issuers): map SD3 card metadata to real last4 + expiry [NUR-26]
- `69dbe9d` feat(card-secrets): RSA-OAEP reveal endpoint via SD3 protocol [NUR-26]
- `6fb3a2f` fix(card-secrets): decrypt AES-128-GCM encrypted reveal response [NUR-26]
- `433f6d9` fix(card-secrets): hex-decode secretKey before base64 in SessionId [NUR-26]

**Frontend:**
- `08d530f` feat(auth): logout confirmation modal [NUR-23]
- `ccc433a` fix(my-wallet): kill fake $128K mock fallback when wallet is empty
- `dc09af4` chore(auth): redirect /[locale] -> /[locale]/login + hide broken social grid
- `7f99763` fix(cash-flow-chart): derive Y-axis from actual data, not hardcoded $6K
- `c56a462` fix(auth): restore Google login via NextAuth (the path that actually worked)
- `a0b01ae` chore(auth): drop Telegram social login — never wired, was always a placeholder

### Migrations applied: **048** (`merchant_category_raw` 50→255 + `merchant_name` 200→255)

### One-shot DB scripts (production-state-changing, no migration)
- Identity swap on `users.id = db01a59c-a418-4da0-a4aa-fb032d500b04`: email → `demo@nuro.finance`, name → `Chris Brignola`, first/last → `Chris/Brignola`, kyc_status → `approved`
- Renamed seeded mock demo user: `demo@nuro.finance` → `demo-archive@nuro.finance`
- Restored phantom card balances after sweep overwrote them (real card stays $1.65; phantoms restored to seed values $520.42 + $412.18)
- Force re-sync after migration 048: **22 stranded transactions** inserted (CAFE WEST, AMAZON MKTPLACE, EASTON DELI×2, etc.) + **30 income rows** credited from payment events ($248.20 total recovered)

### VPS env changes
- FE `~/nuro-finance-dashboard/.env.local`:
  - Added `NEXT_PUBLIC_PRIVY_APP_ID` (restored from April backup — Privy wallet-connect path)
  - Added `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (existing OAuth client; secret regenerated since original was non-retrievable)
  - Fixed `NEXTAUTH_URL` from `http://localhost:2800` → `https://app.nuro.finance` (was causing `redirect_uri_mismatch` after Google client setup)
- Privy dashboard ("Nuro Finance Wallet Connect"): allowed origins set to `https://app.nuro.finance`, `https://nuro.finance`, `https://www.app.nuro.finance`, `http://localhost:3000`
- Google Cloud Console: client secret rotated; redirect URI `https://app.nuro.finance/api/auth/callback/google` confirmed whitelisted

### PM2 restart count delta
- `cashly-frontend` (id 1): **174 → 179** (5 restarts — env restore, repeated rebuild after each commit batch, NEXTAUTH_URL fix with `pm2 restart --update-env`)
- `cashly-middleware` (id 4): **619 → 622** (3 restarts — middleware env updates + post-migration restart)

### Skills shipped / upgraded
- **NEW** `.claude/skills/sd3-card-secrets/SKILL.md` — encodes the 7-step RSA-OAEP / AES-128-GCM card-secrets reveal protocol, SD3 public RSA key (PEM), correct response shape, decryption recipe. Listed in registry as `sd3-card-secrets`.
- **UPGRADED** `.claude/skills/encode/SKILL.md` — 4 steps → 16 steps with explicit failure modes + full close-report template. Adds Marathon-doc update, Decision Journal INDEX backfill, **Deploy History append (this section is the first instance)**, reference-doc sweep, Linear sync, mandatory `sync` invocation.

### Memory docs / rules
- `System Rules.md` — added `## Design Work Protocol — ABSOLUTE RULE` codifying 4-phase research → audit → spec → implement as mandatory before any UI work; refreshed Skills table (was missing 13 skills)
- `Marathon 11 — Capital Event Sprint.md` — added `## Actual day-by-day status` section with Day 1–4 outcomes vs. plan + variance commentary
- `API Endpoints.md` — added `/cards/:id/secrets` real-reveal section + today's `/card-transactions` auto-sync trigger + `isIssuerLinked` flag on `/cards`; gap notice for S21–S34 endpoint backfill
- `Pending Tasks.md` — Day-4 ✅ DONE block + Day-5 NEXT block + LATEST DOCS link refresh
- Decision Journal `2026-05-08_001.md` (6 entries — DJ 2 on PCI-DSS push-back load-bearing)
- Day-4 close: `Cashly_Source_Code/docs/What We Did Today/5-8-2026 (Marathon 11 Day-4).md`

### Linear sync
- **NUR-23** → Done (logout confirmation modal)
- **NUR-26** → Done (full SD3 → DB → FE pipeline shipped including the encrypted reveal flow)
- **NUR-21** → Done (Privy + Google OAuth both verified working)
- **NUR-52** filed (CVV reveal on Overview deck — same protocol, ~30 min FE plumbing)
- **NUR-53** filed (live chat window in dashboard, scope TBD at session open)

### Production state at end of day
- Backend: commit `433f6d9` (or later — depends on whether FE-only commits also touched server files via shared branch)
- Frontend: commit `a0b01ae` on `Build_Branch`
- Database: migrations **001..048** applied
- Test count: **119 / 119** passing (pre-push gate green)
- No rollbacks

---

## 2026-04-26 → 04-27 — Session 34: BE→FE gap closure marathon — Tier A 5-tab Agent Detail panel, Marathon 9+10 docs, scaling roadmap

See [[Session 34 Recap]] for full arc.

### Commits (10 total)
- `8b08245` feat(s34): pre-push admin parse gate + x402 in-house verify + FP UI completion + card_tx schema fix
- `66bc402` feat(s34): Tier A — Agent Detail per-agent panel with 5 tabs
- `8fc8918` fix(s34/a3): enforceTxCap on agent-initiated bets with proper agent_id attribution
- `d2c383b` feat(s34/9.3): aggregate event sources into /notifications feed (UNION 5 tables)
- `14527b2` feat(s34/9.3): notification_reads tracker — persists read/dismiss for synthetic rows
- `f53e4e5` feat(s34/9.2): settle queue split (pending vs completed) + Issuer sync indicator
- `72802ee` feat(s34/9.1): Tier-A polish — budget top-up, strategy config, reputation sparkline rebuild
- `cc45875` docs(architecture): card 13 — scaling roadmap (1K/10K/100K DAU + treasury track)
- `ae8ea86` fix(s34): missing FE proxies for agent details + topup; rebuild scaling roadmap with per-tier diagrams
- `631e9e1` fix(scaling-roadmap): mermaid syntax — close T3S3 node correctly

### Migrations applied: **043** (card_transactions date consolidation), **044** (notification_reads tracker)

### Infrastructure / config changes
- New pre-push gate: `scripts/check-admin-script.js` — parses rendered admin `<script>` block via Node `vm`, blocks pushes with template-literal escape collisions (the regression class behind two prior blank-admin-panel incidents)
- Production state at close: BE + FE both at `631e9e1`, all 5 Tier-A panels live, agent control plane FE substantially shipped
- `~/Cashly/public/architecture/codebase-graph.{html,json}` had local mods cleared during deploy (S33 brain-marathon artifacts); `~/nuro-finance-dashboard/public/architecture.html` had untracked drift cleared

---

## 2026-04-26 — Session 33: x402 Phase 1+2 productized + Tier 0 + Tier 1 sweep + Heimdall ingress live

See [[Session 33 Recap]] for full arc. Longest single-session commit count of the project.

### Commits (30 total)
**x402 protocol** (8): `f2b029a` Phase 1 Programmatic Agent Treasury, `11bf31d` POV panel + compound-detector SQL fix, `b3aa1ec` id::text cast remaining queries, `afe1fcf` Phase 2 server-side endpoints + revenue vault, `a4b9543` X-Forwarded-Proto/Host honor, `c77f614` await createSigner (loopback fix), `2de3ac7` useFacilitator import path fix, `e634f0f` network-aware settlement + Coinbase mainnet facilitator
**Tier 0 PCI/security** (5): `7bf3456` PAN mask in pending-cards SQL projection (T0 #1), `cae834c` rate-limit + audit /cards/:id/secrets (T0 #3), `8a9b09a` card_number → card_last_4 phase 1 (T0 #2)
**Tier 1 functionality**: `bbcb55b` enforceTxCap on 5 user-money paths (T1 #4), `1a5fb9f` /agents/:id/settle no-lies fix (T1 #5), `cbfa1f3` Report Lost/Stolen handler (T1 #7), `28a88bd` cards.status + card_alerts schema reconcile (T1 #10), `deff7f5` real Vault Withdraw wiring kills alert() stub (T1 #6), `af996e0` sweepCardSettlements handles agent rows (T1 #5b), `53eff8b` phantom $128K mock kill + SANDBOX_MODE gate on POST /card-transactions (T1 #8 + #9)
**Heimdall** (4): `79a354b` self-test endpoint (T1 #16), HEIM-001..007 ingress prompt-injection scanner (caught real "ignore previous instructions" payload through paid /huginn/counsel within minutes of deploy), audit dispatch endpoint + auditor SKILL.md DISPATCH protocol, per-rule FP 30d trend + readyToEnforce flag
**x402 productize**: `1f0e161` 3 paid endpoints (heimdall/threat-intel, markets/resolved, huginn/counsel) — first revenue surface beyond demo
**X4 + X5 agent-bus**: agent-bus topic pricing (mig 042), facilitator routing layer at /facilitator/{verify,settle,supported} — internal payers off-chain, external forwards to Coinbase/x402.org
**Brain visualization marathon**: GitNexus-grade D3 force-simulation codebase-graph.html (failure — Richard rejected; aesthetic-matching is a different skill class than engineering, lesson encoded)
**Hotfix**: 4-instance `\'` → `\\'` fix on the admin template literal escape collision (root cause of "all stat cards blank" regression)

### Migrations applied: **041** (card_last_4 column phase 1), **042** (agent_bus_topic_pricing)

### Infrastructure / config changes
- x402 sepolia loopback E2E verified: Mythos vault `0xe9e54C01...` debited 0.001 USDC, Nuro revenue vault `0x050cdf36...` credited (basescan tx `0x2cf24ca1...`)
- 3 paid x402 endpoints LIVE: heimdall/threat-intel, markets/resolved, huginn/counsel
- HEIM-001..007 ingress scanner armed in observe mode → ENFORCE flipped after FP rate validated

---

## 2026-04-25 → 04-26 — Session 32: HL audit close + S32 batch + sandbox harness + balance-spoof P0 patch

See [[Session 32 Recap]] for full arc.

### Commits (7 total)
- `4591a6c` feat(s32): budget-low loop + period-rollover + agentId plumbing through 7 enforceTxCap call sites + HL Phase 1.2 deposit/withdraw scaffold + position-sync cron
- `5f2d080` refactor(s32): reputation arc fixed-axis [-1,+1] (was min/max-normalized, breaking cross-agent comparability) + CHAIN_NAME_TO_ID unification (15-entry vs 4-entry drift killed)
- `810b5d0` feat(s32): Mythos counsel-on-action wrapper (recordPredictionWithCounsel + POST /api/agents/:id/propose-action) + gas-balance-sync cron (1h cadence) + per-rule FP labeling UI + KycReloadHint component
- `45a50c4` build(s32): hardhat compile workflow under Node 18 via nvm — system-level fix for Node-20-strict-ESM × LayerZero-toolchain × Hardhat × React-19/17 quagmire (3 layers of defense to prevent prod drift)
- `c308530` feat(sandbox): safe-to-fail mainnet-fork harness — Anvil + scratch schemas (M1-M7 in one push, 4-file stack: orchestrator.ts + db.ts + scope.ts + routes.ts)
- `ef17863` **fix(security): close balance-spoof → withdraw exploit chain (S32 P0)** — PATCH /cards/:id no longer accepts client-supplied balance; both money-paths (withdrawal + buy-from-card) now sync from Issuer before spend gate with 503-on-Issuer-outage. **Verified exploit chain pre-patch.**
- HL audit DB UPDATE applied direct to prod (3 vault decisions: Growi HF + L/S Grids APPROVE high-risk 29/40 each, HyperGrowth REJECT 26/40 — 45% all-time DD deal-breaker)

### Migrations applied: **039** (heimdall_fp_labeling — false_positive 3-state nullable + fp_marked_by + fp_marked_at + partial index), **040** (sandbox_sessions — full lifecycle + Anvil PID/port + scratch schema name + pinned time/prices)

### Infrastructure / config changes
- VPS: `~/.nvm` installed, Node 18.20.4 added (default alias = system, so /usr/bin/node v20 wins)
- VPS: `~/.foundry/bin/anvil` + forge + cast + chisel installed via foundryup
- VPS: ecosystem.config.js now pins env.PATH for both apps (excludes nvm bin) — pulled into prod via git
- VPS: postinstall hook `scripts/postinstall-fix-ink-react.js` keeps React-17-under-ink stable across npm install
- PM2 restart **347** confirmed healthy after balance-spoof patch deploy

---

## 2026-04-25 — Session 31: True Heimdall + agent message bus + reputation + Huginn online (~10K LoC, 6 migrations)

See [[Session 31 Recap]] for full arc. The day Heimdall, the inter-agent message bus, the reputation system, and Huginn the wise-advisor came online together.

### Commits (25 total) — three movements
**Morning plumbing**: `5962aa6` boot, `f0aa4e8` Heimdall plumbing batch 1 (HEIM-101 axios instrumentation across issuers/plaid/dwolla/hyperliquid + global axios catch-all), `c5d2a9c` HEIM-105 tx-cap gate on bridge.ts + execution-dispatch.ts + swap.ts, `14db029` db.ts POSTGRES_URL test-env fix, `59cf90c` multi-token 0x execution path (BuyTokenOverride plumbed through fetchZeroExQuote chain), `6b9c857` LZ doc-monitor scanner, `d489699` CCTP doc-monitor scanner (Heimdall fs-guard's first customer), `f3e3adf` HL Phase 1 read-only slice + endpoints, `8b0c7a5` HEIM-105 native-value sites (native-price.ts, CoinGecko-cached, NaN→skip), `d27bbbb`+`5a5022b` HL funding sparkline + HYPE staking stats card (with HYPE-decimals hotfix from 1e18 to 1e8), `22b885e` HyperSwap LP-yield panel via DefiLlama (151 V2/V3 pools)
**Midday infrastructure**: `962cb0e` quick wins — address-book per-row delete + favorite, SidebarProof config unified, HEIM-201 scope clarified, `ede7986` vault empty-state mailto fix, `193de9c` Heimdall hardening pass (5 new defenders: HEIM-501 compound-signal Gjallarhorn state machine, HEIM-205 mass-write counter, HEIM-401+403 reasoning detectors, HEIM-208 Merkle manifest, HEIM-CTRL-001 watchdog), `0480db8` sports feed allowlist fix
**Afternoon agent-stack**: `f3905b1` inter-agent message bus (HMAC-SHA256 + AES-256-GCM at rest + 24h key-rotation grace + 8 REST endpoints under /api/agent-bus/*; doc-monitor became first publisher on `external-doc-drift:breaking|notable` topic), agent reputation system (per-action accrual, fixed-axis arc), Huginn wise-advisor counsel surface, `7d8375a` agent budget rollover + period boundaries

### Migrations applied: **033** (external_doc_snapshots), **034** (hl_vaults + hl_vault_positions), **035** (heimdall_gjallarhorn_state — agents.heimdall_state + heimdall_state_history table), **036** (agent_message_bus — agent_keys + agent_messages + agent_subscriptions), **037** (agent_budgets), **038** (agent_reputation)

### Infrastructure / config changes
- VPS env: `AGENT_BUS_MASTER_KEY` provisioned for at-rest encryption
- LZ + CCTP doc-monitor: 11 successful baseline snapshots, 11 Telegram alerts (first-ever notable severity per target — both upstreams had restructured docs since URLs sourced)
- HEIM-501 Gjallarhorn 5-min cron LIVE — auto-de-escalation on `watch` only; `paused`/`quarantined` need human override
- HEIM-208 Merkle manifest auto-bootstraps a baseline on first run; common 'roots-empty' state on VPS (Neural Net not synced) is silent

---

## 2026-04-24 → 04-25 — Session 30: 18-hour cook day — signup hardening + Solana aggregator + Heimdall H1 live

See [[Session 30 Recap]] for full arc. 42 commits, 5 migrations, ~70 files. The day split into two acts (the ~14:00 mid-day encode at 95% token limit was preserved in S30 Handoff frontmatter).

### Commits (42 total) — selected highlights
**Migrations applied**: `38b99b6` Chris cosmetic port (3 wins from his 6,159-line ConnectedWalletDashboard — Swap quick-pick row, Send Address Book tab, Buy provider cards)
**Heimdall + bridge**: `2fe2fe0` LZ reserve monitor wired, `21e735a` LZ checklist audit
**Yield**: `1fa5d24` Hyperliquid yield page (perp funding feed + Yield page + sidebar nav, worked first try)
**Auth hardening**: `f02dab3` auth-flash + /auth/login 404 shim (250ms dashboard-flash data leak + URL-never-found-in-source defensive 307 shim), `6283d8d` Google OAuth bridge (find-or-create user by email), `e19fc4a` JWKS hardening (full Google id_token verification + provider-agnostic verifier in src/oauth-verify.ts, signature + audience + issuer + email_verified all checked server-side)
**KYC**: `629b790` KYC 3-in-1 — URL params merge, pre-KYC gate amber CTA on /my-card-1, name-prompt modal before /kyc/start (Google's "PlainPaper" was being split into firstName/lastName both = "PlainPaper"), `ea19aed` card-info KYC gating consistency (gated CardDetails on cardId AND kyc_status==='approved')
**Backend user sync**: `365cb76` BackendUserSync provider — fetches /api/users/me, dispatches updateUser to Redux, kills "Nuro User 30660..." vs "Richard Wayne" sidebar/Settings drift
**Sidebar**: `f76307e` SidebarProof Hyperliquid fix (two-file drift: navigation.config.tsx edits never took effect because SidebarProof.tsx had inline hardcoded nav)
**Wallet polish**: `f479f1a` Limit panel polish — styled popover replaces native select, balance gate + Insufficient SYM CTA + Max button, token picker SVG icon paths corrected, native dedup (PURR + ETH×4-chains was 4 dupe rows)
**Deploy automation**: `819579c` `scripts/deploy-fe-vps.sh` + `deploy-be-vps.sh` codify S30 lessons (ff-only pull, auto-detect pnpm install, npx next build NOT pnpm run build, pm2 restart --update-env, post-deploy verification of pm2 state + BUILD_ID timestamp); .gitattributes forces LF on .sh
**Solana aggregator marathon (Phase 1 → 2 → 2.5 → 3a → 3b → 3c)**: `5c98754`, `2911208`, `9721d8e` and intermediates — Jupiter client + /quote/swap-solana + Solana SPL catalog + ReloadModal + ReloadFlow rewire; mid-deploy discovered Jupiter migrated `quote-api.jup.ag` → `lite-api.jup.ag/swap/v1/quote`, hot-fixed; full memecoin → card-credit aggregator path
**🚨 Critical discovery**: FE deploy path had been broken for ~85 commits. `pm2 restart 1` after `git pull` doesn't rebuild Next.js (`next start` serves pre-built `.next/`). Every "deploy" since ~S27 had been restarting a server with stale compiled JS. Correct sequence finally documented (and captured in deploy-fe-vps.sh).
**Heimdall H1 live**: HEIM-001..007 ingress observers armed in observe mode (caught a real "ignore previous instructions" payload through paid /huginn/counsel during S33 deploy = first concrete proof of value)

### Migrations applied: **028** (plaid_dwolla_columns — first_name, last_name, dwolla_customer_url, dwolla_funding_source_url, plaid_access_token, plaid_item_id on users), **029** (execution_log_user_id — VARCHAR(36) + partial index, plugged the silent withdrawal-audit-log loss), **030** (solana_allowlist), **031** (address_book), **032** (heimdall_events)

### Infrastructure / config changes
- Google OAuth wired into VPS FE `.env.local` (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET, NEXTAUTH_URL fixed from `localhost:2800`)
- Heimdall observe-mode flags wired (default off; flipped per-rule after FP rate validated)
- Solana aggregator LIVE — Jupiter API `lite-api.jup.ag` migration handled
- FE deploy script `deploy-fe-vps.sh` is now the canonical path; PM2 restart → `next start` of stale `.next/` regression-class is closed

---

## 2026-04-24 — Session 29: Signup-fix under fire + Heimdall design + Kelp defense docs

See [[Session 29 Recap]] for full arc. Short in commits, long in design (Heimdall as Layer 4.5 in Marathon 8 spec).

### Commits (2 total)
- `3e894bd` fix(auth): unify env vars + v4/v5 secret compat + role default + dedup route + Privy-disabled visible notice — five correlated signup-broken issues fixed: (1) `/api/auth/register/route.ts` BACKEND_URL → CASHLY_API_URL unification, (2) `auth.ts` accepts both AUTH_SECRET (v5) and NEXTAUTH_SECRET (v4) — kills silent insecure-fallback, (3) useLogin.ts role field default 'user' — silent TS strict-mode error fixed, (4) deleted nested dup `src/app/api/auth/login/login/route.ts`, (5) SocialLoginSection visible amber notice replaces silent no-op
- `e09e3fe` docs(architecture): bridge-defense.html + card 11 — Kelp hardening posture (11th sub-page in architecture hub, two mermaid diagrams: Kelp vs Nuro comparison + 5-layer defense flow, cites LayerZero April 2026 integration-checklist mandate)

### Migrations applied: **none** (S28's 028 + 029 still pending VPS — applied S30 morning)

### Infrastructure / config changes
- `Marathon 8 — Corvus.md` — Heimdall as Layer 4.5 spec written (~180 lines): threat model citing Anthropic Mythos Preview disclosure, 5 functions detailed, hardware BOM (Raspberry Pi 5 primary + hot-spare + WORM log on third host, ~$650 one-time), software stack (Rust/Go, mTLS, SQLite + WORM), CLI, agent integration matrix, meta-security, phase timing
- Signup verified live end-to-end via curl (backend port 3000 + FE proxy port 2800 both clean)
- Chris pushed `chris-ui-updates` as a GitHub branch — first time he used git rather than Telegram zip

---

## 2026-04-22 → 04-23 — Session 28: Kelp hardening + Corvus spec + offline-unblocked seed-round slate

See [[Session 28 Recap]] for full arc. Two parallel mandates — ship Nuro seed production while waiting on Plaid+Dwolla creds + plan post-seed reasoning infra.

### Commits (14 total)
- `1b98c62` Buy 1 backend route (POST /buy-from-card) — flag-gated, non-atomic with reconciliation (SD3-first ordering: if SD3 debit fails, user loses nothing; if on-chain transfer fails after debit, transactions.status='debited_pending_transfer' for operator reconciliation via issuers.creditCard())
- `0a56da5` Plaid + Dwolla scaffolds — link-token/link-complete routes + FE PlaidLink
- `fc38dcc` SolanaWalletCard — Privy Solana portfolio UI (consumes existing hook)
- `7e6d2fa` TS errors 38→28 via framer-motion Variants annotation in wallet modals
- `86f1316` engagement-fetcher dry-run mode + PollResult + static-analysis findings
- `67cc67b` admin agent creation form + /admin/api/users/lookup (email→userId)
- `536f77e` docs sync: 30 Claude Memory + Decision Journal files into repo
- `62aa23f` migration 029 — execution_log.user_id (silent audit-log bug — 4 INSERT call sites in withdrawal audit path were inserting user_id into a column that never existed, every withdrawal silently lost audit trail via .catch(() => {}) swallow)
- `2ed1856` **Kelp response** — hardened MyOFTAdapter.sol (custom _lzReceive with per-message cap 100k USDC + per-peer 24h rolling cap 500k USDC + owner pause + rich event stream) + reserve monitor (`src/lz-reserve-monitor.ts`, 5-min off-chain drift detection) + LZ_BRIDGE_ENABLED kill-switch (default false) + layerzero.config.hardened.ts with 2-of-3 multi-DVN target. **Critical finding during on-chain verification: existing layerzero.config.ts had BROKEN DVN addresses for Arbitrum and zkSync — contracts at those addresses don't exist. Accidentally safer than working 1-of-1, but coincidentally.**
- `6be6b6c` Issuer 403 → null return — breaks infinite retry loop on user 49418fc8 (was burning Issuer quota every hour because 404 was handled but 403 wasn't); 5 call sites of getUserBaseDepositAddress updated to handle string|null
- Admin panel diagnostic series: `6d57bae` isolate dashboard loaders defensively, `2615dff` visible boot-status strip, `f20c2ab` Cache-Control no-cache headers on /admin
- `3d9cf0c` admin: 5 JS syntax errors fixed (root cause of blank panel) — backtick template literal escape collisions, `\'` collapses to bare `'` inside single-quoted JS. Pattern `\\\'` (3 source backslashes) fixes; `node --check` confirms parse clean.

### Migrations written, NOT yet run on VPS (applied S30 morning)
- **028** plaid_dwolla_columns — first_name, last_name, dwolla_customer_url, dwolla_funding_source_url, plaid_access_token, plaid_item_id on users; partial index on dwolla_customer_url
- **029** execution_log_user_id — VARCHAR(36) matching users.id + partial index

### Infrastructure / config changes
- Added CONFIG.BUY_1_ENABLED, BUY_2_ENABLED, FEE_VAULT_MIN_RESERVE_USD, LZ_BRIDGE_ENABLED (all default false/safe)
- 2× H100 BOM + Marathon 8 — Corvus.md written (Neural-Net-only, not synced to repo — contains raw strategy + budget)
- Live fire drill: investor-meeting concurrent admin panel blank → debugged in real-time without browser access → offline diagnostic Node script extracting admin HTML `<script>` block + simulating TS backtick template processing + feeding to vm.Script for parsing → found 5 JS syntax errors → fixed via `\\\'` pattern

---

## 2026-04-21 → 04-22 — Session 27: 18-hour two-sprint day — user-id migration + 9-task tech-debt cleanup + Twitter OAuth

See [[Session 27 Recap]] for full arc. Cross-midnight session, 14 commits, 1 migration, 9-task tech-debt slate plus 5-piece extension block.

### Commits (14 total) — selected highlights
**Morning diagnostics**: $6.84 vs $4.45 card page mystery diagnosed as 3-layer issue (stale SD3 balance cache, rate-limit cascade hiding stale state, architectural asymmetry between transactions.user_id and cards.user_id). Shipped: rate-limit backoff + SD3 health endpoint + balance freshness metadata.
**Webhook gate**: gate-check caught missing HMAC secret on VPS before flipping ISSUER_WEBHOOK_OBSERVE_ONLY=false. Generated + saved. Owen confirmed 10 min later. Path to live webhooks clear.
**Twitter OAuth onboarding**: 5-token setup for @NuroCard (Consumer Key, Secret, Bearer Token, Access Token, Access Token Secret). Test tweet failed HTTP 402 Payment Required (X Pay Per Use credit gate — code works, billing is the gate). `Funding-Gated Shopping List` doc written.
**9-task tech-debt slate**:
1. **User-ID semantic migration (~2hr)**: migration 027 + 73 tx rows + 3 deposit_addresses rows rewritten from SD3 UUID → local users.id. **Critical design call**: keep `generateDepositAddress(sd3UserId)` HD-seed unchanged so existing on-chain addresses stay valid. Atomic deploy. Verified $6.84 income still returns for Richard's JWT — zero behavioral drift.
2. **TS config upgrade (30 min)**: target es5 → es2020, moduleResolution node → bundler, excluded cashly-vaults + dead scripts. Error count 110 → 38 (65% drop) zero runtime change.
3. **Admin log drill-down smarter**: when entity_id is UUID AND entity_type in transaction-FK list, auto-fetch tx row + render inline panel above JSON. Silent on 404.
4. **Prediction market admin tools (~1hr)**: /admin/api/markets endpoint + 5-stat summary + top-20 active + stuck-pending positions + creator payout audit. POST /admin/api/markets/:id/resolve manual override. Panel with Resolve buttons.
5. **linkifyTxUuids applied everywhere**: every UUID in every admin table now clickable chip.
6. **Marathon 3 MCP decision**: SSH MCP landscape researched, concluded Bash already works, decision logged.
7. **Solana FE Privy wiring**: embeddedWallets.solana.createOnLogin + new useSolanaAddress hook with defensive try/catch around /solana submodule import. useSolanaWalletPortfolio auto-resolves from Privy or accepts explicit override.
8. **Sprint 2.3 Bot Section backend**: discovered runtime infra already built — alpha-bot strategy, CLOB stub, HD agent wallet, execution-dispatch sweep all live. Built /admin/api/agents endpoint + panel.
9. **Decision journal + handoff**.
**Extension block (+5 tasks)**:
10. ISSUER_WEBHOOK_OBSERVE_ONLY=false flipped — webhook pipeline LIVE in production
11. Webhook verification live-feed panel — HMAC verify stats (total/verified/rejected/verify_rate), 4-stat strip, collapsible HMAC trail (last 20 attempts incl. rejected with sig_prefix + body_hash + source_ip), processed-events trail
12-14: triaged 22 stranded deposits ($21.81 total — deleted orphan rows for never-onboarded users)

### Migrations applied: **027** (user_id_to_local — atomic rewrite of 73 tx rows + 3 deposit_addresses rows from SD3 UUID to local users.id)

### Infrastructure / config changes
- VPS env: `ISSUER_WEBHOOK_OBSERVE_ONLY=false` (LIVE webhooks)
- VPS env: 5 Twitter tokens for @NuroCard provisioned (gated on X Pay Per Use credit load)
- TS error count 110 → 38

---

## 2026-04-20 — Session 26: Visa real-spend UX exposure + Sprint 6.5 observability trio + growth-agent intelligence

See [[Session 26 Recap]] for full arc. Three-track day: rediscovery that Sprint 2.4 was 90% built, Sprint 6.5 observability shipped end-to-end, growth-agent curated market broadcaster.

### Commits (8 total)
- Stale deposit_addresses cleanup for Richard's personal MetaMask (stripped 2 ghost userId mappings)
- Multi-chain sell in Swap panel + positive token allowlist hook (`useTokenWhitelist.ts`, fetches /api/supported-tokens, caches address+symbol Sets for 10 min, early-exits scam filter for curated tokens — LINK at stale $0 no longer filtered)
- Overview BarChartWidget rewrite — "Stocks/Bonds/Real Estate" mock → live per-chain USD allocation (Ethereum #627EEA, Base #0052FF, Arbitrum #28A0F0, Polygon #8247E5)
- **Sprint 2.4 surfacing**: rowToTransaction extended with 5 Visa fields (merchantName, merchantCategoryRaw, transactionType, issuerTransactionId, sourceVerified), Transaction interface extended, FE description cell branched to show merchant + "Visa spend · MCC 5812" secondary + green ✓ source_verified badge
- **Sprint 2.1 Base Vault exposure**: GET /users/me/vault (vault address + USDC balance + ETH gas + open positions + totalAtRisk) + FE proxy + new "Base Vault" card on /en/dashboard/vault
- **Sprint 6.5 Observability trio**: /admin/api/deposit-funnel (per-chain + overall detected/bridged/failed/pending/success_rate 24h), /admin/api/chain-health (green/yellow/red via stuck_pending count, recent_failures, last-confirmed age), src/ops-alerts.ts (every 10min Telegram alert for stuck pending tx older than 30min, deduped via execution_log to prevent channel spam)
- **Growth agent**: src/growth-agent/skills/market-watcher.ts — every 15min scans new active markets in crypto/politics/culture (last 2h, max 3/run) + market_positions cost_basis>=$50 (max 3/run), composes Moltbook-ready preview with category emoji + YES/NO % + resolution date + link, routes through submitForApproval() for Telegram approve/reject, deduped via execution_log
- **EOD stretch (8 tasks in 3 hr)**: migration 026 confirmed_at column + backfill, dual-CTA Buy panel (Buy 1 / Buy 2 flag-gated), MCC → category labels (`src/lib/mcc.ts` ISO-18245 ~100 codes covering 95% of consumer Visa spend), prediction markets page polish (search + sort + category pills with counts + image_url + explorer link + dynamic SUPPORTED_CHAINS count), deposit funnel sparklines + 24h↔7d toggle (with two SQL bugfixes: FILTER nesting inside EXTRACT, interval template double-prefix)

### Migrations applied: **026** (transactions_confirmed_at — backfilled 12 existing rows with confirmed_at = created_at, added (status, confirmed_at) index, both monitor.ts confirm-write sites updated to write confirmed_at = now())

### Infrastructure / config changes
- Stuck-tx Telegram alerter live (10-min cron, dedup via execution_log)
- Growth agent now broadcasts curated market previews via Telegram approve/reject
- "Matt is an unknown" purge — removed phantom collaborator name from Neural Net (carried from pre-S17 partial context). Lesson: never invent collaborators from partial context.

---

## 2026-04-19 — Session 25: The day /my-wallet stopped lying — Alchemy server-side proxy + 5-phase Swap

See [[Session 25 Recap]] for full arc. Longest run-session of the project so far. Chris dropped a 83KB design-complete `ConnectedWalletDashboard.tsx` with zero onClick handlers; Richard chose to make it work, not just polish the wire-job.

### Commits (25 total) — 5 phases of wallet build
**Phase 1 wired the dashboard**: AssistantChatPanelV2 swapped in, Send/Receive first-pass onClick handlers, tab state local React, Hide Scams toggle defaulted on.
**Phase 2 killed mock data**: new `useWalletPortfolio` hook called wagmi + CoinGecko directly from browser, real totals + 24h deltas across Ethereum/Base/Arbitrum/Polygon. **$128,492 hardcoded number gone by lunch**, per-chain cards stopped lying. Honest "Demo data" badges on All Assets + Recent Activity flagged what was still pending.
**Phase 3 — biggest bet**: brand-new `src/wallet-portfolio-routes.ts` with `/wallet-portfolio` + `/wallet-activity` proxying Alchemy enhanced APIs server-side (API key never leaks). CoinGecko price integration with platform-specific contract lookups. 30s in-memory cache + 10 req/10s IP rate limit. Cherry-picked Alchemy key out of existing RPC_URL_POLYGON on boot (zero new env vars). First test on Vitalik returned $3,069 portfolio with 25 enumerated tokens. Hotfixes: stable global cache key + 5-min TTL + 1-hr stale-ok fallback (CoinGecko 429), chunked CG token-price requests with per-chunk try/catch (malformed contracts in spam-heavy wallets), per-chain category selection (Alchemy's `internal` transfer category not supported on L2s).
- `5bbb52c` feat(wallet): phase 3 — real All Assets + real Recent Activity via Alchemy
- `574a793` fix(wallet-portfolio): CoinGecko rate-limit + Alchemy internal-category
**Phase 3.5 + 4**: `56fe816` Multi-token Send (SendModal rewritten with portfolio-driven token picker, chain-switching, ERC-20 transfer via viem erc20Abi) + smarter scam filter (phishing-name heuristic — t.me/ links, emoji clusters, embedded TLDs, "visit to claim" patterns)
- `c79d937` feat(wallet): phase 4 — firm Swap execution via wagmi (new /quote/swap/firm BE endpoint returning executable 0x tx payload with user's wallet as taker, FE proxy /api/quote/swap-firm keeps API key server-side, Swap button no longer lies)
- `fa47296` fix(wallet): modal overlay visibility + Swap pre-flight balance check (explicit bg-black/75 + backdrop-blur-[6px], wagmi useBalance pre-flight + amber Insufficient balance banner + Max button)
**Phase 5**: `184d732` ERC-20 sell-side Swap with approval flow (portfolio-driven sell-token dropdown chain-filtered + non-scam + non-zero, ERC-20 path with useReadContract/useWriteContract running approve → wait → re-fetch firm quote → swap, CTA cycling "Approving LINK… → Confirm in wallet → Waiting for confirmation… → Swap confirmed ✓")
**Admin Phase 2**: `ffddf68` live heartbeat pulsing `• LIVE` pill + 900ms teal glow flash on changed stats + slow ambient breath (14s + 18s offset)
- `3dc398c` feat(admin): log row click-through modal (full JSON + Etherscan deep-link + Copy JSON + Esc-to-close)
- `1c7fc50` feat(wallet): activity scam filter + tabs honest + live refresh + optimistic bump (Limit/Buy/Sell tabs disabled with text-white/25 + tooltip honestly-disabled, 60s-poll refresh + optimistic activity-bump CustomEvent)
**Architecture rework**: 10 sub-pages with readable mermaid (fontSize 17), domain-split ER diagrams, worked HD-derivation + CCTP examples, honest per-service cards, scroll-story Neural Net page; nginx /admin + /telegram/webhook proxy install via versioned `ops/nginx-nuro.conf` + reviewable install script

### Migrations applied: **0** (S23's 024 + 025 still authoritative)

### Infrastructure / config changes
- Alchemy server-side proxy LIVE — wallet-portfolio + wallet-activity routes proxy enhanced APIs without leaking key
- nginx `/admin` + `/telegram/webhook` proxy install (versioned in `ops/nginx-nuro.conf` + reviewable script)
- New endpoints: `/wallet-portfolio`, `/wallet-activity`, `/quote/swap/firm`

---

## 2026-04-19 — Session 24: Neural Net self-improvement + dashboard cross-linking

See [[Session 24 Recap]] for full arc. Self-improvement session — 3 skill upgrades + 4 product improvements via tight 3-hour scope discipline.

### Commits (4 total)
- `171e3ea` feat(admin): ERC-20 allowlist management UI — HTML panel with 8-column table (symbol/name/chain/category/contract/audited/liquidity/ON-OFF toggle), "+ Add Token" inline form with contract-address validation + memecoin policy warning, three handlers wired to existing /admin/api/erc20-allowlist endpoints
- `1ae0b8a` feat(mythos): engagement fetcher cron — `src/growth-agent/skills/engagement-fetcher.ts`, Moltbook via existing getMoltbookPostMetrics + Twitter via v2 /2/tweets/:id with public_metrics + Bearer token, hourly setInterval first poll 5min post-boot, auto-enables when MOLTBOOK_AGENT_TOKEN or TWITTER_BEARER_TOKEN is set
- `b51ee1c` fix(admin): escape apostrophes in allowlist toggle-button onclick (template-literal escape collision — `\'` decoded to `'` at render producing `'' + esc(r.id) + ''` JS syntax error; fixed with `\\\'` triple backslash, `node --check` confirmed parse clean)
- `5725947` feat(dashboards): live skill-health + invocation heat + cross-filter + style parity — full neural-dashboard.html parity with sub-agents (glassmorphism panels, chip buttons emerald accents, section-labels with letter-spacing, range slider numeric value, keyboard shortcuts in legend, "Jump to → Sub-Agents Map" chip); live health via new /admin/api/skill-health + /public/skill-health (aggregates execution_log by entity_type, classifies green/yellow/red/unknown by error rate, Next.js proxy edge-cached 30s, falls back to static green on failure); invocation heat (sqrt-scaled node-radius boost based on invocations_7d); cross-filter (info panel "See decisions →" deep-link to neural-dashboard.html?skill=<id>, neural dashboard reads URL param + filters decisions + shows banner with filter count + clear ✕)

### Migrations applied: **0**

### Infrastructure / config changes
- Skills upgraded (in `.claude/skills/`, untracked): /auditor expanded with 4 S23 bug classes (useEffect retry loops, package subpath mismatches like @web3icons/react, chain-token coupling gaps, missing per-chain config maps like Arbitrum gas) + risk-policy cross-refs + calibration; /gate-check expanded with 3 new gates (erc20-swap-live, erc20-memecoin-live, heygen-live); **/encode written from scratch (10-step ritual that auto-generates Recap + Handoff + DJ + Pending Tasks at session close)** — this is the first version of the encode skill, expanded to 16 steps S35 Day-4; /researcher + /bridge + /deployer all switched to context7-first for library/API/SDK docs
- Memory consolidation pass: tech_decisions_afi.md got Sessions 22-24 additions block (9 new canonical patterns), user_profile.md updated to reference /encode skill, MEMORY.md index refreshed

---

## 2026-04-18 — Session 23: Marathon 7 full production + memecoin UX + DB-backed allowlist

See [[Session 23 Recap]] for full arc. The longest and densest session up to that point — 19 commits, 2 migrations, context window reset once mid-session.

### Commits (19 total) — selected highlights
- `72375e9` chain-logo fix — regenerated 23 brand-faithful compact SVGs (replaced lazy "letter-on-circle" placeholders)
- `951cae6` /users/search endpoint + RecipientSearch.tsx debounced autocomplete + DestinationToggle.tsx 3-way segmented control with hasCard gating
- `9d000e9` **Marathon 7 MVP — native-token → USDC auto-conversion** ($500K investor-demo feature). src/swap.ts with 0x Aggregator v2 AllowanceHolder integration. monitor.ts extended with pollNativeBalance() running alongside pollChain. CONFIG flags: ZEROX_API_KEY, ZEROX_SLIPPAGE_BPS=300, SWAP_MIN_USD=5, NATIVE_SWAP_ENABLED=false. VPS API key set + flag enabled.
- `5648019` neural-dashboard.html deployed to app.nuro.finance/neural-dashboard.html (Next.js serves /public/*.html bypassing locale middleware)
- `f4b4c2f`+`53da892` WagmiProvider + QueryClientProvider wired into Providers.tsx + WalletDepositButton with connect/switch-chain/send states + integrated as primary CTA in ReloadFlow with manual copy-paste demoted to "or send manually"
- `c363248` **Hotfix**: FE infinite-retry loop on GET /cards/:id/secrets when Issuer returned 500 "Too many requests" — added secretsAttemptedRef guard to CardDetails.tsx (cascade was ~15 rps) + fixed "Base direct · no fee" copy to "lower fee"
- `c137332` Marathon 7 live activation — Arbitrum swap failures (insufficient_for_gas) on legacy dust addresses diagnosed as per-chain gas buffer bug (0.0002 ETH was too low for Arbitrum L2; actual gas ~0.00219 ETH). **Fixed with per-chain GAS_BUFFER_BY_CHAIN map** + admin console "Native→USDC Swaps" telemetry panel
- `367f020` transactions date bug — every transaction showing "Today, 04:28" because FE read tx.created_at but backend returns date; fixed prefer-date-then-created_at resolution. Also shipped sub-agents-dashboard.html
- `a76dbda` chain icons overhaul — installed @web3icons/react, built src/lib/chainIcons.tsx with centralized <ChainIcon> component. **Gated HEYGEN daily cycle behind HEYGEN_ENABLED=false** (killed `avatar look not found` log noise)
- `96513a1` **Marathon 7 Reload UX — the big one**: full 3-category token picker (Stablecoins / Natives / Memecoins) with 2-stage UI (category cards → token grid). Added ERC20_ALLOWLIST in swap.ts with Tier-1 bluechips (LINK/UNI/WBTC/WETH/cbBTC). executeErc20ToUsdcSwap with ERC-20 approval step. pollErc20Balance in monitor. Backend `/supported-tokens` and `/quote/swap` endpoints. FE useLiveSwapQuote hook. **Memecoin Allowlist Policy doc written.**
- `3c6c324` live quote fix — /quote endpoint failed with burn-address taker on Base; switched to 0x /price endpoint for previews (no taker required)
- `85c6157` **module import fix** — NetworkIcon is only in @web3icons/react/dynamic subpath, top-level exports namespace objects. Transactions table crashed with React error #130 until fixed (~15 min outage)
- `b8cb173` native chain expansion 6 → 13 (added Avalanche/Linea/Scroll/Unichain/World Chain/Sonic/HyperEVM after testing 0x coverage live; AVAX/S/HYPE in picker)
- `1afde50` Telegram buttons + engagement — pollTelegramApprovals only fired inside runHourlyCheck (60min cadence, tap-to-publish latency up to 120min); pulled into dedicated 10s loop. Migration 024 added post_engagement time-series table + seedPostEngagement hook at publish time
- `5ffdaa2` UX polish batch — chain picker density (3→4 col + aspect-[5/4]), removed slippage line from natives description, Agent Cards tabs color match, Reload Card button green→blue
- `cd3533a` **DB-backed allowlist (Option B refactor, ~2hr)**: migration 025 moved ERC20_ALLOWLIST from hardcoded constant to Postgres table. ensureAllowlistFresh() with 60s in-memory cache + forceRefreshAllowlist() for admin writes. 3 new admin endpoints for CRUD. Seeded 10 bluechips + 4 memecoins (SHIB/PEPE/PENGU/ANDY) + 1 disabled placeholder (QUAI, pending contract). **Swap Risk Policy doc written — codifies "user eats volatility, not us"**
- `f462980` token sheet viewport fix (top:212 → top:16 full-height) + flipped ERC20_MEMECOIN_ENABLED=true + FE fetches /api/supported-tokens on mount + renders live memecoins as clickable tiles
- `f3c931c` dynamic chain picker + overview modal — chain list was showing all 23 even for PEPE (Ethereum-only); added dynamic filter (non-stable tokens restricted to chains with allowlist entries) + auto-bounce selectedChain when incompatible. Applied to BOTH reload surfaces (my-card-1 side panel + my-card-v2 overview popup modal — added full 3-category picker there too)

### Migrations applied: **024** (post_engagement time-series table), **025** (erc20_allowlist DB-backed)

### Infrastructure / config changes
- VPS env: `NATIVE_SWAP_ENABLED=true`, `ZEROX_API_KEY` set, `ZEROX_SLIPPAGE_BPS=300`, `SWAP_MIN_USD=5`, `HEYGEN_ENABLED=false` explicit, `ERC20_MEMECOIN_ENABLED=true`
- New endpoints: `/users/search`, `/supported-tokens`, `/quote/swap`, 3× `/admin/api/erc20-allowlist` CRUD
- Public assets: `app.nuro.finance/neural-dashboard.html` + `app.nuro.finance/sub-agents-dashboard.html` deployed (served via /public/*.html bypassing locale middleware)
- Context7 MCP wired (4 servers now: postgres-cashly + filesystem + github + context7)

---

## 2026-04-17 → 04-18 — Session 22: Incident response → config hardening → MCP enablement

See [[Session 22 Recap]] for full arc. 12 commits, all CI green, 8 Decision Journal entries.

### Commits (12 total)
- `918c105` **Incident fix — BSC $40B display**: monitor.ts hardcoded `decimals = 6` for all 23 chains, BSC uses 18-dec Binance-Peg USDC. Real $0.04 deposit displayed as $40B (1e12× inflation). Per-chain decimals fix across monitor + bridge waitForArbUsdc Arb-side scaling. **$0.038 stranded on Arbitrum deployer wallet** — recovery script written (`scripts/manual-sweep-arb-to-base.ts`)
- `30700b5` **Dep-gate**: 51 undeclared FE packages (next, react, react-dom, +48 more) declared in package.json + `scripts/verify-deps.js` wired into `.husky/pre-push` + `.github/workflows/backend-ci.yml`. Root cause: yarn-berry was silently installing via yarn.lock; recent yarn→npm migration purged them on first npm ci. **Class-of-bug eliminated by machine-enforced gate.**
- `6bf3997` FE polish — `src/lib/format.ts` formatUSD() + formatSignedUSD() (`$2,000,006.84` not `$2000006.84`); 9 FE components swept
- `12d321c` Sprint 6.3 config hardening — POLL_INTERVAL_MS env-configurable (default paused, VPS overrides to 60s; replaces sed-hack), DECIMALS_BY_CHAIN moved to `src/lib/chains.ts` shared registry, `scripts/vps-dirty-tree-check.sh` pre-SSH gate
- `096bc98` Sprint 6.1 silent-skip telemetry — logMonitorSkip() helper writes every skip path to execution_log with machine-readable reason code + human detail (kills S21 "why didn't admin show skipped deposit?" class)
- `718258c` Sprint 6.2 dedup consolidation — checkDepositDedup() in `src/lib/dedup.ts` replaces 2 duplicate DB-dedup blocks in pollChain + processDeposit. Preserves all status-based retry semantics. 9 new Vitest tests.
- `f8aebb9` Observability — pino-http middleware on Express (every req/res auto-logged as structured JSON; tier-1 library scouting pick, 5-min integration)
- `beb0cc7` Telemetry fix — execution_log schema alignment (removed user_id column from logMonitorSkip INSERT — prod schema had no user_id col; old INSERT silently failed behind .catch)
- `99e1a06` Admin panel — `/admin/api/monitor-skips` endpoint + 🛑 Monitor Skips dashboard panel with reason-code aggregation + recent 20 rows
- `168072c` polish — Skip-panel detail column widening via CSS text-overflow:ellipsis, max-width 420px, hover tooltip
- `b66eb5d` Sprint 6.4 — SIGTERM/SIGINT graceful-shutdown handler marking pending rows failed_restart + boot-time reconciler + dedup.ts failed_restart handling
- (Dependabot merge during session) production-dependencies bump

### Migrations applied: **023** (sprint 6.1 telemetry helper schema additions)

### Infrastructure / config changes
- VPS env: `POLL_INTERVAL_MS=60000` (60s, replaces paused state)
- Pre-push gate: `scripts/verify-deps.js` (every imported package must be declared in package.json or push fails)
- 3 user-scope MCP servers configured + verified ✓ Connected: `postgres-cashly` (SSH tunnel localhost:5433 → VPS:5432), `github` (rotated PAT), `filesystem` (rooted at C:\Users\Richa\AFI)
- Skill: `.claude/skills/deployer/SKILL.md` full rewrite — correct PM2 IDs (4/1), POLL_INTERVAL_MS env workflow, dirty-tree gate Step 0, mandatory `npm ci` on BE deploys (S22 pino-http lesson)

---

## 2026-04-16 → 04-17 — Session 21: Sprint 2.3 + test infra + investor-day live debug

See [[Session 21 Recap]] for full arc. 16 commits, ran through Sprint 2.3 backend (agent funding + CLOB cycle + bet settlement + profit sweep + reconcile) overnight, then four cascading silent bugs caught during live deposit testing 1 hour before investor meeting at 1pm PST.

### Commits (16 total)
**Sprint 2.3 (overnight)**: `3d334a6` agent execution backend (mig 021 + 5 sweeps + endpoints), `471cf2e` @polymarket/clob-client to runtime deps, `c578c18` untrack tsbuildinfo + remove yarn.lock (this commit's purge of yarn.lock is what triggered S22's verify-deps incident), `ecfee79` gate sweepAgentProfits behind AGENT_PROFIT_SWEEP_ENABLED
**Schema drift hotfixes (overnight)**: `b8aefe6` mig 021 FK agents.id is UUID on prod not VARCHAR, `cd8254c` tsx to runtime deps (resolved PM2 crash loop), `5f191e7` mig 022 agent_bets settlement columns retroactive, `29b416f` schema_migrations tracking table + audit-schema.sql + schema-integrity gate, `693c850` audit-schema baseline corrected against production reality (41-row schema audit returning 46/46 OK at sleep)
**Monday-unblocker**: `037daa4` reverse CCTP (cctpBaseToPolygon) + 20 new unit tests
**FE polish**: `d689d95` my-card-1 QRCode empty-string crash guard, `6b433cb` Base-direct vs vault route toggle in Reload flow
**Investor-day live-debug fixes (last hour before meeting)**:
- `768fbd1` monitor derives EVM vault addresses from users table (silent skip for un-cached users)
- `8289573` processDeposit dedup gets 60-min time window (was unbounded)
- `fe5c5ef` Base publicnode RPC URL typo fix (was 'base-mainnet-rpc', correct is 'base-rpc')
- `2c3f213` pollChain inflight check ALSO gets 60-min time window (separate dedup layer)

### Migrations applied: **021** (agent execution + agents table + agent_bets), **022** (agent_bets settlement columns retroactive)

### Infrastructure / config changes
- VPS env: AGENT_FUNDING_OBSERVE_ONLY=true (Sprint 2.3 funding gated), AGENT_PROFIT_SWEEP_ENABLED=false
- New scheduled task: `gate-completeness-audit` Sunday 10:03 AM weekly cron
- 11 investor prep artifacts in `Neural Net/Investor Prep/2026-04-17_Meeting/`
- `.claude/skills/gate-check/` — first version of the gate-check skill (6 gates registered: agent-funding-live, agent-clob-live, agent-profit-sweep-live, privy-live, deploy-vps, schema-integrity, gate-check-sanity)
- `Neural Net/Sub-Agents/` scaffold with INDEX, conflict-resolution policy, orchestrator-mythos.md, D3 generator
- Investor-meeting outcome: admin panel ticked 38 → 41 on-chain transactions during the live debug, with 3 successful same-day bridges. Bridge reliability went from broken → more reliable than baseline.

---

## 2026-04-16 — Session 20: 3 Marathons + 2 Security Incidents + tsx Migration

### Backend Commits: `75e4ade`, `73921a4`, `b8c23d9`, `719c00e`, `026cfb8`, `e1b5722`, `e17a039`, `7c8ecee`, `b45b6fb`, `30fd37b` (10 commits)

### Migrations applied: 016, 017, 018, 019, 020

| Sprint / Incident | Outcome |
|---|---|
| Sprint 2.4 (Issuer webhooks + tx sync) | ✅ Live, migration 016/017, observe-only tested, Richard's card linked |
| Sprint 2.1 Slice-1a (bet hardening) | ✅ Live, advisory + per-address chain lock + fresh nonce across 4 paths |
| Sprint 2.1 Slice-1b (card settlement) | ✅ Live, `card_settlements` table, extensible payout_destination, frontend dropdown verified |
| Sprint C (creator stake + rewards) | ✅ Live, `sweepCreatorPayouts` registered, awaiting first resolved market |
| Sprint D (balance safeguards) | ✅ Live, `card-balance-sync.ts` helper replaces 3 inline sites |
| Cleanup bundle (2.6 cancel, autocomplete, middleware, ecosystem) | ✅ Live, root `/` redirects to `/en/login` |
| Security incident: default login creds | ✅ Resolved — removed creds + 2 auth bypasses |
| Security incident: GitHub PAT leak | ✅ Resolved — token revoked, remotes stripped |
| Production incident: Privy crash + tsx migration | ✅ Resolved — placeholder stripped, backend moved to `tsx` |

**Infrastructure change**: Backend launch moved from ts-node → **tsx** (esbuild-based, handles CJS+ESM without loader gymnastics). `npm install --save-dev tsx` on VPS. Ecosystem: `bash -c "./node_modules/.bin/tsx src/index.ts"`.

**PM2 state at session close**: `cashly-frontend` (id 1) + `cashly-middleware` (id 4), both stable, `pm2 save` persisted. Ecosystem file is at `/home/cash/Cashly/ecosystem.config.js`.

**Admin endpoints added**: `/admin/api/card-settlements`, `/admin/api/card-balance-drift`, `/admin/api/webhook-verifications`, `/admin/api/webhook-conflicts`

**Related docs**: [[Neural Net/Session_Logs/Session 20 Recap]] · [[Neural Net/Session_Logs/Session 20 Plans]] · [[Neural Net/Session_Logs/Session 21 Handoff]] · [[Neural Net/Error Log]] (Error 9 new)

---

## 2026-04-05 — Session 7: Stripe Billing Integration

### Frontend Commit: `61b1bea` on Build_Branch
### Backend Commit: `d3a4abb` on Build_Branch

| File | Change | Status |
|------|--------|--------|
| `src/index.ts` | Stripe webhook handler (5 event types) before express.json() | MODIFIED |
| `src/nuro-routes.ts` | +3 Stripe routes (create-checkout-session, create-portal-session, seed-prices) | MODIFIED |
| `package.json` | +stripe, pino, bcrypt, jsonwebtoken, @circle-fin/*, @solana/* deps | MODIFIED |
| `.env` | Updated STRIPE_SECRET_KEY to correct account key | MODIFIED |
| `PlanBillingContent/index.tsx` | Stripe Checkout redirect + Portal management + success/cancel URL handling | MODIFIED |
| `src/app/api/stripe/create-checkout-session/route.ts` | NEW proxy — POST | NEW |
| `src/app/api/stripe/create-portal-session/route.ts` | NEW proxy — POST | NEW |
| `src/app/api/stripe/seed-prices/route.ts` | NEW proxy — POST | NEW |

**DB Changes**: plans.stripe_price_id populated (Pro: price_1TIiSzDAVpr10bCAVnwuYL7I, Enterprise: price_1TIiTHDAVpr10bCA1DuHl7ql)
**Stripe Products**: prod_UHH1Y1UO36gsYF (Pro), prod_UHH1pgG8xEhdEt (Enterprise)
**Key fix**: Wrong Stripe API key replaced with correct account key
**Dep fix**: Cascading MODULE_NOT_FOUND errors after npm install stripe — resolved by reinstalling all missing peer deps

---

## 2026-04-05 — Session 6: CardSettings, Filters, Billing Stack, Preferences

### Frontend Commit: `8c1ac9b` on Build_Branch (30 files, +947/-366)
### Backend Commit: `9d9556f` on Build_Branch (+302 lines in nuro-routes.ts)

| File | Change | Status |
|------|--------|--------|
| `TransactionsContent.tsx` | Fixed build error — missing useEffect closing brace | FIX |
| `CardSettings.tsx` | Full rewrite — alerts/threshold/gradient persist via PATCH /cards/:id | REWRITTEN |
| `useTransactionsState.ts` | Wired to /api/card-transactions with filter query params | PATCHED |
| `CardListItem/index.tsx` | settings→navigate to my-card-1, report→toast | PATCHED |
| `cardActions.config.tsx` | Deleted unused MOCK_CARDS_DATA export | PATCHED |
| `SmartInvestPanel/index.tsx` | "More" link → Coming Soon toast | PATCHED |
| `usePreferencesState.ts` | Full rewrite — fetches/persists via /api/users/preferences | REWRITTEN |
| `PrivacyDataContent/index.tsx` | Export button wired to /api/users/export-data | PATCHED |
| `PlanBillingContent/index.tsx` | Full rewrite — plans, subscriptions, billing history, upgrade flow | REWRITTEN |
| `src/app/api/users/preferences/route.ts` | NEW proxy — GET + PATCH | NEW |
| `src/app/api/users/export-data/route.ts` | NEW proxy — GET | NEW |
| `src/app/api/plans/route.ts` | NEW proxy — GET | NEW |
| `src/app/api/subscriptions/me/route.ts` | NEW proxy — GET | NEW |
| `src/app/api/subscriptions/upgrade/route.ts` | NEW proxy — POST | NEW |
| `src/app/api/billing/history/route.ts` | NEW proxy — GET | NEW |
| `nuro-routes.ts` | +302 lines: preferences, export-data, plans, subscriptions, billing | MODIFIED |

**DB Changes**: cards.alert_enabled, cards.spend_threshold, users.preferences JSONB, plans table, subscriptions table, billing_history table
**PM2 Fix**: Backend switched from ts-node to tsx interpreter (PM2 id:8)

---

## 2026-04-04 — Session 5: Phase 5 Proxy Routes + Settings Rewrites

### Frontend: deployed to PM2 id:7 (no git commit this session — committed in Session 6)

| File | Change | Status |
|------|--------|--------|
| `src/app/api/users/me/route.ts` | NEW proxy — GET | NEW |
| `src/app/api/users/profile/route.ts` | NEW proxy — PATCH | NEW |
| `src/app/api/users/change-password/route.ts` | NEW proxy — POST | NEW |
| `src/app/api/users/notifications/route.ts` | NEW proxy — PATCH | NEW |
| `src/app/api/card-transactions/route.ts` | NEW proxy — GET + POST | NEW |
| `ProfileContent/index.tsx` | Full rewrite — Chris's local state → real /api/users/me + /api/users/profile | REWRITTEN |
| `SecurityContent/index.tsx` | Full rewrite — Chris's local hook → real POST /api/users/change-password | REWRITTEN |
| `NotificationsContent/index.tsx` | Full rewrite — Chris's local config → real /api/users/me + /api/users/notifications | REWRITTEN |

**Also completed**: handleAddTransaction wired, useTransferSubmit wired, CardQuickActions, yield-agents page, WithdrawFlow

---

## 2026-04-03 — Phase 5 Deploy Scripts + P0 Hook Wiring

### Session 4: Phase 5 Proxy Routes + Hook Rewrites
**Date**: 2026-04-03
**Status**: SCRIPTS READY — awaiting VPS deploy by Richard

| File | Change | Status |
|------|--------|--------|
| `deploy/phase5-deploy.sh` | Creates 5 proxy route files + patches settings components (API_URL → /api) | NEW |
| `deploy/phase5-chris-rewrites.sh` | Auto-detects Chris's local-state hooks, replaces with API-calling versions | NEW |
| `deploy/phase5-p0-hooks.sh` | Patches handleAddTransaction (console.log→POST) + useTransferSubmit (setTimeout→POST) + creates /api/transfers proxy | NEW |
| `deploy/PHASE5_RUN_ALL.sh` | Master runner — chains all 3 scripts + builds + restarts PM2 | NEW |
| `deploy/proxy-routes/api_users_me_route.ts` | Proxy GET → backend /users/me | NEW |
| `deploy/proxy-routes/api_users_profile_route.ts` | Proxy PATCH → backend /users/profile | NEW |
| `deploy/proxy-routes/api_users_change-password_route.ts` | Proxy POST → backend /users/change-password | NEW |
| `deploy/proxy-routes/api_users_notifications_route.ts` | Proxy PATCH → backend /users/notifications | NEW |
| `deploy/proxy-routes/api_card-transactions_route.ts` | Proxy GET+POST → backend /card-transactions | NEW |
| `Claude Memory/Pending Tasks.md` | Updated P0 items #3-5 status to SCRIPTS READY | UPDATED |
| `Claude Memory/Deploy History.md` | This entry | UPDATED |

**Deploy Command**: `cd /home/cash/nuro-finance-dashboard && bash deploy/PHASE5_RUN_ALL.sh`

**What the scripts do**:
1. Create 6 new Next.js API proxy routes (/users/me, /users/profile, /users/change-password, /users/notifications, /card-transactions, /transfers)
2. Auto-detect whether VPS has original settings components (API_URL pattern) or Chris's redesigned versions (useProfileState/DEFAULT_USER pattern)
3. Patch accordingly — either sed replace API_URL→/api, or full component rewrite with real fetch calls
4. Patch handleAddTransaction from console.log → POST /api/card-transactions
5. Patch useTransferSubmit from setTimeout+alert → POST /api/transfers
6. Build + PM2 restart

**⚠️ Still needs backend work before useTransferSubmit will work end-to-end**:
- `transfers` table creation on PostgreSQL (SQL in DB Contract Library)
- `POST /transfers` endpoint in nuro-routes.ts

---

## 2026-04-03 — Backend Reconcile + Full FE Wiring Audit

### Session 3: Git Reconcile + FE Audit
**Date**: 2026-04-03
**Commit**: `2d91ab4` on `Build_Branch` (merge conflict resolved)

| File | Change | Status |
|------|--------|--------|
| `package.json` | Resolved merge conflict — kept upstream (Circle/Solana deps) | ✅ |
| `pnpm-lock.yaml` | Resolved merge conflict — kept upstream | ✅ |
| `Neural Net/Cashly/FE_Wiring_Audit.xlsx` | NEW — 47-item master audit spreadsheet (3 sheets) | ✅ |
| `Claude Memory/INDEX.md` | Updated priorities to wiring audit sprint | ✅ |
| `Claude Memory/Session Starter.md` | Added full wiring sprint plan + priority order | ✅ |
| `Claude Memory/Pending Tasks.md` | Added P0 items (useTransferSubmit, AddTransactionDialog, proxy routes) | ✅ |
| `Claude Memory/Deploy History.md` | This entry | ✅ |
| `Keys/Cashly/Session_Logs/2026-04-03.md` | Updated with session 2 + session 3 work | ✅ |

**FE Audit Results**: 47 total items: 15 WIRED, 8 DEAD, 7 MOCK, 3 PARTIAL, 6 UNKNOWN, 1 BLOCKED, 1 BROKEN
**Status**: Documentation + planning only — no code changes this session

---

## 2026-04-02 — Chris FE Rebase onto DB-Wired Backend

### Session 4: FE/DB Rebase — Chris's Design + Our Backend
**Date**: 2026-04-02
**Commit**: `32c9483` → `cashly/frontend`
**Files Changed**:

| File | Change | Status |
|------|--------|--------|
| `src/features/dashboard/my-card-v2/index.tsx` | Complete rewrite — merged Chris's 3-column layout with our DB hooks | ✅ |
| `src/features/dashboard/my-card-1/components/CardLimits.tsx` | Theme tokenization — hardcoded colors → CSS variables | ✅ |
| `src/features/dashboard/cards/layouts/CardsGrid/hooks/useCardsState.ts` | KEPT OURS — Chris's was pure mock | No change |
| `src/features/dashboard/my-card-1/components/ReloadFlow.tsx` | Already matched from cherry-picks | No change |
| `src/features/dashboard/wallet-1/index.tsx` | KEPT OURS — better Privy guard shell | No change |

**my-card-v2 Rewrite Details**:
- Chris's 3-column grid: Left (FeaturedCard + QuickActions), Center (UpcomingPayments + RecentTransactions + CardControls), Right (SpendingChart + AvailableCards)
- Chris's components kept: `SpendingChart` (recharts, mock data — wire later), `UpcomingPayments` (mock — wire later), `resolveNuroCardFaceSrcFromGradient` for card thumbnails
- Chris's theme variables: `var(--color-success)`, `var(--color-error)`, `var(--color-bg-input)`, etc.
- Our DB wiring kept: `useCardsState()` (real `/api/cards` fetch), `useRecentTransactions()` hook, `ReloadModal` integration, `SkinPicker` with API PATCH, `CardControlsPanel` with Tabs (Limits/Details/Settings), card name persistence via PATCH `/api/cards/:id`

**CardLimits Theme Tokenization**:
- `bg-white/[0.03]` → `bg-[var(--color-bg-input)]`
- `border-white/10` → `border-[var(--color-border-input)]`
- `bg-amber-400` → `bg-[var(--color-warning)]`
- `text-[#16e0a9]` → `text-[var(--color-success)]`
- Kept: `useCardControls(cardId)` hook, `saveControls()` API calls, all DB wiring

**Decision Log**:
- useCardsState: Chris = mock data only → **KEEP OURS** (real DB fetch)
- ReloadFlow: Both versions identical → **NO CHANGE**
- wallet-1: Chris would crash without PrivyProvider → **KEEP OURS** (graceful fallback)

**Deployment**: base64 file transfer to VPS, build clean (37/37 pages), PM2 id:7 restarted
**Git State**: 15 commits ahead of `origin/main`, working tree clean

---

## 2026-04-01 — Documentation Rebuild + Chris Code Audit + DB Contract Expansion

### Session 1: All Claude_Memory Docs Updated
**Date**: 2026-04-01
**Files**: `Modal Library.md`, `API Endpoints.md`, `Database.md`, `DB & Modal Graph.md`, `INDEX.md`, `Pending Tasks.md`, `Deploy History.md`
**Changes**:
- Modal Library expanded from 10 to 13 entries (added NotificationsDropdown, CardLimits, CardControls). Added status summary, priority wiring order, type mapping docs, "Wired" dates.
- API Endpoints: added Card Transactions, Notifications (3 routes), Card Controls (3 routes) sections
- Database: added notifications, card_transactions, card_controls, card_alerts table schemas with row counts
- INDEX priorities refreshed from stale 2026-03-28 to current state
- Pending Tasks: added 2026-03-31 completed section, new pending items (NotificationsDropdown wiring, POST /card-transactions)
- Missing dates added to all completed items across docs
**Status**: ✅ Documentation only — no code changes

### Session 2: AFI Folder Restructure + START HERE Files
**Date**: 2026-04-01
**Files**: `AFI/Neural Net/START HERE — Directory.md`, `AFI/Neural Net/START HERE — Session Startup.md`, `AFI/Neural Net/Agent Expansion/README.md`, `AFI/Neural Net/_Deprecated/.viewignore`
**Changes**:
- Created `AFI/` root folder at `C:\Users\Richa\AFI` (outside of Keys)
- Created `Neural Net/` as the living intelligence layer
- Created `START HERE — Directory.md` — complete map of AFI structure with read order
- Created `START HERE — Session Startup.md` — 7-step boot sequence for new sessions
- Created `Agent Expansion/` skeleton with Avatar + Moltbook + README
- Established NEVER DELETE rule — deprecate to `_Deprecated/` with `.viewignore`

### Session 3: Chris Code Audit + DB Contract Expansion
**Date**: 2026-04-01
**Files**: `DB Contract Library.md`, `Modal Library.md`, `Database.md`, `Session Starter.md`
**Changes**:
- Audited Chris's `origin/build` branch: LoginForm, SocialLoginButtons, QuickTransferSheet, SimpleDateRangeDialog, TransactionDateRangeDialog, NotificationFooter
- DB Contract Library expanded: 12 → 16 modals, 57 → 67 data objects
- Designed 2 new tables: `transfers` (12 cols, 3 indexes, for QuickTransferSheet) and `social_auth` (7 cols, 2 indexes + UNIQUE, for SocialLoginButtons)
- Full SQL CREATE TABLE statements with CHECK constraints, FKs, indexes
- QuickTransferSheet contract expanded from 3 → 6 fields (mapped to Chris's Zod schema)
- Session Starter.md: updated all file paths from `Keys/Cashly/` → `AFI/Neural Net/`, added 3 new rules (#16-18 re: DB Contract Library, Zod schemas, new tables), updated file directory reference
- Modal Library expanded: 13 → 17 entries, added LoginForm (WIRED), SocialLoginButtons (UI ONLY), SimpleDateRangeDialog (UI ONLY), TransactionDateRangeDialog (UI ONLY)
- Database.md: added transfers + social_auth schemas (DESIGNED, not yet created on VPS), updated migration history
**Status**: ✅ Documentation only — no code changes, tables NOT yet created on VPS

---

## 2026-03-31 — Notifications Backend + Seed Data + Vault Restructure

### Notifications Table Created
**Date**: 2026-03-31
**Change**: `CREATE TABLE notifications` — 9 columns, 4 indexes (user_id, created_at DESC, partial unread), FK cascade to users
**Status**: ✅ Live on VPS PostgreSQL

### Notification API Routes Added
**Date**: 2026-03-31
**File**: `/home/cash/Cashly/src/nuro-routes.ts` (inserted at line 640)
**Routes**: `GET /notifications`, `PATCH /notifications/:id/read`, `POST /notifications/read-all`
**Pattern**: `router.get/patch/post` + `requireAuth` + `db.query()` (correct scope inside `createNuroRouter`)
**Status**: ✅ Committed `ec51170` on `Build_Branch`

### Seed Data Populated
**Date**: 2026-03-31
**Changes**:
- `notifications`: 8 realistic rows (transaction deposits, card frozen, KYC approved, spending alerts, login detection)
- `card_transactions`: 12 new rows (Whole Foods, Netflix, Uber, Amazon, etc.) — table went from 1 to 13 rows
**Status**: ✅ Live on VPS PostgreSQL

### Obsidian Vault Major Restructure
**Date**: 2026-03-31
**Changes**:
- Created `Schema & Tables/` folder with 9 files (INDEX + 8 table docs)
- Created `Claude_Memory/Modal Library.md` (170 lines)
- Created `Claude_Memory/DB & Modal Graph.md`
- Migrated Claude_Memory/ to root level
- Deleted recursive nested `Cashly/` directories (100+ levels deep)
- Added wikilinks to all 30+ .md files (4-7+ links each)
**Status**: ✅ Vault clean and connected

---

## 2026-03-28 — Session 3: Build Crisis + Auth + Routing Fix

### Next.js 16 → 15 Downgrade
**Date**: 2026-03-28
**Files**: `package.json`, `package-lock.json`
**Change**: `next` downgraded from `16.0.10` → `15.5.14` (`npm install next@15`)
**Reason**: Turbopack in Next.js 16 parses `thread-stream` test files/LICENSE/README as JavaScript — 130 build errors. Dependency chain: `@privy-io/react-auth → @walletconnect/* → pino → thread-stream`. No workaround found (tried `--no-turbopack`, `serverExternalPackages`, `NEXT_PRIVATE_LOCAL_WEBPACK=true`, pino stub + resolveAlias). Next.js 15 uses webpack, bypasses Turbopack entirely.
**Status**: ✅ Committed `8f175cb` → `cashly/frontend`

### Force-Dynamic Layout Export
**Date**: 2026-03-28
**File**: `src/app/[locale]/layout.tsx`
**Change**: Added `export const dynamic = "force-dynamic"` (Server Component)
**Reason**: After NJ15 downgrade, build crashed at static page generation. `"use client"` pages with auth hooks (`useSession()`) crash during prerender (no provider context). `force-dynamic` cascades to all child routes, prevents static prerender.
**CRITICAL**: Do NOT remove this line or `useSession()` will crash during build. Also note: `export const dynamic` only works in Server Components — `"use client"` files silently ignore it.
**Status**: ✅ Committed `8f175cb` → `cashly/frontend`

### next.config.js Cleanup
**Date**: 2026-03-28
**File**: `next.config.js`
**Change**: Removed `resolveAlias` (pino stub), kept `serverExternalPackages: ["pino", "thread-stream"]`
**Reason**: resolveAlias was a Turbopack-specific workaround, not needed on NJ15. serverExternalPackages kept as safety.
**Status**: ✅ Committed `8f175cb` → `cashly/frontend`

### Pino Stub Deleted
**Date**: 2026-03-28
**File**: `src/stubs/pino.js` (DELETED)
**Reason**: No-op pino stub was created for Turbopack resolveAlias — not needed on Next.js 15.
**Status**: ✅ Committed `8f175cb` → `cashly/frontend`

### SessionProvider Added to Providers.tsx
**Date**: 2026-03-28
**File**: `src/providers/Providers.tsx`
**Change**: Added `import { SessionProvider } from "next-auth/react"` and wrapped `<ReduxProvider>` with `<SessionProvider>`
**Reason**: NextAuth v5 (`next-auth@5.0.0-beta.30`) requires `SessionProvider` for `useSession()` to work. Chris's original `Providers.tsx` never included one. Without it, `useSession()` returns `undefined` → every page crashes at "Cannot destructure property 'status' of undefined".
**Status**: ⚠️ NOT COMMITTED — needs commit + push to `cashly/frontend`

### ProtectedRoute Rewritten for NextAuth v5
**Date**: 2026-03-28
**File**: `src/features/auth/ProtectedRoute.tsx`
**Change**: Full rewrite — uses `useSession()` from `next-auth/react` with `mounted` state guard (`useState(false)` + `useEffect(() => setMounted(true))`) to skip auth check during SSR. Shows loading spinner while `!mounted || status === "loading"`, redirects to `/login` when `mounted && status === "unauthenticated"`.
**Reason**: Previous version used `usePrivy()` which is the wrong auth system (Privy env vars not set). Even with correct auth, `useSession()` runs during SSR where no browser context exists — the mounted guard prevents this.
**Status**: ⚠️ NOT COMMITTED — needs commit + push to `cashly/frontend`

### Sidebar Routing Fixes (navigation.config.tsx)
**Date**: 2026-03-28
**File**: `src/layouts/Sidebar/config/navigation.config.tsx`
**Changes**:
- `NAVIGATION_ROUTES.MY_CARD_1` changed from `/dashboard/my-card-1` → `/dashboard/my-card-v2`
- Added "Activate My Card" nav item pointing to `/dashboard/my-card` (KYC activation flow)
- Added `"activate-card"` to cards section `itemIds` array
**Reason**: Chris's config linked "My Card" to `/dashboard/my-card-1` but no route page existed there. Actual routes: `my-card` = KYC activation, `my-card-v2` = card dashboard (balance, reload, withdraw, controls, transactions).
**Status**: ⚠️ NOT COMMITTED — sed insertion may have introduced syntax errors. Verify before building.

### First Commit Summary
**Commit**: `8f175cb` → `cashly/frontend` branch on `RichardTheBruce/Cashly`
**Contents**: Next.js downgrade (16→15), `force-dynamic` layout, `next.config.js` cleanup, pino stub deletion

### Second Commit Needed
**Files**: `Providers.tsx` (SessionProvider), `ProtectedRoute.tsx` (mounted guard), `navigation.config.tsx` (sidebar routing)
**Action**: Verify nav config syntax → `npm run build` → commit → `git push cashly frontend`

---

## 2026-03-28 — Session 2: Chris Visual Upgrade Pull

### Major Visual Upgrade from Chris (commit 427f0a7)
**Date**: 2026-03-28
**Change**: Selectively pulled Chris's full UI redesign — overview, settings, sidebar, header, auth, transactions
**Key additions**: CreditCard PNG card faces, GradientCrossfadeLayers, TransactionsGrid with `useTransactionsState` hook
**Note**: Chris's `transactionSlice.ts` `fetchTransactions` is fake (`// Simulate API call` with `demoTransactions`). However, his `useTransactionsState` hook IS properly wired to `/api/transactions` — falls back to mock only when auth token missing.
**Status**: ✅ Committed `427f0a7` → `cashly/frontend`

### Frontend Transaction API Proxy
**Date**: 2026-03-28
**File**: `src/app/api/transactions/route.ts`
**Change**: Added Next.js API route proxying to backend `/card-transactions`
**Status**: ✅ Committed `427f0a7`

---

## 2026-03-28 — Session 1: Card Graphic Fixes

### UUID Display Fix on Card Graphic
**Date**: 2026-03-28
**Change**: `id: c.id` (DB UUID) → `id: cardType label ("VISA")` on card visual
**Status**: ✅ Committed

### "VIRA" Typo Fix
**Date**: 2026-03-28
**Change**: Global find/replace VIRA → VISA in backend default, DB (8 rows), demo config
**Status**: ✅ Committed

---

## 2026-03-27

### Card Controls — Full Backend + Frontend Wiring
**DB tables created**: `card_controls`, `card_alerts`
**API routes added** to `/home/cash/Cashly/src/nuro-routes.ts`:
- `GET /cards/:id/controls` — auto-upserts defaults, resets daily/monthly on period boundary, returns live data
- `PATCH /cards/:id/controls` — dynamic field update, validates, returns updated row
- `GET /cards/:id/controls/alerts` — alert history
**Frontend rewrite**: `src/features/dashboard/my-card-1/components/CardLimits.tsx`
- Now accepts `cardId` prop, fetches from API on mount via `useSession` token
- Save buttons call `PATCH /cards/:id/controls` — real persistence, green flash on success
- Progress bars show real `daily_used/daily_limit` and `monthly_used/monthly_limit`
**Parent patch**: `my-card-1/index.tsx` — fetches card list on mount, passes `cardId` to `<CardLimits>`
**Build**: Clean ✅ — deployed PM2 id:7, Ready in 185ms

---

## 2026-03-26 (continued)

### CardSection Optional Props Fix
**File**: `src/features/dashboard/overview/components/CardSection/index.tsx`
**Change**: Added `CardSectionProps` interface with 6 optional props (`isFrozen`, `onToggleFreeze`, `cardName`, `cardColor`, `onReloadClick`, `onWithdrawClick`), changed signature from `function CardSection()` to `function CardSection(_props: CardSectionProps = {})`
**Reason**: Chris' `my-card-1` feature (cherry-picked from origin/main) passes these props to the overview CardSection — TypeScript rejected it as "not assignable to IntrinsicAttributes"

### Monitor Polling Paused (60s → 86400s)
**File**: `/home/cash/Cashly/src/monitor.ts`
**Change**: `POLL_INTERVAL_MS = 60000` → `86400000` (24 hours = effectively off)
**Reason**: End-of-session pause to stop Alchemy RPC costs until next session
**To re-enable**: `sed -i 's/86400000/60000/' /home/cash/Cashly/src/monitor.ts && pm2 restart 0`

### Nav Config — my-card-1 Wired
**File**: `src/layouts/Sidebar/config/navigation.config.tsx`
**Change**: Added `MY_CARD_1: "/dashboard/my-card-1"` route; updated `my-card-v2` nav item to route to `MY_CARD_1` and relabeled it "My Card"
**File**: `src/layouts/Header/index.tsx`
**Change**: Added `case "/dashboard/my-card-1":` alongside existing my-card cases
**Result**: Sidebar "My Card" entry now opens Chris's my-card-1 design

### $1 USDC Recovery — Deferred
**User**: `richard@nuro.finance` (internal: `92c7b62d`, Issuer: `49418fc8`)
**Deposit address**: `0xaBcc89d0aD4Cf75eB4e8d3729B25c8B26eB1f0F4` (EVM/Ethereum)
**Issue**: Issuer knows the user but `applicationStatus: notStarted` — no card/contract provisioned → `/contracts` 404 → no Base destination address → bridge cannot proceed
**Issuer walletAddress on file**: `0x07702469f97C74A6307BbCD2b209233e8A63Bc52`
**Decision**: Wait for richard@nuro.finance to complete KYC with Issuer and get a card created. USDC is safe in deposit wallet. Bridge will work once `/contracts` returns a valid address.

### Frontend PM2 Startup Fix
**Old command**: `pm2 start ... id:5` (deleted)
**New command**: `pm2 start "npm run start -- -p 2800" --name cashly-frontend` (now id:7)
**Reason**: Previous PM2 entry lost `.next` build reference after delete/recreate cycle; new entry correctly starts on port 2800
**Status**: ✅ Ready in 186ms — live at http://74.50.109.203:2800

---

## 2026-03-26

### Monitor Polling Reduced (15s → 60s)
**File**: `/home/cash/Cashly/src/monitor.ts`
**Change**: `const POLL_INTERVAL_MS = 15000` → `60000`
**Reason**: Alchemy RPC cost — 600k+ requests at 15s interval cost ~$100
**Command**: `sed -i 's/const POLL_INTERVAL_MS = 15000/const POLL_INTERVAL_MS = 60000/' /home/cash/Cashly/src/monitor.ts`

### Monitor Balance Update After Bridge
**File**: `/home/cash/Cashly/src/monitor.ts`
**Added**: `updateCardBalance(pool, userId, amount)` function at line 49
**Called**: After successful `bridgeAndForward` at line 105
**Logic**: Looks up internal user ID from Issuer user ID → `UPDATE cards SET balance = balance + amount`

### POST /cards Bug Fix
**File**: `/home/cash/Cashly/src/nuro-routes.ts`
**Line 210**: `const { cardType = 'VIRA' } = req.body` → `req.body || {}`
**Reason**: Crashed when request body was undefined (empty POST)

### Card Created for Richard Wayne
**SQL**: New card `b2e45dbc-898e-4881-9ff1-27e3640bb759` for user `db01a59c-...`
**Card number**: `2214 8394 9218 9587`
**Issuer card ID**: null (Issuer returned 404 on card creation)

---

## 2026-03-25

### KYC Banner URL Fix
**File**: `src/features/dashboard/overview/components/KycBanner.tsx`
**Change**: Relative `/api/kyc/status` → `${process.env.NEXT_PUBLIC_API_URL}/kyc/status`
**Reason**: Was hitting Next.js API routes instead of middleware

### Duplicate KYC Status Route Removed
**File**: `/home/cash/Cashly/src/nuro-routes.ts`
**Action**: Removed duplicate `GET /kyc/status` at line 438 (kept original at line 90 which includes `kycUrl`)

### CORS Fix — PATCH/PUT/DELETE Methods
**File**: `/home/cash/Cashly/src/index.ts`
**Change**: `Access-Control-Allow-Methods: GET, POST, OPTIONS` → added `PATCH, PUT, DELETE`
**Reason**: Freeze/unfreeze was failing with CORS error

### Freeze/Unfreeze Toggle — My Card V2
**File**: `src/features/dashboard/my-card-v2/index.tsx`
**Added**: Switch toggle, optimistic update, Active/Frozen label, calls `PATCH /cards/:id`

### Freeze/Unfreeze Toggle — Overview
**File**: `src/features/dashboard/overview/components/CardSection/index.tsx`
**Added**: Switch toggle, FROZEN overlay badge on card visual, handleFreezeToggle

### USDT + DAI Token Selector
**Files**: `ReloadModal.tsx`, `DepositModal.tsx`
**Added**: Token pills (USDC | USDT | DAI) with dynamic token icons

### Issuer Card Integration — createCard + freezeCard
**File**: `/home/cash/Cashly/src/issuers.ts`
**Added**: `createCard(issuerUserId)` → `POST /users/{id}/cards`
**Added**: `freezeCard(cardId, freeze)` → `PATCH /cards/{id}` with `{status: "frozen"|"active"}`

### POST /cards Issuer Integration
**File**: `/home/cash/Cashly/src/nuro-routes.ts`
**Updated**: `POST /cards` now calls `createCard(issuerUserId)` fire-and-forget, stores `owenCardId`

### DB Migrations
```sql
ALTER TABLE cards ADD COLUMN IF NOT EXISTS issuer_card_id VARCHAR(100);
```

---

## 2026-03-24

### Post-KYC Success Overlay
**Files created**:
- `src/features/dashboard/kyc-success/KycSuccessOverlay.tsx`
- `src/features/dashboard/kyc-success/useKycPolling.ts`
**File patched**: `src/app/[locale]/dashboard/layout.tsx`

### KYC Webhook
**File**: `/home/cash/Cashly/src/nuro-routes.ts`
**Added**: `POST /kyc/webhook` — matches user by `sd3_user_id` or `issuer_user_id`, updates `kyc_status`

---

## 2026-03-22 / 2026-03-23

### Settings API — Profile, Password, Notifications
**Files**: Settings components (ProfileContent, SecurityContent, NotificationsContent)
**API Routes added**: `GET /users/me`, `PATCH /users/profile`, `POST /users/change-password`, `PATCH /users/notifications`
**DB Migration**:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_prefs JSONB
  DEFAULT '{"transactions":true,"security":true,"promotions":false,"weeklyReport":true}'::jsonb;
```

---
*Related: [[Neural Net/Claude Memory/Architecture]] · [[Neural Net/Claude Memory/Pending Tasks]] · [[Neural Net/Claude Memory/V2 Feature Set & Marathons]] · [[Neural Net/Error Log]] · [[Neural Net/Claude Memory/Session Starter]]*