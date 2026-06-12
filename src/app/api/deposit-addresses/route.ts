import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  try {
    const backendRes = await fetch(`${BACKEND_URL}/deposit-addresses`, {
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
    });
    const data = await backendRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to fetch deposit addresses" }, { status: 502 });
  }
}
