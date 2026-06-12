import cron from "node-cron";
import { ethers } from "ethers";
import { getProvider, getSigner } from "../utils/provider";
import { loadDeployments } from "../utils/deployments";
import CompetitionEngineABI from "../../artifacts/contracts/core/CompetitionEngine.sol/CompetitionEngine.json";
import { YieldExecutor } from "../yield/yieldExecutor";
import { LotteryService } from "../lottery/lotteryService";
import { db } from "../utils/db";

/**
 * RoundManager
 * Manages the full lifecycle of competition rounds via cron jobs.
 * Opens rounds, tracks time, triggers settlement, and coordinates yield + lottery.
 */

export enum RoundType { DAILY = 0, WEEKLY = 1, MONTHLY = 2, QUARTERLY = 3, ANNUAL = 4 }
export enum BracketTier { MICRO = 0, EMERGING = 1, GROWTH = 2, MAJOR = 3, INSTITUTIONAL = 4 }

// Round durations in seconds
const ROUND_DURATIONS: Record<RoundType, number> = {
  [RoundType.DAILY]:     86400,
  [RoundType.WEEKLY]:    604800,
  [RoundType.MONTHLY]:   2592000,
  [RoundType.QUARTERLY]: 7776000,
  [RoundType.ANNUAL]:    31536000,
};

// Default yield strategy per round type
const DEFAULT_STRATEGY: Record<RoundType, string> = {
  [RoundType.DAILY]:     "AAVE_V3_USDC",
  [RoundType.WEEKLY]:    "AAVE_V3_USDC",
  [RoundType.MONTHLY]:   "AAVE_V3_USDC",
  [RoundType.QUARTERLY]: "AAVE_V3_USDC",
  [RoundType.ANNUAL]:    "AAVE_V3_USDC",
};

export class RoundManager {
  private contract:       ethers.Contract;
  private yieldExecutor:  YieldExecutor;
  private lotteryService: LotteryService;
  private networkName:    string;

  constructor(networkName: string) {
    this.networkName    = networkName;
    const deployments   = loadDeployments(networkName);
    const provider      = getProvider(networkName);
    const signer        = getSigner(provider);
    this.contract       = new ethers.Contract(deployments.CompetitionEngine, CompetitionEngineABI.abi, signer);
    this.yieldExecutor  = new YieldExecutor(networkName);
    this.lotteryService = new LotteryService(networkName);
  }

  /**
   * Start all cron jobs for round management.
   */
  startCronJobs() {
    // Daily rounds: open at midnight UTC
    cron.schedule("0 0 * * *", () => this.openRoundsForType(RoundType.DAILY));

    // Weekly rounds: open Monday midnight UTC
    cron.schedule("0 0 * * 1", () => this.openRoundsForType(RoundType.WEEKLY));

    // Monthly rounds: first of month
    cron.schedule("0 0 1 * *", () => this.openRoundsForType(RoundType.MONTHLY));

    // Quarterly: Jan/Apr/Jul/Oct 1st
    cron.schedule("0 0 1 1,4,7,10 *", () => this.openRoundsForType(RoundType.QUARTERLY));

    // Annual: Jan 1st
    cron.schedule("0 0 1 1 *", () => this.openRoundsForType(RoundType.ANNUAL));

    // Settlement check: every hour
    cron.schedule("0 * * * *", () => this.checkAndSettleExpiredRounds());

    // Bracket recalculation: daily at 23:00 UTC (before new rounds open)
    cron.schedule("0 23 * * *", () => this.recalculateBrackets());

    console.log("[RoundManager] Cron jobs started.");
  }

  /**
   * Open new competition rounds for each active bracket tier.
   */
  async openRoundsForType(roundType: RoundType) {
    console.log(`[RoundManager] Opening ${RoundType[roundType]} rounds...`);

    const activeTiers = await db.query(
      "SELECT DISTINCT current_tier FROM communities WHERE is_active = true"
    );

    const deployments   = loadDeployments(this.networkName);
    const strategyId    = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(DEFAULT_STRATEGY[roundType]));
    const strategyAddr  = deployments[`STRATEGY_ADDR_${DEFAULT_STRATEGY[roundType]}`] || ethers.constants.AddressZero;
    const duration      = ROUND_DURATIONS[roundType];

