import { NextRequest, NextResponse } from "next/server";
const BACKEND = process.env.BACKEND_URL || "http://localhost:3000";
export async function GET(req: NextRequest) {
  try {
    const res = await fetch(`${BACKEND}/feeds/crypto`, { next: { revalidate: 60 } });
    const data = await res.json().catch(() => []);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Crypto feed unavailable" }, { status: 502 });
  }
}
