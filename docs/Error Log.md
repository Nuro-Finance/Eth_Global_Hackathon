3/14/2026

# Cashly Deployment Error Log

**Session Date:** March 14, 2026  
**Engineer:** RichardTheBruce + Claude

---

## Error 1: Solana Private Key Type Mismatch

**File:** `src/solana-bridge.ts`  
**Error:** `TS2345: Argument of type 'Buffer' is not assignable to parameter of type 'Uint8Array<ArrayBufferLike>'`  
**Cause:** Node's `Buffer.from()` returns a Buffer, which TypeScript's strict mode does not accept where `Uint8Array` is expected by `@solana/web3.js@1.98.4`.  
**Fix:** Wrap with `Uint8Array.from(Buffer.from(...))` to explicitly convert.

---

## Error 2: Duplicate Keys in config.ts

**File:** `src/config.ts`  
**Error:** TypeScript duplicate identifier errors on `SOLANA_RPC_URL`, `SOLANA_PRIVATE_KEY`, `CIRCLE_API_KEY`.  
**Cause:** Keys were added twice during PowerShell heredoc commands that partially succeeded.  
**Fix:** Manually removed the duplicate block at the bottom of the config object, keeping the first occurrence and adding `USDC_SOLANA` alongside it.

---

## Error 3: PM2 Crash Loop (Express 5 exit)

**File:** `src/index.ts`  
**Error:** PM2 process showing 500+ restarts, never stabilizing.  
**Cause:** Express 5 `app.listen()` resolves and exits without keeping the process alive unless the server instance is captured. Also missing global error handlers caused silent crashes.  
**Fix:**

typescript

```typescript
const server = app.listen(CONFIG.PORT, () => { ... })
server.on('error', (err) => { console.error('Server error:', err) })
process.on('uncaughtException', (err) => { console.error('Uncaught:', err) })
process.on('unhandledRejection', (err) => { console.error('Unhandled:', err) })
```

---

## Error 4: PM2 Running as Root (Ownership Issue)

**Error:** `git pull` and PM2 operations failing due to file ownership conflicts.  
**Cause:** PM2 was started as root, but the repo was owned by the `cash` user.  
**Fix:** Killed root PM2 process (`sudo kill <pid>`), restarted PM2 as `cash` user, set up systemd autostart with `pm2 startup systemd -u cash --hp /home/cash`.

---

## Error 5: Alchemy Gas Policy Wrong API Key

**File:** `src/gas.ts`  
**Error:** Gas funding silently failing. Log showed "Alchemy gas sponsorship failed, falling back to direct funding" but direct funding also failed due to insufficient deployer balance.  
**Cause 1:** `gas.ts` was using `OWENS_API_KEY` as the Alchemy Authorization header instead of the Alchemy API key.  
**Cause 2:** The Alchemy Gas Manager API (`/gasManager/policy/{id}/fund`) is for UserOps (account abstraction), not direct ETH transfers. It was returning 200 but doing nothing.  
**Fix:** Rewrote `gas.ts` to skip Alchemy entirely and fund directly from the deployer wallet using ethers `wallet.sendTransaction()`.

---

## Error 6: Deployer Wallet Insufficient ETH on Ethereum

**Error:** `insufficient funds for gas * price + value: have 701118719278312 want 5000000000000000`  
**Cause:** Deployer wallet `0x27FbEAD2B527AaDAf4EA7B3Af065244A3964ECBC` had ~0.0007 ETH on Ethereum mainnet, needed 0.005 ETH to fund a deposit address.  
**Fix:** Funded deployer with 0.01 ETH on Ethereum mainnet.

---

## Error 7: Wormhole SDK parseAddress Static Method Error

**File:** `src/solana-bridge.ts` (original VPS version)  
**Error:** `TS2576: Property 'parseAddress' does not exist on type 'Wormhole<"Mainnet">'. Did you mean to access the static member 'Wormhole<"Mainnet">.parseAddress' instead?`  
**Cause:** VPS had a different version of `solana-bridge.ts` using the Wormhole SDK instead of Circle's API. The SDK API changed between versions and `parseAddress` moved to a static method.  
**Fix:** Replaced Wormhole SDK entirely with Circle's REST API approach, then later replaced again with the Circle CCTP V2 on-chain approach.

