"use client";

/**
 * useWalletActivity — Session 25 Phase 3
 *
 * Real recent-activity feed for the connected wallet. Calls the backend
 * /api/wallet-activity proxy which aggregates Alchemy getAssetTransfers
 * across chains (both inbound + outbound directions), normalizes, and
 * returns the most recent `limit` entries sorted desc by timestamp.
 *
 * 30s server-side cache per (address, limit) combination.
 */

import { useMemo, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";

export type WalletActivityEntry = {
  chainId: number;
  chainName: string;
  txHash: string;
  timestamp: number;
  direction: "in" | "out";
  asset: string;
  amount: number;
  from: string;
  to: string;
  category: string;
};

export type WalletActivity = {
  status: "idle" | "loading" | "success" | "error";
  transfers: WalletActivityEntry[];
  lastFetchedAt: number | null;
  error: string | null;
};

const INITIAL: WalletActivity = {
  status: "idle",
  transfers: [],
  lastFetchedAt: null,
  error: null,
};

export function useWalletActivity(
  limit = 50,
  refreshKey = 0,
  addressOverride?: string,
  userRefreshKey = 0
): WalletActivity {
  const { address: wagmiAddress } = useAccount();
  const address = (addressOverride?.trim() || wagmiAddress?.trim()) || undefined;
  const canFetch = Boolean(address && /^0x[a-fA-F0-9]{40}$/i.test(address));
  const [state, setState] = useState<WalletActivity>(INITIAL);
  const prevUserRefreshKey = useRef(0);

  useEffect(() => {
    if (!canFetch || !address) {
      setState(INITIAL);
      return;
    }

    let cancelled = false;
    const userInitiated = userRefreshKey > prevUserRefreshKey.current;
    prevUserRefreshKey.current = userRefreshKey;

    setState((s) => ({
      ...s,
      status: userInitiated
        ? "loading"
        : s.transfers.length > 0
          ? "success"
          : "loading",
      error: null,
    }));

    (async () => {
      try {
        const url = `/api/wallet-activity?address=${encodeURIComponent(address)}&limit=${limit}${refreshKey > 0 ? `&_refresh=${refreshKey}` : ""}`;
        const res = await fetch(url, { cache: "no-store" });
        const data: { transfers?: WalletActivityEntry[]; error?: string } = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({
            ...INITIAL,
            status: "error",
            error: data.error ?? `HTTP ${res.status}`,
          });
          return;
        }
        setState({
          status: "success",
          transfers: data.transfers ?? [],
          lastFetchedAt: Date.now(),
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          ...INITIAL,
          status: "error",
          error: err instanceof Error ? err.message : "Unable to load activity",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, canFetch, limit, refreshKey, userRefreshKey]);

  return useMemo(() => state, [state]);
}
