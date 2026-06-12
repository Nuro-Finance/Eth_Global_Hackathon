import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  try {
    const body = await request.json().catch(() => ({}));
    const backendRes = await fetch(`${BACKEND_URL}/kyc/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await backendRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err: any) {
    return NextResponse.json({ error: "KYC start failed" }, { status: 502 });
  }
}
