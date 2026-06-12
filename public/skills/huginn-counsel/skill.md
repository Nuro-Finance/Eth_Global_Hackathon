---
name: nuro-huginn-counsel
description: Synchronous "should I?" advisory verdict from Huginn — Nuro's rule-bank advisory agent. POST a proposed action; receive endorse / caution / dissent / block-recommend with reasoning + confidence. Tied to your agent's reputation tier. Use before committing to high-value or unusual actions. 0.005 USDC per call via x402.
---

# Huginn Counsel — Nuro skill

POST a proposed action to Huginn; get back an advisory verdict (endorse, caution, dissent, block-recommend) with reasoning + confidence. Drop-in human-in-the-loop equivalent for autonomous agents.

## Endpoint

`POST https://api.nuro.finance/api/x402/huginn/counsel`

## Request body

```json
{
  "proposerAgentId": "your-agent-id-or-address",
  "actionType": "transfer | bet | swap | bridge | message | spend",
  "actionSubject": "human-readable subject (e.g. 'place 100 USDC on Polymarket Trump-2028')",
  "valueUsd": 100,
  "chainId": 8453,
  "reasoning": "optional explanation of why you want to do this",
  "metadata": { "any": "additional context" }
}
```

## Response shape

```json
{
  "verdict": "endorse | caution | dissent | block-recommend",
  "confidence": 0.85,
  "reasoning": "Human-readable explanation of the verdict",
  "rulesFired": ["HELM-105", "..."],
  "tier": "good",
  "tierMultiplier": 1.2,
  "predictionId": "uuid"
}
```

## Pricing

**0.005 USDC per call**, paid via x402. Settles on Base.

## Use cases

- Trading agent pre-flighting a position
- Spend agent pausing before a large unusual purchase
- Bridge agent confirming destination address sanity
- Any agent that wants a "second opinion" before commit

## Wrappers

- [Tool spec (OpenAI function-calling)](/skills/huginn-counsel/tool.json)
- [LangChain wrapper (Python)](/skills/huginn-counsel/wrapper.py)
- [Curl example](/skills/huginn-counsel/curl.sh)

## Quick start (Node, x402-fetch)

```typescript
import { createSigner, wrapFetchWithPayment } from 'x402-fetch';

const signer = await createSigner('base', process.env.NURO_AGENT_KEY!);
const fetch = wrapFetchWithPayment(globalThis.fetch, signer, BigInt(5000));

const r = await fetch('https://api.nuro.finance/api/x402/huginn/counsel', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    proposerAgentId: '0xYOUR_AGENT_ADDRESS',
    actionType: 'swap',
    actionSubject: 'swap 500 USDC -> WBTC on Base',
    valueUsd: 500,
    chainId: 8453,
    reasoning: 'rebalance into majors per strategy',
  }),
});
const counsel = await r.json();
if (counsel.verdict === 'block-recommend' || counsel.verdict === 'dissent') {
  // abort or escalate to human
} else {
  // proceed (or proceed with caution if verdict === 'caution')
}
```

## Quick start (Python, x402-py + LangChain)

See [wrapper.py](/skills/huginn-counsel/wrapper.py) for a drop-in
`HuginnCounselTool(BaseTool)` you can register with `initialize_agent`.

## Rate limiting

120 requests per hour per signing address. Bursts of 10 in 10 seconds allowed.
HTTP 429 with `Retry-After` header on overflow.
