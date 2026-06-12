/**
 * KYC status normalization — shared between backend routes (Express) and
 * frontend components (Next.js client).
 *
 * Context: Issuer sends KYC status under different labels depending on lifecycle
 * stage (`verified`, `kyc_complete`, `passed`, `approved`, etc.). The webhook
 * handler at src/index.ts already normalizes the WRITE path so new rows get
 * the canonical `approved`. But existing rows from before that fix landed
 * (2026-05-25 commit e6f90a3) still have raw values like `kyc_complete` or
 * `verified`. The READ path needs to defensively normalize too so the
 * "Verify your identity" banner and CardDetails gate stop showing for
 * already-verified users.
 *
 * Pattern: keep the canonical set in ONE place. Both the read endpoints
 * (/users/me and /kyc/status) and the consumer components import from here.
 */

/**
 * All status labels that mean "this user is KYC-cleared." Matches the set
 * used by the webhook normalizer at src/index.ts line ~338. If Issuer adds new
 * synonyms in the future, add them here.
 */
export const KYC_VERIFIED_LABELS: ReadonlySet<string> = new Set([
  "approved",
  "active",
  "verified",
  "kyc_complete",
  "kyc-complete",
  "kyccomplete",
  "complete",
  "completed",
  "passed",
]);

/**
 * Returns true if the given status string means "verified" under any of Issuer's
 * known spellings. Null/undefined/empty all return false (not verified).
 */
export function isKycVerified(status: string | null | undefined): boolean {
  if (!status) return false;
  return KYC_VERIFIED_LABELS.has(status.toLowerCase().trim());
}

/**
 * Normalize any "verified" synonym to the canonical `approved`. Non-verified
 * statuses are lowercased + trimmed but otherwise passed through (preserves
 * `pending`, `rejected`, `not_started`, etc.). Null/undefined returns null.
 */
export function normalizeKycStatus(status: string | null | undefined): string | null {
  if (!status) return null;
  const lower = String(status).toLowerCase().trim();
  return KYC_VERIFIED_LABELS.has(lower) ? "approved" : lower;
}
