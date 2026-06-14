import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000";

/**
 * GET /api/cards
 * Proxies to Express backend GET /cards - returns the current user's cards.
 * JWT is forwarded from the next-auth session via Authorization header.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");

  try {
    const backendRes = await fetch(`${BACKEND_URL}/cards`, {
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
    });

    const data = await backendRes.json().catch(() => ({}));

    if (!backendRes.ok) {
      return NextResponse.json(
        { error: data.error ?? "Failed to fetch cards" },
        { status: backendRes.status }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error("[cards route] backend unreachable:", err);
    return NextResponse.json({ error: "Could not reach backend" }, { status: 502 });
  }
}

/**
 * PATCH /api/cards/[id]
 * Handled in /api/cards/[id]/route.ts
 */


export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const body = await request.json().catch(() => ({}));
  try {
    const backendRes = await fetch(`${BACKEND_URL}/cards`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await backendRes.json().catch(() => ({}));
    if (!backendRes.ok) {
      return NextResponse.json(
        { error: data.error ?? "Could not create card" },
        { status: backendRes.status }
      );
    }
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[cards POST] backend unreachable:", err);
    return NextResponse.json({ error: "Could not reach backend" }, { status: 502 });
  }
}
