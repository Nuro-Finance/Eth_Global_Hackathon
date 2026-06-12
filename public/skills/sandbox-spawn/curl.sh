#!/usr/bin/env bash
# Nuro Sandbox Spawn — raw curl example
#
# Most expensive endpoint (0.50 USDC / spawn) because spawning costs
# real compute: Anvil mainnet-fork + scratch DB schema + cleanup cron.
# In production, use x402-fetch / x402-py SDKs to handle EIP-3009 signing.

ENDPOINT="https://api.nuro.finance/api/x402/sandbox/spawn"

# ── Step 1: Naive POST — expect 402 ─────────────────────────────────────────

echo "▸ Step 1: Naive POST (expect 402 Payment Required)"
curl -i -s -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{
    "fork": "base",
    "blockNumber": null,
    "ttlMinutes": 60,
    "label": "my-agent-deploy-test"
  }' | head -30

echo ""
echo "▸ Step 2: Server returns x402 PaymentRequirements with:"
echo "    - scheme: 'exact'"
echo "    - network: 'base'"
echo "    - asset: USDC contract on Base"
echo "    - payTo: 0x050cdf3608664bD667586393986cF8803f1Cd1B8 (Nuro revenue vault)"
echo "    - maxAmountRequired: 500000 (= 0.50 USDC at 6 decimals)"

# ── Step 3: Sign EIP-3009 transferWithAuthorization off-band ────────────────

# ── Step 4: Retry POST with X-PAYMENT header ────────────────────────────────

echo ""
echo "▸ Step 4: Retry POST with signed X-PAYMENT header"
echo ""
echo "curl -X POST \"$ENDPOINT\" \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -H 'X-PAYMENT: <base64-encoded EIP-3009 authorization + signature>' \\"
echo "  -d '{ \"fork\": \"base\", \"ttlMinutes\": 60, \"label\": \"my-agent-deploy-test\" }'"
echo ""
echo "On success: HTTP 200 + JSON response:"
echo "  {"
echo "    \"sessionId\": \"uuid\","
echo "    \"rpcUrl\": \"https://api.nuro.finance/sandbox/rpc/uuid\","
echo "    \"scratchSchema\": \"sandbox_uuid\","
echo "    \"expiresAt\": \"2026-05-10T03:00:00Z\","
echo "    \"fundingTxHash\": \"0x...\""
echo "  }"
echo ""
echo "Your agent then points its provider/SDK at the returned rpcUrl —"
echo "treat it as a normal RPC. Anvil impersonation cheats (impersonate"
echo "any account, anvil_setBalance, anvil_mine) are available too."

# ── Optional: status check + early teardown ─────────────────────────────────

echo ""
echo "▸ Status check (free):"
echo "  curl https://api.nuro.finance/sandbox/<sessionId>/status"
echo ""
echo "▸ Early teardown (free — refund unused TTL on next spawn?):"
echo "  curl -X POST https://api.nuro.finance/sandbox/<sessionId>/destroy"
echo ""
echo "──────────────────────────────────────────────────────────────────"
echo "Easier path — use the SDK:"
echo ""
echo "  npm install x402-fetch"
echo ""
echo "  import { createSigner, wrapFetchWithPayment } from 'x402-fetch';"
echo "  const signer = await createSigner('base', process.env.NURO_AGENT_KEY);"
echo "  const fetch = wrapFetchWithPayment(globalThis.fetch, signer, BigInt(500000));"
echo "  const r = await fetch('$ENDPOINT', {"
echo "    method: 'POST',"
echo "    headers: { 'Content-Type': 'application/json' },"
echo "    body: JSON.stringify({ fork: 'base', ttlMinutes: 60, label: 'test' })"
echo "  });"
echo "  const { rpcUrl, sessionId, expiresAt } = await r.json();"
echo ""
echo "Skill manifest: https://app.nuro.finance/skills/manifest.json"
