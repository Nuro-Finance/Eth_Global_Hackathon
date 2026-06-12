import { NextResponse } from "next/server";
import { signRequest } from "@worldcoin/idkit-core/signing";
import { WORLD_RELOAD_ACTION } from "@/lib/world-id";

function normalizeSigningKeyHex(key: string): string {
  const trimmed = key.trim();
  return trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
}

export async function POST(request: Request): Promise<Response> {
  const signingKey = process.env.RP_SIGNING_KEY;
  const rpId = process.env.RP_ID?.trim();

  if (!signingKey || !rpId) {
    return NextResponse.json({ error: "World ID not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const action =
    typeof body.action === "string" && body.action.trim()
      ? body.action.trim()
      : WORLD_RELOAD_ACTION;

  const { sig, nonce, createdAt, expiresAt } = signRequest({
    signingKeyHex: normalizeSigningKeyHex(signingKey),
    action,
    ttl: 300,
  });

  return NextResponse.json({
    rp_id: rpId,
    sig,
    nonce,
    created_at: createdAt,
    expires_at: expiresAt,
  });
}
