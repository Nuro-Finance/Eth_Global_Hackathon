"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { usePrivyRuntime } from "@/providers/PrivyRuntimeContext";
import { useDevPreviewMode } from "@/providers/DevPreviewModeProvider";
import { useDemoDevSession } from "@/hooks/useDemoDevSession";
import { DESIGN_MODE } from "@/config/design-mode";
import { DEV_MOCK_CONNECTED_WALLET_ADDRESS } from "@/lib/devPreviewMode";
import { requiresWalletRelinkClient } from "@/lib/welcome-onboarding";

/**
 * Same address / chain resolution as the header ConnectWallet control.
 */
const DEV_MOCK_WALLET_STATE = {
  privyEnabled: true,
  ready: true,
  authenticated: true,
  hasWallet: true,
  address: DEV_MOCK_CONNECTED_WALLET_ADDRESS,
  walletType: "ethereum" as const,
  chainId: 1,
};

export function usePrivyWalletAddress() {
  const { privyEnabled } = usePrivyRuntime();
  const { isDevAvailable, populated: devPopulatedPreview } = useDevPreviewMode();
  const isDemoDev = useDemoDevSession();
  const isDesignMode = DESIGN_MODE;

  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();

  // Design-mode mock only when Privy is not mounted (wallet-connect UX testing uses real Privy).
  if (isDesignMode && !privyEnabled) {
    return DEV_MOCK_WALLET_STATE;
  }

  if (isDevAvailable && isDemoDev && devPopulatedPreview && !requiresWalletRelinkClient()) {
    return DEV_MOCK_WALLET_STATE;
  }

  const linkedWalletAccount = user?.linkedAccounts?.find(
    (a) =>
      (a.type === "wallet" || a.type === "smart_wallet") &&
      "address" in a &&
      typeof a.address === "string" &&
      a.address.length > 0
  );

  const linkedWalletAddress =
    linkedWalletAccount && "address" in linkedWalletAccount
      ? linkedWalletAccount.address
      : "";

  // Day-5 fix: when a user signs in via Google, Privy auto-creates an
  // *embedded* EOA wallet behind their account. If the user ALSO connects
  // an external wallet (MetaMask, Rabby, Coinbase, etc.), useWallets()
  // returns BOTH - and the embedded one frequently sorts first, making
  // the header pill / Receive QR show an address the user has never
  // seen instead of the wallet they actually meant to use. Prefer
  // injected/coinbase/walletconnect wallets over embedded.
  //
  // Day-7 update: previously this fell back to `wallets[0]` (which IS
  // the embedded wallet) when no external wallet was connected, so a
  // brand-new email-only signup would see the Privy-auto-created
  // address as if it were "their wallet". That's confusing UX - the
  // user has no knowledge of the wallet, no recovery phrase, can't
  // even prove ownership. Now we return empty when no external wallet
  // is connected, so the header pill renders "Connect Wallet" instead.
  const externalWallet = wallets.find(
    (w) => String((w as { connectorType?: string }).connectorType || "") !== "embedded",
  );
  const primaryWallet = externalWallet;

  // Same logic for the linkedAccounts fallback - filter out embedded
  // wallets (walletClientType === "privy") so we don't leak the
  // auto-created address there either.
  const externalLinkedWalletAddress = (user?.linkedAccounts?.find(
    (a) =>
      (a.type === "wallet" || a.type === "smart_wallet") &&
      "address" in a &&
      "walletClientType" in a &&
      a.walletClientType !== "privy"
  )?.address as string | undefined) || "";

  const resolvedAddress =
    primaryWallet?.address ?? externalLinkedWalletAddress ?? "";

  const suppressStaleWallet = requiresWalletRelinkClient();

  const address = authenticated && !suppressStaleWallet ? (resolvedAddress || "") : "";

  const linkedChainType =
    linkedWalletAccount &&
      "chainType" in linkedWalletAccount &&
      typeof linkedWalletAccount.chainType === "string"
      ? linkedWalletAccount.chainType.toLowerCase()
      : "";

  const linkedIsSolana =
    linkedChainType === "solana" ||
    (linkedWalletAddress.length > 0 && !linkedWalletAddress.startsWith("0x"));

  const walletType: "ethereum" | "solana" =
    String(primaryWallet?.type) === "solana"
      ? "solana"
      : linkedIsSolana
        ? "solana"
        : "ethereum";
  const chainId = primaryWallet?.chainId;

  const hasWallet = privyEnabled && ready && address.length > 0;

  return {
    privyEnabled,
    ready,
    authenticated,
    hasWallet,
    address,
    walletType,
    chainId,
  };
}
