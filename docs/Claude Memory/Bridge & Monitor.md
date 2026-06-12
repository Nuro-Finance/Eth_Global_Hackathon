# 🌉 Bridge & Monitor — Cashly / Nuro Finance
> Updated: 2026-04-13 (Session 19 — HyperEVM CCTP added, LZ DVN configs for 6 chains, timeout fix)

---

## Monitor (`/home/cash/Cashly/src/monitor.ts`)

- Polls EVM chains every `POLL_INTERVAL_MS` milliseconds
- **Currently PAUSED at 86400000ms (24h)**
- Re-enable: `sed -i 's/86400000/60000/' /home/cash/Cashly/src/monitor.ts && pm2 restart 0`
- On deposit detected → calls `processDeposit(issuerUserId, depositAddress, chainId, amount)`
- After successful bridge → calls `updateCardBalance(db, issuerUserId, amount)` → updates cards table

### processDeposit flow:
```
Monitor detects USDC balance > 0 at deposit_addresses.address
  → INSERT INTO transactions (status: pending)
  → getUserBaseDepositAddress(issuerUserId) → Issuer /users/{id}/contracts → Base destination
  → bridgeAndForward(issuerUserId, depositAddr, baseAddr, amount, chainId)
  → UPDATE transactions (status: confirmed, tx_hash)
  → updateCardBalance(pool, issuerUserId, amount)
```

### ⚠️ Known failure case:
User `richard@nuro.finance` (Issuer ID `49418fc8`) has `applicationStatus: notStarted` → Issuer `/contracts` 404 → bridge fails. $1 USDC stuck at `0xaBcc89d0aD4Cf75eB4e8d3729B25c8B26eB1f0F4` on Ethereum. Safe — will auto-retry when KYC done and monitor re-enabled.

---

## Bridge (`/home/cash/Cashly/src/bridge.ts`)

### Architecture (CRITICAL — read before touching):
```
CCTP chains (17 chains — Ethereum, Arbitrum, Optimism, Polygon, Avalanche, HyperEVM, Linea, etc.):
  deposit_address → CCTP burn → Circle attestation → CCTP mint on Base → Issuer

LZ 2-hop chains (5 chains — zkSync, Scroll, Celo, Gnosis, BSC):
  deposit_address → OFT Adapter (source) → LayerZero → OFT Adapter (Arbitrum) → CCTP → Base → Issuer
  waitForArbUsdc timeout: 1200s (20min) — LZ delivery can take 10-20min

Solana:
  deposit_address → Circle Bridge Kit → Base → Issuer
```

### Confirmed E2E Tests (6 chains):
Base, Ethereum, Arbitrum, Solana, zkSync (2-hop), HyperEVM (CCTP direct)

### LZ DVN Registry (layerzero.config.ts):
⚠️ **Gnosis uses UNIQUE library/executor addresses** — standard ones are EOAs on Gnosis!
⚠️ **BSC uses unique ReceiveUln302 + Executor** — only shares SendUln302 with standard
All addresses stored in `LZ_INFRA` constant in layerzero.config.ts

**Issuer ONLY accepts REAL USDC/USDT/DAI — NO synthetics, NO wrapped tokens.**
First OFT attempt mistake: adapter deployed ONLY on Base = wrapped/synthetic USDC arriving = Issuer rejects it.
Correct design: OFT Adapter on BOTH source chain AND Arbitrum = real USDC locked on source, real USDC released on Arbitrum = CCTP to Base = real USDC = Issuer accepts.

### bridge.ts is ALREADY CODED for two-step LZ+CCTP:
- `CCTP_CHAIN_MAP` — maps chainId → chain name for CCTP-native chains
- `LZ_CHAIN_MAP` — maps chainId → LayerZero chain config for non-CCTP chains
- `LZ_ADAPTER` — maps chainId → deployed OFT Adapter address on that chain
- `OFT_ADAPTER_ABI` — ABI for calling send() on the adapter
- `CCTP_DOMAINS` — Circle CCTP domain IDs per chain
- `bridgeAndForward(issuerUserId, sourceAddr, destAddr, amount, chainId)` — main entry point

### Route selection in bridgeAndForward():
```typescript
if (LZ_CHAIN_MAP[chainId]) {
  // Non-CCTP: LZ hop source→Arbitrum, then CCTP Arbitrum→Base
} else {
  // CCTP direct: burn on source chain, mint on Base
}
```

---

## OFT Adapter Deployment State (as of 2026-03-27)

