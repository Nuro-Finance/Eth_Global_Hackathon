import { NextRequest, NextResponse } from "next/server";
const BACKEND = process.env.BACKEND_URL || "http://localhost:3000";
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const qs = req.nextUrl.searchParams.toString();
  try {
    const res = await fetch(`${BACKEND}/transfers${qs ? `?${qs}` : ""}`, { headers: { Authorization: auth, "Content-Type": "application/json" } });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[transfers GET]", err);
    return NextResponse.json({ error: "Could not reach backend" }, { status: 502 });
  }
}
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const body = await req.json().catch(() => ({}));
  try {
    const res = await fetch(`${BACKEND}/transfers`, { method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[transfers POST]", err);
    return NextResponse.json({ error: "Could not reach backend" }, { status: 502 });
  }
}
