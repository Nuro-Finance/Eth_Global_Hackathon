import { NextRequest, NextResponse } from "next/server";
const BACKEND = process.env.BACKEND_URL || "http://localhost:3000";
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  try {
    const res = await fetch(`${BACKEND}/users/me`, {
      headers: { Authorization: auth, "Content-Type": "application/json" },
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[users/me GET] backend unreachable:", err);
    return NextResponse.json({ error: "Could not reach backend" }, { status: 502 });
  }
}
