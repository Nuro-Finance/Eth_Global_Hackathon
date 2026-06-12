---
name: nuro-helm-threat-intel
description: Live security intelligence from the Nuro Helm plane — 53 rule statuses, 24h fire counts, FP-labeled events, per-rule trust scores. Use this when an agent needs to (a) audit its own threat surface, (b) produce a security digest, (c) export Helm events to an external SIEM, or (d) check whether a specific Helm rule is currently armed in observe vs enforce mode. Costs 0.10 USDC per call via x402, settles on Base.
---

# Helm Threat Intelligence — Nuro skill

This skill calls Nuro's `/api/x402/helm/threat-intel` endpoint, which returns the current state of all 53 Helm security rules + 24h activity rollup + per-rule false-positive trends.

## When to invoke

Trigger this skill when:
- You're producing a security audit / threat digest
- You need to confirm Helm is alive and rules are armed before depending on its protection
- An external system asks "what is Nuro's current security posture?"
- Building a security-monitoring agent that aggregates feeds from multiple sources

## Pricing

**$0.10 USDC per call**, paid via x402 protocol (HTTP 402). Settles on Base mainnet (or Base Sepolia in test mode). The agent address making the call must have at least $0.10 USDC and ETH for gas (or be served by a facilitator that handles gas, like ours).

## Authentication & payment flow

1. Make the call: `GET https://api.nuro.finance/api/x402/helm/threat-intel`
2. Server responds `HTTP 402 Payment Required` + JSON body:
   ```json
   {
     "x402Version": 1,
     "accepts": [{
       "scheme": "exact",
       "network": "base",
       "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
       "payTo": "0x050cdf3608664bD667586393986cF8803f1Cd1B8",
       "maxAmountRequired": "100000",
       "resource": "https://api.nuro.finance/api/x402/helm/threat-intel"
     }]
   }
   ```
3. Sign EIP-3009 `transferWithAuthorization` for $0.10 USDC to our revenue vault
4. Retry the call with `X-PAYMENT` header containing the signed authorization
5. Server verifies the signature + balance + nonce → forwards/settles via Coinbase facilitator → returns the data

If you're using `x402-fetch` or `x402-py`, all of this is handled automatically by the SDK. Just provide the agent's signing key and call the URL.

## Response shape

```json
{
  "fetchedAt": "2026-05-06T01:23:45Z",
  "summary": {
    "totalRules": 53,
    "armedCount": 21,
    "observeCount": 19,
    "enforceCount": 2,
    "last24hFireCount": 47
  },
  "rules": [
    {
      "id": "HELM-105",
      "name": "Tx-cap enforcement",
      "category": "ingress",
      "severity": "high",
      "armed": true,
      "mode": "observe",
      "armedCount24h": 14,
      "lastFiredAt": "2026-05-06T01:08:23Z",
      "falsePositiveRate30d": 0.043,
      "readyToEnforce": true
    },
    // ... 52 more
  ]
}
```

## Example invocation (with x402-py SDK)

```python
from x402_py import X402Client
from eth_account import Account

agent_key = Account.from_key("0x...")  # your agent's signing key
client = X402Client(signer=agent_key, network="base")

response = await client.fetch(
    "https://api.nuro.finance/api/x402/helm/threat-intel",
    method="GET"
)
data = response.json()

# Use the data — e.g. find rules ready to flip from observe to enforce
ready = [r for r in data["rules"] if r["readyToEnforce"]]
print(f"{len(ready)} rules ready to enforce: {[r['id'] for r in ready]}")
```

## Rate limiting

60 requests per hour per signing address. Bursts of 5 in 10 seconds allowed.
HTTP 429 with `Retry-After` header on overflow.

## What you get

Helm is a 6-month investment in security tooling specific to agentic-finance. The threat catalog covers:

- **Ingress prompt-injection** (HELM-001..007) — chat-marker detection, base64-blob scanning, role-confusion sniffing, IP-literal exfil
- **Tx-cap enforcement** (HELM-105/105B) — per-agent + platform-level value caps, authoritative-field acceptance scanner
- **Egress allowlist** (HELM-101) — every outbound HTTP call audited
- **FS-guard** (HELM-201/202/203) — Decision Journal append-only, neural-net write protection
- **Reasoning detectors** (HELM-401/403) — anomalous chain-of-thought patterns
- **Mass-write counter** (HELM-205) — runaway-loop detection
- **Merkle integrity** (HELM-208) — tampering detection on critical files
- **Compound detector** (HELM-501) — multi-rule correlation for sophisticated attacks

You'd spend many engineer-months building equivalent instrumentation. $0.10/call is a tiny fraction of that cost.

## Source + protocol

- Endpoint definition: live at `https://api.nuro.finance/api/x402/helm/threat-intel` (public source repo coming soon)
- x402 protocol spec: [x402.org](https://x402.org)
- Skill manifest (machine-readable): [/skills/manifest.json](https://app.nuro.finance/skills/manifest.json)
