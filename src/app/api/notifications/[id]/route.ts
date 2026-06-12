import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL || "http://localhost:3000";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = req.headers.get("authorization") || "";
  const url = req.nextUrl.pathname;
  
  // Route to correct backend endpoint based on path
  const endpoint = url.includes("/read") 
    ? `${BACKEND}/notifications/${id}/read`
    : `${BACKEND}/notifications/${id}/dismiss`;
  
  const res = await fetch(endpoint, {
    method: "PATCH",
    headers: { Authorization: auth, "Content-Type": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
