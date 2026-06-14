"use client";

import { useState, useEffect } from "react";
import { useAppSession } from "@/hooks/useAppSession";
import { Shield, ArrowUpRight, ArrowDownLeft, Copy, Check, ExternalLink, Wallet, Lock, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, PageTitle, DraggableStatsGrid, type StatData } from "@/components";
import { copyToClipboard } from "@/lib/clipboard";

interface VaultBalance {
  chain: string;
  chainIcon: string;
  address: string;
  balance: number;
  token: string;
}

const VAULT_CHAINS = [
  { chain: "Base", icon: "🔵", token: "USDC" },
  { chain: "Ethereum", icon: "⟠", token: "USDC" },
  { chain: "Arbitrum", icon: "🔷", token: "USDC" },
  { chain: "Polygon", icon: "🟣", token: "USDC" },
  { chain: "Solana", icon: "🟢", token: "USDC" },
];

export default function VaultPage() {
  const { data: session } = useAppSession();
  const token = (session as any)?.accessToken;
  const [depositAddresses, setDepositAddresses] = useState<any>(null);
  const [copiedChain, setCopiedChain] = useState<string | null>(null);
  const [cardBalance, setCardBalance] = useState(0);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAddress, setWithdrawAddress] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch("/api/deposit-addresses", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(setDepositAddresses)
      .catch(() => {});
    fetch("/api/cards", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then((data: any) => {
        const cards = Array.isArray(data) ? data : data.cards || [];
        const total = cards.reduce((s: number, c: any) => s + (parseFloat(c.balance) || 0), 0);
        setCardBalance(total);
      })
      .catch(() => {});
  }, [token]);

  const handleCopy = (text: string, chain: string) => {
    copyToClipboard(text);
    setCopiedChain(chain);
    setTimeout(() => setCopiedChain(null), 2000);
  };

  const evmAddress = depositAddresses?.evm || "";
  const solanaAddress = depositAddresses?.solana || "";

  const stats: StatData[] = [
    { id: "card", title: "Card Balance", value: `$${cardBalance.toFixed(2)}`, change: 0, isPositive: true, icon: <Wallet className="w-5 h-5" />, showChange: false },
    { id: "vault", title: "Vault Status", value: "Secure", change: 0, isPositive: true, icon: <Shield className="w-5 h-5" />, showChange: false },
    { id: "chains", title: "Deposit Chains", value: "23", change: 0, isPositive: true, icon: <TrendingUp className="w-5 h-5" />, showChange: false },
    { id: "security", title: "Encryption", value: "AES-256", change: 0, isPositive: true, icon: <Lock className="w-5 h-5" />, showChange: false },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        leftSection={
          <PageTitle
            title="Bank Vault"
            subtitle="Your secure crypto wallet. Deposit, store, and off-ramp to hardware wallet."
          />
        }
      />

      <DraggableStatsGrid storageKey="vault-stats" isDraggable={true}
        gridClassName="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" stats={stats} />

      {/* Deposit Addresses */}
      <Card variant="elevated" size="md">
        <CardContent className="p-5">
          <h3 className="text-base font-bold text-[var(--color-text-primary)] mb-1">Deposit Addresses</h3>
          <p className="text-xs text-[var(--color-text-muted)] mb-4">Send crypto to these addresses to fund your vault. All deposits auto-bridge to your account.</p>

          <div className="space-y-3">
            {/* EVM Address */}
            {evmAddress && (
              <div className="p-4 rounded-xl bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)]">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--color-text-primary)]">EVM Chains</span>
                    <div className="flex gap-0.5">
                      {["🔵", "⟠", "🔷", "🟣", "🔴", "🔺", "🟡"].map((icon, i) => (
                        <span key={i} className="text-[10px]">{icon}</span>
                      ))}
                      <span className="text-[9px] text-[var(--color-text-muted)]">+16</span>
                    </div>
                  </div>
                  <Badge variant="success" size="sm">Active</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono text-[var(--color-text-primary)] bg-[var(--color-bg-input)] p-2.5 rounded-lg truncate">
                    {evmAddress}
                  </code>
                  <button onClick={() => handleCopy(evmAddress, "evm")}
                    className="p-2 rounded-lg hover:bg-[var(--color-bg-input)] transition-colors shrink-0">
                    {copiedChain === "evm" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-[var(--color-text-muted)]" />}
                  </button>
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-2">
                  Send USDC, USDT, or DAI on Ethereum, Arbitrum, Base, Polygon, Optimism, Avalanche, or any of 20 EVM chains
                </p>
              </div>
            )}

            {/* Solana Address */}
            {solanaAddress && (
              <div className="p-4 rounded-xl bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)]">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--color-text-primary)]">Solana</span>
                    <span className="text-[10px]">🟢</span>
                  </div>
                  <Badge variant="success" size="sm">Active</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono text-[var(--color-text-primary)] bg-[var(--color-bg-input)] p-2.5 rounded-lg truncate">
                    {solanaAddress}
                  </code>
                  <button onClick={() => handleCopy(solanaAddress, "solana")}
                    className="p-2 rounded-lg hover:bg-[var(--color-bg-input)] transition-colors shrink-0">
                    {copiedChain === "solana" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-[var(--color-text-muted)]" />}
                  </button>
                </div>
                <p className="text-[10px] text-[var(--color-text-muted)] mt-2">
                  Send USDC (SPL) on Solana - bridges via CCTP to Base
                </p>
              </div>
            )}

            {!evmAddress && !solanaAddress && (
              <div className="text-center py-8 text-[var(--color-text-muted)]">
                <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Complete KYC to activate your vault addresses</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card variant="elevated" size="md" className="cursor-pointer hover:border-emerald-500/20 transition-colors"
          onClick={() => window.location.href = "/en/dashboard/my-card-1"}>
          <CardContent className="p-5 text-center">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
              <ArrowUpRight className="w-6 h-6 text-emerald-400" />
            </div>
            <h4 className="text-sm font-bold text-[var(--color-text-primary)]">Cash Out to Card</h4>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1">Send vault funds to your Visa card for instant spending</p>
          </CardContent>
        </Card>

        <Card variant="elevated" size="md" className="cursor-pointer hover:border-blue-500/20 transition-colors"
          onClick={() => setShowWithdraw(true)}>
          <CardContent className="p-5 text-center">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mx-auto mb-3">
              <ExternalLink className="w-6 h-6 text-blue-400" />
            </div>
            <h4 className="text-sm font-bold text-[var(--color-text-primary)]">Withdraw to Wallet</h4>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1">Send to hardware wallet, MetaMask, or any external address</p>
          </CardContent>
        </Card>

        <Card variant="elevated" size="md" className="cursor-pointer hover:border-purple-500/20 transition-colors"
          onClick={() => window.location.href = "/en/dashboard/markets"}>
          <CardContent className="p-5 text-center">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center mx-auto mb-3">
              <TrendingUp className="w-6 h-6 text-purple-400" />
            </div>
            <h4 className="text-sm font-bold text-[var(--color-text-primary)]">Invest in Markets</h4>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1">Use vault funds to bet on prediction markets</p>
          </CardContent>
        </Card>
      </div>

      {/* Withdraw Modal */}
      {showWithdraw && (
        <Card variant="elevated" size="md" className="border-blue-500/20">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Withdraw to External Wallet</h3>
              <button onClick={() => setShowWithdraw(false)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">✕</button>
            </div>
            <div>
              <label className="text-xs text-[var(--color-text-muted)]">Destination Address</label>
              <input type="text" value={withdrawAddress} onChange={e => setWithdrawAddress(e.target.value)}
                placeholder="0x... or Solana address"
                className="w-full h-10 px-3 mt-1 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)]" />
            </div>
            <div>
              <label className="text-xs text-[var(--color-text-muted)]">Amount (USDC)</label>
              <input type="number" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)}
                placeholder="0.00"
                className="w-full h-10 px-3 mt-1 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)]" />
            </div>
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-xs text-[var(--color-text-muted)]">
              <p className="font-semibold text-yellow-400">Security Notice</p>
              <p className="mt-0.5">Double-check the destination address. Crypto transactions cannot be reversed. Withdrawal fee: 1%</p>
            </div>
            <Button className="w-full bg-blue-500 hover:bg-blue-400 text-white" disabled={!withdrawAddress || !withdrawAmount}
              onClick={() => alert(`Withdrawal of $${withdrawAmount} USDC to ${withdrawAddress.slice(0,10)}... - feature completing in next sprint`)}>
              Withdraw USDC
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Security Info */}
      <Card variant="default" size="sm" className="border-[var(--color-border-primary)]">
        <CardContent className="p-4 flex items-start gap-3">
          <Lock className="w-5 h-5 text-[var(--color-text-muted)] shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">Vault Security</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Your vault addresses are HD-derived from your account. Private keys are never stored.
              All deposits are automatically detected and credited to your account within 60 seconds.
              Off-ramp to hardware wallets (Ledger, Trezor) via the Withdraw function.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
