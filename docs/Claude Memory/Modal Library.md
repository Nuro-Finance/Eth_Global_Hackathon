# Modal Library — Cashly / Nuro Finance
> Updated: 2026-04-02
> Reference for Richard's Agent, Chris's Agent, and all engineers
> Exactly which modal needs which data, what's built, what's missing

---

## Quick Reference Table

| Modal/Component ID      | File Path                                             | API Call(s)                                      | DB Table(s)                      | Data Status    |
| ----------------------- | ----------------------------------------------------- | ------------------------------------------------ | -------------------------------- | -------------- |
| ReloadModal             | `my-card-v2/ReloadModal.tsx`                          | `GET /deposit-addresses`                         | [[deposit_addresses]], [[users]] | REAL           |
| DepositModal            | `my-card-v2/DepositModal.tsx`                         | None (UI only)                                   | None                             | HARDCODED      |
| ReloadFlow              | `my-card-1/components/ReloadFlow.tsx`                 | `GET /deposit-addresses`                         | [[deposit_addresses]], [[cards]] | REAL           |
| FirstFreezeNoticeDialog | `my-card-1/components/FirstFreezeNoticeDialog.tsx`    | None                                             | None                             | STATIC UI      |
| KycTermsModal           | `overview/components/KycTermsModal.tsx`               | `POST /kyc/start`, `GET /kyc/status`             | [[users]]                        | REAL           |
| TransactionsModal       | `cards/components/TransactionsModal.tsx`              | `GET /api/transactions`                          | [[card_transactions]]            | NEEDS WIRING   |
| AddTransactionDialog    | `transactions/components/AddTransactionDialog.tsx`    | `POST /card-transactions`                        | [[card_transactions]]            | NOT BUILT      |
| QuickTransferSheet      | `overview/.../QuickTransferSheet/index.tsx`           | None yet                                         | None yet                         | MOCK           |
| TransactionFilterDialog | `transactions/components/TransactionFilterDialog.tsx` | None (client filter)                             | [[card_transactions]]            | HARDCODED UI   |
| NotificationsModal      | `layouts/Header/components/NotificationsModal.tsx`    | `GET /notifications`                             | [[notifications]]                | LIVE           |
| NotificationsDropdown   | `layouts/Header/components/NotificationsDropdown/`    | `GET /api/notifications` + PATCH/POST            | [[notifications]]                | LIVE           |
| CardLimits              | `my-card-1/components/CardLimits.tsx`                 | `GET/PATCH /cards/:id/controls`                  | [[card_controls]]                | REAL           |
| CardControls (Alerts)   | `my-card-1/components/CardLimits.tsx` (alerts tab)    | `GET /cards/:id/controls/alerts`                 | [[card_alerts]]                  | REAL (0 rows)  |
| LoginForm               | `features/auth/components/LoginForm/`                 | `POST /auth/login` (via NextAuth)                | [[users]]                        | WIRED          |
| SocialLoginButtons      | `features/auth/components/SocialLoginButtons/`        | None yet (OAuth providers not configured)         | social_auth (NEW)                | UI ONLY        |
| SimpleDateRangeDialog   | `components/SimpleDateRangeDialog.tsx`                | None (client-side)                                | None                             | UI ONLY        |
| TransactionDateRangeDialog | `components/TransactionDateRangeDialog.tsx`        | None (client-side filter)                         | [[card_transactions]]            | UI ONLY        |

---

## Modal Details

### ReloadModal
**Location:** `src/features/dashboard/my-card-v2/ReloadModal.tsx`
**Props:** `{ open: boolean, onClose: () => void }`
**Data Flow:**
1. Calls `GET /deposit-addresses` with Bearer token
2. Receives `{ evm: string, base: string | null, solana: string }`
3. Displays QR code for selected chain address
4. Token picker: USDC / USDT / DAI (added 2026-03-25)
**DB Tables:** [[deposit_addresses]], [[users]]
**Status:** REAL — fully wired
**Wired:** 2026-03-25

### DepositModal
**Location:** `src/features/dashboard/my-card-v2/DepositModal.tsx`
**Props:** `{ open: boolean, onClose: () => void }`
**Data Flow:** UI-only token selector, no API calls
**Status:** HARDCODED — needs backend integration later
**Blocked By:** No deposit endpoint designed yet. Future: should call `POST /deposits` or integrate with bridge monitor.

### ReloadFlow
**Location:** `src/features/dashboard/my-card-1/components/ReloadFlow.tsx`
**Props:** `{ open: boolean, onClose: () => void }`
**Data Flow:**
1. Calls `GET /deposit-addresses`
2. Displays 20+ real chain names (Ethereum, Arbitrum, Optimism, etc.) with deposit addresses
3. Copy-to-clipboard functionality (HTTP fallback via execCommand)
**DB Tables:** [[deposit_addresses]], [[cards]]
**Status:** REAL — fully wired
**Wired:** 2026-03-27 (chain names updated from fake "Chain 1, 2, 3")
**CAUTION:** Chris's CSS changes touch this file. Use `git checkout --ours` on conflicts.

