/**
 * Solana Bridge — Circle Bridge Kit for Solana → Base USDC
 * ─────────────────────────────────────────────────────────
 *
 * Uses @circle-fin/bridge-kit (Circle's Bridge Kit) instead of
 * @circle-fin/provider-cctp-v2 (which has broken route table for Solana→Base).
 *
 * Bridge Kit handles CCTP v2 orchestration:
 * 1. depositForBurn on Solana (burn USDC)
 * 2. Fetch attestation from Circle
 * 3. receiveMessage on Base (mint USDC to recipient)
 *
 * Config: transferSpeed 'SLOW' for Solana (cheaper, standard finality)
 */

import { Keypair, Connection, Transaction, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js"
import { getAssociatedTokenAddress, createTransferInstruction } from "@solana/spl-token"
import { CONFIG } from "./config"

const USDC_SOLANA = new PublicKey(CONFIG.USDC_SOLANA)

import { createHash } from "crypto"

/** Master Solana wallet — used for bridge execution (fee vault, relay) */
function getSolanaWallet(): Keypair {
    const privateKeyBytes = Uint8Array.from(Buffer.from(CONFIG.SOLANA_PRIVATE_KEY, "hex"))
    return Keypair.fromSecretKey(privateKeyBytes)
}

/**
 * Generate a PER-USER Solana deposit address.
 * Uses HMAC-SHA512 of (master_key + userId) to derive a unique keypair per user.
 * Same pattern as EVM HD derivation — deterministic and recoverable.
 *
 * IMPORTANT: The master wallet is still used for bridge execution.
 * Per-user addresses are just for deposit DETECTION — funds are swept to master
 * before bridging.
 */
export function generateSolanaDepositAddress(userId?: string): string {
    if (!userId) {
 // Fallback: master wallet address (backwards compatible for existing users)
        return getSolanaWallet().publicKey.toBase58()
    }
    const userKeypair = deriveUserSolanaKeypair(userId)
    return userKeypair.publicKey.toBase58()
}

/**
 * Derive a unique Solana keypair for a specific user.
 * Uses SHA-512(SOLANA_PRIVATE_KEY + userId) → first 32 bytes as seed.
 */
export function deriveUserSolanaKeypair(userId: string): Keypair {
    const hash = createHash('sha512')
        .update(CONFIG.SOLANA_PRIVATE_KEY + userId)
        .digest()
 // Solana Keypair.fromSeed takes exactly 32 bytes
    const seed = new Uint8Array(hash.subarray(0, 32))
    return Keypair.fromSeed(seed)
}

/**
 * Get the private key bytes for a user's Solana deposit address.
 * Used by the monitor to sweep funds from per-user address to master wallet.
 */
export function getUserSolanaPrivateKey(userId: string): Uint8Array {
    return deriveUserSolanaKeypair(userId).secretKey
}

// Base58 encoder (zero dependency)
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function toBase58(buf: Uint8Array): string {
    const d = [0]
    for (const b of buf) { let c = b; for (let j = 0; j < d.length; j++) { c += d[j] << 8; d[j] = c % 58; c = (c / 58) | 0 } while (c > 0) { d.push(c % 58); c = (c / 58) | 0 } }
    let s = ''; for (let i = 0; i < buf.length && buf[i] === 0; i++) s += B58[0]; for (let i = d.length - 1; i >= 0; i--) s += B58[d[i]]; return s
}

export async function solanaBridgeAndForward(
    recipientBaseAddress: string,
    amountUsdc: string,
    userId?: string
): Promise<string> {
    const connection = new Connection(CONFIG.SOLANA_RPC_URL, "confirmed")
    const masterWallet = getSolanaWallet()

    const amountRaw = Math.floor(parseFloat(amountUsdc) * 1e6)
    const feeAmount = Math.floor(amountRaw * CONFIG.FEE_PERCENT / 100)
    let bridgeAmount = amountRaw - feeAmount

    console.log(`[solana-bridge] Received: ${amountUsdc} USDC`)
    console.log(`[solana-bridge] Fee:      ${feeAmount / 1e6} USDC -> vault`)
    console.log(`[solana-bridge] Bridge:   ${bridgeAmount / 1e6} USDC -> Base`)

 // If userId provided, sweep from per-user deposit address to master wallet first
    if (userId) {
        try {
            const userKeypair = deriveUserSolanaKeypair(userId)
            const userTokenAccount = await getAssociatedTokenAddress(USDC_SOLANA, userKeypair.publicKey)
            const masterTokenAccount = await getAssociatedTokenAddress(USDC_SOLANA, masterWallet.publicKey)

            console.log(`[solana-bridge] Sweeping ${amountUsdc} USDC from user ${userKeypair.publicKey.toBase58().slice(0, 8)}... to master wallet`)
            const sweepTx = new Transaction().add(
                createTransferInstruction(userTokenAccount, masterTokenAccount, userKeypair.publicKey, amountRaw)
            )
            const sweepHash = await sendAndConfirmTransaction(connection, sweepTx, [userKeypair])
            console.log(`[solana-bridge] Sweep tx: ${sweepHash}`)
        } catch (sweepErr: any) {
            console.error(`[solana-bridge] Sweep from user wallet failed: ${sweepErr.message?.slice(0, 80)}`)
            throw new Error(`Solana sweep failed: ${sweepErr.message?.slice(0, 80)}`)
        }
    }

 // From here, bridge from master wallet (which now has the funds)
    const wallet = masterWallet

 // Fee transfer on Solana (skip if vault ATA doesn't exist)
    if (CONFIG.SOLANA_FEE_VAULT && feeAmount > 0) {
        try {
            const walletTokenAccount = await getAssociatedTokenAddress(USDC_SOLANA, wallet.publicKey)
            const vaultPubkey = new PublicKey(CONFIG.SOLANA_FEE_VAULT)
            const vaultTokenAccount = await getAssociatedTokenAddress(USDC_SOLANA, vaultPubkey)
            const feeTx = new Transaction().add(
                createTransferInstruction(walletTokenAccount, vaultTokenAccount, wallet.publicKey, feeAmount)
            )
            const feeTxHash = await sendAndConfirmTransaction(connection, feeTx, [wallet])
            console.log(`[solana-bridge] Fee tx: ${feeTxHash}`)
        } catch (feeErr: any) {
            console.warn(`[solana-bridge] Fee vault transfer failed: ${feeErr.message?.slice(0, 60)}`)
            console.warn(`[solana-bridge] Bridging full amount instead`)
            bridgeAmount = amountRaw
        }
    }

 // ── Circle Bridge Kit: Solana → Base ─────────────────────────────────
    console.log(`[solana-bridge] Initiating Circle Bridge Kit Solana -> Base...`)

 // Dynamic imports — Bridge Kit + adapters are ESM
    const { BridgeKit } = await import('@circle-fin/bridge-kit' as any)
    const { createSolanaAdapterFromPrivateKey } = await import('@circle-fin/adapter-solana' as any)

 // Solana adapter — signs the burn tx from our deposit wallet
    const depositKeyBase58 = toBase58(wallet.secretKey)
    const solanaAdapter = createSolanaAdapterFromPrivateKey({
        privateKey: depositKeyBase58,
        connection,
    })

 // Base adapter — use ethers v6 (aliased as ethers6) for EVM signing
    const ethers6 = await import('ethers6' as any)
    const { createAdapterFromPrivateKey: createEvmAdapter } = await import('@circle-fin/adapter-ethers-v6' as any)

 // Symlink ethers6 for the adapter
    const baseAdapter = createEvmAdapter({
        privateKey: CONFIG.PRIVATE_KEY,
        getProvider: ({ chain }: any) => {
            if (chain?.name === 'Base' || chain === 'Base') {
                return new ethers6.JsonRpcProvider(CONFIG.BASE_RPC_URL)
            }
            throw new Error(`Unsupported chain: ${chain?.name || chain}`)
        },
    })

    const kit = new BridgeKit()
    const bridgeAmountHuman = (bridgeAmount / 1e6).toFixed(6)

    console.log(`[solana-bridge] Amount: ${bridgeAmountHuman} USDC`)
    console.log(`[solana-bridge] Source: ${wallet.publicKey.toBase58()}`)
    console.log(`[solana-bridge] Dest: ${recipientBaseAddress}`)

 // Log bridge events
    kit.on('*', (payload: any) => {
        if (payload?.action) {
            console.log(`[solana-bridge] Event: ${payload.action} — ${payload.state || ''}${payload.txHash ? ' tx:' + payload.txHash.slice(0, 16) + '...' : ''}`)
        }
    })

    const result = await kit.bridge({
        from: {
            adapter: solanaAdapter,
            chain: 'Solana',
        },
        to: {
            adapter: baseAdapter,
            chain: 'Base',
            recipientAddress: recipientBaseAddress,
        },
        amount: bridgeAmountHuman,
        config: { transferSpeed: 'SLOW' },
    })

 // Extract tx hashes from result
    const burnTxHash = result?.burnTxHash || result?.steps?.find((s: any) => s.name === 'burn')?.txHash || 'unknown'
    const receiveTxHash = result?.receiveTxHash || result?.steps?.find((s: any) => s.name === 'receiveMessage')?.txHash || ''

    console.log(`[solana-bridge] Bridge complete!`)
    console.log(`[solana-bridge] Burn tx: ${burnTxHash}`)
    if (receiveTxHash) console.log(`[solana-bridge] Receive tx: ${receiveTxHash}`)

    return receiveTxHash || burnTxHash
}
