import { ethers } from "ethers"
import { CONFIG } from "./config"
import { enforceTxCap } from "./helm"
import { nativeValueToUsd } from "./native-price"

const WHYPE_ABI = [
    "function deposit() external payable",
    "function withdraw(uint wad) external",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)",
]

const HYPERSWAP_V3_ABI = [
    "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
]

const QUOTER_V2_ABI = [
    "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]
const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)",
]

const SPOKE_POOL_ABI = [
    "function depositV3(address depositor, address recipient, address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 destinationChainId, address exclusiveRelayer, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityDeadline, bytes calldata message) external",
    "function getCurrentTime() external view returns (uint256)",
]

const POOL_FEE = 3000
const ACROSS_DESTINATION_CHAIN_ID = 8453
const FILL_DEADLINE_BUFFER = 6 * 60 * 60

export async function hypeBridgeAndForward(
    recipientBaseAddress: string,
    amountHype: string
): Promise<string> {
    const provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL_HYPEREVM)
    const wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider)

    const whype = new ethers.Contract(CONFIG.WHYPE, WHYPE_ABI, wallet)
    const router = new ethers.Contract(CONFIG.HYPERSWAP_V3_ROUTER, HYPERSWAP_V3_ABI, wallet)
    const usdc = new ethers.Contract(CONFIG.USDC_HYPEREVM, ERC20_ABI, wallet)
    const spokePool = new ethers.Contract(CONFIG.ACROSS_SPOKE_POOL_HYPEREVM, SPOKE_POOL_ABI, wallet)

    const amountHypeWei = ethers.utils.parseEther(amountHype)

 // Step 1: Fee split - 5% in native HYPE to multisig vault
    const feeAmount = amountHypeWei.mul(CONFIG.FEE_PERCENT).div(100)
    const swapAmount = amountHypeWei.sub(feeAmount)

 // Helm tx-cap — value cap on the FULL bridge cycle (amountHype).
 // We cap the outer move once rather than once-per-internal-tx so the
 // cap reflects user-perceived value at risk. HYPE → USD via CoinGecko
 // (5-min cached); on price-feed failure valueUsd is NaN and the gate
 // skips silently per tx-cap contract. Observe-only by default.
    const valueUsd = await nativeValueToUsd(999, amountHypeWei.toString())
    await enforceTxCap({
        source: 'hype-bridge',
        txKind: 'bridge',
        valueUsd,
        chainId: 999,
        fromAddress: wallet.address,
        toAddress: CONFIG.FEE_VAULT_ADDRESS,
    })

    console.log(`[hype-bridge] Received: ${ethers.utils.formatEther(amountHypeWei)} HYPE`)
    console.log(`[hype-bridge] Fee:      ${ethers.utils.formatEther(feeAmount)} HYPE -> vault`)
    console.log(`[hype-bridge] Swap:     ${ethers.utils.formatEther(swapAmount)} HYPE -> USDC`)

    const feeTx = await wallet.sendTransaction({
        to: CONFIG.FEE_VAULT_ADDRESS,
        value: feeAmount,
    })
    await feeTx.wait()
    console.log(`[hype-bridge] Fee tx: ${feeTx.hash}`)

 // Step 2: Wrap HYPE -> WHYPE
    const wrapTx = await whype.deposit({ value: swapAmount })
    await wrapTx.wait()
    console.log(`[hype-bridge] Wrapped ${ethers.utils.formatEther(swapAmount)} HYPE -> WHYPE`)

 // Step 3: Approve HyperSwap V3 router
    const approveTx = await whype.approve(CONFIG.HYPERSWAP_V3_ROUTER, swapAmount)
    await approveTx.wait()
    console.log(`[hype-bridge] Approved HyperSwap router`)

 // Step 4: Swap WHYPE -> USDC on HyperSwap V3
 // Use live QuoterV2 to get current WHYPE->USDC price, apply 5% slippage
    const quoter = new ethers.Contract(CONFIG.HYPERSWAP_V3_QUOTER, QUOTER_V2_ABI, provider)
    const quoteResult = await quoter.callStatic.quoteExactInputSingle({
        tokenIn: CONFIG.WHYPE,
        tokenOut: CONFIG.USDC_HYPEREVM,
        amountIn: swapAmount,
        fee: POOL_FEE,
        sqrtPriceLimitX96: 0,
    })
    const amountOutMinimum = quoteResult.amountOut.mul(95).div(100)
    console.log(`[hype-bridge] live quote: ${ethers.utils.formatUnits(quoteResult.amountOut, 6)} USDC, min: ${ethers.utils.formatUnits(amountOutMinimum, 6)} USDC`)

    const deadline = Math.floor(Date.now() / 1000) + 300
    const swapTx = await router.exactInputSingle({
        tokenIn: CONFIG.WHYPE,
        tokenOut: CONFIG.USDC_HYPEREVM,
        fee: POOL_FEE,
        recipient: wallet.address,
        deadline,
        amountIn: swapAmount,
        amountOutMinimum,
        sqrtPriceLimitX96: 0,
    })
    await swapTx.wait()
    console.log(`[hype-bridge] Swap tx: ${swapTx.hash}`)

 // Step 5: Check USDC received
    const usdcBalance: ethers.BigNumber = await usdc.balanceOf(wallet.address)
    console.log(`[hype-bridge] USDC received: ${ethers.utils.formatUnits(usdcBalance, 6)}`)

 // Step 6: Approve Across SpokePool
    const approveAcross = await usdc.approve(CONFIG.ACROSS_SPOKE_POOL_HYPEREVM, usdcBalance)
    await approveAcross.wait()
    console.log(`[hype-bridge] Approved Across SpokePool`)

 // Step 7: Bridge USDC HyperEVM -> Base via Across directly to recipient
    const currentTime: ethers.BigNumber = await spokePool.getCurrentTime()
    const quoteTimestamp = currentTime.toNumber()
    const fillDeadline = quoteTimestamp + FILL_DEADLINE_BUFFER

    const depositTx = await spokePool.depositV3(
        wallet.address,
        recipientBaseAddress,
        CONFIG.USDC_HYPEREVM,
        ethers.constants.AddressZero,
        usdcBalance,
        usdcBalance,
        ACROSS_DESTINATION_CHAIN_ID,
        ethers.constants.AddressZero,
        quoteTimestamp,
        fillDeadline,
        0,
        "0x"
    )
    await depositTx.wait()
    console.log(`[hype-bridge] Across depositV3 tx: ${depositTx.hash}`)
    console.log(`[hype-bridge] USDC bridging HyperEVM -> Base directly to ${recipientBaseAddress}`)

    return depositTx.hash
}