---

## Error 8: LZ V1 vs V2 ABI Mismatch

**File:** `src/bridge.ts`  
**Error:** `estimateSendFee` call reverting on Ethereum OFT contract.  
**Cause:** `bridge.ts` was calling LZ V1 functions (`estimateSendFee`, `sendFrom`) but deployed contracts use LZ V2 (`quoteSend`, `send`).  
**Fix:** Updated ABI to V2 functions. Then discovered the deeper issue that LZ V2 EID for Base is `30184`, not `184`.

---

## Error 9: Wrong LayerZero V2 Endpoint ID

**File:** `src/bridge.ts`  
**Error:** `estimateSendFee` / `quoteSend` reverting despite correct ABI.  
**Cause:** `LZ_CHAIN_IDS[8453]` was hardcoded as `184` (LZ V1 chain ID for Base). LZ V2 uses endpoint IDs, Base V2 Mainnet EID is `30184`.  
**Diagnosis:** Confirmed with `node -e "const {EndpointId} = require('@layerzerolabs/lz-definitions'); console.log(EndpointId.BASE_V2_MAINNET)"` → `30184`.  
**Fix:** `sed -i 's/8453: 184,/8453: 30184,/'`

---

## Error 10: LayerZero OFT Architecture Incompatibility

**Root Cause (Architectural):** After fixing the EID, `quoteSend` still reverted. Investigation revealed that the Ethereum `MyOFT` is a **synthetic OFT** that can only bridge tokens it has minted. It does not hold or burn real USDC. Real USDC deposited to an Ethereum address cannot be bridged via LayerZero because the OFTAdapter hub is on Base, not Ethereum. The flow would need to go Base → Ethereum (not the other direction).  
**Decision:** Abandon LayerZero for the EVM bridge route entirely. Switch to Circle CCTP V2.

---

## Error 11: Circle REST API 403 (Wrong Environment)

**File:** `src/bridge.ts` (CCTP REST attempt)  
**Error:** `403 Forbidden. errId: cd702b7a...`  
**Cause:** Using a `TEST_API_KEY:...` (sandbox key) against `api.circle.com` (production endpoint).  
**Fix:** Switch to `api-sandbox.circle.com/v1` for sandbox keys.

---

## Error 12: Circle REST API 401 (Malformed Key)

**Error:** `malformed authorization. Missing API key in authorization header`  
**Cause:** After stripping `TEST_API_KEY:` prefix, the remaining key `id:secret` was valid format but the wrong environment. Also `Authorization: CONFIG.CIRCLE_API_KEY` without `Bearer` prefix.  
**Fix:** Restore full key format `TEST_API_KEY:id:secret` and use `Bearer ${CONFIG.CIRCLE_API_KEY}`.

---

## Error 13: Circle REST API Does Not Support Blockchain-to-Blockchain Transfers

**Error:** `code: 2007 - A transfer from the provided source to the provided destination is not supported`  
**Root Cause (Architectural):** Circle's `/v1/transfers` REST endpoint is for moving funds between **Circle wallets** (custodial accounts), not for initiating on-chain CCTP burns between external blockchain addresses. This is a fundamental API misuse.  
**Fix:** Switch to on-chain CCTP V2 contracts directly (`depositForBurn` on `TokenMessengerV2`).

---

## Error 14: CCTP V2 Missing idempotencyKey

**Error:** `code: 2, message: 'Invalid entity. idempotencyKey must not be null'`  
**Cause:** Circle's REST API (used briefly before discovering the architectural issue above) requires an `idempotencyKey` field in the request body.  
**Fix:** Added `idempotencyKey: require("crypto").randomUUID()` to the request body.

---

## Error 15: CCTP V2 depositForBurn insufficient_fee

**File:** `src/bridge.ts`  
**Error:** Iris API returning `status: pending_confirmations, delayReason: insufficient_fee`  
**Cause:** Called `depositForBurn` with `minFinalityThreshold: 1000` (Fast Transfer) and `maxFee: 0`. Fast Transfer requires a non-zero fee (minimum 1 bps). Standard Transfer (`minFinalityThreshold: 2000`) has zero fee.  
**Fix:** Changed `minFinalityThreshold` from `1000` to `2000` for standard (free) transfers.

