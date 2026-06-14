"use client";

import { useCallback, useEffect } from "react";
import { useConnectWallet, usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLiveSwapQuote } from "../hooks/useLiveSwapQuote";
import {
  BASE_CHAIN_ID,
  useBaseSwapExecutor,
} from "../hooks/useBaseSwapExecutor";

interface ReloadSwapFundsProps {
  amount: string;
  onSuccess: (txHash: string) => void;
}

export function ReloadSwapFunds({ amount, onSuccess }: ReloadSwapFundsProps) {
  const privy = usePrivy();
  const { connectWallet } = useConnectWallet();
  const { quote, loading: quoteLoading } = useLiveSwapQuote(
    BASE_CHAIN_ID,
    "native",
    amount,
    true,
  );
  const swap = useBaseSwapExecutor();

  useEffect(() => {
    swap.reset();
 // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when amount changes
  }, [amount]);

  useEffect(() => {
    if (swap.status === "confirmed" && swap.txHash) {
      onSuccess(swap.txHash);
    }
  }, [swap.status, swap.txHash, onSuccess]);

  const handleConnect = useCallback(async () => {
    if (!privy.ready) return;
    if (!privy.authenticated) {
      privy.login({ loginMethods: ["wallet"] } as Parameters<typeof privy.login>[0]);
      return;
    }
    connectWallet({ description: "Connect a wallet to sign the Base swap" });
  }, [privy, connectWallet]);

  const handleSwap = useCallback(async () => {
    await swap.execute(amount);
  }, [swap, amount]);

  const amountNum = parseFloat(amount);
  const hasAmount = Number.isFinite(amountNum) && amountNum > 0;
  const busy = ["fetching-quote", "switching-chain", "awaiting-signature", "confirming"].includes(
    swap.status,
  );

  const ctaLabel = (() => {
    if (!swap.isConnected) return "Connect Wallet";
    if (swap.status === "fetching-quote") return "Fetching quote…";
    if (swap.status === "switching-chain") return "Switch to Base…";
    if (swap.status === "awaiting-signature") return "Confirm in wallet";
    if (swap.status === "confirming") return "Confirming on Base…";
    if (swap.status === "error") return "Try again";
    if (!hasAmount) return "Enter amount";
    if (quoteLoading) return "Loading quote…";
    if (!quote) return "Quote unavailable";
    return `Sign & Swap ${amount} ETH`;
  })();

  const routeLabel =
    quote?.source === "uniswap"
      ? "Uniswap"
      : quote?.source === "zerox"
        ? "0x"
        : quote?.source ?? swap.routeSource ?? "aggregator";

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-1 pt-2 text-center">
        <div className="flex flex-col gap-1">
          <p className="m-0 text-[17px] font-semibold leading-tight text-[var(--color-text-primary)]">
            Swap <span className="text-[var(--color-nuro-brand)]">{amount || "0"} ETH</span> on Base
          </p>
          <p className="m-0 text-[13px] font-medium text-[var(--color-text-muted)]">
            Verified reload - wallet signs via Privy
          </p>
        </div>

        <div className="w-full max-w-[22rem] rounded-[var(--radius-md)] border border-[var(--color-border-deposit-input)] bg-[var(--color-bg-deposit-input)] px-4 py-3 text-left">
          <div className="flex justify-between text-sm">
            <span className="text-[var(--color-text-muted)]">You receive (est.)</span>
            <span className="font-semibold text-[var(--color-text-primary)]">
              {quoteLoading ? "…" : quote ? `$${quote.buyAmountUsd.toFixed(2)} USDC` : "-"}
            </span>
          </div>
          <div className="mt-2 flex justify-between text-xs text-[var(--color-text-muted)]">
            <span>Route</span>
            <span className="font-medium capitalize">{routeLabel}</span>
          </div>
          {quote?.routeLabels?.length ? (
            <p className="mt-1 text-[10px] leading-snug text-[var(--color-text-dimmed)]">
              {quote.routeLabels.join(" → ")}
            </p>
          ) : null}
        </div>

        {swap.txHash ? (
          <div className="w-full max-w-[22rem] rounded-[12px] border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left">
            <p className="m-0 text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-dimmed)]">
              Transaction
            </p>
            <a
              href={`https://basescan.org/tx/${swap.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block break-all font-mono text-[11px] text-[var(--color-primary)] hover:underline"
            >
              {swap.txHash}
            </a>
          </div>
        ) : null}

        {swap.error ? (
          <p className="m-0 max-w-[22rem] text-center text-xs font-medium text-[var(--color-error)]">
            {swap.error}
          </p>
        ) : null}
      </div>

      <div className="relative w-full shrink-0 shadow-2xl">
        <Button
          onClick={swap.isConnected ? handleSwap : handleConnect}
          disabled={
            swap.isConnected &&
            (!hasAmount ||
              busy ||
              (swap.status !== "error" && !quoteLoading && !quote && swap.status === "idle"))
          }
          className={cn(
            "h-12 w-full rounded-[14px] border-none bg-[var(--color-reload-button-bg)] text-sm font-bold text-[var(--color-reload-button-text)] shadow-xl transition-all hover:bg-[var(--color-reload-button-bg)]/90 active:scale-[0.98] disabled:opacity-30",
          )}
        >
          {ctaLabel}
        </Button>
      </div>
    </div>
  );
}
