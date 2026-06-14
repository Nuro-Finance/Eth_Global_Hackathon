import type {
  AccountOnboardingStep,
  AccountType,
  OnboardingTheme,
} from "@/features/onboarding/types";

export const ACCOUNT_ONBOARDING_STORAGE_PREFIX = "nuro_account_onboarding_";

export type OnboardingCompletedStepKey =
  | "accountType"
  | "welcome"
  | "ens"
  | "wallet"
  | "ensBind"
  | "theme";

export type StoredOnboardingProgress = {
  currentStep: AccountOnboardingStep;
  completedSteps: Partial<Record<OnboardingCompletedStepKey, boolean>>;
  walletSkipped?: boolean;
  completedAt?: string;
  draft: {
    accountType: AccountType | null;
    displayName: string;
    teamName: string;
    ensSlug: string;
    country?: string;
    themeChoice: OnboardingTheme | null;
    walletAddress?: string;
    walletConnected?: boolean;
    ensWalletBound?: boolean;
    ensBindSkipped?: boolean;
  };
};

export function readOnboardingProgress(
  userId: string | undefined,
): StoredOnboardingProgress | null {
  if (!userId || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${ACCOUNT_ONBOARDING_STORAGE_PREFIX}${userId}`);
    if (!raw) return null;
    return JSON.parse(raw) as StoredOnboardingProgress;
  } catch {
    return null;
  }
}

export function writeOnboardingProgress(
  userId: string | undefined,
  state: StoredOnboardingProgress,
): void {
  if (!userId || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      `${ACCOUNT_ONBOARDING_STORAGE_PREFIX}${userId}`,
      JSON.stringify(state),
    );
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("nuro:onboarding-progress-changed", { detail: { userId } }),
      );
    }
  } catch {
    /* private mode / quota */
  }
}

export function isOnboardingComplete(state: StoredOnboardingProgress | null): boolean {
  return Boolean(state?.completedAt);
}

/** Four visual quarters: signup → account type → profile → ENS → wallet/theme finish. */
export function computeOnboardingProgressFraction(
  state: StoredOnboardingProgress | null,
): number {
  if (state?.completedAt) return 1;

  let quarters = 1;
  if (!state) return quarters / 4;

  const { completedSteps, walletSkipped } = state;

  if (completedSteps.accountType) quarters = Math.max(quarters, 2);
  if (completedSteps.welcome) quarters = Math.max(quarters, 3);
  if (completedSteps.ens) quarters = Math.max(quarters, 3);
  if (completedSteps.wallet || walletSkipped) quarters = Math.max(quarters, 4);
  if (completedSteps.theme) quarters = 4;

  return quarters / 4;
}

export function shouldShowOnboardingSetupGuide(
  userId: string | undefined,
  isDemoDev: boolean,
): boolean {
  if (!userId || isDemoDev) return false;
  return !isOnboardingComplete(readOnboardingProgress(userId));
}

export function createDefaultOnboardingProgress(
  currentStep: AccountOnboardingStep = "accountType",
): StoredOnboardingProgress {
  return {
    currentStep,
    completedSteps: {},
    draft: {
      accountType: null,
      displayName: "",
      teamName: "",
      ensSlug: "",
      country: "US",
      themeChoice: null,
      walletAddress: "",
      walletConnected: false,
      ensWalletBound: false,
      ensBindSkipped: false,
    },
  };
}
