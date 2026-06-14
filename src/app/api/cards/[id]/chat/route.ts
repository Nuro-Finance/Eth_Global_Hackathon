/**
 * POST /api/cards/[id]/chat
 *
 * Per-card agent chat proxy. Forwards message, session auth, and optional BYOK
 * fields (`apiKey`, `provider`, `tier`) to the Express handler in
 * nuro-routes.ts. BYOK required - user keys are never stored server-side
 * (same posture as POST /api/chat). Server ANTHROPIC_API_KEY is not used
 * for card chat (deprecated path removed).
 *
 * Spec: AFI/Neural Net/Claude Memory/Per-Card Agent System Spec.md
 * Sister routes (this directory): messages/route.ts (history), persona/route.ts.
 */
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3000";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const authHeader = request.headers.get("authorization");
  const body = await request.json().catch(() => ({}));

  try {
    const backendRes = await fetch(`${BACKEND_URL}/cards/${id}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(body),
    });

    const data = await backendRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err) {
    console.error("[cards/[id]/chat POST] backend unreachable:", err);
    return NextResponse.json({ error: "Could not reach backend" }, { status: 502 });
  }
}
