/**
 * MCP key management — proxy to backend `/mcp/keys`.
 *
 * Authenticated via the user's normal session token (NextAuth). The user-facing
 * surface for generating + listing + revoking keys; what the user pastes into
 * their AI client config.
 *
 * Does NOT use the bearer-token middleware (that's for AI clients calling
 * /api/mcp, this is for the user themselves managing their keys in the
 * dashboard).
 */

import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  try {
    const r = await fetch(`${BACKEND_URL}/mcp/keys`, {
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
    });
    const data = await r.json().catch(() => ({}));
    return NextResponse.json(data, { status: r.status });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "fetch failed" }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  let body: any = {};
  try { body = await request.json(); } catch { /* empty body ok */ }
  try {
    const r = await fetch(`${BACKEND_URL}/mcp/keys/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    return NextResponse.json(data, { status: r.status });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "fetch failed" }, { status: 502 });
  }
}
