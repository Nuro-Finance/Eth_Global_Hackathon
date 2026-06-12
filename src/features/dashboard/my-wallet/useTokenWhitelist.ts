"use client";

/**
 * useTokenWhitelist — Session 26
 *
 * Positive signal for the scam filter. Fetches the `/api/supported-tokens`
 * allowlist (maintained in the `erc20_allowlist` DB table, refreshed
 * whenever admin toggles a token on/off) and exposes fast membership
 * checks by (chainId, contract) and by symbol.
 *
 * Why: the scam heuristic in `looksLikeScam()` uses price-is-zero as a
 * soft signal, which produces false positives for legit tokens that
 * don't have a CoinGecko price entry yet (brand-new launches, niche
 * L2-only ERC-20s, audited memecoins we added to the allowlist ahead
 * of price-feed coverage). Cross-referencing against the allowlist
 * gives us a definitive "this is legit" override.
 *
 * Not an exhaustive whitelist of safe tokens — only covers tokens we've
 * deliberately vetted for our swap pipeline. Tokens not on the list
 * aren't automatically bad, they just don't get the "trusted" override.
 *
 * Cache: stale-while-revalidate via SWR semantics. First call hits the
 * endpoint (backend edge-caches 60s), subsequent consumers share the
 * in-memory result for 10 min.
 */

import { useMemo, useEffect, useState } from "react";

type SupportedTokenEntry = {
  symbol: string;
  chainId?: number;
  contractAddress?: string;
  category?: string;
};

type SupportedTokensResponse = {
  stablecoins?: SupportedTokenEntry[];
  natives?: SupportedTokenEntry[];
  bluechips?: SupportedTokenEntry[];
  memecoins?: SupportedTokenEntry[];
};

export type TokenWhitelist = {
  ready: boolean;
 /** Fast lookup by "chainId-contract.toLowerCase()". Natives skipped (always trusted elsewhere). */
  byAddress: Set<string>;
 /** Fast lookup by lowercased symbol. Looser — catches symbol matches across chains. */
  bySymbol: Set<string>;
};

const EMPTY: TokenWhitelist = {
  ready: false,
  byAddress: new Set(),
  bySymbol: new Set(),
};

// Module-level cache so multiple components using the hook share one fetch.
let moduleCache: { value: TokenWhitelist; expiresAt: number } | null = null;
const TTL_MS = 10 * 60_000;

function addressKey(chainId: number, contract: string): string {
  return `${chainId}-${contract.toLowerCase()}`;
}

async function fetchWhitelist(): Promise<TokenWhitelist> {
  const res = await fetch("/api/supported-tokens", { cache: "no-store" });
  if (!res.ok) throw new Error(`supported-tokens ${res.status}`);
  const data: SupportedTokensResponse = await res.json();
  const byAddress = new Set<string>();
  const bySymbol = new Set<string>();
  const groups = [data.stablecoins, data.bluechips, data.memecoins]; // natives excluded — no contract
  for (const g of groups) {
    if (!g) continue;
    for (const t of g) {
      if (t.symbol) bySymbol.add(t.symbol.toLowerCase());
      if (t.chainId != null && t.contractAddress) {
        byAddress.add(addressKey(t.chainId, t.contractAddress));
      }
    }
  }
  return { ready: true, byAddress, bySymbol };
}

export function useTokenWhitelist(): TokenWhitelist {
  const [state, setState] = useState<TokenWhitelist>(
    () => moduleCache?.value ?? EMPTY
  );

  useEffect(() => {
    let cancelled = false;
    const now = Date.now();
 // Fresh cache — nothing to do
    if (moduleCache && moduleCache.expiresAt > now && state.ready) return;
    (async () => {
      try {
        const fresh = await fetchWhitelist();
        if (cancelled) return;
        moduleCache = { value: fresh, expiresAt: Date.now() + TTL_MS };
        setState(fresh);
      } catch (err) {
 // Silent fail — whitelist is an enhancement, not critical
        if (process.env.NODE_ENV === "development") {
          console.warn("[useTokenWhitelist] fetch failed:", err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.ready]);

  return useMemo(() => state, [state]);
}

/**
 * isWhitelistedToken — convenience matcher. Prefers exact
 * (chainId, contract) match, falls back to symbol-only match when
 * the caller doesn't have a contract address (e.g. for Alchemy activity
 * entries which only carry the asset symbol).
 */
export function isWhitelistedToken(
  whitelist: TokenWhitelist,
  opts: { chainId?: number; contract?: string | null; symbol?: string | null }
): boolean {
  if (!whitelist.ready) return false;
  if (opts.chainId != null && opts.contract) {
    if (whitelist.byAddress.has(addressKey(opts.chainId, opts.contract))) return true;
  }
  if (opts.symbol) {
    if (whitelist.bySymbol.has(opts.symbol.toLowerCase())) return true;
  }
  return false;
}
