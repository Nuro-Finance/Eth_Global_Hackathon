"use client";

import { useRouter } from "@/i18n/navigation";
import { useAppSession } from "@/hooks/useAppSession";
import { useEffect, useRef } from "react";
import { DESIGN_MODE } from "@/config/design-mode";
import { isDesignMockSessionSuppressed } from "@/lib/design-session-suppress";

/**
 * Kernel 28: This codebase uses pure NextAuth v5.
 * This component handles BOTH high-fidelity production security
 * AND instant-load local development "Design Mode."
 */
export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { status } = useAppSession();
  const router = useRouter();
  /** Avoid unmounting dashboard (and onboarding modal) during session refresh. */
  const hadAuthenticatedSessionRef = useRef(false);

  useEffect(() => {
    if (status === "authenticated") {
      hadAuthenticatedSessionRef.current = true;
    }
  }, [status]);

  const showInitialSessionLoading =
    status === "loading" && !hadAuthenticatedSessionRef.current;
  
 // ===== ABSOLUTE KERNEL 28 BYPASS (DESIGN MODE) =====
  const isDesignMode = DESIGN_MODE;

  useEffect(() => {
 // Redirect when logged out. In design mode, only redirect after explicit logout
 // (suppress flag) - otherwise logged-out designers still browse with mock session.
    const shouldRedirect =
      status === "unauthenticated" &&
      (!isDesignMode || isDesignMockSessionSuppressed());
    if (shouldRedirect) {
      router.replace("/login");
    }
  }, [status, isDesignMode, router]);

 // Design mode: wait for session before rendering dashboard (prevents demo flash for real users).
  if (isDesignMode) {
    if (showInitialSessionLoading) {
      return (
        <div className="h-screen w-screen bg-[var(--color-bg-primary,#111111)] flex items-center justify-center text-[var(--color-text-muted)] text-sm">
          Loading…
        </div>
      );
    }
    if (status === "unauthenticated" && isDesignMockSessionSuppressed()) {
      return (
        <div className="h-screen w-screen bg-[var(--color-bg-primary,#111111)] flex items-center justify-center text-[var(--color-text-muted)] text-sm">
          Loading…
        </div>
      );
    }
    return <>{children}</>;
  }

 // Regular production flow
  if (showInitialSessionLoading) {
    return (
      <div className="h-screen w-screen bg-[var(--color-bg-primary,#111111)] flex items-center justify-center text-[var(--color-text-muted)] text-sm">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
