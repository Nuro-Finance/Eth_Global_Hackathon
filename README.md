# Nuro — ETHGlobal NY 2026

**Nuro is a bank for AI agents** — a production dashboard (cards, agents, transactions, vault), not a hackathon template.

**One-liner:** Human verifies with World ID, executes a Uniswap swap on Base, and Arc splits one settlement into agent budget, card credit, and fee vault.

## Demo flow

1. Log in
2. Open **Agent Cards** or **My Card**
3. **Reload** → enter amount (Base / ETH)
4. **World ID** — owner attestation
5. **Uniswap** — wallet signs swap on Base → Basescan tx hash
6. **Arc** — settlement split on Arc testnet → Arc explorer tx hash
7. Success screen — both hashes + split breakdown (70% agent / 25% card / 5% fee)

Demo entry is **Cards → Reload** only.

## Partners

| Partner | Role |
|---------|------|
| **World ID** | Human attestation before funds move |
| **Uniswap** | Swap on Base (ETH → USDC) |
| **Arc** | Split settlement to agent / card / fee vault |

## Architecture

```
User (Cards → Reload)
        │
        ▼
   World ID verify          ← human attestation
        │
        ▼
   Uniswap swap (Base)      ← ETH → USDC, Basescan proof
        │
        ▼
   Arc split (testnet)      ← agent budget + card slice + fee vault
        │
        ▼
   Nuro success UI          ← both tx hashes + split breakdown
```

Uniswap runs on **Base (8453)**. Arc split runs on **Arc testnet (5042002)**. Two txs, one user journey.

## Integration status

| Integration | Location | Status |
|-------------|----------|--------|
| World ID gate | `WorldIdReloadGate.tsx`, `src/app/api/world/` | Wired — smoke test pending |
| Uniswap / Base swap | `ReloadSwapFunds.tsx`, `/api/quote/*` | Scaffolded — smoke test pending |
| Arc split | TBD (`scripts/` + contract) | Not built |

## Local dev

Requires [Doppler](https://doppler.com) project `nuro-ethglobal` / config `dev`.

```bash
cd nuro-ethglobal-hackathon
doppler setup --project nuro-ethglobal --config dev
pnpm install
pnpm dev        # Next.js → http://localhost:2800
pnpm dev:api    # Express API → http://localhost:3000
```

Scripts wrap Doppler — do not double-run `doppler run`. Optional: `pnpm seed:demo`.

Secrets stay in Doppler only — never commit `.env` files.

## Environment

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_APP_ID` | World app ID |
| `RP_ID` / `RP_SIGNING_KEY` | World IDKit |
| `NEXT_PUBLIC_WORLD_ACTION` | World action (default: `nuro-reload-verify`) |
| `UNISWAP_API_KEY` | Quote / routing |
| `ARC_RPC_URL` / `ARC_CHAIN_ID` | Arc testnet (`5042002`) |
| `ARC_USDC_ADDRESS` / `ARC_DEPLOYER_PRIVATE_KEY` | Arc split txs |
| `POSTGRES_URL` / `DATABASE_URL` | Postgres |
| `BACKEND_URL` | Next.js → Express proxy (prod) |

## Stack

- **Frontend:** Next.js (port 2800)
- **Backend:** Express (`src/index.ts`, port 3000)
- **Database:** Postgres

## Links

- **Live demo:** [ethglobal.nuro.finance](https://ethglobal.nuro.finance) (when deployed)
- **Branch:** `hackathon/ethglobal-ny-2026`

## License

MIT — see [LICENSE.md](./LICENSE.md)
