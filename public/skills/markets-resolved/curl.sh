#!/usr/bin/env bash
# Nuro Resolved Markets Feed — raw curl example
#
# Cheapest endpoint in the catalog (0.001 USDC / call) — intentionally
# priced for batch training-data pulls. In production, use x402-fetch /
# x402-py SDKs to handle EIP-3009 signing automatically.

ENDPOINT="https://api.nuro.finance/api/x402/markets/resolved"

# ── Step 1: Naive request — expect 402 ──────────────────────────────────────

echo "▸ Step 1: First call without payment (expect 402 Payment Required)"
curl -i -s -X GET "$ENDPOINT?limit=10&category=crypto" | head -20

echo ""
echo "▸ Step 2: Server returns x402 PaymentRequirements with:"
echo "    - scheme: 'exact'"
echo "    - network: 'base'"
echo "    - asset: USDC contract on Base"
echo "    - payTo: 0x050cdf3608664bD667586393986cF8803f1Cd1B8 (Nuro revenue vault)"
echo "    - maxAmountRequired: 1000 (= 0.001 USDC at 6 decimals)"

# ── Step 3: Sign EIP-3009 transferWithAuthorization off-band ────────────────

# ── Step 4: Retry with X-PAYMENT header ──────────────────────────────────────

echo ""
echo "▸ Step 4: Retry with signed X-PAYMENT header"
echo ""
echo "curl -X GET \"$ENDPOINT?limit=10&category=crypto\" \\"
echo "  -H 'X-PAYMENT: <base64-encoded EIP-3009 authorization + signature>'"
echo ""
echo "On success: HTTP 200 + JSON response:"
echo "  {"
echo "    \"markets\": ["
echo "      {"
echo "        \"id\": \"uuid\","
echo "        \"question\": \"Will candidate X win election Y?\","
echo "        \"category\": \"politics\","
echo "        \"resolvedAt\": \"2026-05-01T14:30:00Z\","
echo "        \"winningSide\": \"yes\","
echo "        \"totalVolumeUsd\": 1234567,"
echo "        \"topTradersCount\": 142"
echo "      }"
echo "    ],"
echo "    \"fetchedAt\": \"...\""
echo "  }"
echo ""
echo "──────────────────────────────────────────────────────────────────"
echo "Easier path — use the SDK:"
echo ""
echo "  npm install x402-fetch"
echo ""
echo "  import { createSigner, wrapFetchWithPayment } from 'x402-fetch';"
echo "  const signer = await createSigner('base', process.env.NURO_AGENT_KEY);"
echo "  const fetch = wrapFetchWithPayment(globalThis.fetch, signer, BigInt(1000));"
echo "  const r = await fetch('$ENDPOINT?limit=500&since=2026-01-01T00:00:00Z');"
echo "  console.log(await r.json());"
echo ""
echo "Bulk-pull pattern for training data:"
echo "  Loop with 'since=last_seen_timestamp', save to disk, sleep 100ms,"
echo "  repeat. 600 req/hr rate limit = ~300k resolved markets/hr at limit=500."
echo ""
echo "Skill manifest: https://app.nuro.finance/skills/manifest.json"
