import { ethers } from 'ethers'
import { CONFIG } from './config'
import { enforceTxCap } from './helm'
import { nativeValueToUsd } from './native-price'

const RPC_URLS: Record<number, string> = {
    1: CONFIG.RPC_URL_ETHEREUM,
    8453: CONFIG.BASE_RPC_URL,
    42161: CONFIG.RPC_URL_ARBITRUM,
    10: CONFIG.RPC_URL_OPTIMISM,
    137: CONFIG.RPC_URL_POLYGON,
    43114: CONFIG.RPC_URL_AVALANCHE,
    56: CONFIG.RPC_URL_BSC,
}

const MIN_GAS_BALANCE: Record<number, string> = {
    1: '0.005',
    8453: '0.0005',
    42161: '0.0005',
    10: '0.0005',
    137: '0.5',
    43114: '0.005',
    56: '0.003',
}

export async function fundDepositAddress(
    depositAddress: string,
    chainId: number
): Promise<void> {
    const rpcUrl = RPC_URLS[chainId]
    const minBalance = MIN_GAS_BALANCE[chainId]

    if (!rpcUrl) {
        console.warn(`No RPC configured for chainId: ${chainId}`)
        return
    }

    const provider = new ethers.providers.JsonRpcProvider(rpcUrl)
    const currentBalance = await provider.getBalance(depositAddress)
    const requiredAmount = ethers.utils.parseEther(minBalance)

    if (currentBalance.gte(requiredAmount)) {
        console.log(`Address ${depositAddress} already has sufficient gas on chain ${chainId}`)
        return
    }

    const amountToSend = requiredAmount.sub(currentBalance)
    console.log(`Funding ${depositAddress} with ${ethers.utils.formatEther(amountToSend)} ETH on chain ${chainId}`)

    const feeWallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider)

    // Helm HELM-105 — gas top-ups should be small ($1-$10). Anomalously
    // large top-ups suggest either a config bug or a compromised fee wallet
    // tipping out funds via a benign-looking call. Native → USD via
    // CoinGecko (5-min cached). NaN price → gate skips silently.
    const valueUsd = await nativeValueToUsd(chainId, amountToSend.toString())
    await enforceTxCap({
        source: 'gas-topup',
        txKind: 'gas-topup',
        valueUsd,
        chainId,
        fromAddress: feeWallet.address,
        toAddress: depositAddress,
    })

    const tx = await feeWallet.sendTransaction({
        to: depositAddress,
        value: amountToSend,
    })
    await tx.wait()
    console.log(`Gas funded. Tx: ${tx.hash}`)
}
