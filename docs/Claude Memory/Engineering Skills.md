# Engineering Skills — When to Invoke

> Anthropic engineering plugin skills available in every session. Richard wants these surfaced via `/boot` so future sessions reach for them automatically instead of freestyle-solving. Each entry documents the exact trigger, what the skill delivers, and specific AFI scenarios where it applies.

All skills are invoked via the `Skill` tool with the fully qualified name (e.g. `engineering:incident-response`).

---

## engineering:incident-response

**Trigger when:** production is misbehaving, an alert needs severity assessment, writing a status update mid-incident, or writing a blameless postmortem after resolution.

**What it delivers:** structured incident workflow — triage → communicate → postmortem. Produces a postmortem doc with timeline, root cause, blast radius, mitigation, and action items.

**AFI scenarios:**
- Site outage like Session 20's Privy crash (full site 404 for ~10 min)
- Backend crash loops (Session 20's ts-node → tsx migration — that story deserves a proper postmortem, not just an Error Log entry)
- SD3 webhook signature failures spiking
- Unexpected card balance drift >$10 in production

**Recommended on:** next incident of any kind. Output goes to `Neural Net/Postmortems/` (create the folder if missing) with the session number in the filename.

---

## engineering:tech-debt

**Trigger when:** "what should we refactor", "tech debt audit", "code health", or when planning a sprint needs a view of maintenance backlog.

**What it delivers:** categorized + prioritized technical debt with severity, effort estimate, and recommended order.

**AFI scenarios:**
- Backlog at end of a marathon (e.g., Session 20 left: Stripe SDK types, bigint bindings, Privy placeholder hardening, @farcaster/mini-app-solana peer dep, missing drift backfill on existing cards)
- Before starting a new marathon — audit what's rotting while you're heads-down
- Quarterly cleanup cycle

**Recommended on:** start of Session 21 before Sprint 2.3 planning. Feed it `Pending Tasks.md` + `Error Log.md` + recent `Session_Logs/*Recap.md` and let it produce a prioritized debt register.

---

## engineering:testing-strategy

**Trigger when:** "how should we test X", "test strategy for", "what tests do we need", or when designing a sprint that has real on-chain / external-API side effects.

**What it delivers:** test plan covering unit, integration, E2E, and observability layers. Recommends which layer each behavior belongs to.

**AFI scenarios:**
- **Sprint 2.3 Bot Section** — how do you test a bot that places REAL Polymarket CLOB trades? (sandbox Polymarket? testnet agent wallet? shadow mode with dry-run flag?)
- Any new sweep (`sweepCreatorPayouts`, `sweepCardSettlements`): what's the integration test that proves it works end-to-end?
- Webhook handlers (Issuer, Stripe): signature fixtures + replay protection verification

**Recommended on:** Sprint 2.3 Bot Section planning. The execution layer burns real USDC; a test strategy MUST exist before any trade goes live.

---

## engineering:system-design

**Trigger when:** "design a system for", "how should we architect", "system design for", or when a new component needs API design, data modeling, or service boundaries.

**What it delivers:** architecture proposal with trade-offs, data flow diagrams, API contracts, and boundary definitions.

**AFI scenarios:**
- **Resolution-source classifier** for market creation (from Session 20 feedback) — rule-based regex vs LLM-call vs hybrid? Where does the classification live (FE suggestion on typing, or BE validation)?
- Bot runtime architecture (Sprint 2.3): where does bot code execute? Sandboxed container? Serverless function? In-process? How do bots get their keys?
- Future: community prediction pools (the `community:<vaultId>` payout_destination value is a stub — design the full community-vault system)
- MCP integrations (Marathon 3) — DB connection, GitHub, SSH

**Recommended on:** any time a new user-facing feature crosses 2+ services (vault + bot + Polymarket) or introduces a new persistence pattern.

---

## engineering:deploy-checklist

**Trigger when:** about to ship a release, deploying a change with migrations or feature flags, verifying CI status before production, or documenting rollback triggers.

**What it delivers:** pre-deploy verification checklist tailored to the change — env vars set, migrations in order, rollback plan, feature flags, tests passing.

**AFI scenarios:**
- **Every VPS deploy going forward.** Session 20's Privy crash happened because a placeholder env var got baked into the build — a deploy-checklist pass would have caught it.
- Migration-bearing sprints (Sprint 2.4, Sprint B, Sprint C, Sprint D all had new migrations)
- Any change touching `ecosystem.config.js` or PM2 config
- Any sweep registration change in `runSweepCycle` (the Promise.allSettled order matters for failure isolation)

**Recommended on:** before every commit that will be deployed. Short, fast, catches exactly this kind of mistake.

---

## engineering:code-review

**Trigger when:** given a PR URL or diff, "review this before I merge", "is this code safe?", or checking for N+1 queries, injection risks, edge cases, error handling gaps.

**What it delivers:** focused review with severity-tagged findings (blocking / should-fix / nice-to-have).

**AFI scenarios:**
- Any commit before push — particularly ones touching `execution-dispatch.ts`, `nuro-routes.ts` money-flow endpoints, or migration files
- Sprint A audit we did this session (vault double-spend + nonce) was essentially a code-review pass — the skill could have formalized the output
- Before swapping PM2 runtime or ecosystem config, as happened this session

**Recommended on:** any commit involving on-chain tx signing, SQL with dynamic interpolation, or new sweep/handler code.

---

## How to load these in new sessions

The `/boot` skill loads persistent memory; this file is in `Claude Memory/` so it'll be picked up. If it's not surfacing reliably, update `Neural Net/Claude Memory/INDEX.md` to reference it explicitly.

**Conventions adopted:**
- Invoke the matching skill before/during work that matches a trigger — don't freestyle-solve when a structured workflow exists.
- If a skill output is substantial (postmortem, system design), save it into `Neural Net/` under a topic folder (`Postmortems/`, `Architecture/`) and add a Session_Logs entry referencing it.
- Prefer invoking a skill over writing one-off docs by hand — the skills enforce shape and completeness.

---

*Related: [[Neural Net/Claude Memory/INDEX]] · [[Neural Net/Session_Logs/Session 21 Handoff]] · [[Neural Net/Claude Memory/Pending Tasks]]*
