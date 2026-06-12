/**
 * Resolve block explorer URLs for linked wallet addresses (EVM + Solana).
 */

export function parseEvmChainId(chainId: string | undefined): number | null {
  if (!chainId) return null;
  if (chainId.startsWith("eip155:")) {
    const n = parseInt(chainId.split(":")[1] ?? "", 10);
    return Number.isFinite(n) ? n : null;
  }
  if (/^0x[0-9a-fA-F]+$/.test(chainId)) {
    return parseInt(chainId, 16);
  }
  if (/^\d+$/.test(chainId)) return parseInt(chainId, 10);
  return null;
}

const EXPLORER_BASE_BY_CHAIN_ID: Record<number, string> = {
  1: "https://etherscan.io",
  11155111: "https://sepolia.etherscan.io",
  8453: "https://basescan.org",
  84532: "https://sepolia.basescan.org",
  42161: "https://arbiscan.io",
  421614: "https://sepolia.arbiscan.io",
  10: "https://optimistic.etherscan.io",
  11155420: "https://sepolia-optimism.etherscan.io",
  137: "https://polygonscan.com",
  56: "https://bscscan.com",
  43114: "https://snowtrace.io",
};

/**
 * Short label shown before the truncated address (e.g. eth:, base:, sol:).
 */
export function getWalletChainLabel(
  walletType: "ethereum" | "solana",
  chainId: string | undefined,
): string {
  if (walletType === "solana") return "sol";
  const id = parseEvmChainId(chainId);
  if (id === null) return "eth";
  if (id === 8453 || id === 84532) return "base";
  if (id === 1 || id === 11155111) return "eth";
  if (id === 137) return "matic";
  if (id === 42161 || id === 421614) return "arb";
  if (id === 10 || id === 11155420) return "op";
  if (id === 56) return "bsc";
  if (id === 43114) return "avax";
  return "eth";
}

export function getBlockExplorerAddressUrl(
  walletType: "ethereum" | "solana",
  chainId: string | undefined,
  address: string,
): string | null {
  if (!address) return null;
  if (walletType === "solana") {
    return `https://solscan.io/account/${address}`;
  }
  const id = parseEvmChainId(chainId);
  const base =
    id !== null && EXPLORER_BASE_BY_CHAIN_ID[id]
      ? EXPLORER_BASE_BY_CHAIN_ID[id]
      : "https://etherscan.io";
  return `${base}/address/${address}`;
}
