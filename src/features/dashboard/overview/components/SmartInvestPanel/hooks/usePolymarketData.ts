"use client";
import { useState, useEffect, useCallback } from "react";
import { type StockData, type PolymarketMarket, polymarketToStockData } from "../config/smartInvest.config";

const PROXY_API = "/api/polymarket/markets";

// Gamma API doesn't support tag filtering — we fetch more markets and filter client-side
const POLITICS_KEYWORDS = ["president", "election", "congress", "senate", "trump", "biden", "democrat", "republican", "vote", "governor", "ceasefire", "iran", "war", "nato", "ukraine", "russia", "china", "tariff", "sanctions"];
const CRYPTO_KEYWORDS = ["bitcoin", "btc", "ethereum", "eth", "solana", "sol", "crypto", "token", "defi", "nft", "blockchain", "coin", "altcoin", "binance", "coinbase", "mining", "price", "market cap", "stablecoin", "usdc", "usdt", "tether", "airdrop", "layer 2", "polygon", "arbitrum", "base chain", "memecoin", "doge", "shiba", "pepe"];

function matchesCategory(question: string, keywords: string[]): boolean {
  const q = question.toLowerCase();
  return keywords.some(k => q.includes(k));
}

async function fetchAllMarkets(): Promise<PolymarketMarket[]> {
  try {
    const params = new URLSearchParams({ limit: "50" });
    const res = await fetch(`${PROXY_API}?${params}`);
    if (!res.ok) return [];
    const markets: PolymarketMarket[] = await res.json();
    return markets.filter((m) => parseFloat(m.volume24hr || "0") > 0);
  } catch {
    return [];
  }
}

export function usePolymarketData() {
  const [trending, setTrending] = useState<StockData[]>([]);
  const [politics, setPolitics] = useState<StockData[]>([]);
  const [crypto, setCrypto] = useState<StockData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    const allMarkets = await fetchAllMarkets();

    // Trending = top 4 by volume (all categories)
    setTrending(allMarkets.slice(0, 4).map(polymarketToStockData));

    // Politics = filter by keywords
    const politicsMarkets = allMarkets.filter(m => matchesCategory(m.question || "", POLITICS_KEYWORDS));
    setPolitics(politicsMarkets.slice(0, 4).map(polymarketToStockData));

    // Crypto = filter by keywords
    const cryptoMarkets = allMarkets.filter(m => matchesCategory(m.question || "", CRYPTO_KEYWORDS));
    setCrypto(cryptoMarkets.slice(0, 4).map(polymarketToStockData));

    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { trending, politics, crypto, isLoading, refresh };
}
