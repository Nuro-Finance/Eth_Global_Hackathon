import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || process.env.CASHLY_API_URL || "http://localhost:3000";

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization");
  const res = await fetch(`${BACKEND}/stripe/create-portal-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
