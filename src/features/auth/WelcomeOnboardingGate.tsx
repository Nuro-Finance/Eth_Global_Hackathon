"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useAppSession } from "@/hooks/useAppSession";
import {
  getWelcomeUserId,
  welcomeSeenForUserClient,
} from "@/lib/welcome-onboarding";

/**
 * Sends first-time logins to /welcome before they reach the dashboard.
 * Returning users (cookie matches their id) pass through unchanged.
 */
export default function WelcomeOnboardingGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useAppSession();
  const router = useRouter();

  useEffect(() => {
    if (status !== "authenticated") return;
    const userId = getWelcomeUserId(session?.user);
    if (!userId) return;
    if (!welcomeSeenForUserClient(userId)) {
      router.replace("/welcome");
    }
  }, [status, session, router]);

  return <>{children}</>;
}
