import { ethers } from "ethers";

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || "_9N8BifmCJQFSN8-qn7u-";

const RPC_URLS: Record<string, string> = {
  base:        `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
  baseSepolia: `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
};

export function getProvider(networkName: string): ethers.providers.JsonRpcProvider {
  const url = RPC_URLS[networkName];
  if (!url) throw new Error(`Unknown network: ${networkName}`);
  return new ethers.providers.JsonRpcProvider(url);
}

export function getSigner(provider: ethers.providers.JsonRpcProvider): ethers.Wallet {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) throw new Error("DEPLOYER_PRIVATE_KEY not set in environment");
  return new ethers.Wallet(privateKey, provider);
}
