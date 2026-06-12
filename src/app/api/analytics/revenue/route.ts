import { NextRequest, NextResponse } from "next/server";
const BACKEND = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const qs = req.nextUrl.searchParams.toString();
  try {
    const res = await fetch(`${BACKEND}/analytics/revenue${qs ? `?${qs}` : ""}`, {
      headers: { Authorization: auth, "Content-Type": "application/json" },
    });
    const data = await res.json().catch(() => []);
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[analytics/revenue] backend unreachable:", err);
    return NextResponse.json([], { status: 502 });
  }
}
