/**
 * Manual sweep: Arbitrum deployer USDC → user's Issuer Base deposit address via CCTP.
 *
 * Context: first BSC deposit (2026-04-17, user 72459d0e, $0.04) made it through
 * LZ OFT onto Arbitrum but got stuck in waitForArbUsdc due to a decimals bug
 * (see bridge.ts fix in same commit). This script sweeps the stranded USDC to
 * the user's Issuer Base deposit address so the card gets credited.
 *
 * Usage:
 *   cd ~/Nuro-Finance
 *   npx tsx scripts/manual-sweep-arb-to-base.ts <issuerUserId> <txId>
 *
 * On success, prints the Base mint tx hash and the SQL to update the DB row.
 */
import { ethers } from "ethers"
import { CONFIG } from "../src/config"
import { cctpBurnAndMint } from "../src/bridge"
import { getUserBaseDepositAddress } from "../src/issuers"

async function main() {
    const [issuerUserId, txId] = process.argv.slice(2)
    if (!issuerUserId || !txId) {
        console.error("Usage: npx tsx scripts/manual-sweep-arb-to-base.ts <issuerUserId> <txId>")
        process.exit(1)
    }

    console.log(`[manual-sweep] Issuer user: ${issuerUserId}`)
    console.log(`[manual-sweep] Transaction row id: ${txId}`)

    const arbProvider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL_ARBITRUM)
    const deployerWallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, arbProvider)
    const usdc = new ethers.Contract(
        CONFIG.USDC_ARBITRUM,
        ["function balanceOf(address) view returns (uint256)"],
        arbProvider
    )
    const balance = await usdc.balanceOf(deployerWallet.address)
    if (balance.isZero()) {
        console.error(`[manual-sweep] No USDC on deployer wallet (${deployerWallet.address})`)
        process.exit(1)
    }

    const realAmount = ethers.utils.formatUnits(balance, 6)
    console.log(`[manual-sweep] Deployer Arb USDC: $${realAmount} (raw ${balance.toString()})`)

    const recipientBase = await getUserBaseDepositAddress(issuerUserId)
    console.log(`[manual-sweep] Recipient Issuer Base addr: ${recipientBase}`)

    console.log(`[manual-sweep] Burning on Arbitrum → minting on Base...`)
    const txHash = await cctpBurnAndMint(
        CONFIG.PRIVATE_KEY,
        CONFIG.RPC_URL_ARBITRUM,
        42161,
        CONFIG.USDC_ARBITRUM,
        balance,
        recipientBase,
        6,
        8453
    )

    console.log(`\n[manual-sweep] DONE. Burn tx: ${txHash}`)
    console.log(`[manual-sweep] Amount delivered to Issuer: $${realAmount}`)
    console.log(`\nNext: update the stuck DB row. In psql run:`)
    console.log(`
UPDATE transactions
SET amount = ${realAmount},
    fee = 0,
    forwarded = ${realAmount},
    tx_hash = '${txHash}',
    base_deposit_address = '${recipientBase}',
    status = 'confirmed'
WHERE id = '${txId}';
`)
}

main().catch((e) => {
    console.error("[manual-sweep] ERROR:", e?.message || e)
    process.exit(1)
})
