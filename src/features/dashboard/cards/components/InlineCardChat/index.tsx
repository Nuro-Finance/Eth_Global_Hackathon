"use client";

/**
 * InlineCardChat - per-card agent chat (Variant B: Card Flips to Console).
 *
 * 2026-05-25 v2: Rebuilt from design Council output.
 * - Stitch's Nuro Granite tokens (#0d90ff primary, white/8% glass, white/10% borders)
 * - V0's spring physics (stiffness 240, damping 28) for flip choreography
 * - Mobbin refs (Sana persona density, Dialpad lift-to-console, Vapi mic-primary)
 *
 * State machine:
 * collapsed: composer pill only. Card hero is full.
 * expanded: composer + console panel drops DOWN. Card hero compresses
 * to a strip (handled by parent CardListItem via onExpandedChange).
 *
 * Expansion triggers: focus, keystroke, quick-chip tap, settings tap, voice start.
 * Collapse triggers: chevron, click outside (unless voice active).
 *
 * Spec mapping (Per-Card Agent System Spec, ticket #15):
 * Q1 Trigger: click. Compact composer always visible, panel drops on focus.
 * Q2 First-visit hint: welcome message inside the panel + chip suggestions.
 * Q3 Memory: persistent (DB-backed). User can wipe via settings.
 * Q4 Pricing: $5/day cap enforcement lives in the backend (out of scope here).
 * Q5 Persona: Banker / Concierge / CFO, swappable from settings popover.
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
import {
  Mic,
  Send,
  Loader2,
  X,
  ChevronUp,
  Settings2,
  Trash2,
  Sparkles,
  FileText,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { buildCardChatRequestBody } from "@/lib/chatByok";

// ─── V0 Council spring physics ────────────────────────────────────────────────
// Locked 2026-05-25 by from V0 demo workspace jSVouUBJZcK.
// Stiffness 240 + damping 28 = brisk-but-soft flip that doesn't feel laggy.
const CONSOLE_SPRING = { type: "spring" as const, stiffness: 260, damping: 30 };
const FADE_IN = { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const };

/**
 * M12 trust-signal pill labels - short past-tense for each tool that fires.
 * Mirrors getToolFriendlyLabel in src/lib/agent-tools.ts but inlined here
 * because that file pulls backend-only imports (pg, issuers). Keep in sync
 * with the backend when new tools land.
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

type ChatMessage = {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
 /** M12 trust-signal: tool names this assistant turn invoked. Renders
 * as small "✓ Froze the card" pills under the message bubble. */
  toolsFired?: string[];
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

interface InlineCardChatProps {
  cardId: string;
  cardName?: string;
 /**
 * 2026-05-25: fires whenever the chat expands or collapses. The parent
 * CardListItem listens to this and animates its card hero between full
 * and compressed-strip states (Variant B "Card Flips to Console").
 */
  onExpandedChange?: (expanded: boolean) => void;
 /** Controlled open state (e.g. Agent Cards Chat CTA). */
  expanded?: boolean;
 /**
 * When true, hide the collapsed composer until expanded - opened via an
 * external Chat button on the card row instead.
 */
  externalTrigger?: boolean;
}

// Persona dot color - used as a status indicator on the pill. Subtle, not loud.
const PERSONA_DOT: Record<PersonaKey, string> = {
  banker: "bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.6)]",
  concierge: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]",
  cfo: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]",
};

/**
 * Quick-action chips shown inside the panel. Tapping a chip auto-sends
 * the prompt. Generic across personas; the agent's response is shaped
 * by persona via the system prompt.
 */
const QUICK_ACTIONS: Array<{ label: string; prompt: string }> = [
  { label: "This week's spend", prompt: "How much have I spent on you this week?" },
  { label: "Recent transactions", prompt: "Show me my last 5 transactions." },
  { label: "What's my limit?", prompt: "What's my current spending limit?" },
  { label: "Freeze me", prompt: "Freeze this card." },
];

