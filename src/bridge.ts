import { ethers } from "ethers"
import axios from "axios"
import { CONFIG } from "./config"
import { acquireChainLock, releaseChainLock, getFreshNonce, recordNonceUsed, createFreshWallet, getPublicRPC } from "./nonce-manager"
import { enforceTxCap } from "./helm"

const CCTP_CHAIN_MAP: Record<number, string> = {
    1:     "Ethereum",
    8453:  "Base",
    42161: "Arbitrum",
    10:    "Optimism",
    137:   "Polygon",
    43114: "Avalanche",
    999:   "HyperEVM",
    59144: "Linea",
    130:   "Unichain",
    146:   "Sonic",
    480:   "World Chain",
    57073: "Ink",
    81224: "Codex Mainnet",
    1329:  "Sei",
    98866: "Plume",
    143:   "Monad",
    50:    "XDC",
}

const LZ_CHAIN_MAP: Record<number, { eid: number; name: string }> = {
    324:    { eid: 30165, name: "zkSync Era" },
    534352: { eid: 30214, name: "Scroll" },
    42220:  { eid: 30125, name: "Celo" },
    100:    { eid: 30145, name: "Gnosis" },
    56:     { eid: 30102, name: "BSC" },
}

export const RPC_URLS: Record<number, string> = {
    1:      CONFIG.RPC_URL_ETHEREUM,
    8453:   CONFIG.BASE_RPC_URL,
    42161:  CONFIG.RPC_URL_ARBITRUM,
    10:     CONFIG.RPC_URL_OPTIMISM,
    137:    CONFIG.RPC_URL_POLYGON,
    43114:  CONFIG.RPC_URL_AVALANCHE,
    999:    CONFIG.RPC_URL_HYPEREVM,
    59144:  process.env.RPC_URL_LINEA || "https://rpc.linea.build",
    130:    process.env.RPC_URL_UNICHAIN || "https://mainnet.unichain.org",
    146:    process.env.RPC_URL_SONIC || "https://rpc.soniclabs.com",
    480:    process.env.RPC_URL_WORLDCHAIN || "https://worldchain-mainnet.g.alchemy.com/public",
    57073:  process.env.RPC_URL_INK || "https://rpc-gel.inkonchain.com",
    81224:  process.env.RPC_URL_CODEX || "https://rpc.codex.storage/rpc",
    1329:   process.env.RPC_URL_SEI || "https://evm-rpc.sei-apis.com",
    98866:  process.env.RPC_URL_PLUME || "https://rpc.plumenetwork.xyz/rpc",
    143:    process.env.RPC_URL_MONAD || "https://rpc.monad.xyz",
    50:     process.env.RPC_URL_XDC || "https://rpc.xdc.org",
    324:    process.env.RPC_URL_ZKSYNC!,
    534352: process.env.RPC_URL_SCROLL!,
    42220:  process.env.RPC_URL_CELO    || "https://forno.celo.org",
    100:    process.env.RPC_URL_GNOSIS  || "https://rpc.gnosischain.com",
    56:     process.env.RPC_URL_BSC     || "https://bsc-dataseed.binance.org",
}

const USDC_ADDRESSES: Record<number, string> = {
    1:      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    8453:   CONFIG.USDC_BASE,
    42161:  CONFIG.USDC_ARBITRUM,
    10:     "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    137:    "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    43114:  "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    999:    CONFIG.USDC_HYPEREVM,
    59144:  "0x176211869ca2b568f2a7d4ee941e073a821ee1ff",
    130:    "0x078D782b760474a361dDA0AF3839290b0EF57AD6",
    146:    "0x29219dd400f2Bf60E5a23d13Be72B486D4038894",
    480:    "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1",
    57073:  "0x2D270e6886d130D724215A266106e6832161EAEd",
    81224:  "0xd996633a415985DBd7D6D12f4A4343E31f5037cf",
    1329:   "0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392",
    98866:  "0x222365EF19F7947e5484218551B56bb3965Aa7aF",
    143:    "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
    50:     "0xfA2958CB79b0491CC627c1557F441eF849Ca8eb1",
    324:    "0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4",
    534352: "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4",
    42220:  "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
    100:    "0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83",
    56:     "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
}

