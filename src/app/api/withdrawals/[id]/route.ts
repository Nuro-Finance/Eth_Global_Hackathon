import { NextRequest, NextResponse } from "next/server";
const BACKEND = process.env.BACKEND_URL || "http://localhost:3000";

/**
 * DELETE /api/withdrawals/[id] - Cancel a pending withdrawal
 */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const auth = req.headers.get("authorization") || "";
  try {
    const res = await fetch(`${BACKEND}/withdrawals/${id}`, {
      method: "DELETE",
      headers: { Authorization: auth, "Content-Type": "application/json" },
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[withdrawals DELETE]", err);
    return NextResponse.json({ error: "Could not reach backend" }, { status: 502 });
  }
}
