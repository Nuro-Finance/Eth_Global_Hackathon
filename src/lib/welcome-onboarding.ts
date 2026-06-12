/** Interim first-login onboarding — replace with real flow + DB flag later. */

export const WELCOME_COOKIE = "nuro_welcome_seen";

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