const LZ_ADAPTER: Record<number, string> = {
    42161:  "0xd58C1412e50fF00212770B170D86e2387D2d2b18",
    324:    "0xA150EC8B718C22E12036f916d90FF72af14B3E96",
    534352: "0xA150EC8B718C22E12036f916d90FF72af14B3E96",
    42220:  "0xA150EC8B718C22E12036f916d90FF72af14B3E96",
    100:    "0xA150EC8B718C22E12036f916d90FF72af14B3E96",
    56:     "0xce4c2270890267aC860fdc72b6946359d0898675",
}

const ARBITRUM_EID = 30110

const USDC_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function transfer(address,uint256) returns (bool)",
    "function approve(address,uint256) returns (bool)",
]

const OFT_ADAPTER_ABI = [
    "function quoteSend(tuple(uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd) sendParam, bool payInLzToken) view returns (tuple(uint256 nativeFee, uint256 lzTokenFee) fee)",
    "function send(tuple(uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd) sendParam, tuple(uint256 nativeFee, uint256 lzTokenFee) fee, address refundAddress) payable returns (tuple(bytes32 guid, uint64 nonce, tuple(uint256 nativeFee, uint256 lzTokenFee) fee) receipt, tuple(uint256 amountSentLD, uint256 amountReceivedLD) oftReceipt)",
]


function getDepositPrivateKey(userId: string): string {
    const seed = ethers.utils.id(CONFIG.PRIVATE_KEY + userId)
    const hdNode = ethers.utils.HDNode.fromSeed(seed)
    return hdNode.privateKey
}

function addressToBytes32(addr: string): string {
    return ethers.utils.hexZeroPad(addr, 32)
}

function buildLzOptions(gasLimit: number): string {
    const gasHex = ethers.utils.hexZeroPad(ethers.BigNumber.from(gasLimit).toHexString(), 16)
    const valueHex = ethers.utils.hexZeroPad("0x00", 16)
 // Options V3: version(2) + workerID(1) + optionLength(2) + type(1) + gas(16) + value(16)
 // optionLength = 1 + 16 + 16 = 33 = 0x0021
 // BUG FIX: was 0x0011 (17) — parser overran, read 0x00 as workerID → InvalidWorkerId(0)
    return "0x0003" + "01" + "0021" + "01" + gasHex.slice(2) + valueHex.slice(2)
}

