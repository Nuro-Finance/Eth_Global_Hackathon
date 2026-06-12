// ─────────────────────────────────────────────────────────────────────────────
// AGENT-BUS — Signature primitives
//
// HELM-008 enforcement requires every inter-agent message to carry a
// verifiable signature. This module owns the sign/verify primitives + the
// per-agent key store (encrypted at rest).
//
// v1 (this commit): HMAC-SHA256 with per-agent keys. Symmetric — sender
// and verifier share the key. Acceptable for trusted-fleet semantics
// (all agents run on our infra). For mutually-untrusting agent ecosystems
// we move to ed25519 in Phase 1.
//
// v2 (Phase 1, Marathon 8): per-agent ed25519 keypairs with public-key
// distribution via the credential vault. Same envelope shape; different
// signature_alg. Coexists with v1 during the migration window via the
// signature_alg column.
//
// Encryption-at-rest: agent_keys.hmac_key_enc is AES-256-GCM-encrypted
// with AGENT_BUS_MASTER_KEY (env). Master key is the single secret that
// gates the whole bus; rotate it via a planned downtime + re-encrypt sweep.

import * as crypto from 'crypto'
import type { Pool } from 'pg'

// ── Master-key handling ─────────────────────────────────────────────────────

let _masterKey: Buffer | null = null

function getMasterKey(): Buffer {
  if (_masterKey) return _masterKey
  const raw = process.env.AGENT_BUS_MASTER_KEY
  if (!raw) {
    // In development / test envs without the env var, derive a stable
    // dev-only key from a known string so things work locally. In prod
    // this is a hard error caught by deploy gates.
    if (process.env.NODE_ENV === 'production') {
      throw new Error('AGENT_BUS_MASTER_KEY env var is required in production')
    }
    console.warn('[agent-bus] AGENT_BUS_MASTER_KEY not set — using dev fallback (NOT FOR PROD)')
    _masterKey = crypto.createHash('sha256').update('agent-bus-dev-fallback-key').digest()
    return _masterKey
  }
  // Accept either hex (64 chars) or base64 (>= 32 bytes after decode) or
  // free-form (we hash it to 32 bytes). Free-form is convenient for
  // operators; hex is canonical.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    _masterKey = Buffer.from(raw, 'hex')
  } else if (/^[A-Za-z0-9+/=]{43,}$/.test(raw)) {
    const b = Buffer.from(raw, 'base64')
    _masterKey = b.length >= 32 ? b.subarray(0, 32) : sha256Bytes(b)
  } else {
    _masterKey = sha256Bytes(Buffer.from(raw, 'utf8'))
  }
  return _masterKey
}

// ── AES-256-GCM helpers for at-rest key encryption ──────────────────────────
//
// Node's crypto module's TS bindings (v22) want Uint8Array for binary
// inputs; Buffer extends Uint8Array at runtime but the strict TS bindings
// reject the implicit downcast in some overload positions. Two helpers
// below normalize types so the call sites stay readable.

/** Buffer ↔ Uint8Array view (zero-copy). Cast through unknown to bridge
 *  the strict-TS Buffer-vs-Uint8Array typing without a copy. */
const u8 = (b: Buffer | Uint8Array): Uint8Array => b as unknown as Uint8Array

function sha256Bytes(input: Buffer | Uint8Array | string): Buffer {
  const h = crypto.createHash('sha256')
  if (typeof input === 'string') h.update(input, 'utf8')
  else h.update(u8(input))
  return Buffer.from(u8(h.digest()))
}

function encryptKey(plain: Buffer): Buffer {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', u8(getMasterKey()), u8(iv))
  const part1 = cipher.update(u8(plain))
  const part2 = cipher.final()
  const tag = cipher.getAuthTag()
  // Pack: [iv (12)] [tag (16)] [ct]
  return Buffer.concat([u8(iv), u8(tag), u8(part1), u8(part2)] as unknown as Uint8Array[])
}

function decryptKey(blob: Buffer): Buffer {
  if (blob.length < 28) throw new Error('agent-bus: encrypted key blob too short')
  const iv = blob.subarray(0, 12)
  const tag = blob.subarray(12, 28)
  const ct = blob.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', u8(getMasterKey()), u8(iv))
  decipher.setAuthTag(u8(tag))
  const part1 = decipher.update(u8(ct))
  const part2 = decipher.final()
  return Buffer.concat([u8(part1), u8(part2)] as unknown as Uint8Array[])
}

// ── Per-agent key management ────────────────────────────────────────────────

export interface AgentKeyRecord {
  agentId: string
  hmacKey: Buffer
  prevHmacKey: Buffer | null
  prevKeyExpiresAt: Date | null
  publicKeyPem: string | null
  keyVersion: number
}

export async function getAgentKey(db: Pool, agentId: string): Promise<AgentKeyRecord | null> {
  const r = await db.query(
    `SELECT agent_id, hmac_key_enc, prev_hmac_key_enc, prev_key_expires_at,
            public_key_pem, key_version
     FROM agent_keys WHERE agent_id = $1`,
    [agentId],
  )
  if (r.rows.length === 0) return null
  const row = r.rows[0]
  return {
    agentId: row.agent_id,
    hmacKey: decryptKey(row.hmac_key_enc),
    prevHmacKey: row.prev_hmac_key_enc ? decryptKey(row.prev_hmac_key_enc) : null,
    prevKeyExpiresAt: row.prev_key_expires_at,
    publicKeyPem: row.public_key_pem,
    keyVersion: row.key_version,
  }
}

