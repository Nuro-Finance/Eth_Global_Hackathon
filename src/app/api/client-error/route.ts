import { NextRequest, NextResponse } from "next/server";
const BACKEND = process.env.BACKEND_URL || "http://localhost:3000";
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  try {
    await fetch(`${BACKEND}/client-error`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch { /* silent */ }
  return NextResponse.json({ received: true });
}
