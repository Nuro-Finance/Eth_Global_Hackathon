import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:3000";

// GET /api/supported-tokens?chainId=X — proxies to backend /supported-tokens.
// Populates the Reload Card 3-category token picker (Session 23 Thread D).
// No auth required — the list itself is not sensitive. Cached 60s by the
// edge since it changes only when ERC20_ALLOWLIST is edited.
export async function GET(req: NextRequest) {
    const chainId = req.nextUrl.searchParams.get("chainId") || "";
    const qs = chainId ? `?chainId=${encodeURIComponent(chainId)}` : "";
    try {
        const res = await fetch(`${BACKEND}/supported-tokens${qs}`, {
            headers: { "Content-Type": "application/json" },
            next: { revalidate: 60 },
        });
        const data = await res.json().catch(() => ({}));
        return NextResponse.json(data, { status: res.status });
    } catch (err) {
        console.error("[supported-tokens GET] backend unreachable:", err);
        return NextResponse.json({ error: "Could not reach backend" }, { status: 502 });
    }
}
