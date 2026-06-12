# @nuro/agent

One-line install for the Nuro agent runtime.

```bash
npx @nuro/agent init
```

Wraps any agent (Claude, OpenAI, your own) in:

- 🌉 **Omnichain settlement** — bridge USDC across 23 chains, settle to a Visa card
- 🤖 **Policy stack** — per-action and daily spend caps, observe-only first 60 s
- 🧠 **Mythos neural net** — security / advisory / market intel as a service
- 🎭 **Fleet orchestration** — manage many agents + cards as one persona

## What `init` does

1. Prompts for project name, capabilities, spend caps, allowed market venues.
2. Generates an HD-derived vault seed (sha256, never leaves your machine).
3. Writes two files into the cwd:
   - `nuro.config.json` — agent identity + policy (safe to commit).
   - `.env.nuro` — secrets (vault seed, webhook secret). **Gitignored automatically** if a `.gitignore` already exists.

No dependencies. Pure Node ≥ 18. The whole CLI is one file.

### Non-interactive mode

```bash
npx @nuro/agent init --yes
```

Skips all prompts and writes a config with the four-pillar defaults
(omnichain + attach + mythos + fleet, $50/action, $500/day,
polymarket + hyperliquid + swap, base). Useful for CI and "I'll
edit `nuro.config.json` afterward" flows.

## Other commands

```bash
nuro link        # bind this install to a Nuro orchestrator vault
nuro fund        # top up the vault with USDC
nuro run         # start the local orchestrator daemon
nuro help        # usage
```

`link`, `fund`, and `run` ship in the next sprint — for now use the dashboard
at <https://app.nuro.finance/dashboard/agent-wallet> to provision a vault.

## Why one file with no deps

We don't want `npx @nuro/agent` to download 200 MB of `node_modules` to print
a config wizard. Pure Node `readline` + `crypto` covers the whole flow.
The CLI fits in <300 lines and audits in 30 seconds.

## License

MIT
