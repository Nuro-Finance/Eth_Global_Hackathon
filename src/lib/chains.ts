/**
 * Shared chain registry. Canonical source for per-chain facts that monitor,
 * bridge, admin console, and any new deposit flow should agree on.
 *
 * Currently scoped to USDC decimals — the one mismatch that cost us 3 hours
 * during Session 22's BSC incident (monitor hardcoded 6-dec, BSC uses 18-dec
 * Binance-Peg USDC → displayed real $0.04 as $40,000,000,000).
 *
 * Future expansion: chain metadata (name, usdcAddress, cctpDomain, lzEid, rpcUrl)
 * should consolidate here as the 23-chain matrix is tested. Do NOT copy-paste
 * chain facts into individual files — add them here and import.
 */

/**
 * USDC token decimals by chain ID.
 * All chains use native 6-decimal USDC except BSC, which uses Binance-Peg
 * USDC (18 decimals) at 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d.
 */
export const DECIMALS_BY_CHAIN: Record<number, number> = {
    56: 18, // BSC — Binance-Peg USDC
};

/**
 * Returns the USDC decimals for a given chain ID.
 * Defaults to 6 for any chain not in the override map (the native USDC standard).
 */
export function getChainDecimals(chainId: number): number {
    return DECIMALS_BY_CHAIN[chainId] ?? 6;
}

/**
 * Chains where a deposit will actually settle to the user's card.
 *
 * Settlement path is CCTP-only at the moment: source-chain USDC →
 * burn-and-attest via Circle → mint on Base → SD3 credits the card.
 * LayerZero OFT path exists in src/bridge.ts but is disabled
 * (LZ_BRIDGE_ENABLED=false) post-Kelp-hardening pending (1) MyOFTAdapter
 * v2 deploy, (2) multi-DVN config verify, (3) reserve monitor live.
 *
 * Any chain NOT in this list will accept a deposit (monitor still
 * detects it) but bridging-to-Base will fail and the card will not
 * credit. For the FE we use this as a hard gate on the Reload picker —
 * we don't surface a chain we can't settle from.
 *
 * Source of truth: CCTP V1 native-USDC chains.
 */
export const SETTLEMENT_SUPPORTED_CHAIN_IDS = new Set<number>([
    1,      // Ethereum
    8453,   // Base
    42161,  // Arbitrum
    10,     // Optimism
    137,    // Polygon (native USDC)
    43114,  // Avalanche
])

/**
 * Display-name set matching SETTLEMENT_SUPPORTED_CHAIN_IDS for FE filters
 * that work in chain-name space. Keys mirror CHAIN_NAME_TO_ID below.
 */
export const SETTLEMENT_SUPPORTED_CHAIN_NAMES = new Set<string>([
    "Ethereum",
    "Base",
    "Arbitrum",
    "Optimism",
    "Polygon",
    "Avalanche",
])

/**
 * Display name → EVM chain ID. Canonical source for FE components that
 * need to convert a human-readable chain name into the numeric ID required
 * by wagmi (`switchChain`, `useChainId`) or by the backend aggregator.
 *
 * EVM-only — Solana is intentionally NOT included here because (a) it's
 * not an EVM chain (no real chainId) and (b) call sites that ALSO handle
 * Solana use a per-call sentinel convention (-1 for ReloadFlow's
 * aggregator dispatch; 0 for admin/transactions table rendering). Mixing
 * those into this map invites the very drift this consolidation is trying
 * to prevent.
 *
 * Includes "BASE" alias for legacy callers that uppercase the name.
 */
export const CHAIN_NAME_TO_ID: Record<string, number> = {
    Ethereum: 1,
    Optimism: 10,
    BSC: 56,
    Polygon: 137,
    Sonic: 146,
    Unichain: 130,
    Monad: 143,
    Sei: 1329,
    XDC: 50,
    Gnosis: 100,
    "World Chain": 480,
    Linea: 59144,
    Scroll: 534352,
    Base: 8453,
    BASE: 8453, // alias — some upstream callers uppercase
    Arbitrum: 42161,
    Celo: 42220,
    Avalanche: 43114,
    zkSync: 324,
    HyperEVM: 999,
    Ink: 57073,
    Codex: 81224,
    Plume: 98866,
};
