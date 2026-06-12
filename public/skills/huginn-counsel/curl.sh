#!/usr/bin/env bash
# Nuro Huginn Counsel — raw curl example
#
# Demonstrates the x402 payment flow for the POST advisory endpoint.
# In production, use x402-fetch (Node) / x402-py (Python) SDKs — they
# handle EIP-3009 signing + retry automatically. Manual flow below
# is mainly for transparency / debugging.

ENDPOINT="https://api.nuro.finance/api/x402/huginn/counsel"

# ── Step 1: First POST without payment — expect HTTP 402 ────────────────────

echo "▸ Step 1: Naive POST (expect 402 Payment Required)"
curl -i -s -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{
    "proposerAgentId": "0xYOUR_AGENT_ADDRESS",
    "actionType": "swap",
    "actionSubject": "swap 500 USDC -> WBTC on Base",
    "valueUsd": 500,
    "chainId": 8453,
    "reasoning": "rebalance into majors per strategy"
  }' | head -30

echo ""
echo "▸ Step 2: Server returns x402 PaymentRequirements with:"
echo "    - scheme: 'exact'"
echo "    - network: 'base'"
echo "    - asset: USDC contract on Base"
echo "    - payTo: 0x050cdf3608664bD667586393986cF8803f1Cd1B8 (Nuro revenue vault)"
echo "    - maxAmountRequired: 5000 (= 0.005 USDC at 6 decimals)"

# ── Step 3: Sign EIP-3009 transferWithAuthorization off-band ────────────────
# Use ethers / viem / web3.py / eth_account to sign. SDK does this for you.

# ── Step 4: Retry POST with X-PAYMENT header ────────────────────────────────

echo ""
echo "▸ Step 4: Retry POST with signed X-PAYMENT header"
echo ""
echo "curl -X POST \"$ENDPOINT\" \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -H 'X-PAYMENT: <base64-encoded EIP-3009 authorization + signature>' \\"
echo "  -d '{...same body as Step 1...}'"
echo ""
echo "On success: HTTP 200 + JSON:"
echo "  {"
echo "    \"verdict\": \"endorse | caution | dissent | block-recommend\","
echo "    \"confidence\": 0.85,"
echo "    \"reasoning\": \"...\","
echo "    \"rulesFired\": [\"HEIM-105\"],"
echo "    \"tier\": \"good\","
echo "    \"tierMultiplier\": 1.2,"
echo "    \"predictionId\": \"uuid\""
echo "  }"
echo ""
echo "──────────────────────────────────────────────────────────────────"
echo "Easier path — use the SDK:"
echo ""
echo "  npm install x402-fetch"
echo ""
echo "  import { createSigner, wrapFetchWithPayment } from 'x402-fetch';"
echo "  const signer = await createSigner('base', process.env.NURO_AGENT_KEY);"
echo "  const fetch = wrapFetchWithPayment(globalThis.fetch, signer, BigInt(5000));"
echo "  const r = await fetch('$ENDPOINT', {"
echo "    method: 'POST',"
echo "    headers: { 'Content-Type': 'application/json' },"
echo "    body: JSON.stringify({ proposerAgentId, actionType, actionSubject, valueUsd })"
echo "  });"
echo "  console.log(await r.json());"
echo ""
echo "Skill manifest: https://app.nuro.finance/skills/manifest.json"
