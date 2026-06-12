import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:3000";

/**
 * GET /api/wallet-activity?address=0x...&limit=50
 *
 * Proxies to Express backend GET /wallet-activity. Public on-chain data;
 * rate-limit + cache live in the backend (30s TTL per address+limit).
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address") || "";
  const limit = req.nextUrl.searchParams.get("limit") || "50";

  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  const qs = new URLSearchParams({ address, limit });

  try {
    const res = await fetch(`${BACKEND}/wallet-activity?${qs.toString()}`, {
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[wallet-activity proxy] backend unreachable:", err);
    return NextResponse.json(
      { error: "Activity service unavailable", degraded: true },
      { status: 502 }
    );
  }
}
