# 5-6-2026 — Marathon 11 Day-2

**Status at session close:** 8 days to capital event (May 14). Ahead of schedule on infrastructure, behind on pitch deck (not yet started). Test count 96 → 119 across the day. 7 commits pushed: `f41b000`, `7b3f80f`, `2d7ac43`, `4420981`, `5abea63`, `38946db`, `ea45be8`, `ba206b6`, `78cbace`, `2cf1501`.

Today went hard. Started on planned Day-2 work (Tier-1 Redis cache + external agent connector), got ambushed mid-day by a production SD3 sync incident that turned out to be a latent migration-016 bug surfaced by Day-1's Supabase migration. Burned ~35 min triaging it. Session also produced the most thoroughly debug-instrumented dashboard fix saga of the project (4 passes on `neural-dashboard.html`, ending in a working artifact + reusable diagnostic pattern).

---

## Shipped today (in order)

### 1. Tier-1 Redis cache layer (`f41b000`)
- `src/cache.ts` — abstraction with two backends (in-memory Map default, Upstash Redis REST opt-in via env)
- Read-through wrap on `getBudgetSnapshot` (4-query fan-out, biggest hot read)
- Write-side invalidation in `recordSpend` / `recordRefill` / `setBudgetAuthority` / rollover
- `/health/cache` admin diagnostic endpoint
- 11 new unit tests in `src/__tests__/cache.test.ts` (covers TTL expiry, prefix-scoped invalidation, LRU bounds)
- Architecture page Tier-1 banner flipped Redis + logrotate from "queued" to ✓

### 2. External agent connector (`7b3f80f` → `2d7ac43`)
- Migration `045_connected_agents.sql` — table + heimdall_events.connected_agent_id column + indexes
- `src/connectors.ts` — full CRUD module, API key generation (sha256-hashed), HMAC webhook signing (Stripe-shape `X-Nuro-Signature: sha256=<hex>`)
- 7 endpoints in `src/nuro-routes.ts` (list/get/create/update/rotate-key/revoke + bearer-auth event ingest + per-agent events)
- `src/app/[locale]/dashboard/connectors/page.tsx` — list page + create modal (4 runtime tabs Claude/OpenAI/LangChain/Custom, capability multi-select) + one-time credentials reveal modal with copy buttons + per-agent row with pause/rotate/revoke
- Sidebar nav: new "Connectors" entry under WALLET section, Bot icon
- 12 unit tests covering API key generation, hashing, webhook secret, HMAC signing
- Test count: 107 → 119 ✅

### 3. SD3 transaction sync incident (`4420981` → `5abea63` → `38946db` → `ea45be8`)
**The story:** card balance synced fine ($4.36 verified live) but Visa transactions (Krispy Kreme, Claude.ai, Supabase, Ctlp Canteen, Google) never landed in `card_transactions`. PM2 logs showed `[issuer] sync_transactions: Issuer tx sync failed | there is no unique or exclusion constraint matching the ON CONFLICT specification` on every sweep.

**Root cause:** Day-1 Supabase migration's `pg_dump → pg_restore` lost three indexes from migration 016. The unique partial index on `card_transactions.issuer_transaction_id` was the blocker — and recreating it as partial DIDN'T fix the bug because Postgres `ON CONFLICT (col) DO NOTHING` can't infer a partial unique index without a matching `WHERE` predicate. Migration 016 has been a latent ON-CONFLICT inference bug since it shipped — the old VPS Postgres just never executed the upsert path enough to surface it.

