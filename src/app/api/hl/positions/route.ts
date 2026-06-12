import { NextRequest, NextResponse } from "next/server";

// S31 H2 — proxy for backend GET /api/hl/positions (authed user positions).
// Forwards the Authorization header so requireAuth on the backend can
// validate the JWT; without that the backend returns 401.

const BACKEND_URL =
  process.env.CASHLY_API_URL ??
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "http://localhost:3000";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const live = url.searchParams.get("live") === "1" ? "1" : "";
  const auth = request.headers.get("authorization") ?? "";
  if (!auth) {
    return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });
  }
  try {
    const upstream = live
      ? `${BACKEND_URL}/api/hl/positions?live=1`
      : `${BACKEND_URL}/api/hl/positions`;
    const res = await fetch(upstream, {
      cache: "no-store",
      headers: { authorization: auth },
    });
    const data = await res.json().catch(() => ({ positions: [] }));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Upstream unavailable", detail: err?.message?.slice(0, 120) },
      { status: 502 }
    );
  }
}
