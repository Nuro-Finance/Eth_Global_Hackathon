import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:3000";

// GET /api/skill-health — proxies to backend /public/skill-health.
// Consumed by sub-agents-dashboard.html + neural-dashboard.html for
// live health ring coloring + invocation heat. No auth — aggregate
// counts only, no PII.
export async function GET(_req: NextRequest) {
    try {
        const res = await fetch(`${BACKEND}/public/skill-health`, {
            headers: { "Content-Type": "application/json" },
            next: { revalidate: 30 },  // cache 30s at the edge — dashboards refresh anyway
        });
        const data = await res.json().catch(() => ({}));
        return NextResponse.json(data, { status: res.status });
    } catch (err) {
        console.error("[skill-health GET] backend unreachable:", err);
        return NextResponse.json({ skills: {}, meta: { degraded: true } }, { status: 502 });
    }
}
