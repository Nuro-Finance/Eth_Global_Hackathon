"use client";

/**
 * CardAgentChat — the Nuro Finance Financial text box.
 *
 * Per-card conversational agent. The card IS the agent; this component is
 * its voice. Spec: AFI/Neural Net/Claude Memory/Per-Card Agent System Spec.md
 * ( ratified all 5 Qs on 2026-05-25 via Inbox ticket #15).
 *
 * Layout per spec Q1: single-line text input always visible. Agent response
 * panel expands on send. Click gesture, not hover. Memory persistent by
 * default (Q3). Browser SpeechRecognition mic button so the user can speak
 * to the card without leaving the page.
 *
 * Three personas (Q5 Council): Formal Banker / Friendly Concierge / Terse CFO.
 * Default chosen by card_type heuristic on creation; user picks per-card.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useSession } from "next-auth/react";
import { Mic, Send, Loader2, X, MoreVertical, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { buildCardChatRequestBody } from "@/lib/chatByok";

type ChatMessage = {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
 /** M12 trust-signal: tool names this assistant turn invoked. */
  toolsFired?: string[];
};

/**
 * Mirrors getToolFriendlyLabel in src/lib/agent-tools.ts. Inlined because
 * that file pulls backend-only imports. Keep in sync when new tools land.
 */
const TOOL_LABELS: Record<string, string> = {
  freeze_card: "Froze the card",
  unfreeze_card: "Unfroze the card",
  get_balance: "Checked balance",
  get_recent_transactions: "Pulled recent transactions",
  get_card_details: "Read card details",
  rename_card: "Renamed the card",
  change_card_color: "Changed card color",
  get_spending_today: "Checked today’s spending",
  get_daily_limit: "Checked daily limit",
  get_remaining_today: "Checked remaining today",
  request_withdrawal: "Requested withdrawal",
  request_limit_increase: "Requested limit increase",
  transfer_card_to_vault: "Moved card balance to Savings",
  transfer_vault_to_card: "Reloaded card from Savings",
  transfer_to_user: "Sent to user",
  report_lost_or_stolen: "Reported lost/stolen",
};

type PersonaKey = "banker" | "concierge" | "cfo";

type PersonaInfo = {
  persona: PersonaKey;
  label: string;
  tagline: string;
  firstHint: string;
  memoryEnabled: boolean;
  availablePersonas: Array<{ key: PersonaKey; label: string; tagline: string }>;
};

interface CardAgentChatProps {
  cardId: string;
 /** Display name shown in the header. Falls back to "Card" if empty. */
  cardName?: string;
 /** Optional compact mode: smaller padding for inline placement. */
  compact?: boolean;
}

const FIRST_HINT_STORAGE_KEY = (cardId: string) => `nuro:cardchat:onboarded:${cardId}:v1`;

