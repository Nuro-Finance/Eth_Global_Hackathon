/**
 * POST /api/assistant/verify-key
 *
 * Validates a Bring-Your-Own-Key (BYOK) API key against the upstream provider
 * by making a minimal authenticated request. Returns { ok: boolean, error?: string }.
 *
 * Security model:
 *   - The key is sent in the request body (over HTTPS)
 *   - We never log the key value, only the verification outcome
 *   - We never persist the key server-side — frontend stores it in localStorage
 *   - The validation request itself is read-only (lists models / counts tokens)
 *     and uses no tokens / dollars on the user's account
 *
 * Dev bypass: `apiKey === "1234"` for any provider returns ok=true. Used for
 * recording demos and screenshots without burning real credits. The frontend
 * also short-circuits this client-side for the same reason.
 */

import type { NextRequest } from "next/server";

type Provider = "openai" | "anthropic" | "gemini";

const VALID_PROVIDERS: Provider[] = ["openai", "anthropic", "gemini"];

function isProvider(x: unknown): x is Provider {
  return typeof x === "string" && (VALID_PROVIDERS as string[]).includes(x);
}

interface VerifyResult {
  ok: boolean;
  error?: string;
}

/**
 * OpenAI: GET /v1/models with the api key — returns 200 + model list if valid,
 * 401 if invalid, 429 if rate-limited (counts as valid). Free check, no tokens.
 */
async function verifyOpenAi(apiKey: string): Promise<VerifyResult> {
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, error: "Invalid OpenAI API key" };
    if (res.status === 429) return { ok: true }; // valid key, just rate-limited
    const text = await res.text().catch(() => "");
    return { ok: false, error: `OpenAI verify HTTP ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}` };
  } catch (e: any) {
    return { ok: false, error: `OpenAI verify network error: ${e?.message?.slice(0, 80) ?? "unknown"}` };
  }
}

/**
 * Anthropic: GET /v1/models with the api key. Same shape as OpenAI — Anthropic
 * accepts x-api-key header (not Bearer) plus an anthropic-version header.
 * Returns the public model list on 200; 401 / 403 if invalid.
 */
async function verifyAnthropic(apiKey: string): Promise<VerifyResult> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    });
    if (res.ok) return { ok: true };
    if (res.status === 401 || res.status === 403)
      return { ok: false, error: "Invalid Anthropic API key" };
    if (res.status === 429) return { ok: true };
    const text = await res.text().catch(() => "");
    return { ok: false, error: `Anthropic verify HTTP ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}` };
  } catch (e: any) {
    return { ok: false, error: `Anthropic verify network error: ${e?.message?.slice(0, 80) ?? "unknown"}` };
  }
}

/**
 * Gemini: GET /v1beta/models?key={apiKey}. Different auth model — Google uses
 * a query-string key for these public ListModels calls. Returns 200 with the
 * model catalog when valid, 400/403 with "API key not valid" when invalid.
 */
async function verifyGemini(apiKey: string): Promise<VerifyResult> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    if (res.ok) return { ok: true };
    if (res.status === 400 || res.status === 401 || res.status === 403)
      return { ok: false, error: "Invalid Gemini API key" };
    if (res.status === 429) return { ok: true };
    const text = await res.text().catch(() => "");
    return { ok: false, error: `Gemini verify HTTP ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}` };
  } catch (e: any) {
    return { ok: false, error: `Gemini verify network error: ${e?.message?.slice(0, 80) ?? "unknown"}` };
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const provider = (body as { provider?: unknown })?.provider;
  const apiKey = (body as { apiKey?: unknown })?.apiKey;

  if (!isProvider(provider)) {
    return Response.json({ ok: false, error: "Unknown provider" }, { status: 400 });
  }
  if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
    return Response.json({ ok: false, error: "API key is required" }, { status: 400 });
  }

  const trimmed = apiKey.trim();

  // Dev bypass — matches FE convention for recording demos without burning
  // credits. MUST come before any minimum-length / format check so the
  // 4-char "1234" sentinel actually works.
  if (trimmed === "1234") return Response.json({ ok: true });

  // Sanity floor for real keys: every supported provider's keys are >= ~30
  // chars, so anything shorter than 10 is clearly a fat-finger paste.
  if (trimmed.length < 10) {
    return Response.json({ ok: false, error: "API key looks too short" }, { status: 400 });
  }

  let result: VerifyResult;
  if (provider === "openai") result = await verifyOpenAi(trimmed);
  else if (provider === "anthropic") result = await verifyAnthropic(trimmed);
  else result = await verifyGemini(trimmed);

  // Always 200 with body — the FE distinguishes via `ok` field. Reserves
  // non-200 status codes for malformed-request cases (above).
  return Response.json(result, { status: 200 });
}
