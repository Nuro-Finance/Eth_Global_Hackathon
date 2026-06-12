import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const authHeader = request.headers.get("authorization");
  try {
    const res = await fetch(`${BACKEND_URL}/cards/${id}/controls`, {
      headers: {
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return NextResponse.json({ error: data.error ?? "Backend error" }, { status: res.status });
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error("[cards/[id]/controls GET] backend unreachable:", err);
    return NextResponse.json({ error: "Could not reach backend" }, { status: 502 });
  }
}

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
    const res = await fetch(`${BACKEND_URL}/cards/${id}/controls`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return NextResponse.json({ error: data.error ?? "Backend error" }, { status: res.status });
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error("[cards/[id]/controls PATCH] backend unreachable:", err);
    return NextResponse.json({ error: "Could not reach backend" }, { status: 502 });
  }
}
