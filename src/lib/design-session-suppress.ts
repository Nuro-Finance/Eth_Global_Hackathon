/** After explicit logout, block design-mode mock session until login page loads. */
export const DESIGN_MOCK_SESSION_SUPPRESS_KEY = "nuro:suppress_design_mock_session";

export function suppressDesignMockSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(DESIGN_MOCK_SESSION_SUPPRESS_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearDesignMockSessionSuppress(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(DESIGN_MOCK_SESSION_SUPPRESS_KEY);
  } catch {
    /* ignore */
  }
}

export function isDesignMockSessionSuppressed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(DESIGN_MOCK_SESSION_SUPPRESS_KEY) === "1";
  } catch {
    return false;
  }
}
