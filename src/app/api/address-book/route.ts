import { NextRequest, NextResponse } from "next/server";

// S30 Phase 2.5 closeout — saved address book CRUD proxy. Hits backend
// /address-book (user-curated contacts, migration 031). Paired with
// /api/address-book/recent (inferred from withdrawals, the S30 batch).
const BACKEND = process.env.BACKEND_URL || "http://localhost:3000";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  try {
    const res = await fetch(`${BACKEND}/address-book`, { headers: { Authorization: auth } });
    const data = await res.json().catch(() => ({ contacts: [] }));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[address-book GET proxy]", err);
    return NextResponse.json({ contacts: [], error: "backend_unreachable" }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const body = await req.json().catch(() => ({}));
  try {
    const res = await fetch(`${BACKEND}/address-book`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[address-book POST proxy]", err);
    return NextResponse.json({ error: "backend_unreachable" }, { status: 502 });
  }
}
