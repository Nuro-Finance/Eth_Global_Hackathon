/**
 * GET /api/cards/[id]/messages — load conversation history
 * DELETE /api/cards/[id]/messages — clear conversation (per spec Q3 reset)
 *
 * Proxies to the Express backend.
 */
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const authHeader = request.headers.get("authorization");
  const limit = request.nextUrl.searchParams.get("limit") || "50";

  try {
    const backendRes = await fetch(
      `${BACKEND_URL}/cards/${id}/messages?limit=${encodeURIComponent(limit)}`,
      {
        method: "GET",
        headers: { ...(authHeader ? { Authorization: authHeader } : {}) },
      },
    );
    const data = await backendRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err) {
    console.error("[cards/[id]/messages GET] backend unreachable:", err);
    return NextResponse.json({ error: "Could not reach backend" }, { status: 502 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const authHeader = request.headers.get("authorization");

  try {
    const backendRes = await fetch(`${BACKEND_URL}/cards/${id}/messages`, {
      method: "DELETE",
      headers: { ...(authHeader ? { Authorization: authHeader } : {}) },
    });
    const data = await backendRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err) {
    console.error("[cards/[id]/messages DELETE] backend unreachable:", err);
    return NextResponse.json({ error: "Could not reach backend" }, { status: 502 });
  }
}
