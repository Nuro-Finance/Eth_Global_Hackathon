import { NextRequest, NextResponse } from "next/server";

// S31 H2 — proxy for backend GET /yield/hyperliquid/staking.
// Public; powers the "HYPE Staking" stat card on the Yield page.
const BACKEND_URL =
  process.env.CASHLY_API_URL ??
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "http://localhost:3000";

export async function GET(_request: NextRequest) {
  try {
    const upstream = `${BACKEND_URL}/yield/hyperliquid/staking`;
    const res = await fetch(upstream, { cache: "no-store" });
    const data = await res.json().catch(() => ({ stats: null, degraded: true }));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Upstream unavailable", detail: err?.message?.slice(0, 120) },
      { status: 502 }
    );
  }
}
