import { ReactNode } from "react";

export interface StockLogo {
  icon: ReactNode;
  bgColor: string;
  textColor: string;
}

export interface StockData {
  name: string;
  symbol: string;
  price: string;
  change: string;
  isPositive: boolean;
  logo: StockLogo;
  url?: string;
  marketId?: string;
  yesPct?: number;
  noPct?: number;
}

// Polymarket API types
export interface PolymarketMarket {
  id: string;
  question: string;
  slug: string;
  outcomes: string[];
  outcomePrices: string[];
  volume: string;
  volume24hr: string;
  image: string;
  icon: string;
  active: boolean;
  closed: boolean;
  endDate: string;
  lastTradePrice: string;
  bestBid: string;
  bestAsk: string;
}

// Parse outcomePrices — Gamma API returns stringified JSON: "[\"0.65\",\"0.35\"]"
function parseYesPrice(raw: any): number {
  if (!raw) return 0;
  try {
    if (typeof raw === "string") {
      const parsed = JSON.parse(raw);
      return parseFloat(parsed[0]) || 0;
    }
    if (Array.isArray(raw)) return parseFloat(raw[0]) || 0;
  } catch {}
  return 0;
}

// Convert Polymarket market to our display format
export function polymarketToStockData(market: PolymarketMarket): StockData {
  const yesPrice = parseYesPrice(market.outcomePrices);
  const vol24h = parseFloat(market.volume24hr || "0");
  const question = market.question || "Unknown Market";
  const yesPct = Math.round(yesPrice * 100);
  const noPct = 100 - yesPct;

  const name = question.length > 40 ? question.slice(0, 37) + "..." : question;

  return {
    name,
    symbol: `${yesPct}% YES`,
    price: `$${vol24h >= 1000000 ? (vol24h / 1000000).toFixed(1) + "M" : vol24h >= 1000 ? (vol24h / 1000).toFixed(0) + "K" : vol24h.toFixed(0)} vol`,
    change: `${yesPct}¢`,
    isPositive: yesPrice >= 0.5,
    logo: {
      icon: market.image ? (
        <img src={market.image} alt="" className="w-full h-full rounded-full object-cover" />
      ) : (
        <span className="text-[10px] font-bold">{yesPrice >= 0.5 ? "✓" : "✗"}</span>
      ),
      bgColor: yesPrice >= 0.7 ? "#10B981" : yesPrice >= 0.4 ? "#F59E0B" : "#EF4444",
      textColor: "#FFFFFF",
    },
    url: market.slug ? `https://polymarket.com/market/${market.slug}` : `https://polymarket.com`,
    // Extra data for betting UI
    marketId: market.id,
    yesPct,
    noPct,
  };
}

// Legacy static data — kept as fallback if API fails
export const stocksByCategory: Record<string, StockData[]> = {
  Popular: [],
  Tech: [],
  "Social Media": [],
};

export const stocksData: StockData[] = [];
