# 💰 Funding-Gated Shopping List

> Created: 2026-04-21 (Session 27) — consolidates every feature/upgrade blocked strictly on money (not code, not partnership, not time).
> Purpose: when funding lands, this is the flip-these-switches list. No feature work required — wire env vars / flip tier / reload credits and ship.
> See also: [[V2 Feature Set & Marathons]] for full roadmap, [[Pending Tasks]] for session-level priorities

---

## Tier 0 — Tiny unlocks (<$100 each, biggest ROI per dollar)

These are cheap and high-leverage. Do them FIRST when any cash lands.

| Item | Min cost | Unlocks |
|---|---|---|
| **X / Twitter API credits (Pay Per Use)** | ~$10 load | twitter-watcher cron posting + postTweet() + engagement-fetcher reads. At ~48 posts/day = ~$3.60/mo burn. Ready code as of Session 27 — env vars wired, auth working, X returns 402 until credits loaded. |
| **Base deployer wallet gas** | 0.01 ETH (~$30) | Un-pause monitor (POLL_INTERVAL_MS=60000) + execute Phase 5 ERC-20 swap E2E test + unblock Sprint 1.2 Base/Ethereum confirm runs |
| **Arb deployer gas** (Session 22 carryover) | 0.005 ETH (~$15) | Manual sweep of $0.04 stranded USDC + future Arbitrum CCTP tests |
| **Test LINK / WETH on Base for Phase 5** | ~$5 | Live ERC-20 approval → swap test via /quote/swap/firm. Currently untested since Session 25. |
| **Sprint 2.3 bot live CLOB trades** | ~$30-50 per agent | Alpha-bot strategy + cycle + admin panel all shipped Session 27. Needs USDC on Polygon + MATIC for gas + one-time USDC approval to Polymarket CTFExchange → flip `AGENT_CLOB_TRADES_ENABLED=true` for real trades. Logs queue today; funded = live. |
| **CoinGecko Pro (if we hit rate limits more)** | $129/mo | Today free tier works + stale-cache fallback shipped. Upgrade only if 429s become user-facing. |

**Tier 0 total to unlock everything: ~$200.** Smallest funding tranche buys this outright.

---

## Tier 1 — Core platform rails ($500-$5k)

The money-movement infrastructure. Blocked on *vendor retainers* rather than absolute cost.

### Plaid production ($500/mo retainer + per-request)
- Status as of Session 27: sandbox onboarding pending; code integration (Buy 2 path) not started
- Unlocks: bank-link UI (verify + get account/routing), account ownership check, Identity product (KYC fallback path, non-US expansion)
- Pay when: before going live with Buy 2 (bank → wallet)

### Dwolla production (~$0.50/ACH + tier-based platform fee)
- Status as of Session 27: sandbox onboarding pending
- Unlocks: ACH pull (bank → our Dwolla balance → USDC credit) + ACH push (vault → bank for Sell 3). Crucially: their MSB license umbrella covers our regulatory obligation
- Pay when: before going live with Buy 2 or Sell 3

### Circle Business Account (application-only, no set fee)
- Status as of Session 27: not started
- Unlocks: USDC↔USD redemption for Sell 3 (wallet direct to bank, bypassing SD3 card). Circle charges per-transaction fees in production
- Pay when: Sell 3 implementation begins (probably Sprint 9+ per In-House Ramp doc)

---

## Tier 2 — SaaS / creator costs ($100-$300/mo each)

### X / Twitter Basic or Pro tier
- **Basic $200/mo**: 50k tweets/mo + 10M reads — graduate from Pay Per Use when monthly burn > $200
- **Pro $5000/mo**: only if we're hitting >1M tweets/mo (doubtful for AFI scale)

### Privy production tier (pricing unknown)
- Current: 150-user dev-mode app (`cmo5zrjo4004y0cjp8y3h6bgm`)
- Unlocks: >150-user caps removed + enterprise SLAs + custom domain embedded auth
- Pay when: public launch

### HeyGen (video generation, per-render cost)
- Status: gated behind HEYGEN_ENABLED=false (Session 23 incident — avatar not configured)
- Unlocks: video content path in growth agent (Sprint 5.4)
- Pay when: video strategy becomes validated (prob Session 30+)

