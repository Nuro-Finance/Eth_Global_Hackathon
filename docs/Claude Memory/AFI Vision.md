# AFI — Agentic Finance Intelligence
> The Omnichain Prediction Market + Agentic Banking Platform
> Conceptualized: 2026-04-08

---

## What We're Building

Polymarket is single-chain (Polygon). We're **omnichain**.
Polymarket has no off-ramp. We have **Visa cards**.
Polymarket has no AI agents. We have **autonomous trading bots**.

```
AFI = Prediction Markets (any chain) + AI Agents + Visa Off-Ramp + P2P Transfers
```

---

## Architecture

```
USER
  ├── Deposit crypto on ANY chain (20+ EVM + Solana)
  │     └── Bridge → Base → Issuer contract → Visa card funded
  │
  ├── Prediction Markets (YES/NO bets)
  │     ├── Browse markets (like Polymarket but OUR markets)
  │     ├── Bet directly from any chain's USDC
  │     ├── Markets resolve → winnings auto-settle to card
  │     └── Create your own markets (community-driven)
  │
  ├── AI Agents
  │     ├── Alpha Bot (default, passive high-confidence)
  │     ├── Community bots (from GitHub directory)
  │     ├── Agent vs Agent competition (Arena)
  │     └── Profits → bridge → card → spend anywhere
  │
  ├── Visa Card (Issuer/SD3)
  │     ├── Real virtual Visa card
  │     ├── Spend at any merchant worldwide
  │     ├── Card controls, limits, freeze
  │     └── View PAN/CVV/PIN securely
  │
  └── P2P Transfers
        ├── Crypto-to-crypto (wallet to wallet, any chain)
        ├── Agent-to-card settlements
        └── Card balance withdrawal to crypto
```

---

## Competitive Advantages Over Polymarket

| Feature             | Polymarket             | AFI                             |
| ------------------- | ---------------------- | ------------------------------- |
| **Chains**          | Polygon only           | 20+ EVM + Solana                |
| **Off-ramp**        | None (stuck in crypto) | Visa card (spend anywhere)      |
| **AI Agents**       | None                   | Alpha Bot + community bots      |
| **Market creation** | Polymarket team only   | Community-driven (with review)  |
| **P2P**             | No                     | Wallet-to-wallet + card-to-card |
| **KYC**             | Optional               | Integrated (Issuer/SD3)           |
| **Mobile**          | Web only               | Web + future mobile             |

---

## Revenue Model

1. **Bridge Fee** — 5% on all cross-chain deposits
2. **Market Maker Spread** — 1% spread on prediction market bets
3. **Agent Platform Fee** — 2.5% of agent profits
4. **Bot Creator Revenue Share** — 10% to bot creators, 2.5% to platform
5. **Card Interchange** — Visa merchant fees on every swipe
6. **Premium Subscriptions** — Higher limits, priority support, custom agents

---

## Our Prediction Market System

### How It Works

1. **Market Creation**
   - Admin creates markets (initially)
   - Community can propose markets (requires review + $X stake)
   - Markets have: question, resolution date, resolution source, category

2. **Betting**
   - Users buy YES or NO shares at current market price
   - Price determined by AMM (Automated Market Maker) or order book
   - Bets accepted in USDC from ANY chain we support
   - Bridge handles cross-chain settlement automatically

3. **Resolution**
   - Markets resolve based on real-world outcome
   - Resolution oracle (initially manual, later automated with data feeds)
   - YES holders get $1 per share, NO holders get $0 (or vice versa)
   - Winnings auto-deposit to user's card via bridge

4. **The AFI Advantage**
   - Bet from Ethereum, Arbitrum, Polygon, Solana, or 15+ other chains
   - Winnings go straight to your Visa card
   - AI agents can trade markets autonomously
   - Lower fees than Polymarket (we make money on the card, not the market)

### DB Schema for Markets