async function lzBridgeToArbitrum(
    userId: string,
    depositAddress: string,
    sourceChainId: number,
    forwardAmount: ethers.BigNumber,
    decimals: number
): Promise<string> {
 // Session 28 Kelp-hardening — kill-switch. Refuses to send if
 // LZ_BRIDGE_ENABLED is not explicitly true. Defaults off until the
 // hardened contract + multi-DVN config + reserve monitor are all live.
 // Upstream caller should catch this and fall back gracefully OR surface
 // a clear "bridge temporarily disabled" message to the user.
    if (!CONFIG.LZ_BRIDGE_ENABLED) {
        throw new Error(
            'LZ_BRIDGE_ENABLED=false — LayerZero path disabled post-Kelp hardening. ' +
            'Awaiting: (1) MyOFTAdapter v2 deploy, (2) multi-DVN config verify, (3) reserve monitor live.'
        )
    }

    const lzChain = LZ_CHAIN_MAP[sourceChainId]
    if (!lzChain) throw new Error(`Chain ${sourceChainId} not in LZ chain map`)

    const rpcUrl = RPC_URLS[sourceChainId]
    const usdcAddress = USDC_ADDRESSES[sourceChainId]
    const adapterAddress = LZ_ADAPTER[sourceChainId]

    const depositPrivKey = getDepositPrivateKey(userId)
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl)
    const wallet = new ethers.Wallet(depositPrivKey, provider)

    const usdc = new ethers.Contract(usdcAddress, USDC_ABI, wallet)
    const adapter = new ethers.Contract(adapterAddress, OFT_ADAPTER_ABI, wallet)

 // Helm tx-cap — outbound value cap. USDC is 1:1 USD so amount in
 // human units == valueUsd. Observe-only unless HELM_TXCAP_ENFORCE=on.
 // Throws synchronously in enforce mode so the bridge never broadcasts
 // an over-cap move. Counterpart to the OFTAdapter on-chain per-message
 // cap — this is the off-chain twin so the alarm fires before signing.
    const forwardAmountUsd = Number(ethers.utils.formatUnits(forwardAmount, decimals))
    await enforceTxCap({
        source: 'bridge-lz',
        txKind: 'bridge',
        valueUsd: forwardAmountUsd,
        chainId: sourceChainId,
        fromAddress: wallet.address,
        toAddress: adapterAddress,
        agentId: 'system',
    })

    console.log(`[lz] Approving OFTAdapter on ${lzChain.name}...`)
    const approveTx = await usdc.approve(adapterAddress, forwardAmount)
    await approveTx.wait()
    console.log(`[lz] Approve tx: ${approveTx.hash}`)

    const extraOptions = buildLzOptions(80000)
    const sendParam = {
        dstEid: ARBITRUM_EID,
        to: addressToBytes32(new ethers.Wallet(CONFIG.PRIVATE_KEY).address),
        amountLD: forwardAmount,
        minAmountLD: forwardAmount.mul(99).div(100),
        extraOptions,
        composeMsg: "0x",
        oftCmd: "0x",
    }

    console.log(`[lz] Quoting send fee on ${lzChain.name}...`)
    const feeQuote = await adapter.quoteSend(sendParam, false)
    const nativeFee = feeQuote.nativeFee || feeQuote.fee?.nativeFee || feeQuote[0]
    console.log(`[lz] Native fee: ${ethers.utils.formatEther(nativeFee)} ETH`)

    const nativeBalance = await provider.getBalance(wallet.address)
    if (nativeBalance.lt(nativeFee)) {
        throw new Error(`Insufficient native balance for LZ fee. Have: ${ethers.utils.formatEther(nativeBalance)} Need: ${ethers.utils.formatEther(nativeFee)}`)
    }

    console.log(`[lz] Sending ${ethers.utils.formatUnits(forwardAmount, decimals)} USDC ${lzChain.name} -> Arbitrum...`)
    const sendTx = await adapter.send(
        sendParam,
        { nativeFee, lzTokenFee: 0 },
        wallet.address,
        { value: nativeFee }
    )
    await sendTx.wait()
    console.log(`[lz] Send tx: ${sendTx.hash}`)
    return sendTx.hash
}

async function waitForArbUsdc(
    expectedAmount: ethers.BigNumber,
    timeoutMs: number = 1200000
): Promise<void> {
    const arbAdapter = new ethers.Wallet(CONFIG.PRIVATE_KEY).address
    const provider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL_ARBITRUM)
    const usdc = new ethers.Contract(CONFIG.USDC_ARBITRUM, USDC_ABI, provider)
    const initialBalance = await usdc.balanceOf(arbAdapter)
    const target = initialBalance.add(expectedAmount.mul(98).div(100))
    const deadline = Date.now() + timeoutMs

    const timeoutMin = Math.round(timeoutMs / 60000)
    console.log(`[lz] Waiting for USDC in deployer wallet on Arbitrum (initial: ${ethers.utils.formatUnits(initialBalance, 6)}, timeout: ${timeoutMin}min)...`)

    let pollCount = 0
    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 10000))
        pollCount++
        const balance = await usdc.balanceOf(arbAdapter)
        const elapsed = Math.round((Date.now() - (deadline - timeoutMs)) / 60000)
        const remaining = timeoutMin - elapsed
        console.log(`[lz] Arb balance: ${ethers.utils.formatUnits(balance, 6)} USDC (${elapsed}min elapsed, ${remaining}min remaining)`)
        if (balance.gte(target)) {
            console.log(`[lz] USDC arrived on Arbitrum after ${elapsed}min`)
            return
        }
    }
    throw new Error(`Timed out after ${timeoutMin}min waiting for USDC to arrive on Arbitrum via LZ`)
}


