# Cashly Vault Competition Engine

> **Internal Architecture & Design Specification — v1.0**
> Cashly, Inc. | Confidential

---

## Overview

Cashly is a cross-chain USDC bridging middleware layered on top of Owen/SD3's banking-as-a-service infrastructure. Every user deposit generates a 5% protocol fee, of which **10% (0.5% of the total deposit)** is allocated to the Vault Competition Engine.

The Vault Competition Engine turns routine card spend into a real-time community competition. Communities and chains are sorted into matched spending brackets so high-volume communities compete against peers of comparable size. The community or chain that generates the most fee volume within a round wins the yield farming outcome, and vault winnings are distributed as **direct card spending credits** to members of the winning community.

At beta-launch volumes ($2M+ per 60 days), 0.5% generates over **$10,000 in vault flow per cycle**, providing meaningful yield rewards from day one.

---

## Table of Contents

1. [Fee Architecture](#fee-architecture)
2. [Bracket Competition System](#bracket-competition-system)
3. [Competition Engine](#competition-engine)
4. [Payout & Spending Credits](#payout--spending-credits)
5. [Lottery System](#lottery-system)
6. [Smart Contract Architecture](#smart-contract-architecture)
7. [Backend Service Architecture](#backend-service-architecture)
8. [Admin Panel](#admin-panel)
9. [Security](#security)
10. [Deployment Roadmap](#deployment-roadmap)
11. [Key Addresses & Config](#key-addresses--config)

---

## Fee Architecture

### Core Fee Split

Every deposit into Cashly is subject to a **5% protocol fee**, split into two streams:

| Stream | Allocation | Destination |
|--------|-----------|-------------|
| Protocol Revenue | 90% of 5% | Cashly Multisig Vault |
| Vault Competition Pool | 10% of 5% | Competition Engine Contracts |

### Vault Pool Sub-Allocation

The 0.5% competition pool is divided at the point of deposit based on origin chain and community affiliation:

| Sub-Pool | Trigger | Contract |
|----------|---------|----------|
| Chain vs. Chain Vault | Deposit originates from a specific EVM chain | `ChainVaultRegistry.sol` |
| Community Vault | User holds qualifying community NFT or token | `CommunityVaultRegistry.sol` |
| Unaffiliated Reserve | User has no community tag at deposit time | `ReserveVault.sol` |

The reserve pool accumulates until it hits a configurable threshold, at which point it is distributed proportionally to all active vaults or directed to a lottery event.

---

## Bracket Competition System

### Design Philosophy

Rather than allowing the largest communities to always win, Cashly matches communities and chains against peers with **comparable cumulative spend volume**. Think weight classes in combat sports: a featherweight does not fight a heavyweight.

Brackets are recalculated at the start of each round using trailing 30-day spend volume as the classification metric. Fast-growing communities move up brackets dynamically.

### Bracket Tiers

| Bracket | 30-Day Cumulative Spend | Typical Participants |
|---------|------------------------|---------------------|
| Tier 1: Micro | $0 — $100,000 | New communities, early adopters |
| Tier 2: Emerging | $100,001 — $1,000,000 | Active mid-size communities |
| Tier 3: Growth | $1,000,001 — $10,000,000 | Established communities, top chains |
| Tier 4: Major | $10,000,001 — $100,000,000 | Large-scale communities, flagship chains |
| Tier 5: Institutional | $100,000,001+ | Blue chip communities, multi-chain giants |

Tiers 1 through 3 are active at launch. Tier 4 and 5 activate automatically once participants qualify. All thresholds are configurable via admin controls.

### Chain vs. Chain Competition

Each originating EVM chain (Base, Ethereum, Arbitrum, Optimism, Polygon, Avalanche, BSC) accumulates fees from deposits originating on that chain. The chain generating the highest fee contribution in a given round wins, with yield distributed pro-rata to all users whose deposits originated from that chain.

---

## Competition Engine

### Round Structure

All five round types run **simultaneously and settle independently**:

| Round Type | Duration | Settlement | Yield Strategy |
|-----------|----------|-----------|----------------|
| Daily | 24 hours | Automated cron | Curve 3pool USDC |
| Weekly | 7 days | Automated cron | Curve + Convex boosted |
| Monthly | Calendar month | Automated cron | Aave V3 USDC lending |
| Quarterly | 3 calendar months | Automated cron | Curve Wars bribe market |
| Annual Lottery | 365 days | Automated + admin confirmation | Layered strategy |

At settlement, principal plus all accrued yield is distributed to the winning community's payout pool. **Losers receive their principal back** — no impermanent loss, no slippage exposure.

### Winner Determination

- Rank all participants by total fees contributed to that round's vault pool
- Winner is the participant with the highest total fee contribution within their bracket tier
- Tiebreaker: the participant who crossed the highest fee threshold first (timestamp ordering)
- Results written on-chain to `CompetitionResults` contract and emitted as events

### Yield Strategies

| Protocol | Strategy | Expected APY | Risk |
|----------|----------|-------------|------|
| Curve Finance | 3pool USDC deposit | 3 — 5% | Low |
| Convex Finance | Curve LP staking boost | 5 — 9% | Low-Medium |
| Aave V3 | USDC supply | 2 — 4% | Low |
| Curve Bribe Market | Gauge vote bribery | 8 — 20%+ | Medium |

New yield strategies can be added by deploying a new `YieldAdapter` contract and registering it with `YieldRouter`.

---

## Payout & Spending Credits

### How It Works

When a round settles in favor of a winning community, the accumulated yield is deposited into that community's `SpendingCreditPool`. Members receive card spending credits, not cash.

**Example:** A community wins a monthly round. Vault yield is $8,000. 200 active members. Each member receives a **$40 spending credit** applied automatically against their next card transactions. Dashboard reflects this as a yield percentage.

### Credit Application Order

1. Card transaction initiated by user
2. Cashly middleware checks `SpendingCreditPool` balance before routing to Owen/SD3
3. If balance > 0, transaction covered from pool up to transaction amount
4. Remaining cost routes normally to user's card balance
5. Pool balance decrements by amount covered
6. Dashboard updates to reflect remaining credit and yield earned

### Credit Expiry

Credits expire after **90 days** by default (configurable per tier). Expired credits are recycled back into the reserve pool for the next competition round.

---

## Lottery System

### Purpose

The random lottery ensures regular users who are not high spenders can still win meaningful rewards, preventing the product from becoming purely a whale competition.

### Mechanics

- A configurable percentage of the reserve pool (default: **5%**) is set aside as the lottery pot each round
- Any user who made at least one deposit during the round is eligible
- Winners selected using **Chainlink VRF** on Base for on-chain provable fairness
- Default winner counts: 3 per daily, 10 per weekly, 25 per monthly

### Lottery Trigger Modes

| Mode | Trigger | Admin Control |
|------|---------|--------------|
| Scheduled | Fires automatically at end of each round | Can be disabled per round type |
| Manual | Admin fires at any time from admin panel | Full admin control, requires key auth |
| Milestone | Fires when vault pool crosses a threshold | Admin sets threshold |

---

## Smart Contract Architecture

### Contract Overview

All contracts deployed on **Base**:

| Contract | Responsibility |
|----------|---------------|
| `AdminController.sol` | Role-based access control for all admin functions |
| `VaultRegistry.sol` | Master registry of all community and chain vaults |
| `FeeRouter.sol` | Receives 0.5% pool, routes to correct vault |
| `CompetitionEngine.sol` | Round lifecycle: open, accumulate, settle, distribute |
| `YieldRouter.sol` | Deploys vault USDC into yield strategies |
| `IYieldAdapter.sol` | Protocol-agnostic adapter interface |
| `AaveV3Adapter.sol` | Aave V3 USDC yield adapter |
| `SpendingCreditPool.sol` | Holds and tracks user spending credits |
| `LotteryEngine.sol` | Chainlink VRF integration, winner selection |
| `AdminController.sol` | Role-based access, multisig gating for critical ops |

### Key Data Structures

```solidity
struct Round {
    bytes32     roundId;
    RoundType   roundType;      // DAILY | WEEKLY | MONTHLY | QUARTERLY | ANNUAL
    RoundStatus status;         // OPEN | ACCUMULATING | SETTLING | CLOSED | PAUSED
    BracketTier tier;           // MICRO | EMERGING | GROWTH | MAJOR | INSTITUTIONAL
    uint256     startTimestamp;
    uint256     endTimestamp;
    uint256     totalPool;
    uint256     totalYield;
    bytes32     winner;
    address     yieldStrategy;
}

struct Community {
    bytes32     communityId;
    string      name;
    BracketTier currentTier;
    uint256     trailingSpendVolume;  // 30-day rolling
    uint256     activeMemberCount;
    bool        isActive;
}
```

---

## Backend Service Architecture

### New Modules (Extension to Existing Node.js Service)

| Module | File | Function |
|--------|------|----------|
| VaultRouter | `src/vault/vaultRouter.ts` | Intercepts fee settlement, splits 10% to competition pool |
| RoundManager | `src/competition/roundManager.ts` | Cron jobs for round open/close, bracket recalculation |
| YieldExecutor | `src/yield/yieldExecutor.ts` | Deploys/redeems USDC from yield strategies |
| LotteryService | `src/lottery/lotteryService.ts` | Initiates VRF requests, awards credits |
| AdminService | `src/admin/adminService.ts` | REST API endpoints for admin panel |

### Database Schema (PostgreSQL)

New tables required:

- `rounds` — round metadata, status, timestamps, winner, yield amounts
- `vault_balances` — per-community and per-chain accumulation per round
- `spending_credits` — per-user credit balances, expiry, source round
- `lottery_entries` — eligible users per round, selected winners
- `competition_results` — historical record of all round outcomes
- `bracket_snapshots` — 30-day trailing spend snapshots for bracket classification

---

## Admin Panel

A standalone React application with no public-facing access. Authenticates via admin private key signature.

### Modules

| Module | Key Controls |
|--------|-------------|
| Competition Controls | Start, pause, resume, end rounds; set duration and type |
| Bracket Manager | View classifications, manually reassign tiers, edit thresholds |
| Vault Monitor | Live vault balances, yield accrual, strategy allocations |
| Lottery Controls | Trigger manual lottery, set pot percentage, winner counts |
| Yield Strategy | Switch strategies, emergency withdraw |
| Credit Manager | View and award credits, adjust expiry, clear credits |
| Community Registry | Register communities, link NFT/token contracts, toggle active |
| Admin Keys | Manage wallet list, revoke access, multisig controls |

---

## Security

### Contract Security

- All admin functions gated by `AdminController.sol` role-based access
- Critical operations require multisig confirmation from Cashly multisig vault
- `YieldAdapter` contracts upgradeable via proxy with **48-hour timelock** and multisig approval
- Chainlink VRF ensures no admin or miner can manipulate lottery winner selection
- Round settlement is automated and on-chain; no admin action required for normal operation

### Backend Security

- Admin API endpoints require HMAC signature using deployer wallet private key
- All admin actions logged to an immutable audit log on Base
- Rate limiting on all admin endpoints
- Private keys in environment variables only, never committed to repository

---

## Deployment Roadmap

| Phase | Deliverable | Dependencies |
|-------|-------------|-------------|
| Phase 1 | Deploy `AdminController.sol`, `VaultRegistry.sol`, `FeeRouter.sol` on Base Sepolia | Deployer wallet funded |
| Phase 2 | Deploy `CompetitionEngine.sol`, `YieldRouter.sol`, `SpendingCreditPool.sol` | Phase 1 complete |
| Phase 3 | Deploy `LotteryEngine.sol` with Chainlink VRF | Chainlink VRF subscription on Base |
| Phase 4 | Backend modules integrated to testnet | Phase 2-3 contracts live |
| Phase 5 | Admin panel connected to testnet, end-to-end test | Phase 4 complete |
| Phase 6 | Smart contract audit (Spearbit or Code4rena) | Phase 5 complete |
| Phase 7 | Mainnet deployment, wire LZ pathways, enable competition engine | Audit complete |

### Deploy Commands

```bash
# Base Sepolia (testnet)
pnpm run deploy:sepolia:1   # AdminController
pnpm run deploy:sepolia:2   # Core contracts
pnpm run deploy:sepolia:3   # LotteryEngine + AaveV3Adapter

# Base Mainnet
pnpm run deploy:mainnet:1
pnpm run deploy:mainnet:2
pnpm run deploy:mainnet:3
```

---

## Key Addresses & Config

| Parameter | Value |
|-----------|-------|
| USDC on Base | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Owen Banking Contract | `0x34e81c59B814874611C7FB66661B57E599b4857D` |
| Cashly Multisig Fee Vault | `0x749edFC84A28793ce150d4E7E71bcEe73C454b56` |
| Deployer Wallet | `0x27FbEAD2B527AaDAf4EA7B3Af065244A3964ECBC` |
| Competition Pool Allocation | 10% of 5% fee = 0.5% of deposit |
| Default Lottery Reserve | 5% of competition pool |
| Default Credit Expiry | 90 days |
| Supported Chains | Base, Ethereum, Arbitrum, Optimism, Polygon, Avalanche, BSC |

---

## Environment Setup

```bash
cp .env.example .env
# Fill in:
# DEPLOYER_PRIVATE_KEY
# BASESCAN_API_KEY
# CHAINLINK_VRF_SUBSCRIPTION_ID
```

```bash
pnpm install
npx hardhat compile
```

---

*Cashly, Inc. — Internal Use Only — Confidential*
