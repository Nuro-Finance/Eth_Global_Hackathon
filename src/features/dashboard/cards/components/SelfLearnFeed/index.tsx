"use client";

/**
 * SelfLearnFeed — "What Mythos remembers about you" surface.
 *
 * Mounted as the "Brain" tab in CardsGrid. Reads /api/users/me/signals and
 * renders a chronological activity feed. Each row is a signal that the
 * .self_learn neural net captured (card events, chat turns, KYC milestones,
 * persona swaps, reloads, etc.). Spec: Self-Learn Financial Neural Net Spec.
 *
 * MVP scope (Phase 1):
 *   - Read-only feed, newest first
 *   - Compact human-readable line per row
 *   - Filter chips (All / Cards / Chats / Money)
 *   - "Generate report" CTA stub (wired to spec Q2 cadence in Phase 2)
 *
 * Future (Phase 2 per spec Q2):
 *   - On-demand learning / risk / opportunity report generation
 *   - Auto-prompt "want a report?" on card-creation events
 *   - Report history surfaced inline
 */

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Brain, Sparkles, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type Signal = {
  id: number;
  signal_type: string;
  summary: {
    card_id: string | null;
    card_name: string | null;
    card_type: string | null;
    amount_usd: number | null;
    merchant: string | null;
    snippet: string | null;
  };
  source: string;
  created_at: string;
};

type FilterKey = "all" | "cards" | "chats" | "money";

const FILTER_TYPES: Record<FilterKey, (signalType: string) => boolean> = {
  all:   () => true,
  cards: (t) => t.startsWith("card.") && t !== "card.chat_message",
  chats: (t) => t === "card.chat_message" || t === "card.memory_reset",
  money: (t) => t.startsWith("transaction.") || t.startsWith("balance.") || t === "reload.completed" || t === "withdraw.completed",
};

function humanizeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  const hr = Math.floor(diff / 3_600_000);
  const day = Math.floor(diff / 86_400_000);
  if (min < 2) return "just now";
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

function labelFor(s: Signal): { text: string; tone: string } {
  const p = s.summary;
  switch (s.signal_type) {
    case "card.created":
      return { text: `Card created: ${p.card_name || p.card_type || "unnamed"}`, tone: "emerald" };
    case "card.frozen":
      return { text: `Froze ${p.card_name || "a card"}`, tone: "blue" };
    case "card.unfrozen":
      return { text: `Unfroze ${p.card_name || "a card"}`, tone: "blue" };
    case "card.limit_changed":
      return { text: `Changed limit on ${p.card_name || "a card"}`, tone: "amber" };
    case "card.persona_changed":
      return { text: `Swapped agent persona on ${p.card_name || "a card"}`, tone: "purple" };
    case "card.chat_message": {
      const snip = (p.snippet || "").slice(0, 70).replace(/\s+/g, " ").trim();
      return { text: `Chat with ${p.card_name || "a card"}${snip ? `: "${snip}${snip.length >= 70 ? "..." : ""}"` : ""}`, tone: "blue" };
    }
    case "card.memory_reset":
      return { text: `Reset memory on ${p.card_name || "a card"}`, tone: "rose" };
    case "transaction.posted":
      return { text: `Transaction: $${p.amount_usd ?? "?"} at ${p.merchant || "unknown"}`, tone: "amber" };
    case "balance.shift_50pct":
      return { text: `Balance shifted significantly`, tone: "amber" };
    case "kyc.started":
      return { text: `Started identity verification`, tone: "purple" };
    case "kyc.completed":
      return { text: `Identity verified`, tone: "emerald" };
    case "reload.completed":
      return { text: `Reloaded ${p.card_name || "a card"} with $${p.amount_usd ?? "?"}`, tone: "emerald" };
    case "withdraw.completed":
      return { text: `Withdrew $${p.amount_usd ?? "?"} from ${p.card_name || "a card"}`, tone: "amber" };
    case "wallet.connected":
      return { text: `Connected an external wallet`, tone: "blue" };
    case "plan.upgraded":
      return { text: `Upgraded plan`, tone: "emerald" };
    case "plan.downgraded":
      return { text: `Downgraded plan`, tone: "amber" };
    default:
      return { text: s.signal_type, tone: "zinc" };
  }
}

