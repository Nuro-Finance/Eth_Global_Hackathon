import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000";

/**
 * PATCH /api/cards/[id]/freeze
 *
 * Body: { frozen: boolean }
 *
 * Proxies to the Nuro API backend:
 * PATCH /cards/:id { is_locked: boolean }
 *
 * The Express backend (nuro-routes.ts) already handles PATCH /cards/:id.
 * It updates cards.is_locked in Postgres and should call Issuer ops API to
 * suspend/activate the card at the payment processor level.
 *
 * Issuer ops suspend: POST /cards/{issuerCardId}/suspend
 * Issuer ops activate: POST /cards/{issuerCardId}/resume (or PATCH with status)
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);

  if (body === null || typeof body.frozen !== "boolean") {
    return NextResponse.json(
      { error: "Request body must include { frozen: boolean }" },
      { status: 400 }
    );
  }

 // Forward the auth header (JWT from next-auth session) to the backend
  const authHeader = request.headers.get("authorization");

  try {
    const backendRes = await fetch(`${BACKEND_URL}/cards/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
 // Backend expects is_locked (DB column name)
      body: JSON.stringify({ is_locked: body.frozen }),
    });

    const data = await backendRes.json().catch(() => ({}));

    if (!backendRes.ok) {
      return NextResponse.json(
        { error: data.error ?? "Backend returned an error", details: data },
        { status: backendRes.status }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error("[freeze route] backend unreachable:", err);
    return NextResponse.json(
      { error: "Could not reach backend" },
      { status: 502 }
    );
  }
}
