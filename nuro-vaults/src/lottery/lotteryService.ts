import { ethers } from "ethers";
import { getProvider, getSigner } from "../utils/provider";
import { loadDeployments } from "../utils/deployments";
import LotteryEngineABI from "../../artifacts/contracts/core/LotteryEngine.sol/LotteryEngine.json";
import { db } from "../utils/db";
import { RoundType } from "../competition/roundManager";

export class LotteryService {
  private contract: ethers.Contract;

  constructor(networkName: string) {
    const deployments = loadDeployments(networkName);
    const provider    = getProvider(networkName);
    const signer      = getSigner(provider);
    this.contract     = new ethers.Contract(deployments.LotteryEngine, LotteryEngineABI.abi, signer);
  }

  /**
   * Fire scheduled lottery if enabled for this round type.
   */
  async maybeFireScheduledLottery(roundId: string, roundType: RoundType) {
    const enabled = await this.contract.scheduledLotteryEnabled(roundType);
    if (!enabled) {
      console.log(`[LotteryService] Scheduled lottery disabled for round type ${roundType}`);
      return;
    }
    await this.fireLottery(roundId, roundType);
  }

  /**
   * Fire lottery for a round. Registers eligible users then initiates VRF request.
   */
  async fireLottery(roundId: string, roundType: RoundType, potAmount?: bigint) {
    console.log(`[LotteryService] Firing lottery for round ${roundId}`);

    // Get eligible users (any user who deposited during the round)
    const eligible = await db.query(
      "SELECT DISTINCT user_address FROM deposits WHERE round_id = $1",
      [roundId]
    );

    if (eligible.rowCount === 0) {
      console.log("[LotteryService] No eligible users, skipping lottery.");
      return;
    }

    const users = eligible.rows.map((r: any) => r.user_address);
    await this.contract.addEligibleUsersBatch(roundId, users);
    console.log(`[LotteryService] Added ${users.length} eligible users`);

    // Calculate pot: reservePotPct% of reserve vault balance
    const reservePct = await this.contract.reservePotPct();
    const pot = potAmount || await this.calculateLotteryPot(reservePct);

    const tx = await this.contract.initiateLottery(roundId, pot, roundType);
    await tx.wait();
    console.log(`[LotteryService] Lottery initiated. VRF request pending.`);

    await db.query(
      "INSERT INTO lottery_entries (round_id, eligible_count, pot_amount, status) VALUES ($1,$2,$3,'PENDING')",
      [roundId, users.length, pot.toString()]
    );
  }

  private async calculateLotteryPot(reservePct: number): Promise<bigint> {
    // Fetch current reserve vault balance from DB
    const res = await db.query(
      "SELECT balance FROM vault_balances WHERE entity_id = $1 ORDER BY created_at DESC LIMIT 1",
      [ethers.utils.keccak256(ethers.utils.toUtf8Bytes("RESERVE"))]
    );
    const balance = BigInt(res.rows[0]?.balance || 0);
    return (balance * BigInt(reservePct)) / BigInt(100);
  }

  async setWinnerCount(roundType: RoundType, count: number) {
    return this.contract.setWinnerCount(roundType, count);
  }

  async toggleScheduledLottery(roundType: RoundType, enabled: boolean) {
    return this.contract.toggleScheduledLottery(roundType, enabled);
  }

  async setReservePotPct(pct: number) {
    return this.contract.setReservePotPct(pct);
  }
}
