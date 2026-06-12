# 🖥️ Frontend — Nuro Finance Dashboard
> Last updated: 2026-03-28

## Repos & Deployment
```
Local repo:   /home/cash/nuro-finance-dashboard
GitHub:       RichardTheBruce/Cashly (remote: cashly, branch: frontend)
              ⚠️ NEVER commit to origin (nurostack/nuro-finance-dashboard) — only PULL from there
PM2 id:       7 (cashly-frontend)
Port:         2800
Framework:    Next.js 15.5.14 (App Router, [locale] routing)
              ⚠️ DO NOT upgrade to Next.js 16 — Turbopack crashes on thread-stream
Auth:         NextAuth v5 (next-auth@5.0.0-beta.30) — NOT Privy
```

## Auth System — NextAuth v5

**Config file**: `src/auth.ts` — exports `{ handlers, auth, signIn, signOut }`

**Providers** (in `src/auth.ts`):
- **Credentials (email/password)**: validates against Cashly middleware `POST /login`
- **Credentials (moltbook-bot)**: bot verification provider

**Critical components**:
| File | Role |
|------|------|
| `src/auth.ts` | NextAuth v5 config — Credentials providers, JWT/session callbacks |
| `src/app/api/auth/[...nextauth]/route.ts` | Next.js route handler (`export { GET, POST } from handlers`) |
| `src/providers/Providers.tsx` | `<SessionProvider>` wraps `<ReduxProvider>` — **REQUIRED** for `useSession()` |
| `src/features/auth/ProtectedRoute.tsx` | `useSession()` + mounted guard — wraps all dashboard pages |

**Key rules**:
1. `SessionProvider` from `next-auth/react` MUST wrap the app — without it `useSession()` returns `undefined`
2. `ProtectedRoute` uses `useState(false)` + `useEffect(() => setMounted(true))` to skip auth during SSR
3. Privy env vars are NOT set — `PrivyProvider` is disabled in `Providers.tsx`. Do NOT switch to `usePrivy()`
4. `export const dynamic = "force-dynamic"` in `src/app/[locale]/layout.tsx` prevents static prerender — do NOT remove

**Env vars** (in `.env.local`):
```
NEXTAUTH_SECRET=e49e5d04ad7707dda1bd8dd4ff653b4f582a3ca051b5d41e3817cd89dd0b902b
AUTH_SECRET=04d059413eb9fe4dd95c36bf78184efce0412c55edd53149c97d33c3f9da7dd5
```

## Git Remotes & Rules
```
origin  → https://github.com/nurostack/nuro-finance-dashboard  ← PULL ONLY, never commit
cashly  → https://github.com/RichardTheBruce/Cashly             ← COMMIT HERE, branch: frontend
```
- **Strategy**: Cherry-pick Chris's new files from `origin/main`, keep our patches, commit to `cashly/frontend`
- Chris (Ownable / helloeccho@proton.me) pushes to `origin/main`

## Git State (as of 2026-03-28)
- Session 2: Pulled Chris's visual redesign (commit `427f0a7`) — CreditCard PNGs, TransactionsGrid, sidebar overhaul
- Session 3: Downgraded Next.js 16→15, added SessionProvider, fixed ProtectedRoute, fixed sidebar routing
- **First commit pushed**: `8f175cb` → `cashly/frontend` (NJ15 downgrade + force-dynamic + config cleanup)
- **Uncommitted on VPS**: `Providers.tsx`, `ProtectedRoute.tsx`, `navigation.config.tsx`

---

## Component Map

### Key Pages
```
src/app/[locale]/
  ├── layout.tsx              ← Server Component — has `export const dynamic = "force-dynamic"`
  └── dashboard/
      ├── layout.tsx          ← KYC polling + KycSuccessOverlay (patched)
      ├── overview/page.tsx   ← Overview page
      ├── my-card/page.tsx    ← Activate My Card (KYC activation flow)
      ├── my-card-v2/page.tsx ← My Card dashboard (balance, controls, transactions)
      └── settings/           ← Settings pages
```

### Key Feature Components
```
src/features/dashboard/
  ├── overview/components/
  │   ├── CardSection/index.tsx   ← Freeze toggle + FROZEN overlay (patched)
  │   └── KycBanner.tsx           ← Fixed URL to use NEXT_PUBLIC_API_URL (patched)
  ├── my-card-v2/
  │   ├── index.tsx               ← Card list + freeze toggle (patched)
  │   ├── ReloadModal.tsx         ← Chain picker + deposit addresses (patched)
  │   └── DepositModal.tsx        ← Token selector USDC/USDT/DAI (patched)
  ├── my-card-1/                  ← Chris's card feature dir (has CardLimits, CardControls)
  │   └── components/CardLimits.tsx ← Real data from /cards/:id/controls API
  ├── transactions/layouts/TransactionsGrid/
  │   └── hooks/useTransactionsState.ts ← Wired to /api/transactions — falls back to mock without auth
  ├── kyc-success/
  │   ├── KycSuccessOverlay.tsx   ← Post-KYC success animation (created)
  │   └── useKycPolling.ts        ← Polls /kyc/status every 8s (created)
  └── settings/                   ← All settings content (patched)
```

