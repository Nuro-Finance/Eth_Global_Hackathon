# In-House Buy / Sell Ramp — Design Concept

> Drafted 2026-04-19 (Session 25 close) · Updated 2026-04-20 (Session 26) with "with / without SD3" branching clarity · Updated 2026-04-20 (Session 26) with **ship BOTH Buy 1 + Buy 2 side-by-side** decision
> Context: Session 25 shipped Moonpay widget link-outs as a stop-gap for the Buy / Sell tabs. Richard correctly flagged that offloading to Moonpay gives up fee margin, control, and user trust. This doc sketches how we replace Moonpay with rails we already own.
>
> **Richard's Session 26 directive: "BRILLIANT LETS MAKE SURE we give them both options"** — Buy 1 (card balance → wallet) and Buy 2 (bank direct → wallet) must ship **in parallel**, not sequentially. The Buy tab will surface both as sibling CTAs so the user picks the path that fits their funding source.

---

## With SD3 vs without SD3 — decoupling the dependency

Richard's Session 26 question: **"Is Phase 7 something we can do without the bank [= SD3]?"**

Short answer: **partially yes.** The full ramp can be split into two independent tracks, only one of which depends on SD3 cooperation.

| Path | Needs SD3 API? | Needs external bank partner? | Blocker |
|---|---|---|---|
| **Sell 1** — crypto → Nuro card (existing Reload) | No (uses Issuer webhook, already live) | No | None · ✅ Shipped |
| **Buy 1** — card balance → crypto wallet | **Yes** — card-debit API | No | Owen conversation |
| **Sell 2** — Nuro card → external bank | **Yes** — card-to-ACH push or Visa Direct | No | Owen conversation |
| **Buy 2 (alt)** — external bank → crypto wallet, **skip the card** | **No** | Yes — Plaid/Stripe FC + Dwolla/Unit/Mercury | Independent track |
| **Sell 3 (alt)** — crypto wallet → external bank, **skip the card** | **No** | Yes — Circle Business + Dwolla/Unit/Mercury | Independent track |

**Takeaway**: if Owen is slow or SD3's API surface turns out to be too limited, we are not fully blocked. **Buy 2 and Sell 3** are parallel rails that bypass our own card entirely — users link their external bank directly to their crypto wallet. Tradeoff: they need their own compliance review (Dwolla/Unit handles MSB licensing under their umbrella) plus partnership effort (~1-2 weeks for sandbox vs hours for SD3-dependent Buy 1 if Owen cooperates).

Strategic implication: **do not make the whole roadmap contingent on the Owen call**. Start banking-partner conversations (Plaid + Dwolla sandbox) in parallel so we unblock either track.

---

## The core insight

**Our existing deposit flow is already a complete fiat→crypto→fiat loop.** We just haven't exposed both ends as user-facing features.

What we have today:
- **Deposit flow (crypto → card)** — user sends any token on any supported chain → we swap/bridge → SD3 Issuer credits card balance → user spends via Visa rails. This is basically an **off-ramp** already (crypto in, fiat-like spending power out).
- **SD3 Issuer API** — card issuance + balance sync + hypothetically: card-to-ACH push, ACH-to-card pull, Visa Direct.
- **Deployer wallet + Fee Vault** — USDC liquidity on Base we control.
- **HD-derived deposit addresses** — per-user, per-chain, all signed from one seed.
- **User identity + KYC** — already handled via SD3 onboarding.

We don't need a third party. We need to expose the inverse of each existing rail and connect them.

---

## Proposed architecture (four flow variants)

### Buy 1 — "Pay from card balance" (MVP, 4–6h to ship)

Simplest. No external banking.

1. User has $X credited on their Nuro card (from prior deposits or future ACH pulls)
2. Picks "Buy crypto from card balance" → amount + target chain
3. Backend:
   - Debits card balance via SD3 (`POST /cards/:id/debit` — assumes SD3 supports this)
   - Transfers USDC from Fee Vault (or a dedicated reserve) to the user's wallet on chosen chain
   - Records a row in `transactions` table: type=`card_buyback`, status flips through `pending → bridging → confirmed`
4. FE shows instant feedback — card balance drops, wallet balance climbs within 1-2 min