/**
 * Provision a fresh key for an agent. Generates a 32-byte random key,
 * encrypts at rest, inserts. If the agent already has a key, this is a
 * NO-OP — use rotateAgentKey to replace.
 */
export async function ensureAgentKey(db: Pool, agentId: string): Promise<AgentKeyRecord> {
  const existing = await getAgentKey(db, agentId)
  if (existing) return existing
  const newKey = crypto.randomBytes(32)
  await db.query(
    `INSERT INTO agent_keys (agent_id, hmac_key_enc, key_version)
     VALUES ($1, $2, 1)
     ON CONFLICT (agent_id) DO NOTHING`,
    [agentId, encryptKey(newKey)],
  )
  // Re-fetch to handle the race where two callers both ensure simultaneously.
  return (await getAgentKey(db, agentId))!
}

/**
 * Rotate an agent's key. The old key migrates to prev_hmac_key for the
 * grace window (default 24h) so messages signed with the old key still
 * verify during the rollout.
 */
export async function rotateAgentKey(
  db: Pool,
  agentId: string,
  graceWindowHours = 24,
): Promise<AgentKeyRecord> {
  const cur = await ensureAgentKey(db, agentId)
  const newKey = crypto.randomBytes(32)
  await db.query(
    `UPDATE agent_keys
     SET hmac_key_enc = $2,
         prev_hmac_key_enc = $3,
         prev_key_expires_at = now() + ($4::int || ' hours')::interval,
         key_version = key_version + 1,
         rotated_at = now()
     WHERE agent_id = $1`,
    [agentId, encryptKey(newKey), encryptKey(cur.hmacKey), graceWindowHours],
  )
  return (await getAgentKey(db, agentId))!
}

// ── Signature core ──────────────────────────────────────────────────────────

/**
 * Canonical-ize the envelope for signing. The signature covers the fields
 * that matter for replay-protection: sender, recipient, topic, payload
 * (sorted JSON), reply_to, sent_at. Order is fixed; any deviation would
 * verify-fail.
 */
function canonicalForSig(env: {
  senderAgentId: string
  recipientAgentId: string | null
  topic: string
  payload: unknown
  replyTo: string | null
  sentAt: string
}): string {
  return [
    env.senderAgentId,
    env.recipientAgentId ?? '',
    env.topic,
    stableStringify(env.payload),
    env.replyTo ?? '',
    env.sentAt,
  ].join('\u001E') // record separator — reserved char unlikely in any field
}

/** JSON.stringify but with sorted keys, recursive. Required so two
 *  semantically-identical payloads produce the same byte string for HMAC. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']'
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}'
}

export interface SignedEnvelope {
  signature: string
  signatureAlg: 'hmac-sha256'
  senderKeyVersion: number
}

export async function signEnvelope(
  db: Pool,
  env: {
    senderAgentId: string
    recipientAgentId: string | null
    topic: string
    payload: unknown
    replyTo: string | null
    sentAt: string
  },
): Promise<SignedEnvelope> {
  const key = await ensureAgentKey(db, env.senderAgentId)
  const canonical = canonicalForSig(env)
  const sig = crypto
    .createHmac('sha256', new Uint8Array(key.hmacKey))
    .update(canonical)
    .digest('hex')
  return {
    signature: sig,
    signatureAlg: 'hmac-sha256',
    senderKeyVersion: key.keyVersion,
  }
}

export interface VerifyResult {
  ok: boolean
  reason?: string
  /** Which key matched? 'current' or 'previous' (during rotation grace). */
  keyMatched?: 'current' | 'previous'
}

export async function verifyEnvelope(
  db: Pool,
  env: {
    senderAgentId: string
    recipientAgentId: string | null
    topic: string
    payload: unknown
    replyTo: string | null
    sentAt: string
    signature: string
    signatureAlg: string
    senderKeyVersion: number
  },
): Promise<VerifyResult> {
  if (env.signatureAlg !== 'hmac-sha256') {
    return { ok: false, reason: `unsupported alg: ${env.signatureAlg}` }
  }
  const key = await getAgentKey(db, env.senderAgentId)
  if (!key) {
    return { ok: false, reason: `unknown sender: ${env.senderAgentId}` }
  }
  const canonical = canonicalForSig({
    senderAgentId: env.senderAgentId,
    recipientAgentId: env.recipientAgentId,
    topic: env.topic,
    payload: env.payload,
    replyTo: env.replyTo,
    sentAt: env.sentAt,
  })
  const expectCurrent = crypto
    .createHmac('sha256', new Uint8Array(key.hmacKey))
    .update(canonical)
    .digest('hex')
  if (timingSafeEq(expectCurrent, env.signature)) {
    return { ok: true, keyMatched: 'current' }
  }
  // Check previous key during grace window.
  if (
    key.prevHmacKey &&
    key.prevKeyExpiresAt &&
    key.prevKeyExpiresAt.getTime() > Date.now()
  ) {
    const expectPrev = crypto
      .createHmac('sha256', new Uint8Array(key.prevHmacKey))
      .update(canonical)
      .digest('hex')
    if (timingSafeEq(expectPrev, env.signature)) {
      return { ok: true, keyMatched: 'previous' }
    }
  }
  return { ok: false, reason: 'signature mismatch' }
}

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(u8(Buffer.from(a, 'hex')), u8(Buffer.from(b, 'hex')))
  } catch {
    return false
  }
}
