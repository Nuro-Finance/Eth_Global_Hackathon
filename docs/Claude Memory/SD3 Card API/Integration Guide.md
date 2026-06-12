# SD3 Cards — Partner Integration Guide

This guide covers everything a proxy/tenant needs to integrate with the SD3 Cards platform: authenticating requests, onboarding end-users, issuing cards, reading balances and transactions, and receiving real-time webhook events.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Getting Started](#2-getting-started)
3. [Authentication](#3-authentication)
4. [Rate Limits](#4-rate-limits)
5. [Onboarding Users](#5-onboarding-users)
6. [User Lifecycle & KYC](#6-user-lifecycle--kyc)
7. [Cards](#7-cards)
8. [Balances](#8-balances)
9. [Transactions](#9-transactions)
10. [Contracts](#10-contracts)
11. [Webhooks](#11-webhooks)
12. [Error Reference](#12-error-reference)
13. [End-to-End Flow](#13-end-to-end-flow)

---

## 1. Overview

SD3 Cards is a managed card-issuing platform. As a partner (proxy/tenant) you interact with a single API surface — the SD3 proxy — using your issued API key. The platform handles:

- **EVM wallet generation** — wallets are created automatically per user; you never need to supply or store a private key.
- **KYC orchestration** — the KYC flow is initiated on onboard; you receive a link to hand to the user.
- **Webhook fan-out** — events are verified and forwarded to your registered webhook URL, signed with your secret.

Your API key scopes every request to only the users you have onboarded.

---

## 2. Getting Started

### 2.1 Obtain an API Key

Contact the SD3 platform team to receive your API key and optionally configure:

| Setting | Description |
|---|---|
| `webhookUrl` | URL to receive forwarded events |
| `webhookSecret` | Secret used to sign forwarded webhooks (HMAC-SHA256) |
| `ipWhitelist` | Optional list of CIDRs/IPs allowed to use this key |

### 2.2 Base URL

```
https://rocket.sd3.gg
```

All requests and responses use `Content-Type: application/json`.

---

## 3. Authentication

Include your API key on every request using **one** of the following methods:

```http
x-api-key: <your-api-key>
```

```http
Authorization: Bearer <your-api-key>
```

Requests without a valid key return `401 Unauthorized`.

**Example (curl):**

```bash
curl https://rocket.sd3.gg/api/proxy/issuing/users/<userId> \
  -H "x-api-key: <your-api-key>"
```

### IP Whitelisting (optional)

If IP whitelisting is enabled for your key, requests from non-whitelisted IPs are rejected with `403 Forbidden`. Contact the platform team to update your whitelist.

---

## 4. Rate Limits

| Window | Max Requests | Block Duration |
|---|---|---|
| 15 minutes | 200 per IP | 1 hour |

When the limit is exceeded the response is `429 Too Many Requests` with the following headers:

```
X-RateLimit-Limit: 200
X-RateLimit-Remaining: 0
X-RateLimit-Reset: <unix-timestamp>
```

---

## 5. Onboarding Users

This is the entry point for every new end-user. It registers the user, generates an EVM wallet, and returns a KYC completion link.

### `POST /api/proxy/users/onboard`

**Request body:**

```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane.doe@example.com"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `firstName` | string | Yes | |
| `lastName` | string | Yes | |
| `email` | string | Yes | Must be a valid email |

**Success response — `201 Created`:**

```json
{
  "userId": "f03b62b2-1825-4bcb-8ed6-af3749a9c865",
  "applicationStatus": "pending",
  "kycCompletionLink": {
    "url": "https://kyc.sd3.gg/apply",
    "params": { "token": "abc123" }
  },
  "kycUrl": "https://kyc.sd3.gg/apply?token=abc123"
}
```

| Field | Description |
|---|---|
| `userId` | User ID — store this, it is used in all subsequent calls |
| `applicationStatus` | Current KYC/application status (see [§6](#6-user-lifecycle--kyc)) |
| `kycUrl` | Fully-formed URL to redirect or deep-link your user to for KYC |

**Duplicate handling:**

If the same `email` was already onboarded under your key the API returns `409 Conflict`. If the user exists but was not yet associated with your key, they are silently linked and the existing `userId` is returned with `200 OK`.

---

## 6. User Lifecycle & KYC

### Application statuses

| Status | Meaning |
|---|---|
| `pending` | Application submitted; KYC not yet started or in-progress |
| `approved` | KYC passed; user may issue a card |
| `denied` | KYC rejected; `applicationReason` will contain detail |

### `GET /api/proxy/issuing/users/:userId`

Fetch the current state of a user.

```bash
curl https://rocket.sd3.gg/api/proxy/issuing/users/f03b62b2-... \
  -H "x-api-key: <your-api-key>"
```

**Response:**

```json
{
  "id": "f03b62b2-1825-4bcb-8ed6-af3749a9c865",
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane.doe@example.com",
  "applicationStatus": "approved",
  "applicationReason": null,
  "applicationCompletionLink": null
}
```

> You can also listen for real-time status changes via webhooks (see [§11](#11-webhooks)) instead of polling this endpoint.

---

## 7. Cards

Each user may hold **exactly one** non-canceled virtual card.

### Issue a Card

`POST /api/proxy/issuing/users/:userId/cards`

The card type is always `virtual` and status is `active` at creation.

```bash
curl -X POST https://rocket.sd3.gg/api/proxy/issuing/users/f03b62b2-.../cards \
  -H "x-api-key: <your-api-key>"
```

**Success response — `201 Created`:**

```json
{
  "cardId": "17793af6-f468-4ace-ac45-9bef96eb0879"
}
```

**Constraint:** If an active card already exists for the user, the endpoint returns `400 Bad Request`:

```json
{
  "error": "Card limit reached. Only 1 card is allowed per user."
}
```

### Get Card Details

`GET /api/proxy/issuing/cards/:cardId`

```bash
curl https://rocket.sd3.gg/api/proxy/issuing/cards/17793af6-... \
  -H "x-api-key: <your-api-key>"
```

### Update Card (freeze / unfreeze)

`PATCH /api/proxy/issuing/cards/:cardId`

```json
{
  "status": "inactive"
}
```

Set `status` to `"active"` to unfreeze.

### Get Card Secrets (PAN / CVV)

`GET /api/proxy/issuing/cards/:cardId/secrets`

This endpoint requires a **session token** passed as a header. Session tokens are short-lived and obtained via the SD3 SDK.

```bash
curl https://rocket.sd3.gg/api/proxy/issuing/cards/17793af6-.../secrets \
  -H "x-api-key: <your-api-key>" \
  -H "SessionId: <session-token>"
```

**Response:**

```json
{
  "pan": "4111111111111111",
  "cvv": "123",
  "expMonth": "12",
  "expYear": "2028"
}
```

### Get Card PIN

`GET /api/proxy/issuing/cards/:cardId/pin`

Same `SessionId` requirement as card secrets.

```bash
curl https://rocket.sd3.gg/api/proxy/issuing/cards/17793af6-.../pin \
  -H "x-api-key: <your-api-key>" \
  -H "SessionId: <session-token>"
```

---

## 8. Balances

`GET /api/proxy/issuing/users/:userId/balances`

Returns the user's current account balances.

```bash
curl https://rocket.sd3.gg/api/proxy/issuing/users/f03b62b2-.../balances \
  -H "x-api-key: <your-api-key>"
```

**Example response:**

```json
{
  "available": 15000,
  "pending": 2000,
  "currency": "usd"
}
```

Amounts are in **cents** (USD).

---

## 9. Transactions

`GET /api/proxy/issuing/transactions`

Returns a paginated list of transactions. The `userId` query parameter is **required** and must be a user your API key is authorized for.

### Query Parameters

| Parameter | Type | Description |
|---|---|---|
| `userId` | string | **Required.** Filter by user |
| `cardId` | string | Filter by card |
| `type` | string | Comma-separated types: `spend`, `collateral`, `fee`, `payment` |
| `authorizedAfter` | ISO 8601 | Transactions authorized after this timestamp |
| `authorizedBefore` | ISO 8601 | Transactions authorized before this timestamp |
| `postedAfter` | ISO 8601 | Transactions posted after this timestamp |
| `postedBefore` | ISO 8601 | Transactions posted before this timestamp |
| `transactionHash` | string | Filter by on-chain hash |
| `cursor` | string | Pagination cursor from previous response |
| `limit` | number | Page size (default determined by upstream) |

**Example:**

```bash
curl "https://rocket.sd3.gg/api/proxy/issuing/transactions?userId=f03b62b2-...&type=spend&limit=25" \
  -H "x-api-key: <your-api-key>"
```

**Example response:**

```json
{
  "data": [
    {
      "id": "1fa3b54c-9d3a-4d8d-8c49-3a60925e01d5",
      "type": "spend",
      "spend": {
        "amount": 6490,
        "currency": "usd",
        "merchantName": "Gvp Assets Pty Ltd",
        "merchantCategory": "Beauty and Barber Shops",
        "status": "completed",
        "authorizedAt": "2026-04-01T02:39:04.907Z",
        "postedAt": "2026-04-04T00:03:22.086Z"
      }
    }
  ],
  "cursor": "next-page-cursor"
}
```

---

## 10. Contracts

`GET /api/proxy/issuing/users/:userId/contracts`

Returns the terms/contracts associated with the user.

```bash
curl https://rocket.sd3.gg/api/proxy/issuing/users/f03b62b2-.../contracts \
  -H "x-api-key: <your-api-key>"
```

---

## 11. Webhooks

The SD3 platform receives all card and user events and forwards relevant ones to your registered `webhookUrl` — filtered to only events belonging to your onboarded users.

### 11.1 Registering Your Webhook

Provide a `webhookUrl` (and optionally a `webhookSecret`) to the platform team when you set up your API key. You can update these at any time via the SD3 admin dashboard.

### 11.2 Inbound Event Format

Every forwarded event has the following envelope:

```json
{
  "id": "evt_abc123",
  "type": "transaction",
  "action": "completed",
  "data": { ... },
  "timestamp": "2026-04-04T00:03:22.756Z"
}
```

| Field | Description |
|---|---|
| `id` | Unique event ID — use for idempotency |
| `type` | `user`, `card`, `transaction`, or `application` |
| `action` | `created`, `updated`, `approved`, `denied`, `completed`, etc. |
| `data` | Event payload (see event types below) |
| `timestamp` | ISO 8601 UTC |

### 11.3 Request Headers

SD3 adds the following headers to every forwarded webhook:

| Header | Description |
|---|---|
| `SD3-Partner-API` | Always `v1` |
| `SD3-User-Id` | User ID the event belongs to |
| `SD3-Webhook-Id` | Event ID (same as `id` in the body) |
| `SD3-Signature` | HMAC-SHA256 hex signature (only if `webhookSecret` is configured) |

### 11.4 Verifying the Signature

If you configured a `webhookSecret`, verify every inbound request before processing:

```typescript
import crypto from 'crypto'

function verifySD3Signature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')

  return crypto.timingSafeEqual(
    Buffer.from(signatureHeader, 'hex'),
    Buffer.from(expected, 'hex')
  )
}
```

Always read the **raw body bytes** before parsing JSON — hashing a re-serialized object may produce a different signature.

### 11.5 Event Types

#### `application.updated`

Fired when a user's KYC application status changes.

```json
{
  "type": "application",
  "action": "updated",
  "data": {
    "userId": "f03b62b2-...",
    "applicationStatus": "approved",
    "applicationCompletionLink": null,
    "applicationReason": null
  }
}
```

#### `user.updated`

Fired when user profile data is updated.

```json
{
  "type": "user",
  "action": "updated",
  "data": {
    "id": "f03b62b2-...",
    "firstName": "Jane",
    "lastName": "Doe",
    "applicationStatus": "approved"
  }
}
```

#### `card.created`

Fired when a new card is issued.

```json
{
  "type": "card",
  "action": "created",
  "data": {
    "id": "17793af6-...",
    "userId": "f03b62b2-...",
    "type": "virtual",
    "status": "active"
  }
}
```

#### `card.updated`

Fired when a card status changes (e.g. frozen, canceled).

```json
{
  "type": "card",
  "action": "updated",
  "data": {
    "id": "17793af6-...",
    "status": "inactive"
  }
}
```

#### `transaction.created` / `transaction.completed`

Fired when a transaction is authorized or posted.

```json
{
  "type": "transaction",
  "action": "completed",
  "data": {
    "id": "1fa3b54c-...",
    "type": "spend",
    "spend": {
      "amount": 6490,
      "currency": "usd",
      "merchantName": "Gvp Assets Pty Ltd",
      "merchantCategory": "Beauty and Barber Shops",
      "status": "completed",
      "cardId": "17793af6-...",
      "userId": "f03b62b2-...",
      "authorizedAt": "2026-04-01T02:39:04.907Z",
      "postedAt": "2026-04-04T00:03:22.086Z"
    }
  }
}
```

### 11.6 Responding to Webhooks

Respond with `HTTP 2xx` within **10 seconds**. Failed deliveries are not retried automatically — ensure your endpoint is reliable and idempotent using the `id` field.

### 11.7 Webhook Health Check

```bash
curl https://rocket.sd3.gg/api/webhooks/sd3
```

```json
{
  "status": "healthy",
  "endpoint": "SD3 webhook receiver",
  "timestamp": "2026-04-05T00:00:00.000Z",
  "events": ["user.updated", "card.created", "transaction.created", "application.updated"]
}
```

---

## 12. Error Reference

All error responses follow the shape:

```json
{
  "error": "Human-readable message",
  "detail": { ... }
}
```

| HTTP Status | Meaning |
|---|---|
| `400` | Bad request — validation error or business rule violation (e.g. card limit reached) |
| `401` | Missing or invalid API key |
| `403` | IP not in whitelist |
| `409` | Conflict — user already onboarded under this key |
| `429` | Rate limit exceeded |
| `500` | Internal server error |
| `502` | Upstream error — `detail` contains the upstream error payload |

**Validation error shape (`400`):**

```json
{
  "error": "Validation error",
  "details": [
    { "path": ["email"], "message": "Invalid email address" }
  ]
}
```

---

## 13. End-to-End Flow

Below is the recommended happy-path sequence for a new user:

```
Partner Backend                   SD3 Proxy                     Card Network
      |                               |                              |
      |-- POST /proxy/users/onboard ->|                              |
      |                               |-- create user -------------->|
      |                               |<-- userId, kycUrl -----------|
      |<-- { userId, kycUrl } --------|                              |
      |                               |                              |
      | (redirect user to kycUrl)     |                              |
      |                               |                              |
      |                               |<== webhook: application.updated (approved)
      |<== webhook forwarded ---------|                              |
      |                               |                              |
      |-- POST /proxy/issuing/users/{userId}/cards ->               |
      |                               |-- createCard -------------->|
      |<-- { cardId } ----------------|                              |
      |                               |                              |
      |-- GET /proxy/issuing/users/{userId}/balances               |
      |-- GET /proxy/issuing/transactions?userId={userId}          |
      |-- GET /proxy/issuing/cards/{cardId}/secrets (+ SessionId)  |
```

### Step-by-step

1. **Onboard** — call `POST /api/proxy/users/onboard` with the user's name and email. Store the returned `userId`.
2. **KYC** — redirect or deep-link the user to `kycUrl`. Do not issue a card before KYC is approved.
3. **Wait for approval** — listen for the `application.updated` webhook with `applicationStatus: "approved"`, or poll `GET /api/proxy/issuing/users/:userId`.
4. **Issue card** — call `POST /api/proxy/issuing/users/:userId/cards`. Store the returned `cardId`.
5. **Display card** — obtain a `SessionId` from the SD3 SDK, then call `GET /api/proxy/issuing/cards/:cardId/secrets` to securely display the PAN/CVV to the user.
6. **Monitor** — listen for `transaction.*` webhooks and use `GET /api/proxy/issuing/transactions` for historical data.

---

## Support

For API key provisioning, webhook configuration, or integration questions contact the SD3 platform team at **platform@sd3.gg**.