---

## Error 16: Wrong CCTP Ethereum Source Domain in Iris API

**File:** `src/bridge.ts`  
**Error:** `Message not found for provided parameters` from Iris API.  
**Cause:** Iris V2 API endpoint is `GET /v2/messages/{sourceDomain}?transactionHash={hash}`. Ethereum's CCTP domain ID is `0`, not `1`. We were querying domain `1` (Avalanche).  
**Fix:** Changed `IRIS_API` constant to use domain `0` for Ethereum source.

---

## Error 17: receiveMessage Revert on Base

**Error:** `transaction failed` with status 0 on Base when calling `receiveMessage`.  
**Cause:** Circle auto-relays standard transfers after attestation. By the time we called `receiveMessage` manually, the nonce was already consumed by Circle's relayer. The USDC had already been minted.  
**Discovery:** Owen's Base contract balance confirmed 17.55 USDC received.  
**Fix:** Removed the manual `receiveMessage` step entirely. Circle handles relay automatically for standard transfers with `minFinalityThreshold: 2000`.

---

## Error 18: Iris API Attestation Timeout (60 attempts)

**File:** `src/bridge.ts`  
**Error:** `Timed out waiting for attestation`  
**Cause:** Ethereum standard transfer finality takes 13-19 minutes. The polling loop was set to 60 attempts × 10 seconds = 10 minutes maximum.  
**Fix:** Increased to 120 attempts (20 minutes maximum).

---

## Error 19: Circle SDK getProvider Parameter

**File:** `src/bridge.ts` (CCTP V2 SDK attempt)  
**Error:** `TS2353: Object literal may only specify known properties, and 'rpcUrl' does not exist in type 'CreateEthersAdapterFromPrivateKeyParams'`  
**Cause:** `@circle-fin/adapter-ethers-v6` adapter expects `getProvider: () => provider` not `rpcUrl: string`.  
**Fix:** Changed adapter construction to use `getProvider: () => new ethers.providers.JsonRpcProvider(rpcUrl) as any`.

---

## Error 20: BridgeResult Missing burnTx/mintTx Properties

**File:** `src/bridge.ts` and `src/solana-bridge.ts`  
**Error:** `TS2339: Property 'burnTx' does not exist on type 'BridgeResult'`  
**Cause:** `BridgeResult` from `@circle-fin/provider-cctp-v2` does not have `burnTx`/`mintTx` top-level properties. Transaction hashes are nested in `result.steps[]` where each step has a `method` (`'approve'`, `'burn'`, `'mint'`) and optional `txHash`.  
**Fix:**

typescript

```typescript
const burnStep = result.steps.find((s: any) => s.method === "burn")
const mintStep = result.steps.find((s: any) => s.method === "mint")
return mintStep?.txHash || burnStep?.txHash || "unknown"
```

---

## Error 21: Deposit Address Lost on Server Restart

**File:** `src/index.ts`  
**Error:** Webhook processing failing with "No USDC balance at deposit address" after PM2 restart.  
**Cause:** Deposit addresses were stored in in-memory `Map<string, DepositRecord>` objects that are cleared on every restart.  
**Fix:** `db.ts` already had `saveDepositAddress`/`getDepositAddress` functions backed by PostgreSQL `deposit_addresses` table. Updated webhook handlers to use DB lookup: `const dbRecord = await getDepositAddress(userId, 'evm')`.

---

## Error 23: Circle SDK ethers v5/v6 Incompatibility
**Date:** 3-14-2026
**File:** `src/bridge.ts`
**Error:** `@circle-fin/provider-cctp-v2@1.4.0` — `supportsRoute()` always returned false; `getFunction is not a function`
**Cause:** SDK internally uses ethers v6 syntax incompatible with our ethers v5 project.
**Fix:** Replaced SDK entirely with raw CCTP V2 on-chain calls — `depositForBurn` on `TokenMessengerV2` + Iris API attestation polling.

---

