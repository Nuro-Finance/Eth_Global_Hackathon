import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  try {
    const body = await request.json();
    const res = await fetch(`${BACKEND_URL}/bots/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(authHeader ? { Authorization: authHeader } : {}) },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch { return NextResponse.json({ error: "Failed" }, { status: 502 }); }
}
