---
name: nuro-sandbox-spawn
description: Spawn a 1-hour isolated Anvil mainnet-fork sandbox for safe agent testing. Returns a per-session RPC endpoint + scratch DB schema. Test your agent's full execution path against real on-chain state without risking real money. 0.50 USDC per spawn via x402.
---

# Sandbox Spawn — Nuro skill

Spawn an isolated Anvil mainnet-fork sandbox (1-hour TTL) for safe agent testing. Get scratch DB schema + dedicated RPC endpoint. The agentic-finance differentiator nobody else offers.

## Endpoint

`POST https://api.nuro.finance/api/x402/sandbox/spawn`

## Request body

```json
{
  "fork": "base | arbitrum | polygon",
  "blockNumber": null,  // null = latest
  "ttlMinutes": 60,     // max 240
  "label": "your-agent-deploy-test"
}
```

## Response shape

```json
{
  "sessionId": "uuid",
  "rpcUrl": "https://api.nuro.finance/sandbox/rpc/uuid",
  "scratchSchema": "sandbox_uuid",
  "expiresAt": "2026-05-06T03:00:00Z",
  "fundingTxHash": "0x..."  // pre-funded with USDC + ETH for testing
}
```

## Pricing

**0.50 USDC per spawn**, paid via x402. Highest-priced endpoint because spawning costs real compute (Anvil + scratch schema + cleanup cron).

## Use cases

- Pre-deploy agent testing
- CI/CD smoke tests for agent updates
- Security researchers reproducing exploit chains
- Agent developers iterating safely

## Wrappers

- [Tool spec (OpenAI function-calling)](/skills/sandbox-spawn/tool.json)
- [LangChain wrapper (Python)](/skills/sandbox-spawn/wrapper.py)
- [Curl example](/skills/sandbox-spawn/curl.sh)

## Quick start (Node, x402-fetch)

```typescript
import { createSigner, wrapFetchWithPayment } from 'x402-fetch';

const signer = await createSigner('base', process.env.NURO_AGENT_KEY!);
const fetch = wrapFetchWithPayment(globalThis.fetch, signer, BigInt(500000));

const r = await fetch('https://api.nuro.finance/api/x402/sandbox/spawn', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fork: 'base',
    ttlMinutes: 60,
    label: 'my-agent-deploy-test',
  }),
});
const { sessionId, rpcUrl, expiresAt, fundingTxHash } = await r.json();

// Now drive your agent against the sandbox:
import { createPublicClient, http } from 'viem';
const client = createPublicClient({ transport: http(rpcUrl) });
// ... approvals, swaps, settlement, bridge attestations ...
// All free for the TTL window — no further x402 charges.
```

## Companion endpoints (free during session)

- `GET https://api.nuro.finance/sandbox/:sessionId/status` — confirms the
  sandbox is still alive, returns time-remaining
- `POST https://api.nuro.finance/sandbox/:sessionId/destroy` — tear down
  early (graceful — drops scratch schema + stops Anvil node)

## Rate limiting

20 spawns per hour per signing address (sessions are expensive to spin
up). HTTP 429 with `Retry-After` on overflow.