    for (const row of activeTiers.rows) {
      const tier = parseInt(row.current_tier);
      try {
        const tx = await this.contract.openRound(roundType, tier, duration, strategyAddr);
        const receipt = await tx.wait();
        const event = receipt.events?.find((e: any) => e.event === "RoundOpened");
        const roundId = event?.args?.roundId;

        if (roundId) {
          await this.contract.activateRound(roundId);
          await db.query(
            "INSERT INTO rounds (round_id, round_type, bracket_tier, status, start_time, end_time) VALUES ($1,$2,$3,$4,NOW(),NOW()+INTERVAL '$5 seconds')",
            [roundId, roundType, tier, "ACCUMULATING", duration]
          );
          console.log(`[RoundManager] Opened round ${roundId} | Type: ${RoundType[roundType]} | Tier: ${BracketTier[tier]}`);
        }
      } catch (e) {
        console.error(`[RoundManager] Failed to open round for tier ${tier}:`, e);
      }
    }
  }

  /**
   * Check for expired rounds and settle them.
   */
  async checkAndSettleExpiredRounds() {
    const expired = await db.query(
      "SELECT round_id, round_type FROM rounds WHERE status = 'ACCUMULATING' AND end_time <= NOW()"
    );

    for (const row of expired.rows) {
      console.log(`[RoundManager] Settling expired round: ${row.round_id}`);
      await this.settleRound(row.round_id, parseInt(row.round_type));
    }
  }

  async settleRound(roundId: string, roundType: RoundType) {
    try {
      // Harvest yield first
      const { principal, yield: yieldAmount } = await this.yieldExecutor.harvestRound(roundId);
      console.log(`[RoundManager] Harvested: principal=${principal} yield=${yieldAmount}`);

      // Get participant ids for this round from DB
      const participants = await db.query(
        "SELECT DISTINCT entity_id FROM vault_balances WHERE round_id = $1",
        [roundId]
      );
      const participantIds = participants.rows.map((r: any) => r.entity_id);

      const tx = await this.contract.settleRound(roundId, participantIds, yieldAmount);
      await tx.wait();

      await db.query("UPDATE rounds SET status='CLOSED' WHERE round_id=$1", [roundId]);
      console.log(`[RoundManager] Round ${roundId} settled.`);

      // Trigger lottery if enabled for this round type
      await this.lotteryService.maybeFireScheduledLottery(roundId, roundType);

    } catch (e) {
      console.error(`[RoundManager] Settlement failed for ${roundId}:`, e);
    }
  }

  /**
   * Recalculate bracket tiers for all communities based on trailing 30-day spend.
   */
  async recalculateBrackets() {
    console.log("[RoundManager] Recalculating bracket tiers...");
    const communities = await db.query(
      `SELECT id, entity_id, spend_30d FROM communities WHERE is_active = true`
    );

    for (const c of communities.rows) {
      const tier = this.spendToTier(BigInt(c.spend_30d));
      await this.contract.assignCommunityBracket(c.entity_id, tier);
      await db.query("UPDATE communities SET current_tier=$1 WHERE id=$2", [tier, c.id]);
    }
    console.log(`[RoundManager] Bracket recalculation complete for ${communities.rowCount} communities.`);
  }

  private spendToTier(spend30d: bigint): BracketTier {
    const USDC = BigInt(1e6);
    if (spend30d <= BigInt(100_000) * USDC)       return BracketTier.MICRO;
    if (spend30d <= BigInt(1_000_000) * USDC)     return BracketTier.EMERGING;
    if (spend30d <= BigInt(10_000_000) * USDC)    return BracketTier.GROWTH;
    if (spend30d <= BigInt(100_000_000) * USDC)   return BracketTier.MAJOR;
    return BracketTier.INSTITUTIONAL;
  }

  /**
   * Manual admin: open, pause, resume, or settle a specific round.
   */
  async adminOpenRound(roundType: RoundType, tier: BracketTier, durationSeconds?: number): Promise<string> {
    const deployments  = loadDeployments(this.networkName);
    const strategyAddr = deployments[`STRATEGY_ADDR_${DEFAULT_STRATEGY[roundType]}`] || ethers.constants.AddressZero;
    const duration     = durationSeconds || ROUND_DURATIONS[roundType];
    const tx           = await this.contract.openRound(roundType, tier, duration, strategyAddr);
    const receipt      = await tx.wait();
    const event        = receipt.events?.find((e: any) => e.event === "RoundOpened");
    return event?.args?.roundId;
  }

  async adminPauseRound(roundId: string)  { return this.contract.pauseRound(roundId); }
  async adminResumeRound(roundId: string) { return this.contract.resumeRound(roundId); }
  async adminSettleRound(roundId: string, roundType: RoundType) { return this.settleRound(roundId, roundType); }
}
