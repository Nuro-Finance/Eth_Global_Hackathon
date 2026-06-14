"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { usePrivy } from "@privy-io/react-auth";
import { mapPrivyUserToAppUser } from "@/lib/mapPrivyUser";
import {
  requiresWalletRelinkClient,
} from "@/lib/welcome-onboarding";

function isWalletOnlyPrivyEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return (
    normalized.startsWith("privy_") ||
    normalized.endsWith("@privy.local") ||
    normalized.endsWith("@telegram.local")
  );
}

/**
 * Privy persists its own session in the browser independently of NextAuth.
 * After email/password signup, a stale Privy wallet session can still look
 * "connected" in the header even though it belongs to a prior account.
 */
export default function PrivyNuroSessionSync() {
  const { data: session, status } = useSession();
  const { ready, authenticated, user, logout } = usePrivy();
  const logoutInFlightRef = useRef(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      logoutInFlightRef.current = false;
      return;
    }
    if (!ready || status !== "authenticated") return;

    const nuroEmail = session?.user?.email?.trim().toLowerCase();
    if (!nuroEmail) return;
    if (logoutInFlightRef.current) return;

    const forceLogoutForFreshSignup =
      requiresWalletRelinkClient() && authenticated && Boolean(user);

    if (!forceLogoutForFreshSignup && (!authenticated || !user)) {
      return;
    }

    if (!forceLogoutForFreshSignup) {
      const privyEmail = mapPrivyUserToAppUser(user!).email.trim().toLowerCase();
      const mismatch =
        isWalletOnlyPrivyEmail(privyEmail) || privyEmail !== nuroEmail;
      if (!mismatch) return;
    }

    logoutInFlightRef.current = true;
    void logout()
      .catch(() => {})
      .finally(() => {
        logoutInFlightRef.current = false;
      });
  }, [ready, authenticated, user, logout, session?.user?.email, status]);

  return null;
}
