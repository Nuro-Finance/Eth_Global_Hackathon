import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:3000";

/**
 * GET /api/wallet-portfolio?address=0x...&chains=1,8453,42161,137
 *
 * Proxies to Express backend GET /wallet-portfolio. No auth — public
 * on-chain data. Rate-limiting + caching live in the backend.
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address") || "";
  const chains = req.nextUrl.searchParams.get("chains") || "";

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  const qs = new URLSearchParams({ address });
  if (chains) qs.set("chains", chains);

  try {
    const res = await fetch(`${BACKEND}/wallet-portfolio?${qs.toString()}`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[wallet-portfolio proxy] backend unreachable:", err);
    return NextResponse.json(
      { error: "Portfolio service unavailable", degraded: true },
      { status: 502 }
    );
  }
}
