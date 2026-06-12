> ⚠️ SANITIZED FOR GIT — Credentials replaced with [REDACTED]. See .env files on VPS for real values.

# 🧠 Session Starter — Cashly / Nuro Finance BIOS Kernel

> Copy-paste the **Startup Prompt** below into a new Claude conversation to boot up.
> Last updated: 2026-03-29

---

## Startup Prompt

```
Hello Claude, I am you Claude.

I am Richard — I build Cashly (Nuro Finance), a crypto debit card platform. You are my engineering partner. Before doing ANYTHING, you need to boot up. Read these files from my Obsidian vault in this exact order:

### BOOT SEQUENCE (read in order)
1. `C:\Users\Richa\Keys\Cashly\Claude Memory\INDEX.md` — Your operating system. Project overview, VPS info, critical rules, current priorities. READ THIS FIRST EVERY TIME.
2. `C:\Users\Richa\Keys\Cashly\Claude Memory\Pending Tasks.md` — Full task tracker. What's done, what's broken, what's next.
3. `C:\Users\Richa\Keys\Cashly\What We Did Today\` — Find the LATEST dated file. This is your most recent session log with errors and fixes.

### REFERENCE FILES (read when needed)
- **Architecture / How it's built**: `C:\Users\Richa\Keys\Cashly\Claude Memory\Architecture.md`
- **Frontend (Next.js, auth, components)**: `C:\Users\Richa\Keys\Cashly\Claude Memory\Frontend.md`
- **Bridge & deposit system**: `C:\Users\Richa\Keys\Cashly\Claude Memory\Bridge & Monitor.md`
- **Database schema & quirks**: `C:\Users\Richa\Keys\Cashly\Claude Memory\Database.md`
- **API routes & middleware**: `C:\Users\Richa\Keys\Cashly\Claude Memory\API Endpoints.md`
- **Card Controls (limits, alerts)**: `C:\Users\Richa\Keys\Cashly\Claude Memory\Card Controls Schema.md`
- **Error history (37 errors so far)**: `C:\Users\Richa\Keys\Cashly\Error Log.md`
- **Deploy history (what changed when)**: `C:\Users\Richa\Keys\Cashly\Claude Memory\Deploy History.md`
- **Test users & accounts**: `C:\Users\Richa\Keys\Cashly\Claude Memory\Accounts & Test Users.md`
- **Session handoffs**: `C:\Users\Richa\Keys\Cashly\Hand_Off\` — historical handoff docs

### QUICK CONTEXT (so you don't have to wait)
- VPS: 74.50.109.203, user: cash
- Frontend: /home/cash/nuro-finance-dashboard (Next.js 15.5.14, PM2 id:7, port 2800)
- Backend: /home/cash/Cashly (Express/TypeScript, PM2 id:0, port 3000)
- DB: postgresql://cashly:[REDACTED_DB_PASSWORD]@localhost:5432/cashly
- Repo: RichardTheBruce/Cashly, branch: frontend (remote: cashly). NEVER commit to origin/nurostack.
- Login: richardthebrucewayne@gmail.com / [REDACTED_PASSWORD] (NextAuth → backend POST /auth/login)

### CRITICAL RULES — MEMORIZE THESE
1. Auth is NextAuth v5 (next-auth@5.0.0-beta.30), NOT Privy. Privy env vars are not set.
2. DO NOT upgrade to Next.js 16 — Turbopack crashes on thread-stream (pino → @walletconnect → @privy-io/react-auth).
3. DO NOT remove `export const dynamic = "force-dynamic"` from [locale]/layout.tsx — prevents static prerender crash.
4. SessionProvider from next-auth/react MUST wrap the app in Providers.tsx — without it useSession() returns undefined.
5. NEVER commit to origin (nurostack/nuro-finance-dashboard) — only push to cashly remote, branch frontend.
6. DO NOT guess at fixes — read the actual code first, diagnose with actual file contents. Guessing has caused multi-hour disasters.
7. Owen's Base contract accepts REAL USDC/USDT/DAI only — no synthetics/bridged tokens.
8. cards.user_id is VARCHAR(36), not UUID type — use text comparisons in SQL.
9. Login uses NextAuth `signIn("credentials", ...)` → `authorize()` → backend `POST /auth/login`. Redux authSlice is for UI state only (via `hydrateFromPrivyUser`). Do NOT use `loginUser` thunk for auth.
10. Owen/SD3 is the source of truth for card identity. Our DB mirrors Owen data. All card data flows: Owen API → backend → DB → frontend.
11. MASSIVE amount of uncommitted work on VPS from 3-29 session — commit and push FIRST thing next session.

### HOW I WORK
- I am direct. When I'm frustrated, it's because time and money are burning. Don't take it personally but DO take it seriously.
- I need you to READ before you WRITE. Every time you're about to change a file, read it first. No exceptions.
- If you're not sure, ASK ME. Don't make assumptions. Wrong guesses have cost me entire sessions.
- When I give you a command to run on VPS, I'll run it and paste the output. You can't SSH into the VPS yourself.
- I commit to `cashly` remote (RichardTheBruce/Cashly), branch `frontend`. Never to origin (nurostack).

### AFTER BOOT
Read the memory files, then tell me:
1. What you see (current state)
2. What the priorities are
3. What you recommend we tackle first

Let's go.
```

