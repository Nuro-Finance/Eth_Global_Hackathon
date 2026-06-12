/**
 * Alpha Bot — Passive Polymarket Trading Strategy
 *
 * Default bot for ALL users. Runs as a background process in the monitor.
 * Only trades when the agent wallet is funded with USDC on Polygon.
 *
 * Strategy: "High Confidence Passive"
 * 1. Fetches trending markets from Polymarket Gamma API
 * 2. Filters for markets with extreme odds (>85% YES or <15% YES)
 * 3. Buys the high-confidence side at a discount
 * 4. Risk management: max bet per market, daily limit, no duplicate bets
 *
 * Flow:
 * - Monitor calls runAlphaBotCycle() every poll cycle
 * - Checks all active Alpha Bots with funded wallets
 * - Places bets via Polymarket CLOB API
 * - Records bets in agent_bets table
 * - Profits auto-swept by monitor's sweepAgentWallets()
 */

import axios from 'axios';
import { Pool } from 'pg';
import { placePolymarketTrade, getAgentBalance } from './polymarket';

const GAMMA_API = 'https://gamma-api.polymarket.com/markets';

// Strategy parameters
const MIN_CONFIDENCE = 0.85; // Only bet on markets with >85% one side
const MAX_BET_PER_MARKET = 5; // Max $5 per market
const MIN_WALLET_BALANCE = 1; // Don't trade if <$1 USDC
const MAX_DAILY_BETS = 10; // Max 10 bets per day per agent
const MIN_VOLUME = 50000; // Only bet on markets with >$50K volume

interface GammaMarket {
  id: string;
  question: string;
  slug: string;
  outcomes: string[];
  outcomePrices: string;
  volume: string;
  volume24hr: string;
  active: boolean;
  closed: boolean;
  endDate: string;
  tokens?: Array<{ token_id: string; outcome: string }>;
}

interface AlphaOpportunity {
  marketId: string;
  question: string;
  outcome: 'Yes' | 'No';
  price: number; // Entry price (e.g. 0.88 for 88%)
  confidence: number; // How confident (0-1)
  volume24h: number;
  tokenId?: string;
}

/**
 * Fetch high-confidence opportunities from Polymarket
 */
async function findOpportunities(): Promise<AlphaOpportunity[]> {
  try {
    const res = await axios.get(GAMMA_API, {
      params: { limit: 50, active: true, closed: false, order: 'volume24hr', ascending: false },
    });

    const markets: GammaMarket[] = res.data;
    const opportunities: AlphaOpportunity[] = [];

    for (const market of markets) {
      if (!market.active || market.closed) continue;

      const vol24h = parseFloat(market.volume24hr || '0');
      if (vol24h < MIN_VOLUME) continue;

      // Parse prices
      let yesPrice = 0;
      try {
        const prices = typeof market.outcomePrices === 'string'
          ? JSON.parse(market.outcomePrices)
          : market.outcomePrices;
        yesPrice = parseFloat(prices[0]) || 0;
      } catch { continue; }

      const noPrice = 1 - yesPrice;

      // Find token IDs if available
      const yesTokenId = market.tokens?.find(t => t.outcome === 'Yes')?.token_id;
      const noTokenId = market.tokens?.find(t => t.outcome === 'No')?.token_id;

      // High confidence YES (>85%)
      if (yesPrice >= MIN_CONFIDENCE) {
        opportunities.push({
          marketId: market.id,
          question: market.question,
          outcome: 'Yes',
          price: yesPrice,
          confidence: yesPrice,
          volume24h: vol24h,
          tokenId: yesTokenId,
        });
      }

      // High confidence NO (YES < 15%, meaning NO > 85%)
      if (noPrice >= MIN_CONFIDENCE) {
        opportunities.push({
          marketId: market.id,
          question: market.question,
          outcome: 'No',
          price: noPrice,
          confidence: noPrice,
          volume24h: vol24h,
          tokenId: noTokenId,
        });
      }
    }

    // Sort by confidence (highest first)
    return opportunities.sort((a, b) => b.confidence - a.confidence);
  } catch (err: any) {
    console.error('[alpha-bot] Failed to fetch opportunities:', err.message?.slice(0, 80));
    return [];
  }
}

