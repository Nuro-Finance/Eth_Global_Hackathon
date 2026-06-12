import { NextRequest, NextResponse } from "next/server";

// Day-7 OTP step. Proxies through to the backend the same way
// /api/auth/register and /api/auth/login do.
const BACKEND_URL =
  process.env.CASHLY_API_URL ??
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "http://localhost:3000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const backendRes = await fetch(`${BACKEND_URL}/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await backendRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err: any) {
    console.error("[auth/verify-otp proxy]", err?.code || err?.name, err?.message);
    return NextResponse.json(
      { error: "Verification service unavailable", detail: err?.message?.slice(0, 160) },
      { status: 502 }
    );
  }
}
