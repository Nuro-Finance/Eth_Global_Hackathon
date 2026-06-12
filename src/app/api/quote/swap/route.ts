import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:3000";

// GET /api/quote/swap?chainId=X&sellToken=SYMBOL&amount=Y
// Proxies to backend /quote/swap which calls 0x. Used by ReloadFlow's live
// swap-quote preview (Session 23 Thread D). The backend caches + rate-limits.
// Never exposes the 0x API key to FE.
export async function GET(req: NextRequest) {
    const chainId = req.nextUrl.searchParams.get("chainId") || "";
    const sellToken = req.nextUrl.searchParams.get("sellToken") || "";
    const amount = req.nextUrl.searchParams.get("amount") || "";
    // S31 H1: optional buy-side override. Empty → backend defaults to USDC.
    const buyToken = req.nextUrl.searchParams.get("buyToken") || "";
    if (!chainId || !sellToken || !amount) {
        return NextResponse.json(
            { error: "chainId, sellToken, amount required" },
            { status: 400 }
        );
    }
    try {
        const params: Record<string, string> = { chainId, sellToken, amount };
        if (buyToken) params.buyToken = buyToken;
        const qs = new URLSearchParams(params).toString();
        const res = await fetch(`${BACKEND}/quote/swap?${qs}`, {
            headers: { "Content-Type": "application/json" },
        });
        const data = await res.json().catch(() => ({}));
        return NextResponse.json(data, { status: res.status });
    } catch (err) {
        console.error("[quote/swap GET] backend unreachable:", err);
        return NextResponse.json(
            { error: "Quote service unavailable", degraded: true },
            { status: 502 }
        );
    }
}
