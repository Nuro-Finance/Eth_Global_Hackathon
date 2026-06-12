/**
 * MCP API key auth helpers.
 *
 * Authenticates external AI clients (Claude Desktop, Claude Code, Cursor,
 * ChatGPT custom GPT, etc.) hitting Nuro's MCP server via Bearer token.
 *
 * Key format: `nuro_mcp_<32-char-hex>`
 *   - `nuro_mcp_` prefix = quick identification + safe to log
 *   - 32 hex chars = 128 bits of entropy
 *
 * Storage model: only SHA-256 hash of the raw key lands in the DB. Raw key
 * is shown to the user ONCE at generation; lost = revoke + regenerate.
 */

import { createHash, randomBytes } from "crypto";

const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000";

export const MCP_KEY_PREFIX = "nuro_mcp_";

export function generateRawMcpKey(): string {
  return MCP_KEY_PREFIX + randomBytes(16).toString("hex");
}

export function hashMcpKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

/**
 * Extract a `Bearer nuro_mcp_<hex>` token from an incoming request's
 * Authorization header. Returns null on any malformed input.
 */
export function extractMcpToken(authHeader: string | null | undefined): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(nuro_mcp_[a-f0-9]{32})$/i);
  return match ? match[1] : null;
}

export interface McpAuthResult {
  ok: boolean;
  user_id?: string;
  key_id?: string;
  key_name?: string;
  scopes?: string[];
  error?: string;
}

/**
 * Resolve a raw MCP key to a user_id via the backend's lookup endpoint.
 * Returns ok=false with an error message on any failure (bad key, revoked,
 * network issue, etc).
 *
 * The backend endpoint:
 *   POST /mcp/auth/resolve
 *   Body: { key_hash }
 *   Returns: { ok, user_id, key_id, key_name, scopes } OR { ok: false, error }
 *
 * We do the hashing client-side (here, in this Next.js process) so the raw
 * key never leaves this request handler's memory.
 */
export async function resolveMcpKey(rawKey: string): Promise<McpAuthResult> {
  if (!rawKey.startsWith(MCP_KEY_PREFIX)) {
    return { ok: false, error: "invalid key format" };
  }
  const key_hash = hashMcpKey(rawKey);

  try {
    const r = await fetch(`${BACKEND_URL}/mcp/auth/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key_hash }),
    });
    if (!r.ok) {
      return { ok: false, error: `backend resolve failed: ${r.status}` };
    }
    const data = await r.json();
    if (!data?.ok) {
      return { ok: false, error: data?.error ?? "unauthorized" };
    }
    return {
      ok: true,
      user_id: data.user_id,
      key_id: data.key_id,
      key_name: data.key_name,
      scopes: data.scopes ?? ["read"],
    };
  } catch (err) {
    return { ok: false, error: `network error: ${String(err)}` };
  }
}