/**
 * Run one cycle of the Alpha Bot for a specific agent
 */
async function runForAgent(
  pool: Pool,
  agent: { id: string; user_id: string; risk_limit: string; name: string },
  opportunities: AlphaOpportunity[],
): Promise<number> {
  let betsPlaced = 0;

  // Check wallet balance
  const balance = await getAgentBalance(agent.id);
  if (balance < MIN_WALLET_BALANCE) return 0;

  // Check how many bets placed today
  const todayBets = await pool.query(
    `SELECT COUNT(*) as count FROM agent_bets
     WHERE agent_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
    [agent.id],
  );
  const todayCount = parseInt(todayBets.rows[0]?.count || '0');
  if (todayCount >= MAX_DAILY_BETS) return 0;

  // Check which markets we already bet on
  const existingBets = await pool.query(
    `SELECT market_id FROM agent_bets
     WHERE agent_id = $1 AND status IN ('open', 'queued')`,
    [agent.id],
  );
  const betMarkets = new Set(existingBets.rows.map((r: any) => r.market_id));

  const maxBet = Math.min(MAX_BET_PER_MARKET, Number(agent.risk_limit), balance / 2);

  for (const opp of opportunities) {
    if (betsPlaced + todayCount >= MAX_DAILY_BETS) break;
    if (betMarkets.has(opp.marketId)) continue; // Already bet on this market
    if (maxBet < 0.5) break; // Not enough to bet

    // Calculate bet size based on confidence
    const betSize = Math.min(maxBet, opp.confidence * MAX_BET_PER_MARKET);
    if (betSize < 0.5) continue;

    console.log(`[alpha-bot] ${agent.name}: Betting $${betSize.toFixed(2)} on "${opp.question}" → ${opp.outcome} @ ${(opp.confidence * 100).toFixed(0)}%`);

    // Attempt real trade
    let status = 'queued';
    let txHash: string | null = null;

    if (opp.tokenId) {
      const result = await placePolymarketTrade(
        agent.id,
        opp.tokenId,
        'BUY',
        opp.price,
        betSize,
      );
      if (result.success) {
        status = 'open';
        txHash = result.txHash || null;
        console.log(`[alpha-bot] ${agent.name}: Trade executed! Order: ${result.orderId}`);
      } else {
        console.log(`[alpha-bot] ${agent.name}: Trade queued — ${result.fallbackMessage}`);
      }
    }

    // Record the bet
    await pool.query(
      `INSERT INTO agent_bets (id, agent_id, user_id, market_id, market_question, outcome, amount, entry_price, status, tx_hash)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [agent.id, agent.user_id, opp.marketId, opp.question, opp.outcome, betSize, opp.price, status, txHash],
    );

    // Update invested total only for real trades
    if (status === 'open') {
      await pool.query(
        'UPDATE agents SET total_invested = total_invested + $1, updated_at = now() WHERE id = $2',
        [betSize, agent.id],
      );
    }

    betsPlaced++;
    betMarkets.add(opp.marketId);
  }

  return betsPlaced;
}

/**
 * Main entry point — called by monitor on each poll cycle
 */
export async function runAlphaBotCycle(pool: Pool): Promise<void> {
  try {
    // Find all active Alpha Bots
    const agents = await pool.query(
      `SELECT id, user_id, risk_limit, name FROM agents
       WHERE status = 'active' AND type = 'polymarket'
       AND (strategy->>'mode' = 'passive' OR name = 'Alpha Bot')`,
    );

    if (!agents.rows.length) return;

    // Fetch opportunities once (shared across all agents)
    const opportunities = await findOpportunities();
    if (!opportunities.length) {
      console.log('[alpha-bot] No high-confidence opportunities found');
      return;
    }

    console.log(`[alpha-bot] Found ${opportunities.length} opportunities for ${agents.rows.length} agents`);

    let totalBets = 0;
    for (const agent of agents.rows) {
      const bets = await runForAgent(pool, agent, opportunities);
      totalBets += bets;
    }

    if (totalBets > 0) {
      console.log(`[alpha-bot] Placed ${totalBets} total bets across ${agents.rows.length} agents`);
    }
  } catch (err: any) {
    console.error('[alpha-bot] Cycle error:', err.message?.slice(0, 100));
  }
}
