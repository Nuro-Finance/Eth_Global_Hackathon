# Viewing Full Card Details — Integration Guide

This document covers everything needed to retrieve the complete details of a user's card: public card metadata, sensitive card secrets (PAN/CVV/expiry), and the PIN. Secrets and PIN require a **SessionId** — this guide explains exactly how to generate one and use it correctly.

---

## Overview

Card data is split across three endpoints depending on sensitivity:

| Data | Endpoint | SessionId Required |
|---|---|---|
| Card metadata (last4, status, expiry, limits) | `GET /api/proxy/issuing/cards/:cardId` | No |
| PAN, CVV, full expiry | `GET /api/proxy/issuing/cards/:cardId/secrets` | Yes |
| PIN | `GET /api/proxy/issuing/cards/:cardId/pin` | Yes |

All three require a valid `x-api-key` and the card must belong to a user associated with your API key.

---

## Step 1 — Get the Card ID

If you do not already have the `cardId`, retrieve it from the user's card list.

```bash
curl -X POST https://rocket.sd3.gg/api/proxy/issuing/users/<userId>/cards \
  -H "x-api-key: <your-api-key>"
```

The `cardId` is returned in the `201` response body:

```json
{ "cardId": "17793af6-f468-4ace-ac45-9bef96eb0879" }
```

Store this value — it is used for all subsequent card calls.

---

## Step 2 — Get Card Metadata (no SessionId needed)

This returns non-sensitive card information and is safe to call at any time.

```bash
curl https://rocket.sd3.gg/api/proxy/issuing/cards/17793af6-... \
  -H "x-api-key: <your-api-key>"
```

**Response:**

```json
{
  "id": "17793af6-f468-4ace-ac45-9bef96eb0879",
  "userId": "f03b62b2-1825-4bcb-8ed6-af3749a9c865",
  "companyId": "...",
  "type": "virtual",
  "status": "active",
  "last4": "4242",
  "expirationMonth": "12",
  "expirationYear": "2028",
  "limit": {
    "amount": 500000,
    "frequency": "per30DayPeriod"
  },
  "tokenWallets": []
}
```

### Card statuses

| Status | Meaning |
|---|---|
| `active` | Card is live and can transact |
| `locked` | Card is frozen — transactions will decline |
| `notActivated` | Card has been issued but not yet activated |
| `canceled` | Card is permanently closed |

---

## Step 3 — Generate a SessionId

The `secrets` and `pin` endpoints require a `SessionId` header. This is an **RSA-OAEP encrypted token** generated client-side (in the browser) — it cannot be generated server-side.

### How it works

1. Your frontend generates a random 16-byte secret key.
2. The secret is encrypted using the SD3 platform RSA public key via `RSA-OAEP / SHA-1`.
3. The base64-encoded ciphertext is sent as the `SessionId` header.
4. The platform decrypts it server-side and uses the shared secret to decrypt the response.

### Implementation

Copy this function into your frontend code:

```typescript
const SD3_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCeZ9uCoxi2XvOw1VmvVLo88TLk
GE+OO1j3fa8HhYlJZZ7CCIAsaCorrU+ZpD5PUTnmME3DJk+JyY1BB3p8XI+C5uno
QucrbxFbkM1lgR10ewz/LcuhleG0mrXL/bzUZbeJqI6v3c9bXvLPKlsordPanYBG
FZkmBPxc8QEdRgH4awIDAQAB
-----END PUBLIC KEY-----`

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

