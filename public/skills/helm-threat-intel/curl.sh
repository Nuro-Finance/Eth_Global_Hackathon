#!/usr/bin/env bash
# Nuro Heimdall Threat Intelligence — raw curl example
#
# This script demonstrates the x402 payment flow manually.
# In production, use x402-fetch / x402-py SDK instead — they handle
# the EIP-3009 signing + retry automatically.

ENDPOINT="https://api.nuro.finance/api/x402/heimdall/threat-intel"

# ── Step 1: First call without payment — expect HTTP 402 ────────────────────

echo "▸ Step 1: Naive request (expect 402 Payment Required)"
curl -i -s -X GET "$ENDPOINT" | head -20

echo ""
echo "▸ Step 2: Server returns x402 PaymentRequirements with:"
echo "    - scheme: 'exact'"
echo "    - network: 'base'"
echo "    - asset: USDC contract on Base"
echo "    - payTo: 0x050cdf3608664bD667586393986cF8803f1Cd1B8 (Nuro revenue vault)"
echo "    - maxAmountRequired: 100000 (= 0.10 USDC at 6 decimals)"

# ── Step 3: Sign EIP-3009 transferWithAuthorization off-band ────────────────
# (omitted — see x402-fetch / x402-py SDK source for the exact signing path)

# ── Step 4: Retry with X-PAYMENT header ──────────────────────────────────────

echo ""
echo "▸ Step 4: Retry with signed X-PAYMENT header (fake example below)"
echo ""
echo "curl -X GET \"$ENDPOINT\" \\"
echo "  -H 'X-PAYMENT: <base64-encoded EIP-3009 authorization + signature>'"
echo ""
echo "On success: HTTP 200 + JSON response with rules + summary."
echo ""
echo "──────────────────────────────────────────────────────────────────"
echo "Easier path — use the SDK:"
echo ""
echo "  npm install x402-fetch"
echo ""
echo "  import { createSigner, wrapFetchWithPayment } from 'x402-fetch';"
echo "  const signer = await createSigner('base', process.env.NURO_AGENT_KEY);"
echo "  const fetch = wrapFetchWithPayment(globalThis.fetch, signer, BigInt(100000));"
echo "  const r = await fetch('$ENDPOINT');"
echo "  console.log(await r.json());"
echo ""
echo "Skill manifest: https://app.nuro.finance/skills/manifest.json"
