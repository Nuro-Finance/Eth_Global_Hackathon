import { redirect } from "next/navigation";

const isProd = process.env.NODE_ENV === "production";

/**
 * Overview 2 is deprecated.
 * We redirect this legacy route to the primary /dashboard URL in production.
 */
export default function Overview2Page() {
  if (isProd) {
    redirect("/dashboard");
  }

  // Keep available for local dev if needed, or redirect as well
  // For now, let's redirect to align with the user's preference for a single /dashboard URL.
  redirect("/dashboard");
}
