import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/cli/token -- Next.js proxy to the Express backend.
 *
 * The CLI calls this with a session JWT (Authorization: Bearer ...) and
 * receives a 90-day CLI bearer in return. The backend handler at
 * src/nuro-routes.ts mints the long-lived token; this route just
 * forwards the call so the same /api/cli/token URL works whether you
 * hit it from the dashboard "Get CLI Token" button or from the CLI
 * directly via app.nuro.finance/api/cli/token.
 *
 * Pattern: identical to the per-endpoint proxies in src/app/api/cards,
 * users, etc. We deliberately don't use the Plaid catch-all here
 * because /api/cli/* will likely grow beyond a single endpoint
 * (device-code flow in v0.3.0) and per-endpoint files keep the diffs
 * narrow per change.
 */

const BACKEND_URL =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "http://localhost:3000";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  try {
    const backendRes = await fetch(`${BACKEND_URL}/api/cli/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
    });
    const text = await backendRes.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text || `Backend returned ${backendRes.status}` };
    }
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err) {
    console.error("[cli-token proxy] backend unreachable:", err);
    return NextResponse.json(
      { error: "Could not reach backend" },
      { status: 502 },
    );
  }
}