const TONE_CLASSES: Record<string, string> = {
  emerald: "bg-emerald-900/40 text-emerald-200 border-emerald-700/40",
  blue:    "bg-blue-900/40 text-blue-200 border-blue-700/40",
  amber:   "bg-amber-900/40 text-amber-200 border-amber-700/40",
  purple:  "bg-purple-900/40 text-purple-200 border-purple-700/40",
  rose:    "bg-rose-900/40 text-rose-200 border-rose-700/40",
  zinc:    "bg-zinc-800/60 text-zinc-300 border-zinc-700/40",
};

export default function SelfLearnFeed() {
  const { data: session } = useSession();
  const token = (session as { accessToken?: string } | null)?.accessToken ?? null;

  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!token) return;
    setRefreshing(true);
    try {
      const res = await fetch("/api/users/me/signals?limit=100", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const j = await res.json();
        setSignals(Array.isArray(j?.signals) ? j.signals : []);
      }
    } catch (err) {
      console.warn("[SelfLearnFeed] load failed:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const filtered = useMemo(
    () => signals.filter((s) => FILTER_TYPES[filter](s.signal_type)),
    [signals, filter],
  );

  return (
    <div className="w-full">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="size-9 rounded-lg bg-blue-900/40 border border-blue-700/40 flex items-center justify-center">
            <Brain className="size-4 text-blue-200" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">What Mythos remembers about you</h3>
            <p className="text-xs text-zinc-400">
              Your <code className="px-1 py-0.5 bg-zinc-800 rounded text-[10px]">.self_learn</code> activity feed. The agent draws on this when answering.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={refreshing}
          className="size-8 inline-flex items-center justify-center rounded-md bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors disabled:opacity-40"
          aria-label="Refresh"
          title="Refresh"
        >
          <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {(Object.keys(FILTER_TYPES) as FilterKey[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={cn(
              "px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors",
              filter === k
                ? "bg-blue-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700",
            )}
          >
            {k}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-zinc-600 self-center">
          {filtered.length} of {signals.length} events
        </span>
      </div>

      {loading && signals.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-zinc-500 py-6 justify-center">
          <Loader2 className="size-4 animate-spin" />
          Loading your activity...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-zinc-500 text-sm">
          {filter === "all"
            ? "No activity yet. Create a card, send a chat message, or complete identity verification — the timeline starts then."
            : `No ${filter} events yet.`}
        </div>
      ) : (
        <ol className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1 chat-scroll">
          {filtered.map((s) => {
            const { text, tone } = labelFor(s);
            return (
              <li
                key={s.id}
                className={cn(
                  "flex items-center justify-between gap-3 px-3 py-2 rounded-md border",
                  TONE_CLASSES[tone] || TONE_CLASSES.zinc,
                )}
              >
                <span className="flex-1 min-w-0 text-sm truncate">{text}</span>
                <span className="text-[10px] text-zinc-400 shrink-0">{humanizeAgo(s.created_at)}</span>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-4 p-3 rounded-md bg-zinc-900/60 border border-zinc-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="size-4 text-amber-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-xs text-white font-medium">Generate a report</div>
            <div className="text-[10px] text-zinc-500 truncate">
              Learning / risk / opportunity reports drawn from your activity. Coming in Phase 2.
            </div>
          </div>
        </div>
        <button
          type="button"
          disabled
          className="px-3 py-1.5 rounded-md bg-zinc-800 text-zinc-500 text-xs font-medium cursor-not-allowed"
          title="Phase 2"
        >
          Soon
        </button>
      </div>
    </div>
  );
}