## Error 24: LZ generateConnectionsConfig DVN Lookup Failure
**Date:** 3-14-2026
**File:** `layerzero.config.ts`
**Error:** `generateConnectionsConfig` fails silently for zkSync and Scroll — no DVN metadata registered
**Cause:** LZ toolbox DVN registry missing entries for these chains.
**Fix:** Bypassed `generateConnectionsConfig` entirely, called `setPeer()` directly on both adapter ends.

---

## Error 25: Nonce Collision on Sequential Arbitrum Transactions
**Date:** 3-14-2026
**Error:** `NONCE_EXPIRED — nonce too low`
**Cause:** Two transactions fired back-to-back using the same cached nonce from the provider.
**Fix:** Added explicit `provider.getTransactionCount("latest")` before every transaction send.

---

## Error 26: BSC Deployment ethers v5 Receipt Formatter Crash
**Date:** 3-14-2026
**Error:** `invalid address, value: ""` on `checkKey: "to"`
**Cause:** BSC returns `to: null` in contract creation receipts. ethers v5 formatter throws on null address.
**Fix:** Bypassed `hardhat-deploy` entirely, used `ContractFactory` directly, retrieved contract address from `getTransactionReceipt()` separately after the tx hash was confirmed.

---

## Error 27: hardhat-deploy EndpointV2 Not Found for Exotic Chains
**Date:** 3-14-2026
**Error:** `EndpointV2 deployment not found`
**Cause:** `withLayerZeroDeployments` maps network name → `endpointIdToNetwork(eid)` → SDK deployment folder. Network keys in `hardhat.config.ts` (`bsc`, `celo`, etc.) didn't match SDK folder names (`bsc-mainnet`, `celo-mainnet`, etc.).
**Fix:** Renamed all exotic network keys in `hardhat.config.ts` to match SDK folder naming convention.

---

## Error 28: Duplicate Network Key in hardhat.config.ts
**Date:** 3-14-2026
**Error:** `TS1117 — object literal cannot have multiple properties with the same name`
**Cause:** Legacy `bsc` entry without `oftAdapter` remained after new `bsc-mainnet` entry was added.
**Fix:** Removed legacy entry via Python string replace targeting the exact block.

---

## Error 29: Fee Routing to Deployer Instead of Multisig
**Date:** 3-14-2026
**File:** `src/bridge.ts`
**Error:** 5% fees accumulating in deployer wallet, not fee vault multisig
**Cause:** Fee sweep used `new ethers.Wallet(CONFIG.PRIVATE_KEY).address` instead of `CONFIG.FEE_VAULT_ADDRESS`
**Fix:** Single-line replacement. Existing fees (~$4.18) left in deployer — non-critical.

---

## Error 30: Sei USDC Address Invalid
**Date:** 3-14-2026
**Error:** `missing revert data in call exception; Transaction reverted without a reason string`
**Cause:** Sei USDC address `0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392` sourced from Circle SDK is not returning valid `balanceOf` responses.
**Fix:** Disabled Sei in `monitor.ts` pending manual USDC address verification on Sei EVM explorer.

---

