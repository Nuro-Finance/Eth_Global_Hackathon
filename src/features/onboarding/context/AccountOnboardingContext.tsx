"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { AccountOnboardingModal } from "../components/AccountOnboardingModal";
import {
  computeOnboardingProgressFraction,
  readOnboardingProgress,
  shouldShowOnboardingSetupGuide,
} from "@/lib/account-onboarding-progress";
import { consumePendingOnboardingClient, getWelcomeUserId, ONBOARDING_MODAL_OPEN_KEY } from "@/lib/welcome-onboarding";
import { useAppSession } from "@/hooks/useAppSession";
import { useDemoDevSession } from "@/hooks/useDemoDevSession";

type AccountOnboardingContextValue = {
  open: boolean;
  openOnboarding: () => void;
  setOpen: (open: boolean) => void;
  progressFraction: number;
  showSetupGuide: boolean;
  refreshProgress: () => void;
};

const AccountOnboardingContext = createContext<AccountOnboardingContextValue | null>(null);

export function AccountOnboardingProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useAppSession();
  const isDemoDev = useDemoDevSession();
  const sessionUser = session?.user as { id?: string; email?: string | null } | undefined;
  const userId = getWelcomeUserId(sessionUser);
  const [open, setOpen] = useState(false);
  const [progressTick, setProgressTick] = useState(0);

  const refreshProgress = useCallback(() => {
    setProgressTick((n) => n + 1);
  }, []);

  const progressState = useMemo(() => {
    void progressTick;
    return readOnboardingProgress(userId);
  }, [userId, progressTick]);

  const progressFraction = useMemo(
    () => computeOnboardingProgressFraction(progressState),
    [progressState],
  );

  const showSetupGuide = useMemo(
    () => shouldShowOnboardingSetupGuide(userId, isDemoDev),
    [userId, isDemoDev, progressState],
  );

  const cleanPath = pathname.replace(/^\/[a-z]{2}/, "") || "/dashboard";
  const isDashboardHome = cleanPath === "/dashboard";

  useEffect(() => {
    if (!isDashboardHome) return;
    if (consumePendingOnboardingClient()) {
      setOpen(true);
      return;
    }
    try {
      if (sessionStorage.getItem(ONBOARDING_MODAL_OPEN_KEY) === "1") {
        setOpen(true);
      }
    } catch {
      /* private mode / disabled storage */
    }
  }, [isDashboardHome]);

  useEffect(() => {
    try {
      if (open) {
        sessionStorage.setItem(ONBOARDING_MODAL_OPEN_KEY, "1");
      } else {
        sessionStorage.removeItem(ONBOARDING_MODAL_OPEN_KEY);
      }
    } catch {
      /* private mode / disabled storage */
    }
  }, [open]);

  const openOnboarding = useCallback(() => {
    setOpen(true);
  }, []);

  const value = useMemo(
    () => ({
      open,
      openOnboarding,
      setOpen,
      progressFraction,
      showSetupGuide,
      refreshProgress,
    }),
    [open, openOnboarding, progressFraction, showSetupGuide, refreshProgress],
  );

  return (
    <AccountOnboardingContext.Provider value={value}>
      {children}
      <AccountOnboardingModal
        open={open}
        onOpenChange={setOpen}
        userId={userId}
        onProgressChange={refreshProgress}
      />
    </AccountOnboardingContext.Provider>
  );
}

export function useAccountOnboarding(): AccountOnboardingContextValue {
  const ctx = useContext(AccountOnboardingContext);
  if (!ctx) {
    throw new Error("useAccountOnboarding must be used within AccountOnboardingProvider");
  }
  return ctx;
}

export function useAccountOnboardingOptional(): AccountOnboardingContextValue | null {
  return useContext(AccountOnboardingContext);
}
