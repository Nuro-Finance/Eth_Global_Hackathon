/**
 * GET   /api/cards/[id]/persona — read persona config + available personas
 * PATCH /api/cards/[id]/persona — swap persona / toggle memory / custom name
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

  try {
    const backendRes = await fetch(`${BACKEND_URL}/cards/${id}/persona`, {
      method: "GET",
      headers: { ...(authHeader ? { Authorization: authHeader } : {}) },
    });
    const data = await backendRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err) {
    console.error("[cards/[id]/persona GET] backend unreachable:", err);
    return NextResponse.json({ error: "Could not reach backend" }, { status: 502 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const authHeader = request.headers.get("authorization");
  const body = await request.json().catch(() => ({}));

  try {
    const backendRes = await fetch(`${BACKEND_URL}/cards/${id}/persona`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await backendRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err) {
    console.error("[cards/[id]/persona PATCH] backend unreachable:", err);
    return NextResponse.json({ error: "Could not reach backend" }, { status: 502 });
  }
}
