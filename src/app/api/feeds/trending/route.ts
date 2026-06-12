import { NextRequest, NextResponse } from "next/server";
const BACKEND = process.env.BACKEND_URL || "http://localhost:3000";
export async function GET(req: NextRequest) {
  const limit = req.nextUrl.searchParams.get("limit") || "20";
  try {
    const res = await fetch(`${BACKEND}/feeds/trending?limit=${limit}`, { next: { revalidate: 120 } });
    const data = await res.json().catch(() => []);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Trending feed unavailable" }, { status: 502 });
  }
}
