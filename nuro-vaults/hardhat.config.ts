import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "dotenv/config";

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";
const ALCHEMY_API_KEY      = process.env.ALCHEMY_API_KEY      || "_9N8BifmCJQFSN8-qn7u-";
const BASESCAN_API_KEY     = process.env.BASESCAN_API_KEY     || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true },
  },
  networks: {
    baseSepolia: {
      url: "https://base-sepolia.g.alchemy.com/v2/" + ALCHEMY_API_KEY,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
      chainId: 84532,
    },
    base: {
      url: "https://base-mainnet.g.alchemy.com/v2/" + ALCHEMY_API_KEY,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
      chainId: 8453,
    },
    hardhat: {
      forking: {
        url: "https://base-mainnet.g.alchemy.com/v2/" + ALCHEMY_API_KEY,
        blockNumber: 18000000,
      },
      chainId: 31337,
    },
  },
  etherscan: {
    apiKey: { base: BASESCAN_API_KEY, baseSepolia: BASESCAN_API_KEY },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
    ],
  },
  typechain: { outDir: "typechain-types", target: "ethers-v5" },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;