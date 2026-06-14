"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
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

function resolveExternalWalletAddress(
  wallets: ReturnType<typeof useWallets>["wallets"],
  user: ReturnType<typeof usePrivy>["user"],
): string {
  const externalWallet = wallets.find(
    (w) => String((w as { connectorType?: string }).connectorType || "") !== "embedded",
  );
  const externalLinkedWalletAddress =
    (user?.linkedAccounts?.find(
      (a) =>
        (a.type === "wallet" || a.type === "smart_wallet") &&
        "address" in a &&
        "walletClientType" in a &&
        a.walletClientType !== "privy",
    )?.address as string | undefined) || "";

  return externalWallet?.address ?? externalLinkedWalletAddress ?? "";
}

/**
 * Privy persists its own session in the browser independently of NextAuth.
 * After email/password signup, a stale Privy wallet session can still look
 * "connected" in the header even though it belongs to a prior account.
 *
 * Email Nuro session + wallet-only Privy (after onboarding connect) is
 * intentional — do not treat that as a mismatch or force-logout it.
 */
export default function PrivyNuroSessionSync() {
  const { data: session, status } = useSession();
  const { ready, authenticated, user, logout } = usePrivy();
  const { wallets } = useWallets();
  const logoutInFlightRef = useRef(false);

  const externalAddress = resolveExternalWalletAddress(wallets, user);
  const hasExternalWallet = Boolean(externalAddress);

  useEffect(() => {
    if (status === "unauthenticated") {
      logoutInFlightRef.current = false;
      return;
    }
    if (!ready || status !== "authenticated") return;

    const nuroEmail = session?.user?.email?.trim().toLowerCase();
    if (!nuroEmail) return;
    if (logoutInFlightRef.current) return;

    // Fresh signup: clear stale Privy session before the user connects a wallet.
    const forceLogoutForFreshSignup =
      requiresWalletRelinkClient() && authenticated && Boolean(user) && !hasExternalWallet;

    if (!forceLogoutForFreshSignup && (!authenticated || !user)) {
      return;
    }

    if (!forceLogoutForFreshSignup) {
      const privyEmail = mapPrivyUserToAppUser(user!).email.trim().toLowerCase();
      // Wallet-only Privy alongside email Nuro session is expected after onboarding connect.
      const mismatch =
        !isWalletOnlyPrivyEmail(privyEmail) && privyEmail !== nuroEmail;
      if (!mismatch) return;
    }

    logoutInFlightRef.current = true;
    void logout()
      .catch(() => {})
      .finally(() => {
        logoutInFlightRef.current = false;
      });
  }, [
    ready,
    authenticated,
    user,
    logout,
    session?.user?.email,
    status,
    hasExternalWallet,
  ]);

  return null;
}
