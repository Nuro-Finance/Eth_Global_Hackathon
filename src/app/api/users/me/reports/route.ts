/**
 * /api/users/me/reports
 *
 * Phase 2 .self_learn - proxy to the middleware report generation endpoint.
 *
 * POST → generate a new report. Body: { cadence, customDescription?, kind? }
 * Returns: { id, title, body_markdown, cadence, kind, signals_count }
 * GET → list past reports (newest first, lightweight rows).
 *
 * Schema: migration 052_self_learn_signals.sql (self_learn_reports table)
 * Backend: nuro-routes.ts POST + GET /users/me/reports
 */
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  let bodyText = "";
  try {
    bodyText = await req.text();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const res = await fetch(`${BACKEND_URL}/users/me/reports`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: bodyText,
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[users/me/reports POST] backend unreachable:", err);
    return NextResponse.json({ error: "Could not reach backend" }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const limit = req.nextUrl.searchParams.get("limit") || "20";
  try {
    const res = await fetch(`${BACKEND_URL}/users/me/reports?limit=${encodeURIComponent(limit)}`, {
      headers: { Authorization: auth, "Content-Type": "application/json" },
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[users/me/reports GET] backend unreachable:", err);
    return NextResponse.json({ error: "Could not reach backend" }, { status: 502 });
  }
}
