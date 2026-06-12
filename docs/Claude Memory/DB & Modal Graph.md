# DB & Modal Relationship Graph — Cashly / Nuro Finance
> Updated: 2026-04-01
> Shared reference for Richard's Agent, Chris's Agent, and all engineers

---

## Vector Map: DB Tables → API → Frontend Components

```
┌─────────────────────────────────────────────────────────────────────┐
│                        POSTGRESQL (cashly)                          │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  ┌──────────────┐  │
│  │  users    │  │  cards   │  │card_controls  │  │card_alerts   │  │
│  │ (2 rows)  │  │ (3 rows) │  │  (3 rows)     │  │ (0 rows)     │  │
│  └─────┬─────┘  └────┬─────┘  └──────┬────────┘  └──────┬───────┘  │
│        │              │               │                   │          │
│  ┌─────┴──────────┐  │  ┌────────────┴───────┐  ┌───────┴───────┐  │
│  │card_transactions│  │  │  notifications     │  │  deposit_     │  │
│  │   (13 rows)     │  │  │  LIVE 2026-03-31   │  │  addresses    │  │
│  └────────┬────────┘  │  │  (8 rows)          │  │  (14 rows)   │  │
│           │           │  └────────┬────────────┘  └──────┬───────┘  │
│  ┌────────┴────────┐  │          │                       │          │
│  │  transactions   │  │          │                       │          │
│  │  (50 rows)      │  │          │                       │          │
│  │  bridge txns    │  │          │                       │          │
│  └─────────────────┘  │          │                       │          │
└───────────────────────┼──────────┼───────────────────────┼──────────┘
                        │          │                       │
                  ══════╪══════════╪═══════════════════════╪══════════
                  EXPRESS MIDDLEWARE (port 3000)
                  ══════╪══════════╪═══════════════════════╪══════════
                        │          │                       │
            ┌───────────┼──────────┼───────────────────────┼─────┐
            │  API ROUTES (nuro-routes.ts)                        │
            │                                                     │
            │  POST /auth/login ──────────────────── users        │
            │  POST /auth/register ───────────────── users        │
            │  GET  /users/me ────────────────────── users        │
            │  PATCH /users/profile ──────────────── users        │
            │  PATCH /users/notifications ────────── users        │
            │  POST /users/change-password ───────── users        │
            │                                                     │
            │  GET  /cards ───────────────────────── cards        │
            │  POST /cards ──────── cards + Issuer API (404)        │
            │  PATCH /cards/:id ─── cards (name/lock/gradient)    │
            │                                                     │
            │  GET  /cards/:id/controls ──────── card_controls    │
            │  PATCH /cards/:id/controls ─────── card_controls    │
            │  GET  /cards/:id/controls/alerts── card_alerts      │
            │                                                     │
            │  GET  /card-transactions ───────── card_transactions│
            │  *** NEEDS: POST /card-transactions (create) ***    │
            │                                                     │
            │  GET  /deposit-addresses ──────── deposit_addresses │
            │                                                     │
            │  GET  /kyc/status ─────────────── users.kyc_status  │
            │  POST /kyc/start ─────────────── Issuer KYC API       │
            │                                                     │
            │  GET  /notifications ─────────── notifications ✅   │
            │  PATCH /notifications/:id/read── notifications ✅   │
            │  POST /notifications/read-all ── notifications ✅   │
            └─────────────────────────────────────────────────────┘
                        │
                  ══════╪═════════════════════════════════════════
                  NEXT.JS FRONTEND (port 2800)
                  ══════╪═════════════════════════════════════════
                        │
            ┌───────────┼─────────────────────────────────────────┐
            │  FRONTEND — direct API calls via NEXT_PUBLIC_API_URL │
            │                                                      │
            │  Auth: NextAuth v5 → JWT in Authorization header     │
            │  GET/POST/PATCH cards                                │
            │  GET/PATCH controls                                  │
            │  GET card-transactions                               │
            │  GET deposit-addresses                               │
            │  GET/PATCH notifications ✅ NEW                      │
            └──────────────────────────────────────────────────────┘
```

---

## Modal/Component → DB Table Mapping

### MODALS (popup/overlay components)

