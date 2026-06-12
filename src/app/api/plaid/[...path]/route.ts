import { NextRequest, NextResponse } from "next/server";

/**
 * Plaid catch-all proxy — forwards every /api/plaid/* request to the Express
 * backend on localhost:3000.
 *
 * Why this file exists:
 *
 * The Plaid Day-3 scaffold added 5 backend routes in src/nuro-routes.ts
 * (POST /api/plaid/link-token, POST /exchange, GET /accounts, POST /refresh,
 *  DELETE /connection) but never added the frontend proxy layer. Every other
 * /api/* family in this app has explicit Next.js route handlers that forward
 * to Express — without them, the browser hits Next.js with no matching route
 * and gets a 404. That's exactly what /dashboard/banks was showing as
 * "Couldn't complete that: Load failed (404)".
 *
 * Catch-all `[...path]/route.ts` lets us bridge all 5 endpoints with one file
 * instead of duplicating the proxy boilerplate 5 times. New plaid endpoints
 * added on the backend automatically work without any frontend change.
 *
 * Auth is forwarded as-is from the browser (Authorization: Bearer <jwt>).
 * Body is streamed for write methods. Query string preserved via .search.
 */

const BACKEND_URL =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "http://localhost:3000";

async function proxy(
  request: NextRequest,
  path: string[],
  method: "GET" | "POST" | "PATCH" | "DELETE",
) {
  const url = `${BACKEND_URL}/api/plaid/${path.join("/")}${request.nextUrl.search}`;
  const authHeader = request.headers.get("authorization");

  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
  };

  // Only attach a body for methods that carry one. GET/DELETE with a body
  // is technically legal in HTTP but our Express handlers don't read it.
  if (method === "POST" || method === "PATCH") {
    init.body = await request.text();
  }

  try {
    const backendRes = await fetch(url, init);
    const text = await backendRes.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      // Backend returned non-JSON (e.g. plain text 503 from the not-yet-
      // configured Plaid feature flag). Pass through the body and status
      // so the page-level error handler can show something useful.
      data = { error: text || `Backend returned ${backendRes.status}` };
    }
    return NextResponse.json(data, { status: backendRes.status });
  } catch (err) {
    console.error(
      `[plaid ${method} ${path.join("/")}] backend unreachable:`,
      err,
    );
    return NextResponse.json(
      { error: "Could not reach backend" },
      { status: 502 },
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxy(request, path, "GET");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxy(request, path, "POST");
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxy(request, path, "PATCH");
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxy(request, path, "DELETE");
}
