import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:3000";

/**
 * GET /api/quote/swap-firm?chainId=X&sellToken=native&amount=Y&taker=0x...
 *
 * Proxies the backend /quote/swap/firm which returns a full 0x transaction
 * payload (to/data/value/gas) so the connected wallet can sign and submit
 * directly via wagmi. Never exposes the 0x API key to the FE.
 */
export async function GET(req: NextRequest) {
  const chainId = req.nextUrl.searchParams.get("chainId") || "";
  const sellToken = req.nextUrl.searchParams.get("sellToken") || "";
  const amount = req.nextUrl.searchParams.get("amount") || "";
  const taker = req.nextUrl.searchParams.get("taker") || "";
 // S31 H1: optional buy-side override. Empty/missing → backend defaults
 // to USDC (matches the original card-credit pipeline).
  const buyToken = req.nextUrl.searchParams.get("buyToken") || "";

  if (!chainId || !sellToken || !amount || !taker) {
    return NextResponse.json(
      { error: "chainId, sellToken, amount, taker required" },
      { status: 400 }
    );
  }

  try {
    const params: Record<string, string> = { chainId, sellToken, amount, taker };
    if (buyToken) params.buyToken = buyToken;
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${BACKEND}/quote/swap/firm?${qs}`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[quote/swap-firm proxy] backend unreachable:", err);
    return NextResponse.json(
      { error: "Firm quote service unavailable", degraded: true },
      { status: 502 }
    );
  }
}
