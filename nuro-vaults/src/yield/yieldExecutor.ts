import { ethers } from "ethers";
import { getProvider, getSigner } from "../utils/provider";
import { loadDeployments } from "../utils/deployments";
import YieldRouterABI from "../../artifacts/contracts/core/YieldRouter.sol/YieldRouter.json";

export class YieldExecutor {
  private contract: ethers.Contract;

  constructor(networkName: string) {
    const deployments = loadDeployments(networkName);
    const provider    = getProvider(networkName);
    const signer      = getSigner(provider);
    this.contract     = new ethers.Contract(deployments.YieldRouter, YieldRouterABI.abi, signer);
  }

  async deployRound(roundId: string, strategyIdStr: string, amount: bigint) {
    const strategyId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(strategyIdStr));
    const tx = await this.contract.deployYield(roundId, strategyId, amount);
    await tx.wait();
    console.log(`[YieldExecutor] Deployed ${amount} for round ${roundId} via ${strategyIdStr}`);
  }

  async harvestRound(roundId: string): Promise<{ principal: bigint; yield: bigint }> {
    const tx = await this.contract.harvestYield(roundId);
    const receipt = await tx.wait();
    const event = receipt.events?.find((e: any) => e.event === "YieldHarvested");
    return {
      principal: event?.args?.principal?.toBigInt() || BigInt(0),
      yield:     event?.args?.yield?.toBigInt()     || BigInt(0),
    };
  }

  async emergencyWithdraw(roundId: string) {
    console.warn(`[YieldExecutor] EMERGENCY WITHDRAW for round ${roundId}`);
    const tx = await this.contract.emergencyWithdraw(roundId);
    await tx.wait();
  }
}
