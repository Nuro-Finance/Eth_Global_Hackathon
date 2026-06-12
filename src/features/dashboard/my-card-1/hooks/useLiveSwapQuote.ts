"use client";

import { useEffect, useState } from "react";

export interface LiveSwapQuote {
  buyAmountUsd: number;
  minBuyAmountUsd: number;
  meetsThreshold: boolean;
  slippageBps: number;
  minSwapUsd: number;
  chainName: string;
  source?: "jupiter" | "zerox" | "uniswap" | "1inch";
  routeLabels?: string[];
  priceImpactBps?: number;
  alternatives?: Array<{ source: string; buyAmountUsd: number }>;
}

/** Debounced live quote via `/api/quote/best` (0x + Uniswap fan-out on EVM). */
export function useLiveSwapQuote(
  chainId: number,
  sellToken: string,
  amount: string,
  enabled = true,
) {
  const [quote, setQuote] = useState<LiveSwapQuote | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setQuote(null);
      setLoading(false);
      return;
    }

    const n = parseFloat(amount);
    if (!n || n <= 0 || !Number.isFinite(n) || !chainId) {
      setQuote(null);
      setLoading(false);
      return;
    }

    const ctrl = new AbortController();
    setLoading(true);
    const handle = window.setTimeout(() => {
      const url = `/api/quote/best?chainId=${chainId}&sellToken=${encodeURIComponent(sellToken)}&amount=${encodeURIComponent(amount)}`;
      fetch(url, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((data) => {
          if (ctrl.signal.aborted) return;
          setQuote(data.error || data.degraded ? null : (data as LiveSwapQuote));
        })
        .catch(() => {})
        .finally(() => {
          if (!ctrl.signal.aborted) setLoading(false);
        });
    }, 400);

    return () => {
      clearTimeout(handle);
      ctrl.abort();
    };
  }, [chainId, sellToken, amount, enabled]);

  return { quote, loading };
}
