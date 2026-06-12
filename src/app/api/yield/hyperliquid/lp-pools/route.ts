import { NextRequest, NextResponse } from "next/server";

// S31 H2 — proxy for backend GET /yield/hyperliquid/lp-pools (HyperSwap LP).
// Public; same pattern as funding/spot/staking proxies.
const BACKEND_URL =
  process.env.CASHLY_API_URL ??
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "http://localhost:3000";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit") ?? "25";
  const minTvl = url.searchParams.get("minTvl") ?? "0";
  try {
    const upstream = `${BACKEND_URL}/yield/hyperliquid/lp-pools?limit=${encodeURIComponent(limit)}&minTvl=${encodeURIComponent(minTvl)}`;
    const res = await fetch(upstream, { cache: "no-store" });
    const data = await res.json().catch(() => ({ pools: [] }));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Upstream unavailable", detail: err?.message?.slice(0, 120) },
      { status: 502 }
    );
  }
}
