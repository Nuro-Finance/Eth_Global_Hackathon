"use client";

import { useEffect, useState } from "react";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "./ThemeContext";
import ReduxProvider from "./ReduxProvider";
import ProgressProviderWrapper from "./progressBarProvider";
import { PrivyProvider } from "@privy-io/react-auth";
import { base, mainnet, arbitrum } from "viem/chains";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/wagmi.config";
import {
  PrivyInnerProviders,
  PrivyAuthSync,
  PrivyRuntimeProvider,
} from "./index";
import BackendUserSync from "./BackendUserSync";
import { ErrorBoundary, installGlobalErrorHandlers } from "@/components/ErrorBoundary";

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

function GlobalErrorInstaller({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    installGlobalErrorHandlers();
  }, []);
  return <>{children}</>;
}

/** Dev preview — also honors ?previewErrorBoundary=1 on routes that keep the query string (e.g. /en/login). */
function ErrorBoundaryPreviewTrigger() {
  if (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("previewErrorBoundary") === "1"
  ) {
    throw new Error(
      "Preview: deliberate error to show the crash modal. Use /design/preview-error-boundary or remove the query param and reload."
    );
  }
  return null;
}

export function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
 // Session 23 Marathon 7 — wagmi + react-query wired for wallet-prompt UX.
 // Lazy-init QueryClient so it's a stable singleton per mount (Next.js SSR
 // pattern). wagmiConfig imported from @/lib/wagmi.config.
  const [queryClient] = useState(() => new QueryClient());
  return (
    <ThemeProvider>
    <ErrorBoundary>
    <ErrorBoundaryPreviewTrigger />
    <GlobalErrorInstaller>
      <ProgressProviderWrapper>
        <SessionProvider>
          <ReduxProvider>
            <WagmiProvider config={wagmiConfig}>
              <QueryClientProvider client={queryClient}>
            {privyAppId ? (
              <PrivyProvider
                appId={privyAppId}
                config={{
                  appearance: {
                    theme: "dark",
                    accentColor: "#05fb81", // Nuro Primary Green
                    logo: "/Nuro Horizontal Logo.svg",
                    showWalletLoginFirst: true,
 // 2026-05-25 Connect Wallet — final fix.
 // Per Privy v3.22 types (verified against installed
 // node_modules), `walletList` lives at appearance, not
 // at top-level externalWallets. The earlier `externalWallets`
 // block was wrong shape and `as any` masked the bug.
 // Without a walletList anywhere, useConnectWallet() opens
 // an EMPTY modal and silently closes — that was the 2-day
 // dead-click. detected_ethereum_wallets auto-detects
 // MetaMask / Brave / Rabby / any injected EVM wallet.
                    walletList: [
                      "detected_ethereum_wallets",
                      "metamask",
                      "coinbase_wallet",
                      "wallet_connect",
                      "phantom",
                      "rainbow",
                    ],
                  },
                  loginMethods: ["wallet", "email", "google"],
 // No embedded wallets on login — shells sign up with email/Google only.
 // External connect (walletList + useConnectWallet) unchanged.
 // Embedded create only via explicit flows (e.g. Create Nuro Wallet modal).
                  embeddedWallets: {
                    ethereum: {
                      createOnLogin: "off",
                    },
                    solana: {
                      createOnLogin: "off",
                    },
                  },
                  supportedChains: [mainnet, base, arbitrum],
                }}
              >
                <PrivyInnerProviders>
                  <PrivyAuthSync />
                  <BackendUserSync />
                  {children}
                </PrivyInnerProviders>
              </PrivyProvider>
            ) : (
              <PrivyRuntimeProvider
                value={{ privyEnabled: false, ready: true }}
              >
                <BackendUserSync />
                {children}
              </PrivyRuntimeProvider>
            )}
              </QueryClientProvider>
            </WagmiProvider>
          </ReduxProvider>
        </SessionProvider>
      </ProgressProviderWrapper>
    </GlobalErrorInstaller>
    </ErrorBoundary>
    </ThemeProvider>
  );
}

export default Providers;
