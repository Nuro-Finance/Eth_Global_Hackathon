import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || process.env.CASHLY_API_URL || "http://localhost:3000";

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization");
  if (!token) return NextResponse.json({ error: "No token" }, { status: 401 });
  const res = await fetch(`${BACKEND}/wallets`, { headers: { Authorization: token } });
  return NextResponse.json(await res.json(), { status: res.status });
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization");
  if (!token) return NextResponse.json({ error: "No token" }, { status: 401 });
  const body = await req.json();
  const res = await fetch(`${BACKEND}/wallets`, {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return NextResponse.json(await res.json(), { status: res.status });
}
