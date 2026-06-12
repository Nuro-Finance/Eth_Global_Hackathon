"use client";

import { useMemo } from "react";

/**
 * useSolanaAddress — resolve the connected user's Solana wallet address.
 *
 * Session 27 — bridges Privy's `useSolanaWallets()` into our app.
 *
 * Privy v2 exposes Solana wallets via `@privy-io/react-auth/solana`.
 * We defensively import + call it so that:
 *   1. If Privy is not configured (no NEXT_PUBLIC_PRIVY_APP_ID), the hook
 *      returns null without crashing — same defensive pattern as
 *      usePrivyWalletAddress. Session 20 Privy outage is the precedent.
 *   2. If Privy is configured but Solana wallet hasn't been created yet
 *      (embeddedWallets.solana.createOnLogin kicks in on login), hook
 *      returns null.
 *   3. If multiple Solana wallets are linked (user imported an external
 *      Phantom), return the first embedded one.
 *
 * Consumer code should always check for null before passing to downstream
 * hooks like useSolanaWalletPortfolio.
 */

type SolanaAddressState = {
  address: string | null;
  ready: boolean;         // true once Privy has finished loading its SDK
  hasSolanaWallet: boolean;
};

export function useSolanaAddress(): SolanaAddressState {
  // Dynamic require so builds don't explode if @privy-io/react-auth/solana
  // submodule is missing (older Privy versions pre-v2.x). On any failure,
  // fall back to null + ready=true so callers can proceed without blocking.
  let wallets: any[] | null = null;
  let ready = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const solanaModule = require("@privy-io/react-auth/solana");
    const { useSolanaWallets } = solanaModule;
    if (typeof useSolanaWallets === "function") {
      const result = useSolanaWallets();
      wallets = result?.wallets || [];
      ready = result?.ready ?? true;
    }
  } catch {
    // Privy Solana module not installed or Privy itself disabled — silent.
    wallets = null;
  }

  return useMemo<SolanaAddressState>(() => {
    if (!wallets || wallets.length === 0) {
      return { address: null, ready, hasSolanaWallet: false };
    }
    // Prefer the embedded wallet if multiple are linked; fall back to first
    const embedded = wallets.find((w: any) => w?.walletClientType === "privy");
    const picked = embedded || wallets[0];
    return {
      address: picked?.address || null,
      ready,
      hasSolanaWallet: Boolean(picked?.address),
    };
  }, [wallets, ready]);
}
