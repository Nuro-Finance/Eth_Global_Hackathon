import { NextRequest, NextResponse } from "next/server";

// Session 30 — proxy for Hyperliquid funding-rates endpoint.
// Backend fetches from HL's public /info API + 30s server cache.
// No auth required (public data); this proxy just routes FE calls
// through our Node server so the browser never hits HL directly
// (avoids CORS issues + lets us swap backends without FE changes).
const BACKEND_URL =
  process.env.CASHLY_API_URL ??
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "http://localhost:3000";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit") ?? "10";
  try {
    const res = await fetch(
      `${BACKEND_URL}/yield/hyperliquid/funding?limit=${encodeURIComponent(limit)}`,
      { cache: "no-store" }
    );
    const data = await res.json().catch(() => ({ rows: [] }));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Upstream unavailable", detail: err?.message?.slice(0, 120) },
      { status: 502 }
    );
  }
}