**Fix:**
- Added `POST /admin/api/issuer-tx-diagnose` endpoint that runs sync with per-item skip-reason diagnostics + truncated raw SD3 payloads
- Migration 046 v1 (recreated partial — didn't fix it)
- Migration 046 v2 (drop partial, recreate non-partial — fixed it)
- Defensive patch on `src/issuer-sync.ts`: ON CONFLICT now includes `WHERE issuer_transaction_id IS NOT NULL` so it works against either index shape

**Verified working:** Sweep summary went from `issuerTxSyncs:0` to `issuerTxSyncs:1` post-fix.

### 4. Public-link sanitization (`ba206b6`)
- Stripped all `github.com/RichardTheBruce/Cashly` references from public surfaces (`/skills`, `/contracts`, `/architecture*`, `cli/`, manifest.json, heimdall skill.md)
- Plan: when a public sub-repo for the skills tree exists, restore links pointing there. Backend stays private.
- Internal docs/ Claude Memory/ references intentionally untouched.

### 5. Neural-dashboard 4-pass debug saga (`4420981` → `78cbace` → `2cf1501`)
**Pass 1 (yesterday):** force-warm + NaN guards + window.error overlay
**Pass 2 (today, `4420981`):** z-index fix, html/body height, opacity bump 0.4→0.7, min radius 3→5, late diagnostic badge
**Pass 3 (`78cbace`):** unhandledrejection listener + early diagnostic badge with step instrumentation + try/catch wrapping `.then()` body
**Pass 4 (`2cf1501`):** the actual fix — `d.query.slice(0, 50)` was unguarded against decisions missing the `query` field. Defensive label fallback chain (query → title → id → synthesized "Decision N").

**Lesson encoded:** the debug instrumentation pattern (window.error + unhandledrejection + step badge + try/catch around `.then()`) is reusable. **Apply to `unified-dashboard.html` + `sub-agents-dashboard.html` before May 14** — same code shape, same blast radius if either has a similar undefined-field bug. This is now Day-4 task.

### 6. Decision Journal entry (`Neural Net/Decision Journal/2026-05-06_001.md`)
4 decisions from the SD3 incident:
- **DJ 1** — Diagnostic endpoint before guess-fix (lesson: tail logs FIRST, build observability second)
- **DJ 2** (load-bearing) — Non-partial unique index over partial + ON CONFLICT WHERE
- **DJ 3** — Direct Supabase SQL apply for incident, migration commit for permanence
- **DJ 4** — `pg_indexes` diff as Day-3 follow-up to catch this regression class

---

## Where we stand for May 14

**8 days remaining. Estimated work: ~17h over 6 days. Comfortable pace.**

### P0 — must land
- **Pitch deck v1** (Day 4-5) — narrative + slides + screenshots, ~6h
- **Demo flow E2E rehearsal** (Day 7-8) — full live walkthrough, ~4h

### P1 — should land
- **Plaid scaffold** (Day 3) — completes the omnichain settlement story with traditional finance source, ~3h
- **Apply 3rd-pass instrumentation to unified + sub-agents dashboards** (Day 4) — defense against same bug class biting during demo, ~1h

### P2 — nice to land
- **Skill wrappers polish** (Day 5-6) — huginn/markets/sandbox stubs need full Claude/OpenAI/LangChain/curl implementations like Heimdall already has, ~3h
- **VPS ops batch** (Day 3) — run logrotate setup, optionally hook up Upstash, ~30 min

### P3 — post-pitch acceptable
- **pg_indexes audit script** (from DJ 4) to prevent next migration disaster, ~30 min

---

## Open threads / risks for tomorrow

1. **VPS SSH key auth setup** — Owen rotated the password mid-session, cost ~10 min. 2-min fix to add a key + disable password auth so this can't recur.
2. **LZ-monitor noise** — `[lz-monitor] spoke ... read failed` for zkSync/Scroll/Celo/Gnosis/BSC every 5 min. Pre-existing, unrelated to demo, but visually noisy. Worth ~30 min triage before any live log demo.
3. **5 neural-dashboard.html copies on VPS** — `/home/cash/neural-dashboard/` orphan dir was deleted today. The two `docs/Decision Journal/neural-dashboard.html` copies inside repos are tracked-but-unused; will come back on `git pull`. Post-pitch cleanup.
4. **Migration 046 already applied to Supabase** — production schema is ahead of the repo migration order until next backend deploy runs migration 046. Idempotent (`IF NOT EXISTS`), so deploy is safe. Document in next deploy notes.
5. **External connector — webhook delivery not yet implemented** — we accept inbound events but don't yet POST policy decisions back to `webhook_url`. Sufficient for the demo (the inbound flow is the impressive half), but flag for post-pitch.

---

## Tomorrow's start

```bash
# Session start ritual
cd /c/Users/Richa/AFI/Cashly_Source_Code
git pull
git log --oneline -10
cat "Neural Net/Claude Memory/Pending Tasks.md" | head -30
```

**Suggested first task:** Plaid scaffold. Smallest remaining BE+FE deliverable, mechanical (Plaid Link + OAuth callback + 1 DB table), no architectural decisions. Fits in ~3h.

**Suggested second task (after Plaid):** sketch pitch deck narrative. The 6h beast that needs your judgment, not just code. Easier to do with fresh brain.

---

## Wins worth banking

- **Test suite is healthy:** 119/119 passing. Nothing red.
- **Production is healthy:** SD3 sync flowing, balance + transactions reconciling, neural dashboard live.
- **The diagnostic infrastructure pattern** (window.error + unhandledrejection + step badge + try/catch) is the kind of operational improvement that pays dividends every future debugging session. We didn't just fix today's bug — we built a debugging surface that will catch the next 3 bugs faster.
- **Migration 046 closed a latent bug** that had been silently hiding in migration 016 since it shipped. The old infra hid it. Supabase brought it up clean and we caught it in <1 hour.
- **Connector pillar (Pillar #2 from `/skills`) shipped end-to-end** — register agent → API key → POST event → see it in Heimdall stream → dashboard reflects it. The "attach any agent" promise on the public page is now a real working flow.

Cooked but moving. Walk the dog. See you tomorrow.
