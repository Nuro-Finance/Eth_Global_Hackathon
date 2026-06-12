"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface BetModalProps {
  open: boolean;
  onClose: () => void;
  marketName: string;
  marketId: string;
  yesPct: number;
  noPct: number;
  image?: string;
}

export default function BetModal({
  open,
  onClose,
  marketName,
  marketId,
  yesPct,
  noPct,
  image,
}: BetModalProps) {
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;

  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("");
  const [placing, setPlacing] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const price = side === "yes" ? yesPct : noPct;
  const potential = amount ? (parseFloat(amount) / (price / 100)).toFixed(2) : "0.00";

  const handleTrade = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setResult({ ok: false, msg: "Enter an amount" });
      return;
    }
    if (!token) {
      setResult({ ok: false, msg: "Please log in to place bets" });
      return;
    }
    setPlacing(true);
    setResult(null);
    try {
      // First get user's agents
      const agentsRes = await fetch("/api/agents", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const agents = await agentsRes.json();
      if (!Array.isArray(agents) || !agents.length) {
        setResult({ ok: false, msg: "No agent deployed. Go to Arena → Deploy Agent first." });
        setPlacing(false);
        return;
      }
      const agent = agents[0]; // Use first active agent

      const res = await fetch(`/api/agents/${agent.id}/bets`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          marketId,
          marketQuestion: marketName,
          outcome: side === "yes" ? "Yes" : "No",
          amount: parseFloat(amount),
          entryPrice: price / 100,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.tradeExecuted) {
          setResult({ ok: true, msg: `Trade executed! ${side.toUpperCase()} @ ${price}¢ for $${amount}. Order ID: ${data.orderId?.slice(0,8) || 'pending'}` });
        } else {
          setResult({ ok: false, msg: data.fallback || `Order queued but not executed. Fund agent wallet with USDC on Polygon.` });
        }
        setAmount("");
      } else {
        setResult({ ok: false, msg: data.error || "Trade failed" });
      }
    } catch (e: any) {
      setResult({ ok: false, msg: e.message || "Network error" });
    }
    setPlacing(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="w-[340px] rounded-2xl bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b border-[var(--color-border-primary)]">
              {image && (
                <img src={image} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{marketName}</p>
              </div>
              <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Buy / Sell tabs */}
            <div className="flex border-b border-[var(--color-border-primary)]">
              <button
                onClick={() => setTab("buy")}
                className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === "buy" ? "text-[var(--color-text-primary)] border-b-2 border-[var(--color-success)]" : "text-[var(--color-text-muted)]"}`}
              >
                Buy
              </button>
              <button
                onClick={() => setTab("sell")}
                className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === "sell" ? "text-[var(--color-text-primary)] border-b-2 border-[var(--color-error)]" : "text-[var(--color-text-muted)]"}`}
              >
                Sell
              </button>
              <div className="flex items-center px-3">
                <span className="text-[11px] text-[var(--color-text-muted)]">Market</span>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Up / Down buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setSide("yes")}
                  className={`py-3 rounded-lg text-sm font-bold transition-all ${
                    side === "yes"
                      ? "bg-[var(--color-success)] text-white shadow-lg shadow-[rgba(0,192,139,0.25)]"
                      : "bg-[var(--color-bg-input)] text-[var(--color-text-muted)] border border-[var(--color-border-primary)]"
                  }`}
                >
                  Up {yesPct}¢
                </button>
                <button
                  onClick={() => setSide("no")}
                  className={`py-3 rounded-lg text-sm font-bold transition-all ${
                    side === "no"
                      ? "bg-[var(--color-error)] text-white shadow-lg shadow-[rgba(222,85,85,0.25)]"
                      : "bg-[var(--color-bg-input)] text-[var(--color-text-muted)] border border-[var(--color-border-primary)]"
                  }`}
                >
                  Down {noPct}¢
                </button>
              </div>

              {/* Amount */}
              <div>
                <label className="text-xs text-[var(--color-text-muted)] mb-1 block">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-2xl text-[var(--color-text-muted)]">$</span>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    className="w-full h-14 pl-8 pr-4 text-3xl font-bold bg-transparent text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]/30 focus:outline-none"
                  />
                </div>
                <div className="flex gap-1.5 mt-2">
                  {[1, 5, 10, 100].map((v) => (
                    <button
                      key={v}
                      onClick={() => setAmount(String((parseFloat(amount) || 0) + v))}
                      className="flex-1 py-1.5 rounded-md text-xs font-semibold bg-[var(--color-bg-input)] text-[var(--color-text-muted)] border border-[var(--color-border-primary)] hover:bg-[var(--color-bg-input-hover)] transition-colors"
                    >
                      +${v}
                    </button>
                  ))}
                  <button
                    onClick={() => setAmount("100")}
                    className="flex-1 py-1.5 rounded-md text-xs font-semibold bg-[var(--color-bg-input)] text-[var(--color-text-muted)] border border-[var(--color-border-primary)] hover:bg-[var(--color-bg-input-hover)] transition-colors"
                  >
                    Max
                  </button>
                </div>
              </div>

              {/* Potential return */}
              {amount && parseFloat(amount) > 0 && (
                <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] px-1">
                  <span>Potential return</span>
                  <span className="text-[var(--color-success)] font-semibold">${potential}</span>
                </div>
              )}

              {/* Result message */}
              {result && (
                <div className={`text-xs p-2 rounded-lg ${result.ok ? "bg-[rgba(0,192,139,0.1)] text-[var(--color-success)]" : "bg-[rgba(222,85,85,0.1)] text-[var(--color-error)]"}`}>
                  {result.msg}
                </div>
              )}

              {/* Trade button */}
              <button
                onClick={handleTrade}
                disabled={placing || !amount || parseFloat(amount) <= 0}
                className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40 ${
                  side === "yes"
                    ? "bg-[var(--color-success)] hover:bg-[var(--color-success)]/90 text-white"
                    : "bg-[var(--color-error)] hover:bg-[var(--color-error)]/90 text-white"
                }`}
              >
                {placing ? "Placing trade..." : `${tab === "buy" ? "Buy" : "Sell"} ${side === "yes" ? "Yes" : "No"}`}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