export default function CardAgentChat({ cardId, cardName, compact = false }: CardAgentChatProps) {
  const { data: session } = useSession();
  const accessToken = (session as { accessToken?: string } | null)?.accessToken ?? null;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [persona, setPersona] = useState<PersonaInfo | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const transcriptBaseRef = useRef("");
  const recognitionRef = useRef<unknown | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

 // ─── Initial load: history + persona ──────────────────────────────────────
  useEffect(() => {
    if (!cardId || !accessToken) return;
    let cancelled = false;

    const loadAll = async () => {
      setLoadingHistory(true);
      try {
        const [historyRes, personaRes] = await Promise.all([
          fetch(`/api/cards/${cardId}/messages?limit=50`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
          fetch(`/api/cards/${cardId}/persona`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
        ]);

        if (!cancelled) {
          if (historyRes.ok) {
            const j = await historyRes.json();
            const msgs: ChatMessage[] = Array.isArray(j?.messages) ? j.messages : [];
            setMessages(msgs);
 // Show the first-visit hint only when there's NO history AND we
 // haven't dismissed it before (per spec Q2).
            if (msgs.length === 0 && typeof window !== "undefined") {
              const onboarded = window.localStorage.getItem(FIRST_HINT_STORAGE_KEY(cardId));
              setShowHint(!onboarded);
            }
          }
          if (personaRes.ok) {
            const j = await personaRes.json();
            setPersona(j);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("[CardAgentChat] history load failed:", err);
        }
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    };
    void loadAll();
    return () => {
      cancelled = true;
    };
  }, [cardId, accessToken]);

 // Scroll to bottom whenever messages change.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

 // ─── Voice (browser SpeechRecognition) ────────────────────────────────────
  const toggleVoice = useCallback(() => {
    type SR = typeof window & { SpeechRecognition?: any; webkitSpeechRecognition?: any };
    const SR =
      (typeof window !== "undefined" && ((window as SR).SpeechRecognition || (window as SR).webkitSpeechRecognition)) ||
      null;
    if (!SR) {
      setError("Voice input is not supported in this browser. Try Chrome, Edge, or Brave.");
      return;
    }
    if (voiceActive && recognitionRef.current) {
      (recognitionRef.current as { stop: () => void }).stop();
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    transcriptBaseRef.current = input.trim();
    rec.onstart = () => setVoiceActive(true);
    rec.onend = () => setVoiceActive(false);
    rec.onerror = (e: { error?: string }) => {
      setVoiceActive(false);
      setError(`Mic: ${e.error || "unknown error"}`);
    };
    rec.onresult = (e: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (final) {
        transcriptBaseRef.current = (transcriptBaseRef.current + " " + final).trim();
        setInput(transcriptBaseRef.current);
      } else {
        setInput((transcriptBaseRef.current + " " + interim).trim());
      }
    };
    recognitionRef.current = rec;
    rec.start();
  }, [input, voiceActive]);

 // ─── Send message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !accessToken || !cardId) return;

      setError(null);
 // Dismiss the first-visit hint the moment they send.
      setShowHint(false);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(FIRST_HINT_STORAGE_KEY(cardId), "1");
      }

 // Optimistic insert of the user message.
      const optimisticUserId = `tmp-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: optimisticUserId,
          role: "user",
          content: trimmed,
          created_at: new Date().toISOString(),
        },
      ]);
      setInput("");
      transcriptBaseRef.current = "";

      setSending(true);
      try {
        const payload = buildCardChatRequestBody(trimmed);
        if ("error" in payload) {
          throw new Error(payload.error);
        }
        const res = await fetch(`/api/cards/${cardId}/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({} as Record<string, unknown>));
        if (!res.ok) {
          const errMsg = typeof data.error === "string" ? data.error : `HTTP ${res.status}`;
          throw new Error(errMsg);
        }
 // M12 Day 1 UI-state-sync ( lock 2026-05-29): bubble any
 // tool-driven stateChanges as window events. useCardsState (and
 // any future card-owning hook) listens and patches its local copy
 // in the same animation frame. See lib/agent-tools.ts for the
 // patch shape: { entity, id, patch }.
        const stateChanges = (data as any).stateChanges;
        if (Array.isArray(stateChanges) && stateChanges.length > 0) {
          for (const sc of stateChanges) {
            window.dispatchEvent(new CustomEvent("nuro:state-changed", { detail: sc }));
          }
        }
        const toolsFiredFromResponse = Array.isArray((data as any).toolsFired)
          ? ((data as any).toolsFired as string[])
          : undefined;
        setMessages((prev) => [
          ...prev,
          {
            id: `asst-${Date.now()}`,
            role: "assistant",
            content: String(data.message || "(no response)"),
            created_at: new Date().toISOString(),
            toolsFired: toolsFiredFromResponse,
          },
        ]);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Send failed";
        setError(message);
      } finally {
        setSending(false);
        inputRef.current?.focus();
      }
    },
    [cardId, accessToken],
  );

  const onFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;
    void sendMessage(input);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!sending) void sendMessage(input);
    }
  };

  const clearHistory = useCallback(async () => {
    if (!accessToken || !cardId) return;
    if (!confirm(`Clear all conversation history for ${cardName || "this card"}? This cannot be undone.`)) return;
    try {
      await fetch(`/api/cards/${cardId}/messages`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setMessages([]);
      setSettingsOpen(false);
    } catch (err) {
      console.warn("[CardAgentChat] clear failed:", err);
    }
  }, [cardId, accessToken, cardName]);

  const swapPersona = useCallback(
    async (key: PersonaKey) => {
      if (!accessToken || !cardId) return;
      try {
        const res = await fetch(`/api/cards/${cardId}/persona`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ persona: key }),
        });
        if (res.ok) {
 // Refetch persona to update the badge.
          const pres = await fetch(`/api/cards/${cardId}/persona`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (pres.ok) setPersona(await pres.json());
        }
      } catch (err) {
        console.warn("[CardAgentChat] persona swap failed:", err);
      }
    },
    [cardId, accessToken],
  );

  const hint = persona?.firstHint || "Try: how much have I spent this month?";

  return (
    <div
      className={cn(
        "flex flex-col w-full rounded-[16px] border border-zinc-800 bg-zinc-950/40 backdrop-blur-sm",
        compact ? "p-3" : "p-4",
      )}
    >
      {/* Header: persona badge + settings menu */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 truncate">
            {cardName || "Card"}
          </span>
          {persona ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300 font-medium">
              {persona.label}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className="size-7 inline-flex items-center justify-center rounded text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
          onClick={() => setSettingsOpen((v) => !v)}
          aria-label="Chat settings"
        >
          <MoreVertical className="size-3.5" />
        </button>
      </div>

      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden mb-2"
          >
            <div className="bg-zinc-900 border border-zinc-800 rounded-md p-3 space-y-2 text-xs">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Persona</div>
              <div className="flex flex-wrap gap-1.5">
                {persona?.availablePersonas?.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => swapPersona(p.key)}
                    className={cn(
                      "px-2 py-1 rounded text-[11px] font-medium transition-colors",
                      persona.persona === p.key
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300",
                    )}
                    title={p.tagline}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={clearHistory}
                className="inline-flex items-center gap-1.5 mt-1 px-2 py-1 rounded text-[11px] text-red-300 hover:text-red-200 hover:bg-red-950/40 transition-colors"
              >
                <Trash2 className="size-3" />
                Reset this card&apos;s memory
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Conversation panel: hidden until there's history OR a response in-flight */}
      <AnimatePresence>
        {(messages.length > 0 || sending) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden mb-2"
          >
            <div
              ref={scrollRef}
              className="max-h-[280px] overflow-y-auto space-y-2 pr-1 py-1 chat-scroll"
            >
              {loadingHistory && messages.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-zinc-500 py-2">
                  <Loader2 className="size-3 animate-spin" />
                  Loading conversation...
                </div>
              ) : null}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "flex flex-col gap-1",
                    m.role === "user" ? "items-end" : "items-start",
                  )}
                >
                  <div
                    className={cn(
                      "px-3 py-2 rounded-lg text-sm whitespace-pre-wrap",
                      m.role === "user"
                        ? "max-w-[80%] bg-blue-600/80 text-white"
                        : "max-w-[90%] bg-zinc-800/80 text-zinc-100",
                    )}
                  >
                    {m.content}
                  </div>
                  {/* M12 trust-signal pill: tool names that fired this turn. */}
                  {m.role === "assistant" && m.toolsFired && m.toolsFired.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 max-w-[90%]">
                      {m.toolsFired.map((toolName, idx) => (
                        <div
                          key={`${m.id}-tool-${idx}-${toolName}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-[#05fb81]/[0.12] text-[#05fb81] border border-[#05fb81]/25"
                          title={`Tool fired: ${toolName}`}
                        >
                          <svg
                            width="9"
                            height="9"
                            viewBox="0 0 9 9"
                            fill="none"
                            aria-hidden
                            className="shrink-0"
                          >
                            <path
                              d="M1.5 4.5L3.5 6.5L7.5 2.5"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          {TOOL_LABELS[toolName] ?? toolName}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {sending && (
                <div className="mr-auto max-w-[90%] bg-zinc-800/80 text-zinc-300 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                  <span className="inline-flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-current animate-pulse" />
                    <span className="size-1.5 rounded-full bg-current animate-pulse" style={{ animationDelay: "0.15s" }} />
                    <span className="size-1.5 rounded-full bg-current animate-pulse" style={{ animationDelay: "0.3s" }} />
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* First-visit hint above the input */}
      <AnimatePresence>
        {showHint && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.18 }}
            className="flex items-center gap-2 px-3 py-1.5 mb-2 rounded-md bg-amber-900/30 border border-amber-700/40 text-[11px] text-amber-200"
          >
            <span className="flex-1 truncate italic">{hint}</span>
            <button
              type="button"
              onClick={() => {
                setShowHint(false);
                if (typeof window !== "undefined") {
                  window.localStorage.setItem(FIRST_HINT_STORAGE_KEY(cardId), "1");
                }
              }}
              className="size-5 inline-flex items-center justify-center rounded text-amber-300 hover:text-amber-100 hover:bg-amber-900/40"
              aria-label="Dismiss hint"
            >
              <X className="size-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input row */}
      <form onSubmit={onFormSubmit} className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={sending}
          placeholder={`Message ${cardName || "this card"}...`}
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-600 transition-colors disabled:opacity-60"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={toggleVoice}
          disabled={sending}
          className={cn(
            "size-9 inline-flex items-center justify-center rounded-md transition-colors disabled:opacity-40",
            voiceActive
              ? "bg-amber-700 text-white hover:bg-amber-600"
              : "bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700",
          )}
          aria-label={voiceActive ? "Stop voice input" : "Start voice input"}
          title="Speak to the card"
        >
          <Mic className="size-4" />
        </button>
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="size-9 inline-flex items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Send message"
        >
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </button>
      </form>

      {error && (
        <div className="mt-2 px-3 py-1.5 rounded-md bg-red-950/40 border border-red-800/40 text-xs text-red-300 flex items-center justify-between gap-2">
          <span className="flex-1 min-w-0 truncate">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="size-5 inline-flex items-center justify-center rounded hover:bg-red-900/40"
            aria-label="Dismiss error"
          >
            <X className="size-3" />
          </button>
        </div>
      )}
    </div>
  );
}
