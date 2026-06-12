import { ethers } from "ethers";
import { getProvider, getSigner } from "../utils/provider";
import { loadDeployments } from "../utils/deployments";
import FeeRouterABI from "../../artifacts/contracts/core/FeeRouter.sol/FeeRouter.json";

/**
 * VaultRouter
 * Intercepts fee settlement from the main Nuro fee split.
 * Routes 0.5% competition pool to the correct vault via FeeRouter contract.
 */

export interface DepositMetadata {
  userId:      string;
  amount:      bigint;       // USDC in 6 decimals
  communityId: string;       // community ticker e.g. "PEPE", empty string if none
  chainId:     number;       // origin chain id (1=ETH, 8453=BASE, 42161=ARB, etc.)
  roundType:   number;       // 0=DAILY 1=WEEKLY 2=MONTHLY 3=QUARTERLY 4=ANNUAL
}

// Map origin chainId to vault entity id (keccak256 of chain name)
const CHAIN_ENTITY_MAP: Record<number, string> = {
  8453:  ethers.utils.keccak256(ethers.utils.toUtf8Bytes("BASE")),
  1:     ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ETHEREUM")),
  42161: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ARBITRUM")),
  10:    ethers.utils.keccak256(ethers.utils.toUtf8Bytes("OPTIMISM")),
  137:   ethers.utils.keccak256(ethers.utils.toUtf8Bytes("POLYGON")),
  43114: ethers.utils.keccak256(ethers.utils.toUtf8Bytes("AVALANCHE")),
  56:    ethers.utils.keccak256(ethers.utils.toUtf8Bytes("BSC")),
};

export class VaultRouter {
  private contract: ethers.Contract;

  constructor(networkName: string) {
    const deployments = loadDeployments(networkName);
    const provider    = getProvider(networkName);
    const signer      = getSigner(provider);
    this.contract     = new ethers.Contract(deployments.FeeRouter, FeeRouterABI.abi, signer);
  }

  /**
   * Route the competition fee portion of a deposit to the correct vault.
   * Called after the main fee split has been processed.
   */
  async routeCompetitionFee(deposit: DepositMetadata): Promise<ethers.ContractTransaction> {
    // 0.5% of the deposit
    const competitionAmount = (deposit.amount * BigInt(5)) / BigInt(1000);

    const communityEntityId = deposit.communityId
      ? ethers.utils.keccak256(ethers.utils.toUtf8Bytes(deposit.communityId.toUpperCase()))
      : ethers.constants.HashZero;

    const chainEntityId = CHAIN_ENTITY_MAP[deposit.chainId] || ethers.constants.HashZero;

    console.log(`[VaultRouter] Routing ${competitionAmount} USDC competition fee`);
    console.log(`  Community: ${deposit.communityId || "none"} | Chain: ${deposit.chainId} | Round: ${deposit.roundType}`);

    const tx = await this.contract.routeFee(
      competitionAmount,
      communityEntityId,
      chainEntityId,
      deposit.roundType
    );

    console.log(`[VaultRouter] Fee routed. TX: ${tx.hash}`);
    return tx;
  }

  /**
   * Get active round id for a given round type.
   */
  async getActiveRound(roundType: number): Promise<string> {
    return this.contract.activeRound(roundType);
  }
}
