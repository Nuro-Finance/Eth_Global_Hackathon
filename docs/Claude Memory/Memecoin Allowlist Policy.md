# Memecoin & ERC-20 Allowlist Policy (AFI)

**Owner**: Richard / Mythos
**Last reviewed**: 2026-04-18 (Session 23, Thread D)
**Enforcement**: hard-coded in `Cashly_Source_Code/src/swap.ts` → `ERC20_ALLOWLIST`. Also gated behind two env flags:
- `ERC20_SWAP_ENABLED` — enables the ERC-20 poll cycle at all
- `ERC20_MEMECOIN_ENABLED` — additional gate for `category: 'memecoin'` entries

---

## Why this exists

The Reload Card memecoin feature ("deposit DOGE / SHIB / PEPE → auto-swap to USDC → credits your card") is a premium UX. But memecoins are also **the most common scam/rug vector** in crypto. A single bad token in our allowlist = users get zero USDC back, we eat the reputational hit.

This policy is the checklist every new ERC-20 addition must pass before it lands in `ERC20_ALLOWLIST`. Passing is necessary but not sufficient — Richard has final veto on any token.

**Blue-chip ERC-20s** (LINK, UNI, WBTC, WETH, cbBTC) are lower-risk and go in under `category: 'bluechip'`. They still need steps 1-3 verified but the risk bar is lower.

**Memecoins** (`category: 'memecoin'`) need the FULL checklist + a gate-check entry.

---

## Criteria (all must pass for memecoin category)

### 1. Verified contract source
- Contract source must be verified on Etherscan / Basescan / Arbiscan (pick the canonical explorer for the chain). Unverified bytecode = reject.
- No admin backdoors: `pause()`, `blacklist()`, `mint()` must not exist in the contract (or if `mint()` exists, it must be permanently renounced — verify on-chain).
- Ownership renounced or DAO-controlled. A contract owner that can change parameters = reject.

### 2. On-chain liquidity threshold
- **≥ $500,000 USD** on-chain liquidity on the target chain (measured via Uniswap V3, Sushi, or the chain's dominant DEX).
- Measure with `@uniswap/v3-sdk` or by querying the pool reserves directly.
- Liquidity must be **locked or held by reputable addresses** — if the top LP can rug, the token is reject.

### 3. Age threshold
- Contract must be **≥ 6 months old** (deployed timestamp via `getCreationTransaction` on Etherscan).
- Newer tokens can still qualify but require Richard's manual sign-off + extra 30-day monitoring period.

### 4. Scam-flag clean
- Not flagged on any of these services (check all):
  - **TokenSniffer** (`tokensniffer.com`) — score ≥ 80
  - **GoPlus Security** (`gopluslabs.io/token-security`) — no "high-risk" items
  - **CoinGecko** — listed, no "scam" / "abandoned" flags
  - **Etherscan token info** — no "Reported For" warnings
- Community reputation: check Twitter/Discord for rug-pull accusations. A recent controversy = reject or defer.

### 5. 0x routing confirmed
- Query `https://api.0x.org/swap/allowance-holder/quote?sellToken={addr}&buyToken=USDC&sellAmount=1000000&chainId={id}` and confirm:
  - Returns a valid quote
  - `buyAmountUsd > 0`
  - `estimatedPriceImpact < 5%` for a $100 swap
  - Route uses real liquidity (check `sources[]` — should include Uniswap V3 / Curve / PancakeSwap, not some no-name DEX)

---

## Process to add a new token

1. **Audit** against all 5 criteria above. Document pass/fail for each in a new file: `Neural Net/Investor Prep/Token Audits/{SYMBOL}_{chain}_{YYYY-MM-DD}.md`.
2. **Open a PR** adding the `Erc20TokenInfo` entry to `src/swap.ts` → `ERC20_ALLOWLIST[chainId]`. PR title: `policy:erc20-allowlist: add {SYMBOL} on {chain}`.
3. **Gate-check entry**: the PR must include a corresponding entry in `.claude/gates.yaml` (or updated audit file) confirming the policy review.
4. **Code review**: Richard or a designated reviewer verifies audit + PR match.
5. **Monitor for 24h** after merge — check `execution_log WHERE entity_type='swap' AND action LIKE '%{SYMBOL}%'` for any unexpected failures or frontrunning.
6. **Deploy**: flip `ERC20_MEMECOIN_ENABLED=true` in VPS .env if this is the first memecoin addition.

---

## Current allowlist (as of 2026-04-18)

### Blue-chip ERC-20s (no policy conflict — standard blue-chip tokens)
| Chain | Symbol | Contract | Audited |
|---|---|---|---|
| Ethereum | LINK  | 0x514910771AF9Ca656af840dff83E8264EcF986CA | 2026-04-18 |
| Ethereum | UNI   | 0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984 | 2026-04-18 |
| Ethereum | WBTC  | 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599 | 2026-04-18 |
| Ethereum | WETH  | 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 | 2026-04-18 |
| Base     | WETH  | 0x4200000000000000000000000000000000000006 | 2026-04-18 |
| Base     | cbBTC | 0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf | 2026-04-18 |
| Arbitrum | LINK  | 0xf97f4df75117a78c1A5a0DBb814Af92458539FB4 | 2026-04-18 |
| Arbitrum | UNI   | 0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0 | 2026-04-18 |
| Arbitrum | WBTC  | 0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f | 2026-04-18 |
| Arbitrum | WETH  | 0x82aF49447D8a07e3bd95BD0d56f35241523fBab1 | 2026-04-18 |

### Memecoins
**Empty** — no memecoins currently in the allowlist.

Candidates for future review (none pre-approved):
- **DOGE** (on Base as wrapped) — pending liquidity check
- **SHIB** (Ethereum) — pending TokenSniffer score check
- **PEPE** (Ethereum) — pending age check (borderline 6mo)
- **FLOKI** (Ethereum) — pending full audit
- **WIF**, **BONK** — Solana-native, out of scope for initial EVM allowlist

---

## Revoking a token

If any of these happen, remove immediately (a git commit reverting the ERC20_ALLOWLIST entry, then pm2 restart):
- Contract is exploited / drained
- TokenSniffer or GoPlus flags the token
- On-chain liquidity drops below $100K for > 48h
- 0x removes it from their routing
- Community surfaces a credible rug-pull allegation

Even mid-flight swaps will fail gracefully: our code checks the allowlist on every poll cycle, so a removed token stops being considered on the very next poll.

---

## Related files

- `Cashly_Source_Code/src/swap.ts` — `ERC20_ALLOWLIST` constant + `findErc20()` helper
- `Cashly_Source_Code/src/monitor.ts` — `pollErc20Balance()` iterates this
- `Cashly_Source_Code/src/config.ts` — `ERC20_SWAP_ENABLED` + `ERC20_MEMECOIN_ENABLED` flags
- `Cashly_Source_Code/src/nuro-routes.ts` — `/supported-tokens` endpoint exposes allowlist to FE
- `Neural Net/Claude Memory/Fee System.md` — related: swap slippage factored into user-visible quote
