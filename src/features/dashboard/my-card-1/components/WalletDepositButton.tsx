"use client";

import { useState } from "react";
import { useAccount, useConnect, useSendTransaction, useWriteContract, useSwitchChain, useChainId } from "wagmi";
import { parseEther, parseUnits, erc20Abi } from "viem";
import { Wallet, Loader2, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CHAIN_NAME_TO_ID, getChainDecimals } from "@/lib/chains";

/**
 * "Send from Wallet" one-click deposit (Session 23 Marathon 7).
 *
 * Instead of the old flow (copy address → open wallet app → paste → type
 * amount → confirm), this button surfaces the transaction in the user's
 * connected wallet in ONE click.
 *
 * Two modes based on token:
 *   - Native (ETH/MATIC/BNB): useSendTransaction with `value = parseEther(amount)`
 *   - ERC-20 (USDC/USDT/DAI): useWriteContract with token.transfer(to, amount)
 *
 * The native-token path pairs perfectly with our new 0x swap pipeline
 * (Marathon 7 B MVP) — user sends native ETH, backend auto-swaps to USDC
 * and bridges to their card. Zero manual address-copying.
 *
 * Auto-switches chain if the user's wallet is on the wrong network.
 */

// USDC contract addresses per chain (must match backend CHAINS config).
// Day-5: added BSC (Binance-Peg, 18-dec), Optimism, and Avalanche so the
// step-1 "Reload Card" wallet-send works on the chains the demo picker
// actually surfaces. Decimals are resolved per-chain via getChainDecimals.
const USDC_ADDRESSES: Record<number, `0x${string}`> = {
    1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",      // Ethereum
    8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",   // Base
    137: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",    // Polygon (native USDC)
    42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",  // Arbitrum (native USDC)
    10: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",     // Optimism (native USDC)
    43114: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",  // Avalanche (native USDC)
    56: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",     // BSC (Binance-Peg, 18-dec)
};

interface WalletDepositButtonProps {
    /** Target deposit address (HD-derived, from useEffect fetch) */
    depositAddress: string;
    /** Human amount (e.g. "3" for 3 USDC or 0.003 ETH) */
    amount: string;
    /** Which token to send: USDC, Tether, Dai, or native symbol (ETH/MATIC/BNB) */
    token: string;
    /** Which chain the deposit address is on — matches backend CHAINS names */
    chainName: string;
    /** Fired on successful tx hash — parent can advance UI to "processing" step */
    onSuccess?: (txHash: string) => void;
}

