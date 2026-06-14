import { auth } from "@/auth";
import { DESIGN_MODE } from "@/config/design-mode";
import { DEMO_USER_ID } from "@/config/demo-user";

/** Design mode: demo user when logged out. Real session user id when authenticated. */
export async function ensUserIdFromRequest(): Promise<string | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (typeof id === "string" && id.length > 0 && id !== "design-demo-user") {
    return id;
  }

  if (DESIGN_MODE) return DEMO_USER_ID;

  return null;
}
