# 5-10-2026 — Marathon 11 Day-6

**Status at session close:** T-4 days to capital event (May 14). Day 6 was the largest single-day load-out of Marathon 11: morning demo polish, an afternoon detour through the LayerZero bridge wire toolchain (which turned out to be a productive multi-hour saga that ended with a fully verified dry-run), an evening sweep of three Day-7 items (external-connector webhook delivery, sidebar smoke test, edge-case audit). Nine source commits, zero migrations to the live schema, **one Supabase-applied migration recovered** (045 had never been applied — caught during webhook smoke test), zero regressions caught post-deploy.

Today's Day-6 commits in chronological order:
`9ff5a04`, `abb0d5d`, `1cca9dc`, `b1c21a0`, `95a57f4`, `b2838b8`, `4719cfd`, `acf0523`, `617e9b7`.

---

## What shipped today

### 1. Stale-while-revalidate to Overview deck + wallet preference + CCTP-only reload (`9ff5a04`)
Three Day-6 carryover items in one commit:
- **Overview deck card** now uses the same `nuro:overviewCard:snapshot` localStorage pattern Day-5 introduced for `/my-card-1`. Paint instantly on every subsequent visit; background refresh from `/api/cards`. Identical pattern, different key.
- **External-wallet preference for the header pill + my-wallet identity strip**: the `usePrivyWalletAddress` Day-5 fix only landed on `usePrivyWalletAddress` itself; the header `ConnectWallet` pill was reading via a different path and still showed the Privy-embedded address. Routed it through the same selector. SidebarProfile name-only render confirmed (no address rendered at all to avoid the "different address than my-wallet" inconsistency that Richard flagged).
- **Reload chain picker gated to CCTP-only** until LZ bridge is wired. The dropdown was showing all 23 chains; in practice only the 6 CCTP V1 native-USDC chains (Ethereum/Base/Arbitrum/Optimism/Polygon/Avalanche) actually settle today. Other chains were silent dead-ends. Filter applied at component level; once `LZ_BRIDGE_ENABLED=true` flips, removing the filter is a one-line change.

### 2. Skill library polish — full SDK wrappers for 3 skills (`abb0d5d`)
The Day-3 skill library landing page (`/skills`) had skeleton content for all four skills (`heimdall/threat-intel`, `huginn/counsel`, `markets/resolved`, `sandbox/spawn`). Filled in the remaining three with the same depth `heimdall/threat-intel` had:
- curl example with real headers + body
- Claude-skill `.md` for direct drop-in
- OpenAI tool-spec JSON
- LangChain Python wrapper snippet
- payment flow explainer (x402 mechanics)
- per-skill pricing matrix

Each skill page now self-documents enough for an investor to imagine plugging their own agent into ours. Pattern: one `.md` per skill in `/public/skills/`, picked up by the existing skill-detail route.

### 3. **LZ Bridge Wire Toolchain SOLVED + dry-run runs end-to-end** (multi-hour saga; commits `1cca9dc`, `b1c21a0`, `95a57f4`, `b2838b8`, `4719cfd`)

This was the largest single-thread effort of the day. The goal: get the LayerZero V2 multi-DVN configuration deployed on-chain so the omnichain bridge between Arbitrum (hub) and 5 spoke chains (BSC, zkSync, Scroll, Celo, Gnosis) actually has security guarantees ("we ship cross-chain transfers protected by 2-of-3 DVN consensus, not 1-of-1 trust-me-bro").

**Pre-existing state**: `lz-wire/layerzero.config.hardened.ts` had been written but never executed. Repeated dry-run attempts in earlier sessions hit ESM / module-resolution / Node-version / hardhat-config errors. The bridge was effectively unwireable until tonight.

**Ten distinct toolchain fixes layered tonight**, each captured in commit history:

