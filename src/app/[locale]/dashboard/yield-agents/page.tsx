"use client";

import { useState, useEffect } from "react";
import { useAppSession } from "@/hooks/useAppSession";
import { Bot, Shield, Github, Star, TrendingUp, AlertTriangle, Plus, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, PageTitle } from "@/components";
import { PUBLIC_BOTS, type PublicBot } from "@/features/dashboard/arena/config/botDirectory";

function RiskBadge({ risk }: { risk: PublicBot["risk"] }) {
  const cls = risk === "low" ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
    : risk === "medium" ? "border-yellow-500/30 text-yellow-400 bg-yellow-500/10"
    : "border-red-500/30 text-red-400 bg-red-500/10";
  return <span className={`text-[10px] px-2 py-0.5 rounded-full border ${cls}`}>{risk} risk</span>;
}

export default function YieldAgentsPage() {
  const { data: session } = useAppSession();
  const token = (session as any)?.accessToken;
  const [deploying, setDeploying] = useState<string | null>(null);
  const [deployed, setDeployed] = useState<Set<string>>(new Set());
  const [deployResult, setDeployResult] = useState<any>(null);
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestUrl, setSuggestUrl] = useState("");
  const [suggestSubmitted, setSuggestSubmitted] = useState(false);
  const [userAgents, setUserAgents] = useState<any[]>([]);

  // Load user's existing agents to check which bots are already deployed
  useEffect(() => {
    if (!token) return;
    fetch("/api/agents", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then((agents: any[]) => {
        setUserAgents(agents);
        const deployedBotIds = new Set<string>();
        agents.forEach(a => {
          const botId = a.strategy?.botId;
          if (botId) deployedBotIds.add(botId);
          // Also match by name for agents created without botId
          PUBLIC_BOTS.forEach(b => { if (b.name === a.name) deployedBotIds.add(b.id); });
        });
        setDeployed(deployedBotIds);
      })
      .catch(() => {});
  }, [token]);

  const handleDeploy = async (bot: PublicBot) => {
    if (!token) return;
    setDeploying(bot.id);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: bot.name,
          type: "polymarket",
          riskLimit: bot.risk === "low" ? 50 : bot.risk === "medium" ? 100 : 200,
          strategy: {
            botId: bot.id,
            repo: bot.repo,
            strategies: bot.strategies,
            risk: bot.risk,
          },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setDeployed((prev) => new Set(prev).add(bot.id));
        setDeployResult(data);
      }
    } catch {}
    setDeploying(null);
  };

  return (
    <div className="space-y-8">
      <PageHeader
        leftSection={
          <PageTitle
            title="Yield Agents"
            subtitle="Test and deploy AI trading bots. See real performance before committing capital."
          />
        }
        rightSection={
          <Button
            variant="outline"
            onClick={() => setShowSuggest(true)}
            className="border-[var(--color-primary)]/30 text-[var(--color-primary)]"
          >
            <Plus className="w-4 h-4 mr-2" /> Suggest Bot
          </Button>
        }
      />

      {/* Safety Notice */}
      <Card variant="default" size="sm" className="border-yellow-500/20 bg-yellow-500/5">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">Bot Safety</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              All bots run in isolated wallets — your main card balance is never at risk.
              Start with the verified Alpha Bot or test with small amounts.
              Community-rated bots with ⭐ have been reviewed by other users.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Deploy Success */}
      {deployResult && (
        <Card variant="elevated" size="md" className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-lg font-bold text-emerald-400">Agent Deployed!</p>
                <p className="text-sm text-[var(--color-text-primary)] mt-1">{deployResult.name}</p>
              </div>
              <button onClick={() => setDeployResult(null)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">✕</button>
            </div>
            <div className="mt-3 p-3 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--color-text-muted)]">Agent Wallet</span>
                <span className="font-mono text-[var(--color-text-primary)]">{deployResult.fundingAddress}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--color-text-muted)]">Chain</span>
                <span className="text-[var(--color-text-primary)]">{deployResult.fundingChain || "Polygon"}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--color-text-muted)]">Card Linked</span>
                <span className={deployResult.linkedCard ? "text-emerald-400" : "text-red-400"}>
                  {deployResult.linkedCard ? "✓ Yes" : "✗ No card — complete KYC first"}
                </span>
              </div>
            </div>
            <div className="mt-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <p className="text-sm font-semibold text-yellow-400">⚡ Fund to Activate</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                Send <span className="font-bold text-[var(--color-text-primary)]">${deployResult.recommendedFunding}+</span> USDC
                to the wallet above on <span className="font-bold">{deployResult.fundingChain || "Polygon"}</span>.
                The bot will start trading automatically once funded.
                {!deployResult.linkedCard && " You must also complete KYC and link a card to receive profits."}
              </p>
            </div>
            <p className="text-[10px] text-[var(--color-text-muted)] mt-2">{deployResult.message}</p>
          </CardContent>
        </Card>
      )}

      {/* Suggest Bot Form */}
      {showSuggest && (
        <Card variant="elevated" size="md" className="border-[var(--color-primary)]/20">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">Suggest a New Bot</p>
            <input
              type="url"
              value={suggestUrl}
              onChange={(e) => setSuggestUrl(e.target.value)}
              placeholder="https://github.com/username/polymarket-bot"
              className="w-full h-10 px-3 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)]"
            />
            <div className="flex gap-2">
              <Button
                onClick={async () => {
                  if (!token || !suggestUrl.includes("github.com")) return;
                  setSuggestSubmitted(true);
                  try {
                    const res = await fetch("/api/bots/submit", {
                      method: "POST",
                      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                      body: JSON.stringify({ repoUrl: suggestUrl }),
                    });
                    const data = await res.json();
                    if (!res.ok) alert(data.error || "Submission failed");
                  } catch {}
                  setTimeout(() => { setShowSuggest(false); setSuggestSubmitted(false); setSuggestUrl(""); }, 2000);
                }}
                disabled={!suggestUrl.includes("github.com") || suggestSubmitted}
                className="bg-[var(--color-primary)] text-white"
              >
                <Send className="w-4 h-4 mr-2" />
                {suggestSubmitted ? "Submitted!" : "Submit for Review"}
              </Button>
              <Button variant="ghost" onClick={() => setShowSuggest(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Your Deployed Agents */}
      {userAgents.length > 0 && (
        <Card variant="elevated" size="md">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">
              Your Deployed Agents ({userAgents.length})
            </p>
            <div className="space-y-2">
              {userAgents.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)]">
                  <div className="flex items-center gap-3">
                    <Bot className="w-4 h-4 text-emerald-400" />
                    <div>
                      <p className="text-xs font-medium text-[var(--color-text-primary)]">{a.name}</p>
                      <p className="text-[10px] text-[var(--color-text-muted)] font-mono">{a.wallet_address?.slice(0,8)}...{a.wallet_address?.slice(-6)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={a.status === "active" ? "success" : "outline"} size="sm">{a.status}</Badge>
                    <Button size="sm" variant="ghost" className="text-xs" onClick={() => window.location.href = "/en/dashboard/agent-wallet"}>
                      Manage →
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs text-red-400 hover:text-red-300" onClick={async () => {
                      if (!confirm(`Delete "${a.name}"? This cannot be undone.`)) return;
                      await fetch(`/api/agents/${a.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
                      setUserAgents(prev => prev.filter((x: any) => x.id !== a.id));
                      setDeployed(prev => { const s = new Set(prev); const botId = a.strategy?.botId; if (botId) s.delete(botId); return s; });
                    }}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bot Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Alpha Bot — Featured */}
        <Card variant="elevated" size="md" className="border-emerald-500/20 md:col-span-2">
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                <Bot className="w-7 h-7 text-emerald-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-bold text-[var(--color-text-primary)]">Alpha Bot</h3>
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <Badge variant="success" size="sm">Default</Badge>
                </div>
                <p className="text-sm text-[var(--color-text-muted)]">
                  Our built-in passive trading bot. Automatically bets on high-confidence prediction markets
                  across politics, crypto, and sports. Every new user starts with Alpha Bot.
                </p>
                <div className="flex items-center gap-3 mt-3 flex-wrap">
                  <RiskBadge risk="low" />
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--color-border-primary)] text-[var(--color-text-muted)]">Passive</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--color-border-primary)] text-[var(--color-text-muted)]">Auto-allocated on signup</span>
                  <span className="text-[10px] text-emerald-400">✓ Verified by Nuro</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-[var(--color-text-muted)]">Users</p>
                <p className="text-lg font-bold text-[var(--color-text-primary)]">All</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Public Bots */}
        {PUBLIC_BOTS.map((bot) => (
          <Card key={bot.id} variant="elevated" size="md" className="hover:border-[var(--color-primary)]/20 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-[var(--color-bg-input)] flex items-center justify-center shrink-0">
                  <Github className="w-5 h-5 text-[var(--color-text-muted)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{bot.name}</span>
                    {bot.verified && <Shield className="w-3 h-3 text-emerald-400 shrink-0" />}
                  </div>
                  <p className="text-[11px] text-[var(--color-text-muted)] line-clamp-2 mb-2">{bot.description}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <RiskBadge risk={bot.risk} />
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-[var(--color-border-primary)] text-[var(--color-text-muted)]">{bot.language}</span>
                    <span className="text-[9px] text-[var(--color-text-muted)]">⭐ {bot.stars}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Button
                  size="sm"
                  className="flex-1 bg-[var(--color-primary)] text-white text-xs"
                  onClick={() => handleDeploy(bot)}
                  disabled={deploying === bot.id || deployed.has(bot.id)}
                >
                  {deployed.has(bot.id) ? "✓ Deployed" : deploying === bot.id ? "Deploying..." : "Deploy Agent"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => window.open(bot.repo, "_blank")}
                >
                  <Github className="w-3 h-3 mr-1" /> Code
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
