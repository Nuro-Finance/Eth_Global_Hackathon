import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000";

/**
 * GET /api/transactions
 * Proxies to Express backend GET /card-transactions - returns transaction history.
 * Supports ?cardId=<id> query param for filtering.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const { searchParams } = new URL(request.url);
  const cardId = searchParams.get("cardId");

  const backendPath = cardId
    ? `/card-transactions?cardId=${encodeURIComponent(cardId)}`
    : `/card-transactions`;

  try {
    const backendRes = await fetch(`${BACKEND_URL}${backendPath}`, {
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
    });

    const data = await backendRes.json().catch(() => ({}));

    if (!backendRes.ok) {
      return NextResponse.json(
        { error: data.error ?? "Failed to fetch transactions" },
        { status: backendRes.status }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error("[transactions route] backend unreachable:", err);
    return NextResponse.json({ error: "Could not reach backend" }, { status: 502 });
  }
}