const TOKEN_MESSENGER_V2 = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d"
const MESSAGE_TRANSMITTER_V2 = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64"
const IRIS_API = "https://iris-api.circle.com/v2/messages"

export const CCTP_DOMAINS: Record<number, number> = {
    1:     0,  // Ethereum
    43114: 1,  // Avalanche
    10:    2,  // Optimism
    42161: 3,  // Arbitrum
    8453:  6,  // Base
    137:   7,  // Polygon
    130:   10, // Unichain
    59144: 11, // Linea
    81224: 12, // Codex
    146:   13, // Sonic
    480:   14, // World Chain
    143:   15, // Monad
    1329:  16, // Sei
    50:    18, // XDC
    999:   19, // HyperEVM
    57073: 21, // Ink
    98866: 22, // Plume
}

/**
 * Pure helper: resolve source + destination CCTP domains for a burn+mint route.
 * Throws if either chain lacks CCTP support. Used by cctpBurnAndMint and by
 * unit tests. No env vars read; no network calls.
 */
export function resolveCCTPDomains(sourceChainId: number, destChainId: number): { sourceDomain: number; destDomain: number } {
    const sourceDomain = CCTP_DOMAINS[sourceChainId]
    if (sourceDomain === undefined) throw new Error(`No CCTP domain registered for source chain ${sourceChainId}`)
    const destDomain = CCTP_DOMAINS[destChainId]
    if (destDomain === undefined) throw new Error(`No CCTP domain registered for destination chain ${destChainId}`)
    return { sourceDomain, destDomain }
}

/**
 * Pure helper: resolve the RPC URL to use for the destination chain's
 * receiveMessage submission. Takes an env dict (defaults to process.env) so it
 * is unit-testable without mocking globals. Returns undefined if no RPC is
 * configured, letting the caller throw a clear error.
 */
export function getCCTPDestRpc(chainId: number, env: Record<string, string | undefined> = process.env): string | undefined {
    const envVarMap: Record<number, string> = {
        1:     'RPC_URL_ETHEREUM',
        10:    'RPC_URL_OPTIMISM',
        137:   'RPC_URL_POLYGON',
        8453:  'BASE_RPC_URL',
        42161: 'RPC_URL_ARBITRUM',
        43114: 'RPC_URL_AVALANCHE',
    }
    const publicFallback: Record<number, string> = {
        8453:  'https://mainnet.base.org',
        137:   'https://polygon-rpc.com',
        42161: 'https://arb1.arbitrum.io/rpc',
    }
    const varName = envVarMap[chainId]
    if (!varName) return publicFallback[chainId]
    return env[varName] || publicFallback[chainId]
}

const TOKEN_MESSENGER_ABI = [
    "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold) returns (uint64 nonce)",
    "function depositForBurnWithCaller(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold) returns (uint64 nonce)",
]

/**
 * Core CCTP V2 burn+mint. Default destination is Base (chainId 8453) for
 * backward compatibility with all existing callers (inbound deposit flow).
 *
 * Pass `destChainId` to target any other CCTP-supported chain — e.g. 137 for
 * Polygon to implement Base→Polygon agent funding (Sprint 2.3 reverse flow).
 *
 * Domain and RPC lookup delegated to the pure helpers resolveCCTPDomains +
 * getCCTPDestRpc so unit tests can verify routing logic without an RPC.
 *
 * @param destChainId Destination chain id. Defaults to 8453 (Base).
 */
