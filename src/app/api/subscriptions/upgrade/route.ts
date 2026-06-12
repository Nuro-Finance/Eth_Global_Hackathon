import { NextRequest, NextResponse } from "next/server";
const BACKEND = process.env.BACKEND_URL || process.env.CASHLY_API_URL || "http://localhost:3000";
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  try {
    const res = await fetch(`${BACKEND}/subscriptions/upgrade`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Could not reach backend" }, { status: 502 });
  }
}