### Deployed contract addresses:
| Chain | ChainId | OFT Adapter Address | Peers Wired |
|-------|---------|--------------------|----|
| Arbitrum | 42161 | `0xd58C1412e50fF00212770B170D86e2387D2d2b18` | ✅ Hub |
| zkSync | 324 | `0xA150EC8B718C22E12036f916d90FF72af14B3E96` | ✅ ↔ Arbitrum |
| Scroll | 534352 | `0xA150EC8B718C22E12036f916d90FF72af14B3E96` | ✅ ↔ Arbitrum |
| Celo | 42220 | `0xA150EC8B718C22E12036f916d90FF72af14B3E96` | ❌ deployed, not peered |
| Gnosis | 100 | `0xA150EC8B718C22E12036f916d90FF72af14B3E96` | ❌ deployed, not peered |
| BSC | 56 | ❌ NOT DEPLOYED | ❌ |
| Moonbeam | 1284 | ❌ commented out in config | ❌ |
| Mode | 34443 | ❌ commented out in config | ❌ |
| Mantle | 5000 | ❌ commented out in config | ❌ |

### ⚠️ MUST VERIFY FIRST NEXT SESSION:
Celo/Gnosis/Scroll/zkSync ALL show address `0xA150EC8B718C22E12036f916d90FF72af14B3E96`.
Each chain must have a UNIQUE contract. This could be:
- CREATE2 deployment with same salt (possible but unusual across chains)
- Corrupted/copied deployment JSON files (more likely)
Verify with on-chain bytecode check using PUBLIC RPCs (no Alchemy cost):
```bash
cd /home/cash/Cashly
node -e "
const {ethers} = require('ethers');
const checks = [
  { name: 'celo',    rpc: 'https://forno.celo.org' },
  { name: 'gnosis',  rpc: 'https://rpc.gnosischain.com' },
  { name: 'scroll',  rpc: 'https://rpc.scroll.io' },
  { name: 'zksync',  rpc: 'https://mainnet.era.zksync.io' },
];
const addr = '0xA150EC8B718C22E12036f916d90FF72af14B3E96';
Promise.all(checks.map(async c => {
  const p = new ethers.providers.JsonRpcProvider(c.rpc);
  const code = await p.getCode(addr);
  console.log(c.name + ':', code === '0x' ? 'NO CONTRACT ❌' : 'EXISTS ✅ len=' + code.length);
}));
"
```

### USDC token addresses per chain (in hardhat.config.ts):
| Chain | USDC |
|-------|------|
| Arbitrum | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |
| Base | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| zkSync | `0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4` |
| Scroll | `0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4` |
| Celo | `0xcebA9300f2b948710d2653dD7B07f33A8B32118C` |
| Gnosis | `0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83` |
| BSC | `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` |
| Moonbeam | `0x931715FEE2d06333043d11F658C8CE934aC61D0c` |
| Mode | `0xd988097fb8612cc24eeC14542bC03424c656005f` |
| Mantle | `0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9` |

### LayerZero DVN addresses (in layerzero.config.ts):
| Chain | DVN |
|-------|-----|
| Arbitrum | `0x23DE2FE932d9043291f870324B74F820e11dc81A` |
| zkSync | `0x620A9DF73D2F1015eA75aea1067227571A4dE1b5` |
| Scroll | `0xbe0d08a85EeBFCC6eDA0A843521f7CBB1180D2e2` |

### Key OFT files on VPS:
```
/home/cash/Cashly/contracts/MyOFTAdapter.sol    — adapter contract source
/home/cash/Cashly/contracts/MyOFT.sol           — OFT contract
/home/cash/Cashly/deploy/MyOFTAdapter.ts        — Hardhat deploy script
/home/cash/Cashly/layerzero.config.ts           — peer connections (zkSync+Scroll wired)
/home/cash/Cashly/hardhat.config.ts             — networks + USDC token addresses
/home/cash/Cashly/deployments/{chain}/          — deployed addresses per chain
/home/cash/Cashly/tasks/sendOFT                 — manual send task for testing
/home/cash/Cashly/test_peers.js                 — peer verification script
/home/cash/Cashly/test_oft_contracts.js         — contract tests
```

### Deploy a new chain:
```bash
cd /home/cash/Cashly
npx hardhat deploy --network bsc-mainnet   # or celo-mainnet, gnosis-mainnet, etc.
```

### Wire peers after deployment:
```bash
cd /home/cash/Cashly
npx hardhat lz:oapp:wire --oapp-config layerzero.config.ts
```

---
*Related: [[Neural Net/Claude Memory/Architecture]] · [[Neural Net/Claude Memory/Database]] · [[Neural Net/Claude Memory/Memetropolis Intelligence]] · [[Neural Net/Claude Memory/V2 Feature Set & Marathons]] · [[Neural Net/Claude Memory/Deploy History]] · [[transactions]] · [[deposit_addresses]] · [[RPC URLS]]*
