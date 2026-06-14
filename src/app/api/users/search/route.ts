import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:3000";

// GET /api/users/search?q=<text> - proxies to backend /users/search
// Used by QuickTransferSheet's RecipientSearch autocomplete.
export async function GET(req: NextRequest) {
    const auth = req.headers.get("authorization") || "";
    const q = req.nextUrl.searchParams.get("q") || "";
    if (q.length < 2) {
        return NextResponse.json([], { status: 200 });
    }
    try {
        const res = await fetch(`${BACKEND}/users/search?q=${encodeURIComponent(q)}`, {
            headers: { Authorization: auth, "Content-Type": "application/json" },
        });
        const data = await res.json().catch(() => ({}));
        return NextResponse.json(data, { status: res.status });
    } catch (err) {
        console.error("[users/search GET] backend unreachable:", err);
        return NextResponse.json({ error: "Could not reach backend" }, { status: 502 });
    }
}