### Alternative: Muapi.ai via Open-Generative-AI frontend (Session 27 scouting)
- Status: **Evaluated but NOT cloned** — https://github.com/Anil-matcha/Open-Generative-AI (MIT-licensed Next.js UI on top of Muapi.ai's paid inference API, 200+ model aggregator including 9 lip-sync models)
- Why interesting: same API shape for 200 models (Kling, Veo3, Sora, Runway, Seedance, Infinite Talk, Sync Lipsync, LatentSync, Creatify, etc.) — their `packages/studio/src/models.js` registry pattern is crib-worthy if we ever need 1 wrapper for N models
- Why deferred: (a) inference is paid (Muapi credits per-gen, same cost-gate as HeyGen), (b) repo is a human-facing UI, our growth agent is a cron — 80% of the repo is wasted for us, (c) no engagement data yet to prove video > text posts
- Re-evaluate when: HeyGen proves insufficient OR we want >1 video model backend OR we ever build a human-in-the-loop content studio. Likely Session 40+.

### Claude API / Anthropic (per-token)
- Current: free interactive use via Claude Code, no production API calls from backend
- Unlocks: LLM-generated post copy (vs templated) in thought-engine + market-watcher, market commentary on top markets, automated content variety testing
- Pay when: learning-loop v1 shows templated-vs-LLM engagement gap worth spending on

---

## Tier 3 — Strategic / bigger ($5k-$50k)

### MSB license (own it, not rent via Dwolla)
- Cost: ~$50K filing + state-by-state MTL registrations (~$500K total for 50-state coverage)
- Unlocks: own the money-movement layer end-to-end — drop Dwolla partnership, save per-transaction fees at scale
- Pay when: ARR $5M+ and Dwolla fees exceed the MSB overhead

### Second BIN sponsor (diversification target from Investor Risk doc)
- Cost: depends on BIN partner, typically ~$10-50K setup + monthly retainers
- Unlocks: redundancy if SD3 relationship changes + international card issuance
- Pay when: SD3 becomes >50% of card volume OR pre-IPO

### Own Chainlink / UMA Optimistic Oracle integration
- Cost: per-request oracle fees + development time
- Unlocks: automated market resolution at scale (today we use CoinGecko for crypto + sports APIs for sports — manual for everything else)
- Pay when: market creation volume >1K/day

---

## What this list is NOT

- **Code-blocked items** — those are in [[Pending Tasks]] (e.g. Owen SD3 call, webhook secret flip, user-ID semantic rewrite)
- **Partnership-blocked items** — Moltbook API key from Moltbook themselves, SD3 webhook signing secret from Owen
- **Time-only items** — Solana FE Privy integration, scheduled-transfers admin countdown polish
- **Test-only items** — E2E chain matrix tests require gas funding (already in Tier 0)

---

## How to use this list when funding lands

1. Fund the deployer wallets from Tier 0 first — unlocks immediate live testing + un-pause
2. Load Twitter credits + flip engagement-fetcher to collecting real data — Sprint 5 goes live
3. Go through Plaid + Dwolla production onboarding in parallel — Sprint 8 Buy 2 ships in 4-6 weeks
4. Defer Tier 2 SaaS decisions until user metrics inform them (don't pre-buy)
5. Tier 3 is post-seed strategic — document rationale, don't spend pre-fit

---

## Session 27 seed — what's ready NOW behind these gates

| Ready code | Cost to flip |
|---|---|
| `twitter-watcher` + `engagement-fetcher` | Twitter credits $10 |
| Phase 5 ERC-20 Swap live test | Base gas + LINK ~$35 |
| Un-pause monitor + Sprint 1.2 chain matrix | Tier 0 full tranche ~$200 |
| Buy tab dual-CTA (already shipped disabled) | Plaid + Dwolla prod when sandbox validates |
| Learning Loop v1 auto-weighting | Real engagement data → Twitter credits $10 (unblocks data inflow) |

**Headline: $200 of runway activates half the Tier 0 + Tier 1 roadmap immediately.** That's the highest-ROI pitch for a seed tranche.
