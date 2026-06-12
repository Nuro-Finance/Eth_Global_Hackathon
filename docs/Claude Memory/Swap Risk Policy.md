# Memecoin & Token Swap Risk Policy (AFI)

**Owner**: Richard / Mythos
**Effective**: 2026-04-18 (Session 23)
**Related**: `Memecoin Allowlist Policy.md` (which tokens) · `Cashly_Source_Code/src/swap.ts` (the code)

---

## The principle in one line

**Users get credited USDC at the post-swap rate, not the deposit-time rate.** If the token drops 20% between deposit and our swap, the user eats the loss. Not us.

---

## Why this matters

Memecoins are volatile. A user might send $20 of ANDY, expecting $20 USDC on their card. Between the moment they press "send" on their wallet and the moment our backend swaps the tokens:

- Market can move 5-20% against them (normal)
- A pump-and-dump exit could tank the token 50%+ (tail risk)
- 300 people exiting simultaneously could cause a 10%+ dip on their specific liquidity pool (bank-run risk)

**If we credited the card at the deposit-time dollar value, we would be taking on ALL of that market risk on behalf of every user.** That turns the product into an insurance contract the moment a token tanks — and at scale that's a business-ending lawsuit waiting to happen.

The correct model: **we are a transparent venue, not a market-maker.** We convert whatever tokens the user sends into USDC via 0x at the best rate we can find right now. The USDC that lands is what credits the card. Full stop.

---

## How the code enforces this

The flow in `swap.ts` + `monitor.ts`:

1. **Detection**: `pollNativeBalance()` or `pollErc20Balance()` sees token sitting in user's deposit address
2. **Quote**: `getNativeSwapQuote()` / `getErc20SwapQuote()` — 0x returns best route + indicative output
3. **Gate**: `meetsThreshold` check — if quoted output < `SWAP_MIN_USD`, we decline the swap (user's token stays put, they can add more or we never convert it — no card credit either way)
4. **Execute**: `executeNativeToUsdcSwap()` / `executeErc20ToUsdcSwap()` — submits swap tx to 0x AllowanceHolder. Returns actual USDC received, which equals `minBuyAmount` or better (0x's own slippage guarantee)
5. **Land**: USDC arrives at same deposit address
6. **Credit**: next `pollChain()` cycle detects the USDC. THIS is what bridges/credits the card. The amount on the card is the actual USDC that arrived — not any pre-swap estimate.

The FE live-quote preview (`previewSwapQuote`) is explicitly labeled with `≈` prefix and a "Slippage worst-case" line. The user sees an estimate, not a guarantee.

---

## User-facing disclosures

Every memecoin-category reload screen shows:

- **"≈ $X USDC" prefix on the estimate** — the tilde-equals signals "this is an estimate, not a promise"
- **Worst-case minimum** with slippage already applied (e.g. "Slippage worst-case: $7.86 USDC (3.0%)")
- **Below-threshold warning** when quote < min swap ("⚠ Below $5 minimum — add more X to proceed")
- **Policy link** (Session 24: add a "Learn more" link that opens this doc rendered as a modal)

---

## Edge cases & how we handle them

### Pump-and-dump mid-transit
- Token pumped 50% in the 30 seconds between user's deposit and our swap
- Our swap catches the pumped price → user gets MORE USDC than estimated. Good outcome, no action needed.

### Rug mid-transit
- Token tanked 90% between deposit and our swap
- `executeSwap()` still runs against the current price
- If quoted output < `SWAP_MIN_USD` (default $5), we decline the swap and log `below_threshold`
- Token sits in user's deposit address; they can either send more tokens (to re-trigger the check with combined balance) or withdraw it manually (future feature — not yet built as of Session 23)

### 0x route disappears entirely
- Liquidity dried up, no route exists
- `previewSwapQuote` returns null → FE shows "Quote temporarily unavailable" (`degraded: true`)
- No swap attempted, no card credit, no side effect
- User's tokens sit in their deposit address safely

### Mid-swap tx reverts (e.g. slippage tolerance exceeded)
- `executeSwap` catches the revert → returns `{ success: false, reason: 'tx_reverted' }`
- Logged to `execution_log` entity_type='swap' for admin visibility
- No partial credit happens; tokens still in user's deposit address
- Swap retried on next poll cycle (typically 60s later) with fresh price

### 300 users exit simultaneously on same token
- Each user's swap hits 0x with its own slippage allowance (3% default)
- First-in-line users get better prices; later users get worse prices or reverts
- Users who revert don't get charged gas twice; `inflightKey` in swapInflight map prevents double-swap
- The POOL takes the damage, not Nuro. Each user gets whatever USDC their specific swap returned.

---

## Where we DO carry risk (worth being explicit about)

1. **Gas**: we pay gas for the swap tx. If gas is higher than swap output value, we've lost money on the fee. Mitigated by `SWAP_MIN_USD` floor and per-chain gas buffers.
2. **0x aggregator bug**: if 0x's routing itself is exploited (malicious route injected), we'd lose on behalf of the user. Mitigated by using the /quote endpoint's `minBuyAmount` (0x's own slippage guarantee).
3. **Token contract exploit**: if an allowlisted token's contract gets exploited mid-flight (e.g. supply manipulation), our locked approval could be drained. Mitigated by: (a) approving only the exact `sellAmount`, not infinite; (b) memecoin allowlist policy requiring verified contract + age threshold.

We are comfortable with (1) at the per-swap level because the `SWAP_MIN_USD` floor means we cap single-transaction downside.
(2) and (3) are tail risks we monitor via `execution_log` audit patterns.

---

## Not in scope for this policy

- **Exchange-rate risk AFTER card credit**: once USDC is on the card, user spends USDC. If USDC depegs, that's a separate (much smaller) stablecoin risk that applies to every USDC-denominated card on the market.
- **Fiat off-ramp** at merchant time: Issuer handles the USDC → USD conversion at swipe time. Their policy governs that step.

---

## Audit trail

Every swap attempt — success or failure — writes to `execution_log` with:
- `entity_type = 'swap'`
- `entity_id = depositAddress`
- `action = 'native_swap'` or `'native_swap:<reason>'`
- `detail = user=X | chain=Y | SYMBOL=Z | tx=0x... OR reason=...`

Admin console "Native→USDC Swaps (24h)" panel surfaces these (Session 23 commit `c137332`).

This is the dataset we'd pull if a user ever disputes "I sent $20, got $15" — we can show the exact 0x quote they received, the exact USDC that landed, and the exact timestamp of the swap.
