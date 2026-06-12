import express, { Request, Response, NextFunction } from "express";
import { ethers } from "ethers";
import { RoundManager, RoundType, BracketTier } from "../competition/roundManager";
import { LotteryService } from "../lottery/lotteryService";
import { YieldExecutor } from "../yield/yieldExecutor";
import { db } from "../utils/db";

/**
 * AdminService
 * Express router exposing all admin API endpoints consumed by the admin panel.
 * All routes require HMAC signature from deployer wallet.
 */

const ADMIN_ADDRESSES = (process.env.ADMIN_ADDRESSES || "").toLowerCase().split(",");

function requireAdminSig(req: Request, res: Response, next: NextFunction) {
  const signature = req.headers["x-admin-signature"] as string;
  const message   = req.headers["x-admin-message"]   as string;
  if (!signature || !message) return res.status(401).json({ error: "Missing admin signature" });
  try {
    const recovered = ethers.utils.verifyMessage(message, signature).toLowerCase();
    if (!ADMIN_ADDRESSES.includes(recovered)) return res.status(403).json({ error: "Unauthorized address" });
    next();
  } catch {
    res.status(401).json({ error: "Invalid signature" });
  }
}

export function createAdminRouter(networkName: string): express.Router {
  const router         = express.Router();
  const roundManager   = new RoundManager(networkName);
  const lotteryService = new LotteryService(networkName);
  const yieldExecutor  = new YieldExecutor(networkName);

  router.use(requireAdminSig);

  // --- ROUNDS ---
  router.post("/rounds/open", async (req, res) => {
    const { roundType, tier, durationSeconds } = req.body;
    const roundId = await roundManager.adminOpenRound(roundType as RoundType, tier as BracketTier, durationSeconds);
    res.json({ success: true, roundId });
  });

  router.post("/rounds/:roundId/pause", async (req, res) => {
    await roundManager.adminPauseRound(req.params.roundId);
    res.json({ success: true });
  });

  router.post("/rounds/:roundId/resume", async (req, res) => {
    await roundManager.adminResumeRound(req.params.roundId);
    res.json({ success: true });
  });

  router.post("/rounds/:roundId/settle", async (req, res) => {
    const { roundType } = req.body;
    await roundManager.adminSettleRound(req.params.roundId, roundType);
    res.json({ success: true });
  });

  router.get("/rounds", async (_req, res) => {
    const rows = await db.query("SELECT * FROM rounds ORDER BY start_time DESC LIMIT 100");
    res.json(rows.rows);
  });

  // --- LOTTERY ---
  router.post("/lottery/fire", async (req, res) => {
    const { roundId, roundType, potAmount } = req.body;
    await lotteryService.fireLottery(roundId, roundType, potAmount ? BigInt(potAmount) : undefined);
    res.json({ success: true });
  });

  router.post("/lottery/config", async (req, res) => {
    const { roundType, winnerCount, scheduledEnabled, reservePotPct } = req.body;
    if (winnerCount !== undefined)      await lotteryService.setWinnerCount(roundType, winnerCount);
    if (scheduledEnabled !== undefined) await lotteryService.toggleScheduledLottery(roundType, scheduledEnabled);
    if (reservePotPct !== undefined)    await lotteryService.setReservePotPct(reservePotPct);
    res.json({ success: true });
  });

  // --- VAULTS ---
  router.get("/vaults", async (_req, res) => {
    const rows = await db.query("SELECT * FROM vault_balances ORDER BY balance DESC");
    res.json(rows.rows);
  });

  router.post("/vaults/emergency-withdraw", async (req, res) => {
    const { roundId } = req.body;
    await yieldExecutor.emergencyWithdraw(roundId);
    res.json({ success: true });
  });

  // --- CREDITS ---
  router.get("/credits/:userAddress", async (req, res) => {
    const rows = await db.query(
      "SELECT * FROM spending_credits WHERE user_address = $1 AND expiry > NOW()",
      [req.params.userAddress.toLowerCase()]
    );
    res.json(rows.rows);
  });

  router.post("/credits/clear", async (req, res) => {
    const { userAddress } = req.body;
    await db.query("DELETE FROM spending_credits WHERE user_address = $1", [userAddress.toLowerCase()]);
    res.json({ success: true });
  });

  // --- COMMUNITIES ---
  router.get("/communities", async (_req, res) => {
    const rows = await db.query("SELECT * FROM communities ORDER BY spend_30d DESC");
    res.json(rows.rows);
  });

  router.post("/communities/register", async (req, res) => {
    const { id, name, tokenContract } = req.body;
    const entityId = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(id.toUpperCase()));
    await db.query(
      "INSERT INTO communities (id, entity_id, name, token_contract, current_tier, spend_30d, member_count, is_active) VALUES ($1,$2,$3,$4,0,0,0,true)",
      [id.toUpperCase(), entityId, name, tokenContract || null]
    );
    res.json({ success: true, entityId });
  });

  router.post("/communities/:id/toggle", async (req, res) => {
    await db.query("UPDATE communities SET is_active = NOT is_active WHERE id=$1", [req.params.id]);
    res.json({ success: true });
  });

  router.post("/communities/:id/bracket", async (req, res) => {
    const { tier } = req.body;
    const community = await db.query("SELECT entity_id FROM communities WHERE id=$1", [req.params.id]);
    if (!community.rowCount) return res.status(404).json({ error: "Not found" });
    await roundManager["contract"].assignCommunityBracket(community.rows[0].entity_id, tier);
    await db.query("UPDATE communities SET current_tier=$1 WHERE id=$2", [tier, req.params.id]);
    res.json({ success: true });
  });

  return router;
}
