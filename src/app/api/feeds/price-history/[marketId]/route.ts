import { NextRequest, NextResponse } from "next/server";
const BACKEND = process.env.BACKEND_URL || "http://localhost:3000";
export async function GET(req: NextRequest, { params }: { params: Promise<{ marketId: string }> }) {
  const { marketId } = await params;
  const period = req.nextUrl.searchParams.get("period") || "24h";
  try {
    const res = await fetch(`${BACKEND}/feeds/price-history/${marketId}?period=${period}`);
    const data = await res.json().catch(() => []);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Price history unavailable" }, { status: 502 });
  }
}
