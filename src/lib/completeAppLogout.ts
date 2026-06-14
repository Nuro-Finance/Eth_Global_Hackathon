import { signOut } from "next-auth/react";
import type { AppDispatch } from "@/store/store";
import { logoutUser } from "@/store/slices/authSlice";
import { clearRequireWalletRelinkClient } from "@/lib/welcome-onboarding";
import { suppressDesignMockSession } from "@/lib/design-session-suppress";

/** Clear NextAuth cookie, Redux, and localStorage - not just Redux. */
export async function completeAppLogout(
  dispatch: AppDispatch,
  options?: { logoutPrivy?: () => Promise<void> },
): Promise<void> {
  suppressDesignMockSession();
  if (options?.logoutPrivy) {
    try {
      await options.logoutPrivy();
    } catch {
      /* ignore */
    }
  }
  await signOut({ redirect: false });
  clearRequireWalletRelinkClient();
  await dispatch(logoutUser());
}
