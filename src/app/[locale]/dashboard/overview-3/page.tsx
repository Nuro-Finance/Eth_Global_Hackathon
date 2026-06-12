import { redirect } from "next/navigation";

const isProd = process.env.NODE_ENV === "production";

/**
 * Overview 3 is now the primary dashboard at /dashboard.
 * We redirect this legacy route to the clean /dashboard URL.
 */
export default function Overview3Page() {
  if (isProd) {
    redirect("/dashboard");
  }

  // For local development, we still redirect to keep the URL clean
  // but if you really need to access the raw variant for some reason,
  // you can comment this out.
  redirect("/dashboard");
}