export function WalletDepositButton({
    depositAddress,
    amount,
    token,
    chainName,
    onSuccess,
}: WalletDepositButtonProps) {
    const { address: walletAddress, isConnected } = useAccount();
    const { connectors, connect, isPending: isConnecting } = useConnect();
    const { switchChain, isPending: isSwitching } = useSwitchChain();
    const currentChainId = useChainId();
    const { sendTransactionAsync, isPending: isSendingNative } = useSendTransaction();
    const { writeContractAsync, isPending: isSendingErc20 } = useWriteContract();

    const [txHash, setTxHash] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const targetChainId = CHAIN_NAME_TO_ID[chainName];
    const isNative = token === "ETH" || token === "MATIC" || token === "BNB" || token === chainName;  // chainName fallback for clarity
    const needsChainSwitch = isConnected && targetChainId && currentChainId !== targetChainId;

    const handleSend = async () => {
        setError(null);
        setTxHash(null);
        const parsedAmount = parseFloat(amount);
        if (!depositAddress || isNaN(parsedAmount) || parsedAmount <= 0) {
            setError("Enter a valid amount above 0");
            return;
        }
        try {
            // 1. Switch chain if needed
            if (needsChainSwitch && targetChainId) {
                await switchChain({ chainId: targetChainId });
            }
            // 2. Build + send tx
            let hash: `0x${string}`;
            if (isNative) {
                // ETH/MATIC/BNB native — use sendTransaction with value
                hash = await sendTransactionAsync({
                    to: depositAddress as `0x${string}`,
                    value: parseEther(amount),
                });
            } else {
                // USDC/USDT/DAI — ERC-20 transfer
                const tokenAddress = USDC_ADDRESSES[targetChainId || 1];
                if (!tokenAddress) {
                    setError(`${token} not yet supported on ${chainName} — use native ETH for now`);
                    return;
                }
                // Decimals resolved per-chain via the canonical chains.ts
                // override map — defaults to 6 for native USDC chains, 18
                // for BSC (Binance-Peg). Without this, sending 1000 USDC
                // on BSC would underflow by 12 orders of magnitude.
                const decimals = getChainDecimals(targetChainId || 1);
                hash = await writeContractAsync({
                    address: tokenAddress,
                    abi: erc20Abi,
                    functionName: "transfer",
                    args: [depositAddress as `0x${string}`, parseUnits(amount, decimals)],
                });
            }
            setTxHash(hash);
            onSuccess?.(hash);
        } catch (e: any) {
            // User-rejected, insufficient funds, etc. — show clean message
            const raw = e?.shortMessage || e?.message || "Transaction failed";
            setError(raw.length > 120 ? raw.slice(0, 120) + "…" : raw);
        }
    };

    const isBusy = isConnecting || isSwitching || isSendingNative || isSendingErc20;

    // Not connected → show Connect button
    if (!isConnected) {
        // Prefer injected (MetaMask/Rabby) as the primary CTA
        const primaryConnector = connectors.find((c) => c.id === "metaMask") || connectors[0];
        return (
            <button
                type="button"
                onClick={() => primaryConnector && connect({ connector: primaryConnector })}
                disabled={isConnecting}
                className={cn(
                    "w-full h-12 flex items-center justify-center gap-2 rounded-[12px]",
                    "bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-[var(--color-text-on-primary)]",
                    "text-[14px] font-semibold transition-all active:scale-[0.98]",
                    isConnecting && "opacity-60 cursor-wait"
                )}
            >
                {isConnecting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Connecting wallet…</>
                ) : (
                    <><Wallet className="w-4 h-4" /> Connect wallet to send</>
                )}
            </button>
        );
    }

    // Connected + success state
    if (txHash) {
        return (
            <div className="w-full flex flex-col gap-2 p-3 rounded-[12px] bg-[var(--color-success)]/10 border border-[var(--color-success)]/30">
                <div className="flex items-center gap-2 text-[var(--color-success)]">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-[13px] font-semibold">Transaction sent</span>
                </div>
                <span className="text-[11px] text-[var(--color-text-muted)] font-mono truncate" title={txHash}>
                    {txHash}
                </span>
                <span className="text-[11px] text-[var(--color-text-muted)]">
                    Watching for arrival — card will credit automatically.
                </span>
            </div>
        );
    }

    // Connected, no tx yet — show Send button (with chain-switch nudge if needed)
    return (
        <div className="flex flex-col gap-2 w-full">
            <button
                type="button"
                onClick={handleSend}
                disabled={isBusy || !depositAddress || !amount}
                className={cn(
                    "w-full h-12 flex items-center justify-center gap-2 rounded-[12px]",
                    "bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/90 text-[var(--color-text-on-primary)]",
                    "text-[14px] font-semibold transition-all active:scale-[0.98]",
                    (isBusy || !depositAddress || !amount) && "opacity-50 cursor-not-allowed"
                )}
            >
                {isSwitching ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Switching to {chainName}…</>
                ) : isSendingNative || isSendingErc20 ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Confirm in wallet…</>
                ) : !amount ? (
                    /* Phase 3 UX (2026-05-25): explicit "enter amount" state so the
                       greyed button isn't a mystery. Replaces the old "Send  USDC
                       from wallet" (empty-amount whitespace gap). */
                    <><Wallet className="w-4 h-4" /> Enter an amount to continue</>
                ) : needsChainSwitch ? (
                    <><ArrowRight className="w-4 h-4" /> Send {amount} {token} on {chainName}</>
                ) : (
                    <><Wallet className="w-4 h-4" /> Send {amount} {token} from wallet</>
                )}
            </button>
            {walletAddress && (
                <span className="text-[10px] text-[var(--color-text-muted)] text-center font-mono">
                    from {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
                </span>
            )}
            {error && (
                <div className="flex items-start gap-1.5 p-2 rounded-[8px] bg-[var(--color-error)]/10 border border-[var(--color-error)]/30 text-[var(--color-error)]">
                    <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                    <span className="text-[11px]">{error}</span>
                </div>
            )}
        </div>
    );
}
