"use client";

// ─── SolanaWalletCard — Session 28 Phase 8 ──────────────────────────────────
// Dedicated UI for the user's Privy-embedded Solana wallet. Consumes the
// existing `useSolanaWalletPortfolio` hook and renders SOL balance, SPL token
// holdings, total USD value, and Solscan links.
//
// Purpose: parity with the EVM AssetsTable. Existing ConnectedWalletDashboard
// only surfaces EVM chains; Session 27 added the Privy Solana hook but never
// exposed the data in a card. This component fills that gap.
//
// Drop-in usage:
// <SolanaWalletCard /> // auto-resolves connected address
// <SolanaWalletCard address="ABC123..." /> // admin/debug view
//
// Defensive by design — renders empty state when:
// • Privy isn't configured (no NEXT_PUBLIC_PRIVY_APP_ID)
// • User hasn't completed Solana wallet creation
// • Address yields zero holdings
//
// Never throws; never blocks page render.

import { useMemo, useState, useCallback } from "react";
import { ArrowUpRight, Copy, RefreshCw, Check } from "lucide-react";
import { useSolanaWalletPortfolio, type SolanaToken } from "./useSolanaWalletPortfolio";
import { cn } from "@/lib/utils";

// ─── FORMATTERS ──────────────────────────────────────────────────────────────

