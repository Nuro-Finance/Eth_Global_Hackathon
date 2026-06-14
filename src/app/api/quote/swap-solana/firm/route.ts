import { NextRequest, NextResponse } from "next/server";

// S30 Phase 3a - firm Solana swap proxy. Returns base64-encoded versioned
// Solana tx for the user's wallet to sign. Auth is forwarded; the BE
// route requires a Nuro JWT so we can attribute the swap_attempt to a
// user_id in execution_log.
const BACKEND = process.env.BACKEND_URL || "http://localhost:3000";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const url = new URL(req.url);
  const qs = url.searchParams.toString();
  try {
    const backendRes = await fetch(
      `${BACKEND}/quote/swap-solana/firm?${qs}`,
      { headers: { "Content-Type": "application/json", Authorization: auth } },
    );
    const data = await backendRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err) {
    console.error("[quote/swap-solana/firm proxy] backend unreachable:", err);
    return NextResponse.json(
      { error: "Solana firm-swap service unavailable", degraded: true },
      { status: 502 },
    );
  }
}
