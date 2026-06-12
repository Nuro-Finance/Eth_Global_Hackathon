export interface PublicBot {
  id: string;
  name: string;
  description: string;
  repo: string;
  stars: string;
  language: string;
  strategies: string[];
  risk: "low" | "medium" | "high";
  verified: boolean;
}

// Curated directory of top open-source Polymarket bots
export const PUBLIC_BOTS: PublicBot[] = [
  {
    id: "polymarket-agents",
    name: "Polymarket Agents (Official)",
    description: "Official developer framework for building AI agents that trade autonomously on Polymarket. MIT License.",
    repo: "https://github.com/Polymarket/agents",
    stars: "2.1k",
    language: "Python",
    strategies: ["AI Forecast", "Autonomous"],
    risk: "medium",
    verified: true,
  },
  {
    id: "dylan-trading-bot",
    name: "Advanced Trading Bot",
    description: "7 automated strategies: arbitrage, convergence, market making, momentum, AI forecast. 53K+ lines TypeScript.",
    repo: "https://github.com/dylanpersonguy/Polymarket-Trading-Bot",
    stars: "1.8k",
    language: "TypeScript",
    strategies: ["Arbitrage", "Market Making", "Momentum", "AI Forecast", "Convergence"],
    risk: "high",
    verified: false,
  },
  {
    id: "poly-maker",
    name: "Poly Maker (Market Making)",
    description: "Automated market making bot providing liquidity on both sides. Configurable via Google Sheets.",
    repo: "https://github.com/warproxxx/poly-maker",
    stars: "890",
    language: "Python",
    strategies: ["Market Making", "Liquidity"],
    risk: "medium",
    verified: false,
  },
  {
    id: "polybot",
    name: "PolyBot (Strategy Reverse Engineering)",
    description: "Reverse-engineer every Polymarket strategy and trade fast. Open-source infrastructure toolkit.",
    repo: "https://github.com/ent0n29/polybot",
    stars: "720",
    language: "TypeScript",
    strategies: ["Reverse Engineering", "Fast Execution"],
    risk: "high",
    verified: false,
  },
  {
    id: "discountry-bot",
    name: "Simple Trading Bot",
    description: "Beginner-friendly Python bot with gasless transactions and real-time WebSocket data.",
    repo: "https://github.com/discountry/polymarket-trading-bot",
    stars: "650",
    language: "Python",
    strategies: ["Basic Trading", "Gasless"],
    risk: "low",
    verified: false,
  },
  {
    id: "fadi-bot",
    name: "4-Strategy Bot",
    description: "4 strategies in one bot with v3.1 enhanced risk management and smart money tracking.",
    repo: "https://github.com/MrFadiAi/Polymarket-bot",
    stars: "580",
    language: "Python",
    strategies: ["Smart Money", "Risk Management", "Multi-Strategy"],
    risk: "medium",
    verified: false,
  },
  {
    id: "copy-trader",
    name: "Copy Trading Bot",
    description: "Track and copy successful Polymarket whale traders automatically.",
    repo: "https://github.com/Krypto-Hashers-Community/polymarket-copy-trading-bot",
    stars: "420",
    language: "Python",
    strategies: ["Copy Trading", "Whale Tracking"],
    risk: "medium",
    verified: false,
  },
  {
    id: "auto-mm",
    name: "Automated Market Maker",
    description: "Production-ready automated market making for Polymarket prediction markets.",
    repo: "https://github.com/terrytrl100/polymarket-automated-mm",
    stars: "380",
    language: "TypeScript",
    strategies: ["Market Making", "Automated"],
    risk: "medium",
    verified: false,
  },
];
