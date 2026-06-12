import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:3000";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const url = new URL(req.url);
  const name = url.searchParams.get("name") || "";
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  try {
    const res = await fetch(`${BACKEND}/ens/resolve?name=${encodeURIComponent(name)}`, {
      headers: { Authorization: auth },
    });
    const data = await res.json().catch(() => ({}));
    // Forward the 5-min browser cache hint from backend if present.
    const cc = res.headers.get("cache-control");
    const nextRes = NextResponse.json(data, { status: res.status });
    if (cc) nextRes.headers.set("cache-control", cc);
    return nextRes;
  } catch (err) {
    console.error("[ens/resolve proxy] backend unreachable:", err);
    return NextResponse.json({ error: "backend_unreachable" }, { status: 502 });
  }
}
