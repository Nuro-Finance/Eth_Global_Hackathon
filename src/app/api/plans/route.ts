import { NextRequest, NextResponse } from "next/server";
const BACKEND = process.env.BACKEND_URL || process.env.CASHLY_API_URL || "http://localhost:3000";
export async function GET() {
  try {
    const res = await fetch(`${BACKEND}/plans`);
    const data = await res.json().catch(() => []);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Could not reach backend" }, { status: 502 });
  }
}
