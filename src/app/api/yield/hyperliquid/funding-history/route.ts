import { NextRequest, NextResponse } from "next/server";

// S31 H2 — proxy for backend GET /yield/hyperliquid/funding-history.
// Public, same rationale as /api/yield/hyperliquid/funding.
const BACKEND_URL =
  process.env.CASHLY_API_URL ??
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "http://localhost:3000";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const hours = url.searchParams.get("hours") ?? "24";
  const symbols = url.searchParams.get("symbols") ?? "";
  try {
    const params = new URLSearchParams({ hours });
    if (symbols) params.set("symbols", symbols);
    const upstream = `${BACKEND_URL}/yield/hyperliquid/funding-history?${params.toString()}`;
    const res = await fetch(upstream, { cache: "no-store" });
    const data = await res.json().catch(() => ({ histories: {} }));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Upstream unavailable", detail: err?.message?.slice(0, 120) },
      { status: 502 }
    );
  }
}