## Error 31: Turbopack thread-stream Crash (130 Errors)
**Date:** 3-28-2026
**File:** Build system (Next.js 16 Turbopack)
**Error:** 130 build errors — Turbopack parsed `thread-stream` test files, LICENSE, README as JavaScript modules
**Cause:** Dependency chain: `@privy-io/react-auth → @walletconnect/* → pino → thread-stream`. Turbopack in Next.js 16 does not respect file extensions/package boundaries the way webpack does.
**Failed fixes:** `--no-turbopack` flag (doesn't exist in NJ16), deleting node_modules files, `serverExternalPackages`, `NEXT_PRIVATE_LOCAL_WEBPACK=true`, pino stub + resolveAlias
**Fix:** Downgraded Next.js 16.0.10 → 15.5.14 (`npm install next@15`). NJ15 uses webpack, bypasses Turbopack entirely.

---

## Error 32: NftJsonAsset Turbopack Panic
**Date:** 3-28-2026
**File:** Build system (Next.js 16 Turbopack)
**Error:** `Module not found: Can't resolve './test/thread-stream-not-found'` and multiple `NftJsonAsset` resolution failures
**Cause:** Same root cause as Error 31. Turbopack tried to resolve relative imports inside test files that were never meant to be bundled.
**Fix:** Same as Error 31 — Next.js downgrade.

---

## Error 33: Static Prerender Crash After NJ15 Downgrade
**Date:** 3-28-2026
**File:** `src/app/[locale]/layout.tsx`
**Error:** `Cannot destructure property 'status' of undefined` during static page generation
**Cause:** `"use client"` pages with auth hooks (`useSession()`) crash during prerender because there's no provider context during static generation. Next.js 15 webpack build attempted to statically prerender all dashboard pages.
**Fix:** Added `export const dynamic = "force-dynamic"` to `src/app/[locale]/layout.tsx` (Server Component). Cascades to all child routes, prevents static prerender.
**Lesson:** `export const dynamic` only works from Server Components — `"use client"` files silently ignore it.

---

## Error 34: useSession() Returns Undefined — Missing SessionProvider
**Date:** 3-28-2026
**File:** `src/features/auth/ProtectedRoute.tsx`, `src/providers/Providers.tsx`
**Error:** `TypeError: Cannot destructure property 'status' of '(0 , e.wV)(...)' as it is undefined.` — runtime crash on `/en/dashboard`
**Cause:** `ProtectedRoute` called `useSession()` from `next-auth/react`, which returned `undefined` during SSR AND client because no `SessionProvider` existed. Chris's `Providers.tsx` never included one. NextAuth v5's `useSession()` absolutely requires `SessionProvider`.
**Wrong fix 1:** Safe destructuring `session?.status ?? "loading"` → permanent loading state (useSession always undefined without provider)
**Wrong fix 2:** Switched to `usePrivy()` from `@privy-io/react-auth` → wrong auth system entirely (`NEXT_PUBLIC_PRIVY_APP_ID` not set, PrivyProvider disabled)
**Correct fix:** (1) Added `SessionProvider` from `next-auth/react` to `Providers.tsx` wrapping `ReduxProvider`. (2) Added `mounted` state guard to `ProtectedRoute` — `useState(false)` + `useEffect(() => setMounted(true))` to skip auth during SSR.

---

## Error 35: usePrivy() Without PrivyProvider
**Date:** 3-28-2026
**File:** `src/features/auth/ProtectedRoute.tsx`
**Error:** `usePrivy()` returned undefined or threw — stuck on permanent loading spinner
**Cause:** Attempted to use Privy auth (`usePrivy()` from `@privy-io/react-auth`) but `NEXT_PUBLIC_PRIVY_APP_ID` is not set in `.env.local` and `PrivyProvider` is disabled in `Providers.tsx`. The app uses NextAuth v5, not Privy.
**Fix:** Reverted to `useSession()` from `next-auth/react` after adding `SessionProvider` (see Error 34).
**Lesson:** Read `src/auth.ts` first — it clearly exports NextAuth v5 config `{ handlers, auth, signIn, signOut }`. Don't guess at auth systems.

---

## Error 36: sed Literal \n Insertion in navigation.config.tsx
**Date:** 3-28-2026
**File:** `src/layouts/Sidebar/config/navigation.config.tsx`
**Error:** Build failure — `{ {` double brace syntax error in nav config
**Cause:** `sed -i` on VPS inserted literal `\n` characters instead of actual newlines when adding the "Activate My Card" nav item. This created malformed TypeScript: `"activate-card": { {\n  id: ...`
**Fix:** Python script to replace the malformed section with clean, properly-formatted syntax.

---

## Error 37: Sidebar Route 404 — /dashboard/my-card-1
**Date:** 3-28-2026
**File:** `src/layouts/Sidebar/config/navigation.config.tsx`
**Error:** Clicking "My Card" in sidebar navigated to `/dashboard/my-card-1` which returned 404
**Cause:** Chris's `navigation.config.tsx` had `MY_CARD_1: "/dashboard/my-card-1"` but no `page.tsx` existed at `src/app/[locale]/dashboard/my-card-1/`. The `my-card-1` directory existed under `src/features/dashboard/` (feature components) but NOT under `src/app/[locale]/dashboard/` (route pages).
**Fix:** Changed `MY_CARD_1` route to `/dashboard/my-card-v2` (card dashboard). Added separate "Activate My Card" item pointing to `/dashboard/my-card` (KYC flow).

---

## Error 38: Login "Invalid Credentials" — Hardcoded Demo Auth
**Date:** 3-29-2026
**File:** `src/store/slices/authSlice.ts`, `src/features/auth/layouts/LoginLayout/hooks/useLogin.ts`
**Error:** Login always returned "Invalid credentials" for real users (`richardthebrucewayne@gmail.com` / `[REDACTED_PASSWORD]`)
**Cause:** `useLogin.ts` dispatched Redux `loginUser` thunk which checked hardcoded `DEMO_CREDENTIALS` (`admin@dashboard.com / Admin@123`) and NEVER called the real backend. NextAuth's `authorize()` in `auth.ts` already called real backend `POST /auth/login` — just wasn't being used from the frontend.
**Fix:** Rewrote `useLogin.ts` to call NextAuth `signIn("credentials", ...)` instead of Redux thunk. Redux `hydrateFromPrivyUser` still used for UI state sync.

---

## Error 39: 404 on /dashboard After Login
**Date:** 3-29-2026
**File:** `src/features/auth/layouts/LoginLayout/hooks/useLogin.ts`
**Error:** After successful login, `router.push("/dashboard")` navigated to 404 page
**Cause:** App uses `[locale]` routing — all dashboard routes require `/en/` prefix (e.g., `/en/dashboard`)
**Fix:** Changed `router.push("/dashboard")` → `router.push("/en/dashboard")`

---

## Error 40: Escaped Template Literal in useCardControls
**Date:** 3-29-2026
**File:** `src/features/dashboard/my-card-1/hooks/useCardControls.ts`
**Error:** All card controls API calls silently failed — limits, settings, details never persisted
**Cause:** Authorization header was `Bearer \${token}` (escaped template literal) instead of `Bearer ${token}`. The literal string `\${token}` was sent as the auth header, causing 401s that were silently caught.
**Fix:** `sed -i 's/Bearer \\${token}/Bearer ${token}/g'`

---

## Error 41: handleCardNameChange Writing to Wrong State Field
**Date:** 3-29-2026
**File:** `src/features/dashboard/cards/layouts/CardsGrid/hooks/useCardsState.ts`
**Error:** Card name changes appeared in UI but reverted on re-render — name didn't stick in React state
**Cause:** State update was `{ ...c, cardType: name }` instead of `{ ...c, cardName: name }`. Writing to `cardType` instead of `cardName`.
**Fix:** Changed to `{ ...c, cardName: name }` in both `setCards` and `setSelectedCard` callbacks.

---

## Error 42: CardsGrid Initializing Card Name from cardType
**Date:** 3-29-2026
**File:** `src/features/dashboard/cards/layouts/CardsGrid/index.tsx`
**Error:** Card name field showed "VISA" instead of actual saved card name
**Cause:** `cardName` useState initialized from `selectedCard.cardType` and useEffect synced from `selectedCard.cardType` — both should read `selectedCard.cardName` with fallback to `cardType`.
**Fix:** Changed both to `selectedCard.cardName || selectedCard.cardType || ""`

---

## Error 43: My Card Page Card Name Hardcoded
**Date:** 3-29-2026
**File:** `src/features/dashboard/my-card-v2/index.tsx`
**Error:** Card name on My Card page always showed "My Card" and didn't persist changes
**Cause:** `useState("My Card")` hardcoded, no fetch from DB, `setCardName` only updated local state
**Fix:** Changed to `useState("")`, added useEffect sync from `selectedCard.cardName || selectedCard.cardType || ""`, added `handleSaveCardName` function that PATCHes backend

---

## Error 44: Build Error — selectedCard Not in Scope in CardControlsPanel
**Date:** 3-29-2026
**File:** `src/features/dashboard/my-card-v2/index.tsx`
**Error:** TypeScript build error when passing `cardNumber={selectedCard?.cardNumber}` to CardDetails inside CardControlsPanel
**Cause:** `selectedCard` is defined in the parent component's scope but CardControlsPanel is a separate component that doesn't have access to it. Props would need to be threaded through.
**Fix:** Removed the props to fix build. CardDetails still uses placeholder data — needs proper prop drilling in future session.