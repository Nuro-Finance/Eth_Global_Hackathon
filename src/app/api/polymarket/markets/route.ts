import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tag = searchParams.get("tag") || "";
  const limit = searchParams.get("limit") || "4";
  try {
    const params = new URLSearchParams({ limit });
    if (tag) params.set("tag", tag);
    const backendRes = await fetch(`${BACKEND_URL}/polymarket/markets?${params}`);
    const data = await backendRes.json().catch(() => []);
    return NextResponse.json(data, { status: backendRes.status });
  } catch {
    return NextResponse.json([], { status: 502 });
  }
}
