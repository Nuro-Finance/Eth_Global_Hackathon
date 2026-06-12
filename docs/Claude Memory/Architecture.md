> ⚠️ SANITIZED FOR GIT — Secrets replaced with [REDACTED]. See .env files on VPS for real values.

# 🏗️ Architecture — Cashly / Nuro Finance

## Stack Overview

```
User Browser
    │
    ▼
Next.js 15.5.14 (App Router, [locale] routing)
Port 2800 — PM2 id:7
⚠️ DO NOT upgrade to Next.js 16 — Turbopack crashes on thread-stream
Auth: NextAuth v5 (next-auth@5.0.0-beta.30) — NOT Privy
/home/cash/nuro-finance-dashboard
GitHub: https://github.com/nurostack/nuro-finance-dashboard (main branch)
    │
    │  HTTP calls with Bearer token (JWT signed w/ JWT_SECRET)
    ▼
Express/TypeScript Middleware (ts-node transpile mode)
Port 3000 — PM2 id:0
/home/cash/Cashly
    │
    ├── PostgreSQL (localhost:5432/cashly)
    ├── Owen/SD3 API (https://rocket.sd3.gg/api/proxy/issuing)
    ├── Alchemy RPC (⚠️ costs money per call)
    └── Monitor (polls EVM chains every 60s — was 15s, changed 2026-03-26)
```

---

## Environment Variables

### Middleware `/home/cash/Cashly/.env`
```
PORT=3000
OWENS_API_BASE=https://rocket.sd3.gg/api/proxy/issuing
OWENS_API_KEY=[REDACTED_API_KEY]
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/[REDACTED_ALCHEMY_KEY]
RPC_URL_ETHEREUM=https://eth-mainnet.g.alchemy.com/v2/[REDACTED_ALCHEMY_KEY]
RPC_URL_ARBITRUM=https://arb-mainnet.g.alchemy.com/v2/[REDACTED_ALCHEMY_KEY]
RPC_URL_OPTIMISM=https://opt-mainnet.g.alchemy.com/v2/[REDACTED_ALCHEMY_KEY]
RPC_URL_POLYGON=https://polygon-mainnet.g.alchemy.com/v2/[REDACTED_ALCHEMY_KEY]
PRIVATE_KEY=[REDACTED_PRIVATE_KEY]
FEE_VAULT_ADDRESS=0x749edFC84A28793ce150d4E7E71bcEe73C454b56
FEE_PERCENT=5
ADMIN_KEY=[REDACTED_ADMIN_KEY]
DATABASE_URL=postgresql://cashly:[REDACTED_DB_PASSWORD]@localhost:5432/cashly
JWT_SECRET=[REDACTED_JWT_SECRET]
ALCHEMY_GAS_POLICY_ID=[REDACTED_POLICY_ID]
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_PRIVATE_KEY=[REDACTED_SOLANA_KEY]
CIRCLE_API_KEY=[REDACTED_CIRCLE_KEY]
```

### Frontend `/home/cash/nuro-finance-dashboard/.env.local`
```
CASHLY_API_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://74.50.109.203:3000
NEXTAUTH_SECRET=[REDACTED_SECRET]
AUTH_SECRET=[REDACTED_SECRET]
```

---

## Key Source Files

| File | Purpose |
|------|---------|
| `/home/cash/Cashly/src/nuro-routes.ts` | All API routes (auth, cards, KYC, deposits, settings) |
| `/home/cash/Cashly/src/owens.ts` | Owen/SD3 API wrapper (onboardUser, freezeCard, createCard, getCardDetails, getUserBaseDepositAddress) |
| `/home/cash/Cashly/src/monitor.ts` | Deposit monitor — polls 20 EVM chains every 60s |
| `/home/cash/Cashly/src/bridge.ts` | CCTP bridge logic (bridgeAndForward) |
| `/home/cash/Cashly/src/db.ts` | DB helpers (getDepositAddress, saveDepositAddress) |
| `/home/cash/Cashly/src/index.ts` | Express app entry — CORS, middleware mount |

## Bridge Architecture (CCTP V2 + LayerZero V2)

