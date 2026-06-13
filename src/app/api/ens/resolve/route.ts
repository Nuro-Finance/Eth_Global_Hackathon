import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:3000";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const url = new URL(req.url);
  const name = url.searchParams.get("name") || "";
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const gatewayBase = process.env.ENS_GATEWAY_URL?.trim().replace(/\/$/, "");
  if (gatewayBase) {
    try {
      const res = await fetch(`${gatewayBase}/get/${encodeURIComponent(name)}`, {
        cache: "no-store",
      });
      if (res.status === 404) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      const data = await res.json().catch(() => ({}));
      return NextResponse.json(data, { status: res.status });
    } catch (err) {
      console.error("[ens/resolve] gateway unreachable:", err);
      return NextResponse.json({ error: "gateway_unreachable" }, { status: 502 });
    }
  }

  try {
    const res = await fetch(`${BACKEND}/ens/resolve?name=${encodeURIComponent(name)}`, {
      headers: { Authorization: auth },
    });
    const data = await res.json().catch(() => ({}));
    const cc = res.headers.get("cache-control");
    const nextRes = NextResponse.json(data, { status: res.status });
    if (cc) nextRes.headers.set("cache-control", cc);
    return nextRes;
  } catch (err) {
    console.error("[ens/resolve proxy] backend unreachable:", err);
    return NextResponse.json({ error: "backend_unreachable" }, { status: 502 });
  }
}
