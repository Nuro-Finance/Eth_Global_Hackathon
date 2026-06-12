import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000";

/**
 * GET /api/cards/[id]/secrets
 *
 * Fetches real card secrets (PAN, CVV, expiry) from the Issuer API.
 * This is the ONLY way to get real card details — never store CVV locally.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const authHeader = request.headers.get("authorization");

  try {
    const backendRes = await fetch(`${BACKEND_URL}/cards/${id}/secrets`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
    });

    const data = await backendRes.json().catch(() => ({}));

    if (!backendRes.ok) {
      return NextResponse.json(
        { error: data.error ?? "Failed to fetch card secrets" },
        { status: backendRes.status }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error("[cards/[id]/secrets GET] backend unreachable:", err);
    return NextResponse.json({ error: "Could not reach backend" }, { status: 502 });
  }
}
