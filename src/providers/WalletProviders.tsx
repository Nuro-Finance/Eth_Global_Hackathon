"use client";

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
import PrivyNuroSessionSync from "./PrivyNuroSessionSync";
import { DESIGN_MODE } from "@/config/design-mode";

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

export function WalletProviders({
  children,
  queryClient,
  designModePrivyOnly = false,
}: {
  children: React.ReactNode;
  queryClient: QueryClient;
  designModePrivyOnly?: boolean;
}) {
  const mountPrivy = Boolean(privyAppId) && (!DESIGN_MODE || designModePrivyOnly);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {mountPrivy ? (
          <PrivyProvider
            appId={privyAppId!}
            config={{
              appearance: {
                theme: "#141414",
                accentColor: "#0D90FF",
                logo: "/Nuro Horizontal Logo.svg",
                showWalletLoginFirst: true,
                walletList: [
                  "detected_ethereum_wallets",
                  "metamask",
                  "coinbase_wallet",
                  "wallet_connect",
                  "phantom",
                  "rainbow",
                ],
              },
              loginMethods: designModePrivyOnly ? ["wallet"] : ["wallet", "email", "google"],
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
              {!designModePrivyOnly ? <PrivyNuroSessionSync /> : null}
              {!designModePrivyOnly ? <PrivyAuthSync /> : null}
              {!designModePrivyOnly ? <BackendUserSync /> : null}
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
  );
}