| Modal ID | File | API Endpoint | DB Table(s) | Data Status | Required Fields |
|----------|------|-------------|-------------|-------------|-----------------|
| `ReloadModal` | my-card-v2/ReloadModal.tsx | `GET /deposit-addresses` | [[deposit_addresses]], [[users]] | REAL | chain, address |
| `DepositModal` | my-card-v2/DepositModal.tsx | None (UI only) | None | HARDCODED | token selection |
| `ReloadFlow` | my-card-1/components/ReloadFlow.tsx | `GET /deposit-addresses` | [[deposit_addresses]], [[cards]] | REAL | 20 chain names, addresses |
| `FirstFreezeNoticeDialog` | my-card-1/components/FirstFreezeNoticeDialog.tsx | None | None | STATIC UI | open, onClose |
| `KycTermsModal` | overview/components/KycTermsModal.tsx | `POST /kyc/start`, `GET /kyc/status` | [[users]] | REAL | kyc_status, kyc_url |
| `TransactionsModal` | cards/components/TransactionsModal.tsx | `GET /api/transactions` | [[card_transactions]] | NEEDS WIRING | card_id, transactions[] |
| `AddTransactionDialog` | transactions/components/AddTransactionDialog.tsx | `POST /card-transactions` | [[card_transactions]] | NOT BUILT | name, type, amount, category |
| `QuickTransferSheet` | overview/.../QuickTransferSheet/index.tsx | None yet | None yet | MOCK | recipient, amount, token |
| `TransactionFilterDialog` | transactions/components/TransactionFilterDialog.tsx | None (UI filter) | [[card_transactions]] (implicit) | HARDCODED UI | status, date range, category |
| `NotificationsModal` | layouts/Header/components/NotificationsModal.tsx | `GET /notifications` | [[notifications]] | LIVE ✅ | id, type, title, message, isRead |
| `NotificationsDropdown` | layouts/Header/components/NotificationsDropdown/ | **MOCK** → needs `GET /notifications` | [[notifications]] | NEEDS WIRING | id, title, message, isRead, type mapping |
| `CardLimits` | my-card-1/components/CardLimits.tsx | `GET/PATCH /cards/:id/controls` | [[card_controls]] | REAL ✅ | limits, usage, toggles |
| `CardControls (Alerts)` | my-card-1/components/CardLimits.tsx (alerts tab) | `GET /cards/:id/controls/alerts` | [[card_alerts]] | REAL (0 rows) | alert_type, message |

### HOOKS (data fetching)

| Hook | File | API Endpoint | DB Table(s) | Data Status |
|------|------|-------------|-------------|-------------|
| `useCardsState` | CardsGrid/hooks/useCardsState.ts | `GET/POST/PATCH /api/cards` | [[cards]] | REAL |
| `useCardControls` | my-card-1/hooks/useCardControls.ts | `GET/PATCH /api/cards/:id/controls` | [[card_controls]] | REAL |
| `useCardFreeze` | my-card-1/hooks/useCardFreeze.ts | `PATCH /api/cards/:id/freeze` | [[cards]] | REAL |
| `useCardData` | my-card-1/hooks/useCardData.ts | `GET /api/cards` | [[cards]] | REAL |
| `useTransactionsState` | TransactionsGrid/hooks/useTransactionsState.ts | `GET /api/transactions` | [[card_transactions]] | REAL |
| `useRecentTransactions` | my-card-v2/useRecentTransactions.ts | `GET /api/transactions` | [[card_transactions]] | REAL |
| `useAccountBalance` | CardSection/AccountInfo/hooks/useAccountBalance.ts | `GET /api/cards` | [[cards]] | REAL |
| `useKycPolling` | kyc-success/useKycPolling.ts | `GET /kyc/status` | [[users]] | REAL |

---

## DB Tables — See [[Schema & Tables/INDEX|Schema & Tables]] for full schemas

Quick summary:
- [[users]] (2 rows) — accounts, auth, KYC, notification prefs
- [[cards]] (3 rows) — virtual debit cards
- [[card_controls]] (3 rows) — spending limits, 1:1 with cards
- [[card_transactions]] (13 rows) — card spending history
- [[card_alerts]] (0 rows) — automated alerts
- [[notifications]] (8 rows) — user notification feed ✅ NEW
- [[transactions]] (50 rows) — bridge/deposit chain transactions
- [[deposit_addresses]] (14 rows) — EVM/Solana/Base deposit addresses

---

## What Chris Needs to Build Against

Chris's agent should reference [[Neural Net/Claude Memory/Modal Library]] for exact modal data requirements.

### Creating notifications from backend events:
```typescript
// When a card transaction occurs:
INSERT INTO notifications (user_id, type, title, message, metadata)
VALUES (userId, 'transaction', 'New Transaction', '$21.93 USDC deposited', '{"card_id":"...", "amount": 21.93}');

// When card is frozen:
INSERT INTO notifications (user_id, type, title, message, metadata)
VALUES (userId, 'security', 'Card Frozen', 'Your card ending 9587 was frozen', '{"card_id":"..."}');

// When KYC completes:
INSERT INTO notifications (user_id, type, title, message, metadata)
VALUES (userId, 'kyc', 'KYC Approved', 'Your identity verification is complete', '{}');
```

---

*Related: [[Neural Net/Claude Memory/Modal Library]] · [[Neural Net/Claude Memory/API Endpoints]] · [[Neural Net/Claude Memory/Architecture]] · [[Neural Net/Claude Memory/Frontend]] · [[Neural Net/Claude Memory/Database]] · [[Schema & Tables/INDEX|Schema & Tables]] · [[Neural Net/Claude Memory/Session Starter]]*