```sql
CREATE TABLE markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  description TEXT,
  category VARCHAR(50), -- politics, crypto, sports, culture, etc.
  resolution_source TEXT, -- URL or description of how market resolves
  resolution_date TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'active', -- active, paused, resolved, cancelled
  resolved_outcome VARCHAR(10), -- 'yes', 'no', null
  yes_pool NUMERIC(18,2) DEFAULT 0, -- total USDC in YES
  no_pool NUMERIC(18,2) DEFAULT 0, -- total USDC in NO
  total_volume NUMERIC(18,2) DEFAULT 0,
  creator_id VARCHAR(36),
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE market_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID REFERENCES markets(id),
  user_id VARCHAR(36) NOT NULL,
  side VARCHAR(10) NOT NULL, -- 'yes' or 'no'
  shares NUMERIC(18,6) NOT NULL,
  cost_basis NUMERIC(18,2) NOT NULL, -- what they paid
  source_chain INT, -- which chain the USDC came from
  status VARCHAR(20) DEFAULT 'open', -- open, won, lost, sold
  payout NUMERIC(18,2), -- what they received on resolution
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### AMM Pricing (Constant Product)
```
yes_price = no_pool / (yes_pool + no_pool)
no_price = yes_pool / (yes_pool + no_pool)
```

When someone buys YES:
- They add USDC to yes_pool
- Price of YES goes up
- Price of NO goes down

---

## P2P System

### Crypto-to-Crypto Transfers
- User A sends USDC from their deposit address to User B's deposit address
- Same-chain: direct transfer
- Cross-chain: bridge handles routing

### Agent-to-Card Settlements
- Agent profits auto-bridge to Issuer contract
- Issuer credits real Visa card
- Transaction shows as "Agent Name — profit sweep"

### Card Balance to Crypto Withdrawal
- User requests withdrawal from card
- System deducts card balance
- Sends USDC to user's specified wallet address
- Withdrawal fee: 1%

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 15, React, Tailwind, Framer Motion |
| Backend | Express/TypeScript, PostgreSQL |
| Bridge | CCTP V2 (17 chains), LayerZero (5 chains), Custom Solana |
| Cards | Issuer/SD3 API (virtual Visa) |
| Markets | Custom AMM, PostgreSQL positions |
| Agents | HD-derived wallets, Polymarket CLOB, Custom strategies |
| Auth | NextAuth v5, bcrypt, JWT, rate limiting |
| SSL | Let's Encrypt, nginx reverse proxy |
| Infra | VPS (74.50.109.203), PM2, GitHub CI |

---

## Roadmap

### Phase 1 (NOW — Sessions 10-12) ✅
- Bridge working (Base, CCTP, LZ architecture)
- Agent system (CRUD, wallets, bets, CLOB integration)
- Polymarket feed + bet modal
- Alpha Bot brain
- SSL, rate limiting, KYC integration
- Issuer card integration (partial — KYC pending)

### Phase 2 (Next Sprint)
- Complete Issuer card integration (KYC → real PAN/CVV)
- First real Polymarket trade
- Agent vs Agent competition live
- Fund and test bridge on multiple chains

### Phase 3 (AFI Prediction Market)
- Build custom market creation system
- AMM pricing engine
- Market resolution oracle
- Cross-chain betting (bet from any chain)
- Winnings auto-settle to card

### Phase 4 (Scale)
- P2P transfers
- Mobile app
- Institutional API
- Multi-currency support
- Physical card issuance

---

## The Name

**AFI — Agentic Finance Intelligence**

An AI-powered financial platform where autonomous agents trade prediction markets,
earn crypto profits, and settle to real-world Visa cards. Every user gets an
intelligent financial agent that works 24/7 to grow their money.

*"Your money works while you sleep. Spend it anywhere."*

---

## Settlement Options (after winning a bet or agent profit)

```
→ 💳 Cash out to Visa card (bridge → Issuer → card)
→ 💳 Cash out to Your Bank Vault (crypto savings wallet)
→ 🔄 Swap (DEX routing to any token)
→ 🎰 Reinvest in another market (compound)
→ 🤖 Let Alpha Bot manage it (auto-strategy)
```

## Bank Vault

A secure crypto wallet page where users:
- Store winnings before deciding what to do
- Off-ramp to a hardware wallet (Ledger, Trezor)
- View balances across all 23 chains
- Transfer to external wallets
- Convert between tokens

---
*Related: [[Neural Net/Claude Memory/V2 Feature Set & Marathons]] · [[Neural Net/Claude Memory/Memetropolis Intelligence]] · [[Neural Net/Claude Memory/System Rules]] · [[Neural Net/Claude Memory/Pending Tasks]]*
