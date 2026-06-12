import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:3000";

/**
 * GET /api/users/me/vault
 * Proxies to backend GET /users/me/vault — returns the connected user's
 * Base vault address + live USDC/ETH balance + open market position count.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  try {
    const backendRes = await fetch(`${BACKEND}/users/me/vault`, {
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      cache: "no-store",
    });
    const data = await backendRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err) {
    console.error("[users/me/vault proxy] backend unreachable:", err);
    return NextResponse.json({ error: "Could not reach backend" }, { status: 502 });
  }
}
