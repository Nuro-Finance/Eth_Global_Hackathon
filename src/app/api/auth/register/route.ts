import { NextRequest, NextResponse } from "next/server";

// Session 29 — unified env var with auth.ts / api/auth/login/route.ts.
// Previous `BACKEND_URL` fallback only worked when user set a separate env
// var most operators didn't know about. `CASHLY_API_URL` is the canonical
// name used everywhere else; legacy `BACKEND_URL` / `NEXT_PUBLIC_BACKEND_URL`
// kept as fallbacks for transitional compatibility.
const BACKEND_URL =
  process.env.CASHLY_API_URL ??
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "http://localhost:3000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const backendRes = await fetch(`${BACKEND_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await backendRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err: any) {
 // Session 29 — surface the actual fetch error so operators can distinguish
 // "backend unreachable" (ECONNREFUSED) vs "backend responded with error"
 // vs "JSON parse failed". Prior blanket "Registration failed" masked
 // network/config issues that looked like a bug in the form.
    console.error("[auth/register proxy]", err?.code || err?.name, err?.message);
    return NextResponse.json(
      { error: "Registration service unavailable", detail: err?.message?.slice(0, 160) },
      { status: 502 }
    );
  }
}