### Sidebar & Routing
```
src/layouts/Sidebar/config/navigation.config.tsx
  ├── "My Card"          → /dashboard/my-card-v2   (card dashboard)
  ├── "Activate My Card" → /dashboard/my-card       (KYC activation)
  └── other items        → /dashboard/overview, /dashboard/settings, etc.
```

### Auth Components
```
src/providers/Providers.tsx              ← SessionProvider + ReduxProvider
src/features/auth/ProtectedRoute.tsx     ← useSession() + mounted guard
src/auth.ts                              ← NextAuth v5 config
src/app/api/auth/[...nextauth]/route.ts  ← Auth route handler
```

---

## Mock Data Warning

Chris's visual redesign (Session 2, commit `427f0a7`) shipped with **mock data everywhere**:

| Component | Issue | Real data path |
|-----------|-------|----------------|
| `transactionSlice.ts` `fetchTransactions` | `// Simulate API call` — returns `demoTransactions` after fake 800ms delay | NOT wired to real API |
| `useTransactionsState` hook | IS properly wired to `/api/transactions` with Bearer auth | Works once user is authenticated via NextAuth |
| Recent Transactions on my-card-v2 | Shows "Pierre DC", "Alessandro VN", "Netflix" etc. | Needs authenticated session + backend `/card-transactions` endpoint |

**To get real data**: User must log in via NextAuth → `session.accessToken` populated → `useTransactionsState` calls `/api/transactions` → proxies to backend `/card-transactions` → returns real data.

---

## Known Bugs / Issues

### 1. Base Chain Address Not Showing in Reload Modal
**Status**: In progress
**Symptom**: When user selects Base network, no deposit address appears → button stays grey
**Cause**: `addresses.base` is null if Issuer hasn't provisioned a contract for that user

### 2. Copy Button Static (non-QR steps)
**Status**: Partially done — copy works in QR step only

### 3. navigation.config.tsx Possible Syntax Error
**Status**: Needs verification — sed insertion in Session 3 may have broken syntax
**Action**: Read file, verify clean, rebuild

### 4. Uncommitted VPS Changes
**Status**: Providers.tsx, ProtectedRoute.tsx, navigation.config.tsx not yet committed
**Action**: Verify nav config → build → commit → push to `cashly/frontend`

### 5. Card Display Name
**Status**: Card visual shows Issuer cardholder name, should show `card_name` from DB

---

## Patches Applied to Frontend (chronological)

| Date | File | Change |
|------|------|--------|
| 2026-03-22 | settings/* | Wire settings to real API endpoints |
| 2026-03-23 | layout.tsx | Add KYC polling + success overlay |
| 2026-03-24 | ReloadModal.tsx | Add USDC/USDT/DAI token picker |
| 2026-03-24 | DepositModal.tsx | Add USDC/USDT/DAI token picker |
| 2026-03-24 | my-card-v2/index.tsx | Add freeze/unfreeze toggle with label |
| 2026-03-24 | CardSection/index.tsx | Add freeze overlay + toggle on Overview |
| 2026-03-25 | KycBanner.tsx | Fix API URLs to use NEXT_PUBLIC_API_URL |
| 2026-03-26 | CardSection/index.tsx | Optional props for my-card-1 compatibility |
| 2026-03-26 | navigation.config.tsx | Wire my-card-1 into sidebar |
| 2026-03-27 | CardLimits.tsx | Real data from /cards/:id/controls API |
| 2026-03-28 | package.json | Next.js 16→15 downgrade |
| 2026-03-28 | [locale]/layout.tsx | `export const dynamic = "force-dynamic"` |
| 2026-03-28 | next.config.js | Remove resolveAlias, keep serverExternalPackages |
| 2026-03-28 | Providers.tsx | Add SessionProvider (NextAuth v5) |
| 2026-03-28 | ProtectedRoute.tsx | Rewrite: useSession() + mounted guard |
| 2026-03-28 | navigation.config.tsx | my-card-v2 routing + Activate My Card |

---

## Rebuild Command
```bash
cd /home/cash/nuro-finance-dashboard && npm run build && pm2 restart 7
# OR just restart (uses last build):
pm2 restart 7
```

---
*Related: [[Neural Net/Claude Memory/Architecture]] · [[Neural Net/Claude Memory/API Endpoints]] · [[Neural Net/Claude Memory/Modal Library]] · [[Neural Net/Claude Memory/DB & Modal Graph]] · [[Neural Net/Claude Memory/Session Starter]] · [[Neural Net/Claude Memory/Deploy History]]*

