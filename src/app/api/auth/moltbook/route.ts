import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token) {
      return NextResponse.json({ error: "Missing identity token" }, { status: 400 });
    }

    const appKey = process.env.MOLTBOOK_APP_KEY;
    if (!appKey) {
      return NextResponse.json({ error: "Moltbook not configured" }, { status: 503 });
    }

    // Verify identity token with Moltbook
    const verifyRes = await fetch("https://moltbook.com/api/v1/agents/verify-identity", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Moltbook-App-Key": appKey,
      },
      body: JSON.stringify({ token }),
    });

    if (!verifyRes.ok) {
      const err = await verifyRes.text();
      console.error("Moltbook verify failed:", err);
      return NextResponse.json({ error: "Invalid or expired Moltbook token" }, { status: 401 });
    }

    const profile = await verifyRes.json();
    // profile contains: bot name, karma, owner info, etc.
    return NextResponse.json({ success: true, profile });
  } catch (err) {
    console.error("Moltbook auth error:", err);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
