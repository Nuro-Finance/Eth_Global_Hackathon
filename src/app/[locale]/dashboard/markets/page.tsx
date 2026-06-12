"use client";

import { useState, useEffect } from "react";
import { useAppSession } from "@/hooks/useAppSession";
import { TrendingUp, TrendingDown, DollarSign, BarChart3, Users, Clock, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, PageTitle, DraggableStatsGrid, type StatData } from "@/components";
import { createPortal } from "react-dom";

interface Market {
  id: string;
  question: string;
  description: string;
  category: string;
  resolution_source: string;
  resolution_date: string;
  status: string;
  yes_pool: string;
  no_pool: string;
  total_volume: string;
  yes_price: string;
  no_price: string;
  total_positions: string;
}

const SUPPORTED_CHAINS = [
  { name: "Base", icon: "🔵", chainId: 8453, type: "cctp" },
  { name: "Ethereum", icon: "⟠", chainId: 1, type: "cctp" },
  { name: "Arbitrum", icon: "🔷", chainId: 42161, type: "cctp" },
  { name: "Polygon", icon: "🟣", chainId: 137, type: "cctp" },
  { name: "Optimism", icon: "🔴", chainId: 10, type: "cctp" },
  { name: "Avalanche", icon: "🔺", chainId: 43114, type: "cctp" },
  { name: "BSC", icon: "🟡", chainId: 56, type: "lz" },
  { name: "Solana", icon: "🟢", chainId: 0, type: "cctp" },
  { name: "zkSync", icon: "💠", chainId: 324, type: "lz" },
  { name: "Scroll", icon: "📜", chainId: 534352, type: "lz" },
  { name: "Linea", icon: "🔹", chainId: 59144, type: "cctp" },
  { name: "Celo", icon: "🌿", chainId: 42220, type: "lz" },
  { name: "Gnosis", icon: "🦉", chainId: 100, type: "lz" },
  { name: "Sonic", icon: "⚡", chainId: 146, type: "cctp" },
  { name: "Sei", icon: "🌊", chainId: 1329, type: "cctp" },
  { name: "World Chain", icon: "🌍", chainId: 480, type: "cctp" },
  { name: "Unichain", icon: "🦄", chainId: 130, type: "cctp" },
  { name: "Ink", icon: "🖊️", chainId: 57073, type: "cctp" },
  { name: "Monad", icon: "◆", chainId: 10143, type: "cctp" },
  { name: "HyperEVM", icon: "⚡", chainId: 999, type: "cctp" },
  { name: "XDC", icon: "✕", chainId: 50, type: "cctp" },
  { name: "Plume", icon: "🪶", chainId: 98866, type: "cctp" },
  { name: "Codex", icon: "📖", chainId: 10888, type: "cctp" },
];

const CATEGORY_COLORS: Record<string, string> = {
  crypto: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  politics: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  culture: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  sports: "text-green-400 bg-green-500/10 border-green-500/20",
  general: "text-gray-400 bg-gray-500/10 border-gray-500/20",
};

