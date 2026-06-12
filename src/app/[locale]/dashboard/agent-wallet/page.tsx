"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppSession } from "@/hooks/useAppSession";
import { Bot, Wallet, TrendingUp, TrendingDown, Copy, Check, CreditCard, Pause, Play, DollarSign, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, PageTitle } from "@/components";
import { copyToClipboard } from "@/lib/clipboard";

interface Agent {
  id: string;
  name: string;
  type: string;
  wallet_address: string;
  card_id: string | null;
  status: string;
  total_invested: string;
  total_profit: string;
  win_count: number;
  loss_count: number;
  risk_limit: string;
  open_bets?: string;
  total_bets?: string;
  created_at: string;
}

interface Bet {
  id: string;
  market_question: string;
  outcome: string;
  amount: string;
  entry_price: string;
  exit_price: string | null;
  profit: string | null;
  status: string;
  created_at: string;
}

interface UserCard {
  id: string;
  card_name?: string;
  card_holder?: string;
  balance?: number;
}

function AgentCard({ agent, token, onRefresh, userCards }: { agent: Agent; token: string; onRefresh: () => void; userCards: UserCard[] }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [bets, setBets] = useState<Bet[]>([]);
  const [loadingBets, setLoadingBets] = useState(false);
  const [settling, setSettling] = useState(false);
  const [settleMsg, setSettleMsg] = useState("");
  const [showCardPicker, setShowCardPicker] = useState(false);
  const [linking, setLinking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Delete agent "${agent.name}"? This removes all bets and cannot be undone.`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/agents/${agent.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      onRefresh();
    } catch {}
    setDeleting(false);
  };

  const profit = parseFloat(agent.total_profit || "0");
  const invested = parseFloat(agent.total_invested || "0");
  const totalBets = parseInt(agent.total_bets || "0");

  const handleCopy = () => {
    copyToClipboard(agent.wallet_address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleStatus = async () => {
    const newStatus = agent.status === "active" ? "paused" : "active";
    await fetch(`/api/agents/${agent.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    onRefresh();
  };

  const handleLinkCard = async (cardId: string) => {
    setLinking(true);
    try {
      await fetch(`/api/agents/${agent.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: cardId || null }),
      });
      setShowCardPicker(false);
      onRefresh();
    } catch {}
    setLinking(false);
  };

  const linkedCard = userCards.find(c => c.id === agent.card_id);

  const handleSettle = async () => {
    setSettling(true);
    setSettleMsg("");
    try {
      const res = await fetch(`/api/agents/${agent.id}/settle`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (res.ok) {
        setSettleMsg(`Settled $${data.settled?.toFixed(2)} to card!`);
        onRefresh();
      } else {
        setSettleMsg(data.error || data.message || "Failed");
      }
    } catch { setSettleMsg("Error"); }
    setSettling(false);
  };

  const loadBets = async () => {
    if (!expanded) {
      setExpanded(true);
      setLoadingBets(true);
      try {
        const res = await fetch(`/api/agents/${agent.id}/bets`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setBets(await res.json());
      } catch {}
      setLoadingBets(false);
    } else {
      setExpanded(false);
    }
  };

  return (
    <Card variant="elevated" size="md" className={agent.status === "paused" ? "opacity-60" : ""}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              agent.status === "active" ? "bg-emerald-500/10" : "bg-[var(--color-bg-input)]"
            }`}>
              <Bot className={`w-6 h-6 ${agent.status === "active" ? "text-emerald-400" : "text-[var(--color-text-muted)]"}`} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--color-text-primary)]">{agent.name}</h3>
              <p className="text-xs text-[var(--color-text-muted)]">{agent.type}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={agent.status === "active" ? "success" : "outline"} size="sm" dot>
              {agent.status}
            </Badge>
            <button onClick={handleToggleStatus} className="p-1.5 rounded-lg hover:bg-[var(--color-bg-input)] transition-colors" title={agent.status === "active" ? "Pause" : "Resume"}>
              {agent.status === "active" ? <Pause className="w-4 h-4 text-[var(--color-text-muted)]" /> : <Play className="w-4 h-4 text-emerald-400" />}
            </button>
            <button onClick={handleDelete} disabled={deleting} className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors" title="Delete agent">
              <Trash2 className="w-4 h-4 text-red-400/60 hover:text-red-400" />
            </button>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] mb-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">Agent Wallet (Polygon)</p>
              <p className="font-mono text-xs text-[var(--color-text-primary)]">
                {agent.wallet_address?.slice(0, 10)}...{agent.wallet_address?.slice(-8)}
              </p>
            </div>
            <button onClick={handleCopy} className="p-2 rounded-lg hover:bg-[var(--color-bg-input)] transition-colors">
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-[var(--color-text-muted)]" />}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="p-2.5 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] text-center">
            <p className="text-[10px] text-[var(--color-text-muted)]">Invested</p>
            <p className="text-sm font-bold text-[var(--color-text-primary)]">${invested.toFixed(2)}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] text-center">
            <p className="text-[10px] text-[var(--color-text-muted)]">Profit</p>
            <p className={`text-sm font-bold ${profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {profit >= 0 ? "+" : ""}${profit.toFixed(2)}
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] text-center">
            <p className="text-[10px] text-[var(--color-text-muted)]">W / L</p>
            <p className="text-sm font-bold">
              <span className="text-emerald-400">{agent.win_count}</span>
              <span className="text-[var(--color-text-muted)]"> / </span>
              <span className="text-red-400">{agent.loss_count}</span>
            </p>
          </div>
        </div>

        {/* Card connection */}
        {agent.card_id ? (
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-400" />
                  <div>
                    <p className="text-xs font-semibold text-emerald-400">Card Connected</p>
                    <p className="text-[10px] text-[var(--color-text-muted)]">
                      {linkedCard?.card_name || linkedCard?.card_holder || `...${agent.card_id.slice(-4)}`}
                      {' · '}Auto-sweep enabled
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleLinkCard("")}
                  className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
                >
                  Unlink
                </button>
              </div>
            </div>
            <Button size="sm" onClick={handleSettle} disabled={settling || profit <= 0}
              className="bg-emerald-500 hover:bg-emerald-400 text-white text-xs shrink-0">
              <DollarSign className="w-3 h-3 mr-1" />
              {settling ? "..." : "Settle"}
            </Button>
          </div>
        ) : (
          <div className="mb-3">
            {!showCardPicker ? (
              <button
                onClick={() => setShowCardPicker(true)}
                className="w-full p-4 rounded-xl border-2 border-dashed border-[var(--color-primary)]/30 hover:border-[var(--color-primary)]/60 bg-[var(--color-primary)]/5 transition-all flex flex-col items-center gap-2"
              >
                <CreditCard className="w-6 h-6 text-[var(--color-primary)]" />
                <span className="text-sm font-semibold text-[var(--color-primary)]">Connect Card</span>
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  Link your Visa card to auto-receive profits from this agent
                </span>
              </button>
            ) : (
              <div className="p-3 rounded-xl border border-[var(--color-primary)]/20 bg-[var(--color-bg-primary)] space-y-2">
                <p className="text-xs font-semibold text-[var(--color-text-primary)]">Select a card to connect:</p>
                {userCards.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-muted)] py-2">No cards found. Create a card on My Card page first.</p>
                ) : (
                  userCards.map((card) => (
                    <button
                      key={card.id}
                      onClick={() => handleLinkCard(card.id)}
                      disabled={linking}
                      className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-[var(--color-border-primary)] hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all"
                    >
                      <CreditCard className="w-5 h-5 text-[var(--color-text-muted)]" />
                      <div className="flex-1 text-left">
                        <p className="text-xs font-medium text-[var(--color-text-primary)]">
                          {card.card_name || card.card_holder || "Card"}
                        </p>
                        <p className="text-[10px] text-[var(--color-text-muted)]">
                          ...{card.id.slice(-4)} · ${(card.balance || 0).toFixed(2)}
                        </p>
                      </div>
                      <span className="text-[10px] text-emerald-400">Connect →</span>
                    </button>
                  ))
                )}
                <button onClick={() => setShowCardPicker(false)} className="w-full text-xs text-[var(--color-text-muted)] py-1">Cancel</button>
              </div>
            )}
          </div>
        )}
        {settleMsg && <p className={`text-xs mb-2 ${settleMsg.includes("Settled") ? "text-emerald-400" : "text-red-400"}`}>{settleMsg}</p>}

        <button onClick={loadBets} className="w-full flex items-center justify-center gap-1 py-2 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {totalBets} bet{totalBets !== 1 ? "s" : ""} — {expanded ? "Hide" : "Show"} history
        </button>

        {expanded && (
          <div className="mt-2 space-y-1.5 max-h-[300px] overflow-y-auto">
            {loadingBets ? (
              <p className="text-xs text-[var(--color-text-muted)] text-center py-4">Loading bets...</p>
            ) : bets.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)] text-center py-4">No bets placed yet</p>
            ) : bets.map((bet) => (
              <div key={bet.id} className="flex items-center justify-between p-2 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)]">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-[var(--color-text-primary)] truncate">{bet.market_question || "Market"}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] font-bold ${bet.outcome === "Yes" ? "text-emerald-400" : "text-red-400"}`}>{bet.outcome}</span>
                    <span className="text-[10px] text-[var(--color-text-muted)]">${parseFloat(bet.amount).toFixed(2)}</span>
                    <Badge variant={bet.status === "won" ? "success" : bet.status === "lost" ? "destructive" : "outline"} size="sm">
                      {bet.status}
                    </Badge>
                  </div>
                </div>
                {bet.profit && (
                  <span className={`text-xs font-bold ${parseFloat(bet.profit) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {parseFloat(bet.profit) >= 0 ? "+" : ""}${parseFloat(bet.profit).toFixed(2)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AgentWalletPage() {
  const { data: session } = useAppSession();
  const token = (session as any)?.accessToken;
  const [agents, setAgents] = useState<Agent[]>([]);
  const [userCards, setUserCards] = useState<UserCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "paused">("all");

  const fetchAgents = useCallback(async () => {
    if (!token) return;
    try {
      const [agentsRes, cardsRes] = await Promise.all([
        fetch("/api/agents", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/cards", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (agentsRes.ok) setAgents(await agentsRes.json());
      if (cardsRes.ok) {
        const data = await cardsRes.json();
        const cards = Array.isArray(data) ? data : data.cards || [];
        setUserCards(cards.map((c: any) => ({
          id: c.id,
          card_name: c.cardName || c.card_name,
          card_holder: c.cardHolder || c.card_holder,
          balance: typeof c.balance === "number" ? c.balance : parseFloat(c.balance) || 0,
        })));
      }
    } catch {}
    setIsLoading(false);
  }, [token]);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  const totalProfit = agents.reduce((s, a) => s + parseFloat(a.total_profit || "0"), 0);
  const filteredAgents = filter === "all" ? agents : agents.filter(a => a.status === filter);

  return (
    <div className="space-y-8">
      <PageHeader
        leftSection={
          <PageTitle
            title="Agent Wallets"
            subtitle="Manage your AI agents, wallets, and trading performance"
          />
        }
        rightSection={
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-[var(--color-bg-input)] rounded-lg p-1">
              {(["all", "active", "paused"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${filter === f ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-text-muted)]"}`}>
                  {f === "all" ? `All (${agents.length})` : f === "active" ? `Active (${agents.filter(a=>a.status==="active").length})` : `Paused (${agents.filter(a=>a.status==="paused").length})`}
                </button>
              ))}
            </div>
            <div className="text-right">
              <p className="text-xs text-[var(--color-text-muted)]">Total P&L</p>
              <p className={`text-lg font-bold ${totalProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {totalProfit >= 0 ? "+" : ""}${totalProfit.toFixed(2)}
              </p>
            </div>
          </div>
        }
      />

      {isLoading ? (
        <div className="py-12 text-center text-[var(--color-text-muted)]">Loading agents...</div>
      ) : agents.length === 0 ? (
        <Card variant="elevated" size="md">
          <CardContent className="py-12 text-center">
            <Bot className="w-16 h-16 mx-auto mb-4 text-[var(--color-text-muted)] opacity-30" />
            <p className="text-lg font-semibold text-[var(--color-text-primary)]">No Agents Yet</p>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">Go to Yield Agents to deploy your first trading bot</p>
            <Button className="mt-4 bg-[var(--color-primary)] text-white" onClick={() => window.location.href = "/en/dashboard/yield-agents"}>
              Deploy Agent
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} token={token!} onRefresh={fetchAgents} userCards={userCards} />
          ))}
        </div>
      )}
    </div>
  );
}
