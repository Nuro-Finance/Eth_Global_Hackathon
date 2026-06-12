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

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

export function WalletProviders({
  children,
  queryClient,
}: {
  children: React.ReactNode;
  queryClient: QueryClient;
}) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {privyAppId ? (
          <PrivyProvider
            appId={privyAppId}
            config={{
              appearance: {
                theme: "dark",
                accentColor: "#05fb81",
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
              loginMethods: ["wallet", "email", "google"],
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
  );
}
