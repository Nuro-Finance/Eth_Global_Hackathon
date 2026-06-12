# Memetropolis Intelligence — Cross-Chain Token Launchpad
> Source: GBlock.GG org repos (migrated to RichardTheBruce personal, Apr 2026)
> 810 commits, 5 repos, Sep 2024 — Oct 2025, ~$300K invested

---

## Architecture Overview

```
Frontend (Next.js 14) → Backend (NestJS) → PostgreSQL + Redis
     ↕                       ↕                    ↕
  RainbowKit           Ethers.js/Anchor      Prisma ORM
  wagmi/viem           Solana Web3.js        Cache Manager
     ↕                       ↕
  TokenFactory.sol      Subgraph (The Graph)
  (LayerZero V2)        GraphQL Indexing
```

## Smart Contracts — LayerZero V2 OApp/OFT

### Deployed Chains (Mainnet)
| Chain | Address | LZ EID |
|-------|---------|--------|
| Ethereum | `0xb82a9b4fEAE333f7CE57cA32437B4cf597BD948f` | 30101 |
| BSC | `0x1C31335110ce157C097457E0ED9e706054A0a175` | 30102 |
| Base | `0x10aB4BCb0D5aE2cB901Da0dF23A26E1A096068C0` | 30184 |
| Arbitrum | `0xE160d18f6c12067f5904CC71aF48CFDCb656Da98` | 30110 |
| Avalanche | `0x7F22D83F312FE3EcE60882bD3287c26254AA7BEe` | 30106 |
| Solana | `CULT84nxGdGhSDyhC21vYDJh9Jqi9CVkTJn9tXwK6geE` | 30168 |
| TRON | Separate deployment | — |

### LayerZero V2 Configuration
- **Endpoint (all EVM mainnet):** `0x1a44076050125825900e736c501f859c50fE728c`
- **Packages:** `@layerzerolabs/lz-evm-oapp-v2` v2.3.42, `lz-evm-protocol-v2` v2.3.42
- **Send Library (BSC):** `0x9F8C645f2D0b2159767Bd6E0839DE4BE49e823DE`
- **Receive Library (BSC):** `0xB217266c3A98C8B2709Ee26836C98cf12f6cCEC1`
- **Executor:** `0x3ebD570ed38B1b3b4BC886999fcF507e9D584859`
- **DVN (LZ Labs):** `0xfD6865c841c2d64565562fCc7e05e619A30615f0`
- **Max Message Size:** 10,000 bytes
- **Confirmations:** 10
- **Gas per receive:** 80,000 (EVM), 200,000 (Solana)

### Contract Architecture
1. **TokenFactory.sol** — Master factory (OApp pattern), bonding curve trading, cross-chain messaging
2. **Token.sol** — Standard ERC20, deployed per meme token
3. **MyOFT.sol** — LayerZero OFT contract, custom decimals, burn/mint bridging
4. **LogExpMath.sol** — Exponential bonding curve: `Cost = (P0/k) * (e^(k*(supply+buy)) - e^(k*supply))`

### Cross-Chain Messaging (OApp)
- **Type 1 (BUY):** `[msgType(1)] + [tokenAddr(32)] + [recipient(32)] + [ethAmt(16)] + [tokenQty(32)]`
- **Type 2 (SELL):** `[msgType(1)] + [tokenAddr(32)] + [recipient(32)] + [ethAmt(16)] + [tokenQty(32)]`
- **Bridging pattern:** Burn/Mint (not lock/mint) — cross-chain transfers burn source, mint destination
- **Functions:** `buyCrosschainMemetoken()`, `sellCrosschainMemetoken()`, `_lzReceive()`

### Fee Structure
| Chain | Creator Bonus | Platform Fee | Initial Price |
|-------|--------------|--------------|---------------|
| Ethereum | 0.12 ETH | 0.6 ETH | 1,000,000,000 |
| BSC | 0.12 ETH | 0.6 ETH | 2e12 |
| Base | 0.12 ETH | 0.6 ETH | 1,000,000,000 |
| Arbitrum | 0.12 ETH | 0.6 ETH | 66e10 |
| Avalanche | 3.6 AVAX | 18 AVAX | 6e13 |

### DEX Integration (Uniswap V2)
- Bonding curve completion triggers auto-LP migration
- Factory: `0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6` (BSC, Base)
- Router: `0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24` (most chains)

## Frontend Stack
- Next.js 14, TypeScript, TailwindCSS, pnpm
- wagmi + viem + RainbowKit (EVM), @solana/web3.js + Anchor (Solana)
- Zustand state, TanStack Query, Apollo Client (subgraph)
- Pinata IPFS uploads, Zod validation, React Hook Form

## Backend Stack
- NestJS, TypeScript, Prisma ORM, PostgreSQL, Redis
- JWT auth (passport-jwt), Web3 message signing
- Modules: Auth, Account, Token, GlobalChat, PurchaseHistory
- Apollo Client queries subgraph for indexed events
- NestJS Schedule for background jobs

## Database Schema (Key Tables)
- **Token** — address, chain_id, creator, bonding curve params, holder stats
- **Account** — address, profile, tier, alpha_tester_id
- **TransferEvent** — hash, token_id, from, to, amount, block
- **AccountBalance** — account+token composite, amount, block
- **PurchaseHistory** — hash, type(buy/sell), source_eid (LZ cross-chain), amounts

## Subgraph (The Graph)
- AssemblyScript, graph-cli 0.68.5
- Deployed to: BSC, Base, Arbitrum, Ethereum, Avalanche (mainnet + testnet)
- Events indexed: CreatedMemeToken, BoughtMemeToken, BoughtCrosschainMemeToken, SoldMemeToken, SoldCrosschainMemeToken, ERC20 Transfer
- Dynamic templates: new Token contracts auto-tracked after creation

## Key Learnings for AFI Integration
1. **Config reference library** — DVN addresses, executor gas, confirmations, send/receive libraries for 7 mainnet chains. Use as proven reference when deploying to new chains (not a new capability, AFI's OFT Adapter already works).
2. **Burn/mint > lock/mint** for fungible tokens — simpler, no liquidity fragmentation
3. **Bonding curve math** (LogExpMath.sol) is production-ready — powers the Business OFT Launchpad vision (businesses create branded loyalty tokens, immediately liquid)
4. **DEX router addresses** (Uniswap V2) already configured for BSC, Base, etc. — needed for "Any-Token Card Loading" (swap any token → USDC → bridge → card)
5. **Solana + EVM dual support** — Anchor IDL pattern can be replicated for AFI's Solana deposits
6. **Cross-chain quote functions** — essential UX for showing fees before execution
7. **TokenFactory pattern** — businesses create OFTs with community-gated spending, bonding curve pricing, auto-LP migration. Revenue: creation fee + trade percentage.

---
*Related: [[Neural Net/Claude Memory/Bridge & Monitor]] · [[Neural Net/Claude Memory/AFI Vision]] · [[Neural Net/Claude Memory/V2 Feature Set & Marathons]]*
