import { NextResponse } from "next/server";
import type { IDKitResult } from "@worldcoin/idkit";

export async function POST(request: Request): Promise<Response> {
  const rpId = process.env.RP_ID?.trim();
  if (!rpId) {
    return NextResponse.json({ error: "World ID not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as
    | { idkitResponse?: IDKitResult }
    | null;

  const idkitResponse = body?.idkitResponse;
  if (!idkitResponse) {
    return NextResponse.json({ error: "idkitResponse required" }, { status: 400 });
  }

  const response = await fetch(`https://developer.world.org/api/v4/verify/${rpId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(idkitResponse),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    return NextResponse.json({ error: err }, { status: 400 });
  }

  const data = (await response.json()) as { nullifier_hash?: string };
  return NextResponse.json({
    success: true,
    nullifier: data.nullifier_hash ?? null,
  });
}
