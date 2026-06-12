# Turnkey embedded wallets — Nuro MVP plan

**Status:** Planning (Privy auto-create **off**); Turnkey not integrated yet  
**Last updated:** 2026-06-02  
**Reassess:** After ~1,000 Turnkey wallets (billing) or when MVP wallet flows ship

### Current phase (next few days)

| Priority | Work |
|----------|------|
| **Now** | FE parity (5.4.26 / Pass A), responsiveness (Pass B when signed off) |
| **Later** | Backend testing, real API integration (Turnkey, Owen KYC, wizard wiring) |

**Turnkey dashboard:** Org set up (e.g. Nuro Finance root user, passkey authenticator). **No API key yet** — intentional; create when starting integration. Enable Auth Proxy + copy org ID / proxy config ID into `.env` at that time.

**Design intent:** Lower friction to get into the app, reduce cognitive load. Shell users explore the dashboard immediately; wallet, card, and funding flows layer on via an optional wizard and reminders—not at signup.

---

## Decision

Use **[Turnkey](https://turnkey.com)** embedded wallets for **optional** “Create Nuro Wallet” (user-initiated only, typically at KYC / withdraw setup). Turnkey free tier (**1k wallets**, 25 free signatures/month on Pay-as-you-go) is sufficient for MVP. Revisit vendor/pricing when approaching limits.

**Not using Privy** for embedded create long-term: Privy does not support full custom UI for recovery phrase / password flows; `useExportWallet()` opens Privy modals. Turnkey supports custom UX + API-first patterns better aligned with the Nuro create-wallet modal.

**Privy short-term:** Keep Privy for **login** (email, Google) and **connected external wallets** (`useConnectWallet`, `walletList`). **Do not** auto-mint Privy embedded wallets on login.

**Docs in IDE:** Turnkey MCP at `https://docs.turnkey.com/mcp` in `~/.cursor/mcp.json` (documentation search only — not live wallet API).

---

## User modes (what each tier can do)

| Mode | Wallet | KYC / Visa | Experience |
|------|--------|------------|------------|
| **Shell** | None | No | In dashboard immediately. Browse, settings, reminders. **Not** a web3 wallet—no send/swap/receive as “my wallet.” |
| **Connected, no KYC** | Yes, **verified** (SIWE / sign message or Turnkey session) | No | **Full web3 dashboard** (connect-only product slice). No real Visa. |
| **KYC complete** | Same wallet = **withdraw address** | Yes | Owen KYC → named/live card. Confirm addresses, optional fund, card spend. |

**Shell ≠ “Nuro wallet.”** Shell = account only until they connect.

**Connected + no KYC** is intentional: crypto dashboard only, not broken onboarding.

---

## End-to-end product flow

### Signup (minimal friction)

- **Email or Google** via existing auth (NextAuth + Privy login where configured).
- **No** embedded wallet on login (Privy `createOnLogin: "off"` — see below).
- **No** wallet connect required at signup.
- User lands in **dashboard as shell** right away—poke around, low cognitive load.

### Shell accounts (ongoing)

- Email + in-app reminders to connect wallet and complete onboarding.
- No deposit rail in the **wallet product** until a wallet is connected.
- **Cannot deposit to a card that doesn’t exist** — card funding happens after KYC when the card is named/live, not for shells browsing the dash.

### When user wants a real Visa card

Before Owen KYC:

1. **Connect existing wallet** — **primary CTA** (faster).
2. **Or create Nuro wallet on the spot** — Turnkey (secondary CTA); becomes withdraw address after verify.

**Withdraw address rules:**

- Set `payout_destination` only after **proof of control** — SIWE / `personal_sign` / Turnkey-signed session. **Not** a pasted address.
- Once withdraw wallet is verified and saved → proceed to **Owen KYC**.

After KYC:

- Card exists / is named.
- **Deposit address** comes from **Nuro API** (what we show the user). It may appear **async** after KYC/card setup—wizard and UI must poll/subscribe, not assume sync on KYC callback.
- **Withdraw address** already set at connect step.

### Create Nuro Wallet (explicit only)

- Modal in `src/features/dashboard/my-wallet/index.tsx` — not on login.
- Wire `creating` step to Turnkey when integrated (today: mock seed/address).
- `POST /api/wallets` to register address in DB after success.

---

## Onboarding wizard (dismissible)

Optional wizard to guide activation without blocking the dashboard. User **can close** anytime; progress persists in UI.

### Steps (order)

| Step | Required | Notes |
|------|----------|--------|
| 1. **Connect wallet** | Yes | Verify ownership → withdraw / payout address. Main CTA: connect existing. Secondary: create Nuro wallet (Turnkey). |
| 2. **KYC with Owen** | Yes (for real card) | Unlocks Visa / named card. |
| 3. **Confirm deposit + withdraw addresses** | Yes (for card users) | Confirm screen when addresses are known. **Withdraw:** from step 1. **Deposit:** from API—may load async; show loading until ready. |
| 4. **Make first deposit to card** | **No** | Optional CTA. User can skip. |

### Progress UI

- Show **3/4 complete** while steps 1–3 are done but user has **not** yet made first deposit **or** first debit.
- **100% / complete** when: `first_card_deposit OR first_card_debit` — not when the wizard is dismissed and not when step 4 is skipped.
- Step 4 label should read optional (e.g. “Optional: fund your card”) so skip ≠ failure.

### After wizard is closed

- Persistent progress chip (header / settings): e.g. `2/4 · Connect wallet` until deposit or debit.
- Shells still get email + in-app nudges.

### Engineering note (deposit address)

```text
onboarding_complete = first_card_deposit OR first_card_debit
```

Wizard checkboxes are UX hints; backend/events own completion. Deposit address: fetch from existing API; handle **async** (loading → confirm). Do not tie deposit UI only to KYC callback timing.

---

## Three address concepts (do not conflate)

1. **Card deposit address** — From **Nuro API**; shown after card/KYC path; may arrive async. Funds the **card**, not “connect to use web3.”
2. **Withdraw / payout address** — User-owned, **verified** at connect; `users.payout_destination`, `/api/users/payout-destination`.
3. **Active / trading wallet** — External connect (Privy/wagmi) **or** Turnkey embedded wallet for in-app send/swap.

**Owen server HD** (`generateDepositAddress` in `nuro-routes.ts`) — infrastructure/deposit rail for card product; separate from user self-custody Turnkey wallet.

---

## Privy configuration (done)

**File:** `src/providers/Providers.tsx`

```ts
embeddedWallets: {
  ethereum: { createOnLogin: "off" },
  solana: { createOnLogin: "off" },
},
```

- **Still works:** `walletList`, `loginMethods`, `useConnectWallet`, manual `useCreateWallet()` in explicit flows (e.g. create modal, ReloadModal Solana connect).
- **Stopped:** Embedded EVM/Solana wallet minted on every login.
- **Dashboard:** Mirror “create wallet on login” = off in Privy dashboard if enabled there.

---

## Current codebase (reference)

| Area | Location | Notes |
|------|----------|--------|
| Create wallet UI | `src/features/dashboard/my-wallet/index.tsx` | Modal flow; mock seed/address until Turnkey wired. |
| Privy provider | `src/providers/Providers.tsx` | `createOnLogin: "off"` ✅ |
| Connect wallet | `index.tsx`, `WalletsContent` | External wallets — keep. |
| Payout destination | `/api/users/payout-destination`, `nuro-routes.ts` | Withdraw address after verify. |
| Deposit addresses | `/api/deposit-addresses` | API returns what UI shows; async OK. |
| Address book | `POST /api/wallets` | Registry only. |
| Agent/vault HD | `nuro-routes.ts` | Custodial; not user self-custody. |

---

## What Turnkey provides

Source: [Embedded wallets overview](https://docs.turnkey.com/solutions/embedded-wallets/overview)

- **Embedded wallet** — keys in **TEE**; only **signatures** returned.
- **One sub-organization per end user** — isolated wallets, credentials, policies.
- **Auth** — passkey, email OTP, OAuth, SMS (Auth Proxy optional).
- **Custody** — non-custodial / hybrid for consumer path.
- **Custom UI** — EWK or direct API; no mandatory Privy-style modals for all flows.
- **Export** — encrypted bundles; recovery via passkey/OTP, not necessarily 12-word grid in our modal.

### React / Next (when integrating)

| Item | Detail |
|------|--------|
| Package | `@turnkey/react-wallet-kit` |
| Env | `NEXT_PUBLIC_ORGANIZATION_ID`, `NEXT_PUBLIC_AUTH_PROXY_CONFIG_ID` |
| Create wallet | `createWallet()` only on explicit user action (wizard / modal / KYC gate) |
| `createOnLogin` | **Off** (Turnkey equivalent) |
| Sub-org + ETH | `createSuborgParams` + `customWallet` at create time — [sub-org customization](https://docs.turnkey.com/solutions/embedded-wallets/integration-guide/react/sub-organization-customization) |
| Wagmi | [Wagmi connector](https://docs.turnkey.com/sdks/web3/wagmi) for send/swap |
| Registry | `POST /api/wallets` after create |

### Auth: Nuro vs Turnkey

| Concern | Owner |
|---------|--------|
| Signup login (email / Google) | NextAuth + Privy (current) |
| Connect external wallet | Privy + wagmi |
| Create Nuro wallet | Turnkey (future) |
| Deposit address display | Nuro API (async) |
| KYC | Owen |
| Payout / withdraw address | Nuro DB after verified connect |

---

## Target funnel (summary)

```
Sign up (email / Google)
  → Dashboard shell (no wallet required)

Optional onboarding wizard (dismissible)
  1. Connect + verify wallet → withdraw address  [primary: connect]
  2. Owen KYC → card named
  3. Confirm withdraw + deposit addresses (deposit from API, async OK)
  4. Optional: first deposit to card

Progress: 3/4 until first deposit OR first debit

Parallel product slices:
  • Connected, no KYC → web3 dashboard only
  • KYC + card → Visa + deposit/debit completion
```

---

## Billing (Turnkey)

| Plan | Wallets | Signatures |
|------|---------|------------|
| Free | Up to **1k** | First 25 free |
| Pay as you go | Up to 1k | 25/mo free, then ~$0.10/sig |
| Pro | Up to 2k | $0.05/sig |

Reassess before ~1k wallets.

---

## Alternatives considered

| Approach | Fit |
|----------|-----|
| **Turnkey** | ✅ Custom UI + API; MVP create-at-KYC |
| **Privy embedded** | ❌ Custom recovery UI; auto-create removed |
| **Client BIP-39** | ✅ Free; more security burden |
| **`POST /wallets` only** | Registry, not issuance |
| **Server HD for user wallets** | ❌ Custodial |

---

## Implementation checklist

### Done

- [x] Privy `createOnLogin: "off"` for ethereum + solana (`Providers.tsx`)

### Product / UX (when building)

- [ ] Onboarding wizard component (dismissible, persistent progress)
- [ ] SIWE / sign-message verify before saving `payout_destination`
- [ ] Connect wallet = primary CTA; create Nuro wallet = secondary at step 1 / KYC gate
- [ ] Async deposit address: loading state + poll until API returns
- [ ] Completion: `first_card_deposit OR first_card_debit` drives 4/4, not wizard close
- [ ] Shell reminders (email + in-app); no wallet deposit UI for shells
- [ ] Gate card deposit UI until card exists post-KYC

### Turnkey (when resuming)

- [ ] Turnkey org + Auth Proxy; env vars
- [ ] `@turnkey/react-wallet-kit` + `TurnkeyProvider`
- [ ] Create modal `creating` → `createWallet()`
- [ ] Wagmi connector for embedded signing
- [ ] `POST /api/wallets` on success

---

## Key doc links

- [Embedded wallets overview](https://docs.turnkey.com/solutions/embedded-wallets/overview)
- [Quickstart](https://docs.turnkey.com/solutions/embedded-wallets/quickstart)
- [Consumer wallet](https://docs.turnkey.com/solutions/embedded-wallets/embedded-consumer-wallet)
- [Integration guide overview](https://docs.turnkey.com/solutions/embedded-wallets/integration-guide/overview)
- [React getting started](https://docs.turnkey.com/solutions/embedded-wallets/integration-guide/react/getting-started)
- [Sub-organization customization](https://docs.turnkey.com/solutions/embedded-wallets/integration-guide/react/sub-organization-customization)
- [Export wallets](https://docs.turnkey.com/features/wallets/export-wallets)
- [Turnkey MCP](https://docs.turnkey.com/mcp)

---

## Open questions (defer)

- Replace Privy entirely vs Privy login/connect + Turnkey create-only.
- Solana at Turnkey create vs EVM-only MVP.
- Recovery UX in Nuro modal vs Turnkey passkey/OTP only.
- Turnkey Auth Proxy vs NextAuth-only for wallet creation auth.
