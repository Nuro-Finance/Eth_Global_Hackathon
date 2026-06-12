import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:3000";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = url.searchParams.get("limit") || "15";
  try {
    const backendRes = await fetch(
      `${BACKEND}/yield/hyperliquid/spot?limit=${encodeURIComponent(limit)}`,
      { headers: { "Content-Type": "application/json" } },
    );
    const data = await backendRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err) {
    console.error("[yield/hyperliquid/spot proxy]", err);
    return NextResponse.json(
      { error: "Hyperliquid spot unavailable", degraded: true },
      { status: 502 },
    );
  }
}
