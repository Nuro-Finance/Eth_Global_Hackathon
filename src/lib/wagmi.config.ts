import { createConfig, http } from "wagmi";
import { mainnet, base, polygon, arbitrum, optimism, avalanche, bsc } from "viem/chains";
import { injected, coinbaseWallet } from "wagmi/connectors";

// Day-5: expanded from 4 → 7 EVM chains so the Reload Card "send from
// wallet" flow can switchChain into BSC, Optimism, and Avalanche (the
// common picker selections in the demo). Adding a chain here is enough
// for wagmi's useSwitchChain to recognize it; the user's wallet still
// has to support it (any modern EOA wallet does).
export const wagmiConfig = createConfig({
  chains: [mainnet, base, polygon, arbitrum, optimism, avalanche, bsc],
  connectors: [
    injected({ target: "metaMask" }),
    injected(), // Catches Rabby, Brave wallet, etc.
    coinbaseWallet({ appName: "Nuro Finance" }),
  ],
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
    [polygon.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [avalanche.id]: http(),
    [bsc.id]: http(),
  },
  ssr: true,
});

export const SUPPORTED_CHAINS = [mainnet, base, polygon, arbitrum, optimism, avalanche, bsc];
