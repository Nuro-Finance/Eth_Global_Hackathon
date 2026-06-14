/** Interim first-login onboarding - replace with real flow + DB flag later. */

export const WELCOME_COOKIE = "nuro_welcome_seen";
export const PENDING_ONBOARDING_KEY = "nuro_pending_onboarding";
/** Keeps onboarding modal open across session refresh / layout remount. */
export const ONBOARDING_MODAL_OPEN_KEY = "nuro_onboarding_modal_open";
/** Fresh email signup - ignore stale Privy wallet until user connects explicitly. */
export const REQUIRE_WALLET_RELINK_KEY = "nuro_require_wallet_relink";

export function markRequireWalletRelinkClient(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(REQUIRE_WALLET_RELINK_KEY, "1");
  } catch {
    /* private mode / disabled storage */
  }
}

export function clearRequireWalletRelinkClient(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(REQUIRE_WALLET_RELINK_KEY);
  } catch {
    /* private mode / disabled storage */
  }
}

export function requiresWalletRelinkClient(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(REQUIRE_WALLET_RELINK_KEY) === "1";
  } catch {
    return false;
  }
}

export function markPendingOnboardingClient(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(PENDING_ONBOARDING_KEY, "1");
  } catch {
    /* private mode / disabled storage */
  }
}

export function consumePendingOnboardingClient(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    if (sessionStorage.getItem(PENDING_ONBOARDING_KEY) === "1") {
      sessionStorage.removeItem(PENDING_ONBOARDING_KEY);
      return true;
    }
  } catch {
    /* private mode / disabled storage */
  }
  return false;
}

export function getWelcomeUserId(user: {
  id?: string;
  email?: string | null;
} | null | undefined): string {
  if (!user) return "";
  return user.id ?? user.email ?? "";
}

export function welcomeSeenForUser(
  cookieValue: string | undefined,
  userId: string | undefined
): boolean {
  if (!cookieValue || !userId) return false;
  return cookieValue === userId;
}

export function markWelcomeSeenClient(userId: string): void {
  if (!userId || typeof document === "undefined") return;
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${WELCOME_COOKIE}=${encodeURIComponent(userId)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  try {
    sessionStorage.setItem(WELCOME_COOKIE, userId);
  } catch {
 /* private mode / disabled storage */
  }
}

export function readWelcomeCookieClient(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${WELCOME_COOKIE}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : undefined;
}

/** Cookie + same-tab sessionStorage (set on Quick Start before client nav). */
export function welcomeSeenForUserClient(userId: string | undefined): boolean {
  if (!userId) return false;
  if (welcomeSeenForUser(readWelcomeCookieClient(), userId)) return true;
  try {
    return sessionStorage.getItem(WELCOME_COOKIE) === userId;
  } catch {
    return false;
  }
}
