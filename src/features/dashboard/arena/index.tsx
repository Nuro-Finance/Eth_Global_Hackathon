"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppSession } from "@/hooks/useAppSession";
import {
  PageHeader,
  PageTitle,
  DraggableStatsGrid,
  type StatData,
} from "@/components";
import { Users, Bot, Plus, Wallet, TrendingUp, Award, ExternalLink, Github, Shield, Link2 } from "lucide-react";
import { PUBLIC_BOTS, type PublicBot } from "./config/botDirectory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

interface ArenaStats {
  totalAgents: number;
  activeAgents: number;
  activeUsers: number;
  totalInvested: number;
  totalProfit: number;
  totalWins: number;
  totalLosses: number;
  openBets: number;
  prizePool: string;
}

interface LeaderboardAgent {
  id: string;
  name: string;
  type: string;
  total_invested: string;
  total_profit: string;
  win_count: number;
  loss_count: number;
  status: string;
  user_name: string;
  total_bets: string;
  roi_percent: string;
  rank: string;
}

export function ArenaPage() {
  const { data: session } = useAppSession();
  const token = (session as any)?.accessToken;
  const [agents, setAgents] = useState<Agent[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardAgent[]>([]);
  const [arenaStats, setArenaStats] = useState<ArenaStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const fetchAll = useCallback(async () => {
    const results = await Promise.allSettled([
      // User's own agents
      token ? fetch("/api/agents", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : []) : Promise.resolve([]),
      // Global leaderboard (no auth needed)
      fetch("/api/arena/leaderboard").then(r => r.ok ? r.json() : []),
      // Arena stats (no auth needed)
      fetch("/api/arena/stats").then(r => r.ok ? r.json() : null),
    ]);
    if (results[0].status === "fulfilled") setAgents(Array.isArray(results[0].value) ? results[0].value : []);
    if (results[1].status === "fulfilled") setLeaderboard(Array.isArray(results[1].value) ? results[1].value : []);
    if (results[2].status === "fulfilled" && results[2].value) setArenaStats(results[2].value);
    setIsLoading(false);
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleCreate = async () => {
    if (!token || !newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newName.trim(),
          type: "polymarket",
          riskLimit: 100,
        }),
      });
      if (res.ok) {
        setNewName("");
        setShowCreate(false);
        fetchAll();
      }
    } catch {}
    setCreating(false);
  };

  const stats: StatData[] = [
    {
      id: "agents",
      title: "Competing Agents",
      value: String(arenaStats?.activeAgents || leaderboard.length),
      change: 0,
      isPositive: true,
      icon: <Bot className="w-5 h-5" />,
      showChange: false,
    },
    {
      id: "users",
      title: "Active Users",
      value: String(arenaStats?.activeUsers || 0),
      change: 0,
      isPositive: true,
      icon: <Users className="w-5 h-5" />,
      showChange: false,
    },
    {
      id: "profit",
      title: "Total Profit (All)",
      value: `$${(arenaStats?.totalProfit || 0).toFixed(2)}`,
      change: 0,
      isPositive: (arenaStats?.totalProfit || 0) >= 0,
      icon: <TrendingUp className="w-5 h-5" />,
      showChange: false,
    },
    {
      id: "prize",
      title: "Prize Pool",
      value: `$${arenaStats?.prizePool || "0.00"}`,
      change: 0,
      isPositive: true,
      icon: <Award className="w-5 h-5" />,
      showChange: false,
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        leftSection={
          <PageTitle
            title="Prize Pool"
            subtitle="Deploy AI agents to bet on Polymarket. Profits route to your card."
          />
        }
        rightSection={
          <Button
            onClick={() => setShowCreate(true)}
            className="bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 text-white"
          >
            <Plus className="w-4 h-4 mr-2" /> Deploy Agent
          </Button>
        }
      />

      {/* Create Agent Dialog */}
      {showCreate && (
        <Card variant="elevated" size="md" className="border-[var(--color-primary)]/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <input
                autoFocus
                type="text"
                placeholder="Agent name (e.g. Alpha Bot)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                className="flex-1 h-10 px-3 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)]"
              />
              <Button onClick={handleCreate} disabled={creating || !newName.trim()} className="bg-emerald-500 hover:bg-emerald-400 text-white">
                {creating ? "Creating..." : "Create"}
              </Button>
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <DraggableStatsGrid
        storageKey="arena-stats"
        isDraggable={true}
        gridClassName="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
        stats={stats}
      />

      {/* GLOBAL Leaderboard — all users */}
      {leaderboard.length > 0 && (
        <Card variant="elevated" size="md">
          <CardHeader>
            <CardTitle>Global Leaderboard</CardTitle>
            <p className="text-sm text-[var(--color-text-muted)]">
              Top agents across all users — ranked by profit
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            <Table rounded fullWidth>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Invested</TableHead>
                  <TableHead>Profit</TableHead>
                  <TableHead>ROI</TableHead>
                  <TableHead>W/L</TableHead>
                  <TableHead className="text-right">Bets</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaderboard.map((agent) => (
                  <TableRow key={agent.id}>
                    <TableCell className="font-bold text-[var(--color-primary)]">#{agent.rank}</TableCell>
                    <TableCell>
                      <span className="font-medium text-[var(--color-text-primary)]">{agent.name}</span>
                    </TableCell>
                    <TableCell className="text-[var(--color-text-muted)]">{agent.user_name}</TableCell>
                    <TableCell>${parseFloat(agent.total_invested).toFixed(2)}</TableCell>
                    <TableCell className={parseFloat(agent.total_profit) >= 0 ? "text-emerald-400" : "text-red-400"}>
                      {parseFloat(agent.total_profit) >= 0 ? "+" : ""}${parseFloat(agent.total_profit).toFixed(2)}
                    </TableCell>
                    <TableCell className={parseFloat(agent.roi_percent) >= 0 ? "text-emerald-400" : "text-red-400"}>
                      {agent.roi_percent}%
                    </TableCell>
                    <TableCell>
                      <span className="text-emerald-400">{agent.win_count}</span>
                      <span className="text-[var(--color-text-muted)]">/</span>
                      <span className="text-red-400">{agent.loss_count}</span>
                    </TableCell>
                    <TableCell className="text-right">{agent.total_bets}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Your Agents */}
      <Card variant="elevated" size="md">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Your Agents</CardTitle>
            <p className="text-sm text-[var(--color-text-muted)]">
              {agents.length} agent{agents.length !== 1 ? "s" : ""} deployed
              {agents.filter(a => a.status === "active").length > 0 && (
                <span> · <span className="text-emerald-400">{agents.filter(a => a.status === "active").length} active</span></span>
              )}
            </p>
          </div>
          <Badge variant="primary" size="sm">
            {agents.length > 0 ? "Live" : "No agents"}
          </Badge>
        </CardHeader>

        <CardContent className="pt-0">
          {isLoading ? (
            <div className="py-8 text-center text-[var(--color-text-muted)]">Loading agents...</div>
          ) : agents.length === 0 ? (
            <div className="py-8 text-center">
              <Bot className="w-12 h-12 mx-auto mb-3 text-[var(--color-text-muted)] opacity-40" />
              <p className="text-[var(--color-text-muted)]">No agents deployed yet</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">Click "Deploy Agent" to create your first AI trading agent</p>
            </div>
          ) : (
            <Table rounded fullWidth>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Wallet</TableHead>
                  <TableHead>Invested</TableHead>
                  <TableHead>Profit</TableHead>
                  <TableHead>W/L</TableHead>
                  <TableHead>Bets</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.map((agent, i) => (
                  <TableRow key={agent.id}>
                    <TableCell className="font-mono text-[var(--color-text-muted)]">{i + 1}</TableCell>
                    <TableCell>
                      <div>
                        <span className="font-medium text-[var(--color-text-primary)]">{agent.name}</span>
                        <div className="text-[10px] text-[var(--color-text-muted)]">{agent.type}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs text-[var(--color-text-muted)]">
                        {agent.wallet_address?.slice(0, 6)}...{agent.wallet_address?.slice(-4)}
                      </span>
                    </TableCell>
                    <TableCell>${parseFloat(agent.total_invested).toFixed(2)}</TableCell>
                    <TableCell className={parseFloat(agent.total_profit) >= 0 ? "text-emerald-400" : "text-red-400"}>
                      {parseFloat(agent.total_profit) >= 0 ? "+" : ""}${parseFloat(agent.total_profit).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <span className="text-emerald-400">{agent.win_count}</span>
                      <span className="text-[var(--color-text-muted)]">/</span>
                      <span className="text-red-400">{agent.loss_count}</span>
                    </TableCell>
                    <TableCell>{agent.total_bets || 0}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={agent.status === "active" ? "success" : "outline"} size="sm" dot>
                        {agent.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Bot Directory */}
      <Card variant="elevated" size="md">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Bot Directory</CardTitle>
            <p className="text-sm text-[var(--color-text-muted)]">
              Open-source Polymarket bots — deploy to your agent wallet
            </p>
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {PUBLIC_BOTS.map((bot) => (
            <div
              key={bot.id}
              className="flex items-start gap-3 p-3 rounded-xl border border-[var(--color-border-primary)] hover:border-[var(--color-primary)]/30 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-[var(--color-bg-input)] flex items-center justify-center shrink-0">
                <Github className="w-5 h-5 text-[var(--color-text-muted)]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--color-text-primary)]">{bot.name}</span>
                  {bot.verified && (
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  <span className="text-[10px] text-[var(--color-text-muted)]">⭐ {bot.stars}</span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5 line-clamp-2">{bot.description}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${
                    bot.risk === "low" ? "border-emerald-500/30 text-emerald-400" :
                    bot.risk === "medium" ? "border-yellow-500/30 text-yellow-400" :
                    "border-red-500/30 text-red-400"
                  }`}>{bot.risk} risk</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-[var(--color-border-primary)] text-[var(--color-text-muted)]">{bot.language}</span>
                  {bot.strategies.slice(0, 2).map((s) => (
                    <span key={s} className="text-[9px] px-1.5 py-0.5 rounded-full border border-[var(--color-border-primary)] text-[var(--color-text-muted)]">{s}</span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => window.open(bot.repo, "_blank")}
                className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 transition-colors border border-[var(--color-primary)]/20"
              >
                View
              </button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Private Bot Connector */}
      <Card variant="elevated" size="md" className="border-[var(--color-primary)]/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            Attach Private Bot
          </CardTitle>
          <p className="text-sm text-[var(--color-text-muted)]">
            Connect your own bot — earn 10% of all profits generated for other users who deploy it.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-xs text-[var(--color-text-muted)] mb-1 block">GitHub Repository URL</label>
            <input
              type="url"
              placeholder="https://github.com/username/my-polymarket-bot"
              className="w-full h-10 px-3 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--color-bg-input)] text-xs text-[var(--color-text-muted)]">
            <Shield className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            <div>
              <p className="font-medium text-[var(--color-text-primary)]">Revenue Sharing Model</p>
              <p className="mt-0.5">Bot creators earn 10% of net profits from every user who deploys their bot. Payouts are automatic via your linked card.</p>
            </div>
          </div>
          <Button
            className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary)]/80 text-white"
            onClick={() => alert("Private bot connector coming soon — we'll validate your repo and list it in the directory.")}
          >
            Submit Bot for Review
          </Button>
        </CardContent>
      </Card>

      {/* How it works */}
      <Card variant="elevated" size="md">
        <CardHeader>
          <CardTitle>How Agent Trading Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-[var(--color-text-muted)]">
          <ol className="list-inside list-decimal space-y-3">
            <li>
              <span className="font-medium text-[var(--color-text-primary)]">Deploy an agent</span><br />
              Create an AI agent with a unique wallet. Each agent gets its own Polygon wallet for Polymarket betting.
            </li>
            <li>
              <span className="font-medium text-[var(--color-text-primary)]">Fund and trade</span><br />
              Deposit USDC to your agent's wallet. The agent places bets on prediction markets based on your strategy.
            </li>
            <li>
              <span className="font-medium text-[var(--color-text-primary)]">Profits to your card</span><br />
              When bets resolve, profits are swept from the agent wallet through our CCTP bridge directly to your Nuro card.
            </li>
            <li>
              <span className="font-medium text-[var(--color-text-primary)]">Spend anywhere</span><br />
              Use your Visa card at any merchant worldwide. Prediction market profits become real-world spending power.
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

export default ArenaPage;
