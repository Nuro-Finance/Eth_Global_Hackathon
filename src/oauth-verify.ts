// ─────────────────────────────────────────────────────────────────────────────
// OAuth id_token verification - trust-boundary hardening for /auth/social-login.
//
// Why this file exists:
// The original /auth/social-login accepted {email, name} from the FE and
// trusted them because "the FE just did the OAuth handshake." That trust is
// only valid if the FE is the sole caller AND isn't compromised. Anyone
// with the backend URL could otherwise mint a JWT for any email address.
//
// This module replaces that trust with cryptographic proof: the FE forwards
// Google's id_token (a JWT signed by Google's private key), and we verify
// the signature against Google's public keys (JWKS endpoint) before
// accepting the claims inside.
//
// What a valid Google id_token proves to us:
// - `email` - the user controls this email address (Google confirmed it)
// - `email_verified === true` - ditto, Google's stronger assertion
// - `aud === GOOGLE_CLIENT_ID` - this token was issued FOR OUR APP, not
// another app's token being replayed against us
// - `iss === accounts.google.com` - token came from Google, not an impostor
// - `exp > now` - token not expired
// - `sub` - stable unique Google user ID (for future external_id storage)
//
// Provider-agnostic: the verifier is keyed on provider name. Adding Apple /
// Microsoft / GitHub later = one more entry in PROVIDER_CONFIG + one more
// jwksClient.
// ─────────────────────────────────────────────────────────────────────────────

import * as jwt from 'jsonwebtoken'
import { JwksClient } from 'jwks-rsa'

type ProviderName = 'google'

interface ProviderConfig {
  jwksUri: string
 // Accepted `iss` claim values. Non-empty tuple type matches jwt.verify()
 // signature which requires at least one issuer when provided.
  issuers: [string, ...string[]]
  audienceEnvVar: string // env var holding our OAuth client ID (the `aud` we require)
}

const PROVIDER_CONFIG: Record<ProviderName, ProviderConfig> = {
  google: {
    jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
    issuers: ['https://accounts.google.com', 'accounts.google.com'],
    audienceEnvVar: 'GOOGLE_CLIENT_ID',
  },
}

// Per-provider JWKS client cache. jwks-rsa handles key-fetch + in-memory
// caching (default 10 min TTL, respects Cache-Control). We only construct
// one client per provider and hold it for the life of the process.
const jwksClients: Partial<Record<ProviderName, JwksClient>> = {}

function getJwksClient(provider: ProviderName): JwksClient {
  let client = jwksClients[provider]
  if (!client) {
    client = new JwksClient({
      jwksUri: PROVIDER_CONFIG[provider].jwksUri,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 10 * 60 * 1000, // 10 minutes
      rateLimit: true,
      jwksRequestsPerMinute: 10,
      timeout: 5000,
    })
    jwksClients[provider] = client
  }
  return client
}

export interface VerifiedIdToken {
  provider: ProviderName
  email: string
  emailVerified: boolean
  name: string
  externalId: string // `sub` - provider's stable user ID
  picture?: string
}

export class OAuthVerifyError extends Error {
  constructor(message: string, public code: string) {
    super(message)
    this.name = 'OAuthVerifyError'
  }
}

/**
 * Verify a provider id_token end-to-end:
 * 1. Parse header to get `kid` + `alg`
 * 2. Fetch matching signing key from provider's JWKS
 * 3. jwt.verify with signature, issuer, audience, expiry checks
 * 4. Post-verification: require email_verified + presence of email
 *
 * Throws OAuthVerifyError with a stable `code` for the caller to map to
 * HTTP status. Never logs the token itself.
 */
export async function verifyIdToken(
  provider: ProviderName,
  idToken: string
): Promise<VerifiedIdToken> {
  const cfg = PROVIDER_CONFIG[provider]
  if (!cfg) {
    throw new OAuthVerifyError(`Unsupported provider: ${provider}`, 'unsupported_provider')
  }

  const audience = process.env[cfg.audienceEnvVar]
  if (!audience) {
 // Fail closed - missing env means we cannot enforce audience → anyone's
 // Google token would pass. This must be a 500, not a 401.
    throw new OAuthVerifyError(
      `Missing ${cfg.audienceEnvVar} env var - cannot verify audience`,
      'server_misconfigured'
    )
  }

 // Parse header without verifying (we need `kid` to look up the key).
  const decoded = jwt.decode(idToken, { complete: true })
  if (!decoded || typeof decoded === 'string' || !decoded.header?.kid) {
    throw new OAuthVerifyError('Malformed id_token', 'malformed_token')
  }

  let signingKey: string
  try {
    const client = getJwksClient(provider)
    const key = await client.getSigningKey(decoded.header.kid)
    signingKey = key.getPublicKey()
  } catch (err: any) {
    throw new OAuthVerifyError(
      `Failed to fetch signing key: ${err.message}`,
      'jwks_fetch_failed'
    )
  }

  let payload: any
  try {
    payload = jwt.verify(idToken, signingKey, {
      algorithms: ['RS256'],
      issuer: cfg.issuers,
      audience,
 // jwt.verify enforces exp by default
    })
  } catch (err: any) {
 // jsonwebtoken throws typed errors: TokenExpiredError, JsonWebTokenError (sig/issuer/audience)
    const code =
      err?.name === 'TokenExpiredError'
        ? 'token_expired'
        : err?.message?.includes('audience')
        ? 'audience_mismatch'
        : err?.message?.includes('issuer')
        ? 'issuer_mismatch'
        : 'signature_invalid'
    throw new OAuthVerifyError(`id_token verification failed: ${err?.message}`, code)
  }

 // Post-signature semantic checks
  if (!payload.email) {
    throw new OAuthVerifyError('id_token missing email claim', 'missing_email')
  }
  if (payload.email_verified !== true) {
 // Google sets this false when the user's email isn't confirmed. Refuse -
 // we'd otherwise let someone claim an email they don't control.
    throw new OAuthVerifyError('Email not verified by provider', 'email_not_verified')
  }
  if (!payload.sub) {
    throw new OAuthVerifyError('id_token missing sub claim', 'missing_sub')
  }

  return {
    provider,
    email: payload.email,
    emailVerified: true,
    name: payload.name || payload.email,
    externalId: payload.sub,
    picture: payload.picture || undefined,
  }
}