function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return "$0.00";
  if (Math.abs(n) < 0.01 && n !== 0) return "<$0.01";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatBalance(n: number, decimals: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
 // Show more precision for small balances (micro-amounts of volatile tokens)
  const displayDecimals = n < 1 ? Math.min(6, decimals) : Math.min(4, decimals);
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: displayDecimals,
  });
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function solscanUrl(addressOrMint: string, type: "address" | "token" = "address"): string {
  return `https://solscan.io/${type}/${addressOrMint}`;
}

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(() => {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }, [value]);
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={label || "Copy"}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)] hover:bg-white/[0.06] hover:text-[var(--color-text-primary)] transition-colors"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function SolanaTokenRow({ token, addressForExplorer }: { token: SolanaToken; addressForExplorer?: string }) {
  const symbol = token.symbol || truncateAddress(token.mint);
  const isNative = token.mint === "So11111111111111111111111111111111111111112"; // wrapped SOL sentinel — rare in SPL list
  const explorerTarget = isNative ? addressForExplorer : token.mint;
  const explorerType = isNative ? "address" : "token";

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-white/[0.03] transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <div className="h-8 w-8 flex-shrink-0 rounded-full bg-gradient-to-br from-[#9945FF] to-[#14F195] flex items-center justify-center text-[10px] font-bold text-white">
          {symbol.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-[var(--color-text-primary)] truncate">{symbol}</div>
          <div className="text-[11px] text-[var(--color-text-muted)] truncate">
            {formatBalance(token.balance, token.decimals)} {symbol}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="text-right">
          <div className="text-sm font-medium text-[var(--color-text-primary)]">{formatUsd(token.usdValue)}</div>
          <div className="text-[11px] text-[var(--color-text-muted)]">{formatUsd(token.usdPrice)}</div>
        </div>
        {explorerTarget && (
          <a
            href={solscanUrl(explorerTarget, explorerType)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded p-1 text-[var(--color-text-muted)] hover:bg-white/[0.06] hover:text-[var(--color-text-primary)] transition-colors"
            aria-label="View on Solscan"
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export interface SolanaWalletCardProps {
 /** Optional explicit address override — omit to use the user's Privy wallet. */
  address?: string | null;
 /** Custom title (defaults to "Solana Wallet"). */
  title?: string;
  className?: string;
}

export function SolanaWalletCard({ address: explicitAddress, title = "Solana Wallet", className }: SolanaWalletCardProps) {
  const { portfolio, isLoading, error, refresh } = useSolanaWalletPortfolio(explicitAddress);

 // Sort tokens by USD value descending — highest-value assets float to top.
  const sortedTokens = useMemo(() => {
    if (!portfolio?.tokens) return [];
    return [...portfolio.tokens].sort((a, b) => b.usdValue - a.usdValue);
  }, [portfolio?.tokens]);

  const nativeValueUsd = portfolio?.nativeUsdValue ?? 0;
  const totalValueUsd = portfolio?.totalUsd ?? 0;
  const tokenCount = sortedTokens.length;

  return (
    <div
      className={cn(
        "flex flex-col rounded-[var(--radius-lg)] border border-white/[0.06] bg-black/20 overflow-hidden",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.05]">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-6 w-6 flex-shrink-0 rounded-full bg-gradient-to-br from-[#9945FF] to-[#14F195]" aria-hidden />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h3>
            {portfolio?.address && (
              <div className="flex items-center gap-1">
                <a
                  href={solscanUrl(portfolio.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                >
                  {truncateAddress(portfolio.address)}
                </a>
                <CopyButton value={portfolio.address} label="Copy Solana address" />
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => refresh()}
          disabled={isLoading}
          className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-white/[0.06] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-40"
          aria-label="Refresh Solana portfolio"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
        </button>
      </div>

      {/* Total USD panel */}
      <div className="px-4 py-3 border-b border-white/[0.05]">
        <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">Total balance</div>
        <div className="mt-0.5 text-xl font-semibold text-[var(--color-text-primary)]">
          {isLoading && !portfolio ? (
            <span className="inline-block h-5 w-24 rounded bg-white/[0.04] animate-pulse" />
          ) : (
            formatUsd(totalValueUsd)
          )}
        </div>
        {portfolio && (
          <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">
            <span>{formatBalance(portfolio.nativeBalance, 9)} SOL</span>
            <span className="mx-1.5 opacity-40">·</span>
            <span>{formatUsd(nativeValueUsd)}</span>
            {tokenCount > 0 && (
              <>
                <span className="mx-1.5 opacity-40">·</span>
                <span>
                  {tokenCount} SPL token{tokenCount === 1 ? "" : "s"}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Tokens / state */}
      <div className="flex-1 min-h-0">
        {error ? (
          <div className="px-4 py-6 text-xs text-[var(--color-text-muted)]">
            <div className="mb-2 font-medium text-red-400/80">Failed to load Solana portfolio</div>
            <div className="text-[11px] leading-relaxed">{error}</div>
            <button
              type="button"
              onClick={() => refresh()}
              className="mt-2 rounded bg-white/[0.04] px-2.5 py-1 text-[11px] text-[var(--color-text-primary)] hover:bg-white/[0.1] transition-colors"
            >
              Retry
            </button>
          </div>
        ) : isLoading && !portfolio ? (
          <div className="px-4 py-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="mb-2 h-10 rounded bg-white/[0.04] animate-pulse" />
            ))}
          </div>
        ) : !portfolio ? (
          <div className="px-4 py-8 text-center">
            <div className="text-sm text-[var(--color-text-muted)]">No Solana wallet connected</div>
            <div className="mt-1 text-[11px] text-[var(--color-text-muted)]/70">
              Your Solana address appears here once your Privy wallet is provisioned.
            </div>
          </div>
        ) : tokenCount === 0 ? (
          <div className="px-4 py-6 text-center">
            <div className="text-sm text-[var(--color-text-muted)]">No SPL tokens</div>
            <div className="mt-1 text-[11px] text-[var(--color-text-muted)]/70">
              Deposit USDC-SPL or bridge via CCTP to see assets here.
            </div>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {sortedTokens.map((t) => (
              <SolanaTokenRow key={t.mint} token={t} addressForExplorer={portfolio.address} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {portfolio && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-t border-white/[0.05]">
          <div className="text-[10px] text-[var(--color-text-muted)]">
            Updated {new Date(portfolio.fetchedAt).toLocaleTimeString()}
          </div>
          <a
            href={solscanUrl(portfolio.address)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            View on Solscan →
          </a>
        </div>
      )}
    </div>
  );
}
