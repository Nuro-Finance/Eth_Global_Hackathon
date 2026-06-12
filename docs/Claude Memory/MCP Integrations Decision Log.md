# 🔌 MCP Integrations — Decision Log

> Created: 2026-04-21 (Session 27) — tracks every MCP server we evaluated, installed, or deliberately deferred. Prevents future sessions from re-scouting the same territory.
> Related: [[V2 Feature Set & Marathons]] Marathon 3 Sprint 3.1 "MCP Integrations"

---

## Currently installed (Session 27)

| MCP | Status | Purpose |
|---|---|---|
| `context7` | ✅ active | Library doc lookup (React/Next/Anthropic SDK/etc.) |
| `postgres-cashly` | ✅ active | Direct PG query access (production DB) |
| `filesystem` | ✅ active | File-system ops across the AFI dir |
| `github` | ✅ active | PR/issue/code search via gh API |

---

## Evaluated and DEFERRED

### SSH MCP server (classfang/ssh-mcp-server or similar)

**Evaluated**: Session 27, 2026-04-21
**Decision**: NOT installed.
**Why deferred**:
- Claude Code's built-in `Bash` tool already executes SSH commands transparently (`Bash("ssh cash@74.50.109.203 '...'")`)
- Every VPS interaction to date (Sessions 17-27) has used Bash successfully — zero functional gap
- MCP SSH's primary advantage is **command whitelisting** (regex-based) — valuable for multi-operator setups, marginal for single-founder ops
- Setup adds one more `mcpServers` entry + private-key path coordination
- Moltbook + Plaid + Dwolla integrations are higher-leverage for the same time budget

**When to revisit**:
- If multiple people start operating the VPS (hire an engineer, need safety rails)
- If we start running untrusted Claude agent cycles that could issue destructive commands
- If we ever hit the Bash shell-escaping complexity wall (long heredocs, nested quotes) — the structured tool surface would help

**Installation snippet (if revisited)**:
```json
{
  "mcpServers": {
    "ssh-vps": {
      "command": "npx",
      "args": [
        "-y", "@fangjunjie/ssh-mcp-server",
        "--host", "74.50.109.203",
        "--username", "cash",
        "--privateKeyPath", "~/.ssh/id_rsa",
        "--port", "22",
        "--whitelist", "^(pm2|git|curl|psql|cat|grep|tail|head|ls).*"
      ]
    }
  }
}
```

### Moltbook MCP server

**Evaluated**: Session 27, 2026-04-21
**Decision**: NOT installed — no upstream package exists; would have to build from scratch.
**Why deferred**:
- Upstream Moltbook hasn't granted us `MOLTBOOK_API_KEY` or `MOLTBOOK_AGENT_TOKEN` yet (pending request since Session 14)
- Building our own MCP server for an API we can't call = pure speculation work
- The growth-agent already has `src/growth-agent/skills/moltbook.ts` with `postToMoltbook()` — once credentials land, that path works without MCP overhead
- MCP wrapping would be useful IF Claude itself needed to read engagement metrics during a session (not just backend cron) — not the case yet

**When to revisit**:
- After Moltbook grants API access AND we've validated `postToMoltbook()` works via the cron
- If we want Claude to proactively research trending topics on Moltbook during content planning sessions

### Other MCP servers scouted (not needed now)

- **Stripe MCP** — Richard uses Stripe for Nuro card fees but admin-console already surfaces it; not needed for Claude-side workflows
- **Anthropic/Claude API MCP** — Claude Code IS the Claude client; circular dependency
- **Sentry MCP** — we don't use Sentry (custom execution_log is our observability)

---

## Decision rubric for future MCP additions

Before installing a new MCP server, ask:

1. **Can Claude's built-in tools (Bash, Read, Grep, Glob, Edit, Write, WebFetch) already do this?** If yes, add MCP only if structured-tool-surface is worth the config cost.
2. **Does an upstream package exist?** If we'd have to build it, the cost goes from 5 min → hours. Only worth it for core workflows.
3. **Does it unlock ongoing productivity vs one-time usage?** MCPs are config-heavy relative to one-off Bash/WebFetch calls.
4. **Security blast radius?** Any MCP with write access (Stripe transfers, DB mutations, SSH full shell) needs a fail-safe story.

Apply rubric. Default answer: *don't install*. The bar should be high.

---

## Session 27 conclusion for Marathon 3 Sprint 3.1

The sprint item "MCP Database Connection" in the original V2 doc is ✅ **done** via `postgres-cashly`. "MCP GitHub" is ✅ **done** via `github`. "MCP SSH" remains deferred per above.

Sprint 3.1 is effectively complete in its useful form — the two deferrals are documented as conscious "not yet" decisions, not missed work.
