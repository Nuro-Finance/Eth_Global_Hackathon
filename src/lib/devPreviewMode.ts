/**
 * Development-only UI preview: one global "populated demo" vs "new user empty" mode.
 * Never active in production builds.
 */

export const NURO_DEV_PREVIEW_POPULATED_KEY = "nuro_dev_preview_populated";
export const NURO_DEV_PREVIEW_CHANGED_EVENT = "nuro-dev-preview-changed";

/** Dev populated preview - sidebar QR, My Wallet connected shell, portfolio mocks. */
export const DEV_MOCK_CONNECTED_WALLET_ADDRESS =
  "0x742d35Cc6634C0532925a3b844Bc9e7590f44e" as const;

const LEGACY_NEW_USER_KEY = "dev_preview_new_user";

export function isDevPreviewAvailable(): boolean {
  return process.env.NODE_ENV === "development";
}

/** Read populated demo flag (dev only). Defaults to ON for design work. */
export function readDevPopulatedPreview(): boolean {
  if (!isDevPreviewAvailable()) return false;
  if (typeof window === "undefined") return true;
  try {
    const stored = window.localStorage.getItem(NURO_DEV_PREVIEW_POPULATED_KEY);
    if (stored !== null) return stored === "1";
    if (window.localStorage.getItem(LEGACY_NEW_USER_KEY) === "1") return false;
    return true;
  } catch {
    return false;
  }
}

export function writeDevPopulatedPreview(populated: boolean): void {
  if (!isDevPreviewAvailable() || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NURO_DEV_PREVIEW_POPULATED_KEY, populated ? "1" : "0");
    window.localStorage.removeItem(LEGACY_NEW_USER_KEY);
    window.localStorage.removeItem("dev_preview_my_wallet_connected");
  } catch {
 /* ignore */
  }
  window.dispatchEvent(new Event(NURO_DEV_PREVIEW_CHANGED_EVENT));
}

/** Dev + toggle OFF → new-user / empty UI surfaces. */
export function readDevNewUserEmpty(): boolean {
  return isDevPreviewAvailable() && !readDevPopulatedPreview();
}

/** Dev mock cards, balances, transactions, settings cards list, etc. */
export function shouldUseDevPopulatedData(isDemoDev = false): boolean {
  if (!isDevPreviewAvailable() || !isDemoDev) return false;
  return readDevPopulatedPreview();
}
