import { NextRequest, NextResponse } from "next/server";

// S30 Phase 2 - unified quote proxy. Dispatches to BE /quote/best which runs
// every applicable source (0x EVM / Jupiter Solana / future Uniswap-direct)
// in parallel and returns the best buyAmountUsd + runner-up alternatives.
const BACKEND = process.env.BACKEND_URL || "http://localhost:3000";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const qs = url.searchParams.toString();
  try {
    const backendRes = await fetch(`${BACKEND}/quote/best?${qs}`, {
      headers: { "Content-Type": "application/json" },
    });
    const data = await backendRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err) {
    console.error("[quote/best proxy] backend unreachable:", err);
    return NextResponse.json(
      { error: "Quote service unavailable", degraded: true },
      { status: 502 },
    );
  }
}