### FirstFreezeNoticeDialog
**Location:** `src/features/dashboard/my-card-1/components/FirstFreezeNoticeDialog.tsx`
**Props:** `{ open: boolean, onClose: () => void }`
**Data Flow:** Static informational dialog, no API
**Status:** STATIC UI — safe to modify

### KycTermsModal
**Location:** `src/features/dashboard/overview/components/KycTermsModal.tsx`
**Props:** `{ open: boolean, onClose: () => void }`
**Data Flow:**
1. `POST /kyc/start` — triggers Issuer onboarding, returns KYC URL
2. `GET /kyc/status` — polls kyc_status from users table
3. Redirects to Sumsub verification iframe
4. `POST /kyc/webhook` — Issuer callback updates kyc_status in DB
**DB Tables:** [[users]] (kyc_status, kyc_url)
**Status:** REAL — fully wired
**Wired:** 2026-03-24 (webhook added), 2026-03-25 (banner URL fix)

### TransactionsModal
**Location:** `src/features/dashboard/cards/components/TransactionsModal.tsx`
**Props:** `{ open: boolean, onClose: () => void, cardId?: string }`
**Data Flow:**
1. Should call `GET /api/transactions?cardIds=...`
2. Renders transaction list filtered by card
**DB Tables:** [[card_transactions]] (13 rows — 12 seeded 2026-03-31)
**Status:** NEEDS WIRING — backend `GET /card-transactions` endpoint exists, frontend `useTransactionsState` hook is wired to `/api/transactions` proxy, but THIS specific modal component is not connected to the hook yet
**Chris TODO:** Wire this modal to `useTransactionsState` hook. The hook already works — just needs to be imported and called from this modal.
**Backend Available:** `GET /card-transactions` returns real data. Frontend proxy at `src/app/api/transactions/route.ts` forwards to backend.

### AddTransactionDialog
**Location:** `src/features/dashboard/transactions/components/AddTransactionDialog.tsx`
**Required Data Inputs:**
1. `name` (string) — merchant/description
2. `type` (string) — purchase / subscription / deposit / withdrawal
3. `amount` (number) — USD amount
4. `category` (string) — groceries / entertainment / transport / crypto / shopping / food
5. `cardId` (UUID) — which card
**DB Tables:** [[card_transactions]]
**Status:** NOT BUILT — needs `POST /card-transactions` backend endpoint
**What's Needed:**
- Backend: `POST /card-transactions` route in nuro-routes.ts that inserts into card_transactions table
- Frontend: Form UI with validation, calls POST endpoint
- Should respect card_controls limits (daily_limit, monthly_limit, per_transaction_limit)
**Chris TODO:** Build UI only with mock data. Backend endpoint pending from Richard's agent.