function BetModal({ market, onClose, token, onBetPlaced }: { market: Market; onClose: () => void; token: string; onBetPlaced: () => void }) {
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("");
  const [placing, setPlacing] = useState(false);
  const [result, setResult] = useState<any>(null);

  const yesPrice = parseFloat(market.yes_price) || 50;
  const noPrice = parseFloat(market.no_price) || 50;
  const selectedPrice = side === "yes" ? yesPrice : noPrice;
  const shares = amount ? (parseFloat(amount) / (selectedPrice / 100)).toFixed(2) : "0";
  const potential = amount ? (parseFloat(shares)).toFixed(2) : "0.00";

  const handleBet = async () => {
    if (!amount || parseFloat(amount) <= 0) return;
    setPlacing(true);
    try {
      const res = await fetch(`/api/markets/${market.id}/bet`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ side, amount: parseFloat(amount) }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ ok: true, ...data });
        onBetPlaced();
      } else {
        setResult({ ok: false, error: data.error });
      }
    } catch { setResult({ ok: false, error: "Network error" }); }
    setPlacing(false);
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[380px] rounded-2xl bg-[#1a1a2e] border border-[var(--color-border-primary)] shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-[var(--color-border-primary)]">
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">{market.question}</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">{market.description}</p>
        </div>

        <div className="p-5 space-y-8">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setSide("yes")}
              className={`py-3 rounded-xl text-sm font-bold transition-all ${side === "yes" ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/25" : "bg-[var(--color-bg-input)] text-[var(--color-text-muted)] border border-[var(--color-border-primary)]"}`}>
              YES {yesPrice.toFixed(0)}¢
            </button>
            <button onClick={() => setSide("no")}
              className={`py-3 rounded-xl text-sm font-bold transition-all ${side === "no" ? "bg-red-500 text-white shadow-lg shadow-red-500/25" : "bg-[var(--color-bg-input)] text-[var(--color-text-muted)] border border-[var(--color-border-primary)]"}`}>
              NO {noPrice.toFixed(0)}¢
            </button>
          </div>

          <div>
            <label className="text-xs text-[var(--color-text-muted)]">Amount</label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xl text-[var(--color-text-muted)]">$</span>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0"
                className="w-full h-12 pl-8 text-2xl font-bold bg-transparent text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]/20 focus:outline-none" />
            </div>
            <div className="flex gap-1.5 mt-2">
              {[1, 5, 10, 50].map(v => (
                <button key={v} onClick={() => setAmount(String((parseFloat(amount) || 0) + v))}
                  className="flex-1 py-1.5 rounded-lg text-xs font-semibold bg-[var(--color-bg-input)] text-[var(--color-text-muted)] border border-[var(--color-border-primary)] hover:bg-[var(--color-bg-input-hover)]">
                  +${v}
                </button>
              ))}
            </div>
          </div>

          {amount && parseFloat(amount) > 0 && (
            <div className="flex justify-between text-xs text-[var(--color-text-muted)] px-1">
              <span>Shares: {shares}</span>
              <span className="text-emerald-400">Potential: ${potential}</span>
            </div>
          )}

          {result && (
            <div className={`text-xs p-2.5 rounded-lg ${
              result.executionStatus === 'executed'
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-red-500/10 text-red-400"
            }`}>
              {result.executionStatus === 'executed'
                ? `Executed: ${result.executionTxHash?.slice(0, 10)}...`
                : result.error || "Execution failed"}
            </div>
          )}

          <button onClick={handleBet} disabled={placing || !amount || parseFloat(amount) <= 0}
            className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40 ${side === "yes" ? "bg-emerald-500 hover:bg-emerald-400 text-white" : "bg-red-500 hover:bg-red-400 text-white"}`}>
            {placing ? "Placing..." : `Bet ${side.toUpperCase()}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function MarketCard({ market, onBet }: { market: Market; onBet: () => void }) {
  const yesPrice = parseFloat(market.yes_price) || 50;
  const noPrice = parseFloat(market.no_price) || 50;
  const volume = parseFloat(market.total_volume) || 0;
  const positions = parseInt(market.total_positions) || 0;
  const daysLeft = market.resolution_date ? Math.max(0, Math.ceil((new Date(market.resolution_date).getTime() - Date.now()) / 86400000)) : 0;
  const catCls = CATEGORY_COLORS[market.category] || CATEGORY_COLORS.general;

  return (
    <Card variant="elevated" size="md" className="hover:border-[var(--color-primary)]/20 transition-all cursor-pointer group" onClick={onBet}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${catCls}`}>{market.category}</span>
          <div className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
            <Clock className="w-3 h-3" />
            {daysLeft}d left
          </div>
        </div>

        <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-2 leading-tight group-hover:text-[var(--color-primary)] transition-colors">
          {market.question}
        </h3>
        <p className="text-[11px] text-[var(--color-text-muted)] mb-4 line-clamp-2">{market.description}</p>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-center">
            <p className="text-[10px] text-emerald-400 font-semibold mb-0.5">YES</p>
            <p className="text-lg font-black text-emerald-400">{yesPrice.toFixed(0)}¢</p>
          </div>
          <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20 text-center">
            <p className="text-[10px] text-red-400 font-semibold mb-0.5">NO</p>
            <p className="text-lg font-black text-red-400">{noPrice.toFixed(0)}¢</p>
          </div>
        </div>

        <div className="flex items-center justify-between text-[10px] text-[var(--color-text-muted)]">
          <span>${volume >= 1000 ? (volume / 1000).toFixed(1) + "K" : volume.toFixed(0)} vol</span>
          <span>{positions} bet{positions !== 1 ? "s" : ""}</span>
          <span className="text-emerald-400/60">💳 → Visa</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MarketsPage() {
  const { data: session } = useAppSession();
  const token = (session as any)?.accessToken;
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [betMarket, setBetMarket] = useState<Market | null>(null);
  const [filter, setFilter] = useState("all");
  const [chainFilter, setChainFilter] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ question: "", description: "", category: "crypto", resolutionSource: "", resolutionDate: "" });
  const [creating, setCreating] = useState(false);

  const fetchMarkets = () => {
    fetch("/api/markets")
      .then(r => r.ok ? r.json() : [])
      .then(setMarkets)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchMarkets(); }, []);

  const filtered = filter === "all" ? markets : markets.filter(m => m.category === filter);
  const categories = ["all", ...new Set(markets.map(m => m.category))];
  const totalVolume = markets.reduce((s, m) => s + parseFloat(m.total_volume || "0"), 0);

  const stats: StatData[] = [
    { id: "markets", title: "Active Markets", value: String(markets.length), change: 0, isPositive: true, icon: <BarChart3 className="w-5 h-5" />, showChange: false },
    { id: "volume", title: "Total Volume", value: `$${totalVolume.toFixed(0)}`, change: 0, isPositive: true, icon: <DollarSign className="w-5 h-5" />, showChange: false },
    { id: "chains", title: "Supported Chains", value: "23", change: 0, isPositive: true, icon: <TrendingUp className="w-5 h-5" />, showChange: false },
    { id: "positions", title: "Total Positions", value: String(markets.reduce((s, m) => s + parseInt(m.total_positions || "0"), 0)), change: 0, isPositive: true, icon: <Users className="w-5 h-5" />, showChange: false },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        leftSection={
          <PageTitle
            title="Polymarket"
            subtitle="Bet from any chain. Win → cash out to Visa, swap to crypto, or reinvest."
          />
        }
        rightSection={
          <Button className="bg-[var(--color-primary)] text-white" onClick={() => setShowCreateForm(true)}>
            <Plus className="w-4 h-4 mr-2" /> Create Market
          </Button>
        }
      />

      <DraggableStatsGrid storageKey="markets-stats" isDraggable={true}
        gridClassName="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" stats={stats} />

      {/* Create Market Form */}
      {showCreateForm && (
        <Card variant="elevated" size="md" className="border-[var(--color-primary)]/20">
          <CardContent className="p-5 space-y-8">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--color-text-primary)]">Create Prediction Market</h3>
              <button onClick={() => setShowCreateForm(false)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">✕</button>
            </div>
            <div>
              <label className="text-xs text-[var(--color-text-muted)]">Question *</label>
              <input type="text" value={createForm.question} onChange={e => setCreateForm(f => ({ ...f, question: e.target.value }))}
                placeholder="Will Bitcoin hit $100K by December 2026?"
                className="w-full h-10 px-3 mt-1 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)]" />
            </div>
            <div>
              <label className="text-xs text-[var(--color-text-muted)]">Description</label>
              <textarea value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Resolves YES if BTC/USD reaches $100,000 on any major exchange"
                className="w-full h-20 px-3 py-2 mt-1 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)] resize-none" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-[var(--color-text-muted)]">Category</label>
                <select value={createForm.category} onChange={e => setCreateForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full h-10 px-3 mt-1 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]">
                  <option value="crypto">Crypto</option>
                  <option value="politics">Politics</option>
                  <option value="sports">Sports</option>
                  <option value="culture">Culture</option>
                  <option value="general">General</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--color-text-muted)]">Resolution Source</label>
                <input type="text" value={createForm.resolutionSource} onChange={e => setCreateForm(f => ({ ...f, resolutionSource: e.target.value }))}
                  placeholder="CoinGecko, ESPN, etc."
                  className="w-full h-10 px-3 mt-1 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)]" />
              </div>
              <div>
                <label className="text-xs text-[var(--color-text-muted)]">Resolution Date</label>
                <input type="date" value={createForm.resolutionDate} onChange={e => setCreateForm(f => ({ ...f, resolutionDate: e.target.value }))}
                  className="w-full h-10 px-3 mt-1 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary)]" />
              </div>
            </div>
            <Button className="w-full bg-[var(--color-primary)] text-white" disabled={creating || !createForm.question.trim()}
              onClick={async () => {
                if (!token || !createForm.question.trim()) return;
                setCreating(true);
                try {
                  const res = await fetch("/api/markets", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                    body: JSON.stringify(createForm),
                  });
                  if (res.ok) {
                    setShowCreateForm(false);
                    setCreateForm({ question: "", description: "", category: "crypto", resolutionSource: "", resolutionDate: "" });
                    fetchMarkets();
                  } else {
                    const data = await res.json().catch(() => ({}));
                    alert(data.error || "Failed to create market");
                  }
                } catch { alert("Network error"); }
                setCreating(false);
              }}>
              {creating ? "Creating..." : "Create Market"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Omnichain Banner — clean, no filter noise */}
      <Card variant="default" size="sm" className="border-emerald-500/10 bg-emerald-500/5">
        <CardContent className="p-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-emerald-400 text-sm font-bold">⚡ Omnichain</span>
            <span className="text-xs text-[var(--color-text-muted)]">
              Bet from any of 23 chains — we handle the bridging. Winnings settle to your card or stay as crypto.
            </span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            {SUPPORTED_CHAINS.slice(0, 10).map(c => (
              <span key={c.name} className="text-[10px]" title={c.name}>{c.icon}</span>
            ))}
            <span className="text-[9px] text-[var(--color-text-muted)] ml-1">+{SUPPORTED_CHAINS.length - 10}</span>
          </div>
        </CardContent>
      </Card>

      {/* Category Filter */}
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {categories.map(cat => (
          <button key={cat} onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${filter === cat ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-bg-input)] text-[var(--color-text-muted)] border border-[var(--color-border-primary)]"}`}>
            {cat === "all" ? "All Markets" : cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Markets Grid */}
      {loading ? (
        <div className="py-12 text-center text-[var(--color-text-muted)]">Loading markets...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-[var(--color-text-muted)]">No markets found</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(market => (
            <MarketCard key={market.id} market={market} onBet={() => setBetMarket(market)} />
          ))}
        </div>
      )}

      {/* Bet Modal */}
      {betMarket && token && (
        <BetModal market={betMarket} onClose={() => setBetMarket(null)} token={token}
          onBetPlaced={() => { fetchMarkets(); }} />
      )}
    </div>
  );
}
