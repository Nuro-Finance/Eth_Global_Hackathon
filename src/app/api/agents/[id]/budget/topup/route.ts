import { NextRequest, NextResponse } from "next/server";

// Proxy to Express BE /api/agents/:id/budget/topup — user-facing
// budget top-up (S34 Marathon 9 / A1). Pairs with the BudgetTopupForm
// on the agent-wallet Detail panel's Budget tab.
const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authHeader = request.headers.get("authorization");
  try {
    const body = await request.json();
    const res = await fetch(`${BACKEND_URL}/api/agents/${id}/budget/topup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}