### QuickTransferSheet
**Location:** `src/features/dashboard/overview/.../QuickTransferSheet/index.tsx` (Chris's build branch)
**Component Suite:** (Chris built full component)
- `index.tsx` — main sheet
- `hooks/useTransferSubmit.ts` — **MOCK** (setTimeout 2000ms, no real API)
- `config/schema.ts` — Zod validation schema
- `components/FormFields.tsx`, `CurrencySelector.tsx`, `DatePicker.tsx`
**Chris's Zod Schema (`quickTransferSchema`):**
1. `recipient` (string) — min(2), recipient name
2. `accountNumber` (string) — regex `/^\d{10,20}$/`
3. `amount` (number) — min(1), max(1000000)
4. `currency` (enum) — "USD" | "GBP" | "JPY", optional
5. `transferDate` (Date) — optional scheduled date
6. `description` (string) — max(200), optional
**DB Tables:** `transfers` (DESIGNED, not yet created — see [[Neural Net/DB Contract Library]])
**API Route NEEDED:** `POST /transfers`
**Status:** MOCK — Chris's `useTransferSubmit.ts` does `await new Promise(resolve => setTimeout(resolve, 2000))` then `alert("Transfer initiated successfully!")`
**What's Needed:** Create `transfers` table on VPS, build `POST /transfers` endpoint with balance validation, rewrite `useTransferSubmit.ts` to call real API.

### TransactionFilterDialog
**Location:** `src/features/dashboard/transactions/components/TransactionFilterDialog.tsx`
**Props:** `{ open: boolean, onClose: () => void, onApply: (filters) => void }`
**Data Flow:** Client-side only — filters existing transaction list in memory
**Filter Fields:** status, date range, category, amount range
**DB Tables:** [[card_transactions]] (reads from already-fetched data, no separate API call)
**Status:** HARDCODED UI — works with whatever data is loaded. No backend work needed.

### NotificationsModal
**Location:** `src/layouts/Header/components/NotificationsModal.tsx`
**Props:** `{ open: boolean, onClose: () => void }`
**Data Flow:**
1. `GET /notifications` — fetches user's notifications (limit 50, ordered by created_at DESC)
2. `PATCH /notifications/:id/read` — marks individual notification as read
3. `POST /notifications/read-all` — marks all notifications as read
4. Badge count = count where is_read = false
**Required Data Inputs per notification:**
1. `id` (UUID)
2. `type` (string) — transaction / security / alert / system / kyc
3. `title` (string)
4. `message` (string)
5. `is_read` (boolean)
6. `action_url` (string, optional) — deep link to relevant page
7. `metadata` (JSONB, optional) — extra context (card_id, amount, etc.)
**DB Tables:** [[notifications]] (8 rows seeded 2026-03-31)
**Status:** LIVE — backend routes created 2026-03-31, table created 2026-03-31
**Indexes:** user_id, created_at DESC, partial index on unread (user_id + is_read WHERE is_read = false)

### NotificationsDropdown (Header Bell Icon)
**Location:** `src/layouts/Header/components/NotificationsDropdown/`
**Component Suite:**
- `index.tsx` — main dropdown with portal rendering
- `components/NotificationItem.tsx` — individual notification with check (mark read) and X (remove) buttons
- `components/NotificationList.tsx` — renders list, maxVisible=3 for dropdown
- `components/NotificationHeader.tsx` — header with "Mark All Read" and "See All" (opens NotificationsModal)
- `hooks/useNotifications.ts` — **USES MOCK DATA** — needs rewrite to call real API
- `types.ts` — frontend type definition
**Current Mock Type:**
```typescript
interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;        // e.g. "2 hours ago"
  timeShort: string;   // e.g. "2h"
  isRead: boolean;
  type: "info" | "warning" | "success" | "error";
}
```
**DB Type Mismatch:** DB uses `type: transaction | security | alert | system | kyc`. Frontend uses `type: info | warning | success | error`. Mapping needed:
```
transaction → success (green)
security   → warning (orange)
alert      → error (red)
system     → info (blue)
kyc        → info (blue)
```
**Status:** LIVE — wired 2026-04-02. Hook rewrites mock data to real `GET /api/notifications` with `mapDbTypeToFe()` type mapping and `getRelativeTime()` time computation. Mark-read via PATCH, mark-all via POST. Frontend proxy route at `src/app/api/notifications/route.ts`.

### CardLimits (Card Controls Panel)
**Location:** `src/features/dashboard/my-card-1/components/CardLimits.tsx`
**Props:** `{ cardId: string }`
**Data Flow:**
1. `GET /cards/:id/controls` — fetches spending limits (auto-upserts defaults if none exist)
2. `PATCH /cards/:id/controls` — saves updated limits
3. `GET /cards/:id/controls/alerts` — fetches alert history
4. Progress bars show `daily_used/daily_limit` and `monthly_used/monthly_limit`
**DB Tables:** [[card_controls]] (3 rows, 1:1 with cards), [[card_alerts]] (0 rows)
**Status:** REAL — fully wired 2026-03-27
**Note:** Backend auto-resets daily_used/monthly_used on period boundaries.
**Updated 2026-04-02:** Theme-tokenized — hardcoded Tailwind colors replaced with Chris's CSS custom properties (`var(--color-success)`, `var(--color-bg-input)`, `var(--color-warning)`, `var(--color-border-input)`, etc.). All DB wiring preserved. Now also rendered inside my-card-v2's CardControlsPanel (Limits tab).

### my-card-v2 Dashboard (Not a Modal — Page Component)
**Location:** `src/features/dashboard/my-card-v2/index.tsx`
**Layout:** 3-column grid (rebased 2026-04-02):
- **Left column:** FeaturedCard (selected card visual with SkinPicker) + QuickActions (Send, Receive/Top Up, Pay, More)
- **Center column:** UpcomingPayments (mock — wire later) + RecentTransactions (`useRecentTransactions` hook, real DB) + CardControlsPanel (Tabs: Limits/Details/Settings, real DB via `useCardControls`)
- **Right column:** SpendingChart (recharts, mock data — wire later) + AvailableCards (real cards from `useCardsState`, card face thumbnails via `resolveNuroCardFaceSrcFromGradient`)
**Key Hooks:** `useCardsState()` (real `/api/cards`), `useRecentTransactions()` (real DB), `useCardControls()` (real DB)
**Integrations:** ReloadModal (Quick Actions → Receive/Top Up), SkinPicker (PATCH `/api/cards/:id`), card name edit (PATCH `/api/cards/:id`)
**Status:** REAL — DB-wired with some mock subcomponents (SpendingChart, UpcomingPayments)
**Rebased:** 2026-04-02 — Chris's FE design merged with our backend data layer

### LoginForm (Chris's build branch)
**Location:** `src/features/auth/components/LoginForm/` (30 files in auth component suite)
**Component Suite:**
- `LoginForm/index.tsx` — main form
- `LoginForm/fields/` — email, password, remember-me field components
- `LoginForm/config.ts` — Zod schema + DEFAULT_CREDENTIALS (admin@dashboard.com / Admin@123, dev only)
- `hooks/useLoginForm.ts` — react-hook-form with zodResolver
- `DemoCredentialsCard/` — dev-only demo helper
**Chris's Zod Schema (`loginSchema`):**
1. `email` (string) — min(1), .email()
2. `password` (string) — min(6)
3. `rememberMe` (boolean)
**Auth Flow:** NextAuth `signIn("credentials", {email, password})` → `authorize()` → backend `POST /auth/login` → bcrypt compare → JWT
**DB Tables:** [[users]] (email, password_hash)
**Status:** WIRED — works with existing auth system. No new DB needed.

### SocialLoginButtons (Chris's build branch)
**Location:** `src/features/auth/components/SocialLoginButtons/`
**Components:** GoogleLoginButton, TelegramLoginButton, MoltbookLoginButton
**Assets:** `public/moltbook-lobster.png` (Moltbook logo)
**i18n:** `messages/auth/en.json`, `messages/auth/ar.json`
**Status:** UI ONLY — buttons render, onClick handlers are stubs
**DB Tables:** `social_auth` (DESIGNED, not yet created)
**What's Needed:** Create `social_auth` table, add GoogleProvider + TelegramProvider (custom) + MoltbookProvider (custom) to `src/auth.ts`, wire OAuth callbacks.
**Blocked By:** Moltbook API docs not available. Google OAuth client ID not configured. Telegram bot token not set.

### SimpleDateRangeDialog (Chris's build branch)
**Location:** `src/components/SimpleDateRangeDialog.tsx`
**Props:** `{ open, onClose, onApply: (range) => void }`
**Status:** UI ONLY — reusable date range picker, no DB interaction

### TransactionDateRangeDialog (Chris's build branch)
**Location:** `src/components/TransactionDateRangeDialog.tsx`
**Props:** `{ open, onClose, onApply: (range) => void }`
**Status:** UI ONLY — filters card_transactions by date range (client-side)

---

## Status Summary

| Status | Count | Modals |
|--------|-------|--------|
| REAL / LIVE | 7 | ReloadModal, ReloadFlow, KycTermsModal, NotificationsModal, NotificationsDropdown, CardLimits, CardControls (Alerts) |
| WIRED | 1 | LoginForm |
| NEEDS WIRING | 1 | TransactionsModal |
| NOT BUILT | 1 | AddTransactionDialog |
| MOCK | 1 | QuickTransferSheet |
| UI ONLY | 4 | SocialLoginButtons, SimpleDateRangeDialog, TransactionDateRangeDialog, DepositModal |
| HARDCODED UI | 1 | TransactionFilterDialog |
| STATIC UI | 1 | FirstFreezeNoticeDialog |
| **TOTAL** | **17** | |

### Priority Wiring Order:
1. ~~NotificationsDropdown~~ — ✅ DONE 2026-04-02
2. **TransactionsModal** — backend exists, hook exists, just needs modal→hook connection
3. **AddTransactionDialog** — needs backend `POST /card-transactions` first, then UI

---

## Modal Call Pattern (for Chris)

All modals follow this standard pattern:
```tsx
import { useState } from 'react';
import { SomeModal } from '@/features/dashboard/...';

export function ParentComponent() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>Open</button>
      <SomeModal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        // ...additional data props from hook
      />
    </>
  );
}
```

## Mock Data Pattern (Chris's agent)

When backend endpoint doesn't exist yet, use `NEXT_PUBLIC_USE_MOCK` toggle:
```tsx
const useMock = process.env.NEXT_PUBLIC_USE_MOCK === 'true';

async function fetchData() {
  if (useMock) {
    const { mockData } = await import('@/__mocks__/someData');
    return mockData;
  }
  const res = await fetch(`${API_URL}/endpoint`, { headers: authHeaders });
  return res.json();
}
```
Mock files go in `src/__mocks__/`. NEVER replace real fetch calls — always use the toggle.

---

*Related: [[Neural Net/Claude Memory/Frontend]] · [[Neural Net/Claude Memory/Database]] · [[Neural Net/Claude Memory/DB & Modal Graph]] · [[Neural Net/Claude Memory/Card Controls Schema]] · [[Neural Net/Claude Memory/API Endpoints]] · [[Neural Net/Claude Memory/Architecture]] · [[notifications]] · [[card_transactions]]*