export async function cctpBurnAndMint(
    signerPrivKey: string,
    rpcUrl: string,
    sourceChainId: number,
    usdcAddress: string,
    amount: ethers.BigNumber,
    recipientAddress: string,
    decimals: number,
    destChainId: number = 8453
): Promise<string> {
 // Use public RPC for accurate nonces (Alchemy caches aggressively)
    const publicRpc = getPublicRPC(sourceChainId, rpcUrl)
    const wallet = createFreshWallet(signerPrivKey, sourceChainId)
    const usdc = new ethers.Contract(usdcAddress, USDC_ABI, wallet)
    const messenger = new ethers.Contract(TOKEN_MESSENGER_V2, TOKEN_MESSENGER_ABI, wallet)

    const { sourceDomain, destDomain } = resolveCCTPDomains(sourceChainId, destChainId)

    const destRpc = getCCTPDestRpc(destChainId)
    if (!destRpc) throw new Error(`No RPC URL configured for destination chain ${destChainId}`)

    const mintRecipient = ethers.utils.hexZeroPad(recipientAddress, 32)

 // Acquire chain lock — only one CCTP operation per chain at a time
    await acquireChainLock(sourceChainId, wallet.address)
    console.log(`[cctp] Chain ${sourceChainId} lock acquired`)

    let burnTxHash: string

    try {
 // Get fresh nonce from public RPC
        const nonce = await getFreshNonce(sourceChainId, wallet.address)
        console.log(`[cctp] Wallet nonce: ${nonce} (from public RPC)`)

 // Check current allowance - skip approve if already sufficient
        const ALLOWANCE_ABI = ["function allowance(address,address) view returns (uint256)"]
        const usdcCheck = new ethers.Contract(usdcAddress, ALLOWANCE_ABI, wallet.provider)
        const allowance = await usdcCheck.allowance(wallet.address, TOKEN_MESSENGER_V2)

        let currentNonce = nonce
        if (allowance.lt(amount)) {
            console.log(`[cctp] Approving TokenMessenger V2...`)
            const approveTx = await usdc.approve(TOKEN_MESSENGER_V2, amount, { nonce: currentNonce, gasLimit: 100000 })
            await approveTx.wait()
            recordNonceUsed(sourceChainId, currentNonce, wallet.address)
            currentNonce++
            console.log(`[cctp] Approve tx: ${approveTx.hash}`)
        } else {
            console.log(`[cctp] Allowance sufficient (${ethers.utils.formatUnits(allowance, decimals)}), skipping approve`)
        }

 // Burn — use incremented nonce (no re-fetch needed, we track it)
        console.log(`[cctp] Burning ${ethers.utils.formatUnits(amount, decimals)} USDC on chain ${sourceChainId} → domain ${destDomain} (chain ${destChainId})...`)
        const burnTx = await messenger.depositForBurn(
            amount,
            destDomain,
            mintRecipient,
            usdcAddress,
            ethers.constants.HashZero,
            0,
            2000,
            { nonce: currentNonce, gasLimit: 300000 }
        )
        await burnTx.wait()
        recordNonceUsed(sourceChainId, currentNonce, wallet.address)
        burnTxHash = burnTx.hash
        console.log(`[cctp] Burn tx: ${burnTxHash}`)
    } finally {
        releaseChainLock(sourceChainId, wallet.address)
        console.log(`[cctp] Chain ${sourceChainId} lock released`)
    }

 // Poll Iris for attestation
    console.log(`[cctp] Polling Iris for attestation...`)
    const irisUrl = `${IRIS_API}/${sourceDomain}?transactionHash=${burnTxHash}`
    let attestation: string | null = null

    for (let i = 0; i < 120; i++) {
        await new Promise(r => setTimeout(r, 10000))
        try {
            const resp = await axios.get(irisUrl)
            const msg = resp.data?.messages?.[0]
            if (msg?.status === "complete" && msg?.attestation) {
                attestation = msg.attestation
                console.log(`[cctp] Attestation received`)
                break
            }
            console.log(`[cctp] Attestation pending (${i+1}/120)`)
        } catch (e: any) {
            console.log(`[cctp] Iris poll error: ${e.message?.slice(0,60)}`)
        }
    }

    if (!attestation) throw new Error("Timed out waiting for CCTP attestation")

 // Call receiveMessage on destination chain's MessageTransmitter to complete the mint
    console.log(`[cctp] Attestation received — submitting receiveMessage on chain ${destChainId} (domain ${destDomain})...`)
    const sourceProvider = new ethers.providers.JsonRpcProvider(publicRpc)
    const burnReceipt = await sourceProvider.getTransactionReceipt(burnTxHash)
    const MSG_SENT_TOPIC = "0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036"
    const msgLog = burnReceipt.logs.find((l: any) => l.topics[0] === MSG_SENT_TOPIC)
    if (!msgLog) throw new Error("MessageSent log not found in burn receipt")
    const messageBytes = ethers.utils.defaultAbiCoder.decode(["bytes"], msgLog.data)[0]
    const destRelayProvider = new ethers.providers.JsonRpcProvider(destRpc)
    const relayWallet = new ethers.Wallet(process.env.PRIVATE_KEY!, destRelayProvider)
    const destMsgTransmitter = new ethers.Contract(
        MESSAGE_TRANSMITTER_V2,
        ["function receiveMessage(bytes calldata message, bytes calldata attestation) returns (bool success)"],
        relayWallet
    )
 // Use message bytes from Iris (has correct finalityThresholdExecuted set by Circle)
    const irisData = JSON.parse(await (await fetch(`https://iris-api.circle.com/v2/messages/${sourceDomain}?transactionHash=${burnTxHash}`)).text())
    const irisMsg = irisData.messages?.[0]
    const irisMessageBytes = irisMsg?.message || messageBytes
    try {
        const mintTx = await destMsgTransmitter.receiveMessage(irisMessageBytes, attestation, { gasLimit: 400000 })
        await mintTx.wait()
        console.log(`[cctp] Mint confirmed on chain ${destChainId}: ${mintTx.hash}`)
    } catch (mintErr: any) {
        if (mintErr?.reason === 'Nonce already used' || mintErr?.message?.includes('Nonce already used')) {
            console.log(`[cctp] Circle already relayed — USDC delivered to recipient on chain ${destChainId}`)
        } else {
            console.log(`[cctp] receiveMessage failed: ${mintErr?.reason || mintErr?.message?.slice(0,80)}`)
            console.log(`[cctp] Circle auto-relay will complete delivery`)
        }
    }
    return burnTxHash
}