1. **Node 18 LTS via fnm** — Node 20+ ESM strictness was breaking hardhat's CommonJS-internal `require()` chain. Pinned Node 18.20.x in a sequestered shell.
2. **Isolated lz-wire env** at `C:\Users\Richa\AFI\lz-wire\` — fresh `npm install` with toolbox-only deps; no inheritance from the Cashly Next.js project's `node_modules`. Eliminated module-version conflicts in one stroke.
3. **EIP-55 checksum lowercase** — LZ metadata API returns addresses in mixed-case checksum; hardhat-config schema was rejecting them. Lowercased all addresses (deployer wallet, OFT adapters, library addresses) for the wire scripts; checksum re-applied at on-chain submission time by ethers.
4. **BSC mainnet ABI** — was missing entirely from the wire's `artifacts/` directory. Copied from `arbitrum/` (BSC is EVM-compatible; ABI is identical). Without this, the wire's Send/Receive library lookup throws on BSC.
5. **Canonical library addresses pulled from LZ metadata API** — manual config had stale/wrong sendUln302, receiveUln302, executor addresses on Scroll/Celo/BSC. Pulled live from `https://metadata.layerzero-api.com/v1/metadata` and replaced. **Three production-config bugs caught this way**; dry-run safety net worked exactly as designed.
6. **enforcedOptions moved to per-connection shape** — was incorrectly defined at the chain level. LayerZero V2 contract API requires options per outbound peer. Restructured `layerzero.config.hardened.ts` so each `{from, to}` pair carries its own enforcedOptions (80k gas for EVM destinations, 100k for zkSync — accounting for zkSync's higher per-call overhead).
7. **DVN verification script** (`scripts/verify-lz-dvns.ts`, commits `1cca9dc` + `b1c21a0`) — read-only on-chain sanity check that walks all 10 connections, queries each chain's current DVN config, and compares it to the intended hardened config. First version flagged false positives on unwired-but-deployed DVNs; second version (`b1c21a0`) scoped to actually-wired DVNs only + corrected the bytecode baseline.
8. **Bridge activation runbook** (`docs/runbooks/lz-bridge-activation.md`, commit `95a57f4`) — 8-step canonical procedure: verify DVNs → fund deployer → dry-run → real wire → fund hub adapter → smoke-test → flip env flag → re-enable FE chains. Includes rollback notes per step.
9. **Dry-run v1 end-to-end clean** (commit `b2838b8`) — first complete dry-run, no errors, 30 ops queued. This was the moment the toolchain went from broken to working.
10. **Dry-run v2 with enforcedOptions** (commit `4719cfd`) — added enforcedOptions to all 10 connections, re-ran dry-run, 36 ops queued (12 ULN setConfig + 10 send-lib + 8 receive-lib + 6 enforced-options). Output captured in `docs/runbooks/lz-dry-run-output-v2-2026-05-10.txt`.

**State at end of day**: dry-run runs clean end-to-end. **Real wire is one funding event away.** Deployer wallet `0x27FbEAD2B527AaDAf4EA7B3Af065244A3964ECBC` needs ~$30 in native gas split across Arbitrum (~$15), zkSync (~$9), BSC (~$6). Scroll/Celo/Gnosis already funded from earlier deployments. Chris is sending. Post-funding execution: ~30 minutes to fully wired bridge.

**Polling disabled to save Alchemy CU during the funding wait**: `LZ_MONITOR=off` + `AGENT_GAS_SYNC_OFF=true` on VPS. Main deposit monitor remains at its 24h pause. Re-flip is a `pm2 restart cashly-middleware --update-env` away.

### 4. Marathon 11 doc + Pending Tasks updates (`acf0523`)
Filed the LZ wire as a funding-gated parallel track inside Marathon 11 (between Day 5 and Day 6, since it spans). Updated Pending Tasks with Day-6 progress recap + the explicit funding ask. So a future-me opening the docs cold can see what's blocked and what unblocks it.

### 5. **External-connector webhook delivery + audit endpoint** (`617e9b7`)
The Day-2 external-agent connector backend (migration 045 + `src/connectors.ts`) shipped without the outbound side: when an event lands via `POST /api/connectors/event`, our backend records the policy decision + threat assessment but never POSTs that decision back to the connected agent's `webhook_url`. So agents could send events to us but couldn't receive verdicts. The connector was a half-circle.

Closed the loop tonight:
- **`deliverWebhook(db, agent, payload)` in `src/connectors.ts`** — HMAC-SHA256 signed body (`X-Nuro-Signature: sha256=<hex>`, Stripe-pattern), 3 attempts with 0s/1s/4s backoff, 10s `AbortController` per attempt, smart retry (5xx + 408 + 429 retry; other 4xx fail-fast).
- **Audit every attempt** to `execution_log` with `entity_type='connector_webhook'` and a JSON detail blob (eventType, eventId, subject, decision, ruleId, httpStatus, attempts, detail). `auditWebhookDelivery` is wrapped in try/catch with an empty catch — audit must never throw and bring down the caller.
- **`GET /api/connectors/agent/:id/webhook-deliveries`** new endpoint reads from `execution_log` and returns delivery history sorted DESC by `created_at`. Foundation for the per-agent event detail page.
- **Wired into `ingestExternalEvent` as fire-and-forget**: `if (input.agent.webhookUrl) { void deliverWebhook(...).catch(...) }`. Event ingestion succeeds regardless of webhook delivery status. Agent on the other end never blocks our policy decision; we just inform them.

**Migration 045 recovered**: smoke test failed with `relation "connected_agents" does not exist`. Migration 045 had been written Day-2 (`abc7d6b`) but never applied to Supabase production schema — only to local dev. Applied tonight via `psql "$DATABASE_URL" -f src/migrations/045_connected_agents.sql`. All CREATE TABLE / INDEX / TRIGGER statements succeeded. **Latent data-loss bug**: the Day-2 backend would have started rejecting `/api/connectors/event` POSTs the moment any external agent registered against production. None had yet, so no rows were lost. **Lesson encoded**: every migration-touching deploy should include a `psql -d $DATABASE_URL -c "SELECT 1 FROM pg_tables WHERE tablename = '<new_table>'"` smoke verification step. Filed for the next deploy-history entry.

**Webhook smoke-test verified end-to-end**: created a test agent with `webhook_url=https://webhook.site/<id>`, sent a synthetic event via `POST /api/connectors/event`, watched webhook.site receive POST with `X-Nuro-Signature: sha256=9ae5a6b6...` header, body parsed correctly, HMAC verified, status=success, HTTP 200, attempts=1.

### 6. Sidebar smoke test — all routes green
Walked every sidebar nav item with HTTP probes + HTML body grep for error markers:
- **6 dashboard routes** (`/dashboard`, `/dashboard/cards`, `/dashboard/my-card-1`, `/dashboard/wallet-1`, `/dashboard/connectors`, `/dashboard/banks`) — all return HTTP 200 with healthy HTML.
- **4 HTML pages** (`/architecture`, `/neural-dashboard`, `/sub-agents-dashboard`, `/unified-dashboard`) — all return HTTP 401 (Nginx `auth_basic` gating). Confirmed via `/etc/nginx/sites-enabled/nuro`: intentional internal-access protection from S35 Day-3. **Demo risk surfaced**: clicking any of these on stage during the pitch prompts for password — embarrassing. Two fix options: (A) hide them from sidebar entirely before May 14, or (B) pre-authenticate the browser at rehearsal time so the basic-auth cookie is already set. Filed both for Day-7 deck-prep.

### 7. Edge case handling audit — demo-resilient base confirmed

The third Day-7 item. Findings:

**Crash safety net (Providers.tsx:40-94)** — ErrorBoundary is mounted at the React root. `installGlobalErrorHandlers` wires up:
- `window.onerror` — catches synchronous JS errors anywhere in the tree
- `unhandledrejection` — catches Promise rejections that escape `.catch()`
- `console.error` interceptor — captures every `console.error` call (React's render-error reporting uses this)

All three pipe to `POST /api/client-error` → backend writes to `execution_log` with `entity_type='client_error'`. So a render crash during the pitch demo would (a) be caught by the ErrorBoundary, (b) render a fallback UI, and (c) auto-report to our logs so we can debrief after.

**Double-click protection on every money-mutating button** — 11 disabled-state-gates audited and verified:
- `CardSettings.tsx:196` — `disabled={isSaving}` on threshold-save handler
- `CardLimits.tsx:103-104` — `disabled={isSaving}` on per-tx cap save
- `ReloadFlow.tsx:436-439` — Solana swap button disabled during `fetching-quote` / `awaiting-signature` / `broadcasting` / `confirming`
- `ReloadFlow.tsx:470` — Reload Card step-1 button `disabled={!isActive}`
- `WithdrawFlow.tsx:232` — Send button `disabled={!canProceed || isSubmitting}`
- `WalletDepositButton` — manages its own pending state (verified Day-5)
- Swap-error retry button at `ReloadFlow.tsx:414` exists — graceful failure recovery (user isn't stuck on a "swap failed" terminal screen)

**Webhook resilience** — already audited in section 5: timeout, retry with backoff, smart retry on 5xx/408/429, fail-fast on other 4xx, audit failures, fire-and-forget from caller so event ingestion is decoupled from webhook delivery.

**Net assessment**: demo-resilient. Anything Richard clicks on stage that throws or rejects gets caught silently; any money-mutating action has a disabled-during-pending gate; the webhook subsystem has timeout/retry/audit at every step.

---

## What we learned today

1. **A failing toolchain is debuggable; a "doesn't run" toolchain isn't.** The LZ wire was effectively unwireable for weeks because every attempt hit a different error before getting past `hardhat lz:oapp:wire`. The unblock was sequestering it into its own `lz-wire/` directory with its own Node version + `node_modules`. Once it *ran*, the actual config bugs surfaced naturally in dry-run. **Pattern**: when a tool refuses to start, change the environment, not the tool's config. Bad environment masks every other bug.

2. **Dry-run safety nets work.** Three production-config bugs (wrong send-lib / receive-lib / executor addresses on Scroll/Celo/BSC) were caught by the dry-run before any tx hit chain. None of these bugs would have been caught by code review — they were copy-paste errors from outdated docs. **Pattern**: any irreversible-at-cost operation needs a dry-run mode. The dry-run flag in hardhat-lz is the model: same call path, same parameters, but `--dry-run` short-circuits before submission and prints the would-have-been-submitted txs for human review.

3. **"Half-circle" features are worse than no feature.** The Day-2 connector backend recorded inbound events but never delivered the policy decision back to the connected agent. Half the value with all the surface area — easy to forget that the loop isn't closed, then surprised when a real connection fails to receive its verdict. **Pattern**: every async outbound feature needs a paired delivery audit endpoint (`/webhook-deliveries`, `/email-deliveries`, `/sms-deliveries`) so you can confirm the other half of the circle is functioning. We had `card_alerts` (the data) but not delivery confirmation; that gap masked the unverified migration for hours.

4. **Migration audit ⊥ to deploy audit.** Migration 045 was committed Day-2 and applied to dev. The Day-2 deploy ran the BE code that depended on table `connected_agents`. Both audits would have said "PASS." But the Supabase production schema had never had migration 045 applied — a third invariant that wasn't checked. **Pattern**: post-deploy smoke test should include "table exists" probes for every table the new BE references. One `SELECT 1 FROM pg_tables WHERE tablename = '<name>'` per new table; takes 5s, catches this category of latent bug 100% of the time.

5. **`auth_basic` is invisible until it isn't.** The 4 internal HTML dashboards have been Nginx-protected since Day-3. We've been clicking past the password prompt during development without thinking about it. On stage with an audience, a basic-auth prompt is a record-scratch. **Pattern**: every protected URL in the sidebar nav needs either (a) be hidden from the sidebar when the user lacks the role, or (b) routed behind a wrapper that displays "Coming soon" instead of triggering the prompt. Surface visibility ≠ access; treat them separately.

6. **Polling is expensive even when "nothing is happening."** The LZ monitor was generating ~1500 Alchemy CU per day on chains we hadn't wired yet — just polling pointlessly. Disabling it saves CU during the funding wait. **Pattern**: every polling job should have a kill-switch env flag, not just an interval-tuning flag. "Off" is a different state from "every 5min" and needs to be representable.

---

*Related: [[Decision Journal/2026-05-10_001]] · [[Marathon 11 — Capital Event Sprint]] · [[Pending Tasks]] · [[../Claude Memory/Deploy History]] · [[../runbooks/lz-bridge-activation]]*
