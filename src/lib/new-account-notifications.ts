import type { Notification } from "@/layouts/Header/components/NotificationsDropdown/types";
import {
  isOnboardingComplete,
  readOnboardingProgress,
  type StoredOnboardingProgress,
} from "@/lib/account-onboarding-progress";
import { isKycVerified } from "@/lib/kyc-status";

export const SETUP_NOTIFICATION_ID_PREFIX = "local-setup-";
export const SETUP_NOTIFICATIONS_DISMISSED_PREFIX = "nuro_setup_notifications_dismissed_";

export const SETUP_NOTIFICATION_IDS = {
  welcome: `${SETUP_NOTIFICATION_ID_PREFIX}welcome`,
  onboarding: `${SETUP_NOTIFICATION_ID_PREFIX}onboarding`,
  wallet: `${SETUP_NOTIFICATION_ID_PREFIX}wallet`,
  kyc: `${SETUP_NOTIFICATION_ID_PREFIX}kyc`,
} as const;

export type SetupNotificationLabels = {
  welcomeTitle: string;
  welcomeMessage: (name: string) => string;
  finishSetupTitle: string;
  finishSetupMessage: string;
  connectWalletTitle: string;
  connectWalletMessage: string;
  verifyIdentityTitle: string;
  verifyIdentityMessage: string;
};

export type NewAccountNotificationContext = {
  displayName?: string;
  onboardingState: StoredOnboardingProgress | null;
  hasWallet: boolean;
  kycVerified: boolean;
  dismissedIds: Set<string>;
};

export function readDismissedSetupNotificationIds(userId: string | undefined): Set<string> {
  if (!userId || typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(`${SETUP_NOTIFICATIONS_DISMISSED_PREFIX}${userId}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function persistDismissedSetupNotificationId(
  userId: string | undefined,
  id: string,
): void {
  if (!userId || typeof localStorage === "undefined") return;
  const next = readDismissedSetupNotificationIds(userId);
  next.add(id);
  try {
    localStorage.setItem(
      `${SETUP_NOTIFICATIONS_DISMISSED_PREFIX}${userId}`,
      JSON.stringify([...next]),
    );
  } catch {
    /* private mode / quota */
  }
}

export function isSetupNotificationId(id: string): boolean {
  return id.startsWith(SETUP_NOTIFICATION_ID_PREFIX);
}

export function isAccountSetupIncomplete(ctx: {
  onboardingState: StoredOnboardingProgress | null;
  hasWallet: boolean;
  kycVerified: boolean;
}): boolean {
  return (
    !isOnboardingComplete(ctx.onboardingState) ||
    !ctx.hasWallet ||
    !ctx.kycVerified
  );
}

export function buildNewAccountNotifications(
  ctx: NewAccountNotificationContext,
  labels: SetupNotificationLabels,
): Notification[] {
  const onboardingComplete = isOnboardingComplete(ctx.onboardingState);
  const firstName = ctx.displayName?.trim() || "there";
  const items: Notification[] = [];

  const push = (id: string, title: string, message: string, type: Notification["type"]) => {
    if (ctx.dismissedIds.has(id)) return;
    items.push({
      id,
      title,
      message,
      time: "just now",
      timeShort: "now",
      isRead: false,
      type,
    });
  };

  push(
    SETUP_NOTIFICATION_IDS.welcome,
    labels.welcomeTitle,
    labels.welcomeMessage(firstName),
    "info",
  );

  if (!onboardingComplete) {
    push(
      SETUP_NOTIFICATION_IDS.onboarding,
      labels.finishSetupTitle,
      labels.finishSetupMessage,
      "info",
    );
  } else if (!ctx.hasWallet) {
    push(
      SETUP_NOTIFICATION_IDS.wallet,
      labels.connectWalletTitle,
      labels.connectWalletMessage,
      "warning",
    );
  } else if (!ctx.kycVerified) {
    push(
      SETUP_NOTIFICATION_IDS.kyc,
      labels.verifyIdentityTitle,
      labels.verifyIdentityMessage,
      "warning",
    );
  }

  return items;
}

export function mapKycStatusFromApi(status: string | null | undefined): boolean {
  return isKycVerified(status);
}