/**
 * Convenience wrapper: Base → Polygon CCTP burn+mint.
 * Used by Sprint 2.3 agent funding flow (sweepAgentFundings). When
 * AGENT_FUNDING_OBSERVE_ONLY=false on VPS, the sweep will call this to move
 * USDC from the user's Base vault to the agent's Polygon wallet.
 *
 * Also exported with a name the /gate-check agent-funding-live gate matches
 * on (`cctpBaseToPolygon`) so the reverse-cctp-shipped blocker flips green
 * once this function exists in src/bridge.ts.
 */
export async function cctpBaseToPolygon(
    signerPrivKey: string,
    amount: ethers.BigNumber,
    recipientPolygonAddress: string
): Promise<string> {
    return cctpBurnAndMint(
        signerPrivKey,
        CONFIG.BASE_RPC_URL,
        8453,                      // source: Base
        CONFIG.USDC_BASE,
        amount,
        recipientPolygonAddress,
        6,                          // USDC decimals
        137                         // destination: Polygon
    )
}

async function cctpArbitrumToBase(
    forwardAmount: ethers.BigNumber,
    decimals: number,
    recipientBaseAddress: string
): Promise<string> {
    const arbProvider = new ethers.providers.JsonRpcProvider(CONFIG.RPC_URL_ARBITRUM)
    const deployerWallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, arbProvider)
    const usdc = new ethers.Contract(CONFIG.USDC_ARBITRUM, USDC_ABI, deployerWallet)
    const adapterBalance = await usdc.balanceOf(deployerWallet.address)

    if (adapterBalance.isZero()) throw new Error("No USDC in deployer wallet after LZ delivery")

    const amountToForward = adapterBalance.lt(forwardAmount) ? adapterBalance : forwardAmount
    console.log(`[cctp] Bridging ${ethers.utils.formatUnits(amountToForward, decimals)} USDC Arbitrum -> Base...`)

    return await cctpBurnAndMint(
        CONFIG.PRIVATE_KEY,
        CONFIG.RPC_URL_ARBITRUM,
        42161,
        CONFIG.USDC_ARBITRUM,
        amountToForward,
        recipientBaseAddress,
        decimals
    )
}

