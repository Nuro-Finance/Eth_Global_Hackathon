/**
 * GET /api/users/me/signals
 *
 * Proxy to the backend .self_learn signal feed. Returns the user's recent
 * activity rows (card events, chat events, KYC milestones, persona swaps).
 * Per spec Q6, raw signals are browser-only — NOT MCP-exposed.
 *
 * Schema: migration 052_self_learn_signals.sql
 * Backend: nuro-routes.ts GET /users/me/signals
 */
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const limit = req.nextUrl.searchParams.get("limit") || "50";
  try {
    const res = await fetch(`${BACKEND_URL}/users/me/signals?limit=${encodeURIComponent(limit)}`, {
      headers: { Authorization: auth, "Content-Type": "application/json" },
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[users/me/signals GET] backend unreachable:", err);
    return NextResponse.json({ error: "Could not reach backend" }, { status: 502 });
  }
}
