import { auth } from "@/auth";
import { DESIGN_MODE } from "@/config/design-mode";
import { DEMO_USER_ID } from "@/config/demo-user";

/** Design mode: demo user. Production: NextAuth session user id. */
export async function ensUserIdFromRequest(): Promise<string | null> {
  if (DESIGN_MODE) return DEMO_USER_ID;

  const session = await auth();
  const id = session?.user?.id;
  if (typeof id === "string" && id.length > 0) return id;
  return null;
}
