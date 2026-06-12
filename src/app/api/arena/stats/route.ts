import { NextResponse } from "next/server";
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:3000";

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/arena/stats`);
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch { return NextResponse.json({}, { status: 502 }); }
}
