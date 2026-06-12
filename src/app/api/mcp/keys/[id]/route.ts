import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authHeader = request.headers.get("authorization");
  try {
    const r = await fetch(`${BACKEND_URL}/mcp/keys/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeader ? { Authorization: authHeader } : {},
    });
    const data = await r.json().catch(() => ({}));
    return NextResponse.json(data, { status: r.status });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "fetch failed" }, { status: 502 });
  }
}
