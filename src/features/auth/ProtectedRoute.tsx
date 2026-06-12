"use client";

import { useRouter } from "@/i18n/navigation";
import { useAppSession } from "@/hooks/useAppSession";
import { useEffect } from "react";
import { DESIGN_MODE } from "@/config/design-mode";

/**
 * Kernel 28: This codebase uses pure NextAuth v5.
 * This component handles BOTH high-fidelity production security
 * AND instant-load local development "Design Mode."
 */
export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { status } = useAppSession();
  const router = useRouter();
  
  // ===== ABSOLUTE KERNEL 28 BYPASS (DESIGN MODE) =====
  const isDesignMode = DESIGN_MODE;

  useEffect(() => {
    // Only redirect if NOT in Design Mode and NOT authenticated
    if (!isDesignMode && status === "unauthenticated") {
      // Locale-aware app route is `/[locale]/login` — `/auth/login` becomes `/en/auth/login` and 404s
      router.push("/login");
    }
  }, [status, isDesignMode, router]);

  // Instant dashboard render during Design Mode
  if (isDesignMode) {
    return <>{children}</>;
  }

  // Regular production flow
  if (status === "loading") {
    return (
      <div className="h-screen w-screen bg-[var(--color-bg-primary,#111111)] flex items-center justify-center text-[var(--color-text-muted)] text-sm">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
