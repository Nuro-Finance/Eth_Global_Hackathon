/**
 * ─── WEBHOOK VERIFICATION HELPERS ────────────────────────────────────────────
 *
 * HMAC-SHA256 signature verification for inbound webhooks.
 * Currently used by /issuer-webhook; future Circle / Polymarket webhooks can
 * reuse the same helpers.
 *
 * Design notes:
 *   - Signatures are verified against the RAW request body (Buffer), not a
 *     re-stringified version. Key-reordering or whitespace changes would
 *     otherwise break verification.
 *   - Uses `crypto.timingSafeEqual` to avoid leaking match progress via timing.
 *   - Every attempt (pass or fail) is logged to `webhook_verifications` so the
 *     admin console has a complete audit trail.
 */

import crypto from 'crypto'
import express from 'express'
import { Pool } from 'pg'
import { reportError, reportWarning } from './error-reporter'

export function verifyRawBodyHmac(
  rawBody: Buffer,
  signatureHex: string,
  secret: string
): boolean {
  if (!rawBody || !signatureHex || !secret) return false

  // Allow optional "sha256=" prefix (Stripe / some SD3 variants)
  const cleanSig = signatureHex.startsWith('sha256=')
    ? signatureHex.slice('sha256='.length)
    : signatureHex

  const expected = crypto.createHmac('sha256', secret).update(rawBody as any).digest('hex')

  const a = new Uint8Array(Buffer.from(cleanSig, 'hex'))
  const b = new Uint8Array(Buffer.from(expected, 'hex'))
  if (a.length !== b.length) return false

  try {
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

interface IssuerVerifierConfig {
  secret: string | undefined
  endpoint: string
  observeOnly?: boolean
}

/**
 * Express middleware factory for SD3 Issuer webhooks.
 *
 * Expects `express.raw({ type: 'application/json' })` mounted ahead of it on the
 * same route, so `req.body` is a Buffer.
 *
 * On success: parses JSON and re-attaches to `req.body` for the handler.
 * On failure: 401, logs to webhook_verifications.
 *
 * If `secret` is empty/undefined, verification is SKIPPED with a warning
 * (dev/local mode). Set `ISSUER_WEBHOOK_SECRET` in production.
 */
export function createIssuerWebhookVerifier(
  db: Pool,
  config: IssuerVerifierConfig
): express.RequestHandler {
  return async (req, res, next) => {
    const signature = (req.header('SD3-Signature') || req.header('sd3-signature') || '') as string
    const rawBody = req.body as Buffer
    const sourceIp = (req.ip || req.socket?.remoteAddress || '').slice(0, 45)

    const logVerification = async (verified: boolean) => {
      try {
        const bodyHash = rawBody
          ? crypto.createHash('sha256').update(rawBody as any).digest('hex')
          : null
        await db.query(
          `INSERT INTO webhook_verifications
             (webhook_source, endpoint, signature_provided, signature_verified, request_body_hash, source_ip, received_at)
           VALUES ('issuer', $1, $2, $3, $4, $5, now())`,
          [config.endpoint, signature.slice(0, 200) || null, verified, bodyHash, sourceIp]
        )
      } catch (err: any) {
        console.error('[webhook-verify] Failed to log verification:', err.message?.slice(0, 100))
      }
    }

    // Dev mode — no secret configured
    if (!config.secret) {
      await reportWarning(
        'issuer',
        'webhook_no_secret',
        config.endpoint,
        'ISSUER_WEBHOOK_SECRET not set; accepting webhook without verification'
      )
      await logVerification(false)
      // Re-parse body as JSON for the handler
      try {
        req.body = rawBody?.length ? JSON.parse(rawBody.toString('utf8')) : {}
      } catch (err: any) {
        await reportError('issuer', 'webhook_bad_json', config.endpoint, 'Invalid JSON body', err)
        return res.status(400).json({ error: 'Invalid JSON body' })
      }
      return next()
    }

    // Production path — verify signature
    if (!signature) {
      await logVerification(false)
      await reportError(
        'issuer',
        'webhook_missing_sig',
        config.endpoint,
        'Missing SD3-Signature header'
      )
      return res.status(401).json({ error: 'Missing signature' })
    }

    const ok = verifyRawBodyHmac(rawBody, signature, config.secret)
    await logVerification(ok)

    if (!ok) {
      await reportError(
        'issuer',
        'webhook_bad_sig',
        config.endpoint,
        'SD3 signature verification failed'
      )
      return res.status(401).json({ error: 'Invalid signature' })
    }

    // Verified — re-attach parsed JSON
    try {
      req.body = JSON.parse(rawBody.toString('utf8'))
    } catch (err: any) {
      await reportError('issuer', 'webhook_bad_json', config.endpoint, 'Invalid JSON body post-verify', err)
      return res.status(400).json({ error: 'Invalid JSON body' })
    }

    next()
  }
}
