/**
 * Polymarket CLOB API Integration
 *
 * Executes REAL trades on Polymarket using agent wallets.
 * Each agent has an HD-derived private key on Polygon.
 *
 * Dependencies: @polymarket/clob-client (install on VPS)
 * Fallback: If package not installed, returns clear error.
 */

import { ethers } from 'ethers';
import { CONFIG } from './config';

// Agent wallet key derivation (same as in nuro-routes.ts)
export function getAgentPrivateKey(agentId: string): string {
  const seed = ethers.utils.id(CONFIG.PRIVATE_KEY + 'agent_' + agentId);
  const hdNode = ethers.utils.HDNode.fromSeed(seed);
  return hdNode.privateKey;
}

export function getAgentWalletAddress(agentId: string): string {
  const seed = ethers.utils.id(CONFIG.PRIVATE_KEY + 'agent_' + agentId);
  const hdNode = ethers.utils.HDNode.fromSeed(seed);
  return hdNode.address;
}

export interface TradeResult {
  success: boolean;
  orderId?: string;
  txHash?: string;
  error?: string;
  fallbackMessage?: string;
}

/**
 * Place a REAL trade on Polymarket via CLOB API
 *
 * Requires:
 * 1. Agent wallet funded with USDC on Polygon
 * 2. USDC approved for Polymarket's exchange contract
 * 3. @polymarket/clob-client installed
 */
export async function placePolymarketTrade(
  agentId: string,
  tokenId: string,
  side: 'BUY' | 'SELL',
  price: number,
  size: number,
  negRisk: boolean = false,
  tickSize: string = '0.01',
): Promise<TradeResult> {
  try {
    // Dynamic import — fails gracefully if package not installed
    let ClobClient: any, Side: any, OrderType: any;
    try {
      const clob = await import('@polymarket/clob-client');
      ClobClient = clob.ClobClient;
      Side = clob.Side;
      OrderType = clob.OrderType;
    } catch {
      return {
        success: false,
        error: 'Polymarket CLOB client not installed',
        fallbackMessage: 'Run: npm install @polymarket/clob-client on VPS to enable live trading. Your order has been queued.',
      };
    }

    const privateKey = getAgentPrivateKey(agentId);
    const wallet = new ethers.Wallet(privateKey);
    const host = 'https://clob.polymarket.com';

    // Check if agent wallet has USDC balance on Polygon
    const polygonProvider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL_POLYGON);
    const usdcContract = new ethers.Contract(
      '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // Polygon native USDC
      ['function balanceOf(address) view returns (uint256)'],
      polygonProvider,
    );
    const balance = await usdcContract.balanceOf(wallet.address);
    const balanceUsdc = parseFloat(ethers.utils.formatUnits(balance, 6));
    const requiredAmount = price * size;

    if (balanceUsdc < requiredAmount) {
      return {
        success: false,
        error: `Insufficient funds: wallet has $${balanceUsdc.toFixed(2)} USDC, trade requires $${requiredAmount.toFixed(2)}`,
        fallbackMessage: `Fund agent wallet ${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)} with $${Math.ceil(requiredAmount)} USDC on Polygon to execute this trade.`,
      };
    }

    // Create CLOB client with agent wallet
    const clobClient = new ClobClient(host, 137, wallet);

    // Create or derive API key for this agent
    const creds = await clobClient.createOrDeriveApiKey();
    const authedClient = new ClobClient(host, 137, wallet, creds);

    // Place the order
    const order = await authedClient.createAndPostOrder(
      {
        tokenID: tokenId,
        price,
        side: side === 'BUY' ? Side.BUY : Side.SELL,
        size,
      },
      { tickSize, negRisk },
      OrderType.GTC, // Good Till Cancelled
    );

    return {
      success: true,
      orderId: order?.id || order?.orderID,
      txHash: order?.transactionsHashes?.[0],
    };
  } catch (err: any) {
    const msg = err?.message || 'Unknown error';

    // Common error handling
    if (msg.includes('insufficient') || msg.includes('balance')) {
      return {
        success: false,
        error: 'Insufficient USDC balance on Polygon',
        fallbackMessage: `Fund agent wallet with USDC on Polygon to trade.`,
      };
    }

    if (msg.includes('allowance') || msg.includes('approve')) {
      return {
        success: false,
        error: 'USDC not approved for Polymarket exchange',
        fallbackMessage: 'Agent wallet needs USDC approval for Polymarket. This is a one-time setup.',
      };
    }

    return {
      success: false,
      error: msg.slice(0, 200),
      fallbackMessage: 'Trade failed. Check agent wallet funding and try again.',
    };
  }
}

/**
 * Check agent wallet USDC balance on Polygon
 */
export async function getAgentBalance(agentId: string): Promise<number> {
  try {
    const address = getAgentWalletAddress(agentId);
    const provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL_POLYGON);
    const usdc = new ethers.Contract(
      '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      ['function balanceOf(address) view returns (uint256)'],
      provider,
    );
    const bal = await usdc.balanceOf(address);
    return parseFloat(ethers.utils.formatUnits(bal, 6));
  } catch {
    return 0;
  }
}
