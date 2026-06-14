/**
 * KERNEL 28: THE LIGHTNING FAST DESIGN MODE
 * 
 * LATEST FINDINGS (2026-04-13):
 * 1. Privy Hook Hangs: Identified 30s re-load hangs caused by the Privy SDK attempting to 
 * resolve missing modules (@farcaster/mini-app-solana).
 * 2. Eager DB Connections: Standard pg-pool initialization attempts network handshake on 
 * import, slowing down the server boot by ~2s.
 * 3. Webpack vs Turbo: Standard dev mode is too heavy for the 2500+ module count.
 * 
 * RECENT PATCHES:
 * - Selective Privy Shunt: useUserMenuItems and usePrivyWalletAddress now short-circuit 
 * instantly when DESIGN_MODE is true.
 * - Lazy DB Initialization: src/db.ts now uses a deferred getter to ensure zero DB 
 * overhead during design sessions.
 * - Turbopack Integration: The dev pipe is now optimized for sub-1s ready states.
 */
/** Local UI sessions: on in dev unless explicitly disabled via NURO_DESIGN_MODE=false */
export const DESIGN_MODE =
  process.env.NURO_DESIGN_MODE === "true" ||
  (process.env.NODE_ENV === "development" && process.env.NURO_DESIGN_MODE !== "false");

/**
 * Dev-only: demo login works without Cashly API (localhost + NODE_ENV).
 */
export function isDevDesignLoginBypass(): boolean {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return true;
  }
  return process.env.NODE_ENV === "development";
}

/** Dev onboarding: type 1234 to preview ENS "already taken" error state. Design mode only. */
export const ENS_DESIGN_PREVIEW_TAKEN_SLUG = "1234";

/** Design mode + Privy app id: mount real Privy wallet connect while keeping other design mocks. */
export const DESIGN_MODE_PRIVY_WALLET =
  DESIGN_MODE && Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

/** Withdraw flow UI design: skip live API (does not enable dashboard demo data). Set false for production API testing. */
export const DESIGN_MOCK_WITHDRAW = true;
