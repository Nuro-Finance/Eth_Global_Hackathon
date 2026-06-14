import dotenv from "dotenv"
dotenv.config()

export const CONFIG = {
    PORT: process.env.PORT || 3000,
    ISSUER_API_BASE: process.env.ISSUER_API_BASE!,
    ISSUER_API_KEY: process.env.ISSUER_API_KEY!,
 // Per-card chat is BYOK-only (user key via POST /cards/:id/chat).
 // ANTHROPIC_API_KEY retained for self-learn reports + legacy; not used for card chat.
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
    BASE_RPC_URL: process.env.BASE_RPC_URL!,
    RPC_URL_ETHEREUM: process.env.RPC_URL_ETHEREUM!,
    RPC_URL_ARBITRUM: process.env.RPC_URL_ARBITRUM!,
    RPC_URL_OPTIMISM: process.env.RPC_URL_OPTIMISM!,
    RPC_URL_POLYGON: process.env.RPC_URL_POLYGON!,
    RPC_URL_AVALANCHE: process.env.RPC_URL_AVALANCHE!,
    RPC_URL_BSC: process.env.RPC_URL_BSC!,
    RPC_URL_HYPEREVM: "https://rpc.hyperliquid.xyz/evm",
    USDC_SOLANA: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    SOLANA_PRIVATE_KEY: process.env.SOLANA_PRIVATE_KEY!,
    SOLANA_FEE_VAULT: process.env.SOLANA_FEE_VAULT || '',
    CIRCLE_API_KEY: process.env.CIRCLE_API_KEY!,
    CCTP_TOKEN_MESSENGER_SOLANA: 'CCTPiPYPc6AsJuwueEnWgSgucamXDZwBd53dQ11YiKX3',
    CCTP_MESSAGE_TRANSMITTER_SOLANA: 'CCTPmbSD7gX1bxKPAmg77w8oFzNFpaQiQUWD43TKaecd',
    CCTP_TOKEN_MESSENGER_BASE: '0x1682Ae6375C4E4A97e4B583BC394c861A46D8962',
    CCTP_MESSAGE_TRANSMITTER_BASE: '0xAD09780d193884d503182aD4588450C416D6F9D4',
    CCTP_DOMAIN_BASE: 6,

    PRIVATE_KEY: process.env.PRIVATE_KEY!,
    FEE_VAULT_ADDRESS: process.env.FEE_VAULT_ADDRESS!,
    FEE_PERCENT: Number(process.env.FEE_PERCENT) || 5,
    BASE_CHAIN_ID: 8453,
    ARBITRUM_CHAIN_ID: 42161,
    HYPEREVM_CHAIN_ID: 999,
    USDC_BASE: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    USDC_ARBITRUM: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    USDC_POLYGON: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    USDC_HYPEREVM: "0xb88339CB7199b77E23DB6E890353E22632Ba630f",
    WHYPE: "0x5555555555555555555555555555555555555555",
    HYPERSWAP_V3_ROUTER: "0x6D99e7f6747AF2cDbB5164b6DD50e40D4fDe1e77",
    HYPERSWAP_V3_QUOTER: "0x03A918028f22D9E1473B7959C927AD7425A45C7C",
    ACROSS_SPOKE_POOL_HYPEREVM: "0x35E63eA3eb0fb7A3bc543C71FB66412e1F6B0E04",
    ALCHEMY_GAS_POLICY_ID: process.env.ALCHEMY_GAS_POLICY_ID!,
    POSTGRES_URL: process.env.POSTGRES_URL!,
    ISSUER_WEBHOOK_SECRET: process.env.ISSUER_WEBHOOK_SECRET,
    ISSUER_WEBHOOK_OBSERVE_ONLY: process.env.ISSUER_WEBHOOK_OBSERVE_ONLY === 'true',
    CREATOR_STAKE_USD: Number(process.env.CREATOR_STAKE_USD) || 5.0,
    CREATOR_REWARD_PCT: Number(process.env.CREATOR_REWARD_PCT) || 0.5,

 // Sprint 2.3 - bot execution
    POLYGON_CHAIN_ID: 137,
    AGENT_MIN_SWEEP_USD: Number(process.env.AGENT_MIN_SWEEP_USD) || 2.0,
    AGENT_PNL_DRIFT_ALERT_USD: Number(process.env.AGENT_PNL_DRIFT_ALERT_USD) || 0.5,
    AGENT_FUNDING_OBSERVE_ONLY: process.env.AGENT_FUNDING_OBSERVE_ONLY !== 'false',  // default true pre-funding
    AGENT_CLOB_TRADES_ENABLED: process.env.AGENT_CLOB_TRADES_ENABLED === 'true',     // default false pre-funding
    AGENT_PROFIT_SWEEP_ENABLED: process.env.AGENT_PROFIT_SWEEP_ENABLED === 'true',   // default false; live Polygon→Base CCTP per active agent

 // Monitor polling interval (ms). Default 86400000 = 24h = paused.
 // Set POLL_INTERVAL_MS=60000 in .env to actively poll every 60s.
 // Replaces the prior VPS sed-edit workflow which broke on every git pull (Session 22).
 // Minimum enforced: 15000ms (15s) - anything lower risks rate-limiting.
    POLL_INTERVAL_MS: Math.max(15000, Number(process.env.POLL_INTERVAL_MS) || 86400000),

 // Session 23 Marathon 7 - Native/memecoin → USDC auto-swap on deposit.
 // 0x Aggregator v2 API key. Sign up at dashboard.0x.org (free: 1M req/mo).
 // Without this set, swap path is disabled - monitor still works for USDC.
    ZEROX_API_KEY: process.env.ZEROX_API_KEY || '',
 // Slippage in basis points. 300 = 3% - MVP default (Session 23).
    ZEROX_SLIPPAGE_BPS: Number(process.env.ZEROX_SLIPPAGE_BPS) || 300,
 // Minimum USD value to auto-swap. Below this, dust accumulates - don't spend
 // gas on a $2 swap. MVP default: $5.
    SWAP_MIN_USD: Number(process.env.SWAP_MIN_USD) || 5,
 // Enables the new native-token polling cycle in monitor.ts. Off by default
 // until 0x API key is set; flip to 'true' in VPS .env when ready.
    NATIVE_SWAP_ENABLED: process.env.NATIVE_SWAP_ENABLED === 'true',
 // Session 23 Thread D - ERC-20 allowlist swap polling. When true, monitor
 // iterates ERC20_ALLOWLIST entries per chain and triggers swap-to-USDC.
 // Applies to `bluechip`-category tokens (LINK, UNI, WBTC, WETH, cbBTC).
 // Off by default - flip after verifying quote previews look sane.
    ERC20_SWAP_ENABLED: process.env.ERC20_SWAP_ENABLED === 'true',
 // Additional gate for `memecoin`-category tokens. Requires:
 // (1) ERC20_SWAP_ENABLED=true AND
 // (2) ERC20_MEMECOIN_ENABLED=true
 // Memecoin entries must also pass the Memecoin Allowlist Policy
 // (Neural Net/Claude Memory/Memecoin Allowlist Policy.md). Adding a token
 // to ERC20_ALLOWLIST without the policy check is a gate-check violation.
    ERC20_MEMECOIN_ENABLED: process.env.ERC20_MEMECOIN_ENABLED === 'true',

 // Session 28 - In-House Ramp Phase 8 flags. BUY_1 = card balance → crypto wallet.
 // BUY_2 = bank → crypto wallet (via Plaid + Dwolla). Both default false until
 // partner confirmations land (Issuer ops for Issuer card-debit API; Dwolla+Plaid sandbox
 // validation + production approval).
 //
 // FE has matching NEXT_PUBLIC_BUY_1_ENABLED / NEXT_PUBLIC_BUY_2_ENABLED flags
 // for the disabled-CTA scaffold on the Buy tab. Backend flips independently so
 // we can unit-test server-side before exposing the UI path.
    BUY_1_ENABLED: process.env.BUY_1_ENABLED === 'true',
    BUY_2_ENABLED: process.env.BUY_2_ENABLED === 'true',

 // Fee-Vault reserve threshold (USDC on Base). If Fee Vault balance drops
 // below this, reject new Buy 1 / Buy 2 front-credits to avoid liquidity
 // exhaustion. Default $100 = conservative MVP. Scale up with volume.
    FEE_VAULT_MIN_RESERVE_USD: Number(process.env.FEE_VAULT_MIN_RESERVE_USD) || 100,

 // Session 28 - Plaid + Dwolla scaffolds (Buy 2: bank → crypto wallet).
 // All values blank in prod until sandbox validation + approval. Sandbox
 // env is the default - flip PLAID_ENV=production / DWOLLA_ENV=production
 // when ready. Keeping scaffolds operational in sandbox lets us smoke-test
 // the full flow end-to-end before BUY_2_ENABLED flips.
    PLAID_CLIENT_ID: process.env.PLAID_CLIENT_ID || '',
    PLAID_SECRET: process.env.PLAID_SECRET || '',
 // Plaid env: sandbox | development | production. Maps to different base URLs.
    PLAID_ENV: (process.env.PLAID_ENV || 'sandbox') as 'sandbox' | 'development' | 'production',
 // Products requested at Link-token creation. "auth" → routing/account for
 // ACH; "identity" → name match vs Dwolla customer KYC. Keep minimal -
 // every added product increases Plaid dashboard cost.
    PLAID_PRODUCTS: (process.env.PLAID_PRODUCTS || 'auth,identity').split(','),
    PLAID_COUNTRY_CODES: (process.env.PLAID_COUNTRY_CODES || 'US').split(','),

    DWOLLA_KEY: process.env.DWOLLA_KEY || '',
    DWOLLA_SECRET: process.env.DWOLLA_SECRET || '',
 // Dwolla env: sandbox | production. Maps api-sandbox.dwolla.com vs api.dwolla.com.
    DWOLLA_ENV: (process.env.DWOLLA_ENV || 'sandbox') as 'sandbox' | 'production',
 // Dwolla master funding source (Nuro's operating bank account URL). All
 // Buy 2 transfers terminate here before Nuro sweeps to on-chain Fee Vault.
    DWOLLA_MASTER_FUNDING_SOURCE_URL: process.env.DWOLLA_MASTER_FUNDING_SOURCE_URL || '',

 // Session 28 Kelp-hardening - emergency kill-switch for the LayerZero
 // OFT bridge path. When false (default), the TypeScript bridge layer
 // REFUSES to initiate any LZ send via bridge.ts, ops tools action,
 // or scheduled sweep. Independent of the on-chain contract's own
 // setPaused() - belt-and-suspenders.
 //
 // Context: the Kelp DAO exploit (2026-04-18, $292M) drained a vanilla
 // OFTAdapter via forged DVN attestation. Nuro's pre-hardening config
 // was the same class (1-of-1 DVN). This flag defaults OFF until:
 // (1) MyOFTAdapter.sol v2 (custom _lzReceive with caps/pause/events)
 // is compiled, tested, and redeployed on all 6 chains
 // (2) layerzero.config.hardened.ts multi-DVN addresses are verified
 // against LayerZero's official metadata API and the config is
 // applied via `lz:wire --oapp-config layerzero.config.hardened.ts`
 // (3) lz-reserve-monitor is running on VPS and has recorded at least
 // one healthy reconciliation snapshot
 //
 // Turn on with LZ_BRIDGE_ENABLED=true in .env + pm2 restart 4.
    LZ_BRIDGE_ENABLED: process.env.LZ_BRIDGE_ENABLED === 'true',
}
