import { NextRequest, NextResponse } from "next/server";
import {
  DEMO_CREDENTIALS,
  isDemoLoginEmail,
} from "@/features/auth/components/DemoCredentialsCard/config";

const BACKEND_URL = process.env.CASHLY_API_URL || "http://localhost:3000";

const DEV_DEMO_LOGIN_RESPONSE = {
  accessToken: "dev-design-session-token",
  user: {
    id: "design-demo-user",
    email: DEMO_CREDENTIALS.email,
    name: "Demo",
  },
};

// Day-7 demo-critical: this proxy must pass through 202 needsVerification
// responses verbatim so the FE can pivot to the OTP entry step instead of
// showing a generic "Invalid credentials" error.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (process.env.NODE_ENV === "development" && isDemoLoginEmail(body?.email)) {
      return NextResponse.json(DEV_DEMO_LOGIN_RESPONSE);
    }
    const backendRes = await fetch(`${BACKEND_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await backendRes.json().catch(() => ({}));
    return NextResponse.json(data, { status: backendRes.status });
  } catch (error) {
    console.error("Auth proxy error:", error);
    return NextResponse.json(
      { error: "Authentication service unavailable" },
      { status: 502 }
    );
  }
}
