import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000";

/**
 * PATCH /api/cards/[id]
 *
 * Accepts any partial card update (card_name, is_locked, etc.) and
 * proxies it to the Nuro API backend PATCH /cards/:id.
 *
 * Examples:
 *   { card_name: "Travel Card" }   — rename card
 *   { is_locked: true }            — freeze card (also handled by /freeze sub-route)
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const authHeader = request.headers.get("authorization");

  try {
    const backendRes = await fetch(`${BACKEND_URL}/cards/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(body),
    });

    const data = await backendRes.json().catch(() => ({}));

    if (!backendRes.ok) {
      return NextResponse.json(
        { error: data.error ?? "Backend returned an error" },
        { status: backendRes.status }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error("[cards/[id] PATCH] backend unreachable:", err);
    return NextResponse.json({ error: "Could not reach backend" }, { status: 502 });
  }
}
