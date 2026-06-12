#!/usr/bin/env bash
# ─── ISSUER WEBHOOK TEST HARNESS ─────────────────────────────────────────────
# Signs a fixture JSON with $ISSUER_WEBHOOK_SECRET and POSTs to /issuer-webhook.
# Run a local server first: `npm run dev` (backend on :3000).
#
# Usage:
#   export ISSUER_WEBHOOK_SECRET=test_secret_abc
#   bash scripts/test-issuer-webhook.sh [spend|fee|payment|application|card|bad-sig|duplicate|unknown-card]
#
# Default case cycles through all scenarios.

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
SECRET="${ISSUER_WEBHOOK_SECRET:-}"
SCENARIO="${1:-all}"

if [[ -z "$SECRET" ]]; then
  echo "WARN: ISSUER_WEBHOOK_SECRET not set — sending without signature (dev mode)"
  echo ""
fi

# Portable HMAC-SHA256 using openssl (available on Windows git-bash, macOS, Linux)
sign_body() {
  local body="$1"
  local secret="$2"
  if [[ -z "$secret" ]]; then
    echo ""
    return
  fi
  printf '%s' "$body" | openssl dgst -sha256 -hmac "$secret" -hex | awk '{print $2}'
}

fire() {
  local label="$1"
  local webhook_id="$2"
  local body="$3"
  local override_sig="${4:-}"

  local sig
  if [[ -n "$override_sig" ]]; then
    sig="$override_sig"
  else
    sig="$(sign_body "$body" "$SECRET")"
  fi

  echo "────────────────────────────────────────────────────────────"
  echo "SCENARIO: $label"
  echo "Webhook-Id: $webhook_id"
  echo "Signature:  ${sig:0:24}$([ -n "$sig" ] && echo "..." )"
  echo ""

  local status
  status=$(curl -sS -o /tmp/issuer-webhook-resp.json -w "%{http_code}" \
    -X POST "$BASE_URL/issuer-webhook" \
    -H "Content-Type: application/json" \
    -H "X-Issuer-Signature: $sig" \
    -H "X-Issuer-Webhook-Id: $webhook_id" \
    -H "X-Issuer-Partner-API: test-partner" \
    --data "$body")

  echo "HTTP $status"
  cat /tmp/issuer-webhook-resp.json 2>/dev/null | head -c 400
  echo ""
  echo ""
}

# ── Fixtures ────────────────────────────────────────────────────────────────

spend_body='{
  "id": "evt_test_spend_001",
  "type": "transaction",
  "action": "completed",
  "data": {
    "id": "txn_test_spend_001",
    "type": "spend",
    "spend": {
      "amount": 1250,
      "currency": "USD",
      "merchantName": "Blue Bottle Coffee",
      "merchantCategory": "5812",
      "status": "completed",
      "cardId": "card_test_issuer_001",
      "userId": "user_test_issuer_001",
      "authorizedAt": "2026-04-16T12:00:00Z",
      "postedAt": "2026-04-16T12:00:05Z"
    }
  },
  "timestamp": "2026-04-16T12:00:05Z"
}'

fee_body='{
  "id": "evt_test_fee_001",
  "type": "transaction",
  "action": "completed",
  "data": {
    "id": "txn_test_fee_001",
    "type": "fee",
    "fee": {
      "amount": 50,
      "currency": "USD",
      "merchantName": "Issuer Fee",
      "status": "completed",
      "cardId": "card_test_issuer_001",
      "userId": "user_test_issuer_001",
      "postedAt": "2026-04-16T12:00:10Z"
    }
  },
  "timestamp": "2026-04-16T12:00:10Z"
}'

payment_body='{
  "id": "evt_test_payment_001",
  "type": "transaction",
  "action": "completed",
  "data": {
    "id": "txn_test_payment_001",
    "type": "payment",
    "payment": {
      "amount": 10000,
      "currency": "USD",
      "merchantName": "Card Top-Up",
      "status": "completed",
      "cardId": "card_test_issuer_001",
      "userId": "user_test_issuer_001",
      "postedAt": "2026-04-16T12:00:15Z"
    }
  },
  "timestamp": "2026-04-16T12:00:15Z"
}'

application_body='{
  "id": "evt_test_app_001",
  "type": "application",
  "action": "updated",
  "data": {
    "userId": "user_test_issuer_001",
    "applicationStatus": "approved"
  },
  "timestamp": "2026-04-16T12:00:20Z"
}'

card_body='{
  "id": "evt_test_card_001",
  "type": "card",
  "action": "created",
  "data": {
    "id": "card_test_issuer_999",
    "cardId": "card_test_issuer_999",
    "userId": "user_test_issuer_001",
    "type": "virtual",
    "status": "active"
  },
  "timestamp": "2026-04-16T12:00:25Z"
}'

unknown_card_body='{
  "id": "evt_test_unknown_001",
  "type": "transaction",
  "action": "completed",
  "data": {
    "id": "txn_test_unknown_001",
    "type": "spend",
    "spend": {
      "amount": 500,
      "currency": "USD",
      "merchantName": "Mystery Merchant",
      "merchantCategory": "5999",
      "status": "completed",
      "cardId": "card_does_not_exist_xyz",
      "userId": "user_test_issuer_001",
      "postedAt": "2026-04-16T12:00:30Z"
    }
  },
  "timestamp": "2026-04-16T12:00:30Z"
}'

run_spend()        { fire "transaction.completed / spend"    "whk_spend_001"    "$spend_body"; }
run_fee()          { fire "transaction.completed / fee"      "whk_fee_001"      "$fee_body"; }
run_payment()      { fire "transaction.completed / payment"  "whk_payment_001"  "$payment_body"; }
run_application()  { fire "application.updated"              "whk_app_001"      "$application_body"; }
run_card()         { fire "card.created"                     "whk_card_001"     "$card_body"; }
run_unknown_card() { fire "unknown card (warn + skip)"       "whk_unknown_001"  "$unknown_card_body"; }

run_bad_sig() {
  fire "bad signature (expect 401)" "whk_badsig_001" "$spend_body" "deadbeef$(printf '00%.0s' {1..28})"
}

run_duplicate() {
  # Same webhook-id twice — second should be marked duplicate
  fire "duplicate delivery, attempt 1" "whk_dup_001" "$spend_body"
  fire "duplicate delivery, attempt 2 (expect duplicate=true)" "whk_dup_001" "$spend_body"
}

case "$SCENARIO" in
  spend)        run_spend ;;
  fee)          run_fee ;;
  payment)      run_payment ;;
  application)  run_application ;;
  card)         run_card ;;
  bad-sig)      run_bad_sig ;;
  duplicate)    run_duplicate ;;
  unknown-card) run_unknown_card ;;
  all|*)
    run_spend
    run_fee
    run_payment
    run_application
    run_card
    run_unknown_card
    run_bad_sig
    run_duplicate
    ;;
esac

echo "────────────────────────────────────────────────────────────"
echo "Done. Verify with SQL:"
echo ""
echo "  SELECT signature_verified, endpoint, received_at FROM webhook_verifications"
echo "    ORDER BY received_at DESC LIMIT 10;"
echo ""
echo "  SELECT issuer_delivery_id, event_type, processed, process_result FROM issuer_webhook_events"
echo "    ORDER BY created_at DESC LIMIT 10;"
echo ""
echo "  SELECT issuer_transaction_id, type, amount, category, status, source_verified"
echo "  FROM card_transactions WHERE issuer_transaction_id LIKE 'txn_test_%'"
echo "    ORDER BY created_at DESC;"