### CCTP V2 — Direct Chains (17 chains)
```
TOKEN_MESSENGER_V2  = 0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d
MESSAGE_TRANSMITTER_V2 = 0x81D40F21F12A8F0E3252Bccb954D722d4c464B64
```
Same address on all supported chains. Confirmed deployed on all 17 as of 2026-03-27.

Supported: Ethereum (1), Base (8453), Arbitrum (42161), Optimism (10), Polygon (137),
Avalanche (43114), zkSync (999), Linea (59144), Unichain (130), Sonic (146),
WorldChain (480), Ink (57073), Corn (81224), Sei (1329), Plume (98866),
Berachain (143), XDC (50)

### LayerZero V2 OFT Adapter — Spoke Chains (5 chains)
These chains are NOT on CCTP. USDC is bridged via LZ OFT Adapter to Arbitrum first, then CCTP to Base.

```
Arbitrum Hub: 0xd58C1412e50fF00212770B170D86e2387D2d2b18  (EID 30110)
zkSync Era:   0xA150EC8B718C22E12036f916d90FF72af14B3E96  (EID 30165)
Scroll:       0xA150EC8B718C22E12036f916d90FF72af14B3E96  (EID 30214)
Celo:         0xA150EC8B718C22E12036f916d90FF72af14B3E96  (EID 30125)
Gnosis:       0xA150EC8B718C22E12036f916d90FF72af14B3E96  (EID 30145)
BSC:          0xce4c2270890267aC860fdc72b6946359d0898675  (EID 30102)
```

All 10 bidirectional peer relationships confirmed live on-chain (2026-03-27).

**CRITICAL FIX (2026-03-27):** The `to` address in `quoteSend/send` MUST be the deployer wallet address, NOT the Arbitrum adapter address. Sending to the adapter causes `_credit(adapterAddr, amount)` to transfer USDC from adapter to itself — a no-op. The deployer wallet is `new ethers.Wallet(CONFIG.PRIVATE_KEY).address`. After LZ delivery, `waitForArbUsdc` polls deployer wallet balance, then `cctpArbitrumToBase` sweeps it to Base.

---

## Owen / SD3 API
- Base: `https://rocket.sd3.gg/api/proxy/issuing`
- Key: in .env as `OWENS_API_KEY`
- Card freeze: `PATCH /cards/{cardId}` with `{ status: "frozen" | "active" }` ✅ working
- Card create: `POST /users/{owenUserId}/cards` → returns `{ cardId }` ⚠️ **returns 404 — not enabled for this account yet. Contact SD3 to enable.**
- Card details: `GET /cards/{owenCardId}` → returns `{ cardId, cardNumber, expiryDate, cvv, status }` (called after card creation to write real PAN to DB)
- Base deposit address: `GET /users/{owenUserId}/contracts` → Owen's Base USDC contract address ✅ working
- **Owen's contract ONLY accepts real USDC/USDT/DAI — no synthetic/bridged tokens**
- **Card numbers in DB are placeholder-generated until Owen enables card creation endpoint**

### Frontend Next.js API Proxy Routes (port 2800 → port 3000)
| Route | Method | Proxies to |
|-------|--------|------------|
| `/api/cards` | GET | `GET /cards` |
| `/api/cards/[id]` | PATCH | `PATCH /cards/:id` |
| `/api/cards/[id]/freeze` | PATCH | `PATCH /cards/:id` with `{ is_locked }` |

---

## Deposit Flow (End to End)

```
User sends USDC on any EVM → deposit_addresses.address
        │
        ▼ (every 60s, ⚠️ Alchemy RPC cost)
Monitor detects balance > 0
        │
        ▼
processDeposit(owenUserId, depositAddress, chainId, amount)
        │
        ├── INSERT INTO transactions (status: pending)
        ├── getUserBaseDepositAddress(owenUserId) → Owen Base contract addr
        ├── bridgeAndForward(owenUserId, depositAddr, baseAddr, amount, chainId)
        │       ├── CCTP chains (17): burn on source → mint on Base via CCTP V2
        │       └── Non-CCTP chains (LZ, 5): LZ OFT → Arbitrum deployer wallet → CCTP V2 → Base
        ├── UPDATE transactions (status: confirmed)
        └── updateCardBalance(pool, owenUserId, amount) ← ADDED 2026-03-26
                └── UPDATE cards SET balance = balance + amount WHERE user_id = internalId
```