function randomHex(len: number): string {
  const arr = new Uint8Array(len / 2)
  crypto.getRandomValues(arr)
  return Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBase64(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export async function generateSessionId(): Promise<{ secretKey: string; sessionId: string }> {
  const spki = pemToArrayBuffer(SD3_PUBLIC_KEY_PEM)
  const publicKey = await crypto.subtle.importKey(
    'spki',
    spki,
    { name: 'RSA-OAEP', hash: 'SHA-1' },
    false,
    ['encrypt']
  )

  const secretKey = randomHex(32)           // 16-byte random secret
  const secretB64 = hexToBase64(secretKey)  // base64-encode it
  const data = new TextEncoder().encode(secretB64)

  const encrypted = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, data)

  // Convert encrypted bytes to base64 — this is your SessionId
  const bytes = new Uint8Array(encrypted)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  const sessionId = btoa(binary)

  return { secretKey, sessionId }
}
```

> **Important:** `crypto.subtle` is only available in a **browser** (or Web Worker) context. Do not call this on the server.

---

## Step 4 — Get Card Secrets (PAN / CVV / Expiry)

Once you have a `sessionId`, pass it as the `SessionId` header.

```bash
curl https://rocket.sd3.gg/api/proxy/issuing/cards/17793af6-.../secrets \
  -H "x-api-key: <your-api-key>" \
  -H "SessionId: <base64-encrypted-session-token>"
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

| Field | Description |
|---|---|
| `pan` | Full 16-digit card number |
| `cvv` | 3-digit security code |
| `expMonth` | Expiry month (2-digit string) |
| `expYear` | Expiry year (4-digit string) |

---

## Step 5 — Get Card PIN

Same flow as secrets — generate a fresh `SessionId` and pass it as a header.

```bash
curl https://rocket.sd3.gg/api/proxy/issuing/cards/17793af6-.../pin \
  -H "x-api-key: <your-api-key>" \
  -H "SessionId: <base64-encrypted-session-token>"
```

**Response:**

```json
{
  "pin": "1234"
}
```

> You may reuse the same `sessionId` value across the secrets and pin calls within a single user session, but generate a fresh one each time the user opens the card details view.

---

## Full Frontend Example

Below is a complete React component that fetches and displays all card details in one flow:

```tsx
import { useState } from 'react'
import { generateSessionId } from '@/lib/sessionId'

interface CardDetails {
  id: string
  last4: string
  status: string
  expirationMonth: string
  expirationYear: string
  type: string
}

interface CardSecrets {
  pan: string
  cvv: string
  expMonth: string
  expYear: string
}

export function CardDetailsView({
  cardId,
  apiKey,
}: {
  cardId: string
  apiKey: string
}) {
  const [card, setCard] = useState<CardDetails | null>(null)
  const [secrets, setSecrets] = useState<CardSecrets | null>(null)
  const [pin, setPin] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadCardDetails() {
    setLoading(true)
    setError(null)

    try {
      // 1. Fetch public card metadata (no session needed)
      const metaRes = await fetch(`/api/proxy/issuing/cards/${cardId}`, {
        headers: { 'x-api-key': apiKey },
      })
      if (!metaRes.ok) throw new Error('Failed to load card metadata')
      setCard(await metaRes.json())

      // 2. Generate a SessionId in the browser
      const { sessionId } = await generateSessionId()

      // 3. Fetch secrets
      const secretsRes = await fetch(`/api/proxy/issuing/cards/${cardId}/secrets`, {
        headers: { 'x-api-key': apiKey, SessionId: sessionId },
      })
      if (!secretsRes.ok) throw new Error('Failed to load card secrets')
      setSecrets(await secretsRes.json())

      // 4. Fetch PIN (reuse same sessionId)
      const pinRes = await fetch(`/api/proxy/issuing/cards/${cardId}/pin`, {
        headers: { 'x-api-key': apiKey, SessionId: sessionId },
      })
      if (!pinRes.ok) throw new Error('Failed to load PIN')
      const pinData = await pinRes.json()
      setPin(pinData.pin)

    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button onClick={loadCardDetails} disabled={loading}>
        {loading ? 'Loading...' : 'View Card Details'}
      </button>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {card && (
        <div>
          <p>Status: {card.status}</p>
          <p>Type: {card.type}</p>
          <p>Last 4: •••• {card.last4}</p>
          <p>Expires: {card.expirationMonth}/{card.expirationYear}</p>
        </div>
      )}

      {secrets && (
        <div>
          <p>PAN: {secrets.pan}</p>
          <p>CVV: {secrets.cvv}</p>
          <p>Expiry: {secrets.expMonth}/{secrets.expYear}</p>
        </div>
      )}

      {pin && <p>PIN: {pin}</p>}
    </div>
  )
}
```

---

## Error Reference

| Status | Cause | Fix |
|---|---|---|
| `400` | `SessionId` header missing | Generate a session ID before calling secrets or PIN |
| `401` | Missing or invalid API key | Check your `x-api-key` header |
| `403` | Card does not belong to your API key's users | Verify the `cardId` was issued via your key |
| `500` / `502` | Upstream error | Retry; check that the card status is `active` |

---

## Security Notes

- **Never log or store PAN, CVV, or PIN.** Treat them as ephemeral — display once, discard.
- **Generate `SessionId` in the browser only.** The RSA encryption relies on `crypto.subtle`, which is intentionally unavailable server-side in most environments.
- **Use HTTPS.** All calls to `rocket.sd3.gg` must be made over TLS.
- **Do not cache secrets responses.** Set `Cache-Control: no-store` on any wrapper requests.
