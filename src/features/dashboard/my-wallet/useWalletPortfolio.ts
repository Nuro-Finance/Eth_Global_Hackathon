"use client";

/**
 * useWalletPortfolio — Session 25 Phase 3
 *
 * Calls the backend /api/wallet-portfolio proxy (which hits Alchemy +
 * CoinGecko server-side). Returns:
 * - totalUsd, delta24h (USD-weighted across all tokens)
 * - chains[] summary (chainId, name, totalUsd, tokenCount)
 * - tokens[] — every non-zero holding across all chains, sorted by USD desc
 *
 * Refreshes when the connected address changes, or when the consumer bumps
 * the optional refreshKey. Server-side cache is 30s per address, so
 * burst-refresh is cheap.
 */

import { useMemo, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";

export type WalletToken = {
  chainId: number;
  chainName: string;
  contract: string | null; // null for native
  symbol: string;
  name: string;
  decimals: number;
  logo: string | null;
  balance: string;
  balanceRaw: string;
  usdPrice: number;
  usdValue: number;
  delta24h: number | null;
  isNative: boolean;
};

export type PortfolioChainSummary = {
  chainId: number;
  chainName: string;
  nativeSymbol: string;
  totalUsd: number;
  tokenCount: number;
};

// Kept for backwards-compat with older call sites that read `.chains` and
// expected per-chain native balance fields.
export type PortfolioChainBalance = PortfolioChainSummary & {
  symbol: string;
  native: number;
  usd: number;
  usdPrice: number;
  delta24h: number | null;
};

export type WalletPortfolio = {
  status: "idle" | "loading" | "success" | "error";
  totalUsd: number;
  delta24h: number | null;
  chains: PortfolioChainBalance[];
  tokens: WalletToken[];
  lastFetchedAt: number | null;
  error: string | null;
};

const INITIAL_PORTFOLIO: WalletPortfolio = {
  status: "idle",
  totalUsd: 0,
  delta24h: null,
  chains: [],
  tokens: [],
  lastFetchedAt: null,
  error: null,
};

type ApiResponse = {
  address?: string;
  totalUsd?: number;
  delta24h?: number | null;
  chains?: PortfolioChainSummary[];
  tokens?: WalletToken[];
  fetchedAt?: number;
  chainStatuses?: Record<number, "ok" | "error">;
  error?: string;
};

export function useWalletPortfolio(
  refreshKey = 0,
  addressOverride?: string,
  userRefreshKey = 0
): WalletPortfolio {
  const { address: wagmiAddress } = useAccount();
  const address = (addressOverride?.trim() || wagmiAddress?.trim()) || undefined;
  const canFetch = Boolean(address && /^0x[a-fA-F0-9]{40}$/i.test(address));
  const [state, setState] = useState<WalletPortfolio>(INITIAL_PORTFOLIO);
  const prevUserRefreshKey = useRef(0);

  useEffect(() => {
    if (!canFetch || !address) {
      setState(INITIAL_PORTFOLIO);
      return;
    }

    let cancelled = false;
    const userInitiated = userRefreshKey > prevUserRefreshKey.current;
    prevUserRefreshKey.current = userRefreshKey;

    setState((s) => ({
      ...s,
      status: userInitiated
        ? "loading"
        : s.lastFetchedAt != null
          ? "success"
          : "loading",
      error: null,
    }));

    (async () => {
      try {
        const url = `/api/wallet-portfolio?address=${encodeURIComponent(address)}${refreshKey > 0 ? `&_refresh=${refreshKey}` : ""}`;
        const res = await fetch(url, { cache: "no-store" });
        const data: ApiResponse = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({
            ...INITIAL_PORTFOLIO,
            status: "error",
            error: data.error ?? `HTTP ${res.status}`,
          });
          return;
        }
        const tokens = data.tokens ?? [];
        const summaries = data.chains ?? [];

 // Rebuild the legacy `chains` shape (per-chain native summary) from
 // tokens + summaries so old call sites keep working.
        const legacyChains: PortfolioChainBalance[] = summaries.map((s) => {
          const native = tokens.find((t) => t.chainId === s.chainId && t.isNative);
          return {
            chainId: s.chainId,
            chainName: s.chainName,
            nativeSymbol: s.nativeSymbol,
            totalUsd: s.totalUsd,
            tokenCount: s.tokenCount,
            symbol: s.nativeSymbol,
            native: native ? Number(native.balance) : 0,
            usd: s.totalUsd,
            usdPrice: native?.usdPrice ?? 0,
            delta24h: native?.delta24h ?? null,
          };
        });

        setState({
          status: "success",
          totalUsd: data.totalUsd ?? 0,
          delta24h: data.delta24h ?? null,
          chains: legacyChains,
          tokens,
          lastFetchedAt: data.fetchedAt ?? Date.now(),
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          ...INITIAL_PORTFOLIO,
          status: "error",
          error: err instanceof Error ? err.message : "Unable to load portfolio",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, canFetch, refreshKey, userRefreshKey]);

  return useMemo(() => state, [state]);
}
