import { NextRequest } from "next/server";
import { DESIGN_MODE } from "@/config/design-mode";
import { DEMO_USER_ID } from "@/config/demo-user";

export function ensUserIdFromRequest(request: NextRequest): string {
  if (DESIGN_MODE) return DEMO_USER_ID;
  const auth = request.headers.get("authorization") ?? "";
  if (!auth) return "anonymous";
  return Buffer.from(auth).toString("base64url").slice(0, 32);
}
