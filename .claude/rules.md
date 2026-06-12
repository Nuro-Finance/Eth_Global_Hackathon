# AFI Project Rules
> These rules are absolute. They override default behavior. Follow them exactly.

## Commit Attribution
- **NEVER** credit Anthropic, Claude, or any external company in commits, co-author lines, or anywhere in the codebase
- The ONLY acceptable co-author: `Co-Authored-By: Mythos <mythos@nuro.finance>`
- Richard is the owner of ALL intellectual property

## Core Architecture Principle
- **Intent Layer records intent. Execution Layer moves real money. Never conflate the two.**
- Card balance comes from Issuer ONLY via `GET /users/:id/balances` → `spendingPower`
- We NEVER `UPDATE cards SET balance =` unless caching Issuer's response
- Issuer is the SOLE source of truth for card balance

## Version Constraints
- **DO NOT upgrade Next.js to v16** — Turbopack crashes on `thread-stream` (pino → @walletconnect → @privy-io/react-auth)
- **DO NOT upgrade ethers to v6** — entire codebase uses v5. ethers v6 is aliased as `ethers6` for Circle SDK only
- **DO NOT auto-update @layerzerolabs packages** — bridge contracts need manual E2E testing after any upgrade

## Code Quality
- Long-term stable, production-grade code. No quick patches for production.
- Ask: "Will this work at 10K users? 100K users?" If no, redesign before shipping.
- Test E2E before declaring done. Never ship code that "works for now."

## RPC & Cost
- Never use Alchemy RPCs without flagging cost first — monitor polls chains, each poll = Alchemy credits
- Use public RPCs (publicnode.com) for nonce lookups and balance checks
- Monitor is PAUSED by default (86400s) — only enable for testing

## Git Workflow
- Branch: `main` / `staging` on `nurostack/nuro-finance`
- Push to your GitHub org remote only
- Expansion features go on `Expansion_Testing` branch until E2E tested

## VPS
- IP: `74.50.109.203` | User: `cash`
- PM2 IDs change when processes are recreated — always verify with `pm2 list`
- Current: id 4 (middleware :3000), id 1 (frontend :2800)
