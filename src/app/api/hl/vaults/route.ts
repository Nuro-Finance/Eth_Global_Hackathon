import { NextRequest, NextResponse } from "next/server";

// S31 H2 — proxy for backend GET /api/hl/vaults (read-only HL vault list).
// Public — no auth needed; same rationale as /api/markets.
//
// The backend route is mounted at /api/hl/vaults inside createNuroRouter,
// which is itself mounted at the Express root via app.use(createNuroRouter(db)).
// So the upstream URL has /api/hl/vaults verbatim.

const BACKEND_URL =
  process.env.CASHLY_API_URL ??
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "http://localhost:3000";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const refresh = url.searchParams.get("refresh") === "1" ? "1" : "";
  try {
    const upstream = refresh
      ? `${BACKEND_URL}/api/hl/vaults?refresh=1`
      : `${BACKEND_URL}/api/hl/vaults`;
    const res = await fetch(upstream, { cache: "no-store" });
    const data = await res.json().catch(() => ({ vaults: [] }));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Upstream unavailable", detail: err?.message?.slice(0, 120) },
      { status: 502 }
    );
  }
}
