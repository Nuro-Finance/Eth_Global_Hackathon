# Fee System — AFI Revenue Architecture
> Last updated: 2026-04-13 (Session 18)

---

## Fee Vault
- **Address**: `0x749edFC84A28793ce150d4E7E71bcEe73C454b56`
- **Type**: Safe multisig (getcashly.eth)
- **Chain**: Fees accumulate on each SOURCE chain separately (not consolidated to Base yet)

## Current Fee Schedule (Production)

| Transaction Type | Fee | Where Collected |
|-----------------|-----|-----------------|
| Omnichain Deposit | 5% of deposit | Source chain (before CCTP/LZ bridge) |
| Market Winnings | 2% of profit | Settlement on Base |
| Market Creator | 0.5% of volume | On market resolution |
| Agent Profit Settlement | 2.5% of profits | Sweep to card |
| P2P Transfer | 1-2% | Base vault-to-vault |
| Card-to-Card | $0.50 flat | Middleware (swap + bridge under hood) |
| Vault Withdrawal | 1% | Base vault to external wallet |
| Card Interchange | Visa fee | Every card swipe (Issuer handles) |

## How Fees Are Collected

### EVM Deposit Fee Flow
```
User deposits $10 USDC on Arbitrum
  → Monitor detects balance at deposit address
  → Fee sweep: $0.50 (5%) transferred to fee vault ON ARBITRUM
  → Remaining $9.50 → CCTP burn → Base → Issuer → card credited
```

The fee stays on the source chain. It does NOT bridge to Base. This means the fee vault holds USDC across multiple chains:
- Base: from direct deposits
- Ethereum: from ETH CCTP deposits
- Arbitrum: from Arb CCTP deposits
- etc.

### Solana Fee Vault
- **Address**: `GZxqx21AX1uXgDv86mveNmaBS7fSK1AyxAMxkYRsMf8t`
- **Status**: ATA not initialized — fee collection on Solana currently skipped (full amount bridged)
- **Fix needed**: Create ATA for USDC on fee vault Solana address

## Fee Consolidation (TODO)
- Periodic sweep from all chains to Base
- Use CCTP to bridge accumulated fees from ETH/Arb/etc. to Base
- Safe multisig on Base receives consolidated fees

## ONFT Discount Tiers (Expansion_Testing)
> `src/fees.ts` — not deployed to production yet

| ONFT Tier | Discount | Effective Deposit Fee |
|-----------|----------|----------------------|
| Default (no ONFT) | 0% | 5.00% |
| Bronze | 10% | 4.50% |
| Silver | 20% | 4.00% |
| Gold | 35% | 3.25% |
| Platinum | 50% | 2.50% |

Users holding specific ONFT card membership tokens get automatic fee reductions.
`calculateFeeForUser(txType, amount, userId)` checks ONFT holdings and applies discount.

## Configuration
```env
FEE_VAULT_ADDRESS=0x749edFC84A28793ce150d4E7E71bcEe73C454b56
FEE_PERCENT=5
SOLANA_FEE_VAULT=GZxqx21AX1uXgDv86mveNmaBS7fSK1AyxAMxkYRsMf8t
```

## Admin Console
Fee totals are displayed in the Execution Layer tab:
- **Total Volume**: Sum of all confirmed transaction amounts
- **Total Fees Earned**: Sum of all fee fields from confirmed transactions
- URL: `http://74.50.109.203:3000/admin?key=cashly_admin_prod_2026` → Execution Layer tab

---

*Related: [[Neural Net/Claude Memory/Architecture]] · [[Neural Net/Claude Memory/Bridge & Monitor]] · [[Neural Net/Claude Memory/V2 Feature Set & Marathons]] · [[Neural Net/Claude Memory/INDEX]]*