**Margin**: we take 0.5–1% spread (vs Moonpay's 3–5%). Still better for user.
**Blocker to ship**: confirm SD3 has a card-debit API. Owen conversation.

### Buy 2 — "ACH pull from linked bank" (Phase 7b, 1–2 weeks)

For net-new funds entering Nuro.

1. User links bank via Plaid (free tier) or Stripe Financial Connections
2. Initiates ACH pull (`$250`) to their Nuro card
3. SD3 credits card on settlement (1–3 business days) — this is **Buy 1** applied to the freshly-landed funds
4. User can then "Pay from card balance" to convert to crypto

**Alternate fast path**: RTP (Real-Time Payments) or Same-Day ACH via Dwolla or Unit — settlement in hours, not days.
**Compliance blocker**: moving money between a bank and a regulated issuer. May need MSB license or partner with one. Owen's network probably has answers.

### Sell 1 — "Reload Card" rebrand (immediate, essentially free)

This already ships! Our entire deposit flow IS the crypto→card direction.

- User has USDC (or any supported token) in their wallet
- Uses existing Reload Card flow → swap if needed → bridge to Base → SD3 credits card
- **What we do today**: call it "Reload Card"
- **What we should do**: also expose it as the **Sell tab's primary option** with clearer copy — "Convert crypto to spendable card balance" — same backend, better UX

Zero new code. Just a copy + navigation change in `/my-wallet` Sell tab. **This is the biggest quick win.**

### Sell 2 — "Withdraw card balance to external bank" (Phase 7c, 1–2 weeks)

For users who want actual fiat, not card spending.

1. User has $X on Nuro card
2. Picks "Withdraw to bank" → enters bank details (or uses saved account from Buy 2)
3. SD3 pushes via ACH (`POST /cards/:id/withdraw`) — settles in 1–3 business days
4. Alternative: Visa Direct push-to-card — near-instant to any Visa debit card the user owns

**Blocker**: confirm SD3 has withdraw API. Same conversation as Buy 1.

### Sell 3 — "Withdraw direct from wallet" (Phase 7d, ~2 weeks, most complex)

Skipping the card as an intermediary.

1. User's wallet has USDC (or any token)
2. Picks "Sell to USD" → enters bank details
3. Backend:
   - Swaps token → USDC if needed (existing infra)
   - Bridges USDC to Base (existing infra)
   - Converts USDC → USD via our own liquidity (MM or Circle's off-ramp API)
   - ACH pushes to user's bank (Dwolla / Unit / Mercury)
4. Settles in 1–3 business days

**Blocker**: off-ramp license. USDC→USD redemption via Circle is possible as a business customer. Unit/Mercury handle ACH on our behalf under their licensing. Partnership + compliance review needed.

---

## Revenue model

| Flow | Typical spread | Ours (target) | Who captures fee |
|---|---|---|---|
| Moonpay Buy | 3–5% | — | Moonpay |
| Moonpay Sell | 3–5% | — | Moonpay |
| **Buy 1 (card)** | N/A | 0.5–1% | **Fee Vault** |
| **Buy 2 (ACH)** | 0.5–1% ACH cost | 1–1.5% | **Fee Vault** |
| **Sell 1 (reload)** | existing | existing 5% bridge fee | **Fee Vault** |
| **Sell 2 (card→bank)** | N/A | 0.5–1% + SD3 withdrawal fee | Split Fee Vault + SD3 |
| **Sell 3 (wallet→bank)** | 1–2% off-ramp | 1–2% | Split Fee Vault + partner |

Blended: if we replace Moonpay with our own rails, we reclaim roughly **3× the margin** on every ramp transaction.

---

## Where the rails need to be built

### Component map

```
     [User]
        │
        ├── Bank account  ──ACH──→  [Dwolla / Unit / Mercury]  (Phase 7b/c)
        │                                    │
        │                                    └──→ [SD3 Card balance]
        │
        ├── Card  ──spend──→ [Visa network] (today)
        │        ←─debit── [Our /buy-from-card route] (Buy 1)
        │        ←─push──  [Our /withdraw-card route] (Sell 2, via SD3 API)
        │
        └── Wallet  ←─fund── [Fee Vault on Base → user's chain] (Buy 1 terminus)
                    ─send──→ [Reload Card → SD3] (Sell 1, EXISTS)
                    ─send──→ [Off-ramp partner] (Sell 3)
```

### Components we have

- HD deposit addresses per chain per user
- Monitor + swap.ts + bridge.ts
- SD3 Issuer integration (read)
- Fee Vault liquidity on Base
- `transactions` table + `execution_log` audit trail
- KYC status on users
- Admin console for monitoring

### Components we need

- SD3 card-debit API call wrapper (for Buy 1)
- SD3 card-withdraw API call wrapper (for Sell 2)
- New backend endpoints: `/buy-from-card`, `/withdraw-to-bank`, `/sell-direct`
- Bank-account linking: Plaid or Stripe Financial Connections
- ACH rails: Dwolla / Unit / Mercury partnership
- Reserve liquidity management (Fee Vault top-up logic)
- Compliance review (MSB or partner-under-license)

### Deferred / strategic

- Off-ramp license (Sell 3's USDC→USD) — Circle Business Account + compliance
- Visa Direct push-to-card — separate Visa partnership

---

## Phasing recommendation

### Phase 7 — "Sell 1 rebrand" (shipped Session 25, ~2 hours)
- Rename Reload Card to also appear as primary Sell action on /my-wallet Sell tab ✅
- Zero backend changes — all existing infra
- **Deletes Moonpay Sell dependency with the same day's commit** ✅

### Phase 8 — BUY TAB DUAL LAUNCH: Buy 1 + Buy 2 together (6–10 weeks total, parallel)

**Directive (Session 26):** Don't ship Buy 1 first then Buy 2 later. Ship them side-by-side so users pick the funding source that fits them. If Owen cooperates fast, Buy 1 lands first and Buy 2 follows weeks later — but the UI surfaces both slots from day one, and we break ground on Buy 2 partnerships *now*, not after Buy 1 ships.

**Buy tab UI (target):**

```
┌─────────────────────────────────────────────────────┐
│  Buy Crypto                                         │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────┐    ┌──────────────┐              │
│  │ 💳 From Card │    │ 🏦 From Bank │              │
│  │   Balance    │    │   Direct     │              │
│  │              │    │              │              │
│  │ $$$ on card? │    │ Link bank →  │              │
│  │ Fastest path │    │ ACH pull     │              │
│  │ 0.5–1% spread│    │ 1–1.5% spread│              │
│  │ Instant      │    │ 1–3 bus days │              │
│  └──────────────┘    └──────────────┘              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### Phase 8a — Buy 1 backend + UI (1 week, ~4–6h code + SD3 dep)
- **Blocker:** confirm SD3 card-debit API exists (Owen conversation)
- Backend: `POST /buy-from-card` — debit card, transfer USDC from Fee Vault to user wallet on chosen chain
- FE: "From Card Balance" CTA on Buy tab
- **Deletes Moonpay Buy for existing-balance users**

#### Phase 8b — Buy 2 bank-link + ACH rails (4–8 weeks, compliance-heavy)
- Plaid integration for bank link
- Dwolla or Unit partnership for ACH pull (they handle MSB licensing)
- Backend: `POST /buy-from-bank` — initiate ACH pull via partner, credit user wallet on settlement
- FE: "From Bank Direct" CTA on Buy tab
- **Deletes Moonpay Buy for users without card balance**

**Parallelisation rule:** Plaid + Dwolla sandbox work begins **the same week** Buy 1 starts, not after. Partnership timelines are the gating factor — don't let them start cold.

### Phase 9 — Sell 2 (card→bank via SD3) (1–2 weeks after Buy 1 + SD3 confirmed)
- Depends on SD3 having card-withdraw or Visa Direct push
- Same Owen conversation as Buy 1 — bundle the asks

### Phase 10 — "Sell 3 (wallet direct to bank)" (separate effort, ~3–6 months)
- Own off-ramp license OR deeper partnership
- Required for truly self-custody-first UX
- Long-term strategic play

### Fast-follow sell options (do after Buy tab ships)
- Sell 2 "card → bank" once SD3 confirms withdraw API
- Sell 3 "wallet → bank direct" as the self-custody play

---

## Open questions (for next session or Owen conversation)

1. Does SD3 expose an API for **debiting card balance**? (Buy 1 blocker)
2. Does SD3 expose an API for **ACH push from card**? (Sell 2 blocker)
3. Do they support Visa Direct push-to-card? (Sell 2 fast path)
4. What's our MSB / banking-partner situation? Can we move money from a user's bank to our card issuer without a license ourselves, under a partner like Dwolla / Unit?
5. Is Circle Business Account realistic for direct USDC→USD settlement (Sell 3)?
6. Reserve liquidity sizing — how much USDC should we keep in the Fee Vault to cover Buy-flow demand without running dry?

---

## Why this matters strategically

Moonpay is easy to ship but is architecturally lazy:
- Gives away 3–5% fee margin on every ramp tx
- Users leave our app for a third-party widget — brand trust leaks
- We have no visibility into conversion rates, drop-offs, failed transactions
- Regulatory risk moves to us anyway (we're still routing the user)

In-house ramps convert Nuro from "crypto wallet that links to bank services" into "full-stack neobank + wallet with its own rails". That's the difference between a feature and a moat.

We already own 80% of the plumbing. Session 26+ should finish it.
