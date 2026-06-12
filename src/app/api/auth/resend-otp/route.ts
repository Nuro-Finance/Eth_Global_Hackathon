import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.CASHLY_API_URL ??
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "http://localhost:3000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const backendRes = await fetch(`${BACKEND_URL}/auth/resend-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await backendRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err: any) {
    console.error("[auth/resend-otp proxy]", err?.code || err?.name, err?.message);
    return NextResponse.json(
      { ok: true }, // mirror BE: hide failures from FE to prevent enumeration
      { status: 202 }
    );
  }
}