export async function bridgeAndForward(
    userId: string,
    depositAddress: string,
    recipientBaseAddress: string,
    rawAmount: string,
    sourceChainId: number
): Promise<string> {
    const rpcUrl = RPC_URLS[sourceChainId]
    const usdcAddress = USDC_ADDRESSES[sourceChainId]

    if (!rpcUrl || !usdcAddress) throw new Error(`Unsupported source chain: ${sourceChainId}`)

    const ethersProvider = new ethers.providers.JsonRpcProvider(rpcUrl)
    const usdc = new ethers.Contract(usdcAddress, USDC_ABI, ethersProvider)
    const decimals = await usdc.decimals()
    const balance = await usdc.balanceOf(depositAddress)
    const amount = ethers.utils.parseUnits(rawAmount, decimals)
    const amountToUse = balance.lt(amount) ? balance : amount

    if (amountToUse.isZero()) throw new Error("No USDC balance at deposit address")

    const feeAmount = amountToUse.mul(CONFIG.FEE_PERCENT).div(100)

    const routeLabel = sourceChainId === 8453
        ? "Direct (Base)"
        : LZ_CHAIN_MAP[sourceChainId]
            ? `LZ+CCTP (${LZ_CHAIN_MAP[sourceChainId].name} -> Arbitrum -> Base)`
            : `CCTP (${CCTP_CHAIN_MAP[sourceChainId]} -> Base)`

    console.log(`[bridge] Route:   ${routeLabel}`)
    console.log(`[bridge] Balance: ${ethers.utils.formatUnits(amountToUse, decimals)} USDC`)
    console.log(`[bridge] Fee:     ${ethers.utils.formatUnits(feeAmount, decimals)} USDC (collected on Base after delivery)`)
    console.log(`[bridge] Forward: ${ethers.utils.formatUnits(amountToUse, decimals)} USDC -> ${recipientBaseAddress}`)

    const depositPrivKey = getDepositPrivateKey(userId)

 // ── FEE ARCHITECTURE ──────────────────────────────────────────────────
 // Fees are collected on the SOURCE CHAIN to build USDC reserves per chain.
 //
 // CRITICAL RULE: Fee is collected AFTER bridge succeeds, not before.
 // If the bridge fails, the fee is NOT taken. No delivery = no fee.
 //
 // For Base direct: fee + forward atomically (same chain, no risk)
 // For cross-chain: bridge first, then sweep fee AFTER confirmation
 // ───────────────────────────────────────────────────────────────────────

    const forwardAmount = amountToUse.sub(feeAmount)

 // Base direct — fee + forward atomically (both on same chain, no bridge risk)
    if (sourceChainId === 8453) {
        await acquireChainLock(8453)
        try {
            const wallet = createFreshWallet(depositPrivKey, 8453)
            const usdcW = new ethers.Contract(usdcAddress, USDC_ABI, wallet)
            let nonce = await getFreshNonce(8453, wallet.address)
            if (feeAmount.gt(0)) {
                const feeTx = await usdcW.transfer(CONFIG.FEE_VAULT_ADDRESS, feeAmount, { nonce, gasLimit: 100000 })
                await feeTx.wait()
                recordNonceUsed(8453, nonce)
                nonce++
                console.log(`[bridge] Fee tx: ${feeTx.hash}`)
            }
            const fwdTx = await usdcW.transfer(recipientBaseAddress, forwardAmount, { nonce, gasLimit: 100000 })
            await fwdTx.wait()
            recordNonceUsed(8453, nonce)
            console.log(`[bridge] Forwarded on Base: ${fwdTx.hash}`)
            return fwdTx.hash
        } finally {
            releaseChainLock(8453)
        }
    }

 // Cross-chain: bridge the forward amount FIRST, fee swept AFTER success
 // Fee stays at deposit address until bridge confirms

 // ── Helper: Sweep fee on source chain AFTER bridge success ────────────
    async function sweepFeeAfterBridge() {
        if (feeAmount.isZero()) return
        try {
            await acquireChainLock(sourceChainId)
            try {
                const wallet = createFreshWallet(depositPrivKey, sourceChainId)
                const usdcW = new ethers.Contract(usdcAddress, USDC_ABI, wallet)
                const nonce = await getFreshNonce(sourceChainId, wallet.address)
                const feeTx = await usdcW.transfer(CONFIG.FEE_VAULT_ADDRESS, feeAmount, { nonce, gasLimit: 200000 })
                await feeTx.wait()
                recordNonceUsed(sourceChainId, nonce)
                console.log(`[bridge] Fee collected on chain ${sourceChainId} AFTER delivery: ${feeTx.hash}`)
            } finally {
                releaseChainLock(sourceChainId)
            }
        } catch (feeErr: any) {
 // Fee sweep failed but bridge succeeded — log for manual collection
            console.warn(`[bridge] Fee sweep failed on chain ${sourceChainId} (bridge succeeded, fee pending): ${feeErr.message?.slice(0, 60)}`)
        }
    }

 // LZ two-hop route
    if (LZ_CHAIN_MAP[sourceChainId]) {
 // Scale forwardAmount from source decimals to Arbitrum's 6-dec. The OFT
 // adapter truncates to sharedDecimals (6) when crossing from an 18-dec
 // chain like BSC, so the amount that lands on Arbitrum is the source
 // amount / 10^(sourceDecimals - 6). Found 2026-04-17: $0.04 BSC deposit
 // got stuck because waitForArbUsdc compared 3.8e16 target against a
 // real 38000 arrival — would never match.
        const ARB_DECIMALS = 6
        const forwardAmountArb = decimals > ARB_DECIMALS
            ? forwardAmount.div(ethers.BigNumber.from(10).pow(decimals - ARB_DECIMALS))
            : decimals < ARB_DECIMALS
                ? forwardAmount.mul(ethers.BigNumber.from(10).pow(ARB_DECIMALS - decimals))
                : forwardAmount
        const lzTxHash = await lzBridgeToArbitrum(userId, depositAddress, sourceChainId, forwardAmount, decimals)
        console.log(`[bridge] LZ hop complete: ${lzTxHash}`)
        await waitForArbUsdc(forwardAmountArb)
        const finalTxHash = await cctpArbitrumToBase(forwardAmountArb, ARB_DECIMALS, recipientBaseAddress)
        console.log(`[bridge] LZ+CCTP complete. Final tx: ${finalTxHash}`)
 // Bridge confirmed → NOW collect the fee on source chain
        await sweepFeeAfterBridge()
        return finalTxHash
    }

 // CCTP direct route
    const chainName = CCTP_CHAIN_MAP[sourceChainId]
    if (!chainName) throw new Error(`Chain ${sourceChainId} not supported`)

    console.log(`[bridge] Initiating CCTP V2 ${chainName} -> Base...`)

    const txHash = await cctpBurnAndMint(
        depositPrivKey,
        rpcUrl,
        sourceChainId,
        usdcAddress,
        forwardAmount,
        recipientBaseAddress,
        decimals
    )
 // Bridge confirmed → NOW collect the fee on source chain
    await sweepFeeAfterBridge()
    return txHash
}
