import { Router, Request, Response, NextFunction } from 'express'
import axios from 'axios'
import { CONFIG } from './config'
import { Pool } from 'pg'
import * as jwt from 'jsonwebtoken'
import * as bcrypt from 'bcrypt'
import { randomUUID } from 'crypto'
import { onboardUser, getUserBaseDepositAddress, freezeCard, createCard, getCardDetails, listIssuerCards, getIssuerCardNumber, getIssuerCardSecrets, debitCard, creditCard } from './issuers'
import { type CardChatContext } from './lib/agent-tools'
import { runCardAgentChatTurn } from './lib/card-agent-chat-loop'
import type { ChatLlmProvider } from './lib/chat-provider-models'
import { syncIssuerTransactions } from './issuer-sync'
import { acquireChainLock, releaseChainLock, getFreshNonce, recordNonceUsed, createFreshWallet } from './nonce-manager'
import { enforceTxCap } from './helm'
import { syncCardBalanceFromIssuer } from './card-balance-sync'
import { getDepositAddress, saveDepositAddress } from './db'
import { generateSolanaDepositAddress } from './solana-bridge'
import { ethers } from 'ethers'
import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddress } from '@solana/spl-token'
import { cctpBurnAndMint } from './bridge'
import { reportError } from './error-reporter'
import { placePolymarketTrade, getAgentBalance } from './polymarket'
import { NATIVE_TOKENS, getErc20Allowlist, findErc20, previewSwapQuote, ensureAllowlistFresh, forceRefreshAllowlist } from './swap'
import { verifyIdToken, OAuthVerifyError } from './oauth-verify'
import { normalizeKycStatus } from './lib/kyc-status'
import Anthropic from '@anthropic-ai/sdk'
import {
  PERSONAS,
  buildSystemPrompt,
  defaultPersonaForCardType,
  type PersonaKey,
  type CardContext,
} from './lib/card-agent-personas'
import {
  emitSignal,
  voidSafe,
  loadRecentSignals,
  loadSignalsInWindow,
  cadenceToSinceIso,
  formatSignalsForPrompt,
  SIGNAL_TYPES,
} from './lib/self-learn'
import {
  findSolanaTokenBySymbol,
  findSolanaTokenByMint,
  getJupiterQuoteCached,
  getJupiterSwapTx,
  USDC_SOLANA_MINT,
  ensureSolanaAllowlistFresh,
  forceRefreshSolanaAllowlist,
  getSolanaAllowlist,
} from './jupiter-client'
import { getBestQuote } from './quote-aggregator'
import { sendEmail } from './email'
import Stripe from 'stripe'

// Day-7 demo-critical: email-verification OTP for /auth/register and
// /auth/login when an account isn't yet verified. 6-digit numeric, 10-min
// expiry, max 5 attempts per code, no re-use. Resend on demand bumps the
// row's expires_at + resets attempts.
const OTP_LENGTH = 6
const OTP_TTL_MS = 10 * 60 * 1000
const OTP_MAX_ATTEMPTS = 5

/** Fixed OTP for local design/debug only. Requires NURO_LOCAL_DEV_OTP=true; forbidden in production. */
function resolveLocalDevOtp(): string | null {
  if (process.env.NURO_LOCAL_DEV_OTP !== 'true') return null
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'NURO_LOCAL_DEV_OTP=true is forbidden when NODE_ENV=production. ' +
        'Unset NURO_LOCAL_DEV_OTP before deploying.',
    )
  }
  return '111111'
}

const LOCAL_DEV_OTP = resolveLocalDevOtp()
if (LOCAL_DEV_OTP) {
  console.warn(
    '[auth/otp] NURO_LOCAL_DEV_OTP enabled — fixed code 111111, extended TTL, verify bypass. ' +
      'Never set NURO_LOCAL_DEV_OTP in production.',
  )
}

function generateOtpCode(): string {
  if (LOCAL_DEV_OTP) return LOCAL_DEV_OTP
  // Cryptographically-random 6-digit string. Math.random would also work
  // for a 6-digit case, but crypto is one extra line and gives us a stronger
  // statement at audit time.
  const bytes = require('crypto').randomBytes(4) as Buffer
  const n = bytes.readUInt32BE(0) % 1_000_000
  return n.toString().padStart(OTP_LENGTH, '0')
}

async function issueEmailOtp(
  db: Pool,
  email: string,
  purpose: 'signup' | 'login' | 'recovery',
): Promise<{ code: string; expiresAt: Date }> {
  const code = generateOtpCode()
  const expiresAt = LOCAL_DEV_OTP
    ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    : new Date(Date.now() + OTP_TTL_MS)
  // Invalidate any unconsumed prior codes for this (email, purpose) so the
  // newest code is always the one that wins. Keeps the table self-cleaning
  // and prevents replay of an old code if a user clicks Resend.
  await db.query(
    `UPDATE email_otps
        SET consumed_at = now()
      WHERE email = $1
        AND purpose = $2
        AND consumed_at IS NULL`,
    [email, purpose],
  )
  await db.query(
    `INSERT INTO email_otps (email, code, purpose, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [email, code, purpose, expiresAt],
  )
  return { code, expiresAt }
}

async function sendOtpEmail(toEmail: string, code: string, purpose: 'signup' | 'login' | 'recovery'): Promise<void> {
  const subject =
    purpose === 'signup'
      ? `Verify your Nuro account — code ${code}`
      : purpose === 'login'
        ? `Nuro sign-in code — ${code}`
        : `Nuro account recovery — ${code}`
  const reasonLine =
    purpose === 'signup'
      ? 'Welcome to Nuro. Enter the code below to verify your email and finish creating your account.'
      : purpose === 'login'
        ? 'Use the code below to finish signing in. If you did not request this, you can safely ignore this email.'
        : 'Use the code below to continue with your account recovery request.'
  const text = [
    `Hi,`,
    ``,
    reasonLine,
    ``,
    `  Your code:  ${code}`,
    ``,
    `This code expires in 10 minutes and can be used once.`,
    ``,
    `If you did not start this request, you can safely ignore this email —`,
    `no account changes were made.`,
    ``,
    `— Nuro Finance`,
  ].join('\n')
  // Fire-and-forget: caller already returns 200 to the client. If Resend is
  // down, the audit log shows the failure and the user can hit /resend-otp.
  void sendEmail({ to: toEmail, subject, text })
    .then((r) => {
      if (!r.ok) {
        console.warn(`[auth/otp] email send failed to=${toEmail.slice(0, 40)} reason=${r.detail}`)
      }
    })
    .catch(() => {
      /* sendEmail already swallows */
    })
}

// H2 (auditor 2026-05-07): no dev fallback. If JWT_SECRET is unset, the
// process MUST refuse to start. The previous fallback ('nuro-dev-secret-
// change-in-prod') was a known string -- a misconfigured deploy would
// have meant any attacker who knew the fallback could forge any user's
// session JWT or 90-day CLI token. Better to crash on boot than to
// silently sign tokens with a leaked secret.
if (!process.env.JWT_SECRET) {
  throw new Error(
    'JWT_SECRET env var is required. Set it in .env.local (dev) or via the ' +
    'deployment env (prod) before starting the server. Refusing to boot with ' +
    'a fallback secret because that would let any leak forge user tokens.',
  )
}
const JWT_SECRET: string = process.env.JWT_SECRET
const SALT_ROUNDS = 10

function generateDepositAddress(userId: string): string {
  const seed = ethers.utils.id(process.env.PRIVATE_KEY! + userId)
  const hdNode = ethers.utils.HDNode.fromSeed(seed)
  return hdNode.address
}

export function createNuroRouter(db: Pool): Router {
  const router = Router()

  // ── Rate Limiter (in-memory, per IP) ─────────────────────────────────────
  const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
  const RATE_LIMIT_WINDOW = 15 * 60 * 1000 // 15 minutes
  const RATE_LIMIT_MAX = 10 // max attempts per window

  function rateLimit(req: Request, res: Response, next: NextFunction) {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown'
    const key = String(ip)
    const now = Date.now()
    const entry = rateLimitMap.get(key)
    if (!entry || now > entry.resetAt) {
      rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
      return next()
    }
    if (entry.count >= RATE_LIMIT_MAX) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
      res.set('Retry-After', String(retryAfter))
      return res.status(429).json({ error: 'Too many attempts. Try again later.', retryAfter })
    }
    entry.count++
    next()
  }
  // Clean up stale entries every 30 minutes
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of rateLimitMap) {
      if (now > entry.resetAt) rateLimitMap.delete(key)
    }
  }, 30 * 60 * 1000)

  function generateAgentWalletAddr(agentId: string): string {
    const seed = ethers.utils.id(process.env.PRIVATE_KEY! + 'agent_' + agentId)
    const hdNode = ethers.utils.HDNode.fromSeed(seed)
    return hdNode.address
  }

  function requireAuth(req: Request, res: Response, next: NextFunction) {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.status(401).json({ error: 'No token' })
    try {
      const user = jwt.verify(token, JWT_SECRET) as any
      ;(req as any).user = user
      next()
    } catch {
      res.status(403).json({ error: 'Invalid token' })
    }
  }

  // S31 H2 — admin endpoints accept EITHER a valid JWT (with role=admin)
  // OR the shared ADMIN_KEY (header `x-admin-key` or query `?adminKey=`).
  // Mirrors the pattern admin-console.ts uses for /admin/* routes; avoids
  // needing a JWT for server-side admin tooling.
  function requireAuthOrAdminKey(req: Request, res: Response, next: NextFunction) {
    const adminKey = process.env.ADMIN_KEY
    if (adminKey) {
      const hdr = (req.headers['x-admin-key'] as string | undefined) ?? ''
      const q = (req.query.adminKey as string | undefined) ?? ''
      if (hdr === adminKey || q === adminKey) {
        ;(req as any).user = { id: 'admin', role: 'admin' }
        return next()
      }
    }
    // Fall through to JWT path.
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.status(401).json({ error: 'No token or admin key' })
    try {
      const user = jwt.verify(token, JWT_SECRET) as any
      ;(req as any).user = user
      next()
    } catch {
      res.status(403).json({ error: 'Invalid token' })
    }
  }

  // POST /auth/register (rate limited)
  //
  // Day-7 demo-critical change: registration NO LONGER issues a JWT
  // immediately. We create the user row with email_verified=FALSE, generate
  // a 6-digit OTP, send it via Resend, and return {needsVerification, email}.
  // The FE then prompts the user for the code and calls /auth/verify-otp
  // to get the JWT.
  //
  // Auto-provisioning Alpha Bot is deferred to the verify step so we don't
  // create an agent for an account that never proves email ownership.
  router.post('/auth/register', rateLimit, async (req, res) => {
    const { email, password, name } = req.body
    if (!email || !password || !name)
      return res.status(400).json({ error: 'email, password, name required' })
    const normalizedEmail = String(email).trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
      return res.status(400).json({ error: 'Invalid email address' })
    try {
      const existing = await db.query(
        'SELECT id, email_verified FROM users WHERE email = $1',
        [normalizedEmail],
      )
      if (existing.rows.length > 0) {
        // If user exists but never verified, treat this like a resend instead
        // of a 409 — a real user retrying after closing the page should be
        // able to recover. We update the password hash so a forgotten one is
        // overwritten without leaking that the account exists.
        if (existing.rows[0].email_verified === false) {
          const newHash = await bcrypt.hash(password, SALT_ROUNDS)
          await db.query(
            `UPDATE users SET password_hash = $1, name = $2 WHERE id = $3`,
            [newHash, name, existing.rows[0].id],
          )
          const { code } = await issueEmailOtp(db, normalizedEmail, 'signup')
          void sendOtpEmail(normalizedEmail, code, 'signup')
          return res.status(202).json({ needsVerification: true, email: normalizedEmail })
        }
        return res.status(409).json({ error: 'Email already registered' })
      }
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS)
      const id = randomUUID()
      await db.query(
        'INSERT INTO users (id, email, name, password_hash, email_verified) VALUES ($1, $2, $3, $4, FALSE)',
        [id, normalizedEmail, name, passwordHash],
      )

      const { code } = await issueEmailOtp(db, normalizedEmail, 'signup')
      void sendOtpEmail(normalizedEmail, code, 'signup')

      // Auto-provision Alpha Bot is deferred until /auth/verify-otp — see
      // function body. We don't want orphaned agents for unverified users.

      // Admin-console visibility: every new signup gets an execution_log
      // row so Richard's admin dashboard surfaces "user created, OTP sent"
      // in real-time. Status='pending' until verify-otp flips it to success.
      await db.query(
        `INSERT INTO execution_log (entity_type, entity_id, action, status, detail)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          'auth',
          id.slice(0, 100),
          'signup_otp_sent',
          'pending',
          JSON.stringify({ email: normalizedEmail.slice(0, 120), name: String(name).slice(0, 80) }).slice(0, 1800),
        ],
      ).catch(() => { /* admin visibility must never block auth */ })

      return res.status(202).json({ needsVerification: true, email: normalizedEmail })
    } catch (err) {
      console.error('[auth/register]', err)
      res.status(500).json({ error: 'Registration failed' })
    }
  })

  // POST /auth/verify-otp — finalize signup OR login by exchanging a valid
  // OTP for a JWT. Single endpoint serves both flows; the OTP row's
  // `purpose` column distinguishes signup vs login.
  router.post('/auth/verify-otp', rateLimit, async (req, res) => {
    const { email, code, purpose: rawPurpose } = req.body
    const purpose: 'signup' | 'login' =
      rawPurpose === 'login' ? 'login' : 'signup'
    if (!email || !code)
      return res.status(400).json({ error: 'email and code required' })
    const normalizedEmail = String(email).trim().toLowerCase()
    const normalizedCode = String(code).trim()
    if (!/^\d{6}$/.test(normalizedCode))
      return res.status(400).json({ error: 'Code must be 6 digits' })
    try {
      const { rows } = await db.query(
        `SELECT id, code, attempts, expires_at, consumed_at
           FROM email_otps
          WHERE email = $1 AND purpose = $2 AND consumed_at IS NULL
          ORDER BY created_at DESC
          LIMIT 1`,
        [normalizedEmail, purpose],
      )
      const otp = rows[0]
      const isLocalDevBypass = LOCAL_DEV_OTP !== null && normalizedCode === LOCAL_DEV_OTP

      if (isLocalDevBypass) {
        if (otp) {
          await db.query(`UPDATE email_otps SET consumed_at = now() WHERE id = $1`, [otp.id])
        }
      } else {
        if (!otp) return res.status(400).json({ error: 'No active code. Request a new one.' })
        if (new Date(otp.expires_at).getTime() < Date.now()) {
          return res.status(400).json({ error: 'Code expired. Request a new one.' })
        }
        if (otp.attempts >= OTP_MAX_ATTEMPTS) {
          await db.query(`UPDATE email_otps SET consumed_at = now() WHERE id = $1`, [otp.id])
          return res.status(429).json({ error: 'Too many incorrect attempts. Request a new code.' })
        }
        if (otp.code !== normalizedCode) {
          await db.query(`UPDATE email_otps SET attempts = attempts + 1 WHERE id = $1`, [otp.id])
          return res.status(401).json({
            error: 'Incorrect code.',
            remainingAttempts: Math.max(0, OTP_MAX_ATTEMPTS - (otp.attempts + 1)),
          })
        }

        // Code is valid — consume it and mark user verified
        await db.query(`UPDATE email_otps SET consumed_at = now() WHERE id = $1`, [otp.id])
      }
      const userResult = await db.query(
        'SELECT id, email, name, email_verified FROM users WHERE email = $1',
        [normalizedEmail],
      )
      const user = userResult.rows[0]
      if (!user) return res.status(404).json({ error: 'User not found' })

      if (!user.email_verified) {
        await db.query(`UPDATE users SET email_verified = TRUE WHERE id = $1`, [user.id])

        // Provision Alpha Bot on first verification (deferred from register).
        // Idempotent: if the user already has any agent, this no-ops.
        try {
          const existingAgents = await db.query(
            'SELECT id FROM agents WHERE user_id = $1 LIMIT 1',
            [user.id],
          )
          if (existingAgents.rows.length === 0) {
            const agentId = randomUUID()
            const agentWallet = generateAgentWalletAddr(agentId)
            await db.query(
              `INSERT INTO agents (id, user_id, name, type, wallet_address, risk_limit, strategy)
               VALUES ($1, $2, 'Alpha Bot', 'polymarket', $3, 100, '{"mode":"passive","categories":["politics","crypto","sports"]}')`,
              [agentId, user.id, agentWallet],
            )
          }
        } catch (e: any) {
          console.warn('[verify-otp] Alpha Bot creation failed:', e.message)
        }
      }

      const token = jwt.sign(
        { id: user.id, email: user.email, name: user.name },
        JWT_SECRET,
        { expiresIn: '7d' },
      )

      // Admin-console visibility: tie the verification success back to the
      // pending row so the dashboard shows the full signup → verified arc.
      await db.query(
        `INSERT INTO execution_log (entity_type, entity_id, action, status, detail)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          'auth',
          user.id.slice(0, 100),
          'signup_verified',
          'success',
          JSON.stringify({
            email: user.email.slice(0, 120),
            name: String(user.name || '').slice(0, 80),
            purpose,
          }).slice(0, 1800),
        ],
      ).catch(() => {})

      return res.status(200).json({
        accessToken: token,
        user: { id: user.id, email: user.email, name: user.name },
      })
    } catch (err) {
      console.error('[auth/verify-otp]', err)
      res.status(500).json({ error: 'Verification failed' })
    }
  })

  // POST /auth/resend-otp — regenerate a fresh code for an email+purpose.
  // Same rate-limit as the rest of /auth/*.
  router.post('/auth/resend-otp', rateLimit, async (req, res) => {
    const { email, purpose: rawPurpose } = req.body
    const purpose: 'signup' | 'login' =
      rawPurpose === 'login' ? 'login' : 'signup'
    if (!email) return res.status(400).json({ error: 'email required' })
    const normalizedEmail = String(email).trim().toLowerCase()
    try {
      // Only resend for an existing account (signup) or an existing
      // unverified-login flow. Don't leak whether an email is registered.
      const userResult = await db.query(
        'SELECT id, email_verified FROM users WHERE email = $1',
        [normalizedEmail],
      )
      if (userResult.rows.length === 0) {
        // Pretend we sent — avoids account enumeration. The user will just
        // never receive an email.
        return res.status(202).json({ ok: true })
      }
      const { code } = await issueEmailOtp(db, normalizedEmail, purpose)
      void sendOtpEmail(normalizedEmail, code, purpose)
      return res.status(202).json({ ok: true })
    } catch (err) {
      console.error('[auth/resend-otp]', err)
      // Still return ok-ish so the FE can't distinguish a real failure from
      // a non-existent account.
      res.status(202).json({ ok: true })
    }
  })

  // POST /auth/login (rate limited — 10 attempts per 15 min per IP + per-account lockout after 5 fails)
  router.post('/auth/login', rateLimit, async (req, res) => {
    const { email, password } = req.body
    if (!email || !password)
      return res.status(400).json({ error: 'email and password required' })
    try {
      const result = await db.query('SELECT * FROM users WHERE email = $1', [email])
      const user = result.rows[0]

      // ── ACCOUNT LOCKOUT CHECK ──
      // After 5 failed attempts, account locked for 15 minutes (sliding window)
      const MAX_FAILED_ATTEMPTS = 5
      const LOCKOUT_DURATION_MS = 15 * 60 * 1000
      if (user?.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
        const remainingMin = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000)
        return res.status(423).json({
          error: `Account locked due to too many failed attempts. Try again in ${remainingMin} minute(s).`,
          lockedUntil: user.locked_until,
        })
      }

      const passwordValid = user && await bcrypt.compare(password, user.password_hash)
      if (!user || !passwordValid) {
        // Increment failed attempts + lock if threshold hit
        if (user) {
          const newFailedCount = (user.failed_login_attempts || 0) + 1
          const lockedUntil = newFailedCount >= MAX_FAILED_ATTEMPTS
            ? new Date(Date.now() + LOCKOUT_DURATION_MS)
            : null
          await db.query(
            `UPDATE users SET failed_login_attempts = $1, last_failed_login = now(), locked_until = $2 WHERE id = $3`,
            [newFailedCount, lockedUntil, user.id]
          ).catch(() => {})
          if (lockedUntil) {
            console.warn(`[auth/login] Account locked: ${email} (${newFailedCount} failed attempts)`)
          }
        }
        return res.status(401).json({ error: 'Invalid credentials' })
      }

      // Success — reset failed counter
      if ((user.failed_login_attempts || 0) > 0 || user.locked_until) {
        await db.query(
          `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
          [user.id]
        ).catch(() => {})
      }

      // Day-7 demo-critical: if the account isn't yet email-verified (account
      // created via /auth/register before the OTP was entered), we issue a
      // fresh signup-purpose OTP and return needsVerification — same shape
      // as the register endpoint. The FE pivots to the OTP screen.
      // Existing pre-migration accounts were grandfathered to verified=TRUE
      // so this never fires for them.
      if (user.email_verified === false) {
        try {
          const { code } = await issueEmailOtp(db, user.email, 'signup')
          void sendOtpEmail(user.email, code, 'signup')
        } catch (e: any) {
          console.error('[auth/login] OTP send failed:', e.message)
        }
        return res.status(202).json({ needsVerification: true, email: user.email })
      }

      const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' })

      // Admin-console visibility: surface every successful login. Helps
      // Richard see live activity during the demo and during normal ops.
      await db.query(
        `INSERT INTO execution_log (entity_type, entity_id, action, status, detail)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          'auth',
          user.id.slice(0, 100),
          'login',
          'success',
          JSON.stringify({ email: user.email.slice(0, 120), name: String(user.name || '').slice(0, 80) }).slice(0, 1800),
        ],
      ).catch(() => {})

      res.json({ accessToken: token, user: { id: user.id, email: user.email, name: user.name } })
    } catch (err) {
      console.error('[auth/login]', err)
      res.status(500).json({ error: 'Login failed' })
    }
  })

  // POST /auth/social-login — bridge OAuth identity → Nuro JWT.
  //
  // Context: NextAuth's Google provider on the FE creates a NextAuth session
  // cookie but does NOT give us a Nuro-issued JWT. Our backend requireAuth
  // middleware expects our own jwt.sign'd token. Without this bridge, a Google
  // user's dashboard would call every backend API with an empty Authorization
  // header → 401 silent fail → blank KYC pill, $0 card balance, no txs, etc.
  //
  // Trust model: we require the provider's id_token (a JWT signed by the
  // provider's private key) and verify the signature + audience + issuer +
  // email_verified against the provider's JWKS before trusting any claim.
  // The previous version trusted {email, name} from the request body — that
  // was an impersonation vector if the endpoint was ever reached directly.
  // See src/oauth-verify.ts for the verification logic.
  //
  // Rate-limited to make key-server-flood replay costly.
  router.post('/auth/social-login', rateLimit, async (req, res) => {
    const { provider, id_token } = req.body
    if (!provider || !id_token)
      return res.status(400).json({ error: 'provider and id_token required' })

    // Cryptographic verification — throws on any failure (bad signature,
    // wrong audience, expired, unverified email, etc.).
    let verified
    try {
      verified = await verifyIdToken(provider, id_token)
    } catch (err: any) {
      if (err instanceof OAuthVerifyError) {
        const status =
          err.code === 'unsupported_provider' ? 400 :
          err.code === 'server_misconfigured' ? 500 :
          err.code === 'jwks_fetch_failed' ? 502 :
          401
        console.warn(`[auth/social-login] verify failed code=${err.code}: ${err.message}`)
        return res.status(status).json({ error: err.message, code: err.code })
      }
      console.error('[auth/social-login] unexpected verify error', err)
      return res.status(500).json({ error: 'Verification failed' })
    }

    const { email, name, externalId } = verified

    try {
      // Returning user — find by email and issue fresh Nuro JWT
      const existing = await db.query(
        'SELECT id, email, name FROM users WHERE email = $1',
        [email]
      )
      if (existing.rows.length > 0) {
        const u = existing.rows[0]
        const token = jwt.sign(
          { id: u.id, email: u.email, name: u.name },
          JWT_SECRET,
          { expiresIn: '7d' }
        )
        return res.json({
          accessToken: token,
          user: { id: u.id, email: u.email, name: u.name },
          created: false,
        })
      }

      // New user — create with cryptographically-random placeholder password_hash
      // so column NOT NULL is satisfied but no feasible password can ever match.
      // This user can only sign in via OAuth from this point forward.
      const id = randomUUID()
      const placeholderSecret = randomUUID() + randomUUID()  // ~72 chars of entropy
      const passwordHash = await bcrypt.hash(placeholderSecret, SALT_ROUNDS)
      await db.query(
        'INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)',
        [id, email, name, passwordHash]
      )
      const token = jwt.sign(
        { id, email, name },
        JWT_SECRET,
        { expiresIn: '7d' }
      )

      // Auto-provision Alpha Bot — parity with /auth/register so OAuth users
      // get the same bootstrap experience as password registrants.
      const agentId = randomUUID()
      const agentWallet = generateAgentWalletAddr(agentId)
      await db.query(
        `INSERT INTO agents (id, user_id, name, type, wallet_address, risk_limit, strategy)
         VALUES ($1, $2, 'Alpha Bot', 'polymarket', $3, 100, '{"mode":"passive","categories":["politics","crypto","sports"]}')`,
        [agentId, id, agentWallet]
      ).catch((e: any) => console.warn('[social-login] Alpha Bot creation failed:', e.message))

      console.log(`[auth/social-login] Created OAuth user ${email} (${provider}, sub=${externalId})`)
      return res.status(201).json({
        accessToken: token,
        user: { id, email, name },
        created: true,
      })
    } catch (err) {
      console.error('[auth/social-login]', err)
      return res.status(500).json({ error: 'Social login failed' })
    }
  })

  // GET /auth/me
  router.get('/auth/me', requireAuth, async (req, res) => {
    const userId = (req as any).user.id
    const result = await db.query(
      'SELECT id, email, name, kyc_status, created_at FROM users WHERE id = $1',
      [userId]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' })
    res.json(result.rows[0])
  })

  // POST /api/cli/token
  //
  // Mints a long-lived CLI bearer for the calling user. The session JWT
  // (typically 7d expiry) authenticates the call; we issue a separate
  // 90-day token tagged with `cliToken: true` for terminal use. The flag
  // is informational right now but lets us scope behavior later
  // (e.g. CLI tokens skip embedded-wallet creation hooks that fire on
  //  dashboard logins, or get a dedicated rate-limit bucket).
  //
  // Why not just hand back the session JWT: NextAuth deliberately keeps
  // the session cookie out of client JS, and the CLI shouldn't depend
  // on a 7-day rotating session anyway. Issuing a dedicated token gives
  // users a stable credential they can save once and rotate when they
  // want without it expiring mid-pitch-demo.
  //
  // Token shown ONCE per the CredentialsModal pattern -- the dashboard
  // surface mirrors that with a CopyableSecret + acknowledge checkbox
  // so users save it before closing.
  router.post('/api/cli/token', requireAuth, async (req: any, res: Response) => {
    const u = req.user
    if (!u?.id) return res.status(401).json({ error: 'No user in token' })

    // H1 (auditor 2026-05-07): block CLI tokens from minting fresh CLI
    // tokens. Without this guard, a leaked CLI token grants effectively-
    // permanent access: holder calls /api/cli/token to mint a fresh
    // 90-day token, repeats indefinitely, no revocation list to stop
    // them. Only session JWTs (from a real browser login, no `cliToken`
    // flag in payload) can mint new CLI tokens -- forces the user back
    // through the dashboard auth flow to rotate.
    if (u?.cliToken === true) {
      return res.status(403).json({
        error: 'CLI tokens cannot mint new CLI tokens. Sign in to the dashboard at https://app.nuro.finance to rotate.',
      })
    }

    try {
      const expiresInDays = 90
      const cliToken = jwt.sign(
        { id: u.id, email: u.email, name: u.name, cliToken: true },
        JWT_SECRET,
        { expiresIn: `${expiresInDays}d` },
      )
      res.json({
        token: cliToken,
        expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString(),
        usage: 'nuro auth set <token>',
        note: 'Save this token now. We do not store the plaintext.',
      })
    } catch (err: any) {
      console.error('[cli-token] mint failed:', err)
      res.status(500).json({ error: err?.message || 'Mint failed' })
    }
  })

  // GET /kyc/status
  router.get('/kyc/status', requireAuth, async (req, res) => {
    const userId = (req as any).user.id
    const result = await db.query(
      'SELECT kyc_status, kyc_url, sd3_user_id FROM users WHERE id = $1',
      [userId]
    )
    const user = result.rows[0]
    // Read-side normalization (2026-05-25): legacy DB rows can have raw SD3
    // labels (verified, kyc_complete, passed). Normalize to canonical
    // 'approved' so the KycBanner correctly hides for verified users.
    const normalized = normalizeKycStatus(user?.kyc_status) || 'not_started'
    res.json({
      status:    normalized,
      kycUrl:    user?.kyc_url     || null,
      sd3UserId: user?.sd3_user_id || null,
    })
  })

  // POST /kyc/start
  //
  // Body (optional): { firstName?: string, lastName?: string }
  // FE's KYC modal prompts for first/last name and passes them in. We persist
  // them on the users row (migration 028 columns) and hand them to SD3 as the
  // legal identity. Second-time callers with stored names don't need to pass
  // anything — the stored values are used.
  router.post('/kyc/start', requireAuth, async (req, res) => {
    const userId = (req as any).user.id
    const firstNameIn = typeof req.body?.firstName === 'string' ? req.body.firstName.trim() : ''
    const lastNameIn  = typeof req.body?.lastName  === 'string' ? req.body.lastName.trim()  : ''
    try {
      const userResult = await db.query(
        'SELECT name, email, first_name, last_name, sd3_user_id, kyc_url, kyc_status FROM users WHERE id = $1',
        [userId]
      )
      const user = userResult.rows[0]
      if (!user) return res.status(404).json({ error: 'User not found' })

      // Idempotent — already onboarded, return stored data
      if (user.sd3_user_id) {
        return res.json({
          kycUrl:    user.kyc_url,
          status:    user.kyc_status || 'not_started',
          sd3UserId: user.sd3_user_id,
        })
      }

      // Name resolution precedence:
      //   1. Explicit body (KYC modal prompt) — highest trust
      //   2. Stored first_name / last_name columns (migration 028)
      //   3. Split user.name on whitespace — legacy fallback
      let firstName = firstNameIn || user.first_name || ''
      let lastName  = lastNameIn  || user.last_name  || ''
      if (!firstName || !lastName) {
        const nameParts = (user.name || '').trim().split(/\s+/).filter(Boolean)
        if (!firstName) firstName = nameParts[0] || ''
        if (!lastName)  lastName  = nameParts.slice(1).join(' ') || ''
      }
      // Refuse to onboard with a nonsense name like "PlainPaper PlainPaper" —
      // SD3 requires a real legal name and will later reject the KYC. Better
      // to prompt up front than strand the user mid-flow.
      if (!firstName || !lastName) {
        return res.status(400).json({
          error: 'firstName and lastName required for KYC',
          code: 'name_required',
        })
      }

      const data = await onboardUser(firstName, lastName, user.email)

      const sd3UserId = data.userId
      // SD3 returns { url, params: { userId } }. The browser lands on a bare
      // /kyc and crashes with "Required param userId is missing" if we drop
      // params — so merge them into the URL as query string before storing.
      const kycBase   = data.kycCompletionLink?.url || null
      const kycParams = data.kycCompletionLink?.params || {}
      const kycUrl    = kycBase && Object.keys(kycParams).length > 0
        ? `${kycBase}?${new URLSearchParams(kycParams as Record<string, string>).toString()}`
        : kycBase
      const kycStatus = data.applicationStatus || 'not_started'

      // Persist first/last name alongside KYC state so future flows (card
      // issuance, regulatory exports) don't have to re-derive. Store in both
      // sd3_user_id + issuer_user_id for compat with existing balance/tx routes.
      await db.query(
        `UPDATE users
         SET sd3_user_id = $1, issuer_user_id = $2, kyc_url = $3, kyc_status = $4,
             first_name = COALESCE(NULLIF($5, ''), first_name),
             last_name  = COALESCE(NULLIF($6, ''), last_name)
         WHERE id = $7`,
        [sd3UserId, sd3UserId, kycUrl, kycStatus, firstName, lastName, userId]
      )

      // Auto-create EVM deposit address so monitor watches this user immediately.
      // Migration 027 semantics: deposit_addresses.user_id holds local users.id.
      // HD derivation still seeds from sd3UserId — existing on-chain addresses
      // stay stable across the migration.
      const evmRec = await getDepositAddress(userId, 'evm')
      if (!evmRec) {
        const evmAddr = generateDepositAddress(sd3UserId)
        await saveDepositAddress(userId, 'evm', evmAddr)
      }
      return res.json({ kycUrl, status: kycStatus, sd3UserId })
    } catch (err: any) {
      console.error('[kyc/start]', err?.response?.data || err?.message)
      return res.status(502).json({
        error:   'KYC onboard failed',
        details: err?.response?.data || null,
      })
    }
  })

  // GET /deposit-addresses
  router.get('/deposit-addresses', requireAuth, async (req, res) => {
    const userId = (req as any).user.id
    try {
      const userResult = await db.query(
        'SELECT issuer_user_id FROM users WHERE id = $1', [userId]
      )
      const issuerUserId = userResult.rows[0]?.issuer_user_id
      if (!issuerUserId) {
        return res.status(400).json({ error: 'KYC not completed — verify identity first' })
      }
      // Get/create EVM intermediary address (monitor watches this for non-Base chains)
      // Migration 027: deposit_addresses.user_id = local users.id now.
      // HD derivation + Issuer API calls still use issuerUserId (the SD3 UUID)
      // so on-chain addresses + Issuer-side contract lookup stay stable.
      let evmRecord = await getDepositAddress(userId, 'evm')
      if (!evmRecord) {
        const address = generateDepositAddress(issuerUserId)
        await saveDepositAddress(userId, 'evm', address)
        evmRecord = { address }
      }
      // Issuer Base contract address — cached in deposit_addresses table after first fetch
      let issuerBaseAddress: string | null = null
      const baseRecord = await getDepositAddress(userId, 'base')
      if (baseRecord) {
        issuerBaseAddress = baseRecord.address
      } else {
        try {
          issuerBaseAddress = await getUserBaseDepositAddress(issuerUserId)
          if (issuerBaseAddress) {
            await saveDepositAddress(userId, 'base', issuerBaseAddress)
          }
        } catch { /* not provisioned */ }
      }
      // Solana deposit address — per-user derivation (SHA-512 of master key + userId)
      let solanaRecord = await getDepositAddress(userId, 'solana')
      if (!solanaRecord) {
        try {
          const solanaAddr = generateSolanaDepositAddress(issuerUserId)
          await saveDepositAddress(userId, 'solana', solanaAddr)
          solanaRecord = { address: solanaAddr }
        } catch { /* Solana key not configured */ }
      }
      res.json({
        evm:    evmRecord.address,           // Non-Base chains — monitor bridges to Issuer
        base:   issuerBaseAddress,             // Base direct deposit
        solana: solanaRecord?.address ?? null,
      })
    } catch (err: any) {
      console.error('[GET /deposit-addresses]', err.message)
      res.status(500).json({ error: 'Failed to fetch deposit addresses' })
    }
  })
  // GET /cards
  // Pipeline: FE request → Backend reads DB cache → if Issuer user, sync balance from Issuer → update DB → return
  router.get('/cards', requireAuth, async (req, res) => {
    const userId = (req as any).user.id
    try {
      const result = await db.query(
        'SELECT * FROM cards WHERE user_id = $1 ORDER BY created_at ASC',
        [userId]
      )

      // Sprint D: shared helper — reads Issuer, write-through if drift ≥$0.01,
      // alerts on drift ≥$10, logs every call. Never writes from local calc.
      // Day-4 hardening: SKIP cards without `issuer_card_id` (phantoms /
      // demo deck-stack rows). Without this guard the user-level Issuer
      // balance gets stamped onto every card row, including the phantoms,
      // which trashes the deck-stack visual (all 3 cards read $1.65) AND
      // makes the FE sum lie about totals.
      const userRes = await db.query('SELECT sd3_user_id, issuer_user_id FROM users WHERE id = $1', [userId])
      const issuerUserId = userRes.rows[0]?.sd3_user_id || userRes.rows[0]?.issuer_user_id
      if (issuerUserId && result.rows.length > 0) {
        for (const card of result.rows) {
          if (!card.is_active) continue
          if (!card.issuer_card_id) continue  // phantom — never overwrite
          const oldBalance = parseFloat(card.balance || '0')
          try {
            const outcome = await syncCardBalanceFromIssuer(db, card.id, issuerUserId, oldBalance, 'get_cards')
            if (outcome.newBalance !== null) {
              card.balance = outcome.newBalance.toString()
            }
          } catch (e: any) {
            console.warn(`[GET /cards] sync helper failed for card ${card.id}: ${e.message?.slice(0, 60)}`)
          }
        }
      }

      res.json(result.rows.map(rowToCard))
    } catch (err: any) {
      console.error('[GET /cards]', err.message)
      res.status(500).json({ error: 'Failed to fetch cards' })
    }
  })

  // POST /cards
  // Issuer limits 1 card per user. Strategy:
  // 1. If user has no Issuer card yet → create one via Issuer API
  // 2. If user already has an Issuer card → reuse the issuer_card_id for the new local card
  // 3. If no Issuer user (no KYC) → create local card only, Issuer sync later
  router.post('/cards', requireAuth, async (req, res) => {
    const userId = (req as any).user.id
    const { cardType = 'VISA' } = req.body || {}
    try {
      const userResult = await db.query('SELECT name, sd3_user_id, kyc_status FROM users WHERE id = $1', [userId])
      const user = userResult.rows[0]
      if (!user) return res.status(404).json({ error: 'User not found' })

      const cardHolder = user.name || 'Card Holder'
      const issuerUserId = user.sd3_user_id
      const id = randomUUID()
      const cardNumber = placeholderCardNumber()
      const expiryDate = placeholderExpiryDate()
      const gradient = cardType === 'VIRA'
        ? 'linear-gradient(60deg, #151333 30%, #16e0a9 70%, #8b5cf6 100%)'
        : 'linear-gradient(135deg, #151313 0%, #6a6a6a 30%, #0f0f0f 100%)'

      // Check if user already has an Issuer card from a previous local card
      let existingIssuerCardId: string | null = null
      const existingCards = await db.query(
        'SELECT issuer_card_id FROM cards WHERE user_id = $1 AND issuer_card_id IS NOT NULL LIMIT 1',
        [userId]
      )
      if (existingCards.rows.length > 0) {
        existingIssuerCardId = existingCards.rows[0].issuer_card_id
      }

      // S33 Tier 0 #2: write card_last_4 alongside card_number. Reads now
      // flow through last_4; the parallel write keeps the migration
      // reversible until the follow-up DROP COLUMN migration (042).
      await db.query(
        `INSERT INTO cards (id, user_id, card_number, card_last_4, card_holder, expiry_date, card_type, gradient, balance, is_active, is_locked, issuer_card_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, true, false, $9)`,
        [
          id,
          userId,
          cardNumber,
          cardNumber ? String(cardNumber).slice(-4) : null,
          cardHolder,
          expiryDate,
          cardType,
          gradient,
          existingIssuerCardId,
        ],
      )

      // Issuer card sync: list first, create only if none exist
      // CHANGED from fire-and-forget to AWAITED — user must know if card creation failed
      let issuerSyncStatus = 'skipped'
      let issuerSyncError: string | null = null

      if (issuerUserId && !existingIssuerCardId) {
        try {
          // Step 1: Check if Issuer already has a card for this user
          const issuerCards = await listIssuerCards(issuerUserId)
          let issuerCardId: string | null = null

          if (issuerCards.length > 0) {
            // Issuer already has a card — reuse it (don't try to create)
            issuerCardId = issuerCards[0].cardId || (issuerCards[0] as any).id
            console.log(`[POST /cards] Found existing Issuer card ${issuerCardId} for user ${issuerUserId}`)
            issuerSyncStatus = 'linked'
            await db.query(
              `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, created_at)
               VALUES (gen_random_uuid(), 'issuer_card', $1, 'list_cards', 'success', $2, now())`,
              [id, `Found existing Issuer card: ${issuerCardId}`]
            ).catch(() => {})
          } else {
            // Step 2: No existing card — try to create one
            try {
              issuerCardId = await createCard(issuerUserId)
              console.log(`[POST /cards] Created Issuer card ${issuerCardId} for user ${issuerUserId}`)
              issuerSyncStatus = 'created'
              await db.query(
                `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, created_at)
                 VALUES (gen_random_uuid(), 'issuer_card', $1, 'create_card', 'success', $2, now())`,
                [id, `Created Issuer card: ${issuerCardId}`]
              ).catch(() => {})
            } catch (createErr: any) {
              const errMsg = createErr?.response?.data?.error || createErr?.message || 'Unknown error'
              console.warn(`[POST /cards] Issuer card creation failed: ${errMsg}`)
              issuerSyncStatus = 'failed'
              issuerSyncError = errMsg.slice(0, 200)
              await db.query(
                `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, error_message, created_at)
                 VALUES (gen_random_uuid(), 'issuer_card', $1, 'create_card', 'failed', $2, $3, now())`,
                [id, `Issuer card creation failed for user ${issuerUserId}`, errMsg.slice(0, 200)]
              ).catch(() => {})
            }
          }

          // Step 3: If we got an Issuer card ID, link it and fetch real details
          if (issuerCardId) {
            await db.query('UPDATE cards SET issuer_card_id = $1 WHERE user_id = $2 AND issuer_card_id IS NULL', [issuerCardId, userId])
            try {
              const details = await getCardDetails(issuerCardId)
              if (details.cardNumber || details.expiryDate) {
                await db.query(
                  `UPDATE cards
                      SET card_number = COALESCE($1, card_number),
                          card_last_4 = COALESCE(RIGHT($1, 4), card_last_4),
                          expiry_date = COALESCE($2, expiry_date)
                    WHERE id = $3`,
                  [details.cardNumber, details.expiryDate, id]
                )
                console.log(`[POST /cards] Issuer card details synced for card ${id}`)
              }
            } catch (detailErr: any) {
              console.warn('[POST /cards] Could not fetch Issuer card details:', detailErr?.message)
            }
          }
        } catch (err: any) {
          const errMsg = err?.response?.data?.error || err?.message || 'Unknown error'
          console.warn(`[POST /cards] Issuer card sync failed: ${errMsg}`)
          issuerSyncStatus = 'failed'
          issuerSyncError = errMsg.slice(0, 200)
          await db.query(
            `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, error_message, created_at)
             VALUES (gen_random_uuid(), 'issuer_card', $1, 'sync_card', 'failed', $2, $3, now())`,
            [id, `Issuer card sync failed for user ${issuerUserId}`, errMsg.slice(0, 200)]
          ).catch(() => {})
        }
      } else if (!issuerUserId) {
        issuerSyncStatus = 'no_kyc'
      }

      const result = await db.query('SELECT * FROM cards WHERE id = $1', [id])
      const card = rowToCard(result.rows[0])
      // Surface provisioning status so FE can show warnings
      res.status(201).json({
        ...card,
        issuerSyncStatus,
        issuerSyncError,
      })
    } catch (err: any) {
      console.error('[POST /cards] Error:', err.message || err)
      res.status(500).json({ error: 'Failed to create card' })
    }
  })

  // PATCH /cards/:id
  // ⚠️ S32 SECURITY FIX — `balance` is INTENTIONALLY NOT accepted from the
  // request body. Allowing client-supplied balance combined with the
  // withdrawal balance gate (line ~2774) created an exploit chain:
  // PATCH balance → spoof → withdraw real treasury USDC. The card balance
  // is now sourced from the Issuer (SD3) only, via syncCardBalanceFromIssuer.
  // Updating balance from any user-facing route violates the "Intent Layer
  // records intent. Execution Layer moves real money" principle.
  router.patch('/cards/:id', requireAuth, async (req, res) => {
    const userId = (req as any).user.id
    // Accept both camelCase and snake_case from frontend.
    // NOTE: `balance` deliberately destructured + ignored to make the
    // refusal explicit (rather than silently dropping). If the FE sends
    // it we log so we can find + scrub the offending caller.
    const { isLocked, is_locked, isActive, isDefault, is_default, balance: _rejectedBalance, card_name, cardName, gradient } = req.body
    if (_rejectedBalance !== undefined) {
      console.warn(`[PATCH /cards/${req.params.id}] rejected client-supplied balance from user ${userId} (security: balance is Issuer-authoritative)`)
    }
    const lockValue = isLocked ?? is_locked
    const nameValue = card_name ?? cardName
    const defaultValue = isDefault ?? is_default
    const updates: string[] = []
    const values: any[] = []
    let idx = 1
    if (lockValue !== undefined) { updates.push(`is_locked = $${idx++}`); values.push(lockValue) }
    if (isActive !== undefined)  { updates.push(`is_active = $${idx++}`); values.push(isActive) }
    // ⚠️ balance is NOT settable from this endpoint — see header comment.
    if (nameValue !== undefined) { updates.push(`card_name = $${idx++}`); values.push(nameValue) }
    if (gradient !== undefined) { updates.push(`gradient = $${idx++}`); values.push(gradient) }
    if (defaultValue !== undefined) { updates.push(`is_default = $${idx++}`); values.push(defaultValue) }
    if (req.body.alert_enabled !== undefined) { updates.push(`alert_enabled = $${idx++}`); values.push(req.body.alert_enabled) }
    if (req.body.spend_threshold !== undefined) { updates.push(`spend_threshold = $${idx++}`); values.push(req.body.spend_threshold) }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' })
    // If setting as default, unset all other cards for this user first
    if (defaultValue === true) {
      await db.query(`UPDATE cards SET is_default = false WHERE user_id = $1 AND id != $2`, [userId, req.params.id])
    }
    values.push(req.params.id, userId)
    const result = await db.query(
      `UPDATE cards SET ${updates.join(', ')} WHERE id = $${idx} AND user_id = $${idx + 1} RETURNING *`,
      values
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Card not found' })
    // Sync spend_threshold + alert_enabled to card_controls. Day-5 fix: this
    // used to be a plain UPDATE, which silently matched 0 rows when the user
    // saved settings BEFORE a transaction had auto-created the controls row.
    // Result: cards.spend_threshold=$100 but card_controls.alert_threshold
    // stuck at default $500 → enforcement read the wrong value, so alerts
    // never fired at the user's chosen threshold. Upsert keeps them in sync
    // regardless of which write came first.
    if (req.body.spend_threshold !== undefined) {
      db.query(
        `INSERT INTO card_controls (card_id, user_id, alert_threshold, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (card_id) DO UPDATE
           SET alert_threshold = EXCLUDED.alert_threshold,
               updated_at = now()`,
        [req.params.id, userId, req.body.spend_threshold]
      ).catch((err) => console.warn(`[PATCH /cards/${req.params.id}] alert_threshold upsert failed:`, err?.message))
    }
    if (req.body.alert_enabled !== undefined) {
      db.query(
        `INSERT INTO card_controls (card_id, user_id, alert_enabled, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (card_id) DO UPDATE
           SET alert_enabled = EXCLUDED.alert_enabled,
               updated_at = now()`,
        [req.params.id, userId, req.body.alert_enabled]
      ).catch((err) => console.warn(`[PATCH /cards/${req.params.id}] alert_enabled upsert failed:`, err?.message))
    }
    // Sync freeze state with Issuer API when is_locked changes
    if (lockValue !== undefined) {
      const issuerCardId = result.rows[0].issuer_card_id
      const frozenState = Boolean(lockValue)
      const cardId = result.rows[0].id
      const userId = (req as any).user.id

      if (issuerCardId) {
        // Real Issuer card exists — sync freeze state to Issuer's backend
        try {
          await freezeCard(issuerCardId, frozenState)
          // Log successful freeze/unfreeze to execution_log
          await db.query(
            `INSERT INTO execution_log (id, entity_type, entity_id, action, status, tx_hash, detail, error_message, created_at)
             VALUES (gen_random_uuid(), 'card_freeze', $1, $2, 'success', NULL, $3, NULL, now())`,
            [cardId, frozenState ? 'freeze' : 'unfreeze',
             `Card ${cardId} ${frozenState ? 'frozen' : 'unfrozen'} — Issuer card ${issuerCardId} synced`]
          )
        } catch (err: any) {
          // Issuer sync failed — log the failure but DB state is already updated
          const errMsg = err?.response?.data?.error || err?.message || 'Unknown error'
          await db.query(
            `INSERT INTO execution_log (id, entity_type, entity_id, action, status, tx_hash, detail, error_message, created_at)
             VALUES (gen_random_uuid(), 'card_freeze', $1, $2, 'failed', NULL, $3, $4, now())`,
            [cardId, frozenState ? 'freeze' : 'unfreeze',
             `Card ${cardId} ${frozenState ? 'frozen' : 'unfrozen'} in DB but Issuer sync FAILED`,
             errMsg.slice(0, 200)]
          )
          console.warn(`[PATCH /cards/:id] Issuer freeze sync failed for card ${cardId}:`, errMsg)
        }
      } else {
        // No Issuer card ID — log that freeze is DB-only (execution layer not connected)
        await db.query(
          `INSERT INTO execution_log (id, entity_type, entity_id, action, status, tx_hash, detail, error_message, created_at)
           VALUES (gen_random_uuid(), 'card_freeze', $1, $2, 'skipped', NULL, $3, $4, now())`,
          [cardId, frozenState ? 'freeze' : 'unfreeze',
           `Card ${cardId} ${frozenState ? 'frozen' : 'unfrozen'} in DB only — no Issuer card ID linked`,
           'Issuer card ID is null — card not yet provisioned at Issuer/SD3']
        ).catch(() => {})
      }
    }
    res.json(rowToCard(result.rows[0]))
  })

  // DELETE /cards/:id
  router.delete('/cards/:id', requireAuth, async (req, res) => {
    const userId = (req as any).user.id
    await db.query('DELETE FROM cards WHERE id = $1 AND user_id = $2', [req.params.id, userId])
    res.status(204).send()
  })

  // GET /cards/:id/secrets — fetch real PAN/CVV/expiry from Issuer API
  // This is the ONLY way to get real card secrets. Never store CVV locally.
  // S33 Tier 0 #3: rate limit + audit on /cards/:id/secrets.
  // CVV reveal is the most sensitive endpoint we expose to users; without
  // a cap, a stolen JWT can scrape the PAN+CVV unbounded. 5 reveals/hour
  // per user is generous for legit use (filling forms on 3-4 sites) and
  // tight enough to slow exfiltration. Window is rolling-1h via a simple
  // in-memory map; restart resets it (acceptable — restart frequency is
  // measured in hours, not reveal-attack speed). Every attempt — allowed
  // or denied — appends to execution_log so we have a paper trail.
  const SECRETS_RATE_WINDOW_MS = 60 * 60 * 1000 // 1 hour
  // Day-5 fix: bumped from 5 → 50. The original cap was set when the SD3
  // reveal flow was newly shipped and we were defensive about exfil bursts;
  // in practice 5/hour is too tight even for normal user behavior (any
  // page reload re-fetches), and is debilitating when iterating on the
  // demo. The real exfil signal is rapid-fire bursts, which 50/hour still
  // catches (a malicious automated drainer would blow past 50/hour).
  // Audit still records every reveal in execution_log.
  const SECRETS_RATE_CAP = 50
  const secretsRateLimit = new Map<string, { count: number; windowStart: number }>()

  router.get('/cards/:id/secrets', requireAuth, async (req, res) => {
    const userId = (req as any).user.id
    const { id: cardId } = req.params

    // ── Rate limit (per userId, sliding 1h window) ────────────────────────
    const now = Date.now()
    const entry = secretsRateLimit.get(userId)
    if (entry && now - entry.windowStart < SECRETS_RATE_WINDOW_MS) {
      if (entry.count >= SECRETS_RATE_CAP) {
        const retryAfterSec = Math.ceil(
          (entry.windowStart + SECRETS_RATE_WINDOW_MS - now) / 1000,
        )
        // Audit the denied attempt — exfil patterns show up here as bursts.
        await db
          .query(
            `INSERT INTO execution_log
               (entity_type, entity_id, action, status, detail)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              'card',
              cardId.slice(0, 100),
              'secrets_reveal',
              'rate_limited',
              JSON.stringify({
                userId,
                attemptCount: entry.count,
                cap: SECRETS_RATE_CAP,
                windowMs: SECRETS_RATE_WINDOW_MS,
                ip: req.ip || null,
                userAgent: req.header('user-agent')?.slice(0, 200) || null,
              }),
            ],
          )
          .catch(() => {})
        res.setHeader('Retry-After', String(retryAfterSec))
        return res.status(429).json({
          error: `Too many CVV reveals. Try again in ${retryAfterSec}s.`,
          retryAfterSeconds: retryAfterSec,
        })
      }
      entry.count++
    } else {
      secretsRateLimit.set(userId, { count: 1, windowStart: now })
    }

    try {
      // Verify card belongs to user
      const cardCheck = await db.query(
        'SELECT issuer_card_id FROM cards WHERE id = $1 AND user_id = $2',
        [cardId, userId]
      )
      if (!cardCheck.rows.length) {
        await db
          .query(
            `INSERT INTO execution_log (entity_type, entity_id, action, status, detail)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              'card',
              cardId.slice(0, 100),
              'secrets_reveal',
              'not_found',
              JSON.stringify({ userId, ip: req.ip || null }),
            ],
          )
          .catch(() => {})
        return res.status(404).json({ error: 'Card not found' })
      }

      const issuerCardId = cardCheck.rows[0].issuer_card_id
      if (!issuerCardId) {
        return res.status(404).json({ error: 'Card not yet provisioned with Issuer. Complete KYC first.' })
      }

      // Day-4: real reveal via SD3's encrypted secrets endpoint (RSA-OAEP +
      // fresh-per-call SessionId). Returns full PAN + CVV + MM/YY plain.
      // Falls back to metadata (masked PAN + expiry, null CVV) if reveal
      // is unavailable so the FE always renders something useful.
      // See `.claude/skills/sd3-card-secrets/SKILL.md` for protocol.
      let revealedPan: string | null = null
      let revealedCvv: string | null = null
      let revealedExpiry: string | null = null
      try {
        const real = await getIssuerCardSecrets(issuerCardId)
        if (real) {
          revealedPan = real.pan
          revealedCvv = real.cvv
          // Encrypted secrets endpoint doesn't return expiry — only PAN+CVV.
          // Build expiry from the metadata fields if the response shape
          // included them (plaintext fallback path), else leave for the
          // metadata-merge step below.
          if (real.expMonth && real.expYear) {
            revealedExpiry = `${String(real.expMonth).padStart(2, '0')}/${String(real.expYear).slice(-2)}`
          }
        }
      } catch (revealErr: any) {
        console.warn('[GET /cards/:id/secrets] reveal failed, falling back to metadata:', revealErr?.response?.data || revealErr.message?.slice(0, 120))
      }

      // Always also fetch metadata — the encrypted /secrets endpoint omits
      // expiry, so we need /cards/:id to fill it in. Cheap call, idempotent,
      // also gives us a graceful fallback if reveal failed entirely.
      const meta = await getIssuerCardNumber(issuerCardId)
      if (!revealedPan) {
        // Reveal failed or returned null — surface metadata so the FE still
        // gets last4 + expiry rendered instead of a 404.
        if (!meta) {
          return res.status(404).json({ error: 'Could not retrieve card details from Issuer' })
        }
        revealedPan = meta.cardNumber  // already masked '•••• •••• •••• 1234'
        revealedExpiry = meta.expiryDate
        // revealedCvv stays null
      } else if (!revealedExpiry && meta?.expiryDate) {
        // Reveal succeeded but expiry was missing from its payload — patch
        // from metadata.
        revealedExpiry = meta.expiryDate
      }

      // Also update DB with latest PAN/expiry (NEVER CVV — PCI-DSS 3.2.2).
      // Only persist last 4 digits of the PAN. The full PAN is ephemeral
      // here — we don't write the full pan column even if we have it.
      if (revealedPan || revealedExpiry) {
        const last4Source = revealedPan ? revealedPan.replace(/\D/g, '').slice(-4) : null
        await db.query(
          `UPDATE cards
              SET card_last_4 = COALESCE($1, card_last_4),
                  expiry_date = COALESCE($2, expiry_date)
            WHERE id = $3`,
          [last4Source, revealedExpiry, cardId]
        ).catch(() => {})
      }

      // Audit successful reveal — the canonical "PAN was viewed" record.
      // We do NOT log the PAN/CVV themselves (that defeats the audit's
      // purpose); only the fact that user X revealed card Y at time T,
      // plus whether full reveal succeeded vs metadata fallback.
      await db
        .query(
          `INSERT INTO execution_log (entity_type, entity_id, action, status, detail)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            'card',
            cardId.slice(0, 100),
            'secrets_reveal',
            'success',
            JSON.stringify({
              userId,
              issuerCardId: String(issuerCardId).slice(0, 100),
              ip: req.ip || null,
              userAgent: req.header('user-agent')?.slice(0, 200) || null,
              attemptInWindow: secretsRateLimit.get(userId)?.count ?? 1,
              fullReveal: !!revealedCvv,
            }),
          ],
        )
        .catch(() => {})

      res.json({
        cardNumber: revealedPan,
        expiryDate: revealedExpiry,
        cvv: revealedCvv,
      })
    } catch (err: any) {
      console.error('[GET /cards/:id/secrets]', err?.response?.data || err.message)
      // Audit the error too — operator wants to see SD3 outage spikes.
      await db
        .query(
          `INSERT INTO execution_log (entity_type, entity_id, action, status, error_message, detail)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            'card',
            cardId.slice(0, 100),
            'secrets_reveal',
            'error',
            String(err?.message || 'unknown').slice(0, 500),
            JSON.stringify({ userId, ip: req.ip || null }),
          ],
        )
        .catch(() => {})
      res.status(500).json({ error: 'Failed to fetch card secrets' })
    }
  })

  // POST /cards/:id/report-lost — user reports card as lost or stolen.
  // S33 Tier 1 #7: the FE button (CardDetails.tsx ~line 415) was wired to
  // a callback prop that nobody passed in, so clicking did nothing. This
  // endpoint backs that button. Flow:
  //   1. Verify card ownership (requireAuth + WHERE user_id = $userId)
  //   2. Freeze with Issuer (calls freezeCard(issuer_card_id) — the same
  //      Issuer call that powers the existing Toggle Freeze button, so we
  //      reuse that mechanism for the actual block on transaction approval)
  //   3. Mark cards.is_locked = true locally so FE reflects immediately
  //   4. INSERT card_alerts row with alert_type='lost_stolen' for the
  //      operator-visible incident trail (admin console reads this table)
  //   5. execution_log audit row + HELM-CTRL event for cross-system trace
  //
  // Reason captured in body so support can distinguish lost vs stolen vs
  // other (matters for fraud-claim downstream — e.g. stolen → file police
  // report; lost → just lock + reissue).
  router.post('/cards/:id/report-lost', requireAuth, async (req: any, res: Response) => {
    const userId = req.user.id
    const cardId = req.params.id
    const reason = String(req.body?.reason || 'lost').toLowerCase().trim()
    const note = String(req.body?.note || '').slice(0, 500)
    if (!['lost', 'stolen', 'other'].includes(reason)) {
      return res.status(400).json({ error: "reason must be one of: 'lost', 'stolen', 'other'" })
    }

    // S33 Tier 1 #13: scan user note. The note is stored in card_alerts
    // (operator inbox) — same poisoning concerns as other user-authored
    // text fields. Empty note (the common case) is no-op.
    if (note) {
      try {
        const { scanAndEmit } = await import('./helm/ingress-scanner')
        await scanAndEmit({
          text: note,
          source: 'card-report-lost-note',
          agentId: userId,
        })
      } catch (err: any) {
        if (err?.action === 'block' || err?.action === 'quarantine') {
          return res.status(422).json({ error: 'rejected_by_ingress_scanner', detail: err?.message?.slice(0, 200), ruleId: err?.ruleId })
        }
      }
    }

    try {
      // 1. Verify ownership
      const cardCheck = await db.query(
        'SELECT id, issuer_card_id, is_locked FROM cards WHERE id = $1 AND user_id = $2',
        [cardId, userId],
      )
      if (!cardCheck.rows.length) return res.status(404).json({ error: 'Card not found' })
      const card = cardCheck.rows[0]

      // 2. Idempotent: if already in 'lost_stolen' incident state in the
      //    last 24h, just return success (don't double-alert support).
      const recentReport = await db.query(
        `SELECT id FROM card_alerts
          WHERE card_id = $1
            AND alert_type = 'lost_stolen'
            AND created_at > now() - interval '24 hours'
          LIMIT 1`,
        [cardId],
      )
      if (recentReport.rows.length > 0) {
        return res.status(202).json({
          cardId,
          status: 'already_reported',
          message: 'Card already reported lost/stolen in the last 24h. Support is on it.',
          alertId: recentReport.rows[0].id,
        })
      }

      // 3. Freeze with Issuer — this is the Execution Layer block that
      //    actually prevents transactions from being authorized. If the
      //    Issuer call fails, we still lock locally so the user gets the
      //    immediate "frozen" visual; operator gets surfaced via the
      //    error_message in the audit row to retry the Issuer freeze.
      let issuerFreezeStatus: 'success' | 'failed' | 'no-issuer-id' = 'no-issuer-id'
      let issuerFreezeError: string | null = null
      if (card.issuer_card_id) {
        try {
          await freezeCard(card.issuer_card_id, true)
          issuerFreezeStatus = 'success'
        } catch (err: any) {
          issuerFreezeStatus = 'failed'
          issuerFreezeError = String(err?.message || err).slice(0, 200)
          console.warn(`[POST /cards/:id/report-lost] Issuer freeze failed for card ${cardId}: ${issuerFreezeError}`)
        }
      }

      // 4. Local lock (always — even if Issuer freeze failed, the user
      //    must SEE the card as frozen, and admin can retry Issuer side).
      await db.query(
        'UPDATE cards SET is_locked = true, updated_at = now() WHERE id = $1',
        [cardId],
      )

      // 5. Incident record in card_alerts
      const alertRes = await db.query(
        `INSERT INTO card_alerts (id, card_id, user_id, alert_type, description, resolved)
         VALUES (gen_random_uuid(), $1, $2, 'lost_stolen', $3, false)
         RETURNING id`,
        [
          cardId,
          userId,
          `Card reported ${reason}${note ? ` — ${note}` : ''}. Issuer freeze: ${issuerFreezeStatus}.`,
        ],
      )

      // 6. Audit trail (execution_log) — operator dashboard reads this.
      await db.query(
        `INSERT INTO execution_log (entity_type, entity_id, action, status, error_message, detail)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          'card',
          cardId,
          'report_lost_stolen',
          issuerFreezeStatus === 'failed' ? 'partial' : 'success',
          issuerFreezeError,
          JSON.stringify({
            userId,
            reason,
            note,
            issuerFreezeStatus,
            issuerCardId: card.issuer_card_id,
            alertId: alertRes.rows[0].id,
            ip: req.ip || null,
            userAgent: req.header('user-agent')?.slice(0, 200) || null,
          }),
        ],
      ).catch(() => {})

      res.status(202).json({
        cardId,
        status: issuerFreezeStatus === 'success' ? 'frozen' : 'frozen_pending_issuer',
        reason,
        alertId: alertRes.rows[0].id,
        message:
          issuerFreezeStatus === 'success'
            ? 'Card frozen. Support will reach out to confirm and arrange replacement.'
            : 'Card locally locked; Issuer freeze pending operator retry. Support will follow up.',
      })
    } catch (err: any) {
      console.error('[POST /cards/:id/report-lost]', err?.message)
      res.status(500).json({ error: 'Failed to report card. Try again or contact support.' })
    }
  })

  // GET /card-transactions

  // ── Card Controls ────────────────────────────────────────────────────────────

  // GET /cards/:id/controls — fetch limits + live usage
  router.get('/cards/:id/controls', requireAuth, async (req, res) => {
    const userId = (req as any).user.id;
    const { id: cardId } = req.params;
    try {
      // Verify card belongs to this user
      const cardCheck = await db.query(
        "SELECT id FROM cards WHERE id = $1 AND user_id = $2",
        [cardId, userId]
      );
      if (cardCheck.rows.length === 0) return res.status(404).json({ error: 'Card not found' });

      // Upsert defaults if no controls row yet
      await db.query(`
        INSERT INTO card_controls (card_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT (card_id) DO NOTHING`,
        [cardId, userId]
      );

      // Reset daily usage if past midnight UTC
      await db.query(`
        UPDATE card_controls
        SET daily_used = 0, daily_reset_at = now()
        WHERE card_id = $1
          AND (daily_reset_at IS NULL OR daily_reset_at < date_trunc('day', now() AT TIME ZONE 'UTC'))`,
        [cardId]
      );

      // Reset monthly usage if past 1st of month UTC
      await db.query(`
        UPDATE card_controls
        SET monthly_used = 0, monthly_reset_at = now()
        WHERE card_id = $1
          AND (monthly_reset_at IS NULL OR monthly_reset_at < date_trunc('month', now() AT TIME ZONE 'UTC'))`,
        [cardId]
      );

      const result = await db.query(
        "SELECT * FROM card_controls WHERE card_id = $1",
        [cardId]
      );
      return res.json(rowToCardControls(result.rows[0]));
    } catch (err: any) {
      console.error('[card-controls GET]', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PATCH /cards/:id/controls — update limits
  router.patch('/cards/:id/controls', requireAuth, async (req, res) => {
    const userId = (req as any).user.id;
    const { id: cardId } = req.params;
    const body = req.body || {};
    const {
      daily_limit,
      monthly_limit,
      velocity_per_hr,
      alert_threshold,
      alert_enabled,
      intl_enabled,
      online_enabled,
      atm_enabled,
      contactless_enabled
    } = body;
    // Accept both frontend name (per_tx_limit) and DB column name (per_transaction_limit)
    const per_transaction_limit = body.per_transaction_limit ?? body.per_tx_limit;
    try {
      const cardCheck = await db.query(
        "SELECT id FROM cards WHERE id = $1 AND user_id = $2",
        [cardId, userId]
      );
      if (cardCheck.rows.length === 0) return res.status(404).json({ error: 'Card not found' });

      // Ensure row exists
      await db.query(`
        INSERT INTO card_controls (card_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT (card_id) DO NOTHING`,
        [cardId, userId]
      );

      // Build dynamic SET clause for only provided fields
      const updates: string[] = [];
      const values: any[] = [];
      let idx = 1;
      const allowed: Record<string, any> = {
        daily_limit, monthly_limit, per_transaction_limit, velocity_per_hr,
        alert_threshold, alert_enabled,
        intl_enabled, online_enabled, atm_enabled, contactless_enabled
      };
      for (const [key, val] of Object.entries(allowed)) {
        if (val !== undefined) {
          updates.push(`${key} = $${idx++}`);
          values.push(val);
        }
      }
      if (updates.length === 0) return res.status(400).json({ error: 'No fields provided' });

      updates.push(`updated_at = now()`);
      values.push(cardId);

      await db.query(
        `UPDATE card_controls SET ${updates.join(', ')} WHERE card_id = $${idx}`,
        values
      );

      const result = await db.query(
        "SELECT * FROM card_controls WHERE card_id = $1",
        [cardId]
      );
      return res.json(rowToCardControls(result.rows[0]));
    } catch (err: any) {
      console.error('[card-controls PATCH]', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /cards/:id/controls/alerts — recent abnormality alerts
  router.get('/cards/:id/controls/alerts', requireAuth, async (req, res) => {
    const userId = (req as any).user.id;
    const { id: cardId } = req.params;
    try {
      const cardCheck = await db.query(
        "SELECT id FROM cards WHERE id = $1 AND user_id = $2",
        [cardId, userId]
      );
      if (cardCheck.rows.length === 0) return res.status(404).json({ error: 'Card not found' });

      const result = await db.query(
        "SELECT * FROM card_alerts WHERE card_id = $1 ORDER BY created_at DESC LIMIT 50",
        [cardId]
      );
      return res.json(result.rows);
    } catch (err: any) {
      console.error('[card-alerts GET]', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─── Per-card agent chat (Nuro Finance Financial text box) ───────────────
  // Spec: AFI/Neural Net/Claude Memory/Per-Card Agent System Spec.md
  // Schema: migration 051_card_agent_chat.sql (card_agent_personas + card_agent_messages)
  // Personas: src/lib/card-agent-personas.ts (banker / concierge / cfo)
  //
  // Three endpoints:
  //   POST  /cards/:id/chat        → user sends a message, agent responds (non-streaming MVP)
  //   GET   /cards/:id/messages    → conversation history (paged, newest first)
  //   GET   /cards/:id/persona     → current persona config for this card
  //   PATCH /cards/:id/persona     → swap persona / toggle memory
  //
  // Auth: requireAuth + card ownership check (user owns card).
  // POST /cards/:id/chat is BYOK-only (openai | anthropic | gemini in body).
  // Server ANTHROPIC_API_KEY is deprecated for card chat (see getAnthropic note).

  /**
   * Lazy-singleton Anthropic client.
   * @deprecated For per-card chat — use BYOK apiKey on POST /cards/:id/chat.
   * Still used by self-learn report generation (POST /users/me/reports).
   */
  let _anthropicClient: Anthropic | null = null;
  function getAnthropic(): Anthropic {
    if (_anthropicClient) return _anthropicClient;
    const key = process.env.ANTHROPIC_API_KEY || CONFIG.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY not set in env or config');
    _anthropicClient = new Anthropic({ apiKey: key });
    return _anthropicClient;
  }

  /** Pull live card context for the system prompt (balance, name, recent merchants). */
  async function buildCardContext(cardId: string, userId: string): Promise<CardContext | null> {
    // 2026-05-25 fix: removed JOIN to card_limits — that table doesn't exist
    // in the current schema (caused "relation \"card_limits\" does not exist"
    // in production). Spending limits aren't in the DB yet; system prompt
    // gracefully handles spendingLimitMonthly=null already.
    // 2026-05-25 fix: column is c.card_last_4 (per migration 041 — S33
    // Tier 0 PAN retirement). Earlier draft used c.last_4 which doesn't
    // exist. Migration log shows the column was added 7d before this
    // chat endpoint shipped, so we need the qualified name.
    const cardRes = await db.query(
      `SELECT c.id, c.card_name, c.card_type, c.card_last_4, c.balance, c.is_locked
       FROM cards c
       WHERE c.id = $1 AND c.user_id = $2`,
      [cardId, userId],
    );
    if (cardRes.rows.length === 0) return null;
    const row = cardRes.rows[0];

    const merchantsRes = await db.query(
      `SELECT DISTINCT COALESCE(merchant_name, merchant_category_raw, 'Unknown') AS merchant
       FROM card_transactions
       WHERE card_id = $1
       ORDER BY merchant
       LIMIT 8`,
      [cardId],
    ).catch(() => ({ rows: [] as Array<{ merchant: string }> }));

    return {
      cardName: String(row.card_name || row.card_type || 'Unnamed card'),
      cardType: row.card_type ?? null,
      cardLast4: row.card_last_4 ?? null,
      balanceUsd: row.balance == null ? null : Number(row.balance),
      spendingLimitMonthly: null, // limits table doesn't exist yet
      recentMerchants: merchantsRes.rows.map((r) => r.merchant).filter(Boolean),
      isFrozen: Boolean(row.is_locked),
    };
  }

  /** Get-or-create persona row for a card. */
  async function getOrCreatePersona(cardId: string, cardType: string | null): Promise<{ persona: PersonaKey; memoryEnabled: boolean }> {
    const existing = await db.query(
      'SELECT persona, memory_enabled FROM card_agent_personas WHERE card_id = $1',
      [cardId],
    );
    if (existing.rows.length > 0) {
      return {
        persona: existing.rows[0].persona as PersonaKey,
        memoryEnabled: Boolean(existing.rows[0].memory_enabled),
      };
    }
    const seeded = defaultPersonaForCardType(cardType);
    await db.query(
      'INSERT INTO card_agent_personas (card_id, persona) VALUES ($1, $2) ON CONFLICT (card_id) DO NOTHING',
      [cardId, seeded],
    );
    return { persona: seeded, memoryEnabled: true };
  }

  router.post('/cards/:id/chat', requireAuth, async (req: any, res: Response) => {
    const userId = (req as any).user.id;
    const { id: cardId } = req.params;
    const userMessage = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const byokApiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';
    const byokProvider = typeof req.body?.provider === 'string' ? req.body.provider.trim() : '';

    if (!userMessage || userMessage.length > 4000) {
      return res.status(400).json({ error: 'message is required (1..4000 chars)' });
    }

    const validProviders: ChatLlmProvider[] = ['openai', 'anthropic', 'gemini'];
    const tier = req.body?.tier === 'smart' ? 'smart' : 'fast';

    // BYOK-only — server ANTHROPIC_API_KEY path deprecated (no company/shared key).
    if (!byokApiKey || byokApiKey.length < 10) {
      return res.status(401).json({
        error:
          'Connect an API key in Nuro AI settings. Card chat requires your own key (OpenAI, Anthropic, or Gemini).',
      });
    }
    if (!validProviders.includes(byokProvider as ChatLlmProvider)) {
      return res.status(400).json({
        error: 'provider must be openai, anthropic, or gemini',
      });
    }
    const provider = byokProvider as ChatLlmProvider;
    const apiKey = byokApiKey;

    try {
      // Card ownership + context lookup.
      const ctx = await buildCardContext(cardId, userId);
      if (!ctx) return res.status(404).json({ error: 'Card not found' });

      const { persona, memoryEnabled } = await getOrCreatePersona(cardId, ctx.cardType);

      // Load last N messages for context (only if memory is on).
      // Spec Q3: persistent memory default ON; user can clear via card settings.
      const HISTORY_LIMIT = 20;
      const historyRes = memoryEnabled
        ? await db.query(
            `SELECT role, content FROM card_agent_messages
             WHERE card_id = $1 AND role IN ('user', 'assistant')
             ORDER BY created_at DESC
             LIMIT $2`,
            [cardId, HISTORY_LIMIT],
          )
        : { rows: [] as Array<{ role: 'user' | 'assistant'; content: string }> };
      const history = historyRes.rows.reverse(); // chronological

      // Build the message list: history + this turn's user message.
      const messages = [
        ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: userMessage },
      ];

      // .self_learn signal injection (2026-05-25 — migration 052):
      // Load recent user-level signals (card creations, KYC milestones,
      // reloads, prior chat across all cards, persona swaps, etc.) and
      // attach them to the system prompt so the agent answers with
      // awareness of the user's broader behavior, not just THIS card.
      // The agent is still scoped to THIS card — the signals are context.
      const recentSignals = await loadRecentSignals(db as any, userId, 25);
      const selfLearnBlock = `\n\n--- USER .self_learn ACTIVITY (last 25 events, newest first) ---\n${formatSignalsForPrompt(recentSignals)}\n\nWhen answering, draw on this activity only when it's directly relevant. Don't recite the list. Don't reveal you have access to it unless asked.`;

      const system = buildSystemPrompt(persona, ctx) + selfLearnBlock;

      // M12 tool-use loop — OpenAI / Anthropic / Gemini BYOK.
      // See lib/card-agent-chat-loop.ts.
      const toolCtx: CardChatContext = {
        db: db as any,
        cardId,
        userId,
      };

      const {
        assistantText,
        toolsFired,
        stateChanges: accumulatedStateChanges,
        inputTokensTotal,
        outputTokensTotal,
        model: MODEL,
      } = await runCardAgentChatTurn({
        provider,
        apiKey,
        tier,
        system,
        messages,
        toolCtx,
      });

      // Persist user message + assistant response in a single tx. Token
      // totals reflect the full multi-turn loop (input + output summed
      // across every Anthropic round-trip).
      await db.query('BEGIN');
      try {
        await db.query(
          `INSERT INTO card_agent_messages (card_id, user_id, role, content)
           VALUES ($1, $2, 'user', $3)`,
          [cardId, userId, userMessage],
        );
        await db.query(
          // M12 Day 2 (2026-05-29 migration 053): tools_fired array persists
          // the names of tools invoked on this turn, so the trust-signal pill
          // in the UI survives history reload AND Agent Smith can cross-
          // reference against assistant content for lie detection.
          `INSERT INTO card_agent_messages
             (card_id, user_id, role, content, prompt_tokens, completion_tokens, model, tools_fired)
           VALUES ($1, $2, 'assistant', $3, $4, $5, $6, $7)`,
          [
            cardId,
            userId,
            assistantText,
            inputTokensTotal || null,
            outputTokensTotal || null,
            MODEL,
            toolsFired.length > 0 ? toolsFired : null,
          ],
        );
        await db.query('COMMIT');
      } catch (txErr) {
        await db.query('ROLLBACK').catch(() => {});
        throw txErr;
      }

      // M12 inline drift detector (2026-05-29 conservative MVP).
      // Bug Richard reported: "I asked my card if it could freeze itself —
      // it lied and said yes — then it did nothing." Smith's full Claude-
      // pass detector lands later in M12, but for the specific bug pattern
      // we ALREADY have enough info on every turn — assistant text +
      // toolsFired array. Fire the simplest possible regex sieve right
      // here: if the reply claims a freeze/unfreeze happened AND no
      // freeze tool actually fired, log a drift violation. Conservative
      // pattern set chosen so false-positives stay near zero. Real users
      // will hit this if and only if the model regresses to the original
      // bug — exactly what we want to alarm on.
      try {
        const claimedFreeze = /\b(?:froze|frozen|freezing|i'?ll freeze|i have frozen|i'?ve frozen)\b/i.test(assistantText);
        const claimedUnfreeze = /\b(?:unfroze|unfrozen|unfreezing|i'?ll unfreeze|i have unfrozen|i'?ve unfrozen)\b/i.test(assistantText);
        const freezeFired = toolsFired.includes('freeze_card');
        const unfreezeFired = toolsFired.includes('unfreeze_card');
        const violations: Array<{ promise: string; expected: string }> = [];
        if (claimedFreeze && !freezeFired) {
          violations.push({ promise: assistantText.slice(0, 500), expected: 'freeze_card' });
        }
        if (claimedUnfreeze && !unfreezeFired) {
          violations.push({ promise: assistantText.slice(0, 500), expected: 'unfreeze_card' });
        }
        for (const v of violations) {
          await db.query(
            `INSERT INTO agent_violations
              (card_id, user_id, message_id, promise_text, expected_tool, actual_tools, severity, user_thumbs_down)
              VALUES ($1, $2, NULL, $3, $4, $5, 'drift', false)`,
            [cardId, userId, v.promise, v.expected, toolsFired.length > 0 ? toolsFired : null],
          ).catch((insertErr) => {
            console.warn('[chat drift detector] insert failed:', insertErr?.message);
          });
        }
      } catch (driftErr: any) {
        // Drift detection is best-effort — never let it block the chat reply.
        console.warn('[chat drift detector] failed:', driftErr?.message);
      }

      // M12 UI-state-sync lock (Richard 2026-05-29): include any
      // stateChange patches the executed tools returned. The chat UI
      // dispatches each to Redux + invalidates React Query so every
      // visible card surface flips state in the same frame as the agent
      // reply. The tool is not complete until the UI reflects it.
      return res.json({
        message: assistantText,
        persona,
        usage: {
          prompt_tokens: inputTokensTotal || null,
          completion_tokens: outputTokensTotal || null,
        },
        stateChanges: accumulatedStateChanges,
        // Trust-signal pill: list of tool names that fired in this turn.
        // The chat UI renders a small chip per name under the assistant
        // message — concrete proof of what the agent actually did.
        toolsFired,
      });
    } catch (err: any) {
      console.error('[POST /cards/:id/chat]', err?.message || err);
      const msg = err?.message?.slice(0, 200) || 'Chat failed';
      return res.status(500).json({ error: msg });
    }
  });

  router.get('/cards/:id/messages', requireAuth, async (req: any, res: Response) => {
    const userId = (req as any).user.id;
    const { id: cardId } = req.params;
    const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200);

    try {
      // Ownership check.
      const owns = await db.query(
        'SELECT 1 FROM cards WHERE id = $1 AND user_id = $2',
        [cardId, userId],
      );
      if (owns.rows.length === 0) return res.status(404).json({ error: 'Card not found' });

      const result = await db.query(
        // M12 Day 2 (2026-05-29): include tools_fired so the trust-signal
        // pill rehydrates on history reload. Aliased to toolsFired (camel)
        // so the frontend ChatMessage type binds cleanly.
        `SELECT id, role, content, created_at, tools_fired AS "toolsFired"
         FROM card_agent_messages
         WHERE card_id = $1 AND role IN ('user', 'assistant')
         ORDER BY created_at DESC
         LIMIT $2`,
        [cardId, limit],
      );
      // Return chronological so frontend can render top-to-bottom.
      return res.json({ messages: result.rows.reverse() });
    } catch (err: any) {
      console.error('[GET /cards/:id/messages]', err?.message || err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─── Phase 2 .self_learn: report generation ────────────────────────────────
  //
  // POST /users/me/reports
  //   Body: {
  //     cadence: 'weekly' | 'quarterly' | 'yearly' | 'custom'
  //     customDescription?: string   // free-text when cadence='custom'
  //     kind?: 'learning' | 'risk' | 'opportunity'  // default 'learning'
  //   }
  //   Returns: { id, title, body_markdown, cadence, kind, signals_count }
  //
  // Pulls user_signals for the chosen window, asks Claude to synthesize a
  // personalized report in the requested kind, persists to self_learn_reports
  // (per migration 052 — spec ratified ticket #15).
  router.post('/users/me/reports', requireAuth, async (req: any, res: Response) => {
    const userId = (req as any).user.id;
    const cadenceRaw = String(req.body?.cadence || 'weekly');
    const kindRaw = String(req.body?.kind || 'learning');
    const customDescription = typeof req.body?.customDescription === 'string'
      ? req.body.customDescription.slice(0, 500).trim()
      : '';

    const validCadences = ['weekly', 'quarterly', 'yearly', 'custom'] as const;
    const validKinds = ['learning', 'risk', 'opportunity'] as const;
    const cadence = (validCadences as readonly string[]).includes(cadenceRaw)
      ? (cadenceRaw as typeof validCadences[number])
      : 'weekly';
    const kind = (validKinds as readonly string[]).includes(kindRaw)
      ? (kindRaw as typeof validKinds[number])
      : 'learning';

    if (cadence === 'custom' && !customDescription) {
      return res.status(400).json({ error: 'customDescription is required when cadence=custom' });
    }

    try {
      // Pull signals in the cadence window. Custom routes the full year so
      // the model can pick the slice that matches the user's description.
      const sinceIso = cadenceToSinceIso(cadence);
      const signals = await loadSignalsInWindow(db as any, userId, sinceIso, 500);

      // Build a compact bullet list of activity for the prompt. We cap at 80
      // bullets to keep token cost predictable; if the user has >80 signals
      // in the window we show the newest 80 (formatSignalsForPrompt itself
      // hard-caps at 15 internally for the chat injection — but the report
      // generator wants more so we format here directly).
      const signalLines = signals.slice(0, 80).map((s) => {
        const ago = new Date(s.created_at).toISOString().slice(0, 10);
        const payloadKeys = Object.keys(s.payload || {}).slice(0, 6);
        const detail = payloadKeys
          .map((k) => `${k}=${JSON.stringify((s.payload as any)[k])?.slice(0, 60)}`)
          .join(', ');
        return `- ${ago} | ${s.signal_type}${detail ? ` | ${detail}` : ''}`;
      });

      const cadenceLabel = cadence === 'custom'
        ? `custom (user said: "${customDescription}")`
        : cadence;

      // Kind-specific framing per spec Q ratification.
      const kindGuide: Record<typeof kind, string> = {
        learning:
          'A LEARNING report: what patterns has this user developed in how they manage money on Nuro? What are their habits, their preferences, what cards they reach for, what they ask the agent. Reflect their behavior back to them in a way that feels like getting to know yourself better.',
        risk:
          'A RISK report: what spending or behavioral patterns might trip them up? Concentration in one merchant, frequent freezes, balance shocks, late KYC, etc. Tone: a careful friend pointing out things they might not see. NEVER alarmist. NEVER prescriptive about life choices.',
        opportunity:
          'An OPPORTUNITY report: what could they do next on Nuro that would meaningfully improve their financial position? New card use-cases, swap/yield moves their behavior suggests, agent personas that might fit better. Tone: a smart friend who knows the product.',
      };

      const system = [
        'You are the user\'s personal financial neural net. You read their .self_learn activity log and write them a personalized report.',
        '',
        `Report kind: ${kind}`,
        kindGuide[kind],
        '',
        `Cadence: ${cadenceLabel}`,
        cadence === 'custom'
          ? 'The user gave a free-text window description. Interpret it against the activity below — if "last month" pick the last 30 days, if "since I joined" use the full window, etc.'
          : 'Cover the entire cadence window.',
        '',
        'Format: Markdown. Start with a SHORT title (one line, ## prefix, no quotes). Then 3–6 short sections, each with a ### heading and 2–4 lines of prose. Use bullet lists sparingly — only for genuine lists. Total length: 250–500 words. No fluff. No disclaimers. No "as your personal AI" preambles.',
        '',
        'Voice: warm but not saccharine. Specific over generic. Cite specific signals when concrete ("On May 14 you froze your Amazon Orders card"). Never reveal the raw payload structure or that you\'re reading a JSON log. Speak as if you\'ve been watching their journey on Nuro.',
        '',
        'If the activity is sparse (under 5 signals), say so honestly and suggest things they could do to give the neural net more to work with. Do not invent activity.',
      ].join('\n');

      const userPrompt = signalLines.length === 0
        ? `(The user has no recorded activity in this window. Tell them so and suggest 2-3 things they could do on Nuro to start building their .self_learn footprint.)`
        : `Here is the user's .self_learn activity for the ${cadenceLabel} window:\n\n${signalLines.join('\n')}\n\nWrite the ${kind} report.`;

      const anthropic = getAnthropic();
      const MODEL = process.env.SELF_LEARN_MODEL || process.env.CARD_AGENT_MODEL || 'claude-sonnet-4-5';
      const completion = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1500,
        system,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const bodyMarkdown = completion.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('')
        .trim();

      // Extract title from first markdown heading; fallback to a generated one.
      const titleMatch = bodyMarkdown.match(/^#{1,3}\s+(.+?)$/m);
      const title = titleMatch
        ? titleMatch[1].trim().slice(0, 200)
        : `${kind.charAt(0).toUpperCase() + kind.slice(1)} report — ${cadenceLabel}`;

      // Persist. signal_ids array captures which rows fed this generation so
      // we can debug / replay later (per migration 052 comment).
      const signalIds = signals.map((s) => s.id);
      const inserted = await db.query(
        `INSERT INTO self_learn_reports
           (user_id, report_kind, title, body_markdown, signal_ids, signals_count,
            trigger, model, prompt_tokens, completion_tokens)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, created_at`,
        [
          userId,
          kind,
          title,
          bodyMarkdown,
          signalIds,
          signals.length,
          'on_demand',
          MODEL,
          completion.usage?.input_tokens ?? null,
          completion.usage?.output_tokens ?? null,
        ],
      );

      const reportId = inserted.rows[0]?.id;

      // Emit a signal that we generated this report — so future reports
      // can see "user requested 3 weekly reports in the last month" as
      // a meta-pattern.
      voidSafe(emitSignal({
        db: db as any,
        userId,
        type: 'self_learn.report_generated',
        payload: { report_id: reportId, kind, cadence, signals_count: signals.length },
        source: 'user_action',
      }));

      return res.json({
        id: reportId,
        title,
        body_markdown: bodyMarkdown,
        cadence,
        kind,
        signals_count: signals.length,
        custom_description: cadence === 'custom' ? customDescription : null,
      });
    } catch (err: any) {
      console.error('[POST /users/me/reports]', err?.message || err);
      const status = err?.message?.includes('ANTHROPIC_API_KEY') ? 503 : 500;
      return res.status(status).json({ error: err?.message?.slice(0, 200) || 'Report generation failed' });
    }
  });

  // GET /users/me/reports — list past reports (newest first, lightweight).
  router.get('/users/me/reports', requireAuth, async (req: any, res: Response) => {
    const userId = (req as any).user.id;
    const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 100);
    try {
      const result = await db.query(
        `SELECT id, report_kind, title, signals_count, trigger, created_at
         FROM self_learn_reports
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [userId, limit],
      );
      return res.json({ reports: result.rows });
    } catch (err: any) {
      console.error('[GET /users/me/reports]', err?.message || err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/cards/:id/persona', requireAuth, async (req: any, res: Response) => {
    const userId = (req as any).user.id;
    const { id: cardId } = req.params;
    try {
      const row = await db.query(
        `SELECT c.card_type, p.persona, p.memory_enabled, p.custom_name
         FROM cards c
         LEFT JOIN card_agent_personas p ON p.card_id = c.id
         WHERE c.id = $1 AND c.user_id = $2`,
        [cardId, userId],
      );
      if (row.rows.length === 0) return res.status(404).json({ error: 'Card not found' });

      const r = row.rows[0];
      const persona = (r.persona as PersonaKey) || defaultPersonaForCardType(r.card_type);
      const tpl = PERSONAS[persona];
      return res.json({
        persona,
        memoryEnabled: r.memory_enabled !== false, // null = true (default ON)
        customName: r.custom_name ?? null,
        label: tpl.label,
        tagline: tpl.tagline,
        firstHint: tpl.firstHint,
        availablePersonas: (Object.keys(PERSONAS) as PersonaKey[]).map((k) => ({
          key: k,
          label: PERSONAS[k].label,
          tagline: PERSONAS[k].tagline,
        })),
      });
    } catch (err: any) {
      console.error('[GET /cards/:id/persona]', err?.message || err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.patch('/cards/:id/persona', requireAuth, async (req: any, res: Response) => {
    const userId = (req as any).user.id;
    const { id: cardId } = req.params;
    const { persona, memoryEnabled, customName } = req.body || {};

    if (persona != null && !(persona in PERSONAS)) {
      return res.status(400).json({ error: `persona must be one of ${Object.keys(PERSONAS).join(', ')}` });
    }

    try {
      const owns = await db.query(
        'SELECT 1 FROM cards WHERE id = $1 AND user_id = $2',
        [cardId, userId],
      );
      if (owns.rows.length === 0) return res.status(404).json({ error: 'Card not found' });

      // Upsert: persona row may not exist yet if the trigger hasn't fired.
      await db.query(
        `INSERT INTO card_agent_personas (card_id, persona, memory_enabled, custom_name)
         VALUES ($1, COALESCE($2, 'concierge'), COALESCE($3, TRUE), $4)
         ON CONFLICT (card_id) DO UPDATE SET
           persona       = COALESCE(EXCLUDED.persona, card_agent_personas.persona),
           memory_enabled = COALESCE(EXCLUDED.memory_enabled, card_agent_personas.memory_enabled),
           custom_name    = COALESCE(EXCLUDED.custom_name, card_agent_personas.custom_name)`,
        [
          cardId,
          persona ?? null,
          typeof memoryEnabled === 'boolean' ? memoryEnabled : null,
          typeof customName === 'string' ? customName.trim().slice(0, 80) : null,
        ],
      );

      // .self_learn signal: persona swap is a meaningful user choice.
      if (persona) {
        voidSafe(emitSignal({
          db: db as any,
          userId,
          type: SIGNAL_TYPES.CARD_PERSONA_CHANGED,
          payload: { card_id: cardId, new_persona: persona },
          source: 'user_action',
        }));
      }

      return res.json({ ok: true });
    } catch (err: any) {
      console.error('[PATCH /cards/:id/persona]', err?.message || err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.delete('/cards/:id/messages', requireAuth, async (req: any, res: Response) => {
    // Clear conversation history for a single card. Used by card settings
    // "Reset this card's memory" action per spec Q3.
    const userId = (req as any).user.id;
    const { id: cardId } = req.params;
    try {
      const owns = await db.query(
        'SELECT 1 FROM cards WHERE id = $1 AND user_id = $2',
        [cardId, userId],
      );
      if (owns.rows.length === 0) return res.status(404).json({ error: 'Card not found' });
      const r = await db.query(
        'DELETE FROM card_agent_messages WHERE card_id = $1 AND user_id = $2 RETURNING id',
        [cardId, userId],
      );
      // .self_learn signal: memory reset is intentional and worth remembering.
      voidSafe(emitSignal({
        db: db as any,
        userId,
        type: SIGNAL_TYPES.CARD_MEMORY_RESET,
        payload: { card_id: cardId, cleared_count: r.rows.length },
        source: 'user_action',
      }));
      return res.json({ cleared: r.rows.length });
    } catch (err: any) {
      console.error('[DELETE /cards/:id/messages]', err?.message || err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/card-transactions', requireAuth, async (req, res) => {
    const userId = (req as any).user.id

    // Seamless SD3 sync: pull latest issuer transactions before serving.
    // Rate-limited to once per 30s per user via users.last_tx_synced_at so
    // we don't hammer SD3 on rapid FE polls. Best-effort -- on SD3 outage
    // or transient failure we still return the existing DB rows so the
    // dashboard never goes blank. Adds ~300-800ms latency on the first
    // call after the 30s cooldown; cached calls hit DB only.
    try {
      const stalenessRes = await db.query(
        `SELECT extract(epoch FROM (now() - last_tx_synced_at)) AS staleness_s
         FROM users WHERE id = $1`,
        [userId],
      )
      const staleness: number | null =
        stalenessRes.rows[0]?.staleness_s == null
          ? null
          : Number(stalenessRes.rows[0].staleness_s)
      const SYNC_COOLDOWN_S = 30
      if (staleness === null || staleness > SYNC_COOLDOWN_S) {
        await syncIssuerTransactions(db, userId).catch((e: any) => {
          console.warn('[card-transactions auto-sync]', String(e?.message ?? e).slice(0, 80))
        })
      }
    } catch (e: any) {
      // Silent: never block transaction reads on sync errors.
      console.warn('[card-transactions cooldown probe]', String(e?.message ?? e).slice(0, 80))
    }

    const { cardIds, dateFrom, dateTo, category, status, type, page = '1', pageSize = '50' } = req.query as any
    const conditions: string[] = ['user_id = $1']
    const values: any[] = [userId]
    let idx = 2
    if (cardIds) {
      conditions.push(`card_id = ANY($${idx++})`)
      values.push(cardIds.split(','))
    }
    if (dateFrom) { conditions.push(`date >= $${idx++}`); values.push(new Date(dateFrom)) }
    if (dateTo)   { conditions.push(`date <= $${idx++}`); values.push(new Date(dateTo)) }
    if (category) { conditions.push(`category = $${idx++}`); values.push(category) }
    if (status)   { conditions.push(`status = $${idx++}`);   values.push(status) }
    if (type)     { conditions.push(`type = $${idx++}`);     values.push(type) }
    const offset = (parseInt(page) - 1) * parseInt(pageSize)
    const result = await db.query(
      `SELECT * FROM card_transactions WHERE ${conditions.join(' AND ')} ORDER BY date DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, parseInt(pageSize), offset]
    )
    const cardTxs = result.rows.map(rowToTransaction)

    // Also fetch bridge deposits from transactions table and merge them in
    // These are the on-chain USDC deposits from various chains.
    //
    // Migration 027 (Session 27): transactions.user_id now holds local
    // users.id directly. The old issuer_user_id lookup is gone — query
    // straight against the JWT userId.
    try {
      {
        // Session 25 Phase 6 — exclude failed + failed_restart + stranded
        // from the Transactions feed. These are retry-loop artifacts that
        // would inflate Total Income if surfaced.
        const bridgeResult = await db.query(
          `SELECT id, amount, status, created_at, tx_hash, source_chain, dest_chain, token
           FROM transactions
           WHERE user_id = $1
             AND status NOT IN ('failed', 'failed_restart', 'stranded')
           ORDER BY created_at DESC LIMIT 100`,
          [userId]
        )
        const bridgeTxs = bridgeResult.rows.map((tx: any) => ({
          id:          tx.id,
          name:        `${tx.token || 'USDC'} Deposit from ${chainIdToName(tx.source_chain)}`,
          type:        'deposit',
          amount:      parseFloat(tx.amount),
          isIncoming:  true,
          date:        tx.created_at instanceof Date ? tx.created_at.toISOString() : tx.created_at,
          category:    'income',
          status:      tx.status === 'complete' ? 'completed' : tx.status,
          cardId:      null,
          txHash:      tx.tx_hash || null,
          sourceChain: tx.source_chain,
          destChain:   tx.dest_chain,
          token:       tx.token || 'USDC',
        }))
        // Merge and sort by date descending
        const merged = [...cardTxs, ...bridgeTxs]
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
        return res.json(merged)
      }
    } catch (bridgeErr: any) {
      console.error('[card-transactions] Bridge merge error (non-fatal):', bridgeErr.message?.slice(0, 60))
    }

    res.json(cardTxs)
  })

  // POST /card-transactions
  router.post('/card-transactions', requireAuth, async (req, res) => {
    // S33 Tier 1 #9: gate behind SANDBOX_MODE.
    //
    // Real card transactions arrive via the SD3 issuer webhook (debit
    // events from the card network), then `card_transactions` rows are
    // INSERTed by the webhook handler. This POST endpoint creates a row
    // WITHOUT any merchant interaction — it's pure fixture territory.
    //
    // In production, a malicious authenticated user could spam
    // `{name:"Whatever", type:"purchase", amount:10}` and corrupt their
    // own spending history (and any analytics derived from it). Balance
    // is never debited (line ~1236 confirms), so it's not a money exploit
    // — but it IS a data-integrity exploit.
    //
    // Sandbox / test environments set SANDBOX_MODE=true to enable the
    // endpoint for fixture creation. Production deployments leave it
    // unset and get a 403 here. The request-scoped sandbox harness
    // (src/sandbox/scope.ts) still works without this flag — it routes
    // INSERTs to scratch schemas via AsyncLocalStorage.
    if (process.env.SANDBOX_MODE !== 'true') {
      return res.status(403).json({
        error: 'sandbox_only',
        message:
          'POST /card-transactions is sandbox-only. Real card transactions ' +
          'arrive via SD3 issuer webhooks (POST /webhooks/sd3/transaction).',
      })
    }
    try {
      const userId = (req as any).user.id;
      const { name, type, amount, category, cardId } = req.body || {};
      if (!name || typeof name !== "string" || name.trim().length < 1) {
        return res.status(400).json({ error: "name is required" });
      }
      const validTypes = ["purchase", "subscription", "deposit", "withdrawal"];
      if (!type || !validTypes.includes(type)) {
        return res.status(400).json({ error: `type must be one of: ${validTypes.join(", ")}` });
      }
      if (!amount || typeof amount !== "number" || amount <= 0 || amount > 1000000) {
        return res.status(400).json({ error: "amount must be a positive number (max 1,000,000)" });
      }
      const validCategories = ["groceries", "entertainment", "transport", "crypto", "shopping", "food", "utilities", "health", "travel", "other", "income", "transfer"];
      if (category && !validCategories.includes(category)) {
        return res.status(400).json({ error: `category must be one of: ${validCategories.join(", ")}` });
      }
      let cardQuery;
      if (cardId) {
        cardQuery = await db.query("SELECT id, balance, is_locked FROM cards WHERE id = $1 AND user_id = $2", [cardId, userId]);
      } else {
        cardQuery = await db.query("SELECT id, balance, is_locked FROM cards WHERE user_id = $1 AND is_locked = false ORDER BY created_at ASC LIMIT 1", [userId]);
      }
      if (!cardQuery.rows.length) return res.status(404).json({ error: "No card found" });
      const card = cardQuery.rows[0];
      if (card.is_locked) return res.status(403).json({ error: "Card is frozen" });
      const isDebit = type === "purchase" || type === "subscription";
      if (isDebit) {
        // SECURITY: Verify balance with Issuer before authorizing any debit.
        // Sprint D: via shared helper so every debit gets a sync log + drift alert.
        let realBalance = Number(card.balance)
        try {
          const userRes = await db.query('SELECT sd3_user_id, issuer_user_id FROM users WHERE id = $1', [userId])
          const issuerId = userRes.rows[0]?.sd3_user_id || userRes.rows[0]?.issuer_user_id
          if (issuerId) {
            const outcome = await syncCardBalanceFromIssuer(db, card.id, issuerId, realBalance, 'debit')
            if (outcome.newBalance !== null) {
              realBalance = outcome.newBalance
            }
          }
        } catch {
          console.warn(`[card-tx] Issuer sync failed for debit check — using cached balance $${card.balance}`)
        }
        if (realBalance < amount) {
          return res.status(402).json({ error: "Insufficient balance", balance: realBalance, requested: amount });
        }
        // Auto-upsert card_controls so every card has limits enforced
        await db.query(
          `INSERT INTO card_controls (card_id, user_id) VALUES ($1, $2) ON CONFLICT (card_id) DO NOTHING`,
          [card.id, userId]
        );
        // Reset daily usage if past midnight UTC
        await db.query(
          `UPDATE card_controls SET daily_used = 0, daily_reset_at = now()
           WHERE card_id = $1 AND (daily_reset_at IS NULL OR daily_reset_at < date_trunc('day', now() AT TIME ZONE 'UTC'))`,
          [card.id]
        );
        // Reset monthly usage if past 1st of month UTC
        await db.query(
          `UPDATE card_controls SET monthly_used = 0, monthly_reset_at = now()
           WHERE card_id = $1 AND (monthly_reset_at IS NULL OR monthly_reset_at < date_trunc('month', now() AT TIME ZONE 'UTC'))`,
          [card.id]
        );
        const ctrlRes = await db.query("SELECT * FROM card_controls WHERE card_id = $1", [card.id]);
        const ctrl = ctrlRes.rows[0];
        if (Number(ctrl.per_transaction_limit) > 0 && amount > Number(ctrl.per_transaction_limit)) {
          return res.status(402).json({ error: "Exceeds per-transaction limit", limit: Number(ctrl.per_transaction_limit), requested: amount });
        }
        const newDailyUsed = Number(ctrl.daily_used) + amount;
        if (Number(ctrl.daily_limit) > 0 && newDailyUsed > Number(ctrl.daily_limit)) {
          return res.status(402).json({ error: "Exceeds daily limit", limit: Number(ctrl.daily_limit), used: Number(ctrl.daily_used), requested: amount });
        }
        const newMonthlyUsed = Number(ctrl.monthly_used) + amount;
        if (Number(ctrl.monthly_limit) > 0 && newMonthlyUsed > Number(ctrl.monthly_limit)) {
          return res.status(402).json({ error: "Exceeds monthly limit", limit: Number(ctrl.monthly_limit), used: Number(ctrl.monthly_used), requested: amount });
        }
        await db.query("UPDATE card_controls SET daily_used = daily_used + $1, monthly_used = monthly_used + $1, updated_at = NOW() WHERE card_id = $2", [amount, card.id]);
        // S33 Tier 1 #10: card_alerts schema has columns
        // (id, card_id, user_id, alert_type, amount, description, resolved, created_at) —
        // NOT (message, metadata). Previous INSERTs would throw at runtime
        // ("column message does not exist"). Realigned to use description
        // (the actual text column) and amount (the actual numeric column).
        // Structured context that used to live in metadata JSON is now
        // serialized into description with a — separator.
        if (ctrl.alert_enabled && Number(ctrl.alert_threshold) > 0 && amount >= Number(ctrl.alert_threshold)) {
          await db.query(
            `INSERT INTO card_alerts (id, card_id, user_id, alert_type, amount, description) VALUES (gen_random_uuid(), $1, $2, 'high_value', $3, $4)`,
            [card.id, userId, amount, `High-value transaction: $${amount.toFixed(2)} at ${name.trim()} — category=${category || 'other'}`]
          );
        }
        // Alert on limit breaches (>80% used)
        if (Number(ctrl.daily_limit) > 0 && newDailyUsed > Number(ctrl.daily_limit) * 0.8) {
          await db.query(
            `INSERT INTO card_alerts (id, card_id, user_id, alert_type, amount, description) VALUES (gen_random_uuid(), $1, $2, 'limit_warning', $3, $4)`,
            [card.id, userId, newDailyUsed, `Daily spend at ${Math.round(newDailyUsed / Number(ctrl.daily_limit) * 100)}% of limit — used=$${newDailyUsed.toFixed(2)} cap=$${Number(ctrl.daily_limit).toFixed(2)}`]
          );
        }
        if (Number(ctrl.monthly_limit) > 0 && newMonthlyUsed > Number(ctrl.monthly_limit) * 0.8) {
          await db.query(
            `INSERT INTO card_alerts (id, card_id, user_id, alert_type, amount, description) VALUES (gen_random_uuid(), $1, $2, 'limit_warning', $3, $4)`,
            [card.id, userId, newMonthlyUsed, `Monthly spend at ${Math.round(newMonthlyUsed / Number(ctrl.monthly_limit) * 100)}% of limit — used=$${newMonthlyUsed.toFixed(2)} cap=$${Number(ctrl.monthly_limit).toFixed(2)}`]
          );
        }
        // Card balance NOT modified here — Issuer is source of truth.
        // For purchases: Issuer card network handles real deduction.
        // For deposits: bridge sends USDC to Issuer Base address, Issuer credits card.
      }
      // Deposits are 'pending' until Issuer confirms on-card credit
      // Purchases are 'completed' since Issuer card network already processed them
      const txStatus = type === 'deposit' ? 'pending' : 'completed';
      const txRes = await db.query(
        // date populated explicitly so analytics windows (24h/7d/12mo) include
        // user-initiated rows. See migration 043 for the consolidation.
        `INSERT INTO card_transactions (id, card_id, user_id, name, type, amount, category, status, created_at, date)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) RETURNING *`,
        [card.id, userId, name.trim(), type, isDebit ? -Math.abs(amount) : Math.abs(amount), category || "other", txStatus]
      );
      const notifTitle = isDebit ? `Transaction: -${amount.toFixed(2)}` : `${type === "deposit" ? "Deposit" : "Transaction"}: +${amount.toFixed(2)}`;
      await db.query(
        `INSERT INTO notifications (id, user_id, type, title, message, is_read, metadata, created_at)
         VALUES (gen_random_uuid(), $1, 'transaction', $2, $3, false, $4, NOW())`,
        [userId, notifTitle, `${amount.toFixed(2)} ${isDebit ? "spent at" : "received from"} ${name.trim()}`,
         JSON.stringify({ card_id: card.id, amount, transaction_id: txRes.rows[0].id })]
      );
      res.status(201).json(txRes.rows[0]);
    } catch (err: any) {
      console.error("[POST /card-transactions] Error:", err.message || err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /transactions - real bridge transactions (Circle CCTP via Issuers)
  router.get('/transactions', requireAuth, async (req, res) => {
    const userId = (req as any).user.id
    try {
      const userResult = await db.query('SELECT issuer_user_id FROM users WHERE id = $1', [userId])
      const issuerUserId = userResult.rows[0]?.issuer_user_id
      if (!issuerUserId) return res.json([])
      const result = await db.query(
        `SELECT id, amount, status, created_at, tx_hash, source_chain, dest_chain, token
         FROM transactions WHERE user_id = $1 AND status != 'failed' ORDER BY created_at DESC LIMIT 100`,
        [issuerUserId]
      )
      const txs = result.rows.map((tx: any) => ({
        id:         tx.id,
        name:       'USDC Bridge Transfer',
        type:       'transfer',
        amount:     parseFloat(tx.amount),
        isIncoming: true,
        date:       tx.created_at,
        category:   'income',
        status:     tx.status === 'complete' ? 'completed' : tx.status,
        txHash:     tx.tx_hash || null,
      }))
      res.json(txs)
    } catch (err: any) {
      console.error('[GET /transactions]', err.message)
      res.status(500).json({ error: 'Failed to fetch transactions' })
    }
  })


  // GET /cards/balance - sync real balance from Issuers contracts
  // ── POST /cards/:cardId/sync ───────────────────────────────────────────────
  // User-triggered pull of latest Issuer transactions. Returns sync outcome.
  router.post('/cards/:cardId/sync', requireAuth, async (req: any, res: any) => {
    const userId = req.user.id
    const { cardId } = req.params
    try {
      const cardRes = await db.query(
        `SELECT id FROM cards WHERE id = $1 AND user_id = $2 LIMIT 1`,
        [cardId, userId]
      )
      if (!cardRes.rows[0]) {
        return res.status(404).json({ error: 'Card not found' })
      }
      const result = await syncIssuerTransactions(db, userId)
      res.json(result)
    } catch (err: any) {
      console.error('[POST /cards/:cardId/sync]', err.message?.slice(0, 120))
      res.status(500).json({ error: 'Sync failed', detail: err.message?.slice(0, 200) })
    }
  })

  router.get('/cards/balance', requireAuth, async (req, res) => {
    const userId = (req as any).user.id
    try {
      const userResult = await db.query('SELECT issuer_user_id FROM users WHERE id = $1', [userId])
      const issuerUserId = userResult.rows[0]?.issuer_user_id
      if (!issuerUserId) return res.json({ balance: 0 })
      const { data: contracts } = await axios.get(
        `${CONFIG.ISSUER_API_BASE}/users/${issuerUserId}/contracts`,
        { headers: { 'x-api-key': CONFIG.ISSUER_API_KEY } }
      )
      let total = 0
      for (const contract of contracts) {
        for (const token of contract.tokens) {
          total += parseFloat(token.balance) || 0
        }
      }
      // DO NOT write Issuer's balance to our cards table — read only
      // Issuer's contract balance is the source of truth
      res.json({ balance: total, source: 'issuer_contracts' })
    } catch (err: any) {
      console.error('[GET /cards/balance]', err.message)
      res.status(500).json({ error: 'Failed to sync balance' })
    }
  })


  // ── GET /users/me/signals (.self_learn activity feed) ─────────────────────
  // Returns recent user-level signals so the frontend can show "what
  // Mythos remembers about you". Capped at 100 per request to prevent
  // accidental bulk-pull. Spec Q6: raw signals are NOT MCP-exposed; this
  // endpoint is browser-only (requireAuth + user scope).
  router.get('/users/me/signals', requireAuth, async (req: any, res: Response) => {
    const userId = (req as any).user.id;
    const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 100);
    try {
      const signals = await loadRecentSignals(db as any, userId, limit);
      // Strip the heavier payload fields before returning to client. The full
      // payload stays internal (chat system prompt, report generator).
      const sanitized = signals.map((s) => ({
        id: s.id,
        signal_type: s.signal_type,
        // Surface a curated subset of payload keys so the UI can render
        // sensible labels without leaking arbitrary internal data.
        summary: {
          card_id:    (s.payload as any)?.card_id ?? null,
          card_name:  (s.payload as any)?.card_name ?? null,
          card_type:  (s.payload as any)?.card_type ?? null,
          amount_usd: (s.payload as any)?.amount_usd ?? null,
          merchant:   (s.payload as any)?.merchant ?? null,
          snippet:    (s.payload as any)?.snippet ?? null,
        },
        source: s.source,
        created_at: s.created_at,
      }));
      return res.json({ signals: sanitized, count: sanitized.length });
    } catch (err: any) {
      console.error('[GET /users/me/signals]', err?.message || err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── GET /users/me ──────────────────────────────────────────────────────────
  router.get("/users/me", requireAuth, async (req: any, res: any) => {
    try {
      const { rows } = await db.query(
        `SELECT id, name, email, phone, kyc_status AS "kycStatus",
                first_name AS "firstName", last_name AS "lastName",
                notification_prefs AS "notificationPrefs",
                payout_destination AS "payoutDestination"
         FROM users WHERE id = $1`,
        [(req as any).user.id]
      );
      if (!rows[0]) return res.status(404).json({ error: "User not found" });
      // 2026-05-25 KYC read-side normalization: legacy rows that pre-date the
      // webhook normalizer (e6f90a3) can still have 'verified', 'kyc_complete',
      // etc. Normalize before returning so the frontend gate succeeds.
      // Source of truth for the verified-synonyms set: src/lib/kyc-status.ts.
      const row = rows[0];
      row.kycStatus = normalizeKycStatus(row.kycStatus);
      res.json(row);
    } catch (err) {
      console.error("GET /users/me error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── GET /users/me/vault ────────────────────────────────────────────────────
  // Session 26 Sprint 2.1 polish — exposes the user's Base vault address +
  // live USDC balance. The vault is a deterministic HD-derived wallet on Base
  // that holds the user's prediction-market bet collateral + P2P-received
  // funds. Derivation: keccak256(PRIVATE_KEY + 'vault_' + userId).
  //
  // This endpoint ONLY exposes the address + balance. Private key stays
  // server-side; the backend signs on the user's behalf when they place bets,
  // sweep to card, or P2P to another user.
  router.get("/users/me/vault", requireAuth, async (req: any, res: any) => {
    try {
      const userId = (req as any).user.id;
      const vaultSeed = ethers.utils.id(process.env.PRIVATE_KEY! + 'vault_' + userId);
      const vaultAddress = ethers.utils.HDNode.fromSeed(vaultSeed).address;

      // Read live USDC balance on Base — don't trust DB, always on-chain
      let usdcBalance = 0;
      let ethBalance = 0;
      try {
        const baseProvider = new ethers.providers.JsonRpcProvider(CONFIG.BASE_RPC_URL);
        const baseUsdc = new ethers.Contract(
          CONFIG.USDC_BASE,
          ['function balanceOf(address) view returns (uint256)'],
          baseProvider
        );
        const [usdcRaw, ethRaw] = await Promise.all([
          baseUsdc.balanceOf(vaultAddress).catch(() => ethers.BigNumber.from(0)),
          baseProvider.getBalance(vaultAddress).catch(() => ethers.BigNumber.from(0)),
        ]);
        usdcBalance = parseFloat(ethers.utils.formatUnits(usdcRaw, 6));
        ethBalance = parseFloat(ethers.utils.formatEther(ethRaw));
      } catch (rpcErr: any) {
        console.warn('[GET /users/me/vault] Base RPC read failed:', rpcErr.message?.slice(0, 100));
      }

      // Open market positions for this user — expose count + total at-risk
      let openPositions = 0;
      let totalAtRisk = 0;
      try {
        const posRes = await db.query(
          `SELECT COUNT(*)::int AS c, COALESCE(SUM(cost_basis), 0) AS total
           FROM market_positions
           WHERE user_id = $1 AND status IN ('pending', 'executed')`,
          [userId]
        );
        openPositions = posRes.rows[0]?.c || 0;
        totalAtRisk = parseFloat(posRes.rows[0]?.total || '0');
      } catch {
        // Non-fatal — vault info alone is still useful
      }

      res.json({
        vaultAddress,
        chain: 'base',
        chainId: 8453,
        usdcBalance,
        ethBalance,
        openPositions,
        totalAtRisk,
        fetchedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("GET /users/me/vault error:", err.message);
      res.status(500).json({ error: "Vault lookup failed" });
    }
  });

  // ── GET /users/search ──────────────────────────────────────────────────────
  // Autocomplete lookup for P2P transfer recipient picker.
  // Query: q (string, min 2 chars) — matches email-prefix OR name-prefix, case-insensitive.
  // Returns: up to 10 users (never the caller), with `hasCard` flag so FE can grey-out
  // the 'card' destination option when the recipient hasn't completed KYC.
  //
  // Ranking: exact email match > email prefix > name prefix > other. The CASE-ranked
  // ORDER BY keeps the most-relevant first so the autocomplete dropdown lands on the
  // obvious choice at position 0.
  router.get("/users/search", requireAuth, async (req: any, res: any) => {
    try {
      const q = String(req.query.q || "").trim().toLowerCase();
      if (q.length < 2) {
        return res.status(400).json({ error: "q must be at least 2 characters" });
      }
      const selfId = (req as any).user.id;
      const pattern = `${q}%`;
      const loosePattern = `%${q}%`;
      const { rows } = await db.query(
        `SELECT id, email, name,
                (sd3_user_id IS NOT NULL OR issuer_user_id IS NOT NULL) AS "hasCard"
         FROM users
         WHERE id <> $1
           AND (LOWER(email) = $2
                OR LOWER(email) LIKE $3
                OR LOWER(COALESCE(name, '')) LIKE $3
                OR LOWER(email) LIKE $4)
         ORDER BY
           CASE
             WHEN LOWER(email) = $2 THEN 0
             WHEN LOWER(email) LIKE $3 THEN 1
             WHEN LOWER(COALESCE(name, '')) LIKE $3 THEN 2
             ELSE 3
           END,
           email
         LIMIT 10`,
        [selfId, q, pattern, loosePattern]
      );
      res.json(rows);
    } catch (err: any) {
      console.error("GET /users/search error:", err.message);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── GET /supported-tokens ──────────────────────────────────────────────────
  // Session 23 Thread D — FE calls this to populate the 3-category Reload
  // Card token picker (Stablecoins / Native tokens / Memecoins). Returns
  // per-category arrays with enough metadata for the FE to render + swap.
  //
  // Query: ?chainId=X (optional) — filter to tokens available on a specific
  // chain. When omitted, returns the union across all supported chains.
  //
  // Stablecoins are hardcoded (USDC/USDT/DAI, direct deposit, no swap).
  // Natives come from swap.ts NATIVE_TOKENS. ERC-20s come from ERC20_ALLOWLIST,
  // split by `category` field into bluechip vs memecoin sub-sections. Memecoins
  // are tagged `comingSoon:true` unless CONFIG.ERC20_MEMECOIN_ENABLED=true.
  router.get("/supported-tokens", async (req: any, res: any) => {
    try {
      const chainIdParam = req.query.chainId ? Number(req.query.chainId) : null
      const chainIds = chainIdParam ? [chainIdParam] : Object.keys(NATIVE_TOKENS).map(Number)

      // Stables — always USDC, USDT, DAI. Per-chain availability is FE concern.
      const stables = [
        { symbol: 'USDC', name: 'USD Coin', category: 'stable', directDeposit: true,  iconId: 'usdc', description: 'Direct deposit — no swap, no slippage' },
        { symbol: 'USDT', name: 'Tether',   category: 'stable', directDeposit: true,  iconId: 'usdt', description: 'Direct deposit — no swap, no slippage' },
        { symbol: 'DAI',  name: 'Dai',      category: 'stable', directDeposit: true,  iconId: 'dai',  description: 'Direct deposit — no swap, no slippage' },
      ]

      // Natives — ETH/MATIC/BNB pulled from NATIVE_TOKENS registry
      const natives = chainIds
        .map(cid => NATIVE_TOKENS[cid])
        .filter(Boolean)
        .map(t => ({
          symbol: t.nativeSymbol,
          name: `${t.chainName} native`,
          category: 'native',
          chainId: t.chainId,
          chainName: t.chainName,
          directDeposit: false,
          iconId: t.nativeSymbol.toLowerCase(),
          description: `Auto-swap to USDC on ${t.chainName} · ~0.5% slippage`,
        }))

      // ERC-20s — refresh snapshot from DB (admin toggles take effect in
      // <60s) then flatten allowlist, split bluechip vs memecoin.
      await ensureAllowlistFresh()
      const allowlist = getErc20Allowlist()
      const memecoinEnabled = CONFIG.ERC20_MEMECOIN_ENABLED
      const bluechips: any[] = []
      const memecoins: any[] = []
      for (const cid of chainIds) {
        const list = allowlist[cid] || []
        for (const tok of list) {
          const entry = {
            symbol: tok.symbol,
            name: tok.name,
            category: tok.category,
            chainId: cid,
            chainName: NATIVE_TOKENS[cid]?.chainName || String(cid),
            contractAddress: tok.address,
            decimals: tok.decimals,
            directDeposit: false,
            iconId: tok.symbol.toLowerCase(),
            description: `Auto-swap to USDC · up to ${CONFIG.ZEROX_SLIPPAGE_BPS / 100}% slippage`,
            auditedAt: tok.auditedAt,
          }
          if (tok.category === 'memecoin') {
            memecoins.push({ ...entry, comingSoon: !memecoinEnabled })
          } else {
            bluechips.push(entry)
          }
        }
      }

      // Session 30 Phase 2.5 — DB-backed Solana allowlist (migration 030).
      // FE treats chainId=-1 as Solana (matches ReloadModal's CHAINS array).
      // Tokens go into their natural category so the existing tabs render
      // them without FE changes. Jupiter routes quotes; 0x is untouched.
      // Admin can toggle enabled per-row to disable a memecoin in <60s.
      await ensureSolanaAllowlistFresh()
      const SOLANA_CHAIN_ID = -1
      for (const sol of getSolanaAllowlist()) {
        const entry = {
          symbol: sol.symbol,
          name: sol.name,
          category: sol.category,
          chainId: SOLANA_CHAIN_ID,
          chainName: 'Solana',
          contractAddress: sol.mint, // mint doubles as contract identifier
          decimals: sol.decimals,
          directDeposit: sol.category === 'stablecoin', // Solana USDC/USDT direct-deposits via CCTP
          iconId: sol.symbol.toLowerCase(),
          description:
            sol.category === 'stablecoin'
              ? 'Direct deposit on Solana — no swap'
              : `Auto-swap to USDC via Jupiter · up to ${CONFIG.ZEROX_SLIPPAGE_BPS / 100}% slippage`,
        }
        if (sol.category === 'stablecoin') {
          // Merge into stables but keyed by chain — FE already dedupes by symbol
          // for stables across chains, so push a chain-tagged entry.
          stables.push({ ...entry })
        } else if (sol.category === 'native') {
          natives.push({ ...entry })
        } else if (sol.category === 'memecoin') {
          memecoins.push({ ...entry, comingSoon: false }) // Jupiter handles liquidity; no gate needed
        } else {
          bluechips.push(entry)
        }
      }

      res.json({
        stablecoins: stables,
        natives,
        bluechips,
        memecoins,
        meta: {
          slippageBps: CONFIG.ZEROX_SLIPPAGE_BPS,
          minSwapUsd: CONFIG.SWAP_MIN_USD,
          nativeSwapEnabled: CONFIG.NATIVE_SWAP_ENABLED,
          erc20SwapEnabled: CONFIG.ERC20_SWAP_ENABLED,
          memecoinEnabled,
          solanaEnabled: true, // Phase 1 — preview quotes only; execution in Phase 3
        },
      })
    } catch (err: any) {
      console.error("GET /supported-tokens error:", err.message)
      res.status(500).json({ error: "Internal server error" })
    }
  })

  // ── GET /public/skill-health ───────────────────────────────────────────────
  // Public version of /admin/api/skill-health for the sub-agents + neural
  // dashboards (both served as raw HTML from /public/ with no auth proxy).
  // Returns aggregate counts + health classification — no PII, no per-user data.
  router.get("/public/skill-health", async (req: any, res: any) => {
    try {
      // Session 25 Thread D — include 'claude_skill' entity_type written
      // by the SubagentStop/PostToolUse(Skill) hook. That captures on-demand
      // skills like /auditor, /bridge, /deployer, /encode that previously
      // had no DB trail. For those rows, entity_id IS the skill id directly.
      const q24h = await db.query(
        `SELECT entity_type, entity_id, action, status, COUNT(*) AS c, MAX(created_at) AS last_seen
         FROM execution_log
         WHERE created_at > now() - interval '24 hours'
           AND entity_type IN ('growth_agent', 'swap', 'monitor', 'issuer_sync', 'bridge', 'market_oracle', 'claude_skill')
         GROUP BY entity_type, entity_id, action, status`
      )
      const q7d = await db.query(
        `SELECT entity_type, entity_id, action, COUNT(*) AS c
         FROM execution_log
         WHERE created_at > now() - interval '7 days'
           AND entity_type IN ('growth_agent', 'swap', 'monitor', 'issuer_sync', 'bridge', 'market_oracle', 'claude_skill')
         GROUP BY entity_type, entity_id, action`
      )
      function skillIdFor(entityType: string, entityId: string | null, action: string): string {
        // claude_skill rows store the skill id directly in entity_id
        if (entityType === 'claude_skill' && entityId) return entityId
        if (entityType === 'growth_agent') {
          if (action?.includes('daily')) return 'agent'
          if (action?.includes('approval')) return 'approval-pipeline'
          if (action?.includes('video') || action?.includes('heygen')) return 'video-pipeline'
          if (action?.includes('knowledge')) return 'knowledge-engine'
          if (action?.includes('thought')) return 'thought-engine'
          return 'mythos'
        }
        if (entityType === 'swap' || entityType === 'monitor') return 'bridge'
        if (entityType === 'issuer_sync') return 'issuer'
        if (entityType === 'market_oracle') return 'market'
        return entityType
      }
      const skills: Record<string, any> = {}
      for (const row of q24h.rows) {
        const id = skillIdFor(row.entity_type, row.entity_id, row.action)
        if (!skills[id]) skills[id] = { total24h: 0, errors24h: 0, successes24h: 0, lastSeen: null, invocations7d: 0 }
        const count = Number(row.c)
        skills[id].total24h += count
        if (row.status === 'failed' || row.status === 'error') skills[id].errors24h += count
        else if (row.status === 'success' || row.status === 'completed') skills[id].successes24h += count
        const ts = row.last_seen ? new Date(row.last_seen).toISOString() : null
        if (ts && (!skills[id].lastSeen || ts > skills[id].lastSeen)) skills[id].lastSeen = ts
      }
      for (const row of q7d.rows) {
        const id = skillIdFor(row.entity_type, row.entity_id, row.action)
        if (!skills[id]) skills[id] = { total24h: 0, errors24h: 0, successes24h: 0, lastSeen: null, invocations7d: 0 }
        skills[id].invocations7d += Number(row.c)
      }
      for (const id of Object.keys(skills)) {
        const s = skills[id]
        const errRate = s.total24h > 0 ? s.errors24h / s.total24h : 0
        if (s.total24h === 0) s.health = 'unknown'
        else if (errRate > 0.30 || s.errors24h >= 5) s.health = 'red'
        else if (s.errors24h >= 1) s.health = 'yellow'
        else s.health = 'green'
      }
      res.json({
        skills,
        meta: {
          source: 'execution_log',
          generatedAt: new Date().toISOString(),
          skillCount: Object.keys(skills).length,
        },
      })
    } catch (err: any) {
      console.error("GET /public/skill-health error:", err.message)
      res.status(500).json({ error: "Internal server error" })
    }
  })

  // ── GET /quote/swap ────────────────────────────────────────────────────────
  // Session 23 Thread D — FE live-quote preview. Hits 0x Aggregator v2 with
  // sellToken + amount, returns expected USDC output + worst-case min.
  // Never exposes the API key to FE (proxied through this endpoint).
  //
  // Query params:
  //   - chainId (number, required) — which chain the sell token lives on
  //   - sellToken (string, required) — 'native' OR ERC-20 symbol (e.g. 'LINK')
  //     Must be an allowlisted token; unknown symbols return 400.
  //   - amount (string, required) — human-readable amount (e.g. "0.5")
  //
  // Returns: { buyAmountUsd, minBuyAmountUsd, meetsThreshold, description }
  // On rate-limit or 0x failure, returns { error, degraded: true } so the FE
  // can show "~ estimate unavailable" instead of erroring hard.
  router.get("/quote/swap", async (req: any, res: any) => {
    try {
      const chainId = Number(req.query.chainId)
      const sellToken = String(req.query.sellToken || '').trim()
      const amount = String(req.query.amount || '').trim()
      // S31 H1: optional buy-side override, same shape as /quote/swap/firm.
      const buyTokenParam = String(req.query.buyToken || '').trim()

      if (!chainId || !sellToken || !amount) {
        return res.status(400).json({ error: 'chainId, sellToken, amount required' })
      }

      const nativeInfo = NATIVE_TOKENS[chainId]
      if (!nativeInfo) {
        return res.status(400).json({ error: `chain ${chainId} not supported for swap` })
      }

      const amountNum = parseFloat(amount)
      if (!isFinite(amountNum) || amountNum <= 0) {
        return res.status(400).json({ error: 'amount must be a positive number' })
      }

      // Resolve sellToken → (contract address, decimals). For ERC-20s,
      // await allowlist freshness so a just-enabled token is pickable.
      let sellTokenParam: string
      let decimals: number
      if (sellToken === 'native' || sellToken === nativeInfo.nativeSymbol) {
        sellTokenParam = 'native'
        decimals = nativeInfo.nativeDecimals
      } else {
        await ensureAllowlistFresh()
        const erc20 = findErc20(chainId, sellToken)
        if (!erc20) {
          return res.status(400).json({ error: `${sellToken} is not on the allowlist for chain ${chainId}` })
        }
        sellTokenParam = erc20.address
        decimals = erc20.decimals
      }

      // Resolve optional buy-side override (mirrors /quote/swap/firm).
      const NATIVE_SENTINEL_LOCAL = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
      let buyOverride: { address: string; decimals: number; usdPricePerUnit?: number } | undefined
      let buyTokenAddress: string = nativeInfo.usdcAddress
      let buyTokenSymbol = 'USDC'
      let buyTokenDecimals = nativeInfo.usdcDecimals
      if (buyTokenParam && buyTokenParam.toUpperCase() !== 'USDC') {
        if (buyTokenParam === 'native' || buyTokenParam === nativeInfo.nativeSymbol) {
          buyTokenAddress = NATIVE_SENTINEL_LOCAL
          buyTokenSymbol = nativeInfo.nativeSymbol
          buyTokenDecimals = nativeInfo.nativeDecimals
          buyOverride = { address: NATIVE_SENTINEL_LOCAL, decimals: nativeInfo.nativeDecimals }
        } else {
          await ensureAllowlistFresh()
          const buyErc20 = findErc20(chainId, buyTokenParam)
          if (!buyErc20) {
            return res.status(400).json({ error: `${buyTokenParam} is not on the allowlist for chain ${chainId}` })
          }
          buyTokenAddress = buyErc20.address
          buyTokenSymbol = buyErc20.symbol
          buyTokenDecimals = buyErc20.decimals
          buyOverride = { address: buyErc20.address, decimals: buyErc20.decimals }
        }
      }

      // Human amount → raw BigNumber string
      const sellAmountRaw = ethers.utils.parseUnits(amount, decimals).toString()

      const preview = await previewSwapQuote(chainId, sellTokenParam, sellAmountRaw, buyOverride)
      if (!preview) {
        return res.json({ degraded: true, error: 'Quote temporarily unavailable' })
      }

      // For non-USDC buys with no usdPricePerUnit, buyAmountUsd is NaN; the
      // FE will fill in the USD value from its own price feed using the
      // returned buyAmountRaw + buyTokenDecimals. meetsThreshold likewise
      // is only meaningful when buyAmountUsd is finite.
      const buyAmountUsdFinite = Number.isFinite(preview.buyAmountUsd)

      res.json({
        buyAmountUsd: preview.buyAmountUsd,
        minBuyAmountUsd: preview.minBuyAmountUsd,
        buyAmountRaw: preview.buyAmountRaw,
        minBuyAmountRaw: preview.minBuyAmountRaw,
        buyTokenAddress,
        buyTokenSymbol,
        buyTokenDecimals: preview.buyDecimals ?? buyTokenDecimals,
        meetsThreshold: buyAmountUsdFinite ? preview.buyAmountUsd >= CONFIG.SWAP_MIN_USD : true,
        slippageBps: CONFIG.ZEROX_SLIPPAGE_BPS,
        minSwapUsd: CONFIG.SWAP_MIN_USD,
        chainName: nativeInfo.chainName,
      })
    } catch (err: any) {
      console.error("GET /quote/swap error:", err.message)
      res.status(500).json({ error: "Internal server error" })
    }
  })

  // ── GET /quote/swap-solana ────────────────────────────────────────────────
  // Session 30 — Phase 1 of the Jupiter/multi-quote aggregator build.
  // Parallel to /quote/swap but routes through Jupiter's public `/v6/quote`
  // endpoint for Solana SPL tokens. Preview-only (returns USD value for UI);
  // Phase 3 will add /quote/swap-solana/firm for tx construction.
  //
  // Query params:
  //   sellToken (string, required) — SPL symbol on our Solana catalog (e.g.
  //                                  'PENGU', 'BONK', 'SOL') OR a raw mint
  //                                  address if not in the catalog.
  //   amount   (string, required) — human-readable input amount (e.g. '1.5')
  //   buyToken (string, optional) — defaults to USDC on Solana; pass another
  //                                 SPL symbol or mint for non-USDC quotes.
  //
  // Returns on success:
  //   { buyAmountUsd, minBuyAmountUsd, meetsThreshold, slippageBps,
  //     minSwapUsd, chainName: 'Solana', priceImpactBps, routeCount,
  //     routeLabels, source: 'jupiter' }
  //
  // Returns { degraded: true, error } when Jupiter has no route (matches the
  // EVM /quote/swap degrade semantics so the FE UX is uniform).
  router.get('/quote/swap-solana', async (req: any, res: any) => {
    try {
      const sellToken = String(req.query.sellToken || '').trim()
      const amount = String(req.query.amount || '').trim()
      const buyTokenParam = String(req.query.buyToken || 'USDC').trim()

      if (!sellToken || !amount) {
        return res.status(400).json({ error: 'sellToken and amount required' })
      }
      const amountNum = parseFloat(amount)
      if (!isFinite(amountNum) || amountNum <= 0) {
        return res.status(400).json({ error: 'amount must be a positive number' })
      }

      // Phase 2.5 — refresh the allowlist snapshot before lookups so an
      // admin enable/disable propagates within 60s without restart.
      await ensureSolanaAllowlistFresh()

      // Resolve sell → (mint, decimals). Accept either a catalog symbol or a
      // raw base58 mint (we treat 32–44 char strings without '/' as mints).
      const sellBySymbol = findSolanaTokenBySymbol(sellToken)
      const sellByMint = findSolanaTokenByMint(sellToken)
      let inputMint: string
      let inputDecimals: number
      if (sellBySymbol) {
        inputMint = sellBySymbol.mint
        inputDecimals = sellBySymbol.decimals
      } else if (sellByMint) {
        inputMint = sellByMint.mint
        inputDecimals = sellByMint.decimals
      } else if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(sellToken)) {
        // Raw mint not in our allowlist — refuse rather than guess decimals.
        // Admin must INSERT into solana_allowlist (or use the admin UI) first.
        return res.status(400).json({
          error: `Mint ${sellToken.slice(0, 8)}… not in Nuro Solana allowlist; add via admin first.`,
        })
      } else {
        return res.status(400).json({ error: `${sellToken} is not a known Solana token` })
      }

      // Resolve buy → mint. Default is USDC on Solana.
      const buyBySymbol = findSolanaTokenBySymbol(buyTokenParam)
      const buyByMint = findSolanaTokenByMint(buyTokenParam)
      const outputMint = buyBySymbol?.mint || buyByMint?.mint || USDC_SOLANA_MINT

      // Human → raw smallest-units via BigInt math (Solana amounts easily
      // exceed Number.MAX_SAFE_INTEGER for decimals=5 memes).
      const parts = amount.split('.')
      const whole = parts[0] || '0'
      const frac = (parts[1] || '').padEnd(inputDecimals, '0').slice(0, inputDecimals)
      const amountRaw = (BigInt(whole) * BigInt(10) ** BigInt(inputDecimals) + BigInt(frac || '0')).toString()

      const quote = await getJupiterQuoteCached(
        inputMint,
        outputMint,
        amountRaw,
        CONFIG.ZEROX_SLIPPAGE_BPS, // reuse same slippage tolerance for consistency
      )
      if (!quote) {
        return res.json({ degraded: true, error: 'Quote temporarily unavailable' })
      }

      res.json({
        buyAmountUsd: quote.buyAmountUsd,
        minBuyAmountUsd: quote.minBuyAmountUsd,
        meetsThreshold: quote.buyAmountUsd >= CONFIG.SWAP_MIN_USD,
        slippageBps: quote.slippageBps,
        minSwapUsd: CONFIG.SWAP_MIN_USD,
        chainName: 'Solana',
        priceImpactBps: quote.priceImpactBps,
        routeCount: quote.routeCount,
        routeLabels: quote.routeLabels,
        source: 'jupiter',
      })
    } catch (err: any) {
      console.error('GET /quote/swap-solana error:', err?.message || err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // ── GET /quote/swap-solana/firm ────────────────────────────────────────────
  // Session 30 Phase 3a — firm (executable) Solana swap. Returns a base64-
  // encoded versioned Solana transaction the user signs in their wallet.
  //
  // Differs from /quote/swap-solana (preview) in two ways:
  //   1. requires the user's Solana wallet pubkey (the signer)
  //   2. fetches a FRESH quote and constructs the swap tx via Jupiter
  //      /v6/swap. Cached preview quotes are not used here — Solana
  //      blockhashes have a ~60s validity window so we want the freshest
  //      route at the moment of signing.
  //
  // Optional destinationTokenAccount lets us route the swap output (USDC)
  // directly to OUR Nuro deposit ATA, completing a one-signature
  // PENGU-on-Solana → card-balance flow. When omitted, output lands in
  // the user's own ATA (default Jupiter behavior). Phase 3b plumbs the
  // Nuro deposit ATA derivation; Phase 3a leaves it caller-provided.
  //
  // Auth: requireAuth so we can later record a swap_attempt audit row
  // keyed on user_id even before we wire idempotency.
  //
  // Query params:
  //   sellToken (string, required)              — symbol or mint
  //   amount (string, required)                 — human-readable input
  //   userPublicKey (string, required)          — base58 Solana pubkey
  //   buyToken (string, optional)               — defaults to USDC
  //   destinationTokenAccount (string, optional) — base58 ATA pubkey
  //
  // Returns:
  //   { swapTransaction (base64), lastValidBlockHeight, inputMint,
  //     outputMint, inAmount, outAmount, minOutAmount, routeLabels,
  //     source: 'jupiter' }
  //   Or { degraded: true, error } when no route or Jupiter errored.
  router.get('/quote/swap-solana/firm', requireAuth, async (req: any, res: any) => {
    try {
      const sellToken = String(req.query.sellToken || '').trim()
      const amount = String(req.query.amount || '').trim()
      const userPublicKey = String(req.query.userPublicKey || '').trim()
      const buyTokenParam = String(req.query.buyToken || 'USDC').trim()
      const destinationTokenAccount = req.query.destinationTokenAccount
        ? String(req.query.destinationTokenAccount).trim()
        : undefined

      if (!sellToken || !amount || !userPublicKey) {
        return res.status(400).json({ error: 'sellToken, amount, userPublicKey required' })
      }
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(userPublicKey)) {
        return res.status(400).json({ error: 'userPublicKey must be a base58 Solana pubkey' })
      }
      if (destinationTokenAccount && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(destinationTokenAccount)) {
        return res.status(400).json({ error: 'destinationTokenAccount must be a base58 pubkey' })
      }
      const amountNum = parseFloat(amount)
      if (!isFinite(amountNum) || amountNum <= 0) {
        return res.status(400).json({ error: 'amount must be a positive number' })
      }

      await ensureSolanaAllowlistFresh()

      // Resolve sell mint + decimals
      const sellBySymbol = findSolanaTokenBySymbol(sellToken)
      const sellByMint = findSolanaTokenByMint(sellToken)
      const sellInfo = sellBySymbol || sellByMint
      if (!sellInfo) {
        return res.status(400).json({ error: `${sellToken} is not on the Solana allowlist` })
      }

      // Resolve buy mint
      const buyBySymbol = findSolanaTokenBySymbol(buyTokenParam)
      const buyByMint = findSolanaTokenByMint(buyTokenParam)
      const outputMint = buyBySymbol?.mint || buyByMint?.mint || USDC_SOLANA_MINT

      // Human → raw via BigInt math
      const parts = amount.split('.')
      const whole = parts[0] || '0'
      const frac = (parts[1] || '').padEnd(sellInfo.decimals, '0').slice(0, sellInfo.decimals)
      const amountRaw = (BigInt(whole) * BigInt(10) ** BigInt(sellInfo.decimals) + BigInt(frac || '0')).toString()

      // Phase 3c — auto-derive the user's Nuro Solana deposit USDC ATA so
      // the swap output flows DIRECTLY into our CCTP-monitored reserve.
      // Caller can override with destinationTokenAccount but that's only
      // for ops/testing — production FE flow always wants the deposit
      // routing.
      //
      // The Solana monitor (monitor.ts:633) already polls
      // getAssociatedTokenAddress(usdcMint, deposit_address_owner) and
      // triggers the CCTP burn → mint on Arbitrum/Base → card credit
      // chain when balance increases. So once the swap output lands in
      // this ATA, the rest of the reload loop is automatic.
      let resolvedDestination = destinationTokenAccount
      let depositRoutingActive = false
      if (!resolvedDestination && outputMint === USDC_SOLANA_MINT) {
        try {
          const userId = (req as any).user.id
          const depRow = await db.query(
            `SELECT address FROM deposit_addresses WHERE user_id = $1 AND chain = 'solana' LIMIT 1`,
            [userId],
          )
          const depositOwner = depRow.rows[0]?.address
          if (depositOwner) {
            const ata = await getAssociatedTokenAddress(
              new PublicKey(USDC_SOLANA_MINT),
              new PublicKey(depositOwner),
            )
            resolvedDestination = ata.toBase58()
            depositRoutingActive = true
          }
        } catch (e: any) {
          // If derivation fails (no deposit address yet, malformed pubkey,
          // etc.) we fall back to no destination override — output lands
          // in the user's own ATA. Logged for visibility but non-fatal.
          console.warn('[swap-solana/firm] could not derive deposit ATA:', e?.message)
        }
      }

      const swap = await getJupiterSwapTx({
        inputMint: sellInfo.mint,
        outputMint,
        amountRaw,
        slippageBps: CONFIG.ZEROX_SLIPPAGE_BPS,
        userPublicKey,
        destinationTokenAccount: resolvedDestination,
      })
      if (!swap) {
        return res.json({ degraded: true, error: 'Swap tx construction failed; refresh quote' })
      }

      // Audit log entry — best-effort, does not block response on failure.
      // Captures pre-sign state; the post-sign tx hash gets recorded by
      // the FE after broadcast.
      db.query(
        `INSERT INTO execution_log (entity_type, entity_id, user_id, action, status, metadata)
         VALUES ('swap_attempt', $1, $2, 'jupiter_swap_constructed', 'pending',
                 jsonb_build_object('inputMint', $3::text, 'outputMint', $4::text,
                                    'inAmount', $5::text, 'outAmount', $6::text,
                                    'destinationTokenAccount', $7::text,
                                    'depositRoutingActive', $8::boolean))`,
        [
          require('crypto').randomUUID(),
          (req as any).user.id,
          swap.inputMint,
          swap.outputMint,
          swap.inAmount,
          swap.outAmount,
          resolvedDestination || null,
          depositRoutingActive,
        ],
      ).catch((e: any) => console.warn('[swap-solana/firm] audit log failed:', e.message))

      res.json({
        swapTransaction: swap.swapTransaction,
        lastValidBlockHeight: swap.lastValidBlockHeight,
        inputMint: swap.inputMint,
        outputMint: swap.outputMint,
        inAmount: swap.inAmount,
        outAmount: swap.outAmount,
        minOutAmount: swap.minOutAmount,
        routeLabels: swap.routeLabels,
        source: swap.source,
        chainName: 'Solana',
        // Phase 3c: tells FE whether the swap output will land in OUR
        // Nuro deposit ATA (→ CCTP monitor → card credit) vs the user's
        // own ATA (no auto-reload). Drives the "Sign & swap → card
        // credit" vs "Sign & swap → wallet" copy.
        depositRoutingActive,
        depositTokenAccount: depositRoutingActive ? resolvedDestination : null,
      })
    } catch (err: any) {
      console.error('GET /quote/swap-solana/firm error:', err?.message || err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // ── GET /quote/best ────────────────────────────────────────────────────────
  // Session 30 Phase 2 — unified quote endpoint. Dispatches the request to
  // every applicable source (0x for EVM, Jupiter for Solana, more to come)
  // in parallel, returns the winner by buyAmountUsd + runner-up alternatives.
  //
  // Query params:
  //   chainId (number, required)   — EVM chainId OR -1 for Solana
  //   sellToken (string, required) — symbol or raw address/mint
  //   amount (string, required)    — human-readable input
  //   buyToken (string, optional)  — defaults to USDC on the chosen chain
  //
  // Returns:
  //   { source, chainId, chainName, buyAmountUsd, minBuyAmountUsd,
  //     meetsThreshold, slippageBps, minSwapUsd,
  //     alternatives: [...],              // other sources that succeeded
  //     failedSources: [{source,reason}], // sources that errored
  //     elapsedMs                         // fan-out latency
  //   }
  //   Or { degraded: true, error } when every applicable source failed.
  //
  // Legacy /quote/swap and /quote/swap-solana stay wired for compat; FE
  // should migrate to /quote/best when convenient.
  router.get('/quote/best', async (req: any, res: any) => {
    try {
      const chainIdStr = String(req.query.chainId || '')
      const sellToken = String(req.query.sellToken || '').trim()
      const amount = String(req.query.amount || '').trim()
      const buyToken = req.query.buyToken ? String(req.query.buyToken).trim() : undefined

      if (!chainIdStr || !sellToken || !amount) {
        return res.status(400).json({ error: 'chainId, sellToken, amount required' })
      }
      const chainId = Number(chainIdStr)
      if (!Number.isInteger(chainId)) {
        return res.status(400).json({ error: 'chainId must be an integer (or -1 for Solana)' })
      }
      const amountNum = parseFloat(amount)
      if (!isFinite(amountNum) || amountNum <= 0) {
        return res.status(400).json({ error: 'amount must be a positive number' })
      }

      const agg = await getBestQuote({ chainId, sellToken, amount, buyToken })
      if (!agg) {
        return res.json({ degraded: true, error: 'Quote temporarily unavailable' })
      }
      res.json(agg)
    } catch (err: any) {
      console.error('GET /quote/best error:', err?.message || err)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // ── GET /quote/swap/firm ───────────────────────────────────────────────────
  // Session 25 Phase 4 — user-signed swap execution. Returns the full 0x
  // transaction payload ({to, data, value, gas}) so the FE can hand it to
  // wagmi for signing with the connected wallet. Unlike /quote/swap (which
  // is preview-only and uses a synthetic taker), this requires a real taker
  // address and returns an executable tx.
  //
  // Query params:
  //   chainId (number, required)
  //   sellToken (string, required) — 'native' OR allowlisted ERC-20 symbol
  //   amount (string, required) — human-readable (e.g. "0.01")
  //   taker (string, required) — connected wallet address
  //
  // Returns: {
  //   to, data, value, gas,               // raw tx — pass directly to wagmi
  //   allowanceTarget,                    // ERC-20 approval target (null for native)
  //   buyAmount, minBuyAmount,            // integer strings in USDC 6-dec
  //   buyAmountUsd, slippageBps,
  //   sellTokenAddress, sellDecimals,     // for FE reference
  // }
  router.get("/quote/swap/firm", async (req: any, res: any) => {
    try {
      const chainId = Number(req.query.chainId)
      const sellToken = String(req.query.sellToken || '').trim()
      const amount = String(req.query.amount || '').trim()
      const taker = String(req.query.taker || '').trim()
      // S31 H1: optional buy-side override. Default = USDC (the card-credit
      // pipeline is unchanged). When the FE wallet swap panel targets a
      // memecoin/bluechip/native destination, it sends the symbol and we
      // resolve to the allowlisted token + decimals + USD price.
      const buyTokenParam = String(req.query.buyToken || '').trim()

      if (!chainId || !sellToken || !amount || !taker) {
        return res.status(400).json({ error: 'chainId, sellToken, amount, taker required' })
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(taker)) {
        return res.status(400).json({ error: 'taker must be a 0x-prefixed 40-char hex string' })
      }

      const nativeInfo = NATIVE_TOKENS[chainId]
      if (!nativeInfo) {
        return res.status(400).json({ error: `chain ${chainId} not supported for swap` })
      }

      const amountNum = parseFloat(amount)
      if (!isFinite(amountNum) || amountNum <= 0) {
        return res.status(400).json({ error: 'amount must be a positive number' })
      }

      const { getNativeSwapQuote, getErc20SwapQuote } = await import('./swap')
      const NATIVE_SENTINEL_LOCAL = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

      let sellAddress: string
      let decimals: number
      let isNative = false
      if (sellToken === 'native' || sellToken === nativeInfo.nativeSymbol) {
        isNative = true
        sellAddress = NATIVE_SENTINEL_LOCAL
        decimals = nativeInfo.nativeDecimals
      } else {
        await ensureAllowlistFresh()
        const erc20 = findErc20(chainId, sellToken)
        if (!erc20) {
          return res.status(400).json({ error: `${sellToken} is not on the allowlist for chain ${chainId}` })
        }
        sellAddress = erc20.address
        decimals = erc20.decimals
      }

      // Resolve buy-side override if the caller specified one. Empty / 'USDC' /
      // 'usdc' all map to "no override" → defaults to USDC inside the swap
      // module. Anything else MUST be on the allowlist (we don't let users
      // target arbitrary contract addresses through this surface).
      let buyOverride: { address: string; decimals: number; usdPricePerUnit?: number } | undefined
      let buyTokenAddress: string = nativeInfo.usdcAddress
      let buyTokenSymbol = 'USDC'
      let buyTokenDecimals = nativeInfo.usdcDecimals
      if (buyTokenParam && buyTokenParam.toUpperCase() !== 'USDC') {
        if (buyTokenParam === 'native' || buyTokenParam === nativeInfo.nativeSymbol) {
          buyTokenAddress = NATIVE_SENTINEL_LOCAL
          buyTokenSymbol = nativeInfo.nativeSymbol
          buyTokenDecimals = nativeInfo.nativeDecimals
          buyOverride = { address: NATIVE_SENTINEL_LOCAL, decimals: nativeInfo.nativeDecimals }
        } else {
          await ensureAllowlistFresh()
          const buyErc20 = findErc20(chainId, buyTokenParam)
          if (!buyErc20) {
            return res.status(400).json({ error: `${buyTokenParam} is not on the allowlist for chain ${chainId}` })
          }
          buyTokenAddress = buyErc20.address
          buyTokenSymbol = buyErc20.symbol
          buyTokenDecimals = buyErc20.decimals
          buyOverride = { address: buyErc20.address, decimals: buyErc20.decimals }
        }
      }

      const sellAmountRaw = ethers.utils.parseUnits(amount, decimals)
      const quote = isNative
        ? await getNativeSwapQuote(chainId, sellAmountRaw, taker, buyOverride)
        : await getErc20SwapQuote(chainId, sellAddress, sellAmountRaw, taker, buyOverride)

      res.json({
        to: quote.to,
        data: quote.data,
        value: quote.value,
        gas: quote.gas,
        // AllowanceHolder is at the quote's `to` for ERC-20 sells — the FE
        // approves that same address. For native, no approval needed.
        allowanceTarget: isNative ? null : quote.to,
        buyAmount: quote.buyAmount.toString(),
        minBuyAmount: quote.minBuyAmount.toString(),
        buyAmountUsd: quote.buyAmountUsd,
        slippageBps: CONFIG.ZEROX_SLIPPAGE_BPS,
        sellTokenAddress: sellAddress,
        sellDecimals: decimals,
        sellIsNative: isNative,
        // Buy-side echo so the FE can compute USD value via its own price feed
        // when buyAmountUsd is NaN (non-USDC target without backend price hint).
        buyTokenAddress,
        buyTokenSymbol,
        buyTokenDecimals,
        chainName: nativeInfo.chainName,
      })
    } catch (err: any) {
      console.error("GET /quote/swap/firm error:", err.message)
      // 0x rate-limit or validation failure surfaces as a 502 so the FE
      // can distinguish from a hard 500 server bug
      const status = err.response?.status === 429 ? 429 : 502
      res.status(status).json({ error: err.message || 'Firm quote unavailable', degraded: true })
    }
  })

  // ── PATCH /users/profile ───────────────────────────────────────────────────
  router.patch("/users/profile", requireAuth, async (req: any, res: any) => {
    const { name, email, phone } = req.body ?? {};
    if (!name && !email && phone === undefined) {
      return res.status(400).json({ error: "Nothing to update" });
    }
    try {
      const setClauses: string[] = [];
      const values: any[] = [];
      let idx = 1;
      if (name)            { setClauses.push(`name = $${idx++}`);  values.push(name); }
      if (email)           { setClauses.push(`email = $${idx++}`); values.push(email); }
      if (phone !== undefined) { setClauses.push(`phone = $${idx++}`); values.push(phone || null); }
      values.push((req as any).user.id);
      await db.query(`UPDATE users SET ${setClauses.join(", ")} WHERE id = $${idx}`, values);
      res.json({ success: true });
    } catch (err: any) {
      console.error("PATCH /users/profile error:", err);
      if (err.code === "23505") return res.status(409).json({ error: "Email already in use" });
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── POST /users/change-password ────────────────────────────────────────────
  router.post("/users/change-password", requireAuth, async (req: any, res: any) => {
    const { currentPassword, newPassword } = req.body ?? {};
    if (!currentPassword || !newPassword)
      return res.status(400).json({ error: "currentPassword and newPassword are required" });
    if (newPassword.length < 8)
      return res.status(400).json({ error: "New password must be at least 8 characters" });
    try {
      const { rows } = await db.query("SELECT password_hash FROM users WHERE id = $1", [(req as any).user.id]);
      if (!rows[0]) return res.status(404).json({ error: "User not found" });
      const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
      if (!valid) return res.status(401).json({ error: "Current password is incorrect" });
      const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
      await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [newHash, (req as any).user.id]);
      res.json({ success: true });
    } catch (err) {
      console.error("POST /users/change-password error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── PATCH /users/notifications ─────────────────────────────────────────────
  router.patch("/users/notifications", requireAuth, async (req: any, res: any) => {
    const { notificationPrefs } = req.body ?? {};
    if (!notificationPrefs || typeof notificationPrefs !== "object")
      return res.status(400).json({ error: "notificationPrefs object is required" });
    try {
      await db.query(
        "UPDATE users SET notification_prefs = $1 WHERE id = $2",
        [JSON.stringify(notificationPrefs), (req as any).user.id]
      );
      res.json({ success: true });
    } catch (err) {
      console.error("PATCH /users/notifications error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });



  // ── GET /users/preferences ──────────────────────────────────────────────
  router.get("/users/preferences", requireAuth, async (req: any, res: any) => {
    try {
      const result = await db.query("SELECT preferences FROM users WHERE id = $1", [(req as any).user.id]);
      res.json(result.rows[0]?.preferences || {});
    } catch (err) {
      console.error("GET /users/preferences error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  // ── PATCH /users/payout-destination (Sprint B) ───────────────────────────
  // Set where market winnings are routed.
  // Format: 'vault' | 'card' | 'agent:<id>' | 'user:<uuid>' | 'community:<id>' | 'external:<0xaddr>' | 'reinvest:<marketId>'
  // Sprint B implements 'vault' (no-op) and 'card' (vault→Issuer). Others reserved.
  router.patch("/users/payout-destination", requireAuth, async (req: any, res: any) => {
    const userId = req.user.id
    const { destination } = req.body || {}
    if (!destination || typeof destination !== 'string') {
      return res.status(400).json({ error: "destination string required" })
    }
    if (destination.length > 100) {
      return res.status(400).json({ error: "destination too long (max 100 chars)" })
    }

    // Validate prefix + shape at app layer (no DB constraint on purpose — extensible)
    const exactMatches = ['vault', 'card']
    const prefixes: { prefix: string; argPattern?: RegExp; functional: boolean }[] = [
      { prefix: 'agent:',      argPattern: /^[a-zA-Z0-9-]{1,80}$/,         functional: false },
      { prefix: 'user:',       argPattern: /^[0-9a-f-]{36}$/,               functional: false },
      { prefix: 'community:',  argPattern: /^[a-zA-Z0-9-]{1,80}$/,           functional: false },
      { prefix: 'external:',   argPattern: /^0x[a-fA-F0-9]{40}$/,            functional: false },
      { prefix: 'reinvest:',   argPattern: /^[0-9a-f-]{36}$/,                functional: false },
    ]

    let isValid = false
    let isFunctional = exactMatches.includes(destination)
    if (isFunctional) {
      isValid = true
    } else {
      for (const p of prefixes) {
        if (destination.startsWith(p.prefix)) {
          const arg = destination.slice(p.prefix.length)
          if (p.argPattern && p.argPattern.test(arg)) {
            isValid = true
            isFunctional = p.functional
            break
          }
        }
      }
    }

    if (!isValid) {
      return res.status(400).json({
        error: "Invalid destination format",
        allowed: ['vault', 'card', 'agent:<id>', 'user:<uuid>', 'community:<id>', 'external:<0xaddr>', 'reinvest:<marketId>']
      })
    }

    try {
      await db.query('UPDATE users SET payout_destination = $1 WHERE id = $2', [destination, userId])
      res.json({
        destination,
        functional: isFunctional,
        note: isFunctional ? null : `Destination '${destination}' saved but not yet functional; winnings will stay in vault.`
      })
    } catch (err: any) {
      console.error('PATCH /users/payout-destination error:', err.message)
      res.status(500).json({ error: 'Update failed' })
    }
  })

  // ── PATCH /users/preferences ─────────────────────────────────────────────
  router.patch("/users/preferences", requireAuth, async (req: any, res: any) => {
    const prefs = req.body;
      return res.status(400).json({ error: "preferences object is required" });
    try {
      const result = await db.query(
        "UPDATE users SET preferences = COALESCE(preferences, '{}'::jsonb) || $1::jsonb WHERE id = $2 RETURNING preferences",
        [JSON.stringify(prefs), (req as any).user.id]
      );
      res.json(result.rows[0]?.preferences || {});
    } catch (err) {
      console.error("PATCH /users/preferences error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });


  // ── GET /users/export-data ──────────────────────────────────────────────
  router.get("/users/export-data", requireAuth, async (req: any, res: any) => {
    const userId = (req as any).user.id;
    try {
      const [user, cards, txns, transfers, withdrawals] = await Promise.all([
        db.query("SELECT id, email, name, created_at FROM users WHERE id = $1", [userId]),
        db.query("SELECT id, card_holder, card_type, balance, is_active, is_locked, created_at FROM cards WHERE user_id = $1", [userId]),
        db.query("SELECT id, amount, type, status, category, merchant_name, created_at FROM card_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500", [userId]),
        db.query("SELECT id, recipient_name, amount, currency, status, created_at FROM transfers WHERE sender_id = $1 ORDER BY created_at DESC LIMIT 200", [userId]),
        db.query("SELECT id, destination_address, amount, token, status, created_at FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200", [userId]),
      ]);
      res.json({
        exportDate: new Date().toISOString(),
        user: user.rows[0] || {},
        cards: cards.rows,
        transactions: txns.rows,
        transfers: transfers.rows,
        withdrawals: withdrawals.rows,
      });
    } catch (err) {
      console.error("GET /users/export-data error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });


  // ── GET /plans ──────────────────────────────────────────────────────────
  router.get("/plans", async (_req: any, res: any) => {
    try {
      const result = await db.query("SELECT * FROM plans WHERE is_active = true ORDER BY price ASC");
      res.json(result.rows);
    } catch (err) {
      console.error("GET /plans error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── GET /subscriptions/me ───────────────────────────────────────────────
  router.get("/subscriptions/me", requireAuth, async (req: any, res: any) => {
    const userId = (req as any).user.id;
    try {
      const result = await db.query(
        `SELECT s.*, p.name as plan_name, p.price, p.interval, p.features
         FROM subscriptions s JOIN plans p ON s.plan_id = p.id
         WHERE s.user_id = $1`,
        [userId]
      );
      if (!result.rows[0]) return res.json({ plan_name: "Free", price: 0, features: [], status: "active" });
      res.json(result.rows[0]);
    } catch (err) {
      console.error("GET /subscriptions/me error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── POST /subscriptions/upgrade ─────────────────────────────────────────
  router.post("/subscriptions/upgrade", requireAuth, async (req: any, res: any) => {
    const userId = (req as any).user.id;
    const { planId } = req.body;
    if (!planId) return res.status(400).json({ error: "planId is required" });
    try {
      const plan = await db.query("SELECT * FROM plans WHERE id = $1 AND is_active = true", [planId]);
      if (!plan.rows[0]) return res.status(404).json({ error: "Plan not found" });
      const result = await db.query(
        `INSERT INTO subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
         VALUES ($1, $2, 'active', now(), now() + interval '30 days')
         ON CONFLICT (user_id) DO UPDATE SET
           plan_id = $2, status = 'active',
           current_period_start = now(),
           current_period_end = now() + interval '30 days'
         RETURNING *`,
        [userId, planId]
      );
      // Record in billing history
      await db.query(
        `INSERT INTO billing_history (user_id, plan_name, amount, status, description)
         VALUES ($1, $2, $3, 'paid', $4)`,
        [userId, plan.rows[0].name, plan.rows[0].price, "Upgraded to " + plan.rows[0].name + " plan"]
      );
      // Create notification
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message) VALUES ($1, 'system', 'Plan Upgraded', $2)`,
        [userId, "You have been upgraded to the " + plan.rows[0].name + " plan"]
      );
      res.json({ subscription: result.rows[0], plan: plan.rows[0] });
    } catch (err) {
      console.error("POST /subscriptions/upgrade error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── GET /billing/history ────────────────────────────────────────────────
  router.get("/billing/history", requireAuth, async (req: any, res: any) => {
    const userId = (req as any).user.id;
    try {
      const result = await db.query(
        "SELECT * FROM billing_history WHERE user_id = $1 ORDER BY invoice_date DESC LIMIT 50",
        [userId]
      );
      res.json(result.rows);
    } catch (err) {
      console.error("GET /billing/history error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── GET /cards (payment methods — alias for cards list) ─────────────────

  // KYC status (polled by frontend)
  router.get("/kyc/status", requireAuth, async (req: any, res: any) => {
    try {
      const result = await db.query("SELECT kyc_status FROM users WHERE id = $1", [req.user.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
      // Same read-side normalization as the earlier /kyc/status route above.
      // Two routes for the same endpoint (legacy) — both normalize.
      const normalized = normalizeKycStatus(result.rows[0].kyc_status) || "pending";
      res.json({ status: normalized });
    } catch (err: any) {
      console.error("GET /kyc/status error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // KYC webhook (Issuer POSTs here on approval/rejection)
  // SECURITY: HMAC-SHA256 signature verification (Sprint 4.1)
  router.post("/kyc/webhook", async (req: any, res: any) => {
    try {
      // ── HMAC SIGNATURE VERIFICATION ──
      const ISSUER_WEBHOOK_SECRET = process.env.ISSUER_WEBHOOK_SECRET || process.env.OWENS_WEBHOOK_SECRET
      const signature = req.headers['x-webhook-signature'] || req.headers['x-issuer-signature']
      const sourceIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown'
      const rawBody = JSON.stringify(req.body)
      let signatureVerified = false

      if (ISSUER_WEBHOOK_SECRET && signature) {
        const crypto = require('crypto')
        const expectedSig = crypto.createHmac('sha256', ISSUER_WEBHOOK_SECRET).update(rawBody).digest('hex')
        signatureVerified = crypto.timingSafeEqual(
          Buffer.from(signature.toString().replace(/^sha256=/, ''), 'hex'),
          Buffer.from(expectedSig, 'hex')
        )
      }

      // Log every webhook (verified or not)
      await db.query(
        `INSERT INTO webhook_verifications (webhook_source, endpoint, signature_provided, signature_verified, request_body_hash, source_ip)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['issuer', '/kyc/webhook', signature?.toString().slice(0, 200) || null, signatureVerified, require('crypto').createHash('sha256').update(rawBody).digest('hex'), sourceIp]
      ).catch(() => {})

      // If secret is configured, REJECT unsigned/invalid requests in production
      if (ISSUER_WEBHOOK_SECRET && !signatureVerified) {
        console.warn(`[KYC webhook] Signature verification FAILED from ${sourceIp}`)
        return res.status(401).json({ error: 'Invalid webhook signature' })
      }

      const { userId, status, sd3_user_id, issuer_user_id } = req.body;
      let userResult: any;
      if (sd3_user_id || issuer_user_id) {
        const lookupId = sd3_user_id || issuer_user_id;
        userResult = await db.query("SELECT id FROM users WHERE sd3_user_id = $1 OR issuer_user_id = $1", [lookupId]);
      } else if (userId) {
        userResult = await db.query("SELECT id FROM users WHERE id = $1", [userId]);
      } else {
        return res.status(400).json({ error: "No user identifier provided" });
      }
      if (!userResult || userResult.rows.length === 0) return res.status(404).json({ error: "User not found" });
      const dbUserId = userResult.rows[0].id;
      const kycStatus = status === "approved" ? "approved" : status === "rejected" ? "rejected" : "pending";
      await db.query("UPDATE users SET kyc_status = $1 WHERE id = $2", [kycStatus, dbUserId]);
      console.log("[KYC webhook] User " + dbUserId + " status -> " + kycStatus);
      res.json({ success: true, status: kycStatus });
    } catch (err: any) {
      console.error("POST /kyc/webhook error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ═══════════════════════════════════════════
  // NOTIFICATIONS (added 2026-03-31)
  // ═══════════════════════════════════════════

  // GET /notifications
  //
  // S34 Marathon 9 sprint 9.3: extends the manual `notifications` table
  // feed by also synthesizing recent rows from event-source tables that
  // previously had no user-facing surface:
  //   - heimdall_events for the user's agents (severity high/critical)
  //   - card_alerts for the user's cards (lost/stolen, freeze events)
  //   - card_settlements completed (profit-to-card sweeps)
  //   - heimdall_events with kind='huginn-counsel' returning
  //     dissent/block-recommend on the user's actions
  //
  // Each source query is wrapped in .catch() so a missing table or
  // schema drift on one source degrades to an empty list rather than
  // 500'ing the whole feed. Synthetic rows use the source event UUID
  // as the notification id; mark-read on those is a no-op (the row
  // doesn't exist in the notifications table) — they reappear on next
  // fetch until acknowledged at the source. That's an acceptable
  // MVP behavior; per-row read-state for synthetic items is queued
  // as a Marathon 9 follow-up.
  router.get("/notifications", requireAuth, async (req: any, res: Response) => {
    const userId = req.user.id;
    const noRows: { rows: any[] } = { rows: [] };
    const safe = (sql: string, params: any[]) =>
      db.query(sql, params).catch((err: any) => {
        console.warn(`[notifications] sub-query failed (degrading): ${err?.message?.slice(0, 120)}`);
        return noRows;
      });

    try {
      const [manualRes, heimRes, alertRes, sweepRes, counselRes] = await Promise.all([
        // Manual notifications table (the original feed)
        safe(
          `SELECT id::text AS id, type, title, message, is_read, action_url, metadata, created_at, 'manual' AS source_kind
           FROM notifications
           WHERE user_id = $1 AND is_dismissed = false
           ORDER BY created_at DESC LIMIT 50`,
          [userId],
        ),
        // Helm security events for this user OR any of their agents,
        // high/critical severity only, last 30 days. The dual-keyed agent_id
        // covers both system-attribution (user.id) and direct-attribution
        // (agent.id) cases — see Marathon 9 / A3.
        safe(
          `SELECT he.id::text AS id,
                  'security' AS type,
                  CONCAT('Security alert: ', he.rule_id) AS title,
                  COALESCE(he.subject, '(no subject)') AS message,
                  false AS is_read,
                  NULL AS action_url,
                  jsonb_build_object(
                    'severity', he.severity,
                    'rule_id', he.rule_id,
                    'agent_id', he.agent_id,
                    'source', 'heimdall'
                  ) AS metadata,
                  he.occurred_at AS created_at,
                  'heimdall' AS source_kind
           FROM heimdall_events he
           WHERE (he.agent_id = $1 OR he.agent_id IN (SELECT id::text FROM agents WHERE user_id = $1))
             AND he.severity IN ('high', 'critical')
             AND he.occurred_at > NOW() - INTERVAL '30 days'
             AND COALESCE(he.context->>'kind', '') <> 'huginn-counsel'
           ORDER BY he.occurred_at DESC LIMIT 25`,
          [userId],
        ),
        // Card alerts for the user's cards (Report Lost/Stolen + freeze events)
        safe(
          `SELECT ca.id::text AS id,
                  'alert' AS type,
                  'Card alert' AS title,
                  COALESCE(ca.description, '(no description)') AS message,
                  false AS is_read,
                  NULL AS action_url,
                  jsonb_build_object(
                    'card_id', ca.card_id,
                    'amount', ca.amount,
                    'source', 'card_alert'
                  ) AS metadata,
                  ca.created_at,
                  'card_alert' AS source_kind
           FROM card_alerts ca
           JOIN cards c ON c.id = ca.card_id
           WHERE c.user_id = $1
             AND ca.created_at > NOW() - INTERVAL '14 days'
           ORDER BY ca.created_at DESC LIMIT 15`,
          [userId],
        ),
        // Profit-to-card sweep completions — closes the gains-funnel-to-card
        // visibility gap from Marathon 9 Tier C.
        safe(
          `SELECT cs.id::text AS id,
                  'transaction' AS type,
                  'Profit settled to card' AS title,
                  CONCAT('$', cs.amount::text, ' deposited from agent profits') AS message,
                  false AS is_read,
                  NULL AS action_url,
                  jsonb_build_object(
                    'amount', cs.amount,
                    'tx_hash', cs.tx_hash,
                    'agent_id', cs.metadata->>'agent_id',
                    'source', 'settlement'
                  ) AS metadata,
                  COALESCE(cs.completed_at, cs.created_at) AS created_at,
                  'settlement' AS source_kind
           FROM card_settlements cs
           WHERE cs.user_id = $1
             AND cs.status = 'completed'
             AND COALESCE(cs.completed_at, cs.created_at) > NOW() - INTERVAL '14 days'
           ORDER BY COALESCE(cs.completed_at, cs.created_at) DESC LIMIT 15`,
          [userId],
        ),
        // Huginn dissents — when Huginn pushed back on this user's agent's
        // proposed action. Endorse verdicts skipped (low signal value);
        // caution / dissent / block-recommend surface here.
        safe(
          `SELECT he.id::text AS id,
                  'info' AS type,
                  CONCAT('Huginn ', COALESCE(he.context->>'verdict', 'counsel')) AS title,
                  COALESCE(he.subject, COALESCE(he.context->>'reasoning', '(no reasoning)')) AS message,
                  false AS is_read,
                  NULL AS action_url,
                  jsonb_build_object(
                    'verdict', he.context->>'verdict',
                    'agent_id', he.agent_id,
                    'source', 'huginn'
                  ) AS metadata,
                  he.occurred_at AS created_at,
                  'huginn' AS source_kind
           FROM heimdall_events he
           WHERE (he.agent_id = $1 OR he.agent_id IN (SELECT id::text FROM agents WHERE user_id = $1))
             AND he.context->>'kind' = 'huginn-counsel'
             AND he.context->>'verdict' IN ('caution', 'dissent', 'block-recommend')
             AND he.occurred_at > NOW() - INTERVAL '14 days'
           ORDER BY he.occurred_at DESC LIMIT 10`,
          [userId],
        ),
      ]);

      const merged = [
        ...manualRes.rows,
        ...heimRes.rows,
        ...alertRes.rows,
        ...sweepRes.rows,
        ...counselRes.rows,
      ]
        .filter((r) => r && r.created_at)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 50);

      // Apply notification_reads state to synthetic + manual rows alike.
      // Manual rows already carry `is_read` from their column; for those
      // we OR the source value with any explicit read entry. Dismissed
      // rows are filtered out client-side via the existing `is_dismissed`
      // (manual) AND a join against notification_reads.dismissed_at
      // (synthetic). One round-trip keyed by user_id.
      if (merged.length > 0) {
        const ids = merged.map((r: any) => String(r.id));
        const reads = await safe(
          `SELECT notification_key, read_at, dismissed_at
             FROM notification_reads
             WHERE user_id = $1 AND notification_key = ANY($2)`,
          [userId, ids],
        );
        const readMap = new Map<string, { read: boolean; dismissed: boolean }>();
        for (const r of reads.rows) {
          readMap.set(r.notification_key, {
            read: r.read_at != null,
            dismissed: r.dismissed_at != null,
          });
        }
        const filtered = merged
          .map((r: any) => {
            const state = readMap.get(String(r.id));
            return {
              ...r,
              is_read: r.is_read || (state?.read ?? false),
              _dismissed: state?.dismissed ?? false,
            };
          })
          .filter((r: any) => !r._dismissed)
          .map(({ _dismissed, ...rest }: any) => rest);
        return res.json(filtered);
      }

      res.json(merged);
    } catch (err: any) {
      console.error("GET /notifications error:", err.message);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  // PATCH /notifications/:id/read
  //
  // S34 9.3 quick win: handles BOTH manual notifications (UPDATE the
  // notifications row) AND synthetic event-source rows (upsert into
  // notification_reads tracker keyed by user_id + notification_key).
  // Either path returns 200; never 404 — the FE can't distinguish row
  // origins client-side, and a stale-id read attempt is harmless.
  // Casting id to text on the manual UPDATE so a non-UUID synthetic
  // key doesn't trip the type check.
  router.patch("/notifications/:id/read", requireAuth, async (req: any, res: Response) => {
    try {
      const id = String(req.params.id);
      const userId = req.user.id;
      // Try the manual notifications table first.
      let manualUpdate: { rowCount: number | null; rows: any[] } = { rowCount: 0, rows: [] };
      try {
        manualUpdate = await db.query(
          `UPDATE notifications SET is_read = true WHERE id::text = $1 AND user_id = $2 RETURNING *`,
          [id, userId],
        );
      } catch {
        // id failed UUID parse — definitely not a manual row, fall through.
      }
      if ((manualUpdate.rowCount ?? 0) > 0) {
        return res.json({ ok: true, source: "manual", row: manualUpdate.rows[0] });
      }
      // Synthetic — record into the tracker. UPSERT keyed by (user, key).
      await db.query(
        `INSERT INTO notification_reads (user_id, notification_key, read_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id, notification_key)
         DO UPDATE SET read_at = COALESCE(notification_reads.read_at, EXCLUDED.read_at)`,
        [userId, id],
      );
      res.json({ ok: true, source: "synthetic" });
    } catch (err: any) {
      console.error("PATCH /notifications/:id/read error:", err.message);
      res.status(500).json({ error: "Failed to mark notification read" });
    }
  });

  // POST /notifications/read-all
  //
  // S30 UX fix: this endpoint's name is "read-all" for backward compat,
  // but semantically it now DISMISSES all un-dismissed rows too. Rationale:
  //   - Dropdown query filters WHERE is_dismissed = false. Setting
  //     is_read alone didn't hide anything → users saw "Clear All" do
  //     nothing visible, tried again, thought notifications were
  //     duplicating. S30 bug: "After I cleared these notifications they
  //     re-fetched and showed on my notifications tab again."
  //   - The FE button label changed from "Mark All Read" to "Clear All"
  //     in the same patch; endpoint now matches that user expectation.
  //
  // If we need separate "read-only-without-dismiss" semantics later
  // (e.g. settings page "mark read without hiding"), add a new endpoint
  // rather than splitting this one.
  router.post("/notifications/read-all", requireAuth, async (req: any, res: Response) => {
    try {
      const result = await db.query(
        `UPDATE notifications
         SET is_read = true, is_dismissed = true
         WHERE user_id = $1 AND is_dismissed = false`,
        [req.user.id]
      );
      res.json({ success: true, dismissed: result.rowCount || 0 });
    } catch (err: any) {
      console.error("POST /notifications/read-all error:", err.message);
      res.status(500).json({ error: "Failed to clear notifications" });
    }
  });

  // PATCH /notifications/:id/dismiss
  //
  // Same dual-target pattern as /read: manual UPDATE first, fall back
  // to notification_reads upsert for synthetic event-source ids.
  // Always 200 on success — no 404 since the FE can't distinguish.
  router.patch("/notifications/:id/dismiss", requireAuth, async (req: any, res: Response) => {
    try {
      const id = String(req.params.id);
      const userId = req.user.id;
      let manualUpdate: { rowCount: number | null; rows: any[] } = { rowCount: 0, rows: [] };
      try {
        manualUpdate = await db.query(
          `UPDATE notifications SET is_dismissed = true WHERE id::text = $1 AND user_id = $2 RETURNING *`,
          [id, userId],
        );
      } catch {
        // not a UUID — synthetic, fall through.
      }
      if ((manualUpdate.rowCount ?? 0) > 0) {
        return res.json({ ok: true, source: "manual", row: manualUpdate.rows[0] });
      }
      // Synthetic — record dismissal in tracker (also marks as read).
      await db.query(
        `INSERT INTO notification_reads (user_id, notification_key, read_at, dismissed_at)
         VALUES ($1, $2, NOW(), NOW())
         ON CONFLICT (user_id, notification_key)
         DO UPDATE SET dismissed_at = COALESCE(notification_reads.dismissed_at, EXCLUDED.dismissed_at),
                       read_at      = COALESCE(notification_reads.read_at, EXCLUDED.read_at)`,
        [userId, id],
      );
      res.json({ ok: true, source: "synthetic" });
    } catch (err: any) {
      console.error("PATCH /notifications/:id/dismiss error:", err.message);
      res.status(500).json({ error: "Failed to dismiss notification" });
    }
  });


  // ─── Address Book (S30 batch — Chris SendModal wiring) ──────────────────
  //
  // Two surfaces:
  //   GET /address-book/recent — inferred from withdrawals (Last Used tab)
  //   GET /address-book         — user-curated saved contacts (migration 031)
  //   POST /address-book        — add a saved contact
  //   PATCH /address-book/:id   — rename / toggle favorite
  //   DELETE /address-book/:id  — remove

  // GET /address-book — user's saved contacts, favorites-first
  router.get("/address-book", requireAuth, async (req: any, res: Response) => {
    try {
      const { rows } = await db.query(
        `SELECT id, address, label, chain, favorite, notes, created_at, updated_at
         FROM address_book WHERE user_id = $1
         ORDER BY favorite DESC, created_at DESC`,
        [req.user.id],
      );
      res.json({
        contacts: rows.map((r: any) => ({
          id: r.id,
          address: r.address,
          label: r.label,
          chain: r.chain,
          favorite: Boolean(r.favorite),
          notes: r.notes,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        })),
      });
    } catch (err: any) {
      console.error("GET /address-book error:", err.message);
      res.status(500).json({ error: "Failed to fetch address book" });
    }
  });

  // POST /address-book — add a saved contact.
  // Body: { address, label, chain?, favorite?, notes? }
  // Chain inferred from address shape when omitted.
  router.post("/address-book", requireAuth, async (req: any, res: Response) => {
    try {
      const { address: rawAddr, label: rawLabel, chain: rawChain, favorite, notes } = req.body || {};
      const address = typeof rawAddr === "string" ? rawAddr.trim() : "";
      const label = typeof rawLabel === "string" ? rawLabel.trim() : "";
      if (!address || !label) {
        return res.status(400).json({ error: "address and label required" });
      }
      if (label.length > 100) {
        return res.status(400).json({ error: "label max 100 chars" });
      }
      // Loose chain detection: 0x prefix → EVM, base58 shape → Solana,
      // otherwise keep the caller's hint or leave null (ENS etc.).
      let chain: string | null = typeof rawChain === "string" ? rawChain.trim() : null;
      if (!chain) {
        if (/^0x[0-9a-fA-F]{40}$/.test(address)) chain = "evm";
        else if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) chain = "solana";
        else if (/\.eth$/i.test(address)) chain = "ens";
      }
      // Store EVM addresses canonical-lowercase so dedup-by-address works
      // regardless of user's capitalization. Solana is case-sensitive
      // (base58), ENS is case-insensitive per spec so we lowercase too.
      const storedAddress = chain === "evm" || chain === "ens" ? address.toLowerCase() : address;
      const { rows } = await db.query(
        `INSERT INTO address_book (user_id, address, label, chain, favorite, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, address) DO UPDATE SET
           label = EXCLUDED.label,
           chain = COALESCE(EXCLUDED.chain, address_book.chain),
           favorite = EXCLUDED.favorite,
           notes = EXCLUDED.notes,
           updated_at = NOW()
         RETURNING id, address, label, chain, favorite, notes, created_at, updated_at`,
        [req.user.id, storedAddress, label, chain, Boolean(favorite), notes || null],
      );
      res.status(201).json({ contact: rows[0] });
    } catch (err: any) {
      console.error("POST /address-book error:", err.message);
      res.status(500).json({ error: "Failed to save contact" });
    }
  });

  // PATCH /address-book/:id — rename / favorite / notes.
  router.patch("/address-book/:id", requireAuth, async (req: any, res: Response) => {
    try {
      const { label, favorite, notes } = req.body || {};
      const set: string[] = [];
      const vals: any[] = [];
      let i = 1;
      if (typeof label === "string") {
        if (label.trim().length === 0 || label.length > 100) {
          return res.status(400).json({ error: "label 1-100 chars" });
        }
        set.push(`label = $${i++}`); vals.push(label.trim());
      }
      if (typeof favorite === "boolean") {
        set.push(`favorite = $${i++}`); vals.push(favorite);
      }
      if (typeof notes === "string" || notes === null) {
        set.push(`notes = $${i++}`); vals.push(notes);
      }
      if (set.length === 0) return res.status(400).json({ error: "Nothing to update" });
      vals.push(req.user.id, req.params.id);
      const result = await db.query(
        `UPDATE address_book SET ${set.join(", ")} WHERE user_id = $${i++} AND id = $${i} RETURNING *`,
        vals,
      );
      if (result.rowCount === 0) return res.status(404).json({ error: "Contact not found" });
      res.json({ contact: result.rows[0] });
    } catch (err: any) {
      console.error("PATCH /address-book/:id error:", err.message);
      res.status(500).json({ error: "Failed to update contact" });
    }
  });

  // DELETE /address-book/:id
  router.delete("/address-book/:id", requireAuth, async (req: any, res: Response) => {
    try {
      const result = await db.query(
        `DELETE FROM address_book WHERE user_id = $1 AND id = $2 RETURNING id`,
        [req.user.id, req.params.id],
      );
      if (result.rowCount === 0) return res.status(404).json({ error: "Contact not found" });
      res.json({ ok: true });
    } catch (err: any) {
      console.error("DELETE /address-book/:id error:", err.message);
      res.status(500).json({ error: "Failed to delete contact" });
    }
  });

  // GET /address-book/recent
  //   Distinct destinations the user has sent to, aggregated from the
  //   withdrawals table. For each destination returns { address, count,
  //   lastUsedAt }. Ordered by most-recent-use. Used by SendModal's
  //   "Last Used" tab in place of demo data.
  router.get("/address-book/recent", requireAuth, async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
      const { rows } = await db.query(
        `SELECT destination_address AS address,
                COUNT(*)::int AS count,
                MAX(created_at) AS last_used_at
         FROM withdrawals
         WHERE user_id = $1
           AND destination_address IS NOT NULL
           AND destination_address <> ''
         GROUP BY destination_address
         ORDER BY last_used_at DESC
         LIMIT $2`,
        [userId, limit]
      );
      res.json({
        destinations: rows.map((r: any) => ({
          address: r.address,
          count: r.count,
          lastUsedAt: r.last_used_at,
        })),
      });
    } catch (err: any) {
      console.error("GET /address-book/recent error:", err.message);
      res.status(500).json({ error: "Failed to fetch recent destinations" });
    }
  });

  // GET /ens/resolve?name=foo.eth
  //   Resolves an ENS name to a 0x address using the existing Ethereum
  //   mainnet RPC (no new deps). Returns { address: "0x…" } or 404 if
  //   unresolved. Caches forward to browser for 5 min to avoid
  //   re-resolving on every keystroke.
  router.get("/ens/resolve", requireAuth, async (req: any, res: Response) => {
    const name = typeof req.query.name === "string" ? req.query.name.trim().toLowerCase() : "";
    if (!name || !name.endsWith(".eth") || name.length < 5) {
      return res.status(400).json({ error: "Invalid ENS name" });
    }
    try {
      // Use mainnet provider — ENS only resolves on L1. We already have
      // RPC_URL_ETHEREUM in config for bridge + swap ops.
      const rpcUrl = CONFIG.RPC_URL_ETHEREUM || process.env.RPC_URL_ETHEREUM || process.env.RPC_URL_MAINNET;
      if (!rpcUrl) {
        return res.status(503).json({ error: "ENS resolver not configured" });
      }
      const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
      const address = await provider.resolveName(name);
      if (!address) {
        return res.status(404).json({ error: "ENS name does not resolve" });
      }
      res.setHeader("Cache-Control", "private, max-age=300");
      res.json({ name, address });
    } catch (err: any) {
      console.warn("[ens/resolve]", name, err?.message);
      res.status(502).json({ error: "ENS resolver unreachable" });
    }
  });


  // ─── Withdrawals ───────────────────────────────────────────
  router.get("/withdrawals", requireAuth, async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const { rows } = await db.query(
        `SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [userId, limit]
      );
      res.json({ withdrawals: rows.map((r: any) => ({
        id: r.id, destinationAddress: r.destination_address, amount: parseFloat(r.amount),
        token: r.token, chain: r.chain, status: r.status, txHash: r.tx_hash,
        createdAt: r.created_at, completedAt: r.completed_at,
      }))});
    } catch (err: any) {
      console.error("[GET /withdrawals]", err.message);
      res.status(500).json({ error: "Failed to fetch withdrawals" });
    }
  });

  router.post("/withdrawals", requireAuth, async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const { destinationAddress, amount, token, cardId, scheduledAt } = req.body || {};
      const isScheduled = scheduledAt && new Date(scheduledAt).getTime() > Date.now() + 60_000;
      if (!destinationAddress || !/^0x[a-fA-F0-9]{40}$/.test(destinationAddress)) {
        return res.status(400).json({ error: "Valid EVM address required (0x + 40 hex chars)" });
      }
      if (!amount || typeof amount !== "number" || amount <= 0 || amount > 1000000) {
        return res.status(400).json({ error: "amount must be positive (max 1,000,000)" });
      }
      const tk = token || "USDC";
      if (!["USDC","USDT","DAI"].includes(tk)) {
        return res.status(400).json({ error: "token must be USDC, USDT, or DAI" });
      }
      // ── RATE LIMIT: 1 withdrawal per user per 5 minutes ──
      const lastWithdraw = await db.query(
        `SELECT created_at FROM withdrawals WHERE user_id = $1 AND status != 'cancelled' ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );
      if (lastWithdraw.rows.length > 0) {
        const lastTime = new Date(lastWithdraw.rows[0].created_at).getTime();
        const cooldownMs = 5 * 60 * 1000;
        if (Date.now() - lastTime < cooldownMs) {
          const waitSec = Math.ceil((cooldownMs - (Date.now() - lastTime)) / 1000);
          return res.status(429).json({ error: `Too many withdrawals. Try again in ${waitSec} seconds.` });
        }
      }

      let resolvedCardId = cardId;
      if (!resolvedCardId) {
        // S33 Tier 1 #10: cards has no `status` column — schema only has
        // is_active + is_locked. Original query "WHERE status != 'deleted'"
        // would throw at runtime. Same semantic intent: pick the most
        // recent ACTIVE card.
        const cardRes = await db.query(`SELECT id FROM cards WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1`, [userId]);
        if (cardRes.rows.length === 0) return res.status(400).json({ error: "No active card found" });
        resolvedCardId = cardRes.rows[0].id;
      } else {
        const check = await db.query(`SELECT id FROM cards WHERE id = $1 AND user_id = $2`, [resolvedCardId, userId]);
        if (check.rows.length === 0) return res.status(404).json({ error: "Card not found" });
      }

      // ── ATOMIC BALANCE CHECK + WITHDRAWAL INSERT ──
      // ⚠️ S32 SECURITY FIX — balance is now sourced from the Issuer (SD3)
      // BEFORE the FOR UPDATE lock. Previously we trusted cards.balance which
      // could be spoofed via PATCH /cards/:id (now closed) but still: balance
      // belongs to the Execution Layer (Issuer), not the Intent Layer (DB).
      // Sync first; if Issuer is unreachable, refuse the withdrawal rather
      // than fall back to a potentially-stale local cache. Better to reject
      // a withdrawal than to leak treasury USDC on a sync glitch.
      const userIssuerRes = await db.query(
        'SELECT sd3_user_id, issuer_user_id FROM users WHERE id = $1',
        [userId],
      );
      const issuerUserId = userIssuerRes.rows[0]?.sd3_user_id || userIssuerRes.rows[0]?.issuer_user_id;
      if (!issuerUserId) {
        return res.status(403).json({ error: 'Card not provisioned with Issuer (KYC required)' });
      }
      const oldBalRes = await db.query(`SELECT balance FROM cards WHERE id = $1`, [resolvedCardId]);
      const oldBalance = parseFloat(oldBalRes.rows[0]?.balance || '0');
      let issuerAuthoritativeBalance: number | null = null;
      try {
        const outcome = await syncCardBalanceFromIssuer(db, resolvedCardId, issuerUserId, oldBalance, 'withdrawal-gate');
        issuerAuthoritativeBalance = outcome.newBalance;
      } catch (err: any) {
        console.error(`[POST /withdrawals] issuer balance sync failed for card ${resolvedCardId}: ${err?.message?.slice(0, 200)}`);
        return res.status(503).json({ error: 'Could not verify card balance with Issuer. Try again shortly.' });
      }
      if (issuerAuthoritativeBalance == null) {
        return res.status(503).json({ error: 'Issuer balance unavailable. Try again shortly.' });
      }
      if (issuerAuthoritativeBalance < amount) {
        return res.status(400).json({ error: `Insufficient balance. Available: $${issuerAuthoritativeBalance.toFixed(2)}` });
      }

      // S33 Tier 1 #4: HELM-105 value cap on user-initiated withdrawal.
      // Off-chain twin to execution-dispatch's per-tx cap; this is where
      // the user authorizes value movement, so the alarm fires here too.
      // Observe-only by default; enforce-mode throw propagates to outer
      // catch → 500 (user retries with smaller amount).
      await enforceTxCap({
        source: 'user-withdrawal',
        txKind: 'transfer',
        valueUsd: amount,
        chainId: 8453,
        toAddress: destinationAddress,
        agentId: userId,
      });

      const client = await db.connect();
      let rows: any[];
      try {
        await client.query('BEGIN');
        // Re-read locally inside the lock as a final concurrency guard.
        // If a sibling request raced ahead and debited via Issuer, the
        // cached balance just refreshed by syncCardBalanceFromIssuer
        // reflects the post-debit state.
        const balRes = await client.query(
          `SELECT balance FROM cards WHERE id = $1 FOR UPDATE`,
          [resolvedCardId]
        );
        const balance = parseFloat(balRes.rows[0]?.balance || "0");
        if (balance < amount) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Insufficient balance after concurrent debit. Available: $${balance.toFixed(2)}` });
        }
        // Insert withdrawal intent inside the same transaction
        const initialStatus = isScheduled ? 'scheduled' : 'pending';
        const insertRes = await client.query(
          `INSERT INTO withdrawals (user_id, card_id, destination_address, amount, token, status, scheduled_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [userId, resolvedCardId, destinationAddress, amount, tk, initialStatus, scheduledAt || null]
        );
        rows = insertRes.rows;
        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
      const w = rows[0];
      const withdrawalId = w.id;

      // If scheduled, defer execution to sweepScheduledIntents
      if (isScheduled) {
        await db.query(
          `INSERT INTO notifications (user_id, type, title, message)
           VALUES ($1, 'transaction', 'Withdrawal Scheduled', $2)`,
          [userId, `$${amount.toFixed(2)} ${tk} to ${destinationAddress.slice(0,6)}...${destinationAddress.slice(-4)} scheduled for ${new Date(scheduledAt).toLocaleString()}`]
        ).catch(() => {});
        return res.status(201).json({
          id: withdrawalId, destinationAddress: w.destination_address, amount: parseFloat(w.amount),
          token: w.token, chain: 'Base', status: 'scheduled', scheduledAt,
          message: 'Withdrawal scheduled — will execute automatically at the scheduled time.',
        });
      }

      // ── EXECUTION LAYER: Send USDC on Base from deployer wallet to user ──
      // Intent is recorded above. Now execute the on-chain transfer.
      // If execution fails, withdrawal stays 'pending' for manual retry.
      let txHash: string | null = null;
      let executionStatus = 'pending';
      let executionError: string | null = null;

      try {
        const baseProvider = new ethers.providers.JsonRpcProvider(CONFIG.BASE_RPC_URL);
        const deployerWallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, baseProvider);
        const usdcContract = new ethers.Contract(
          CONFIG.USDC_BASE,
          ["function transfer(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"],
          deployerWallet
        );

        // Verify deployer has enough USDC on Base
        const deployerBalance = await usdcContract.balanceOf(deployerWallet.address);
        const withdrawAmount = ethers.utils.parseUnits(amount.toString(), 6);

        if (deployerBalance.lt(withdrawAmount)) {
          executionError = `Insufficient treasury balance. Have: ${ethers.utils.formatUnits(deployerBalance, 6)} USDC, need: ${amount}`;
          console.error(`[withdrawal] ${executionError}`);
          await db.query(`UPDATE withdrawals SET status = 'failed' WHERE id = $1`, [withdrawalId]);
          await db.query(
            `INSERT INTO execution_log (entity_type, entity_id, user_id, action, status, detail, error_message, created_at)
             VALUES ('withdrawal', $1, $2, 'transfer', 'failed', $3, $4, now())`,
            [withdrawalId, userId, `Withdrawal $${amount} ${tk} to ${destinationAddress.slice(0,8)}...`, executionError]
          ).catch(() => {});
          return res.status(402).json({ error: executionError });
        }

        // Execute the USDC transfer with dynamic gas estimation
        console.log(`[withdrawal] Sending $${amount} ${tk} to ${destinationAddress} on Base...`);
        const estimatedGas = await usdcContract.estimateGas.transfer(destinationAddress, withdrawAmount);
        const gasLimit = estimatedGas.mul(130).div(100); // +30% buffer for safety
        const tx = await usdcContract.transfer(destinationAddress, withdrawAmount, { gasLimit });
        const receipt = await tx.wait();
        txHash = receipt.transactionHash;
        executionStatus = 'confirmed';

        // Update withdrawal record with tx hash and status
        await db.query(
          `UPDATE withdrawals SET status = 'confirmed', tx_hash = $1, completed_at = now() WHERE id = $2`,
          [txHash, withdrawalId]
        );

        // Log successful execution
        await db.query(
          `INSERT INTO execution_log (entity_type, entity_id, user_id, action, status, detail, created_at)
           VALUES ('withdrawal', $1, $2, 'transfer', 'success', $3, now())`,
          [withdrawalId, userId, `Sent $${amount} ${tk} to ${destinationAddress} — tx: ${txHash}`]
        ).catch(() => {});

        console.log(`[withdrawal] Confirmed: ${txHash}`);
      } catch (execErr: any) {
        // Sanitize error — never leak RPC URLs, private keys, or internal contract details to user
        const rawError = execErr?.message || 'Unknown error';
        console.error(`[withdrawal] Execution failed: ${rawError.slice(0, 200)}`);
        if (rawError.includes('insufficient funds')) executionError = 'Insufficient gas for transaction';
        else if (rawError.includes('reverted')) executionError = 'Transaction reverted by contract';
        else if (rawError.includes('nonce')) executionError = 'Transaction nonce conflict — retry shortly';
        else if (rawError.includes('timeout')) executionError = 'Transaction timed out — check status later';
        else executionError = 'Transaction failed — contact support';
        await db.query(`UPDATE withdrawals SET status = 'failed' WHERE id = $1`, [withdrawalId]);
        await db.query(
          `INSERT INTO execution_log (entity_type, entity_id, user_id, action, status, detail, error_message, created_at)
           VALUES ('withdrawal', $1, $2, 'transfer', 'failed', $3, $4, now())`,
          [withdrawalId, userId, `Withdrawal $${amount} ${tk} to ${destinationAddress.slice(0,8)}...`, executionError]
        ).catch(() => {});
      }

      // Notify user regardless of execution result
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)`,
        [userId, "transaction",
          executionStatus === 'confirmed' ? "Withdrawal Complete" : "Withdrawal Failed",
          executionStatus === 'confirmed'
            ? `$${amount} ${tk} sent to ${destinationAddress.slice(0,6)}...${destinationAddress.slice(-4)}`
            : `$${amount} ${tk} withdrawal failed: ${executionError?.slice(0, 80)}`
        ]
      );

      res.status(201).json({
        id: withdrawalId, destinationAddress: w.destination_address, amount: parseFloat(w.amount),
        token: w.token, chain: 'Base', status: executionStatus, txHash,
        createdAt: w.created_at, error: executionError,
      });
    } catch (err: any) {
      console.error("[POST /withdrawals]", err.message);
      res.status(500).json({ error: "Failed to create withdrawal" });
    }
  });
  // DELETE /withdrawals/:id — Cancel a pending withdrawal before execution
  router.delete("/withdrawals/:id", requireAuth, async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const { id: withdrawalId } = req.params;

      // Verify withdrawal belongs to user
      const wRes = await db.query(
        `SELECT id, status, amount, token, destination_address FROM withdrawals WHERE id = $1 AND user_id = $2`,
        [withdrawalId, userId]
      );
      if (wRes.rows.length === 0) {
        return res.status(404).json({ error: "Withdrawal not found" });
      }

      const w = wRes.rows[0];
      if (w.status !== 'pending') {
        return res.status(400).json({
          error: `Cannot cancel — withdrawal is already ${w.status}. ${w.status === 'confirmed' ? 'Funds have been sent on-chain.' : ''}`
        });
      }

      // Cancel the withdrawal
      await db.query(
        `UPDATE withdrawals SET status = 'cancelled', completed_at = now() WHERE id = $1`,
        [withdrawalId]
      );

      // Notify user
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)`,
        [userId, "transaction", "Withdrawal Cancelled",
          `$${parseFloat(w.amount).toFixed(2)} ${w.token} withdrawal to ${w.destination_address.slice(0,6)}...${w.destination_address.slice(-4)} was cancelled`]
      );

      // Log cancellation
      await db.query(
        `INSERT INTO execution_log (entity_type, entity_id, user_id, action, status, detail, created_at)
         VALUES ('withdrawal', $1, $2, 'cancel', 'success', $3, now())`,
        [withdrawalId, userId, `Cancelled $${parseFloat(w.amount).toFixed(2)} ${w.token} withdrawal`]
      ).catch(() => {});

      console.log(`[withdrawal] Cancelled: ${withdrawalId} ($${parseFloat(w.amount).toFixed(2)} ${w.token})`);
      res.json({ id: withdrawalId, status: 'cancelled' });
    } catch (err: any) {
      console.error("[DELETE /withdrawals]", err.message);
      res.status(500).json({ error: "Failed to cancel withdrawal" });
    }
  });

  // ─── Buy 1: Card balance → Crypto wallet (Session 28, Phase 8a) ──────────────
  //
  // Debits user's SD3 card balance + transfers USDC from Nuro Fee Vault
  // (deployer wallet on Base) to the user's wallet on the destination chain.
  //
  // Flag-gated by CONFIG.BUY_1_ENABLED — returns 503 until Owen confirms SD3
  // card-debit API is live + Nuro seeds sufficient Fee Vault liquidity.
  //
  // Non-atomic sequence, order matters (see commit e530f51 design note):
  //   1. Validate input + user state + flag + Fee Vault reserve
  //   2. Acquire pg_advisory lock on user_id (prevents double-debit via retry)
  //   3. SD3 debit card (FIRST — failure here = user loses nothing)
  //   4. On-chain USDC transfer from Fee Vault → user's wallet
  //      • destChain=8453 (Base): direct usdc.transfer()
  //      • else: cctpBurnAndMint(Base → destChain)
  //   5. Write transactions row status='confirmed' on success
  //
  // Mid-flight failure recovery:
  //   • SD3 debit succeeded + on-chain transfer failed → transactions.status =
  //     'debited_pending_transfer'. Operator reconciliation either retries
  //     transfer OR calls issuers.creditCard() to refund the card.
  //
  router.post("/buy-from-card", requireAuth, async (req: any, res: Response) => {
    // 0. Flag gate — fail fast before any DB work
    if (!CONFIG.BUY_1_ENABLED) {
      return res.status(503).json({
        error: 'Buy 1 not yet enabled',
        reason: 'Awaiting SD3 card-debit API confirmation from partner.',
      });
    }

    try {
      const userId = req.user.id;
      const { amount, destChainId, destAddress } = req.body || {};

      // 1. Input validation
      const amountNum = Number(amount);
      if (!Number.isFinite(amountNum) || amountNum <= 0 || amountNum > 10_000) {
        return res.status(400).json({ error: 'amount must be 0.01–10000 (USD)' });
      }
      const destChain = Number(destChainId);
      const SUPPORTED_BUY_1_CHAINS = [1, 8453, 42161, 137, 10]; // Eth, Base, Arb, Poly, Opt
      if (!SUPPORTED_BUY_1_CHAINS.includes(destChain)) {
        return res.status(400).json({
          error: `destChainId must be one of: ${SUPPORTED_BUY_1_CHAINS.join(', ')}`,
        });
      }
      if (!destAddress || !/^0x[a-fA-F0-9]{40}$/.test(destAddress)) {
        return res.status(400).json({ error: 'destAddress must be a valid 0x EVM address' });
      }

      // 2. User + card state
      const userResult = await db.query(
        `SELECT u.id, u.issuer_user_id, c.id AS card_id, c.issuer_card_id, c.balance, c.is_active, c.is_locked
         FROM users u LEFT JOIN cards c ON c.user_id = u.id
         WHERE u.id = $1 AND c.is_active = true AND c.is_locked = false
         ORDER BY c.created_at DESC LIMIT 1`,
        [userId]
      );
      if (userResult.rows.length === 0) {
        return res.status(400).json({ error: 'No active card found. Complete KYC first.' });
      }
      const { issuer_user_id, card_id, issuer_card_id, balance } = userResult.rows[0];
      if (!issuer_user_id || !issuer_card_id) {
        return res.status(400).json({ error: 'Card not fully provisioned on issuer side.' });
      }
      // ⚠️ S32 SECURITY FIX — read balance from Issuer (SD3), not local DB.
      // Same fix class as POST /withdrawals: local cards.balance is a cache,
      // not authoritative. Refuse the spend rather than fall back to a
      // possibly-stale cache if Issuer is unreachable.
      const cachedBalanceUsd = parseFloat(balance) || 0;
      let cardBalanceUsd: number;
      try {
        const outcome = await syncCardBalanceFromIssuer(db, card_id, issuer_user_id, cachedBalanceUsd, 'buy-from-card');
        if (outcome.newBalance == null) {
          return res.status(503).json({ error: 'Issuer balance unavailable. Try again shortly.' });
        }
        cardBalanceUsd = outcome.newBalance;
      } catch (err: any) {
        console.error(`[POST /buy-from-card] issuer balance sync failed for card ${card_id}: ${err?.message?.slice(0, 200)}`);
        return res.status(503).json({ error: 'Could not verify card balance with Issuer. Try again shortly.' });
      }
      if (amountNum > cardBalanceUsd) {
        return res.status(400).json({
          error: `Insufficient card balance. Have $${cardBalanceUsd.toFixed(2)}, requested $${amountNum.toFixed(2)}.`,
        });
      }

      // S33 Tier 1 #4: HELM-105 value cap on buy-from-card. The Issuer
      // debit + on-chain transfer happen further down; the cap fires
      // before either so a value-blown call never starts the SD3 debit.
      // chainId is the user's destination (where the USDC lands).
      await enforceTxCap({
        source: 'user-buy-from-card',
        txKind: 'transfer',
        valueUsd: amountNum,
        chainId: destChain,
        toAddress: destAddress,
        agentId: userId,
      });

      // 3. Fee Vault reserve check (Base USDC deployer balance)
      const baseProvider = new ethers.providers.JsonRpcProvider(CONFIG.BASE_RPC_URL);
      const deployerWallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, baseProvider);
      const usdcBase = new ethers.Contract(
        CONFIG.USDC_BASE,
        ['function balanceOf(address) view returns (uint256)', 'function transfer(address to, uint256 amt) returns (bool)'],
        deployerWallet
      );
      const vaultBalRaw = await usdcBase.balanceOf(deployerWallet.address);
      const vaultBalUsd = Number(ethers.utils.formatUnits(vaultBalRaw, 6));
      if (vaultBalUsd < amountNum + CONFIG.FEE_VAULT_MIN_RESERVE_USD) {
        console.error(`[buy-from-card] Fee Vault exhausted: $${vaultBalUsd.toFixed(2)} available, $${amountNum.toFixed(2)} requested + $${CONFIG.FEE_VAULT_MIN_RESERVE_USD} reserve floor`);
        await reportError('execution', 'buy1_fee_vault_exhausted', userId,
          `Fee Vault insufficient: bal=$${vaultBalUsd.toFixed(2)} needed=$${amountNum.toFixed(2)}`, new Error('fee_vault_exhausted'));
        return res.status(503).json({
          error: 'Temporarily unavailable — insufficient Fee Vault reserves. Try again shortly.',
        });
      }

      // 4. Advisory lock on (user_id) — prevents concurrent Buy 1 calls
      // double-debiting while the first call is mid-flight. Key:
      // hashtext('buy_from_card:' || userId).
      const lockClient = await db.connect();
      let acquired = false;
      try {
        const lockRes = await lockClient.query(
          `SELECT pg_try_advisory_xact_lock(hashtext($1))`,
          [`buy_from_card:${userId}`]
        );
        acquired = Boolean(lockRes.rows[0]?.pg_try_advisory_xact_lock);
      } catch { /* fall through — acquired stays false */ }
      if (!acquired) {
        lockClient.release();
        return res.status(429).json({
          error: 'Another Buy 1 request is in flight for this user. Retry in a few seconds.',
        });
      }

      // Pre-record the transaction intent so mid-flight failures are observable
      const txId = randomUUID();
      const amountCents = Math.round(amountNum * 100);
      const idempotencyKey = `buy1:${txId}`;
      await lockClient.query(
        `INSERT INTO transactions (id, user_id, source_chain, dest_chain, token, amount, status, transaction_type, created_at, timestamp)
         VALUES ($1, $2, 8453, $3, 'USDC', $4, 'pending', 'card_buyback', now(), $5)`,
        [txId, userId, destChain, amountNum, Date.now()]
      );

      // 5. SD3 debit — the reversible step. If this throws, user loses nothing.
      let debitTxId: string | undefined;
      try {
        const debit = await debitCard(issuer_card_id, amountCents, idempotencyKey);
        debitTxId = debit.transactionId;
        console.log(`[buy-from-card] SD3 debit ok — user=${userId} card=${issuer_card_id} amount=$${amountNum.toFixed(2)} sd3_tx=${debitTxId}`);
      } catch (err: any) {
        lockClient.release();
        const status = err?.response?.status;
        await lockClient.query(
          `UPDATE transactions SET status = 'failed' WHERE id = $1`,
          [txId]
        ).catch(() => {});
        console.error(`[buy-from-card] SD3 debit FAILED — user=${userId} status=${status} msg=${err.message?.slice(0,100)}`);
        if (status === 404) {
          return res.status(503).json({
            error: 'SD3 card-debit endpoint not yet available. Partner confirmation pending.',
          });
        }
        if (status === 402) {
          return res.status(400).json({ error: 'Insufficient card balance (SD3 rejected).' });
        }
        return res.status(502).json({ error: 'Card debit failed', detail: err.message?.slice(0, 100) });
      }

      // 6. On-chain transfer — from Fee Vault (deployer) to user's wallet
      let onChainTxHash: string | undefined;
      try {
        const amountWei = ethers.utils.parseUnits(amountNum.toFixed(6), 6);
        if (destChain === 8453) {
          // Base: direct transfer
          const tx = await usdcBase.transfer(destAddress, amountWei);
          const receipt = await tx.wait();
          if (receipt.status !== 1) throw new Error('Base USDC transfer reverted');
          onChainTxHash = tx.hash;
        } else {
          // Other chain: CCTP burn+mint Base → destChain
          onChainTxHash = await cctpBurnAndMint(
            CONFIG.PRIVATE_KEY,
            CONFIG.BASE_RPC_URL,
            8453,
            CONFIG.USDC_BASE,
            amountWei,
            destAddress,
            6,
            destChain
          );
        }
        console.log(`[buy-from-card] On-chain transfer ok — tx=${onChainTxHash} chain=${destChain}`);
      } catch (err: any) {
        // 7a. Mid-flight failure — SD3 debited but on-chain failed.
        // Mark the row distinctly for manual reconciliation.
        await lockClient.query(
          `UPDATE transactions SET status = 'debited_pending_transfer', tx_hash = $1 WHERE id = $2`,
          [`sd3:${debitTxId}`, txId]
        ).catch(() => {});
        await reportError('execution', 'buy1_mid_flight_transfer_failed', userId,
          `SD3 debit $${amountNum.toFixed(2)} succeeded (sd3_tx=${debitTxId}) but on-chain transfer failed to chain ${destChain}. MANUAL RECONCILIATION REQUIRED: either retry transfer OR creditCard to refund. tx_id=${txId}`,
          err
        );
        lockClient.release();
        return res.status(502).json({
          error: 'Card debited but on-chain transfer failed. Operations team notified for reconciliation.',
          reconciliation_id: txId,
        });
      }

      // 7b. Happy path — commit the transaction row
      await lockClient.query(
        `UPDATE transactions SET status = 'confirmed', tx_hash = $1, confirmed_at = now() WHERE id = $2`,
        [onChainTxHash, txId]
      );
      lockClient.release();

      await db.query(
        `INSERT INTO execution_log (id, entity_type, entity_id, action, status, tx_hash, detail, created_at)
         VALUES (gen_random_uuid(), 'buy1', $1, 'card_to_wallet', 'success', $2, $3, now())`,
        [txId, onChainTxHash, `user=${userId} card=${issuer_card_id} amount=$${amountNum.toFixed(2)} dest_chain=${destChain} dest=${destAddress} sd3_tx=${debitTxId}`]
      ).catch(() => {});

      res.json({
        txId,
        amount: amountNum,
        destChainId: destChain,
        destAddress,
        status: 'confirmed',
        onChainTxHash,
        sd3TransactionId: debitTxId,
      });

    } catch (err: any) {
      console.error('[POST /buy-from-card]', err.message?.slice(0, 200));
      res.status(500).json({ error: 'Buy 1 failed', detail: err.message?.slice(0, 100) });
    }
  });

  // ─── Buy 2 — Bank direct → Crypto Wallet (Session 28 Phase 8 scaffold) ──
  // Two-step flow, both flag-gated by BUY_2_ENABLED:
  //
  //   POST /buy-from-bank/link-token       — mints short-lived Plaid link_token
  //   POST /buy-from-bank/link-complete    — exchange public_token → processor_token →
  //                                          Dwolla customer + funding source
  //
  // The actual transfer initiation (POST /buy-from-bank) ships separately
  // once we're satisfied with the link flow end-to-end. See Decision Journal
  // 2026-04-21_001 for split rationale.

  router.post("/buy-from-bank/link-token", requireAuth, async (req: any, res: Response) => {
    if (!CONFIG.BUY_2_ENABLED) {
      return res.status(503).json({
        error: 'Buy 2 not yet enabled',
        reason: 'Awaiting Plaid + Dwolla sandbox validation and production approval.',
      });
    }
    try {
      const userId = req.user.id;
      const { createLinkToken } = await import('./plaid-client');
      const userRow = await db.query(`SELECT email FROM users WHERE id = $1 LIMIT 1`, [userId]);
      const email = userRow.rows[0]?.email;
      const result = await createLinkToken({ userId, userEmail: email });
      res.json({ link_token: result.link_token, expiration: result.expiration });
    } catch (err: any) {
      console.error('[POST /buy-from-bank/link-token]', err.message?.slice(0, 200));
      res.status(502).json({ error: 'Plaid link-token failed', detail: err.message?.slice(0, 100) });
    }
  });

  router.post("/buy-from-bank/link-complete", requireAuth, async (req: any, res: Response) => {
    if (!CONFIG.BUY_2_ENABLED) {
      return res.status(503).json({
        error: 'Buy 2 not yet enabled',
        reason: 'Awaiting Plaid + Dwolla sandbox validation and production approval.',
      });
    }
    try {
      const userId = req.user.id;
      const { publicToken, accountId } = req.body || {};
      if (!publicToken || typeof publicToken !== 'string') {
        return res.status(400).json({ error: 'publicToken required' });
      }
      if (!accountId || typeof accountId !== 'string') {
        return res.status(400).json({ error: 'accountId required' });
      }

      const { exchangePublicToken, createProcessorToken } = await import('./plaid-client');
      const { createCustomer, createFundingSource } = await import('./dwolla-client');

      // 1. Exchange public_token → access_token (Plaid)
      const exchange = await exchangePublicToken(publicToken);

      // 2. Mint processor_token for Dwolla (one-time use)
      const proc = await createProcessorToken(exchange.access_token, accountId, 'dwolla');

      // 3. Ensure Dwolla customer exists (create or reuse)
      const userRow = await db.query(
        `SELECT email, first_name, last_name, dwolla_customer_url FROM users WHERE id = $1 LIMIT 1`,
        [userId]
      );
      const user = userRow.rows[0];
      if (!user) return res.status(404).json({ error: 'User not found' });

      let dwollaCustomerUrl: string | null = user.dwolla_customer_url || null;
      if (!dwollaCustomerUrl) {
        dwollaCustomerUrl = await createCustomer({
          firstName: user.first_name || 'Nuro',
          lastName: user.last_name || 'User',
          email: user.email,
        });
        await db.query(
          `UPDATE users SET dwolla_customer_url = $1 WHERE id = $2`,
          [dwollaCustomerUrl, userId]
        ).catch((e: any) => console.warn('[link-complete] dwolla_customer_url persist failed:', e.message));
      }

      // 4. Create funding source from processor_token
      const fundingSourceUrl = await createFundingSource(dwollaCustomerUrl, proc.processor_token, 'Linked Bank');

      // 5. Persist access_token + funding source (encrypted column preferred; TODO)
      await db.query(
        `UPDATE users SET plaid_access_token = $1, plaid_item_id = $2, dwolla_funding_source_url = $3 WHERE id = $4`,
        [exchange.access_token, exchange.item_id, fundingSourceUrl, userId]
      ).catch((e: any) => console.warn('[link-complete] plaid/funding persist failed:', e.message));

      res.json({
        itemId: exchange.item_id,
        fundingSourceUrl,
      });
    } catch (err: any) {
      console.error('[POST /buy-from-bank/link-complete]', err.message?.slice(0, 200));
      res.status(502).json({ error: 'Link completion failed', detail: err.message?.slice(0, 100) });
    }
  });

  // ─── Transfers ─────────────────────────────────────────────
  router.get("/transfers", requireAuth, async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;
      const status = req.query.status as string;
      let query = `SELECT * FROM transfers WHERE sender_user_id = $1`;
      const params: any[] = [userId];
      if (status && ["pending","completed","failed","cancelled"].includes(status)) {
        query += ` AND status = $${params.length + 1}`;
        params.push(status);
      }
      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);
      const { rows } = await db.query(query, params);
      const transfers = rows.map((r: any) => ({
        id: r.id,
        recipientName: r.recipient_name,
        recipientAccount: r.recipient_account,
        amount: parseFloat(r.amount),
        currency: r.currency,
        description: r.description,
        status: r.status,
        scheduledAt: r.scheduled_at,
        createdAt: r.created_at,
        completedAt: r.completed_at,
      }));
      res.json({ transfers, total: transfers.length });
    } catch (err: any) {
      console.error("[GET /transfers]", err.message);
      res.status(500).json({ error: "Failed to fetch transfers" });
    }
  });

  // ─── POST /transfers — Universal P2P Transfer System ─────────────────────────
  //
  // Three destination tiers:
  //   1. "wallet" (default) — sender vault → recipient vault on Base (instant P2P)
  //   2. "card"  — sender vault → recipient's Issuer deposit address → Visa card credited
  //   3. "agent" — sender vault → recipient's agent wallet (fund their bot)
  //
  // Recipient resolved by: email (finds user in DB) or wallet address (external)
  // Intent always recorded. Execution attempted immediately, retried by dispatch if pending.
  //
  router.post("/transfers", requireAuth, async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const {
        recipientEmail, recipientAddress, recipientName, recipientAccount,
        amount, currency, description, cardId, scheduledAt,
        destination = 'wallet',  // 'wallet' | 'card' | 'agent'
      } = req.body || {};

      // ── RATE LIMIT: 1 transfer per user per 2 minutes ──
      const lastTransfer = await db.query(
        `SELECT created_at FROM transfers WHERE sender_user_id = $1 AND status != 'cancelled' ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );
      if (lastTransfer.rows.length > 0) {
        const lastTime = new Date(lastTransfer.rows[0].created_at).getTime();
        const cooldownMs = 2 * 60 * 1000;
        if (Date.now() - lastTime < cooldownMs) {
          const waitSec = Math.ceil((cooldownMs - (Date.now() - lastTime)) / 1000);
          return res.status(429).json({ error: `Too many transfers. Try again in ${waitSec} seconds.` });
        }
      }

      // Validate
      if (!amount || typeof amount !== "number" || amount <= 0 || amount > 1000000) {
        return res.status(400).json({ error: "amount must be a positive number (max 1,000,000)" });
      }
      if (!['wallet', 'card', 'agent'].includes(destination)) {
        return res.status(400).json({ error: "destination must be 'wallet', 'card', or 'agent'" });
      }
      const cur = currency || "USD";

      // S33 Tier 1 #4: HELM-105 cap on user-initiated transfer. Fires
      // BEFORE recipient resolution so a value-blown attempt never even
      // gets address-derivation work done. Base chainId since transfers
      // settle in our Base USDC vault for all 3 destination tiers.
      await enforceTxCap({
        source: 'user-transfer',
        txKind: 'transfer',
        valueUsd: amount,
        chainId: 8453,
        agentId: userId,
      });

      // S33 Tier 1 #13: scan transfer description for prompt-injection.
      // description gets stored in the transfers row + may surface to
      // recipients in their notification UI — poisoning surface.
      if (description && typeof description === 'string') {
        try {
          const { scanAndEmit } = await import('./helm/ingress-scanner')
          await scanAndEmit({
            text: description,
            source: 'user-transfer-description',
            agentId: userId,
          })
        } catch (err: any) {
          if (err?.action === 'block' || err?.action === 'quarantine') {
            return res.status(422).json({ error: 'rejected_by_ingress_scanner', detail: err?.message?.slice(0, 200), ruleId: err?.ruleId })
          }
        }
      }

      // ── Resolve recipient ──────────────────────────────────────────────────
      let recipientUserId: string | null = null
      let targetAddress: string | null = null
      let resolvedRecipientName = recipientName || ''
      let resolvedRecipientAccount = recipientAccount || ''
      let transferType = 'p2p'
      let recipientIssuerUserId: string | null = null

      if (recipientEmail) {
        // P2P: find recipient user by email
        const recipientUser = await db.query(
          'SELECT id, name, email, sd3_user_id, issuer_user_id FROM users WHERE email = $1',
          [recipientEmail.trim().toLowerCase()]
        )
        if (!recipientUser.rows.length) {
          return res.status(404).json({ error: `No user found with email: ${recipientEmail}` })
        }
        const ru = recipientUser.rows[0]
        recipientUserId = ru.id
        resolvedRecipientName = ru.name || recipientEmail
        resolvedRecipientAccount = recipientEmail.trim()
        recipientIssuerUserId = ru.sd3_user_id || ru.issuer_user_id

        // Resolve target address based on destination
        if (destination === 'wallet') {
          // Vault-to-vault on Base
          const recipientSeed = ethers.utils.id(process.env.PRIVATE_KEY! + 'vault_' + recipientUserId)
          targetAddress = ethers.utils.HDNode.fromSeed(recipientSeed).address
          transferType = 'p2p'
        } else if (destination === 'card') {
          // Send to friend's VISA card via Issuer deposit address
          if (!recipientIssuerUserId) {
            return res.status(400).json({
              error: `${resolvedRecipientName} doesn't have a card set up yet. They need to complete KYC first.`
            })
          }
          // Get recipient's Issuer Base deposit address — USDC sent here credits their Visa
          try {
            const { getUserBaseDepositAddress } = require('./issuers')
            targetAddress = await getUserBaseDepositAddress(recipientIssuerUserId)
          } catch (issuerErr: any) {
            return res.status(400).json({
              error: `Could not resolve ${resolvedRecipientName}'s card deposit address: ${issuerErr.message?.slice(0, 60)}`
            })
          }
          transferType = 'card_load'
        } else if (destination === 'agent') {
          // Fund recipient's agent wallet
          const agentSeed = ethers.utils.id(process.env.PRIVATE_KEY! + 'agent_' + recipientUserId)
          targetAddress = ethers.utils.HDNode.fromSeed(agentSeed).address
          transferType = 'agent_fund'
        }
      } else if (recipientAddress) {
        // External wallet transfer
        if (!ethers.utils.isAddress(recipientAddress)) {
          return res.status(400).json({ error: "Invalid wallet address" })
        }
        targetAddress = recipientAddress
        resolvedRecipientName = recipientName || 'External Wallet'
        resolvedRecipientAccount = recipientAddress
        transferType = 'withdraw'
      } else {
        if (!recipientName) return res.status(400).json({ error: "recipientEmail, recipientAddress, or recipientName is required" })
        resolvedRecipientName = recipientName.trim()
        resolvedRecipientAccount = (recipientAccount || '').trim()
      }

      // Can't send to yourself
      if (recipientUserId === userId) {
        return res.status(400).json({ error: "Cannot transfer to yourself" })
      }

      // ── Determine initial status based on scheduling ──────────────────────
      const isScheduled = scheduledAt && new Date(scheduledAt).getTime() > Date.now() + 60_000  // >1min in future
      const initialStatus = isScheduled ? 'scheduled' : 'pending'

      // ── Record intent ──────────────────────────────────────────────────────
      const { rows } = await db.query(
        `INSERT INTO transfers (sender_user_id, sender_card_id, recipient_user_id, recipient_name, recipient_email,
           recipient_account, amount, currency, description, transfer_type, scheduled_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [userId, cardId || null, recipientUserId, resolvedRecipientName, recipientEmail || null,
         resolvedRecipientAccount, amount, cur, description?.trim() || null, transferType, scheduledAt || null, initialStatus]
      );
      const transfer = rows[0]

      // If scheduled, skip execution — sweepScheduledIntents will fire when due
      if (isScheduled) {
        await db.query(
          `INSERT INTO notifications (user_id, type, title, message)
           VALUES ($1, 'transaction', 'Transfer Scheduled', $2)`,
          [userId, `$${amount.toFixed(2)} ${cur} to ${resolvedRecipientName} scheduled for ${new Date(scheduledAt).toLocaleString()}`]
        ).catch(() => {})
        return res.status(201).json({
          ...transfer,
          status: 'scheduled',
          scheduledAt,
          message: 'Transfer scheduled — will execute automatically at the scheduled time.',
        })
      }

      // ── Attempt on-chain execution ─────────────────────────────────────────
      let executionStatus = 'pending'
      let executionTxHash: string | null = null
      let executionDetail = ''

      if (targetAddress) {
        try {
          // Derive sender vault on Base
          const senderSeed = ethers.utils.id(process.env.PRIVATE_KEY! + 'vault_' + userId)
          const senderHd = ethers.utils.HDNode.fromSeed(senderSeed)

          const baseProvider = new ethers.providers.JsonRpcProvider(CONFIG.BASE_RPC_URL || '')
          const usdc = new ethers.Contract(
            CONFIG.USDC_BASE,
            ['function balanceOf(address) view returns (uint256)', 'function transfer(address to, uint256 amount) returns (bool)'],
            new ethers.Wallet(senderHd.privateKey, baseProvider)
          )
          const rawBalance = await usdc.balanceOf(senderHd.address)
          const vaultBalance = parseFloat(ethers.utils.formatUnits(rawBalance, 6))

          if (vaultBalance >= amount) {
            const amountWei = ethers.utils.parseUnits(amount.toFixed(6), 6)
            const tx = await usdc.transfer(targetAddress, amountWei)
            const receipt = await tx.wait()

            if (receipt.status === 1) {
              executionStatus = 'completed'
              executionTxHash = tx.hash
              executionDetail = destination === 'card'
                ? `$${amount.toFixed(2)} sent to ${resolvedRecipientName}'s Visa card via Issuer — TX: ${tx.hash.slice(0,10)}...`
                : `$${amount.toFixed(2)} sent to ${resolvedRecipientName}'s ${destination} — TX: ${tx.hash.slice(0,10)}...`
              await db.query(
                `UPDATE transfers SET status = 'completed', execution_tx_hash = $1, completed_at = now() WHERE id = $2`,
                [tx.hash, transfer.id]
              )
            } else {
              executionStatus = 'failed'
              executionTxHash = tx.hash
              executionDetail = 'Transaction reverted on Base'
              await db.query(
                `UPDATE transfers SET status = 'failed', execution_tx_hash = $1 WHERE id = $2`,
                [tx.hash, transfer.id]
              )
            }
          } else {
            executionStatus = 'pending'
            executionDetail = `Vault has $${vaultBalance.toFixed(2)}, needs $${amount.toFixed(2)}`
          }

          // Log to execution_log
          await db.query(
            `INSERT INTO execution_log (id, entity_type, entity_id, action, status, tx_hash, detail, error_message, created_at)
             VALUES (gen_random_uuid(), 'transfer', $1, $2, $3, $4, $5, $6, now())`,
            [transfer.id, `p2p_${destination}`,
             executionStatus === 'completed' ? 'success' : executionStatus === 'failed' ? 'failed' : 'skipped',
             executionTxHash, executionDetail,
             executionStatus === 'pending' ? executionDetail : null]
          ).catch(() => {})

        } catch (execErr: any) {
          executionDetail = execErr.message?.slice(0, 200) || 'Execution failed'
          await db.query(
            `INSERT INTO execution_log (id, entity_type, entity_id, action, status, detail, error_message, created_at)
             VALUES (gen_random_uuid(), 'transfer', $1, $2, 'failed', $3, $4, now())`,
            [transfer.id, `p2p_${destination}`, `P2P ${destination} transfer failed`, executionDetail]
          ).catch(() => {})
        }
      }

      // ── Notifications ──────────────────────────────────────────────────────
      const destLabel = destination === 'card' ? 'Visa card' : destination === 'agent' ? 'agent wallet' : 'vault'
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)`,
        [userId, "transaction",
         destination === 'card' ? "Card Transfer Sent" : "Transfer Sent",
         `$${amount.toFixed(2)} ${cur} to ${resolvedRecipientName}'s ${destLabel}${executionStatus === 'completed' ? ' ✓' : ' — Pending'}`]
      ).catch(() => {})

      if (recipientUserId) {
        const senderRes = await db.query('SELECT name, email FROM users WHERE id = $1', [userId])
        const senderName = senderRes.rows[0]?.name || senderRes.rows[0]?.email || 'Someone'
        await db.query(
          `INSERT INTO notifications (user_id, type, title, message) VALUES ($1, $2, $3, $4)`,
          [recipientUserId, "transaction",
           destination === 'card' ? "Card Payment Received" : "Transfer Received",
           `$${amount.toFixed(2)} ${cur} from ${senderName} → your ${destLabel}${executionStatus === 'completed' ? ' ✓' : ' — Pending'}`]
        ).catch(() => {})
      }

      // ── Response ───────────────────────────────────────────────────────────
      res.status(201).json({
        id: transfer.id,
        recipientName: resolvedRecipientName,
        recipientEmail: recipientEmail || null,
        recipientAccount: resolvedRecipientAccount,
        amount: parseFloat(transfer.amount),
        currency: transfer.currency,
        description: transfer.description,
        status: executionStatus,
        transferType,
        destination,
        executionTxHash,
        executionDetail: executionDetail || null,
        createdAt: transfer.created_at,
      });
    } catch (err: any) {
      console.error("[POST /transfers]", err.message);
      res.status(500).json({ error: "Failed to create transfer" });
    }
  });

  // ── DELETE /transfers/:id — cancel a SCHEDULED transfer before execution ──
  // Sprint 2.6 finisher. Only works for status='scheduled' rows owned by the caller;
  // executed/pending/completed transfers are immutable (money already moved).
  router.delete("/transfers/:id", requireAuth, async (req: any, res: Response) => {
    const userId = req.user.id;
    const transferId = req.params.id;
    try {
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const row = await client.query(
          `SELECT id, status, sender_user_id, amount, currency, recipient_account
           FROM transfers WHERE id = $1 FOR UPDATE`,
          [transferId]
        );
        if (!row.rows.length) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: "Transfer not found" });
        }
        const t = row.rows[0];
        if (t.sender_user_id !== userId) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: "Not your transfer" });
        }
        if (t.status !== 'scheduled') {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: "Cannot cancel",
            reason: `Status is '${t.status}'. Only scheduled transfers can be cancelled.`,
          });
        }
        await client.query(
          `UPDATE transfers SET status = 'cancelled', completed_at = now() WHERE id = $1`,
          [transferId]
        );
        await client.query(
          `INSERT INTO notifications (user_id, type, title, message)
           VALUES ($1, 'transaction', 'Scheduled Transfer Cancelled',
                   'Your scheduled transfer of $' || $2 || ' ' || $3 || ' was cancelled.')`,
          [userId, parseFloat(t.amount).toFixed(2), t.currency || 'USD']
        ).catch(() => {});
        await client.query('COMMIT');
        res.json({ cancelled: true, transferId });
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error("[DELETE /transfers/:id]", err.message);
      res.status(500).json({ error: "Cancellation failed" });
    }
  });

  // ─── Wallets (address book) ───
  router.get("/wallets", requireAuth, async (req: any, res: any) => {
    try {
      const userId = req.user.id;
      const result = await db.query(
        "SELECT id, name, address, network, symbol, type, created_at FROM wallets WHERE user_id = $1 ORDER BY created_at DESC",
        [userId]
      );
      res.json(result.rows);
    } catch (err: any) {
      console.error("[wallets] GET error:", err.message);
      res.status(500).json({ error: "Failed to fetch wallets" });
    }
  });

  router.post("/wallets", requireAuth, async (req: any, res: any) => {
    try {
      const userId = req.user.id;
      const { name, address, network, symbol, type } = req.body;
      if (!name || !address) return res.status(400).json({ error: "Name and address are required" });
      const net = network || (address.startsWith("0x") ? "Ethereum Mainnet" : "Solana");
      const sym = symbol || (address.startsWith("0x") ? "ETH" : "SOL");
      const typ = type || (address.startsWith("0x") ? "ethereum" : "solana");
      const result = await db.query(
        "INSERT INTO wallets (user_id, name, address, network, symbol, type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, address, network, symbol, type, created_at",
        [userId, name, address, net, sym, typ]
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      console.error("[wallets] POST error:", err.message);
      res.status(500).json({ error: "Failed to add wallet" });
    }
  });

  router.patch("/wallets/:id", requireAuth, async (req: any, res: any) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: "Name is required" });
      const result = await db.query(
        "UPDATE wallets SET name = $1, updated_at = now() WHERE id = $2 AND user_id = $3 RETURNING id, name, address, network, symbol, type",
        [name, id, userId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Wallet not found" });
      res.json(result.rows[0]);
    } catch (err: any) {
      console.error("[wallets] PATCH error:", err.message);
      res.status(500).json({ error: "Failed to update wallet" });
    }
  });

  router.delete("/wallets/:id", requireAuth, async (req: any, res: any) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const result = await db.query(
        "DELETE FROM wallets WHERE id = $1 AND user_id = $2 RETURNING id",
        [id, userId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: "Wallet not found" });
      res.json({ success: true });
    } catch (err: any) {
      console.error("[wallets] DELETE error:", err.message);
      res.status(500).json({ error: "Failed to delete wallet" });
    }
  });


  // ─── Stripe Checkout & Portal ───────────────────────────────

  router.post('/stripe/create-checkout-session', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const { planId } = req.body;
      if (!planId) return res.status(400).json({ error: 'planId is required' });

      const stripe = new (Stripe as any)(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2025-03-31.basil' as any });

      const planRes = await db.query('SELECT * FROM plans WHERE id = $1', [planId]);
      const plan = planRes.rows[0];
      if (!plan) return res.status(404).json({ error: 'Plan not found' });
      if (!plan.stripe_price_id) return res.status(400).json({ error: 'Plan has no Stripe price configured' });

      const userRes = await db.query('SELECT email, stripe_customer_id FROM users WHERE id = $1', [userId]);
      const user = userRes.rows[0];
      let customerId = user.stripe_customer_id;

      if (!customerId) {
        const customer = await stripe.customers.create({ email: user.email, metadata: { user_id: userId } });
        customerId = customer.id;
        await db.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, userId]);
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
        success_url: 'https://app.nurofinance.com/dashboard/settings?tab=billing&success=true',
        cancel_url: 'https://app.nurofinance.com/dashboard/settings?tab=billing&cancelled=true',
        metadata: { user_id: userId, plan_id: String(planId) },
      });

      res.json({ url: session.url });
    } catch (err: any) {
      console.error('Stripe checkout error:', err.message);
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  });

  router.post('/stripe/create-portal-session', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const stripe = new (Stripe as any)(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2025-03-31.basil' as any });

      const userRes = await db.query('SELECT stripe_customer_id FROM users WHERE id = $1', [userId]);
      const customerId = userRes.rows[0]?.stripe_customer_id;
      if (!customerId) return res.status(400).json({ error: 'No Stripe customer found. Subscribe to a plan first.' });

      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: 'https://app.nurofinance.com/dashboard/settings?tab=billing',
      });

      res.json({ url: session.url });
    } catch (err: any) {
      console.error('Stripe portal error:', err.message);
      res.status(500).json({ error: 'Failed to create portal session' });
    }
  });

  router.post('/stripe/seed-prices', requireAuth, async (req, res) => {
    try {
      const stripe = new (Stripe as any)(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2025-03-31.basil' as any });

      const productMap: Record<string, string> = {
        'Pro': process.env.STRIPE_PRO_PRODUCT_ID || '',
        'Enterprise': process.env.STRIPE_ENTERPRISE_PRODUCT_ID || '',
      };

      const results: any[] = [];
      for (const [planName, productId] of Object.entries(productMap)) {
        if (!productId) continue;
        const planRes = await db.query('SELECT id, price FROM plans WHERE name = $1', [planName]);
        const plan = planRes.rows[0];
        if (!plan) continue;

        const prices = await stripe.prices.list({ product: productId, active: true, limit: 1 });
        let priceId: string;
        if (prices.data.length > 0) {
          priceId = prices.data[0].id;
        } else {
          const price = await stripe.prices.create({
            product: productId,
            unit_amount: Math.round(plan.price * 100),
            currency: 'usd',
            recurring: { interval: 'month' },
          });
          priceId = price.id;
        }
        await db.query('UPDATE plans SET stripe_price_id = $1 WHERE id = $2', [priceId, plan.id]);
        results.push({ plan: planName, priceId });
      }

      res.json({ seeded: results });
    } catch (err: any) {
      console.error('Stripe seed-prices error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── Analytics Aggregation Endpoints ────────────────────────────────────────

  // GET /analytics/revenue?timeframe=monthly|daily|weekly|yearly
  router.get('/analytics/revenue', requireAuth, async (req, res) => {
    const userId = (req as any).user.id;
    const timeframe = (req.query.timeframe as string) || 'monthly';
    try {
      let sql: string, params: any[];
      if (timeframe === 'daily') {
        // Last 24 hours, grouped by hour
        sql = `SELECT EXTRACT(HOUR FROM date) AS period,
               COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS revenue,
               COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS expenses
               FROM card_transactions WHERE user_id = $1 AND date >= NOW() - INTERVAL '24 hours'
               GROUP BY period ORDER BY period`;
        params = [userId];
      } else if (timeframe === 'weekly') {
        // Last 7 days
        sql = `SELECT TO_CHAR(date, 'Dy') AS period, EXTRACT(DOW FROM date) AS dow,
               COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS revenue,
               COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS expenses
               FROM card_transactions WHERE user_id = $1 AND date >= NOW() - INTERVAL '7 days'
               GROUP BY period, dow ORDER BY dow`;
        params = [userId];
      } else if (timeframe === 'yearly') {
        // Last 5 years
        sql = `SELECT EXTRACT(YEAR FROM date)::TEXT AS period,
               COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS revenue,
               COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS expenses
               FROM card_transactions WHERE user_id = $1 AND date >= NOW() - INTERVAL '5 years'
               GROUP BY period ORDER BY period`;
        params = [userId];
      } else {
        // Monthly (last 12 months)
        sql = `SELECT TO_CHAR(date, 'Mon') AS period, EXTRACT(MONTH FROM date) AS mon,
               COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS revenue,
               COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS expenses
               FROM card_transactions WHERE user_id = $1 AND date >= NOW() - INTERVAL '12 months'
               GROUP BY period, mon ORDER BY mon`;
        params = [userId];
      }
      const result = await db.query(sql, params);
      const data = result.rows.map((r: any) => ({
        period: String(r.period).trim(),
        revenue: parseFloat(r.revenue) || 0,
        expenses: parseFloat(r.expenses) || 0,
      }));
      res.json(data);
    } catch (err: any) {
      console.error('[analytics/revenue]', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /analytics/statistics — spending trend (last 7 data points)
  router.get('/analytics/statistics', requireAuth, async (req, res) => {
    const userId = (req as any).user.id;
    try {
      const result = await db.query(
        `SELECT DATE(date) AS day, COALESCE(SUM(ABS(amount)), 0) AS value
         FROM card_transactions WHERE user_id = $1 AND date >= NOW() - INTERVAL '7 days'
         GROUP BY day ORDER BY day`, [userId]
      );
      const data = result.rows.map((r: any) => ({
        date: new Date(r.day).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
        value: parseFloat(r.value) || 0,
      }));
      res.json(data);
    } catch (err: any) {
      console.error('[analytics/statistics]', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /analytics/categories — spending by category (current month)
  router.get('/analytics/categories', requireAuth, async (req, res) => {
    const userId = (req as any).user.id;
    try {
      const result = await db.query(
        `SELECT category, COALESCE(SUM(ABS(amount)), 0) AS total
         FROM card_transactions WHERE user_id = $1 AND date >= DATE_TRUNC('month', NOW())
         GROUP BY category ORDER BY total DESC`, [userId]
      );
      const rows = result.rows;
      const grandTotal = rows.reduce((s: number, r: any) => s + parseFloat(r.total), 0);
      const colors = ['var(--color-primary)', 'var(--color-primary-light)', '#066274', '#0077b6', '#082830', '#6B7280', '#F59E0B', '#EF4444'];
      const data = rows.map((r: any, i: number) => ({
        name: r.category || 'other',
        value: grandTotal > 0 ? Math.round((parseFloat(r.total) / grandTotal) * 100) : 0,
        color: colors[i % colors.length],
      }));
      res.json({ categories: data, total: Math.round(grandTotal * 100) / 100 });
    } catch (err: any) {
      console.error('[analytics/categories]', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /analytics/weekly — weekly activity breakdown (last 7 days)
  router.get('/analytics/weekly', requireAuth, async (req, res) => {
    const userId = (req as any).user.id;
    try {
      const result = await db.query(
        `SELECT TO_CHAR(date, 'Day') AS day_name, EXTRACT(DOW FROM date) AS dow,
         COUNT(*)::INT AS transactions, COALESCE(SUM(ABS(amount)), 0) AS amount
         FROM card_transactions WHERE user_id = $1 AND date >= NOW() - INTERVAL '7 days'
         GROUP BY day_name, dow ORDER BY dow`, [userId]
      );
      const dayMap: Record<number, { day: string; dayShort: string }> = {
        0: { day: 'sunday', dayShort: 'sun' },
        1: { day: 'monday', dayShort: 'mon' },
        2: { day: 'tuesday', dayShort: 'tue' },
        3: { day: 'wednesday', dayShort: 'wed' },
        4: { day: 'thursday', dayShort: 'thu' },
        5: { day: 'friday', dayShort: 'fri' },
        6: { day: 'saturday', dayShort: 'sat' },
      };
      const data = result.rows.map((r: any) => ({
        day: dayMap[r.dow]?.day || 'unknown',
        dayShort: dayMap[r.dow]?.dayShort || '???',
        transactions: r.transactions,
        amount: parseFloat(r.amount) || 0,
      }));
      res.json(data);
    } catch (err: any) {
      console.error('[analytics/weekly]', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /analytics/stats — summary stats (revenue, expenses, net, savings rate)
  router.get('/analytics/stats', requireAuth, async (req, res) => {
    const userId = (req as any).user.id;
    try {
      const current = await db.query(
        `SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS revenue,
                COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS expenses
         FROM card_transactions WHERE user_id = $1 AND date >= DATE_TRUNC('month', NOW())`, [userId]
      );
      const prev = await db.query(
        `SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS revenue,
                COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS expenses
         FROM card_transactions WHERE user_id = $1
         AND date >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
         AND date < DATE_TRUNC('month', NOW())`, [userId]
      );
      const cur = current.rows[0];
      const prv = prev.rows[0];
      const revenue = parseFloat(cur.revenue);
      const expenses = parseFloat(cur.expenses);
      const net = revenue - expenses;
      const savingsRate = revenue > 0 ? Math.round((net / revenue) * 100) : 0;
      const prevRevenue = parseFloat(prv.revenue);
      const prevExpenses = parseFloat(prv.expenses);
      const revenueChange = prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 1000) / 10 : 0;
      const expensesChange = prevExpenses > 0 ? Math.round(((expenses - prevExpenses) / prevExpenses) * 1000) / 10 : 0;
      res.json({
        revenue: { value: revenue, change: revenueChange },
        expenses: { value: expenses, change: expensesChange },
        net: { value: net, change: revenueChange - expensesChange },
        savingsRate: { value: savingsRate, change: 0 },
      });
    } catch (err: any) {
      console.error('[analytics/stats]', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ── Polymarket Proxy ──────────────────────────────────────────────────────
  router.get('/polymarket/markets', async (req, res) => {
    try {
      const { tag, limit = '4' } = req.query as any
      const params = new URLSearchParams({
        limit, active: 'true', closed: 'false', order: 'volume24hr', ascending: 'false',
      })
      if (tag) params.set('tag', tag)
      const r = await axios.get(`https://gamma-api.polymarket.com/markets?${params}`)
      res.json(r.data)
    } catch (err: any) {
      console.error('[polymarket proxy]', err.message?.slice(0, 80))
      res.status(502).json({ error: 'Polymarket API unavailable' })
    }
  })

  // ── Agents ──────────────────────────────────────────────────────────────────

  function generateAgentWallet(agentId: string): string {
    const seed = ethers.utils.id(process.env.PRIVATE_KEY! + 'agent_' + agentId)
    const hdNode = ethers.utils.HDNode.fromSeed(seed)
    return hdNode.address
  }

  // POST /agents — create a new agent
  // Auto-links to user's primary card. Returns funding instructions.
  router.post('/agents', requireAuth, async (req, res) => {
    const userId = (req as any).user.id
    const { name, type = 'polymarket', riskLimit = 100, cardId, strategy = {} } = req.body || {}
    if (!name) return res.status(400).json({ error: 'name is required' })
    try {
      const id = randomUUID()
      const walletAddress = generateAgentWallet(id)

      // Auto-link to user's primary card if no cardId specified
      let linkedCardId = cardId || null
      if (!linkedCardId) {
        const primaryCard = await db.query(
          'SELECT id FROM cards WHERE user_id = $1 AND is_active = true ORDER BY balance DESC LIMIT 1',
          [userId]
        )
        if (primaryCard.rows.length) linkedCardId = primaryCard.rows[0].id
      }
      // Verify card belongs to user if provided
      if (linkedCardId) {
        const cardCheck = await db.query('SELECT id FROM cards WHERE id = $1 AND user_id = $2', [linkedCardId, userId])
        if (!cardCheck.rows.length) linkedCardId = null
      }

      // Determine recommended funding based on risk level
      const riskLabel = Number(riskLimit) <= 50 ? 'low' : Number(riskLimit) <= 100 ? 'medium' : 'high'
      const recommendedFunding = riskLabel === 'low' ? 50 : riskLabel === 'medium' ? 150 : 300

      await db.query(
        `INSERT INTO agents (id, user_id, name, type, wallet_address, card_id, risk_limit, strategy)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, userId, name, type, walletAddress, linkedCardId, riskLimit, JSON.stringify(strategy)]
      )

      // Create notification about new agent
      await db.query(
        `INSERT INTO notifications (id, user_id, type, title, message, is_read, created_at)
         VALUES (gen_random_uuid(), $1, 'system', $2, $3, false, now())`,
        [userId, `Agent "${name}" deployed`, `Wallet: ${walletAddress.slice(0,6)}...${walletAddress.slice(-4)}. Fund with $${recommendedFunding}+ USDC on Polygon to activate trading.${linkedCardId ? ' Profits will settle to your linked card.' : ' Link a card in settings to receive profits.'}`]
      )

      const result = await db.query('SELECT * FROM agents WHERE id = $1', [id])
      res.status(201).json({
        ...result.rows[0],
        linkedCard: linkedCardId ? true : false,
        fundingRequired: true,
        recommendedFunding,
        fundingAddress: walletAddress,
        fundingChain: 'Polygon',
        fundingToken: 'USDC',
        message: linkedCardId
          ? `Agent deployed! Fund ${walletAddress.slice(0,6)}...${walletAddress.slice(-4)} with $${recommendedFunding}+ USDC on Polygon. Profits auto-settle to your card.`
          : `Agent deployed but no card linked. Complete KYC and add a card to receive profits.`
      })
    } catch (err: any) {
      console.error('[POST /agents]', err.message)
      res.status(500).json({ error: 'Failed to create agent' })
    }
  })

  // GET /agents — list user's agents
  router.get('/agents', requireAuth, async (req, res) => {
    const userId = (req as any).user.id
    try {
      const result = await db.query(
        `SELECT a.*,
          (SELECT COUNT(*) FROM agent_bets WHERE agent_id = a.id AND status = 'open') as open_bets,
          (SELECT COUNT(*) FROM agent_bets WHERE agent_id = a.id) as total_bets
         FROM agents a WHERE a.user_id = $1 ORDER BY a.created_at DESC`,
        [userId]
      )
      res.json(result.rows)
    } catch (err: any) {
      console.error('[GET /agents]', err.message)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // GET /agents/:id — agent detail with REAL wallet balance
  router.get('/agents/:id', requireAuth, async (req, res) => {
    const userId = (req as any).user.id
    const id = String(req.params.id)
    try {
      const result = await db.query('SELECT * FROM agents WHERE id = $1 AND user_id = $2', [id, userId])
      if (!result.rows.length) return res.status(404).json({ error: 'Agent not found' })
      const agent = result.rows[0]
      // Fetch real on-chain balance
      const walletBalance = await getAgentBalance(id).catch(() => 0)
      res.json({ ...agent, walletBalance, funded: walletBalance > 0.5 })
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // PATCH /agents/:id — update agent
  router.patch('/agents/:id', requireAuth, async (req, res) => {
    const userId = (req as any).user.id
    const { id } = req.params
    const { name, status, riskLimit, strategy, cardId } = req.body || {}
    try {
      const check = await db.query('SELECT id FROM agents WHERE id = $1 AND user_id = $2', [id, userId])
      if (!check.rows.length) return res.status(404).json({ error: 'Agent not found' })
      const updates: string[] = []; const values: any[] = []; let idx = 1
      if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name) }
      if (status !== undefined) { updates.push(`status = $${idx++}`); values.push(status) }
      if (riskLimit !== undefined) { updates.push(`risk_limit = $${idx++}`); values.push(riskLimit) }
      if (strategy !== undefined) { updates.push(`strategy = $${idx++}`); values.push(JSON.stringify(strategy)) }
      if (cardId !== undefined) { updates.push(`card_id = $${idx++}`); values.push(cardId) }
      if (!updates.length) return res.status(400).json({ error: 'No fields to update' })
      updates.push(`updated_at = now()`)
      values.push(id)
      await db.query(`UPDATE agents SET ${updates.join(', ')} WHERE id = $${idx}`, values)
      const result = await db.query('SELECT * FROM agents WHERE id = $1', [id])
      res.json(result.rows[0])
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // DELETE /agents/:id — remove an agent and its bets
  router.delete('/agents/:id', requireAuth, async (req, res) => {
    const userId = (req as any).user.id
    const { id } = req.params
    try {
      const check = await db.query('SELECT id, name FROM agents WHERE id = $1 AND user_id = $2', [id, userId])
      if (!check.rows.length) return res.status(404).json({ error: 'Agent not found' })
      await db.query('DELETE FROM agent_bets WHERE agent_id = $1', [id])
      await db.query('DELETE FROM agents WHERE id = $1', [id])
      res.json({ deleted: true, name: check.rows[0].name })
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to delete agent' })
    }
  })

  // POST /agents/:id/fund — enqueue a funding intent (Base vault → Polygon agent wallet).
  // Sprint 2.3. Records intent only; sweepAgentFundings performs the CCTP bridge.
  // While CONFIG.AGENT_FUNDING_OBSERVE_ONLY is true, the sweep marks the row
  // 'skipped_observe_only' without moving USDC. Flip to false once Base→Polygon
  // reverse CCTP lands to activate live.
  router.post('/agents/:id/fund', requireAuth, async (req, res) => {
    const userId = (req as any).user.id
    const agentId = String(req.params.id)
    const { amount } = req.body || {}

    const amountNum = Number(amount)
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return res.status(400).json({ error: 'amount must be a positive number (USDC)' })
    }
    if (amountNum > 10_000) {
      return res.status(400).json({ error: 'amount exceeds $10,000 funding cap' })
    }

    const client = await db.connect()
    try {
      // Advisory lock on agent_id for the duration of the txn
      await client.query(`BEGIN`)
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, ['agent_' + agentId])

      const agentRes = await client.query(
        `SELECT id, user_id, status FROM agents WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [agentId, userId]
      )
      if (!agentRes.rows.length) {
        await client.query(`ROLLBACK`)
        return res.status(404).json({ error: 'Agent not found' })
      }
      if (agentRes.rows[0].status === 'archived') {
        await client.query(`ROLLBACK`)
        return res.status(409).json({ error: 'Agent is archived' })
      }

      const fundingRes = await client.query(
        `INSERT INTO agent_fundings (id, agent_id, user_id, amount, status, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'pending', now())
         RETURNING id, created_at`,
        [agentId, userId, amountNum]
      )

      // If agent is 'draft', transition to 'funding' to reflect lifecycle
      if (agentRes.rows[0].status === 'draft') {
        await client.query(`UPDATE agents SET status = 'funding', updated_at = now() WHERE id = $1`, [agentId])
      }

      await client.query(`COMMIT`)

      res.status(201).json({
        id: fundingRes.rows[0].id,
        agentId,
        amount: amountNum,
        status: 'pending',
        createdAt: fundingRes.rows[0].created_at,
        message: 'Funding intent recorded. Execution dispatch will bridge USDC Base→Polygon on the next cycle.',
      })
    } catch (err: any) {
      try { await client.query(`ROLLBACK`) } catch { /* swallow */ }
      console.error('[POST /agents/:id/fund]', err.message?.slice(0, 120))
      res.status(500).json({ error: 'Failed to enqueue funding' })
    } finally {
      client.release()
    }
  })

  // GET /agents/:id/fundings — list funding history for an agent
  router.get('/agents/:id/fundings', requireAuth, async (req, res) => {
    const userId = (req as any).user.id
    const agentId = String(req.params.id)
    try {
      // Ownership check
      const owner = await db.query('SELECT id FROM agents WHERE id = $1 AND user_id = $2', [agentId, userId])
      if (!owner.rows.length) return res.status(404).json({ error: 'Agent not found' })

      const rows = await db.query(
        `SELECT id, amount, status, burn_tx_hash, mint_tx_hash, error_message,
                attempt_count, completed_at, created_at
         FROM agent_fundings WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [agentId]
      )
      res.json(rows.rows)
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch fundings' })
    }
  })

  // GET /agents/:id/sweeps — list profit-sweep history for an agent
  router.get('/agents/:id/sweeps', requireAuth, async (req, res) => {
    const userId = (req as any).user.id
    const agentId = String(req.params.id)
    try {
      const owner = await db.query('SELECT id FROM agents WHERE id = $1 AND user_id = $2', [agentId, userId])
      if (!owner.rows.length) return res.status(404).json({ error: 'Agent not found' })

      const rows = await db.query(
        `SELECT id, amount, status, burn_tx_hash, mint_tx_hash, destination,
                error_message, completed_at, created_at
         FROM agent_profit_sweeps WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [agentId]
      )
      res.json(rows.rows)
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch sweeps' })
    }
  })

  // POST /agents/:id/bets — place a REAL bet on Polymarket
  // Attempts real CLOB trade first, falls back with clear instructions if it fails
  router.post('/agents/:id/bets', requireAuth, async (req, res) => {
    const userId = (req as any).user.id
    const agentId = String(req.params.id)
    const { marketId, tokenId, marketQuestion, outcome, amount, entryPrice } = req.body || {}
    if (!marketId || !outcome || !amount) return res.status(400).json({ error: 'marketId, outcome, amount required' })
    try {
      const agent = await db.query('SELECT * FROM agents WHERE id = $1 AND user_id = $2', [agentId, userId])
      if (!agent.rows.length) return res.status(404).json({ error: 'Agent not found' })
      const a = agent.rows[0]
      if (a.status !== 'active') return res.status(403).json({ error: 'Agent is not active' })
      if (Number(amount) > Number(a.risk_limit)) return res.status(402).json({ error: 'Exceeds risk limit', limit: Number(a.risk_limit) })

      // S34 Marathon 9 / A3: HELM-105 tx-cap on agent-initiated bet placement.
      // Closes two pre-S34 gaps in one move:
      //   1. Per-agent attribution — heimdall_events get tagged with the
      //      agent's UUID (not the user's). The Detail panel's Security
      //      tab now shows these as "direct agent attribution" rather
      //      than the "account-level" fallback.
      //   2. Missing platform-level cap on agent-driven bets — pre-S34
      //      only the per-agent `risk_limit` column above gated this
      //      path. Helm's HELM-105 alarm now fires symmetrically
      //      with the /markets/:id/bet user-initiated site.
      // Polymarket settles on Polygon (chainId 137); fromAddress is the
      // agent's Polygon vault, toAddress carries the CTF tokenId for
      // forensic linkage when available.
      await enforceTxCap({
        source: 'agent-bet-intent',
        txKind: 'transfer',
        valueUsd: Number(amount),
        chainId: 137,
        fromAddress: a.wallet_address,
        toAddress: tokenId || 'polymarket-ctf',
        agentId,
      });

      // Check real wallet balance first
      const walletBalance = await getAgentBalance(agentId)

      // Attempt REAL Polymarket trade
      let tradeResult = null
      let tradeStatus = 'queued' // Default: queued (not executed)
      if (tokenId && walletBalance >= Number(amount)) {
        tradeResult = await placePolymarketTrade(
          agentId,
          tokenId,
          outcome === 'Yes' ? 'BUY' : 'BUY', // Both Yes and No are BUY on their respective tokens
          Number(entryPrice) || 0.5,
          Number(amount),
        )
        if (tradeResult.success) {
          tradeStatus = 'open' // Real trade placed
        }
      }

      const betId = randomUUID()
      await db.query(
        `INSERT INTO agent_bets (id, agent_id, user_id, market_id, market_question, outcome, amount, entry_price, status, tx_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [betId, agentId, userId, marketId, marketQuestion || '', outcome, amount, entryPrice || 0, tradeStatus, tradeResult?.txHash || null]
      )

      // Only update invested if trade was real
      if (tradeStatus === 'open') {
        await db.query('UPDATE agents SET total_invested = total_invested + $1, updated_at = now() WHERE id = $2', [amount, agentId])
      }

      const result = await db.query('SELECT * FROM agent_bets WHERE id = $1', [betId])
      const response: any = { ...result.rows[0], walletBalance }

      // Add fallback message if trade wasn't executed
      if (tradeStatus === 'queued') {
        response.tradeExecuted = false
        if (walletBalance < Number(amount)) {
          response.fallback = `Insufficient funds: wallet has $${walletBalance.toFixed(2)}, need $${Number(amount).toFixed(2)}. Fund agent wallet ${a.wallet_address} with USDC on Polygon.`
        } else if (tradeResult?.fallbackMessage) {
          response.fallback = tradeResult.fallbackMessage
        } else if (!tokenId) {
          response.fallback = 'Token ID required for live execution. Market data may be incomplete.'
        } else {
          response.fallback = 'Trade queued but not executed. Check agent wallet funding on Polygon.'
        }
      } else {
        response.tradeExecuted = true
        response.orderId = tradeResult?.orderId
      }

      res.status(201).json(response)
    } catch (err: any) {
      console.error('[POST /agents/:id/bets]', err.message)
      res.status(500).json({ error: 'Failed to place bet' })
    }
  })

  // GET /agents/:id/bets — bet history
  router.get('/agents/:id/bets', requireAuth, async (req, res) => {
    const userId = (req as any).user.id
    const agentId = req.params.id
    try {
      const check = await db.query('SELECT id FROM agents WHERE id = $1 AND user_id = $2', [agentId, userId])
      if (!check.rows.length) return res.status(404).json({ error: 'Agent not found' })
      const result = await db.query(
        'SELECT * FROM agent_bets WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 50',
        [agentId]
      )
      res.json(result.rows)
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // GET /agents/:id/details — bundled snapshot for the user-facing Agent
  // Detail panel (S34 Tier A — Agent Control Plane).
  //
  // Returns budget + reputation + recent counsel + heimdall events + ledger
  // entries + recent bets + recent fundings, all in one round-trip. Mirrors
  // the admin Mythos POV but with agent-ownership auth (user can only see
  // their own agents) instead of admin-key auth.
  //
  // Empty arrays are expected for newly-deployed user agents — the
  // budget/reputation/counsel infrastructure was originally built for
  // system agents (Mythos, Huginn) and only populates for user agents
  // when those features wire through. The FE shows graceful empty
  // states rather than gating on data presence.
  //
  // Helm events filter is dual-keyed: events tagged with this agent's
  // UUID (server-side agent attribution) AND events tagged with the user's
  // ID (user-initiated bets/withdrawals that don't currently propagate
  // agent_id). Future work will thread agent_id through bet placement so
  // the dual-key falls away.
  router.get('/agents/:id/details', requireAuth, async (req: any, res: any) => {
    const userId = (req as any).user.id
    const id = String(req.params.id)
    try {
      // Ownership check — fetch full agent row in one go.
      const agentResult = await db.query(
        'SELECT * FROM agents WHERE id = $1 AND user_id = $2',
        [id, userId],
      )
      if (!agentResult.rows.length) {
        return res.status(404).json({ error: 'Agent not found' })
      }
      const agent = agentResult.rows[0]

      // Run every panel query in parallel. Each query is wrapped in
      // .catch(() => ({ rows: [] })) so a missing table or transient
      // failure produces a graceful empty list rather than a 500.
      const noRows = { rows: [] as any[] }
      const safeQuery = (sql: string, params: any[]) =>
        db.query(sql, params).catch((err: any) => {
          console.warn(
            `[agents/details] sub-query failed (degrading): ${err?.message?.slice(0, 120)}`,
          )
          return noRows
        })

      const [
        walletBalance,
        budgetsRes,
        repHeadRes,
        repHistoryRes,
        counselRes,
        ledgerRes,
        eventsRes,
        betsRes,
        fundingsRes,
        settlementsRes,
      ] = await Promise.all([
        getAgentBalance(id).catch(() => 0),
        safeQuery(
          `SELECT period, usd_authority::text, usd_remaining::text,
                  last_reset_at, note
           FROM agent_budgets
           WHERE agent_id = $1 AND active = true
           ORDER BY period`,
          [id],
        ),
        safeQuery(
          `SELECT predictions_count_total, correct_count_total,
                  score_avg_total::text, score_avg_30d::text,
                  reputation_tier, risk_limit_multiplier::text,
                  last_recomputed_at
           FROM agent_reputation WHERE agent_id = $1`,
          [id],
        ),
        safeQuery(
          `SELECT snapshot_at, score_avg_total::text, reputation_tier,
                  risk_limit_multiplier::text, predictions_count_total
           FROM agent_reputation_history
           WHERE agent_id = $1
           ORDER BY snapshot_at ASC
           LIMIT 60`,
          [id],
        ),
        safeQuery(
          `SELECT id, subject, context, occurred_at
           FROM heimdall_events
           WHERE agent_id = $1
             AND context->>'kind' = 'huginn-counsel'
           ORDER BY occurred_at DESC
           LIMIT 20`,
          [id],
        ),
        safeQuery(
          `SELECT id, action, currency, chain_id, delta::text, description, occurred_at
           FROM agent_budget_ledger
           WHERE agent_id = $1
           ORDER BY occurred_at DESC
           LIMIT 20`,
          [id],
        ),
        // Dual-keyed: agent_id matches THIS agent's UUID OR the owning
        // user's ID. Filters out huginn-counsel kind because those go
        // in the Counsel tab, not the generic Security tab.
        safeQuery(
          `SELECT id, rule_id, severity, action, subject, context, occurred_at, agent_id
           FROM heimdall_events
           WHERE agent_id IN ($1, $2)
             AND COALESCE(context->>'kind', '') <> 'huginn-counsel'
           ORDER BY occurred_at DESC
           LIMIT 30`,
          [id, userId],
        ),
        safeQuery(
          `SELECT id, market_question, outcome, amount::text, entry_price::text,
                  exit_price::text, profit::text, status, created_at
           FROM agent_bets
           WHERE agent_id = $1
           ORDER BY created_at DESC
           LIMIT 20`,
          [id],
        ),
        safeQuery(
          `SELECT id, amount::text, status, tx_hash, created_at
           FROM agent_fundings
           WHERE agent_id = $1
           ORDER BY created_at DESC
           LIMIT 10`,
          [id],
        ),
        safeQuery(
          `SELECT id, amount::text, status, tx_hash, created_at, completed_at
           FROM card_settlements
           WHERE metadata->>'agent_id' = $1
           ORDER BY created_at DESC
           LIMIT 10`,
          [id],
        ),
      ])

      res.json({
        agent: {
          ...agent,
          walletBalance,
          funded: walletBalance > 0.5,
        },
        fetchedAt: new Date().toISOString(),
        budgets: budgetsRes.rows.map((r: any) => ({
          period: r.period,
          usdAuthority: Number(r.usd_authority) || 0,
          usdRemaining: Number(r.usd_remaining) || 0,
          lastResetAt: r.last_reset_at,
          note: r.note,
        })),
        reputation: repHeadRes.rows[0]
          ? {
              predictionsCountTotal: Number(repHeadRes.rows[0].predictions_count_total) || 0,
              correctCountTotal: Number(repHeadRes.rows[0].correct_count_total) || 0,
              scoreAvgTotal: Number(repHeadRes.rows[0].score_avg_total) || 0,
              scoreAvg30d: Number(repHeadRes.rows[0].score_avg_30d) || 0,
              tier: repHeadRes.rows[0].reputation_tier,
              riskLimitMultiplier: Number(repHeadRes.rows[0].risk_limit_multiplier) || 1,
              lastRecomputedAt: repHeadRes.rows[0].last_recomputed_at,
            }
          : null,
        reputationHistory: repHistoryRes.rows.map((r: any) => ({
          snapshotAt: r.snapshot_at,
          scoreAvgTotal: Number(r.score_avg_total) || 0,
          tier: r.reputation_tier,
          multiplier: Number(r.risk_limit_multiplier) || 1,
          predictionsCount: Number(r.predictions_count_total) || 0,
        })),
        recentCounsel: counselRes.rows.map((r: any) => ({
          id: r.id,
          subject: r.subject,
          context: r.context,
          occurredAt: r.occurred_at,
        })),
        recentLedger: ledgerRes.rows.map((r: any) => ({
          id: r.id,
          action: r.action,
          currency: r.currency,
          chainId: r.chain_id,
          delta: Number(r.delta) || 0,
          description: r.description,
          occurredAt: r.occurred_at,
        })),
        recentEvents: eventsRes.rows.map((r: any) => ({
          id: r.id,
          ruleId: r.rule_id,
          severity: r.severity,
          action: r.action,
          subject: r.subject,
          context: r.context,
          occurredAt: r.occurred_at,
          // Whether this event was tagged with the agent's own UUID
          // (true = direct agent attribution) vs the user's ID (false =
          // user-level event affecting the agent).
          isDirectAgentAttribution: r.agent_id === id,
        })),
        recentBets: betsRes.rows.map((r: any) => ({
          id: r.id,
          marketQuestion: r.market_question,
          outcome: r.outcome,
          amount: Number(r.amount) || 0,
          entryPrice: Number(r.entry_price) || 0,
          exitPrice: r.exit_price != null ? Number(r.exit_price) : null,
          profit: r.profit != null ? Number(r.profit) : null,
          status: r.status,
          createdAt: r.created_at,
        })),
        recentFundings: fundingsRes.rows.map((r: any) => ({
          id: r.id,
          amount: Number(r.amount) || 0,
          status: r.status,
          txHash: r.tx_hash,
          createdAt: r.created_at,
        })),
        recentSettlements: settlementsRes.rows.map((r: any) => ({
          id: r.id,
          amount: Number(r.amount) || 0,
          status: r.status,
          txHash: r.tx_hash,
          createdAt: r.created_at,
          completedAt: r.completed_at,
        })),
      })
    } catch (err: any) {
      console.error('[agents/details]', err?.message?.slice(0, 200))
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /agents/:id/settle — queue agent-profit → card settlement (KYC REQUIRED)
  //
  // S33 Tier 1 #5: previously this endpoint ZEROED total_profit and told
  // the user "Profits deposited to card" — but no money moved. The user
  // believed they had collected $X when in fact the agent's profit just
  // disappeared. This was the canonical Intent-vs-Execution conflation
  // (System Rule #1: "Intent Layer records intent. Execution Layer moves
  // real money. Never conflate the two.")
  //
  // Fixed flow:
  //   1. Validate KYC + agent + profit (intent layer — same as before)
  //   2. INSERT a card_settlements row in 'pending' state with the agent's
  //      profit amount + metadata pointing back to the agent. position_id
  //      stays NULL (this isn't a market position).
  //   3. DO NOT decrement total_profit yet — it stays accumulated until
  //      the sweep actually moves money. This is the rollback safety net:
  //      if the bridge fails, the user's profit is still visible.
  //   4. Notification + response are EXPLICIT about pending state — no more
  //      "deposited to card" lie.
  //   5. (FOLLOW-UP) execution-dispatch sweepCardSettlements needs to
  //      learn the agent code path: when metadata.agent_id is set, the
  //      source vault is HD-derived from 'agent_' + agentId on POLYGON
  //      (not user vault on Base), so the sweep must CCTP-bridge agent →
  //      user vault first, THEN proceed with the standard fee+forward.
  //      On success it decrements agents.total_profit by the settled
  //      amount. Tracked as Tier 1 #5b in Pending Tasks.
  router.post('/agents/:id/settle', requireAuth, async (req, res) => {
    const userId = (req as any).user.id
    const agentId = req.params.id
    try {
      // KYC gate — cannot convert crypto profits to fiat card without KYC
      const userCheck = await db.query('SELECT kyc_status FROM users WHERE id = $1', [userId])
      if (!userCheck.rows.length) return res.status(404).json({ error: 'User not found' })
      if (userCheck.rows[0].kyc_status !== 'approved') {
        return res.status(403).json({
          error: 'KYC required to settle profits to card',
          message: 'Complete identity verification before converting crypto gains to fiat. Your profits remain safe in your agent wallet.',
          kycStatus: userCheck.rows[0].kyc_status
        })
      }

      const agent = await db.query('SELECT * FROM agents WHERE id = $1 AND user_id = $2', [agentId, userId])
      if (!agent.rows.length) return res.status(404).json({ error: 'Agent not found' })
      const a = agent.rows[0]
      if (!a.card_id) return res.status(400).json({ error: 'No settlement card linked' })
      const profit = Number(a.total_profit)
      if (profit <= 0) return res.status(400).json({ error: 'No profits to settle', profit })

      // Idempotency guard: refuse if there's already a pending settlement
      // for this agent. Otherwise rapid double-clicks queue duplicates.
      const existingPending = await db.query(
        `SELECT id FROM card_settlements
          WHERE user_id = $1
            AND status = 'pending'
            AND metadata->>'agent_id' = $2
          LIMIT 1`,
        [userId, agentId],
      )
      if (existingPending.rows.length > 0) {
        return res.status(409).json({
          error: 'settlement_pending',
          message: 'A settlement for this agent is already queued. Check back shortly.',
          existingSettlementId: existingPending.rows[0].id,
        })
      }

      // Insert a pending card_settlements row. Sweep cron picks it up.
      // metadata.agent_id is the marker the sweep uses to know this row
      // needs the agent code path (Polygon→Base bridge before fee+forward).
      const settlementRes = await db.query(
        `INSERT INTO card_settlements
            (id, user_id, position_id, amount, destination, status, metadata, created_at)
          VALUES (gen_random_uuid(), $1, NULL, $2, 'card', 'pending', $3, now())
          RETURNING id, created_at`,
        [
          userId,
          profit,
          JSON.stringify({
            agent_id: agentId,
            agent_name: a.name,
            card_id: a.card_id,
            kind: 'agent-settle',
            // Surfacing for the sweep: the source vault on Polygon needs
            // CCTP-bridging to Base before forward can happen. Until that
            // sweep branch lands, this row will be skipped (status stays
            // 'pending' — no money lost, just delayed). Operator runs the
            // bridge manually meanwhile.
            polygon_bridge_required: true,
          }),
        ],
      )
      const settlementId = settlementRes.rows[0].id

      // Audit trail — explicit settlement_intent record before any
      // money attempts to move.
      await db.query(
        `INSERT INTO execution_log
            (entity_type, entity_id, action, status, detail)
          VALUES ($1, $2, $3, $4, $5)`,
        [
          'card_settlement',
          settlementId,
          'agent_settle_intent',
          'pending',
          JSON.stringify({
            agentId,
            userId,
            profit,
            cardId: a.card_id,
            note:
              'Pending Polygon→Base bridge of agent vault, then standard fee+forward sweep.',
          }),
        ],
      ).catch(() => {})

      // Notification — TRUTHFUL about pending state.
      await db.query(
        `INSERT INTO notifications (id, user_id, type, title, message, is_read, created_at)
         VALUES (gen_random_uuid(), $1, 'transaction', $2, $3, false, now())`,
        [
          userId,
          `Settlement queued for "${a.name}"`,
          `$${profit.toFixed(2)} will arrive in your card after the on-chain bridge ` +
            `(typically 5–15 min). You'll get another notification when funds land.`,
        ],
      )

      res.status(202).json({
        settlementId,
        agentId,
        amount: profit,
        status: 'pending',
        message:
          'Settlement queued. Funds will arrive in your card after Polygon→Base ' +
          'bridge + Issuer credit. Total profit not decremented until bridge completes.',
      })
    } catch (err: any) {
      console.error('[POST /agents/:id/settle]', err.message)
      res.status(500).json({ error: 'Settlement failed' })
    }
  })

  // ── Arena Leaderboard ────────────────────────────────────────────────────────

  // GET /arena/leaderboard — all agents ranked by profit (cross-user)
  router.get('/arena/leaderboard', async (req, res) => {
    try {
      const result = await db.query(`
        SELECT a.id, a.name, a.type, a.total_invested, a.total_profit, a.win_count, a.loss_count,
               a.status, a.created_at,
               u.name as user_name,
               (SELECT COUNT(*) FROM agent_bets WHERE agent_id = a.id) as total_bets,
               CASE WHEN a.total_invested > 0
                    THEN ROUND((a.total_profit / a.total_invested * 100)::numeric, 2)
                    ELSE 0 END as roi_percent,
               RANK() OVER (ORDER BY a.total_profit DESC) as rank
        FROM agents a
        JOIN users u ON a.user_id = u.id
        WHERE a.status = 'active'
        ORDER BY a.total_profit DESC
        LIMIT 50
      `)
      res.json(result.rows)
    } catch (err: any) {
      console.error('[GET /arena/leaderboard]', err.message)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // GET /arena/stats — arena-wide statistics
  router.get('/arena/stats', async (req, res) => {
    try {
      const stats = await db.query(`
        SELECT
          COUNT(*) as total_agents,
          COUNT(*) FILTER (WHERE status = 'active') as active_agents,
          COALESCE(SUM(total_invested), 0) as total_invested,
          COALESCE(SUM(total_profit), 0) as total_profit,
          COALESCE(SUM(win_count), 0) as total_wins,
          COALESCE(SUM(loss_count), 0) as total_losses,
          (SELECT COUNT(*) FROM agent_bets WHERE status = 'open') as open_bets,
          (SELECT COUNT(DISTINCT user_id) FROM agents WHERE status = 'active') as active_users
        FROM agents
      `)
      const s = stats.rows[0]

      // Prize pool = 2.5% platform fee on all profits
      const prizePool = Math.max(0, parseFloat(s.total_profit) * 0.025)

      res.json({
        totalAgents: parseInt(s.total_agents),
        activeAgents: parseInt(s.active_agents),
        activeUsers: parseInt(s.active_users),
        totalInvested: parseFloat(s.total_invested),
        totalProfit: parseFloat(s.total_profit),
        totalWins: parseInt(s.total_wins),
        totalLosses: parseInt(s.total_losses),
        openBets: parseInt(s.open_bets),
        prizePool: prizePool.toFixed(2),
      })
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // ── AFI Prediction Markets ───────────────────────────────────────────────────

  // GET /markets — list active prediction markets
  router.get('/markets', async (req, res) => {
    const { category, status = 'active', limit = '20' } = req.query as any
    try {
      let query = `SELECT *,
        CASE WHEN (yes_pool + no_pool) > 0
          THEN ROUND((no_pool / (yes_pool + no_pool) * 100)::numeric, 1)
          ELSE 50 END as yes_price,
        CASE WHEN (yes_pool + no_pool) > 0
          THEN ROUND((yes_pool / (yes_pool + no_pool) * 100)::numeric, 1)
          ELSE 50 END as no_price,
        (SELECT COUNT(*) FROM market_positions WHERE market_id = markets.id) as total_positions
        FROM markets WHERE status = $1`
      const values: any[] = [status]
      let idx = 2
      if (category) { query += ` AND category = $${idx++}`; values.push(category) }
      query += ` ORDER BY total_volume DESC LIMIT $${idx}`
      values.push(parseInt(limit))
      const result = await db.query(query, values)
      res.json(result.rows)
    } catch (err: any) {
      console.error('[GET /markets]', err.message)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // GET /markets/:id — market detail with positions
  router.get('/markets/:id', async (req, res) => {
    try {
      const market = await db.query('SELECT * FROM markets WHERE id = $1', [req.params.id])
      if (!market.rows.length) return res.status(404).json({ error: 'Market not found' })
      const m = market.rows[0]
      const totalPool = parseFloat(m.yes_pool) + parseFloat(m.no_pool)
      res.json({
        ...m,
        yesPrice: totalPool > 0 ? parseFloat(m.no_pool) / totalPool : 0.5,
        noPrice: totalPool > 0 ? parseFloat(m.yes_pool) / totalPool : 0.5,
      })
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // POST /markets — create a new market (Sprint C: requires CREATOR_STAKE_USD USDC stake)
  // Flow: advisory lock per user → derive escrow from pre-generated marketId → pull
  // stake from creator's vault → INSERT market with stake hash. Mirrors Sprint A
  // bet-handler pattern; inconsistency alert if on-chain succeeded but COMMIT failed.
  router.post('/markets', requireAuth, async (req, res) => {
    const userId = (req as any).user.id
    const { question, description, category, resolutionSource, resolutionDate, imageUrl } = req.body || {}
    if (!question) return res.status(400).json({ error: 'question is required' })

    // S33 Tier 1 #13: scan inbound user-authored text. question +
    // description go onto a public market (visible to other agents) and
    // can flow into Mythos's resolution-source verifier — both are
    // poisoning surfaces. Observe-only by default; enforce-mode rejects.
    try {
      const { scanAndEmit } = await import('./helm/ingress-scanner')
      await scanAndEmit({
        text: [question, description ?? ''].join('\n'),
        source: 'create-market',
        agentId: userId,
      })
    } catch (err: any) {
      if (err?.action === 'block' || err?.action === 'quarantine') {
        return res.status(422).json({ error: 'rejected_by_ingress_scanner', detail: err?.message?.slice(0, 200), ruleId: err?.ruleId })
      }
      console.warn('[create-market] ingress scan failed:', err?.message?.slice(0, 100))
    }

    const stakeUsd = Number(CONFIG.CREATOR_STAKE_USD) || 5.0
    let stakeTxHash: string | null = null
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await client.query(`SET LOCAL statement_timeout = '30s'`)
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [userId])

      // Pre-generate marketId so we can derive escrow before any INSERT
      const marketId = randomUUID()
      const vaultSeed = ethers.utils.id(process.env.PRIVATE_KEY! + 'vault_' + userId)
      const vaultHd = ethers.utils.HDNode.fromSeed(vaultSeed)
      const vaultAddress = vaultHd.address

      const escrowSeed = ethers.utils.id(process.env.PRIVATE_KEY! + 'market_' + marketId)
      const escrowHd = ethers.utils.HDNode.fromSeed(escrowSeed)
      const escrowAddress = escrowHd.address

      // Check vault balance on Base
      const baseProvider = new ethers.providers.JsonRpcProvider(CONFIG.BASE_RPC_URL)
      const baseUsdcRead = new ethers.Contract(
        CONFIG.USDC_BASE,
        ['function balanceOf(address) view returns (uint256)'],
        baseProvider
      )
      const vaultBalanceRaw = await baseUsdcRead.balanceOf(vaultAddress).catch(() => ethers.BigNumber.from(0))
      const vaultBalance = parseFloat(ethers.utils.formatUnits(vaultBalanceRaw, 6))

      if (vaultBalance < stakeUsd) {
        await client.query('ROLLBACK')
        return res.status(402).json({
          error: 'Insufficient vault USDC for creator stake',
          required: stakeUsd,
          vaultBalance,
          vaultAddress,
          message: `Creating a market requires $${stakeUsd} USDC stake (refunded on resolution). Fund your vault on Base and retry.`,
        })
      }

      // Per-address chain lock + fresh nonce (Sprint A primitive)
      await acquireChainLock(8453, vaultAddress)
      try {
        const vaultSigner = createFreshWallet(vaultHd.privateKey, 8453)
        const usdc = new ethers.Contract(
          CONFIG.USDC_BASE,
          ['function transfer(address,uint256) returns (bool)'],
          vaultSigner
        )
        const amountWei = ethers.utils.parseUnits(stakeUsd.toFixed(6), 6)
        const nonce = await getFreshNonce(8453, vaultAddress)
        const estGas = await usdc.estimateGas.transfer(escrowAddress, amountWei).catch(() => ethers.BigNumber.from(100000))
        const gasLimit = estGas.mul(130).div(100)
        const tx = await usdc.transfer(escrowAddress, amountWei, { gasLimit, nonce })
        const receipt = await tx.wait()
        recordNonceUsed(8453, nonce, vaultAddress)
        if (!receipt || receipt.status !== 1) throw new Error('Stake transfer reverted')
        stakeTxHash = receipt.transactionHash
      } finally {
        releaseChainLock(8453, vaultAddress)
      }

      const result = await client.query(
        `INSERT INTO markets (
           id, question, description, category, resolution_source, resolution_date,
           image_url, creator_id, escrow_address, creator_stake, creator_stake_tx_hash
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [
          marketId, question, description || '', category || 'general',
          resolutionSource || '', resolutionDate || null, imageUrl || null,
          userId, escrowAddress, stakeUsd, stakeTxHash
        ]
      )

      await client.query('COMMIT')
      res.status(201).json(result.rows[0])
    } catch (err: any) {
      console.error('[POST /markets]', err.message)
      await client.query('ROLLBACK').catch(() => {})
      if (stakeTxHash) {
        console.error(`[MARKET-INCONSISTENCY] Stake tx ${stakeTxHash} succeeded but market INSERT rolled back — orphaned stake. user=${userId} amount=${stakeUsd}`)
        db.query(
          `INSERT INTO execution_log (id, entity_type, entity_id, action, status, tx_hash, detail, error_message, created_at)
           VALUES (gen_random_uuid(), 'market_inconsistency', $1, 'db_rollback_post_stake', 'failed', $2, $3, $4, now())`,
          [userId, stakeTxHash, `Creator stake $${stakeUsd} transferred to escrow but market INSERT failed. Manual refund required.`, err.message?.slice(0, 200) || 'Unknown']
        ).catch(() => {})
      }
      res.status(500).json({ error: 'Failed to create market' })
    } finally {
      client.release()
    }
  })

  // POST /markets/:id/bet — place a bet (AMM-based)
  router.post('/markets/:id/bet', requireAuth, async (req, res) => {
    const userId = (req as any).user.id
    const marketId = req.params.id
    const { side, amount, sourceChain } = req.body || {}
    if (!side || !amount || !['yes', 'no'].includes(side)) {
      return res.status(400).json({ error: 'side (yes/no) and amount required' })
    }
    const betAmount = Number(amount)
    if (betAmount <= 0 || betAmount > 10000) return res.status(400).json({ error: 'Amount must be $0.01 - $10,000' })

    // Sprint A hardening: pg_advisory_xact_lock serializes concurrent bets per user
    // to prevent double-spend on vault balance. Chain lock + fresh nonce prevent
    // NONCE_EXPIRED collisions when the same vault signs multiple txs in flight.
    // executionTxHash hoisted to function scope for post-rollback inconsistency logging.
    let executionTxHash: string | null = null
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await client.query(`SET LOCAL statement_timeout = '30s'`)
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1)::bigint)`, [userId])

      const market = await client.query('SELECT * FROM markets WHERE id = $1', [marketId])
      if (!market.rows.length) {
        await client.query('ROLLBACK')
        return res.status(404).json({ error: 'Market not found' })
      }
      const m = market.rows[0]
      if (m.status !== 'active') {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'Market is not active' })
      }

      // EXECUTION LAYER: Real on-chain bet on BASE (per architecture spec).
      // Vault wallets live on Base. Escrow wallets live on Base.
      const vaultSeed = ethers.utils.id(process.env.PRIVATE_KEY! + 'vault_' + userId)
      const vaultHd = ethers.utils.HDNode.fromSeed(vaultSeed)
      const vaultAddress = vaultHd.address

      const escrowSeed = ethers.utils.id(process.env.PRIVATE_KEY! + 'market_' + marketId)
      const escrowHd = ethers.utils.HDNode.fromSeed(escrowSeed)
      const escrowAddress = escrowHd.address

      // Read vault USDC balance on Base (external RPC, not DB)
      const baseProvider = new ethers.providers.JsonRpcProvider(CONFIG.BASE_RPC_URL)
      const baseUsdcRead = new ethers.Contract(
        CONFIG.USDC_BASE,
        ['function balanceOf(address) view returns (uint256)'],
        baseProvider
      )
      const vaultBalanceRaw = await baseUsdcRead.balanceOf(vaultAddress).catch(() => ethers.BigNumber.from(0))
      const vaultBalance = parseFloat(ethers.utils.formatUnits(vaultBalanceRaw, 6))

      // S33 Tier 1 #4: HELM-105 cap on user-initiated bet placement.
      // Twin to execution-dispatch's per-tx cap on the actual on-chain
      // bet move (vault→escrow); fires here at intent commit so the
      // alarm sees the value the user authorized, not just the eventual
      // dispatch. Same chainId/from/to as the dispatch site.
      await enforceTxCap({
        source: 'user-bet-intent',
        txKind: 'transfer',
        valueUsd: betAmount,
        chainId: 8453,
        fromAddress: vaultAddress,
        toAddress: escrowAddress,
        agentId: userId,
      });

      // AMM pricing (intent layer — always runs)
      const yesPool = parseFloat(m.yes_pool) || 1
      const noPool = parseFloat(m.no_pool) || 1
      const totalPool = yesPool + noPool
      let shares: number
      let entryPrice: number
      if (side === 'yes') {
        entryPrice = noPool / totalPool
        shares = betAmount / entryPrice
      } else {
        entryPrice = yesPool / totalPool
        shares = betAmount / entryPrice
      }

      let executionStatus = 'pending'
      const executionSteps: { step: string; status: string; detail: string }[] = []

      if (vaultBalance < betAmount) {
        executionSteps.push({
          step: 'vault_balance_check',
          status: 'FAILED',
          detail: `Vault ${vaultAddress.slice(0,8)}... has $${vaultBalance.toFixed(2)} USDC on Base, need $${betAmount.toFixed(2)}. Fund vault first.`
        })
      } else {
        executionSteps.push({ step: 'vault_balance_check', status: 'PASSED', detail: `$${vaultBalance.toFixed(2)} on Base` })
        executionSteps.push({ step: 'escrow_wallet_derived', status: 'PASSED', detail: escrowAddress })

        // Per-address chain lock: different users bet in parallel; same vault serializes.
        await acquireChainLock(8453, vaultAddress)
        try {
          const vaultSigner = createFreshWallet(vaultHd.privateKey, 8453)
          const usdcWriter = new ethers.Contract(
            CONFIG.USDC_BASE,
            ['function transfer(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)'],
            vaultSigner
          )
          const amountWei = ethers.utils.parseUnits(betAmount.toFixed(6), 6)

          const nonce = await getFreshNonce(8453, vaultAddress)
          const estGas = await usdcWriter.estimateGas.transfer(escrowAddress, amountWei).catch(() => ethers.BigNumber.from(100000))
          const gasLimit = estGas.mul(130).div(100)

          const tx = await usdcWriter.transfer(escrowAddress, amountWei, { gasLimit, nonce })
          const receipt = await tx.wait()
          recordNonceUsed(8453, nonce, vaultAddress)
          if (!receipt || receipt.status !== 1) throw new Error('Transfer reverted')

          executionTxHash = receipt.transactionHash
          executionStatus = 'executed'
          executionSteps.push({ step: 'usdc_transfer', status: 'EXECUTED', detail: `TX: ${receipt.transactionHash}` })

          await client.query(
            `UPDATE markets SET escrow_address = COALESCE(escrow_address, $1), escrow_tx_hash = COALESCE(escrow_tx_hash, $2) WHERE id = $3`,
            [escrowAddress, receipt.transactionHash, marketId]
          )
        } catch (execErr: any) {
          executionSteps.push({
            step: 'usdc_transfer',
            status: 'FAILED',
            detail: execErr.message?.slice(0, 120) || 'Transfer failed'
          })
        } finally {
          releaseChainLock(8453, vaultAddress)
        }
      }

      // Update AMM pools only if executed (all inside the advisory-locked tx)
      if (executionStatus === 'executed') {
        if (side === 'yes') {
          await client.query('UPDATE markets SET yes_pool = yes_pool + $1, total_volume = total_volume + $1 WHERE id = $2', [betAmount, marketId])
        } else {
          await client.query('UPDATE markets SET no_pool = no_pool + $1, total_volume = total_volume + $1 WHERE id = $2', [betAmount, marketId])
        }
      }

      const position = await client.query(
        `INSERT INTO market_positions (id, market_id, user_id, side, shares, cost_basis, source_chain, status, execution_tx_hash, executed_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [marketId, userId, side, shares, betAmount, sourceChain || 8453, executionStatus, executionTxHash, executionStatus === 'executed' ? new Date() : null]
      )

      // Fetch post-update pools (inside tx for consistency)
      const newMarket = await client.query('SELECT yes_pool, no_pool FROM markets WHERE id = $1', [marketId])

      await client.query('COMMIT')

      // Post-commit: non-blocking price history snapshot (outside tx; uses pool, not client)
      const newYes = parseFloat(newMarket.rows[0].yes_pool)
      const newNo = parseFloat(newMarket.rows[0].no_pool)
      const newTotal = newYes + newNo
      const yesP = newTotal > 0 ? newNo / newTotal : 0.5
      const noP = newTotal > 0 ? newYes / newTotal : 0.5
      db.query(
        `INSERT INTO market_price_history (id, market_id, yes_price, no_price, volume, recorded_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, now())`,
        [marketId, yesP.toFixed(3), noP.toFixed(3), betAmount]
      ).catch(() => {})

      res.status(201).json({
        position: position.rows[0],
        entryPrice,
        shares,
        newYesPrice: executionStatus === 'executed' ? newNo / newTotal : noPool / totalPool,
        newNoPrice: executionStatus === 'executed' ? newYes / newTotal : yesPool / totalPool,
        executionStatus,
        executionTxHash,
        error: executionStatus !== 'executed'
          ? (vaultBalance < betAmount ? 'Execution failed: No funds' : 'Execution failed')
          : null,
      })
    } catch (err: any) {
      console.error('[POST /markets/:id/bet]', err.message)
      await client.query('ROLLBACK').catch(() => {})

      // CRITICAL: if the on-chain tx already went through but the DB commit failed,
      // funds moved with no position record. Log an alert so admin can reconcile.
      if (executionTxHash) {
        console.error(`[BET-INCONSISTENCY] On-chain tx ${executionTxHash} succeeded but DB rollback — manual reconcile needed. user=${userId} market=${marketId} amount=${betAmount}`)
        db.query(
          `INSERT INTO execution_log (id, entity_type, entity_id, action, status, tx_hash, detail, error_message, created_at)
           VALUES (gen_random_uuid(), 'bet_inconsistency', $1, 'db_rollback_post_transfer', 'failed', $2, $3, $4, now())`,
          [userId, executionTxHash, `On-chain transfer succeeded but DB commit failed. Market ${marketId}, amount $${betAmount}. Manual reconcile required.`, err.message?.slice(0, 200) || 'Unknown']
        ).catch(() => {})
      }

      res.status(500).json({ error: 'Bet failed' })
    } finally {
      client.release()
    }
  })

  // POST /markets/:id/resolve — resolve a market (admin only for now)
  router.post('/markets/:id/resolve', requireAuth, async (req, res) => {
    const { outcome } = req.body || {} // 'yes' or 'no'
    const marketId = req.params.id
    if (!outcome || !['yes', 'no'].includes(outcome)) {
      return res.status(400).json({ error: 'outcome must be yes or no' })
    }
    try {
      const market = await db.query('SELECT * FROM markets WHERE id = $1', [marketId])
      if (!market.rows.length) return res.status(404).json({ error: 'Market not found' })
      const m = market.rows[0]
      if (m.status === 'resolved') return res.status(400).json({ error: 'Already resolved' })

      // ── PRE-RESOLUTION CHECK: Verify escrow has enough USDC for payouts ──
      const winningPositions = await db.query(
        `SELECT id, user_id, shares, status FROM market_positions
         WHERE market_id = $1 AND side = $2 AND status IN ('open', 'executed')`,
        [marketId, outcome]
      )
      const totalPayoutNeeded = winningPositions.rows.reduce((s: number, p: any) => s + parseFloat(p.shares), 0)

      // Derive escrow wallet, check on-chain balance
      let escrowAddress = m.escrow_address
      if (!escrowAddress) {
        const escrowSeed = ethers.utils.id(process.env.PRIVATE_KEY! + 'market_' + marketId)
        escrowAddress = ethers.utils.HDNode.fromSeed(escrowSeed).address
      }
      const baseProvider = new ethers.providers.JsonRpcProvider(CONFIG.BASE_RPC_URL)
      const usdc = new ethers.Contract(CONFIG.USDC_BASE, ['function balanceOf(address) view returns (uint256)'], baseProvider)
      const escrowBalanceRaw = await usdc.balanceOf(escrowAddress).catch(() => ethers.BigNumber.from(0))
      const escrowBalance = parseFloat(ethers.utils.formatUnits(escrowBalanceRaw, 6))

      if (escrowBalance < totalPayoutNeeded - 0.01) {
        // Allow resolution but warn — sweep will retry payouts when escrow funded
        console.warn(`[resolve] Escrow ${escrowAddress.slice(0,8)}... has $${escrowBalance.toFixed(2)}, need $${totalPayoutNeeded.toFixed(2)}. Resolving with deferred payouts.`)
      }

      // Mark market as resolved
      await db.query(
        "UPDATE markets SET status = 'resolved', resolved_outcome = $1, resolved_at = now() WHERE id = $2",
        [outcome, marketId]
      )

      // Mark winners — actual on-chain payout handled by sweepMarketPayouts() in execution-dispatch.ts
      // Status='won' + payout_tx_hash IS NULL = ready for sweep to execute escrow→vault transfer
      for (const pos of winningPositions.rows) {
        const payout = parseFloat(pos.shares) // $1 per share
        await db.query(
          "UPDATE market_positions SET status = 'won', payout = $1 WHERE id = $2",
          [payout, pos.id]
        )
      }

      // Mark losers
      await db.query(
        "UPDATE market_positions SET status = 'lost', payout = 0 WHERE market_id = $1 AND side != $2 AND status IN ('open', 'executed')",
        [marketId, outcome]
      )

      // Sprint C: compute creator reward (0.5% × total_volume by default, configurable)
      const rewardPct = Number(CONFIG.CREATOR_REWARD_PCT) || 0.5
      const totalVolume = parseFloat(m.total_volume || '0')
      const creatorRewardAmount = Number((totalVolume * rewardPct / 100).toFixed(6))
      await db.query(
        `UPDATE markets SET creator_reward_amount = $1 WHERE id = $2`,
        [creatorRewardAmount, marketId]
      ).catch(() => {})

      res.json({
        resolved: true,
        outcome,
        winnersCount: winningPositions.rows.length,
        totalPayout: totalPayoutNeeded,
        creatorRewardAmount,
        escrowAddress,
        escrowBalance,
        payoutsDeferred: escrowBalance < totalPayoutNeeded - 0.01,
        message: 'Payouts will execute via background sweep (escrow → vault on Base)',
      })
    } catch (err: any) {
      console.error('[POST /markets/:id/resolve]', err.message)
      res.status(500).json({ error: 'Resolution failed' })
    }
  })

  // GET /markets/:id/positions — user's positions in a market
  router.get('/markets/:id/positions', requireAuth, async (req, res) => {
    const userId = (req as any).user.id
    try {
      const result = await db.query(
        'SELECT * FROM market_positions WHERE market_id = $1 AND user_id = $2 ORDER BY created_at DESC',
        [req.params.id, userId]
      )
      res.json(result.rows)
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // ── Bot Submissions ──────────────────────────────────────────────────────────

  // POST /bots/submit — submit a GitHub bot for review
  router.post('/bots/submit', requireAuth, async (req, res) => {
    const userId = (req as any).user.id
    const { repoUrl, name, description } = req.body || {}
    if (!repoUrl || !repoUrl.includes('github.com')) {
      return res.status(400).json({ error: 'Valid GitHub URL required' })
    }
    try {
      // Validate GitHub repo exists
      const repoPath = repoUrl.replace('https://github.com/', '').replace(/\/$/, '')
      const ghRes = await axios.get(`https://api.github.com/repos/${repoPath}`).catch(() => null)
      if (!ghRes || ghRes.status !== 200) {
        return res.status(400).json({ error: 'GitHub repository not found or private' })
      }
      const repo = ghRes.data

      // Store submission
      await db.query(
        `INSERT INTO bot_submissions (id, user_id, repo_url, name, description, stars, language, status, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'pending', now())`,
        [userId, repoUrl, name || repo.name, description || repo.description || '', repo.stargazers_count || 0, repo.language || 'Unknown']
      )

      res.status(201).json({
        submitted: true,
        name: name || repo.name,
        stars: repo.stargazers_count,
        language: repo.language,
        message: 'Bot submitted for review. We will notify you when it is approved.',
      })
    } catch (err: any) {
      console.error('[POST /bots/submit]', err.message)
      res.status(500).json({ error: 'Submission failed' })
    }
  })

  // GET /bots/submissions — list user's bot submissions
  router.get('/bots/submissions', requireAuth, async (req, res) => {
    const userId = (req as any).user.id
    try {
      const result = await db.query(
        'SELECT * FROM bot_submissions WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      )
      res.json(result.rows)
    } catch (err: any) {
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  // ─── YIELD → HYPERLIQUID FEEDS (Session 30) ────────────────────────────────
  // Surfaces Hyperliquid's live perp funding rates as a yield signal. Positive
  // funding = shorts earn (longs pay hourly); negative = longs earn. Sorted
  // by |magnitude| descending so both extremes show. No auth required — it's
  // read-only public data + 30s server-side cache to keep HL request volume
  // low. Route not rate-limited; cache is the defense.
  //
  // Response shape:
  //   { fetchedAt: ISO, rows: Array<{symbol, fundingHourly, fundingApr,
  //     markPx, openInterestUsd, dayVolumeUsd}> }
  router.get('/yield/hyperliquid/funding', async (req, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50)
      const { getTopFundingRatesCached } = await import('./hyperliquid-client')
      const rows = await getTopFundingRatesCached(limit)
      res.json({
        fetchedAt: new Date().toISOString(),
        source: 'hyperliquid.xyz/info (type:metaAndAssetCtxs)',
        rows,
      })
    } catch (err: any) {
      console.error('[hl-yield]', err.message?.slice(0, 120))
      res.status(502).json({ error: 'Hyperliquid fetch failed', detail: err.message?.slice(0, 120) })
    }
  })

  // GET /yield/hyperliquid/spot — Hyperliquid spot markets by 24h volume.
  // Surfaces the top N canonical spot pairs with price + 24h change +
  // volume. Paired with the perp funding feed on /en/dashboard/yield-
  // hyperliquid. Same caching (60s) + degrade pattern.
  router.get('/yield/hyperliquid/spot', async (req, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 15, 1), 50)
      const { getTopSpotMarketsCached } = await import('./hyperliquid-client')
      const rows = await getTopSpotMarketsCached(limit)
      res.json({
        fetchedAt: new Date().toISOString(),
        source: 'hyperliquid.xyz/info (type:spotMetaAndAssetCtxs)',
        rows,
      })
    } catch (err: any) {
      console.error('[hl-spot]', err.message?.slice(0, 120))
      res.status(502).json({ error: 'Hyperliquid spot fetch failed', detail: err.message?.slice(0, 120) })
    }
  })

  // GET /yield/hyperliquid/funding-history — sparkline data for the funding
  // table. Accepts ?symbols=BTC,ETH,SOL&hours=24 (defaults to top funding
  // symbols if list omitted, cap 30 symbols × 168h = 7d window). Returns
  // a per-symbol array of {time, fundingHourly, fundingApr} points.
  // Cached at 5min — HL pays funding hourly so sub-minute polling adds
  // zero signal.
  router.get('/yield/hyperliquid/funding-history', async (req, res) => {
    try {
      const hours = Math.min(Math.max(Number(req.query.hours) || 24, 1), 168)
      const symbolsRaw = String(req.query.symbols || '').trim()
      let symbols: string[]
      if (symbolsRaw) {
        symbols = symbolsRaw.split(',')
          .map(s => s.trim().toUpperCase())
          .filter(Boolean)
          .slice(0, 30)
      } else {
        // Default: pull the top 10 by current funding magnitude so a UI
        // that just hits the endpoint gets useful sparklines without
        // having to know symbol names.
        const { getTopFundingRatesCached } = await import('./hyperliquid-client')
        const rows = await getTopFundingRatesCached(10)
        symbols = rows.map(r => r.symbol)
      }
      if (symbols.length === 0) {
        return res.json({ fetchedAt: new Date().toISOString(), histories: {} })
      }
      const { getFundingHistoryBatchCached } = await import('./hyperliquid-client')
      const histories = await getFundingHistoryBatchCached(symbols, hours)
      res.json({
        fetchedAt: new Date().toISOString(),
        source: 'hyperliquid.xyz/info (type:fundingHistory)',
        hours,
        histories,
      })
    } catch (err: any) {
      console.error('[hl-funding-history]', err.message?.slice(0, 120))
      res.status(502).json({ error: 'Hyperliquid funding history failed', detail: err.message?.slice(0, 120) })
    }
  })

  // GET /yield/hyperliquid/lp-pools — HyperSwap V2 + V3 LP pool yields.
  // Source: DefiLlama yields.llama.fi/pools, filtered to project ∈
  // {hyperswap-v2, hyperswap-v3} on chain "Hyperliquid L1". Cached 5min.
  // Powers the new "HyperSwap LP Pools" panel on the Yield page.
  router.get('/yield/hyperliquid/lp-pools', async (req, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 150)
      const minTvl = Number(req.query.minTvl) || 0
      const { getHyperSwapPoolsCached } = await import('./yields-llama-client')
      const all = await getHyperSwapPoolsCached()
      const filtered = all.filter((p) => p.tvlUsd >= minTvl).slice(0, limit)
      res.json({
        fetchedAt: new Date().toISOString(),
        source: 'defillama yields.llama.fi/pools (filter: hyperswap-v2|v3 on Hyperliquid L1)',
        totalTracked: all.length,
        returned: filtered.length,
        pools: filtered,
      })
    } catch (err: any) {
      console.error('[hl-lp-pools]', err.message?.slice(0, 120))
      res.status(502).json({ error: 'LP pools fetch failed', detail: err.message?.slice(0, 120) })
    }
  })

  // GET /yield/hyperliquid/staking — network-level HYPE staking stats.
  // Powers the "HYPE Staking" stat card on the Yield page. Cached 5min;
  // validator set + APR drift slowly so this is plenty.
  router.get('/yield/hyperliquid/staking', async (req, res) => {
    try {
      const { getStakingStatsCached } = await import('./hyperliquid-client')
      const stats = await getStakingStatsCached()
      if (!stats) {
        return res.json({
          fetchedAt: new Date().toISOString(),
          stats: null,
          degraded: true,
        })
      }
      res.json({
        fetchedAt: new Date().toISOString(),
        source: 'hyperliquid.xyz/info (type:validatorSummaries)',
        stats,
      })
    } catch (err: any) {
      console.error('[hl-staking]', err.message?.slice(0, 120))
      res.status(502).json({ error: 'Hyperliquid staking fetch failed', detail: err.message?.slice(0, 120) })
    }
  })

  // ── HL Vault Phase 1 routes (S31 H2) ───────────────────────────────────────
  // Mounted here so requireAuth can be passed in. See src/hl-routes.ts.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mountHlRoutes } = require('./hl-routes')
  mountHlRoutes(router, db, requireAuth)

  // ── Sandbox routes (S32 — safe-to-fail mainnet-fork harness) ───────────────
  // Admin-only. Powers /api/sandbox/* — spawn Anvil forks + scratch DB
  // schemas for testing high-stakes actions reversibly. See sandbox/routes.ts.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mountSandboxRoutes } = require('./sandbox/routes')
  mountSandboxRoutes(router, db)

  // ── Inter-agent message bus routes (S31 H2) ────────────────────────────────
  // Same mount pattern. Powers /api/agent-bus/* — publish, inbox, subscribe,
  // key rotation. Helm HELM-008 verifies every read; bad sigs alert.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mountAgentBusRoutes } = require('./agent-bus-routes')
  mountAgentBusRoutes(router, db, requireAuth)

  // ── x402 facilitator routes (S33 X5 Phase 1) ──────────────────────────────
  // Stands up /facilitator/{verify,settle,supported} for x402 clients to
  // hit. Phase 1 = routing layer; internal-payer settles bypass on-chain
  // (off-chain ledger), external forwards to upstream (Coinbase mainnet
  // or x402.org testnet).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mountFacilitatorRoutes } = require('./x402/facilitator-server')
  mountFacilitatorRoutes(router, db)

  // ── Agent budget routes (S31 H2) ───────────────────────────────────────────
  // GET    /api/agents/:id/budget          — full snapshot (auth: self or admin)
  // POST   /api/agents/:id/budget/refill   — admin only — top up
  // POST   /api/agents/:id/budget/authority — admin only — set cap
  router.get('/api/agents/:id/budget', requireAuthOrAdminKey, async (req: any, res: Response) => {
    try {
      const targetId = String(req.params.id)
      // Self or admin only
      const isAdminCaller = (req.user as any)?.role === 'admin' ||
        (req.headers['x-admin-key'] as string | undefined) === process.env.ADMIN_KEY ||
        String(req.query.adminKey || '') === process.env.ADMIN_KEY
      if (!isAdminCaller && targetId !== req.user?.id) {
        return res.status(403).json({ error: 'cannot read another agent\'s budget' })
      }
      const { getBudgetSnapshot } = await import('./budgets')
      const snap = await getBudgetSnapshot(db, targetId)
      res.json(snap)
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'internal' })
    }
  })

  router.post('/api/agents/:id/budget/refill', requireAuthOrAdminKey, async (req: any, res: Response) => {
    try {
      const isAdminCaller = (req.user as any)?.role === 'admin' ||
        (req.headers['x-admin-key'] as string | undefined) === process.env.ADMIN_KEY ||
        String(req.query.adminKey || '') === process.env.ADMIN_KEY
      if (!isAdminCaller) return res.status(403).json({ error: 'admin only' })
      const targetId = String(req.params.id)
      const deltaUsd = Number(req.body?.deltaUsd)
      const description = String(req.body?.description || 'manual refill').slice(0, 480)
      const period = req.body?.period || 'weekly'
      const by = String(req.body?.by || req.user?.id || 'admin')
      const { recordRefill } = await import('./budgets')
      const out = await recordRefill(db, { agentId: targetId, deltaUsd, description, by, period })
      res.json({ ok: true, ...out })
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'internal' })
    }
  })

  // POST /api/agents/:id/budget/topup — USER-FACING budget top-up
  // (Marathon 9 sprint 9.1 / A1).
  //
  // The admin /budget/refill above is admin-key-gated and used for
  // operator-level ops. Users need to top up THEIR OWN agents' budgets
  // without admin escalation. Ownership is enforced via agents.user_id
  // match. Budget top-up is intent-layer (raises the spending cap);
  // actual USDC routing into the agent vault is a separate flow
  // (agent funding via /agents/:id/fund).
  //
  // Topup amount is gated by enforceTxCap so platform-level caps apply
  // — a runaway script can't blow through unlimited topup increments.
  // agent_id passed correctly (Marathon 9 / A3 lesson) so the
  // resulting heimdall_event tags the agent's UUID.
  router.post('/api/agents/:id/budget/topup', requireAuth, async (req: any, res: Response) => {
    const userId = (req as any).user.id
    const targetId = String(req.params.id)
    try {
      // Ownership check — user can only top up their own agents.
      const ownership = await db.query(
        'SELECT id, name FROM agents WHERE id = $1 AND user_id = $2',
        [targetId, userId],
      )
      if (!ownership.rows.length) return res.status(404).json({ error: 'Agent not found' })

      const deltaUsd = Number(req.body?.deltaUsd)
      if (!Number.isFinite(deltaUsd) || deltaUsd <= 0) {
        return res.status(400).json({ error: 'deltaUsd must be a positive number' })
      }
      if (deltaUsd > 10_000) {
        return res.status(400).json({ error: 'deltaUsd exceeds $10,000 single-topup cap' })
      }
      const period = (req.body?.period === 'daily' || req.body?.period === 'monthly') ? req.body.period : 'weekly'
      const description = String(req.body?.description || `User top-up by ${userId.slice(0, 8)}`).slice(0, 480)

      // HELM-105 cap on the topup itself — direct agent attribution.
      await enforceTxCap({
        source: 'agent-budget-topup',
        txKind: 'transfer',
        valueUsd: deltaUsd,
        chainId: 8453, // intent layer; topup itself isn't on-chain but we tag Base
        agentId: targetId,
      })

      const { recordRefill, getBudgetSnapshot } = await import('./budgets')
      const out = await recordRefill(db, {
        agentId: targetId,
        deltaUsd,
        description,
        by: userId,
        period,
      })
      const snap = await getBudgetSnapshot(db, targetId)
      res.json({ ok: true, refill: out, snapshot: snap })
    } catch (err: any) {
      console.error('[POST /agents/:id/budget/topup]', err?.message?.slice(0, 200))
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'internal' })
    }
  })

  // Manual spend recording. Mirrors /refill — admin-only counterpart for
  // ops adjustments + smoke-testing the agent-budget-low → Huginn →
  // Telegram loop. Real on-chain spends flow through enforceTxCap, NOT
  // this endpoint.
  router.post('/api/agents/:id/budget/spend', requireAuthOrAdminKey, async (req: any, res: Response) => {
    try {
      const isAdminCaller = (req.user as any)?.role === 'admin' ||
        (req.headers['x-admin-key'] as string | undefined) === process.env.ADMIN_KEY ||
        String(req.query.adminKey || '') === process.env.ADMIN_KEY
      if (!isAdminCaller) return res.status(403).json({ error: 'admin only' })
      const targetId = String(req.params.id)
      const deltaUsd = Number(req.body?.deltaUsd)
      const description = String(req.body?.description || 'manual spend').slice(0, 480)
      const period = req.body?.period || 'weekly'
      const chainId = typeof req.body?.chainId === 'number' ? req.body.chainId : null
      const txHash = req.body?.txHash || null
      const { recordSpend } = await import('./budgets')
      const out = await recordSpend(db, { agentId: targetId, deltaUsd, description, period, chainId, txHash })
      res.json({ ok: true, ...out })
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'internal' })
    }
  })

  // ── Huginn counsel (S31 H2) ────────────────────────────────────────────────
  // POST /api/huginn/counsel — synchronous "should I?" gate. Caller passes
  // proposed action; Huginn runs the rule bank + records a prediction +
  // returns verdict. Authed; admin-only for now (callers are typically
  // server-side processes, not end-users). Self-call (Huginn calling
  // itself) is rejected to avoid recursion.
  router.post('/api/huginn/counsel', requireAuthOrAdminKey, async (req: any, res: Response) => {
    try {
      const isAdminCaller = (req.user as any)?.role === 'admin' ||
        (req.headers['x-admin-key'] as string | undefined) === process.env.ADMIN_KEY ||
        String(req.query.adminKey || '') === process.env.ADMIN_KEY
      if (!isAdminCaller) return res.status(403).json({ error: 'admin only for now' })
      const body = req.body || {}
      const proposerAgentId = String(body.proposerAgentId || '').trim()
      const actionType = String(body.actionType || '').trim()
      const actionSubject = String(body.actionSubject || '').trim()
      if (!proposerAgentId || !actionType || !actionSubject) {
        return res.status(400).json({ error: 'proposerAgentId, actionType, actionSubject required' })
      }
      if (proposerAgentId === 'huginn') {
        return res.status(400).json({ error: 'Huginn cannot counsel itself' })
      }
      const { counsel } = await import('./huginn')
      const result = await counsel(db, {
        proposerAgentId,
        actionType,
        actionSubject,
        valueUsd: typeof body.valueUsd === 'number' ? body.valueUsd : null,
        chainId: typeof body.chainId === 'number' ? body.chainId : null,
        reasoning: body.reasoning ?? null,
        metadata: body.metadata ?? undefined,
      })
      res.json(result)
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'internal' })
    }
  })

  router.get('/api/agents/:id/reputation', requireAuthOrAdminKey, async (req: any, res: Response) => {
    try {
      const targetId = String(req.params.id)
      const isAdminCaller = (req.user as any)?.role === 'admin' ||
        (req.headers['x-admin-key'] as string | undefined) === process.env.ADMIN_KEY ||
        String(req.query.adminKey || '') === process.env.ADMIN_KEY
      if (!isAdminCaller && targetId !== req.user?.id) {
        return res.status(403).json({ error: 'cannot read another agent\'s reputation' })
      }
      const { getReputationSnapshot } = await import('./reputation')
      const snap = await getReputationSnapshot(db, targetId)
      res.json(snap)
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'internal' })
    }
  })

  // ── POST /api/agents/:id/propose-action ────────────────────────────────────
  // Mythos counsel-on-action canonical path (S32).
  // Body: { actionType, actionSubject, prediction, valueUsd?, chainId?,
  //         confidence?, horizonDays?, reasoning?, predictionType? }
  // Wraps recordPredictionWithCounsel() so any agent-initiated action
  // (proposed change, prediction commitment, etc.) gets a Huginn verdict
  // automatically + the verdict surfaces via heimdall_events for the
  // admin Mythos POV "recent counsel" panel.
  // Admin-only — callers should be server-side processes or operator.
  router.post('/api/agents/:id/propose-action', requireAuthOrAdminKey, async (req: any, res: Response) => {
    try {
      const isAdminCaller = (req.user as any)?.role === 'admin' ||
        (req.headers['x-admin-key'] as string | undefined) === process.env.ADMIN_KEY ||
        String(req.query.adminKey || '') === process.env.ADMIN_KEY
      if (!isAdminCaller) return res.status(403).json({ error: 'admin only' })

      const proposerAgentId = String(req.params.id).trim()
      if (!proposerAgentId) return res.status(400).json({ error: 'agentId path param required' })
      if (proposerAgentId === 'huginn') {
        return res.status(400).json({ error: 'Huginn cannot propose actions through this endpoint (would recurse on its own counsel)' })
      }

      const body = req.body || {}
      const actionType = String(body.actionType || '').trim()
      const actionSubject = String(body.actionSubject || '').trim()
      if (!actionType || !actionSubject) {
        return res.status(400).json({ error: 'actionType + actionSubject required' })
      }
      const predictionType = String(body.predictionType || actionType).slice(0, 64)
      const prediction = (typeof body.prediction === 'object' && body.prediction !== null) ? body.prediction : {}

      const { recordPredictionWithCounsel } = await import('./reputation')
      const { predictionId, counsel } = await recordPredictionWithCounsel(db, {
        agentId: proposerAgentId,
        type: predictionType,
        subject: actionSubject,
        prediction,
        confidence: typeof body.confidence === 'number' ? body.confidence : undefined,
        reasoning: typeof body.reasoning === 'string' ? body.reasoning : null,
        horizonDays: typeof body.horizonDays === 'number' ? body.horizonDays : undefined,
        counselValueUsd: typeof body.valueUsd === 'number' ? body.valueUsd : null,
        counselChainId: typeof body.chainId === 'number' ? body.chainId : null,
        counselActionType: actionType,
      })

      res.json({
        predictionId,
        counsel: counsel ? {
          verdict: counsel.verdict,
          confidence: counsel.confidence,
          signalsCount: counsel.signals.length,
          signals: counsel.signals,
          reasoning: counsel.reasoning,
          recommendedAlternative: counsel.recommendedAlternative ?? null,
          counselPredictionId: counsel.predictionId,
        } : null,
      })
    } catch (err: any) {
      console.error('[POST /api/agents/:id/propose-action] error:', err?.message)
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'internal' })
    }
  })

  // ── x402 — agentic-payment rails (S33 Phase 1, idea #1 in roadmap) ────────
  // Programmatic Agent Treasury: any agent on AFI calls any x402-protected URL
  // through our middleware. Pre-flight chain (HELM-105 → huginn.counsel →
  // recordSpend) gates every payment under existing budget + reputation
  // policy. Settlement on Base (USDC).
  //
  // Admin-only — callers are server-side processes or operator probes.
  // For the eventual user-mode usage (agents acting on a user's behalf),
  // a separate authenticated endpoint will land in Phase 2.

  // GET /api/x402/agent-address?agentId=mythos
  // Returns the deterministic Base address an agent signs from. Operator
  // funds this address with USDC + ETH (gas-free if facilitator is used
  // with EIP-3009 — only USDC needed).
  router.get('/api/x402/agent-address', requireAuthOrAdminKey, async (req: any, res: Response) => {
    try {
      const isAdminCaller = (req.user as any)?.role === 'admin' ||
        (req.headers['x-admin-key'] as string | undefined) === process.env.ADMIN_KEY ||
        String(req.query.adminKey || '') === process.env.ADMIN_KEY
      if (!isAdminCaller) return res.status(403).json({ error: 'admin only' })
      const agentId = String(req.query.agentId || '').trim()
      if (!agentId) return res.status(400).json({ error: 'agentId required' })
      const { getAgentX402Address } = await import('./x402/client')
      const address = getAgentX402Address(agentId)
      res.json({ agentId, address, network: 'base', chainId: 8453 })
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'internal' })
    }
  })

  // POST /api/x402/test-payment
  // Body: { url, agentId?, maxValueUsd?, method?, headers?, body? }
  // Drives a single x402-aware fetch through the pre-flight chain.
  // Returns the response status, payment confirmation (tx hash), counsel
  // verdict, and ledger debit amount. Operator uses this to validate the
  // flow against a real x402-protected URL OR to make ad-hoc agent
  // payments without writing client code.
  router.post('/api/x402/test-payment', requireAuthOrAdminKey, async (req: any, res: Response) => {
    try {
      const isAdminCaller = (req.user as any)?.role === 'admin' ||
        (req.headers['x-admin-key'] as string | undefined) === process.env.ADMIN_KEY ||
        String(req.query.adminKey || '') === process.env.ADMIN_KEY
      if (!isAdminCaller) return res.status(403).json({ error: 'admin only' })

      const body = req.body || {}
      const url = String(body.url || '').trim()
      const agentId = String(body.agentId || 'mythos').trim()
      const maxValueUsd = typeof body.maxValueUsd === 'number' ? body.maxValueUsd : 0.10
      const method = typeof body.method === 'string' ? body.method.toUpperCase() : 'GET'
      const reqHeaders = (typeof body.headers === 'object' && body.headers) ? body.headers : undefined
      const reqBody = body.body !== undefined ? (typeof body.body === 'string' ? body.body : JSON.stringify(body.body)) : undefined

      if (!url) return res.status(400).json({ error: 'url required' })
      if (!/^https?:\/\//i.test(url)) {
        return res.status(400).json({ error: 'url must be http(s)' })
      }
      if (!Number.isFinite(maxValueUsd) || maxValueUsd <= 0 || maxValueUsd > 100) {
        return res.status(400).json({ error: 'maxValueUsd must be 0 < x <= 100 (sanity ceiling on test endpoint)' })
      }

      const { x402Fetch } = await import('./x402/client')
      const result = await x402Fetch(db, {
        url,
        agentId,
        maxValueUsd,
        init: {
          method,
          headers: reqHeaders,
          body: reqBody,
        },
      })

      // Read response body (cap at 4KB so a giant payload doesn't DOS the
      // admin caller).
      let responseBody: string | null = null
      try {
        responseBody = (await result.response.text()).slice(0, 4096)
      } catch {
        responseBody = null
      }

      res.json({
        status: result.response.status,
        statusText: result.response.statusText,
        payment: result.payment,
        amountDebitedUsd: result.amountDebitedUsd,
        counselVerdict: result.counselVerdict,
        responseBody,
      })
    } catch (err: any) {
      const status = err?.statusCode ?? 500
      res.status(status).json({
        error: err?.message?.slice(0, 400) || 'internal',
        code: err?.code,
        counsel: err?.counsel ? {
          verdict: err.counsel.verdict,
          reasoning: err.counsel.reasoning,
          signals: err.counsel.signals,
        } : undefined,
      })
    }
  })

  // ── x402 — Phase 2: server-side endpoints (S33 idea X3) ────────────────
  // PUBLIC endpoints — no admin/JWT required. The auth IS the payment
  // (USDC on Base, settled via Coinbase facilitator before the response
  // body flushes). Revenue accumulates in the deterministic Nuro vault
  // visible at GET /api/x402/revenue-address.

  // GET /api/x402/revenue-address — public, no payment.
  // Returns where payments to this deployment land. Useful for monitoring
  // (basescan watchlist) and transparency (clients can verify payTo before
  // signing).
  router.get('/api/x402/revenue-address', async (_req: Request, res: Response) => {
    try {
      const { getNuroRevenueAddress } = await import('./x402/server')
      const address = getNuroRevenueAddress()
      res.json({
        address,
        network: 'base',
        chainId: 8453,
        asset: 'USDC',
        contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      })
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'internal' })
    }
  })

  // ── x402-PAID PRODUCT ENDPOINTS — agent-to-agent revenue (S33 X3) ────────
  //
  // PUBLIC — no admin/JWT. Authentication IS the x402 USDC payment.
  // Wrappers built once at registration time so the closure is shared
  // across requests.
  {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { x402Route } = require('./x402/server') as typeof import('./x402/server')

    // GET /api/x402/demo/echo — $0.001 — Phase 2 demo / loopback target.
    router.get(
      '/api/x402/demo/echo',
      x402Route(
        {
          priceUsd: 0.001,
          description: 'Nuro x402 echo — Phase 2 demo endpoint',
          mimeType: 'application/json',
          db,
        },
        async (req: Request) => {
          return {
            message: 'hello from Nuro x402',
            echoed: {
              path: req.path,
              method: req.method,
              query: req.query,
              userAgent: req.header('user-agent') ?? null,
            },
            timestamp: new Date().toISOString(),
            priced: '0.001 USDC',
            network: 'base',
            note:
              'You just paid 0.001 USDC on Base. The settlement tx is in ' +
              'the X-PAYMENT-RESPONSE header. Welcome to agentic finance.',
          }
        },
      ),
    )

    // GET /api/x402/helm/threat-intel — $0.10 — daily threat-intel
    // digest. Returns active rules in last 24h with category/severity
    // rollup. External agents pay to see what attacks our infra is
    // catching — a public-good signal for the agent ecosystem.
    router.get(
      '/api/x402/helm/threat-intel',
      x402Route(
        {
          priceUsd: 0.10,
          description: 'Nuro Helm — 24h threat-intel digest, FP-labeled, per-rule active list',
          mimeType: 'application/json',
          db,
        },
        async () => {
          const { runHelmSelfTest } = await import('./helm/self-test')
          const selfTest = await runHelmSelfTest(db)
          // Only ship rules that fired in last 24h — that's the signal.
          // Counts by category and severity for a quick rollup.
          const active = selfTest.rules.filter((r) => r.count24h > 0)
          const byCategory: Record<string, number> = {}
          const bySeverity: Record<string, number> = {}
          for (const r of active) {
            byCategory[r.category] = (byCategory[r.category] || 0) + r.count24h
            bySeverity[r.severity] = (bySeverity[r.severity] || 0) + r.count24h
          }
          return {
            generatedAt: selfTest.generatedAt,
            window: '24h',
            activeRulesCount: active.length,
            totalEvents24h: active.reduce((s, r) => s + r.count24h, 0),
            byCategory,
            bySeverity,
            // Per-rule list (no PII / no payload — just metadata + counts)
            rules: active.map((r) => ({
              id: r.id,
              category: r.category,
              severity: r.severity,
              action: r.action,
              count24h: r.count24h,
              lastFired: r.lastFired,
            })),
            note:
              'Helm is Nuro\'s cross-agent security plane. Rule catalog at ' +
              'github.com/nuro-finance public docs (TBD). Subscribe to /api/x402/helm/threat-intel ' +
              'daily for ecosystem signal.',
          }
        },
      ),
    )

    // GET /api/x402/markets/resolved — $0.001 — resolved market history.
    // Cheap, high-call-volume target for agents building probability models.
    router.get(
      '/api/x402/markets/resolved',
      x402Route(
        {
          priceUsd: 0.001,
          description: 'Resolved prediction markets — last N (max 100) with outcomes + volumes',
          mimeType: 'application/json',
          db,
        },
        async (req: Request) => {
          const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50))
          const r = await db.query(
            `SELECT id, question, category, status, resolved_outcome,
                    yes_pool, no_pool, total_volume, resolved_at, created_at
               FROM markets
              WHERE status = 'resolved'
              ORDER BY resolved_at DESC NULLS LAST
              LIMIT $1`,
            [limit],
          )
          return {
            generatedAt: new Date().toISOString(),
            count: r.rows.length,
            markets: r.rows.map((m: any) => ({
              id: m.id,
              question: m.question,
              category: m.category,
              outcome: m.resolved_outcome,
              yesPool: Number(m.yes_pool) || 0,
              noPool: Number(m.no_pool) || 0,
              totalVolume: Number(m.total_volume) || 0,
              resolvedAt: m.resolved_at ? new Date(m.resolved_at).toISOString() : null,
              createdAt: m.created_at ? new Date(m.created_at).toISOString() : null,
            })),
          }
        },
      ),
    )

    // POST /api/x402/huginn/counsel — $0.005 — synchronous Huginn counsel
    // for any agent's proposal. Caller posts {actionType, valueUsd?,
    // reasoning?, metadata?} and gets back the same {verdict, signals,
    // reasoning} structure our internal agents see. Lets external agents
    // delegate "should I do this?" judgement to Mythos's reputation
    // network. Body ceiling: 4KB to bound abuse.
    router.post(
      '/api/x402/huginn/counsel',
      x402Route(
        {
          priceUsd: 0.005,
          description: 'Huginn counsel — pre-action advisory for external agents (verdict + signals)',
          mimeType: 'application/json',
          db,
        },
        async (req: Request) => {
          const b = (req.body || {}) as Record<string, any>
          const actionType = String(b.actionType || '').slice(0, 64).trim()
          if (!actionType) {
            // x402Route returns whatever we put in body — caller still
            // got charged but the deterministic shape lets them retry
            // with a valid body. Pricing this as the cost of a malformed
            // request is acceptable — sandboxes check shape locally first.
            return { error: 'actionType required (e.g. "on-chain-tx", "agent-action")' }
          }
          const valueUsd = typeof b.valueUsd === 'number' ? b.valueUsd : null
          const chainId = typeof b.chainId === 'number' ? b.chainId : null
          const reasoning = typeof b.reasoning === 'string' ? b.reasoning.slice(0, 1000) : null
          const metadata = (b.metadata && typeof b.metadata === 'object')
            ? b.metadata
            : undefined
          const actionSubject = String(b.actionSubject || `external-${Date.now()}`).slice(0, 100)

          // S33 Tier 1 #13: scan inbound text for prompt-injection patterns.
          // External-agent callers are the highest-risk inbound surface
          // (no JWT, just paid USDC). reasoning + actionType go through
          // the LLM-touching counsel rules eventually, so a poisoned
          // payload here could leak into Mythos's context.
          const { scanAndEmit } = await import('./helm/ingress-scanner')
          // Concat the user-controlled fields for one scan pass.
          const scanText = [actionType, actionSubject, reasoning ?? ''].filter(Boolean).join('\n')
          await scanAndEmit({
            text: scanText,
            source: 'x402-huginn-counsel',
            agentId: null, // external caller — no internal agent attribution
          }).catch((err) => {
            // In enforce mode, a blocking finding throws here. Surface to
            // the response body so caller knows their input was rejected.
            // This bypasses the standard return path; we re-raise so x402
            // server's outer catch returns 500 (caller paid; we kept the
            // money — but we also blocked the action. Future polish: 422
            // with a payment-refund hint.)
            throw err
          })

          const { counsel } = await import('./huginn')
          const result = await counsel(db, {
            // External callers don't have an internal proposerAgentId — tag
            // them as 'external-x402' so reputation feedback stays scoped.
            proposerAgentId: 'external-x402',
            actionType,
            actionSubject,
            valueUsd,
            chainId,
            reasoning,
            metadata,
          })
          return {
            generatedAt: new Date().toISOString(),
            verdict: result.verdict,
            confidence: result.confidence,
            signals: result.signals,
            reasoning: result.reasoning,
            recommendedAlternative: result.recommendedAlternative ?? null,
          }
        },
      ),
    )
  }

  router.post('/api/agents/:id/budget/authority', requireAuthOrAdminKey, async (req: any, res: Response) => {
    try {
      const isAdminCaller = (req.user as any)?.role === 'admin' ||
        (req.headers['x-admin-key'] as string | undefined) === process.env.ADMIN_KEY ||
        String(req.query.adminKey || '') === process.env.ADMIN_KEY
      if (!isAdminCaller) return res.status(403).json({ error: 'admin only' })
      const targetId = String(req.params.id)
      const newAuthorityUsd = Number(req.body?.usdAuthority)
      const period = req.body?.period || 'weekly'
      const by = String(req.body?.by || req.user?.id || 'admin')
      const { setBudgetAuthority } = await import('./budgets')
      await setBudgetAuthority(db, targetId, period, newAuthorityUsd, by)
      res.json({ ok: true })
    } catch (err: any) {
      res.status(500).json({ error: err?.message?.slice(0, 200) || 'internal' })
    }
  })

  // ─── PLAID READ-ONLY (S35 M11 Day-3) ─────────────────────────────────────
  // Connect-bank flow for the omnichain settlement story. Read-only:
  // link → exchange → display balances. NO transfers, no Dwolla, no
  // BUY_2_ENABLED gating. Parallel to the existing /buy-from-bank/* routes
  // which gate the Dwolla money-movement path behind that flag.
  //
  // Graceful degradation: if PLAID_CLIENT_ID / PLAID_SECRET aren't set, every
  // endpoint returns 503 with { error: 'Plaid not configured' } so the FE
  // can show "Coming soon" instead of throwing.

  function plaidConfigured(): boolean {
    return !!(CONFIG.PLAID_CLIENT_ID && CONFIG.PLAID_SECRET)
  }

  // Mint a one-shot link_token (~4h TTL) for the FE Plaid Link widget.
  router.post('/api/plaid/link-token', requireAuth, async (req, res) => {
    if (!plaidConfigured()) {
      return res.status(503).json({ error: 'Plaid not configured', configured: false })
    }
    try {
      const userId = (req as any).user.id
      const u = await db.query('SELECT email FROM users WHERE id = $1', [userId])
      const userEmail = u.rows[0]?.email
      const { createLinkToken } = await import('./plaid-client')
      const result = await createLinkToken({
        userId,
        userEmail,
        // Read-only flow needs only 'auth' (account metadata + balances).
        // 'identity' is added by the existing buy-from-bank route — we keep
        // this leaner since we don't need Dwolla name-match here.
        products: ['auth'],
      })
      res.json(result)
    } catch (e: any) {
      console.error('[plaid/link-token]', e?.message?.slice(0, 200))
      res.status(502).json({ error: 'link_token failed', detail: e?.message?.slice(0, 200) })
    }
  })

  // Exchange the public_token from Plaid Link onSuccess → access_token,
  // store on users row, fetch + upsert account snapshot, return accounts.
  router.post('/api/plaid/exchange', requireAuth, async (req, res) => {
    if (!plaidConfigured()) {
      return res.status(503).json({ error: 'Plaid not configured', configured: false })
    }
    const publicToken = String(req.body?.public_token || '').trim()
    if (!publicToken) return res.status(400).json({ error: 'public_token required' })

    try {
      const userId = (req as any).user.id
      const { exchangePublicToken, getAccountsWithBalance } = await import('./plaid-client')

      // 1. Exchange.
      const { access_token, item_id } = await exchangePublicToken(publicToken)

      // 2. Persist on users row (single-bank-per-user — see migration 047 note).
      await db.query(
        'UPDATE users SET plaid_access_token = $1, plaid_item_id = $2 WHERE id = $3',
        [access_token, item_id, userId],
      )

      // 3. Fetch + upsert accounts.
      const accounts = await getAccountsWithBalance(access_token)
      for (const a of accounts) {
        await db.query(
          `INSERT INTO plaid_accounts (
             user_id, plaid_account_id, plaid_item_id, name, official_name,
             mask, type, subtype, current_balance, available_balance, iso_currency_code
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (plaid_account_id) DO UPDATE SET
             name = EXCLUDED.name,
             official_name = EXCLUDED.official_name,
             mask = EXCLUDED.mask,
             type = EXCLUDED.type,
             subtype = EXCLUDED.subtype,
             current_balance = EXCLUDED.current_balance,
             available_balance = EXCLUDED.available_balance,
             iso_currency_code = EXCLUDED.iso_currency_code,
             last_synced_at = now()`,
          [
            userId, a.account_id, item_id, a.name, a.official_name,
            a.mask, a.type, a.subtype,
            a.current_balance, a.available_balance, a.iso_currency_code,
          ],
        )
      }

      res.json({ ok: true, accountsCount: accounts.length })
    } catch (e: any) {
      console.error('[plaid/exchange]', e?.message?.slice(0, 200))
      res.status(502).json({ error: 'exchange failed', detail: e?.message?.slice(0, 200) })
    }
  })

  // List this user's connected accounts (with balances). Cheap read from
  // plaid_accounts — does NOT call Plaid. Use /api/plaid/refresh to force
  // a live re-fetch from Plaid.
  router.get('/api/plaid/accounts', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id
      const result = await db.query(
        `SELECT id, plaid_account_id, plaid_item_id, name, official_name, mask,
                type, subtype, current_balance::text, available_balance::text,
                iso_currency_code, last_synced_at
         FROM plaid_accounts
         WHERE user_id = $1
         ORDER BY type, name`,
        [userId],
      )
      res.json({
        connected: !!(result.rows.length),
        configured: plaidConfigured(),
        accounts: result.rows.map((r: any) => ({
          id: r.id,
          plaidAccountId: r.plaid_account_id,
          plaidItemId: r.plaid_item_id,
          name: r.name,
          officialName: r.official_name,
          mask: r.mask,
          type: r.type,
          subtype: r.subtype,
          currentBalance: r.current_balance != null ? Number(r.current_balance) : null,
          availableBalance: r.available_balance != null ? Number(r.available_balance) : null,
          isoCurrencyCode: r.iso_currency_code,
          lastSyncedAt: r.last_synced_at,
        })),
      })
    } catch (e: any) {
      res.status(500).json({ error: e?.message?.slice(0, 200) || 'internal' })
    }
  })

  // Force a live re-fetch from Plaid → upsert balances. Used by the FE
  // refresh button. Same write path as /exchange except no token swap.
  router.post('/api/plaid/refresh', requireAuth, async (req, res) => {
    if (!plaidConfigured()) {
      return res.status(503).json({ error: 'Plaid not configured', configured: false })
    }
    try {
      const userId = (req as any).user.id
      const u = await db.query(
        'SELECT plaid_access_token FROM users WHERE id = $1',
        [userId],
      )
      const accessToken = u.rows[0]?.plaid_access_token
      if (!accessToken) return res.status(404).json({ error: 'No Plaid connection for this user' })

      const { getAccountsWithBalance } = await import('./plaid-client')
      const accounts = await getAccountsWithBalance(accessToken)
      for (const a of accounts) {
        await db.query(
          `UPDATE plaid_accounts
           SET current_balance = $1, available_balance = $2,
               iso_currency_code = $3, last_synced_at = now()
           WHERE user_id = $4 AND plaid_account_id = $5`,
          [a.current_balance, a.available_balance, a.iso_currency_code, userId, a.account_id],
        )
      }
      res.json({ ok: true, accountsRefreshed: accounts.length })
    } catch (e: any) {
      console.error('[plaid/refresh]', e?.message?.slice(0, 200))
      res.status(502).json({ error: 'refresh failed', detail: e?.message?.slice(0, 200) })
    }
  })

  // Unlink — clears the access_token + item_id from users and deletes all
  // plaid_accounts rows for this user. Plaid's /item/remove is best-effort
  // (we don't fail the disconnect if Plaid is unreachable; the user wants
  // it gone from our side, that's the source of truth they care about).
  router.delete('/api/plaid/connection', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id
      await db.query('DELETE FROM plaid_accounts WHERE user_id = $1', [userId])
      await db.query(
        'UPDATE users SET plaid_access_token = NULL, plaid_item_id = NULL WHERE id = $1',
        [userId],
      )
      res.json({ ok: true })
    } catch (e: any) {
      res.status(500).json({ error: e?.message?.slice(0, 200) || 'internal' })
    }
  })

  // ─── SD3 TRANSACTION SYNC DIAGNOSTIC (S35 M11) ───────────────────────────
  // Why this exists: when a user reports "balance synced but transactions
  // didn't", the cron-path sync only logs counts (inserted/updated/skipped).
  // We need to see WHICH SD3 items got rejected and WHY. This endpoint runs a
  // forced full-pull sync with diagnostics on, returning per-item skip reasons
  // + truncated raw SD3 payloads. Admin-key gated — never expose externally.

  router.post('/admin/api/issuer-tx-diagnose', requireAuthOrAdminKey, async (req, res) => {
    try {
      const userId = String(req.body?.userId || (req as any).user?.id || '').trim()
      if (!userId) return res.status(400).json({ error: 'userId required' })

      // First, sanity-check: does this user have an SD3 user id and at least
      // one card? Without these the sync will short-circuit and we won't see
      // anything useful.
      const u = await db.query(
        `SELECT id, sd3_user_id, issuer_user_id, last_tx_synced_at
         FROM users WHERE id = $1 LIMIT 1`,
        [userId]
      )
      if (!u.rows[0]) return res.status(404).json({ error: 'user not found' })

      const cards = await db.query(
        `SELECT id, issuer_card_id, last_4, status, balance::text
         FROM cards WHERE user_id = $1 AND is_active = true`,
        [userId]
      )

      const result = await syncIssuerTransactions(db, userId, {
        withDiagnostics: true,
        forceFullPull: !!req.body?.forceFullPull,
      })

      res.json({
        user: {
          id: u.rows[0].id,
          sd3UserId: u.rows[0].sd3_user_id || u.rows[0].issuer_user_id || null,
          lastTxSyncedAt: u.rows[0].last_tx_synced_at,
        },
        cardsLinked: cards.rows.map((r: any) => ({
          id: r.id,
          issuerCardId: r.issuer_card_id,
          last4: r.last_4,
          status: r.status,
          balance: Number(r.balance),
        })),
        sync: result,
      })
    } catch (e: any) {
      res.status(500).json({ error: e?.message?.slice(0, 200) || 'internal' })
    }
  })

  // ─── EXTERNAL AGENT CONNECTORS (S35 M11 Days 4-6) ────────────────────────
  // The "attach external agent" pillar from /skills. Users register their
  // Claude / OpenAI / LangChain / custom agent and get back an API key +
  // webhook secret. Their agent then POSTs events to /api/connectors/event
  // with `Authorization: Bearer <api-key>` and we land them in heimdall_events
  // dual-tagged with connected_agent_id so existing dashboards pick them up.

  // List my connected agents.
  router.get('/api/connectors/agent', requireAuth, async (req, res) => {
    try {
      const { listConnectedAgents } = await import('./connectors')
      const agents = await listConnectedAgents(db, (req as any).user.id)
      res.json({ agents })
    } catch (e: any) {
      res.status(500).json({ error: e?.message?.slice(0, 200) || 'internal' })
    }
  })

  // Get one of my connected agents (no API key — that's only shown at create
  // time and on rotate).
  router.get('/api/connectors/agent/:id', requireAuth, async (req, res) => {
    try {
      const { getConnectedAgent } = await import('./connectors')
      const agent = await getConnectedAgent(db, String(req.params.id), (req as any).user.id)
      if (!agent) return res.status(404).json({ error: 'Agent not found' })
      res.json({ agent })
    } catch (e: any) {
      res.status(500).json({ error: e?.message?.slice(0, 200) || 'internal' })
    }
  })

  // Register a new connected agent. Returns plaintext API key + webhook
  // secret ONCE. Caller MUST capture them — they're never recoverable.
  router.post('/api/connectors/agent', requireAuth, async (req, res) => {
    try {
      const { createConnectedAgent } = await import('./connectors')
      const result = await createConnectedAgent(db, {
        ownerUserId: (req as any).user.id,
        name: String(req.body?.name || ''),
        description: req.body?.description ? String(req.body.description) : undefined,
        agentType: req.body?.agentType,
        webhookUrl: req.body?.webhookUrl ? String(req.body.webhookUrl) : undefined,
        riskLimitUsd: req.body?.riskLimitUsd != null ? Number(req.body.riskLimitUsd) : undefined,
        dailyCapUsd: req.body?.dailyCapUsd != null ? Number(req.body.dailyCapUsd) : undefined,
        allowedMarkets: Array.isArray(req.body?.allowedMarkets) ? req.body.allowedMarkets : undefined,
        capabilities: Array.isArray(req.body?.capabilities) ? req.body.capabilities : undefined,
      })
      res.status(201).json(result)
    } catch (e: any) {
      const msg = e?.message?.slice(0, 200) || 'internal'
      const status = msg.includes('required') || msg.includes('too long') || msg.includes('must start') ? 400 : 500
      res.status(status).json({ error: msg })
    }
  })

  // Update connector policy / metadata.
  router.patch('/api/connectors/agent/:id', requireAuth, async (req, res) => {
    try {
      const { updateConnectedAgent } = await import('./connectors')
      const updated = await updateConnectedAgent(db, String(req.params.id), (req as any).user.id, {
        name: req.body?.name != null ? String(req.body.name) : undefined,
        description: req.body?.description !== undefined
          ? (req.body.description == null ? null : String(req.body.description))
          : undefined,
        webhookUrl: req.body?.webhookUrl !== undefined
          ? (req.body.webhookUrl == null ? null : String(req.body.webhookUrl))
          : undefined,
        riskLimitUsd: req.body?.riskLimitUsd != null ? Number(req.body.riskLimitUsd) : undefined,
        dailyCapUsd: req.body?.dailyCapUsd != null ? Number(req.body.dailyCapUsd) : undefined,
        allowedMarkets: Array.isArray(req.body?.allowedMarkets) ? req.body.allowedMarkets : undefined,
        capabilities: Array.isArray(req.body?.capabilities) ? req.body.capabilities : undefined,
        status: req.body?.status,
      })
      if (!updated) return res.status(404).json({ error: 'Agent not found' })
      res.json({ agent: updated })
    } catch (e: any) {
      res.status(500).json({ error: e?.message?.slice(0, 200) || 'internal' })
    }
  })

  // Rotate API key. Returns the NEW plaintext key (one-time view). Old key
  // stops working immediately — agents must re-authenticate.
  router.post('/api/connectors/agent/:id/rotate-key', requireAuth, async (req, res) => {
    try {
      const { rotateApiKey } = await import('./connectors')
      const out = await rotateApiKey(db, String(req.params.id), (req as any).user.id)
      if (!out) return res.status(404).json({ error: 'Agent not found' })
      res.json(out)
    } catch (e: any) {
      res.status(500).json({ error: e?.message?.slice(0, 200) || 'internal' })
    }
  })

  // Revoke (soft-delete: status=revoked).
  router.delete('/api/connectors/agent/:id', requireAuth, async (req, res) => {
    try {
      const { revokeConnectedAgent } = await import('./connectors')
      const ok = await revokeConnectedAgent(db, String(req.params.id), (req as any).user.id)
      if (!ok) return res.status(404).json({ error: 'Agent not found' })
      res.json({ ok: true })
    } catch (e: any) {
      res.status(500).json({ error: e?.message?.slice(0, 200) || 'internal' })
    }
  })

  // ── Event ingestion — auth via API key, NOT user JWT ─────────────────────
  // External agents authenticate with their api_key (Bearer token). We
  // resolve to a connected_agent row, then ingest the event into Helm
  // dual-tagged with connected_agent_id.

  router.post('/api/connectors/event', async (req, res) => {
    try {
      const auth = String(req.headers.authorization || '')
      const apiKey = auth.startsWith('Bearer ') ? auth.slice(7) : ''
      if (!apiKey) return res.status(401).json({ error: 'Missing Bearer token' })

      const { resolveByApiKey, ingestExternalEvent } = await import('./connectors')
      const agent = await resolveByApiKey(db, apiKey)
      if (!agent) return res.status(401).json({ error: 'Invalid or revoked API key' })
      if (agent.status === 'paused') {
        return res.status(403).json({ error: 'Agent paused — events not accepted' })
      }

      const subject = String(req.body?.subject || '').trim()
      if (!subject) return res.status(400).json({ error: 'subject required' })

      const result = await ingestExternalEvent(db, {
        agent,
        ruleId: req.body?.ruleId,
        category: req.body?.category,
        severity: req.body?.severity,
        subject,
        description: req.body?.description ? String(req.body.description) : undefined,
        payload: req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : undefined,
        dedupeKey: req.body?.dedupeKey ? String(req.body.dedupeKey).slice(0, 120) : undefined,
      })
      res.status(201).json(result)
    } catch (e: any) {
      res.status(500).json({ error: e?.message?.slice(0, 200) || 'internal' })
    }
  })

  // Event list for one agent — used by the FE detail page.
  router.get('/api/connectors/agent/:id/events', requireAuth, async (req, res) => {
    try {
      const { getConnectedAgent } = await import('./connectors')
      const agent = await getConnectedAgent(db, String(req.params.id), (req as any).user.id)
      if (!agent) return res.status(404).json({ error: 'Agent not found' })

      const limit = Math.min(Math.max(parseInt(String(req.query.limit || '50'), 10) || 50, 1), 250)
      const evs = await db.query(
        `SELECT id, rule_id, category, severity, subject, context, occurred_at
         FROM heimdall_events
         WHERE connected_agent_id = $1
         ORDER BY occurred_at DESC
         LIMIT $2`,
        [agent.id, limit],
      )
      res.json({ events: evs.rows })
    } catch (e: any) {
      res.status(500).json({ error: e?.message?.slice(0, 200) || 'internal' })
    }
  })

  // Webhook-delivery history for one agent (Day-7 / external connector polish).
  // Pulled from execution_log so we don't need a new table. Each row reflects
  // one POST attempt to the agent's webhook_url with HTTP status + retry count.
  router.get('/api/connectors/agent/:id/webhook-deliveries', requireAuth, async (req, res) => {
    try {
      const { getConnectedAgent } = await import('./connectors')
      const agent = await getConnectedAgent(db, String(req.params.id), (req as any).user.id)
      if (!agent) return res.status(404).json({ error: 'Agent not found' })

      const limit = Math.min(Math.max(parseInt(String(req.query.limit || '50'), 10) || 50, 1), 200)
      const r = await db.query(
        `SELECT id, action AS event_type, status, detail, created_at
         FROM execution_log
         WHERE entity_type = 'connector_webhook' AND entity_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [agent.id, limit],
      )
      res.json({
        deliveries: r.rows.map((row) => {
          let parsed: Record<string, unknown> | null = null
          try { parsed = JSON.parse(row.detail) } catch { /* ignore */ }
          return {
            id: row.id,
            eventType: row.event_type,
            status: row.status,
            createdAt: row.created_at,
            httpStatus: parsed?.httpStatus ?? null,
            attempts: parsed?.attempts ?? null,
            detail: parsed?.detail ?? null,
            subject: parsed?.subject ?? null,
            eventId: parsed?.eventId ?? null,
            ruleId: parsed?.ruleId ?? null,
            decision: parsed?.decision ?? null,
          }
        }),
      })
    } catch (e: any) {
      res.status(500).json({ error: e?.message?.slice(0, 200) || 'internal' })
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // MCP (Model Context Protocol) — BYOK agent surface
  // ═══════════════════════════════════════════════════════════════════════════
  // External AI clients (Claude Desktop, Claude Code, Cursor, ChatGPT custom
  // GPT, etc) authenticate via Bearer API key + call tool endpoints to query
  // the user's Nuro account. Companion to the per-card agent chat UI (which
  // will run on top of these same tools internally).
  //
  // Frontend Next.js MCP endpoint at /api/mcp accepts JSON-RPC envelope,
  // resolves auth via /mcp/auth/resolve, dispatches tools via /mcp/tools/dispatch.
  //
  // Migration: src/migrations/050_nuro_mcp_keys.sql (must be applied first).

  // ─── /mcp/auth/resolve ─────────────────────────────────────────────────
  // Frontend Next.js process hashed the raw bearer token (SHA-256), POSTs
  // the hash here, we look up the matching row + return user_id + scopes.
  router.post('/mcp/auth/resolve', async (req, res) => {
    const { key_hash } = req.body || {}
    if (typeof key_hash !== 'string' || !/^[a-f0-9]{64}$/.test(key_hash)) {
      return res.status(400).json({ ok: false, error: 'invalid key_hash' })
    }
    try {
      const r = await db.query(
        `SELECT id, user_id, name, scopes
         FROM nuro_mcp_keys
         WHERE key_hash = $1 AND revoked_at IS NULL`,
        [key_hash]
      )
      if (!r.rows[0]) return res.status(401).json({ ok: false, error: 'key not found or revoked' })
      // Stamp last_used_at (fire-and-forget; non-blocking)
      db.query('UPDATE nuro_mcp_keys SET last_used_at = now() WHERE id = $1', [r.rows[0].id])
        .catch((e) => console.warn('[mcp] last_used update failed:', e?.message))
      res.json({
        ok: true,
        user_id: r.rows[0].user_id,
        key_id: r.rows[0].id,
        key_name: r.rows[0].name,
        scopes: r.rows[0].scopes ?? ['read'],
      })
    } catch (e: any) {
      console.error('[mcp/auth/resolve] error:', e?.message)
      res.status(500).json({ ok: false, error: 'internal' })
    }
  })

  // ─── /mcp/tools/dispatch ───────────────────────────────────────────────
  // Tool dispatch. Called by the Next.js MCP route AFTER auth resolved
  // (so we trust user_id from the body — never accept user_id over the
  // network without going through /mcp/auth/resolve first).
  router.post('/mcp/tools/dispatch', async (req, res) => {
    const { tool_name, args, user_id, key_id, scopes } = req.body || {}
    if (!tool_name || !user_id) {
      return res.status(400).json({ ok: false, error: 'missing tool_name or user_id' })
    }

    try {
      switch (tool_name) {
        case 'get_balance': {
          const r = await db.query(
            `SELECT id, card_type, balance, is_active, is_locked FROM cards WHERE user_id = $1`,
            [user_id]
          )
          const total = r.rows.reduce((s, c) => s + Number(c.balance ?? 0), 0)
          return res.json({
            ok: true,
            content: {
              total_balance_usd: Math.round(total * 100) / 100,
              currency: 'USD',
              cards_count: r.rows.length,
              per_card: r.rows.map((c) => ({
                card_id: c.id,
                card_name: c.card_type,
                balance_usd: Number(c.balance ?? 0),
                active: !!c.is_active,
                locked: !!c.is_locked,
              })),
            },
          })
        }

        case 'get_cards': {
          const r = await db.query(
            `SELECT id, card_type, balance, daily_limit, is_active, is_locked, created_at,
                    issuer_card_id
             FROM cards WHERE user_id = $1
             ORDER BY created_at DESC`,
            [user_id]
          )
          return res.json({
            ok: true,
            content: {
              cards: r.rows.map((c) => ({
                card_id: c.id,
                card_name: c.card_type,
                balance_usd: Number(c.balance ?? 0),
                daily_limit_usd: Number(c.daily_limit ?? 0),
                active: !!c.is_active,
                locked: !!c.is_locked,
                created_at: c.created_at,
                provisioned: !!c.issuer_card_id,
              })),
            },
          })
        }

        case 'get_recent_transactions': {
          const limit = Math.min(Math.max(Number(args?.limit) || 20, 1), 100)
          const params: any[] = [user_id]
          let where = 'WHERE t.user_id = $1'
          if (args?.card_id) { params.push(args.card_id); where += ` AND t.card_id = $${params.length}` }
          if (args?.since) { params.push(args.since); where += ` AND t.date >= $${params.length}` }
          params.push(limit)
          const r = await db.query(
            `SELECT t.id, t.card_id, t.name, t.amount, t.is_incoming, t.category, t.status,
                    t.merchant_name, t.date, t.transaction_type
             FROM card_transactions t
             ${where}
             ORDER BY t.date DESC, t.created_at DESC
             LIMIT $${params.length}`,
            params
          )
          return res.json({
            ok: true,
            content: {
              transactions: r.rows.map((t) => ({
                id: t.id,
                card_id: t.card_id,
                name: t.name,
                merchant: t.merchant_name,
                amount_usd: Number(t.amount ?? 0),
                direction: t.is_incoming ? 'incoming' : 'outgoing',
                category: t.category,
                status: t.status,
                date: t.date,
                type: t.transaction_type,
              })),
              count: r.rows.length,
            },
          })
        }

        case 'get_spending_summary': {
          const window = args?.window ?? '30d'
          const groupBy = args?.group_by === 'merchant' ? 'merchant_name' : 'category'
          const days = window === '7d' ? 7 : window === '90d' ? 90 : 30
          const r = await db.query(
            `SELECT COALESCE(${groupBy}, 'uncategorized') AS bucket,
                    SUM(amount)::float AS total,
                    COUNT(*) AS tx_count
             FROM card_transactions
             WHERE user_id = $1
               AND is_incoming = false
               AND date >= now() - $2::interval
             GROUP BY bucket
             ORDER BY total DESC`,
            [user_id, `${days} days`]
          )
          const totalSpend = r.rows.reduce((s, b) => s + Number(b.total ?? 0), 0)
          return res.json({
            ok: true,
            content: {
              window,
              group_by: args?.group_by ?? 'category',
              total_spend_usd: Math.round(totalSpend * 100) / 100,
              breakdown: r.rows.map((b) => ({
                bucket: b.bucket,
                total_usd: Math.round(Number(b.total ?? 0) * 100) / 100,
                tx_count: Number(b.tx_count ?? 0),
                pct_of_total: totalSpend > 0
                  ? Math.round((Number(b.total ?? 0) / totalSpend) * 1000) / 10
                  : 0,
              })),
            },
          })
        }

        case 'set_card_limit':
        case 'freeze_card': {
          // Write-tool confirmation-token dance.
          // If no confirmation_code: generate one, store, return to AI.
          // If confirmation_code present: verify + execute.
          if (!scopes?.includes('write')) {
            return res.json({ ok: false, error: 'this key does not have write scope' })
          }
          const code = args?.confirmation_code
          if (!code) {
            // First call → generate a code, store, return it
            const newCode = String(Math.floor(100000 + Math.random() * 900000))
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000)
            await db.query(
              `INSERT INTO nuro_mcp_write_confirmations
                 (mcp_key_id, user_id, tool_name, tool_args, confirmation_code, expires_at)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [key_id, user_id, tool_name, JSON.stringify(args ?? {}), newCode, expiresAt]
            )
            return res.json({
              ok: true,
              content: {
                requires_confirmation: true,
                confirmation_code: newCode,
                expires_in_seconds: 300,
                message: `To actually execute ${tool_name}, ask the user to confirm with code ${newCode}, then call ${tool_name} again with confirmation_code: "${newCode}".`,
              },
            })
          }
          // Second call → verify code, execute
          const cr = await db.query(
            `SELECT id, tool_args FROM nuro_mcp_write_confirmations
             WHERE user_id = $1 AND tool_name = $2 AND confirmation_code = $3
               AND used_at IS NULL AND expires_at > now()
             ORDER BY created_at DESC LIMIT 1`,
            [user_id, tool_name, code]
          )
          if (!cr.rows[0]) {
            return res.json({ ok: false, error: 'invalid, expired, or already-used confirmation_code' })
          }
          const stored = typeof cr.rows[0].tool_args === 'string'
            ? JSON.parse(cr.rows[0].tool_args)
            : cr.rows[0].tool_args
          // Execute the actual change
          let result: any
          if (tool_name === 'set_card_limit') {
            const limitField = stored.limit_type === 'monthly' ? 'monthly_limit' : 'daily_limit'
            await db.query(
              `INSERT INTO card_controls (card_id, ${limitField}, updated_at)
               VALUES ($1, $2, now())
               ON CONFLICT (card_id) DO UPDATE SET ${limitField} = EXCLUDED.${limitField}, updated_at = now()`,
              [stored.card_id, stored.new_limit_usd]
            )
            result = { card_id: stored.card_id, [limitField + '_usd']: stored.new_limit_usd, applied_at: new Date().toISOString() }
          } else { // freeze_card
            await db.query(
              `UPDATE cards SET is_locked = true WHERE id = $1 AND user_id = $2`,
              [stored.card_id, user_id]
            )
            result = { card_id: stored.card_id, frozen: true, applied_at: new Date().toISOString() }
          }
          await db.query(
            `UPDATE nuro_mcp_write_confirmations SET used_at = now(), result = $1 WHERE id = $2`,
            [JSON.stringify(result), cr.rows[0].id]
          )
          return res.json({ ok: true, content: { applied: true, ...result } })
        }

        default:
          return res.json({ ok: false, error: `unknown tool: ${tool_name}` })
      }
    } catch (e: any) {
      console.error('[mcp/tools/dispatch] error:', e?.message)
      return res.json({ ok: false, error: e?.message?.slice(0, 200) ?? 'internal' })
    }
  })

  // ─── /mcp/keys/generate ────────────────────────────────────────────────
  // Authenticated user generates a new MCP key. We hash the key and store
  // ONLY the hash + prefix; the raw key is returned to the user ONCE.
  router.post('/mcp/keys/generate', requireAuth, async (req: any, res) => {
    const userId = req.user.id
    const name = String(req.body?.name || 'Default Key').slice(0, 80)
    const scopes = Array.isArray(req.body?.scopes)
      ? req.body.scopes.filter((s: any) => s === 'read' || s === 'write')
      : ['read', 'write']
    try {
      const { randomBytes, createHash } = require('crypto')
      const rawHex = randomBytes(16).toString('hex')
      const rawKey = 'nuro_mcp_' + rawHex
      const keyHash = createHash('sha256').update(rawKey).digest('hex')
      const keyPrefix = rawHex.slice(0, 8)
      const r = await db.query(
        `INSERT INTO nuro_mcp_keys (user_id, key_hash, key_prefix, name, scopes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, key_prefix, name, scopes, created_at`,
        [userId, keyHash, keyPrefix, name, scopes]
      )
      // raw_key returned ONLY HERE — never again
      res.json({
        ok: true,
        key: { ...r.rows[0], raw_key: rawKey },
        warning: 'Save this key now. It will not be shown again.',
      })
    } catch (e: any) {
      console.error('[mcp/keys/generate]', e?.message)
      res.status(500).json({ ok: false, error: e?.message?.slice(0, 200) ?? 'internal' })
    }
  })

  // ─── /mcp/keys (list) ──────────────────────────────────────────────────
  router.get('/mcp/keys', requireAuth, async (req: any, res) => {
    const userId = req.user.id
    try {
      const r = await db.query(
        `SELECT id, key_prefix, name, scopes, created_at, last_used_at
         FROM nuro_mcp_keys
         WHERE user_id = $1 AND revoked_at IS NULL
         ORDER BY created_at DESC`,
        [userId]
      )
      res.json({ ok: true, keys: r.rows })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message?.slice(0, 200) ?? 'internal' })
    }
  })

  // ─── /mcp/keys/:id (revoke) ───────────────────────────────────────────
  router.delete('/mcp/keys/:id', requireAuth, async (req: any, res) => {
    const userId = req.user.id
    const keyId = req.params.id
    try {
      const r = await db.query(
        `UPDATE nuro_mcp_keys SET revoked_at = now() WHERE id = $1 AND user_id = $2 RETURNING id`,
        [keyId, userId]
      )
      if (!r.rows[0]) return res.status(404).json({ ok: false, error: 'key not found' })
      res.json({ ok: true, revoked: r.rows[0].id })
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message?.slice(0, 200) ?? 'internal' })
    }
  })

  return router
}

/**
 * Normalize a card_controls DB row into the shape the FE hook expects.
 *
 * Two reasons this exists:
 *   1. The DB column is `per_transaction_limit` but the FE hook (and old
 *      Chris-shipped components) read `per_tx_limit`. The PATCH handler
 *      already accepts both spellings on the way IN; this normalizer
 *      symmetrically exposes both spellings on the way OUT, so the FE
 *      hook's `controls.per_tx_limit` actually carries the persisted
 *      value instead of staying frozen at the DEFAULTS-table 10000.
 *
 *   2. node-pg returns `numeric` as a string ("1000.00"). The FE renders
 *      via `.toLocaleString()`, which on a string is a no-op (returns the
 *      raw string with no thousands separator). Coercing to number here
 *      keeps the FE simple and the displayed value formatted.
 *
 * Robust to a `null` row -- returns null untouched. Callers should
 * normally not see null since both GET and PATCH upsert the row first.
 */
function rowToCardControls(r: any) {
  if (!r) return r;
  const num = (v: any) => (v == null ? v : Number(v));
  return {
    id: r.id,
    card_id: r.card_id,
    user_id: r.user_id,
    daily_limit: num(r.daily_limit),
    daily_used: num(r.daily_used),
    monthly_limit: num(r.monthly_limit),
    monthly_used: num(r.monthly_used),
    daily_reset_at: r.daily_reset_at,
    monthly_reset_at: r.monthly_reset_at,
    // Both spellings exposed -- FE hook reads `per_tx_limit`, anything
    // else integrating directly with the DB shape gets `per_transaction_limit`.
    per_transaction_limit: num(r.per_transaction_limit),
    per_tx_limit: num(r.per_transaction_limit),
    velocity_per_hr: num(r.velocity_per_hr),
    alert_threshold: num(r.alert_threshold),
    alert_enabled: r.alert_enabled,
    intl_enabled: r.intl_enabled,
    online_enabled: r.online_enabled,
    atm_enabled: r.atm_enabled,
    contactless_enabled: r.contactless_enabled,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

function rowToCard(r: any) {
  // S33 Tier 0 #2: cardNumber field on the API surface now carries the
  // MASKED form ('•••• 1234'). Full PAN is only ever delivered via
  // /cards/:id/secrets which proxies SD3 directly under rate-limit + audit
  // (Tier 0 #3). The FE's existing `c.cardNumber || c.card_number` fallback
  // chains continue to work — they just receive masked values now.
  const last4 = r.card_last_4 || (r.card_number ? String(r.card_number).slice(-4) : null)
  return {
    id:         r.id,
    cardNumber: last4 ? `•••• ${last4}` : null,
    cardHolder: r.card_holder,
    expiryDate: r.expiry_date,
    cardType:   r.card_type,
    gradient:   r.gradient,
    balance:    parseFloat(r.balance),
    isActive:   r.is_active,
    isLocked:   r.is_locked,
    cardName:   r.card_name ?? null,
    alertEnabled: r.alert_enabled ?? true,
    spendThreshold: r.spend_threshold ? parseFloat(r.spend_threshold) : 500,
    // Day-4 fix: expose whether this card is linked to an SD3 issuer card.
    // FE uses this to compute the total wallet balance from REAL cards only —
    // phantom deck-stack cards have a balance for visual purposes but should
    // NOT be summed into the displayed account total.
    isIssuerLinked: !!r.issuer_card_id,
    // Session 27 — balance freshness metadata so FE can render a
    // "last synced X ago" indicator. `balance_synced_at` reflects the
    // last SUCCESSFUL SD3 balance fetch; if rate-limited (429/503), the
    // timestamp stays stale and balance_source stays 'issuer_sync:*'.
    balanceSyncedAt: r.balance_synced_at ?? null,
    balanceSource:   r.balance_source ?? null,
    balanceLastDrift: r.balance_last_drift != null ? parseFloat(r.balance_last_drift) : null,
  }
}

const CHAIN_ID_NAMES: Record<number, string> = {
  0: 'Solana', 1: 'Ethereum', 8453: 'Base', 42161: 'Arbitrum', 10: 'Optimism',
  137: 'Polygon', 43114: 'Avalanche', 56: 'BSC', 324: 'zkSync', 534352: 'Scroll',
  59144: 'Linea', 146: 'Sonic', 130: 'Unichain', 480: 'World Chain', 999: 'HyperEVM',
  42220: 'Celo', 100: 'Gnosis', 57073: 'Ink', 81224: 'Codex', 143: 'Monad',
  50: 'XDC', 98866: 'Plume', 1329: 'Sei',
}

function chainIdToName(chainId: number | null): string {
  if (chainId === null || chainId === undefined) return 'Unknown'
  return CHAIN_ID_NAMES[chainId] || `Chain ${chainId}`
}

function rowToTransaction(r: any) {
  return {
    id:          r.id,
    // Sprint 2.4: prefer merchant_name for real Visa spends, fall back to
    // our own `name` field for bridge deposits / P2P transfers / etc.
    name:        r.merchant_name || r.name,
    type:        r.type,
    amount:      parseFloat(r.amount),
    isIncoming:  r.is_incoming,
    date:        r.date instanceof Date ? r.date.toISOString() : r.date,
    category:    r.category,
    status:      r.status,
    cardId:      r.card_id,
    txHash:      r.tx_hash,
    sourceChain: r.source_chain ?? null,
    destChain:   r.dest_chain ?? null,
    token:       r.token ?? null,
    // Sprint 2.4 — SD3 Visa-spend metadata
    merchantName:        r.merchant_name ?? null,
    merchantCategoryRaw: r.merchant_category_raw ?? null,
    transactionType:     r.transaction_type ?? null,
    issuerTransactionId: r.issuer_transaction_id ?? null,
    sourceVerified:      r.source_verified ?? false,
  }
}

// No fake card numbers — Issuer provides real card details after creation.
// Placeholders are used until Issuer responds with actual PAN/expiry.
function placeholderCardNumber(): string {
  return '**** **** **** ****'
}

function placeholderExpiryDate(): string {
  return '--/--'
}
