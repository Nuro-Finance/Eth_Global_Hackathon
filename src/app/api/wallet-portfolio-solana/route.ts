import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:3000";

/**
 * GET /api/wallet-portfolio-solana?address=<base58>
 *
 * Proxies to Express `/wallet-portfolio-solana`. Session 27 addition -
 * backend builds out native SOL + SPL balances via public Solana RPC +
 * CoinGecko prices. FE integration (Privy Solana provider) is Session 28
 * work; this endpoint is callable today with a manually-provided address.
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address") || "";
  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }
  try {
    const res = await fetch(
      `${BACKEND}/wallet-portfolio-solana?address=${encodeURIComponent(address)}`,
      { cache: "no-store" }
    );
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[wallet-portfolio-solana proxy] backend unreachable:", err);
    return NextResponse.json({ error: "Could not reach backend" }, { status: 502 });
  }
}
