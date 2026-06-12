import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:3000";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const url = new URL(req.url);
  const limit = url.searchParams.get("limit") || "10";
  try {
    const res = await fetch(`${BACKEND}/address-book/recent?limit=${encodeURIComponent(limit)}`, {
      headers: { Authorization: auth },
    });
    const data = await res.json().catch(() => ({ destinations: [] }));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[address-book/recent proxy] backend unreachable:", err);
    return NextResponse.json({ destinations: [], error: "backend_unreachable" }, { status: 502 });
  }
}
