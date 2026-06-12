import { NextRequest, NextResponse } from "next/server";
const BACKEND = process.env.BACKEND_URL || "http://localhost:3000";
export async function GET(req: NextRequest) {
  const sport = req.nextUrl.searchParams.get("sport") || "Soccer";
  try {
    const res = await fetch(`${BACKEND}/feeds/sports?sport=${encodeURIComponent(sport)}`, { next: { revalidate: 300 } });
    const data = await res.json().catch(() => []);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Sports feed unavailable" }, { status: 502 });
  }
}
