> ⚠️ SANITIZED FOR GIT — Credentials replaced with [REDACTED]. See .env files on VPS for real values.

# 🧠 Claude Memory — Cashly / Nuro Finance
> Last updated: 2026-03-28 (Session 3 complete)
> This folder is Claude's long-term memory for the project. Read INDEX.md first every session.

---

## 📁 File Directory

| File | Contents |
|------|----------|
| [[Architecture]] | Services, ports, PM2, env vars, repo paths |
| [[Database]] | Schema, known type quirks, useful queries |
| [[API Endpoints]] | All middleware routes, auth, request format |
| [[Frontend]] | Next.js structure, known bugs, component map |
| [[Bridge & Monitor]] | Deposit detection, CCTP bridge, LayerZero 2-step plan |
| [[Accounts & Test Users]] | Owen user IDs, test logins, JWT generation |
| [[Pending Tasks]] | What is broken, what is in progress, what is next |
| [[Deploy History]] | Every patch applied, what changed and when |
| [[Card Controls Schema]] | ⭐ NEW — Full DB schema + API spec for Card Controls panel |

---

## ⚡ Quick Context (Read Every Session)

### Two Services Running on VPS (74.50.109.203)
| PM2 ID | Name | Port | Repo |
|--------|------|------|------|
| 0 | cashly-middleware | 3000 | `/home/cash/Cashly` |
| 7 | cashly-frontend | 2800 | `/home/cash/nuro-finance-dashboard` |

### Restart Commands
```bash
pm2 restart 0   # middleware only
pm2 restart 7   # frontend only
pm2 restart all # both
pm2 logs 0 --lines 30 --nostream  # view middleware logs
```

### Database
```
postgresql://cashly:[REDACTED_DB_PASSWORD]@localhost:5432/cashly
```

### Key Rules
1. **Never use Alchemy RPCs without flagging cost first** — monitor polls chains, each poll = Alchemy credits
   ⚠️ **MONITOR IS CURRENTLY PAUSED** (86400s interval) — re-enable with: `sed -i 's/86400000/60000/' /home/cash/Cashly/src/monitor.ts && pm2 restart 0`
2. **Run commands via SSH on VPS** — not PowerShell locally
3. **Don't say "chain" unless referring to a blockchain component**
4. **Owen's Base contract accepts REAL USDC/USDT/DAI only** — no synthetics/bridged tokens
5. **cards.user_id is VARCHAR(36), not UUID type** — use text comparisons in SQL
6. **Frontend is on Next.js 15.5.14 — DO NOT upgrade to Next.js 16** — Turbopack crashes on `thread-stream` (pino → @walletconnect → @privy-io/react-auth). No known fix as of 2026-03-28.
7. **`export const dynamic = "force-dynamic"` is in `[locale]/layout.tsx`** — prevents static prerender of all dashboard pages. Do NOT remove or `useSession()` will crash during build.
8. **Auth is NextAuth v5 (`next-auth@5.0.0-beta.30`), NOT Privy** — `src/auth.ts` exports `{ handlers, auth, signIn, signOut }`. `ProtectedRoute` uses `useSession()` from `next-auth/react`. `SessionProvider` was added to `Providers.tsx` (required for v5). Privy env vars are NOT set — `PrivyProvider` is disabled in `Providers.tsx`.
9. **Never commit to `origin` (nurostack/nuro-finance-dashboard)** — only commit/push to `cashly` remote (`RichardTheBruce/Cashly`) branch `frontend`. We only PULL from nurostack.

### 🚨 Next Session Priorities (in order)
1. **Verify `navigation.config.tsx` syntax** — sed may have broken it in Session 3. Read the file, check for `{ {` or literal `\n`. If broken, rewrite cleanly. Then `npm run build`.
2. **Commit + push remaining VPS changes** — `Providers.tsx` (SessionProvider), `ProtectedRoute.tsx`, `navigation.config.tsx` are uncommitted on VPS. After verifying build: `git add` → `git commit` → `git push cashly frontend`
3. **Remove deprecated sections from my-card-v2** — user wants ONLY: card graphic, balance, reload/withdraw, Card Controls panel (Limits/Details/Settings tabs), Recent Transactions. Remove: upcoming payments, statistics sections if present.
4. **Backend: add `/card-transactions` endpoint** — frontend `useTransactionsState` hook IS wired to `/api/transactions` with auth token, falls back to mock data when not authenticated. Needs backend route in `nuro-routes.ts` serving real data from `card_transactions` table.
5. **Card display name on graphic** — currently shows Owen cardholder name, should show `card_name` from DB (or `users.full_name` as fallback)
6. **Fund deployer wallet (Arbitrum ETH)** — needed for CCTP gas on LZ→CCTP bridge route
7. **Re-enable bridge monitor** — `sed -i 's/86400000/60000/' /home/cash/Cashly/src/monitor.ts && pm2 restart 0`

### ⚡ Key OFT Adapter Files
| File | Purpose |
|------|---------|
| `/home/cash/Cashly/src/bridge.ts` | Two-step LZ+CCTP bridge — ALREADY CODED |
| `/home/cash/Cashly/layerzero.config.ts` | Peer connections — zkSync+Scroll wired, Celo+Gnosis+BSC missing |
| `/home/cash/Cashly/hardhat.config.ts` | Network + USDC token addresses for all chains |
| `/home/cash/Cashly/deployments/{chain}/MyOFTAdapter.json` | Deployed contract addresses |
| `/home/cash/Cashly/contracts/MyOFTAdapter.sol` | The adapter contract |
| `/home/cash/Cashly/deploy/MyOFTAdapter.ts` | Deploy script |

---

### Generate JWT for API Testing
```bash
TOKEN=$(cd /home/cash/Cashly && node -e "
const jwt = require('jsonwebtoken');
const secret = '[REDACTED_JWT_SECRET]';
console.log(jwt.sign(
  { id: 'db01a59c-a418-4da0-a4aa-fb032d500b04', email: 'richardthebrucewayne@gmail.com' },
  secret, { expiresIn: '2h' }
));
")
```
