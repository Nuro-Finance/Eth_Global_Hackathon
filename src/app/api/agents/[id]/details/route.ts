import { NextRequest, NextResponse } from "next/server";

// Proxy to Express BE /agents/:id/details — bundled snapshot for the
// per-agent Detail panel (S34 Marathon 9 / Tier A). Returns budgets +
// reputation + counsel + ledger + security events + bets + fundings +
// settlements in one round-trip.
const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authHeader = request.headers.get("authorization");
  try {
    const res = await fetch(`${BACKEND_URL}/agents/${id}/details`, {
      headers: { ...(authHeader ? { Authorization: authHeader } : {}) },
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}
