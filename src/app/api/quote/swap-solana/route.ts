import { NextRequest, NextResponse } from "next/server";

// S30 Phase 1 - proxy for Jupiter-backed Solana quote previews. Parallel
// to /api/quote/swap but routes to our BE /quote/swap-solana endpoint.
const BACKEND = process.env.BACKEND_URL || "http://localhost:3000";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sellToken = url.searchParams.get("sellToken") || "";
  const amount = url.searchParams.get("amount") || "";
  const buyToken = url.searchParams.get("buyToken") || "";
  const qs = new URLSearchParams({ sellToken, amount });
  if (buyToken) qs.set("buyToken", buyToken);

  try {
    const backendRes = await fetch(
      `${BACKEND}/quote/swap-solana?${qs.toString()}`,
      { headers: { "Content-Type": "application/json" } },
    );
    const data = await backendRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err) {
    console.error("[quote/swap-solana proxy] backend unreachable:", err);
    return NextResponse.json(
      { error: "Solana quote service unavailable", degraded: true },
      { status: 502 },
    );
  }
}