function welcomeMessageFor(personaKey: PersonaKey | null, cardName?: string): string {
  const name = cardName || "this card";
  switch (personaKey) {
    case "cfo":
      return `${name}. Numbers ready when you are.`;
    case "concierge":
      return `Hey, I'm ${name}. Ask me anything about my spend, limits, or recent activity.`;
    case "banker":
    default:
      return `Good day. I'm ${name}. How may I help you with your account today?`;
  }
}

export default function InlineCardChat({
  cardId,
  cardName,
  onExpandedChange,
  expanded: expandedProp,
  externalTrigger = false,
}: InlineCardChatProps) {
  const { data: session } = useSession();
  const accessToken = (session as { accessToken?: string } | null)?.accessToken ?? null;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [persona, setPersona] = useState<PersonaInfo | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isControlled = expandedProp !== undefined;
  const expanded = isControlled ? expandedProp : internalExpanded;

  const setExpanded = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalExpanded(next);
      onExpandedChange?.(next);
    },
    [isControlled, onExpandedChange],
  );
  const [error, setError] = useState<string | null>(null);
  const [voiceActive, setVoiceActive] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [welcomed, setWelcomed] = useState(false);

 // 2026-05-26 Phase 2 .self_learn: report generation flow.
 // reportPickerOpen toggles the inline cadence picker UI.
 // customCadence holds the free-text when user picks "Other".
 // reportLoading guards against double-submit during Claude round-trip.
  const [reportPickerOpen, setReportPickerOpen] = useState(false);
  const [customCadence, setCustomCadence] = useState("");
  const [reportLoading, setReportLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<unknown | null>(null);
  const transcriptBaseRef = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

 // Click-outside auto-collapse. Voice-active overrides so a mid-speech
 // off-card click doesn't kill recording.
  useEffect(() => {
    if (!expanded || voiceActive) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (containerRef.current && containerRef.current.contains(target)) return;
      setExpanded(false);
      setSettingsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [expanded, voiceActive, setExpanded]);

 // ─── Lazy history + persona load on first expand ─────────────────────────
  const [loaded, setLoaded] = useState(false);
  const loadAll = useCallback(async () => {
    if (loaded || !cardId || !accessToken) return;
    setLoaded(true);
    try {
      const [historyRes, personaRes] = await Promise.all([
        fetch(`/api/cards/${cardId}/messages?limit=30`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        fetch(`/api/cards/${cardId}/persona`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ]);
      if (historyRes.ok) {
        const j = await historyRes.json();
        if (Array.isArray(j?.messages) && j.messages.length > 0) {
          setMessages(j.messages);
          setWelcomed(true);
        }
      }
      if (personaRes.ok) {
        const j = await personaRes.json();
        setPersona(j);
      }
    } catch (err) {
      console.warn("[InlineCardChat] load failed:", err);
    }
  }, [cardId, accessToken, loaded]);

  useEffect(() => {
    if (expanded) void loadAll();
  }, [expanded, loadAll]);

 // Synthetic welcome on first expand IF no real history.
  useEffect(() => {
    if (!expanded || welcomed) return;
    if (messages.length > 0) {
      setWelcomed(true);
      return;
    }
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: welcomeMessageFor(persona?.persona ?? null, cardName),
        created_at: new Date().toISOString(),
      },
    ]);
    setWelcomed(true);
  }, [expanded, welcomed, persona, cardName, messages.length]);

 // Auto-scroll to bottom on new messages.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

 // Focus input on first expand so the user can start typing immediately.
  useEffect(() => {
    if (expanded && !sending) {
      inputRef.current?.focus();
    }
  }, [expanded, sending]);

 // ─── Voice (browser SpeechRecognition) ────────────────────────────────────
  const toggleVoice = useCallback(() => {
    type SR = typeof window & { SpeechRecognition?: any; webkitSpeechRecognition?: any };
    const SR =
      (typeof window !== "undefined" &&
        ((window as SR).SpeechRecognition || (window as SR).webkitSpeechRecognition)) ||
      null;
    if (!SR) {
      setError("Voice not supported in this browser. Try Chrome, Edge, or Brave.");
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
    rec.onstart = () => {
      setVoiceActive(true);
      setExpanded(true);
      void loadAll();
    };
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
  }, [input, voiceActive, loadAll]);

 // ─── Send message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !accessToken || !cardId) return;

      setError(null);
      setExpanded(true);
      void loadAll();

      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== "welcome");
        return [
          ...filtered,
          {
            id: `tmp-${Date.now()}`,
            role: "user",
            content: trimmed,
            created_at: new Date().toISOString(),
          },
        ];
      });
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
 // M12 Day 1 UI-state-sync ( lock 2026-05-29): if the
 // agent fired any tools that mutated state (e.g. freeze_card),
 // the response includes `stateChanges` - an array of
 // { entity, id, patch }. Dispatch each as a window CustomEvent
 // so any hook holding card/agent/vault state can listen and
 // patch its local copy IN THE SAME ANIMATION FRAME as the
 // assistant message lands. See useCardsState for the listener.
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
    [cardId, accessToken, loadAll],
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

  const onFocus = () => {
    setExpanded(true);
    void loadAll();
  };

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
          const pres = await fetch(`/api/cards/${cardId}/persona`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (pres.ok) setPersona(await pres.json());
        }
      } catch (err) {
        console.warn("[InlineCardChat] persona swap failed:", err);
      }
    },
    [cardId, accessToken],
  );

  const clearHistory = useCallback(async () => {
    if (!accessToken || !cardId) return;
    if (!confirm(`Wipe all conversation history with ${cardName || "this card"}? Can't be undone.`)) return;
    try {
      await fetch(`/api/cards/${cardId}/messages`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setMessages([]);
      setWelcomed(false);
      setSettingsOpen(false);
    } catch (err) {
      console.warn("[InlineCardChat] clear failed:", err);
    }
  }, [cardId, accessToken, cardName]);

 // ─── Phase 2 .self_learn: report generation ───────────────────────────────
 // Calls POST /api/users/me/reports with the chosen cadence + kind. Inserts
 // the generated report into the chat as an assistant message so the user
 // reads it inline (no separate panel). Per 2026-05-26.
  const generateReport = useCallback(
    async (cadence: "weekly" | "quarterly" | "yearly" | "custom", customDescription?: string) => {
      if (!accessToken || reportLoading) return;
      setReportLoading(true);
      setReportPickerOpen(false);
      setError(null);

 // Strip the synthetic welcome before adding real content.
 // Drop a user-side stub describing the request so the conversation reads
 // naturally ("→ Generate weekly report"), then a loading bubble while
 // Claude works.
      const requestSummary =
        cadence === "custom"
          ? `Generate a report (${customDescription})`
          : `Generate ${cadence} report`;
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== "welcome");
        return [
          ...filtered,
          {
            id: `report-req-${Date.now()}`,
            role: "user",
            content: requestSummary,
            created_at: new Date().toISOString(),
          },
        ];
      });

      try {
        const res = await fetch(`/api/users/me/reports`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            cadence,
            kind: "learning",
            ...(cadence === "custom" ? { customDescription } : {}),
          }),
        });
        const data = await res.json().catch(() => ({} as Record<string, unknown>));
        if (!res.ok) {
          throw new Error(typeof data.error === "string" ? data.error : `HTTP ${res.status}`);
        }
        const body = String(data.body_markdown || "(no report content)");
        setMessages((prev) => [
          ...prev,
          {
            id: `report-${data.id || Date.now()}`,
            role: "assistant",
            content: body,
            created_at: new Date().toISOString(),
          },
        ]);
        setCustomCadence("");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Report generation failed";
        setError(message);
      } finally {
        setReportLoading(false);
      }
    },
    [accessToken, reportLoading],
  );

  const personaKey = persona?.persona ?? null;
  const placeholder = expanded
    ? "Type a message..."
    : cardName
      ? `Ask ${cardName}...`
      : "Ask this card...";

  if (externalTrigger && !expanded) {
    return null;
  }

  return (
    <div
      ref={containerRef}
 // Merges with the parent card surface. No own bg/border - the
 // CardListItem owns the visual envelope. Thin top divider + tight
 // top padding so it reads as ONE living div.
      className="mt-5 pt-4 border-t border-white/[0.06] w-full"
    >
      {/* ──────── COMPOSER ROW ──────── */}
      {/* Pill-shape per Stitch design system. White/4% surface, white/10% border.
          When expanded: subtle blue glow on border (focus state). */}
      <form
        onSubmit={onFormSubmit}
        className={cn(
          "flex items-center gap-1.5 w-full rounded-full p-1.5 transition-all duration-200",
          "bg-white/[0.04] border",
          expanded
            ? "border-[#0d90ff]/40 shadow-[0_0_0_3px_rgba(13,144,255,0.08)]"
            : "border-white/[0.08]",
        )}
      >
        {/* Persona pill - tappable to open settings popover.
            Dot indicator + label. Stitch style: tight, monochrome chip. */}
        {persona && (
          <button
            type="button"
            onClick={() => {
              setSettingsOpen((v) => !v);
              setExpanded(true);
              void loadAll();
            }}
            className={cn(
              "shrink-0 inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full",
              "bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.06]",
              "text-[10.5px] font-medium text-white/80 hover:text-white",
              "transition-colors",
            )}
            title="Tap to swap persona or reset memory"
            aria-label="Chat settings"
          >
            <span className={cn("size-1.5 rounded-full", PERSONA_DOT[personaKey ?? "concierge"])} />
            {persona.label}
          </button>
        )}

        <div className="relative flex-1 min-w-0">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (!expanded && e.target.value.length > 0) {
                setExpanded(true);
                void loadAll();
              }
            }}
            onFocus={onFocus}
            onKeyDown={onKeyDown}
            disabled={sending}
            placeholder={placeholder}
            className={cn(
              "w-full bg-transparent border-0 px-3 py-1.5 text-[13px] text-white placeholder-white/35",
              "outline-none focus:ring-0 disabled:opacity-60",
            )}
            autoComplete="off"
            aria-label={`Chat with ${cardName || "this card"}`}
          />
        </div>

        {/* Collapse chevron - only visible when expanded */}
        <AnimatePresence>
          {expanded && (
            <motion.button
              key="collapse"
              type="button"
              onClick={() => {
                setExpanded(false);
                setSettingsOpen(false);
              }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={FADE_IN}
              className={cn(
                "shrink-0 size-8 inline-flex items-center justify-center rounded-full",
                "bg-white/[0.04] hover:bg-white/[0.08] text-white/60 hover:text-white",
                "transition-colors",
              )}
              aria-label="Collapse chat"
              title="Collapse"
            >
              <ChevronUp className="size-3.5" />
            </motion.button>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={toggleVoice}
          disabled={sending}
          className={cn(
            "shrink-0 size-8 inline-flex items-center justify-center rounded-full transition-all",
            voiceActive
              ? "bg-amber-500 text-white shadow-[0_0_0_3px_rgba(245,158,11,0.25)]"
              : "bg-white/[0.04] hover:bg-white/[0.08] text-white/60 hover:text-white",
            "disabled:opacity-40 disabled:cursor-not-allowed",
          )}
          aria-label={voiceActive ? "Stop voice input" : "Start voice input"}
          title="Speak to the card"
        >
          <Mic className="size-3.5" />
        </button>

        <button
          type="submit"
          disabled={sending || !input.trim()}
          className={cn(
            "shrink-0 size-8 inline-flex items-center justify-center rounded-full transition-all",
            "bg-[#0d90ff] hover:bg-[#0d90ff]/90 text-white",
            "shadow-[0_2px_12px_rgba(13,144,255,0.35)] hover:shadow-[0_2px_16px_rgba(13,144,255,0.5)]",
            "disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none",
          )}
          aria-label="Send"
        >
          {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
        </button>
      </form>

      {/* ──────── SETTINGS POPOVER ──────── */}
      <AnimatePresence>
        {settingsOpen && expanded && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={CONSOLE_SPRING}
            className="overflow-hidden"
          >
            <div className="mt-3 px-3 py-3 rounded-2xl bg-white/[0.025] border border-white/[0.06]">
              <div className="flex items-center justify-between mb-2.5">
                <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-white/40 font-semibold">
                  <Settings2 className="size-3" />
                  Persona
                </div>
                <button
                  type="button"
                  onClick={clearHistory}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10.5px]",
                    "text-red-300/70 hover:text-red-200 hover:bg-red-950/30 transition-colors",
                  )}
                >
                  <Trash2 className="size-3" />
                  Reset memory
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(persona?.availablePersonas ?? []).map((p) => {
                  const isActive = persona?.persona === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => swapPersona(p.key)}
                      className={cn(
                        "inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full text-[11px] font-medium transition-all",
                        isActive
                          ? "bg-[#0d90ff] text-white shadow-[0_2px_12px_rgba(13,144,255,0.35)]"
                          : "bg-white/[0.04] hover:bg-white/[0.08] text-white/75 hover:text-white border border-white/[0.06]",
                      )}
                      title={p.tagline}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          isActive ? "bg-white" : PERSONA_DOT[p.key],
                        )}
                      />
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ──────── CONSOLE PANEL ──────── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={CONSOLE_SPRING}
            className="overflow-hidden"
          >
            {/* Quick chips - Sparkles glyph + horizontal scroll-safe wrap.
                Stitch density: pill chips with subtle borders, tighter type. */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Sparkles className="size-3 text-white/30 shrink-0" />
              {QUICK_ACTIONS.map((qa) => (
                <button
                  key={qa.label}
                  type="button"
                  onClick={() => sendMessage(qa.prompt)}
                  disabled={sending}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[10.5px] font-medium transition-all",
                    "bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white",
                    "border border-white/[0.06] hover:border-white/[0.12]",
                    "disabled:opacity-40 disabled:cursor-not-allowed",
                  )}
                  title={qa.prompt}
                >
                  {qa.label}
                </button>
              ))}
              {/* Phase 2 .self_learn: "Want a report?" chip - distinct accent
                  color so it reads as a different kind of action. Toggles the
                  cadence picker below the chip row. */}
              <button
                type="button"
                onClick={() => setReportPickerOpen((v) => !v)}
                disabled={reportLoading}
                className={cn(
                  "ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-medium transition-all",
                  reportPickerOpen
                    ? "bg-[#0d90ff]/15 text-[#0d90ff] border border-[#0d90ff]/30"
                    : "bg-white/[0.04] hover:bg-white/[0.08] text-white/70 hover:text-white border border-white/[0.06] hover:border-white/[0.12]",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                )}
                title="Generate a personalized .self_learn report"
              >
                <FileText className="size-3" />
                Want a report?
              </button>
            </div>

            {/* Phase 2 .self_learn: cadence picker - drops in when chip toggled.
                Three preset cadences + Other (custom free-text). Pressing a
                preset fires generation immediately. Pressing Other expands
                the text input; Enter or the inline Send button fires it. */}
            <AnimatePresence>
              {reportPickerOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: "auto" }}
                  exit={{ opacity: 0, y: -6, height: 0 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] as const }}
                  className="overflow-hidden"
                >
                  <div className="mt-2.5 px-3 py-3 rounded-2xl bg-white/[0.025] border border-white/[0.06]">
                    <div className="text-[10px] uppercase tracking-[0.12em] text-white/40 font-semibold mb-2">
                      Pick a window
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-2.5">
                      {(["weekly", "quarterly", "yearly"] as const).map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => generateReport(c)}
                          disabled={reportLoading}
                          className={cn(
                            "px-3 py-1.5 rounded-full text-[11px] font-medium transition-all",
                            "bg-white/[0.04] hover:bg-[#0d90ff]/15 text-white/80 hover:text-white",
                            "border border-white/[0.06] hover:border-[#0d90ff]/30",
                            "disabled:opacity-40 disabled:cursor-not-allowed",
                          )}
                        >
                          {c.charAt(0).toUpperCase() + c.slice(1)}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={customCadence}
                        onChange={(e) => setCustomCadence(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && customCadence.trim()) {
                            e.preventDefault();
                            generateReport("custom", customCadence.trim());
                          }
                        }}
                        disabled={reportLoading}
                        placeholder="Other... (e.g. since I joined, last month)"
                        className={cn(
                          "flex-1 min-w-0 bg-white/[0.04] border border-white/[0.08] rounded-full px-3 py-1.5",
                          "text-[11px] text-white placeholder-white/35 outline-none focus:border-[#0d90ff]/40",
                          "transition-colors disabled:opacity-40",
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => customCadence.trim() && generateReport("custom", customCadence.trim())}
                        disabled={reportLoading || !customCadence.trim()}
                        className={cn(
                          "shrink-0 size-7 inline-flex items-center justify-center rounded-full transition-all",
                          "bg-[#0d90ff] hover:bg-[#0d90ff]/90 text-white",
                          "shadow-[0_2px_8px_rgba(13,144,255,0.3)]",
                          "disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none",
                        )}
                        aria-label="Generate custom report"
                      >
                        {reportLoading ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Send className="size-3" />
                        )}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Conversation scroll area. Bubbles ride on the parent card surface
                so they share the glass envelope but read as distinct messages.
                v15.4: `chat-scroll` utility - hidden native scrollbars + smooth
                scroll behavior + overscroll-contain so wheel events don't chain
                to the page when conversation maxes out. */}
            <div
              ref={scrollRef}
              className="mt-3 min-h-[160px] max-h-[320px] overflow-y-auto pr-1 space-y-2 chat-scroll"
            >
              {messages.length === 0 && !sending ? (
                <div className="flex items-center justify-center h-[140px] text-[12px] text-white/35 italic px-6 text-center">
                  Type a message or tap a quick action.
                </div>
              ) : (
                <>
                  <AnimatePresence initial={false}>
                    {messages.map((m) => (
                      <motion.div
                        key={m.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={FADE_IN}
                        className={cn("flex flex-col gap-1.5", m.role === "user" ? "items-end" : "items-start")}
                      >
                        <div
                          className={cn(
                            "px-3.5 py-2 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap",
                            m.role === "user"
                              ? "max-w-[80%] bg-[#0d90ff] text-white shadow-[0_2px_12px_rgba(13,144,255,0.25)]"
                              : "max-w-[90%] bg-white/[0.05] text-white/90 border border-white/[0.06]",
                          )}
                        >
                          {m.content}
                        </div>
                        {/* M12 Day 1 trust-signal pill: when an assistant message
                            invoked tool_use blocks that ACTUALLY executed, render a
                            small chip per tool with a friendly past-tense label.
                            Concrete proof that the agent's words match a real
                            backend action - not a hallucinated promise.
                            Only renders for assistant messages with toolsFired. */}
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
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {(sending || reportLoading) && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex justify-start"
                    >
                      <div className="bg-white/[0.05] border border-white/[0.06] text-white/70 px-3.5 py-2.5 rounded-2xl inline-flex items-center gap-2">
                        <span className="size-1.5 rounded-full bg-current animate-pulse" />
                        <span className="size-1.5 rounded-full bg-current animate-pulse" style={{ animationDelay: "0.15s" }} />
                        <span className="size-1.5 rounded-full bg-current animate-pulse" style={{ animationDelay: "0.3s" }} />
                        {reportLoading && (
                          <span className="text-[11px] text-white/55">pulling your .self_learn signals</span>
                        )}
                      </div>
                    </motion.div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ──────── ERROR ROW ──────── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={FADE_IN}
            className="mt-2 px-3 py-1.5 rounded-full bg-red-950/30 border border-red-800/30 text-[11px] text-red-300 flex items-center justify-between gap-2"
          >
            <span className="flex-1 min-w-0 truncate">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="shrink-0 size-5 inline-flex items-center justify-center rounded-full hover:bg-red-900/40"
              aria-label="Dismiss error"
            >
              <X className="size-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