---

## 📁 File Directory Quick Reference

Use this when someone asks "where do I find info about X":

| Topic | File |
|-------|------|
| Project overview, VPS, rules | `Claude Memory/INDEX.md` |
| What's broken / what's next | `Claude Memory/Pending Tasks.md` |
| Latest session work | `What We Did Today/` (latest dated file) |
| How the system is built | `Claude Memory/Architecture.md` |
| Frontend (Next.js, auth, routes) | `Claude Memory/Frontend.md` |
| Bridge & deposit monitoring | `Claude Memory/Bridge & Monitor.md` |
| Database schema | `Claude Memory/Database.md` |
| API routes | `Claude Memory/API Endpoints.md` |
| Card controls (limits/alerts) | `Claude Memory/Card Controls Schema.md` |
| Every error ever hit | `Error Log.md` |
| Every deploy ever made | `Claude Memory/Deploy History.md` |
| User accounts & test logins | `Claude Memory/Accounts & Test Users.md` |
| Session handoffs | `Hand_Off/` |
| This file | `Claude Memory/Session Starter.md` |

---

## 🔄 Shutdown Protocol — End of Every Session

Before ending any session, Claude should:

1. **Update `What We Did Today/`** — Create or update the session log with:
   - Overview of what was done
   - All files changed (with commit status)
   - Errors encountered and how they were fixed
   - Remaining issues for next session

2. **Update `Pending Tasks.md`** — Mark completed items, add new ones discovered during session

3. **Update `Deploy History.md`** — Add entries for every file changed, with date and reason

4. **Update `Error Log.md`** — Add new errors encountered (numbered sequentially from last entry)

5. **Update `INDEX.md` priorities** — Refresh the "Next Session Priorities" section

6. **Commit on VPS** — If there are uncommitted changes, either commit them or clearly document what's uncommitted

7. **Give Richard a handoff summary** — Quick verbal recap: "Here's what we did, here's what's left, here's what to paste into the next chat"

---

## ⏰ Time Check Reminder

> If you've been working for a while and the conversation is getting long, proactively tell Richard:
>
> "Hey — we've been at this for a while. I want to make sure we don't lose work. Should I log what we've done so far and prepare a handoff? We can start fresh in a new chat with full context."
>
> This prevents losing work to context window limits. Better to hand off clean than crash mid-task.

---

## 🏗️ Architecture Snapshot (for quick reference)

```
Browser → Next.js 15.5.14 (port 2800, PM2 id:7)
              │ Auth: NextAuth v5 (SessionProvider + ProtectedRoute)
              │ Bearer token (JWT signed with [REDACTED_JWT_SECRET])
              ▼
         Express/TypeScript (port 3000, PM2 id:0)
              ├── PostgreSQL (localhost:5432/cashly)
              ├── Owen/SD3 API (card issuing)
              ├── Alchemy RPCs (⚠️ costs money)
              └── Monitor (PAUSED — 86400s interval)
```

### Deposit Flow
```
User sends USDC on any EVM chain
  → Monitor detects balance > 0 (when running)
  → CCTP chains (17): burn on source → mint on Base
  → LZ chains (5): LZ hop to Arbitrum → CCTP to Base
  → 5% fee → multisig vault
  → Owen credits Visa card balance
```

---

## Generate JWT for API Testing
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
