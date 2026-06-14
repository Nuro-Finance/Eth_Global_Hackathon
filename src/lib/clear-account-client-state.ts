import { ACCOUNT_ONBOARDING_STORAGE_PREFIX } from "@/lib/account-onboarding-progress";
import { SETUP_NOTIFICATIONS_DISMISSED_PREFIX } from "@/lib/new-account-notifications";
import { DEMO_SAMPLE_CLEARED_STORAGE_KEY } from "@/features/dashboard/overview/hooks/designSampleData";

/** Clear per-user browser state after account deletion. */
export function clearAccountClientState(userId?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("nuro:withdraw-settings");
    localStorage.removeItem(DEMO_SAMPLE_CLEARED_STORAGE_KEY);
    if (userId) {
      localStorage.removeItem(`${ACCOUNT_ONBOARDING_STORAGE_PREFIX}${userId}`);
      localStorage.removeItem(`${SETUP_NOTIFICATIONS_DISMISSED_PREFIX}${userId}`);
    }
    sessionStorage.removeItem("nuro_pending_onboarding");
    sessionStorage.removeItem("nuro_require_wallet_relink");
  } catch {
    /* ignore storage errors */
  }
}
