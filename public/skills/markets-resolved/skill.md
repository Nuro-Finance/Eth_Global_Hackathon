---
name: nuro-markets-resolved
description: Historical resolved-market data feed (Polymarket initially, expanding). Returns market question, resolution timestamp, winning side, total volume, top traders. For ML training, sentiment-correlation analysis, backtesting frameworks. 0.001 USDC per call via x402.
---

# Resolved Markets Feed — Nuro skill

Historical resolved-market history across the prediction-market ecosystem. Useful for ML training data, sentiment-correlation work, post-mortem analysis, and backtesting frameworks.

## Endpoint

`GET https://api.nuro.finance/api/x402/markets/resolved`

## Query parameters

- `limit` — max rows (default 50, max 500)
- `since` — ISO timestamp lower bound
- `category` — optional category filter

## Response shape

```json
{
  "markets": [
    {
      "id": "uuid",
      "question": "Will candidate X win election Y?",
      "category": "politics | crypto | sports | other",
      "resolvedAt": "2026-05-01T14:30:00Z",
      "winningSide": "yes",
      "totalVolumeUsd": 1234567,
      "topTradersCount": 142
    }
  ],
  "fetchedAt": "..."
}
```

## Pricing

**0.001 USDC per call**, paid via x402. Cheapest endpoint — designed for high-volume training data scenarios.

## Wrappers

- [Tool spec (OpenAI function-calling)](/skills/markets-resolved/tool.json)
- [LangChain wrapper + bulk_pull helper (Python)](/skills/markets-resolved/wrapper.py)
- [Curl example](/skills/markets-resolved/curl.sh)

## Quick start (Node, x402-fetch)

```typescript
import { createSigner, wrapFetchWithPayment } from 'x402-fetch';

const signer = await createSigner('base', process.env.NURO_AGENT_KEY!);
const fetch = wrapFetchWithPayment(globalThis.fetch, signer, BigInt(1000));

const r = await fetch(
  'https://api.nuro.finance/api/x402/markets/resolved?limit=500&since=2026-01-01T00:00:00Z'
);
const { markets, fetchedAt } = await r.json();
```

## Bulk-pull pattern (for training data)

The Python wrapper ships a `bulk_pull` helper that pages through all
resolved markets since a given timestamp, advancing the cursor by the
latest `resolvedAt` on each page. At 0.001 USDC × 500 rows/page, a
full-history sync costs roughly **$0.10–0.30** total.

```python
from wrapper import bulk_pull
markets = await bulk_pull(
    agent_signing_key=os.environ["NURO_AGENT_KEY"],
    start_since="2024-01-01T00:00:00Z",
    category="crypto",
)
# 5000+ markets typical for a 2-year crypto window
```

## Rate limiting

600 requests per hour per signing address (highest in the catalog —
designed for bulk usage). HTTP 429 with `Retry-After` on overflow.
