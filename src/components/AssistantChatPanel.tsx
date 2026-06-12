"use client";

import { useRef, useState, useEffect } from "react";
import { Image as ImageIcon, Mic, Send, Square, X, Copy, ThumbsUp, ThumbsDown, RefreshCw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

// Format timestamp to small time string (e.g., "1:51 PM")
const formatTime = (timestamp?: number) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
};
const MessageActions = ({ isAssistant, onCopy, onRegenerate }: { isAssistant?: boolean; onCopy?: () => void; onRegenerate?: () => void }) => {
  const [copied, setCopied] = useState(false);
  const [rating, setRating] = useState<'up' | 'down' | null>(null);

  const handleCopy = () => {
    onCopy?.();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center gap-1 mt-1 bg-transparent">
      <button
        onClick={handleCopy}
        className="p-1 rounded hover:bg-[var(--color-surface-hover)] transition-all duration-200 text-[var(--color-text-muted)] opacity-40 hover:opacity-100"
        aria-label="Copy message"
        title="Copy"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-[var(--color-success)]" />
        ) : (
          <Copy className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
        )}
      </button>
      <button
        onClick={() => setRating(rating === 'up' ? null : 'up')}
        className="p-1 rounded hover:bg-[var(--color-surface-hover)] transition-all duration-200 text-[var(--color-text-muted)] opacity-40 hover:opacity-100"
        aria-label="Thumbs up"
        title="Helpful"
      >
        <ThumbsUp
          className="w-3.5 h-3.5 transition-colors"
          style={{
            stroke: rating === 'up' ? "var(--color-primary)" : "currentColor",
            strokeOpacity: rating === 'up' ? 0.5 : 1,
            fill: rating === 'up' ? "var(--color-primary)" : "none",
            fillOpacity: rating === 'up' ? 0.5 : 0
          }}
        />
      </button>
      <button
        onClick={() => setRating(rating === 'down' ? null : 'down')}
        className="p-1 rounded hover:bg-[var(--color-surface-hover)] transition-all duration-200 text-[var(--color-text-muted)] opacity-40 hover:opacity-100"
        aria-label="Thumbs down"
        title="Not helpful"
      >
        <ThumbsDown
          className="w-3.5 h-3.5 transition-colors"
          style={{
            stroke: rating === 'down' ? "var(--color-primary)" : "currentColor",
            strokeOpacity: rating === 'down' ? 0.5 : 1,
            fill: rating === 'down' ? "var(--color-primary)" : "none",
            fillOpacity: rating === 'down' ? 0.5 : 0
          }}
        />
      </button>
      {isAssistant && onRegenerate && (
        <button
          onClick={onRegenerate}
          className="p-1 rounded hover:bg-[var(--color-surface-hover)] transition-all duration-200 text-[var(--color-text-muted)] opacity-40 hover:opacity-100"
          aria-label="Regenerate"
          title="Regenerate"
        >
          <RefreshCw className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
        </button>
      )}
    </div>
  );
};

interface AssistantChatPanelProps {
  onClose?: () => void;
}

type ChatRole = "user" | "assistant";
type ChatStatus = "pending" | "timed_out" | "sent";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  status?: ChatStatus; // assistant only
  originalText?: string; // assistant only
  attempt?: number; // assistant only
  timestamp?: number; // unix timestamp
};

export function AssistantChatPanel({ onClose }: AssistantChatPanelProps) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '40px';
      if (message) {
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 100)}px`;
      }
    }
  }, [message]);

  const [model, setModel] = useState<"auto" | "fast" | "thinking">("auto");

 // Backfill timestamps for dummy messages on mount
  useEffect(() => {
    const now = Date.now();
    setMessages((prev) =>
      prev.map((m) =>
        !m.timestamp ? { ...m, timestamp: now } : m
      )
    );
  }, []);

 // Native 1:1 Header Scroll Tracking
  const headerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef(0);
  const offsetRef = useRef(0);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const currentScrollY = e.currentTarget.scrollTop;
    const diff = currentScrollY - scrollRef.current;

    let newOffset = offsetRef.current + diff;
    newOffset = Math.max(0, Math.min(newOffset, 120)); // clamp between 0 and 120px

    if (currentScrollY <= 0) newOffset = 0;

    if (newOffset !== offsetRef.current) {
      offsetRef.current = newOffset;
      if (headerRef.current) {
        headerRef.current.style.transform = `translateY(-${newOffset}px)`;
        headerRef.current.style.opacity = `${1 - (newOffset / 100)}`;
      }
    }

    scrollRef.current = currentScrollY;
  };
  const modelLabel =
    model === "auto" ? "Auto" : model === "fast" ? "Fast" : "Thinking";

  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const keepOpenOnSelectRef = useRef(false);

 // Seed enough dummy content so we can test internal scrolling (without scrolling the page underneath).
 // All statuses are "sent" so no async timers run for these placeholders.
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "intro-a1",
      role: "assistant",
      status: "sent",
      content: "This is your copilot chat. Ask anything about your cards, transactions, yield strategies and more.",
      timestamp: Date.now(),
    },
    {
      id: "dummy-u1",
      role: "user",
      content: "Show me a summary of my recent activity. Keep it concise.",
    },
    {
      id: "dummy-a1",
      role: "assistant",
      status: "sent",
      content:
        "Sure. Your recent activity shows steady inflows and a few recurring transfers. If you want, I can highlight any anomalies and summarize totals by category.",
    },
    {
      id: "dummy-u2",
      role: "user",
      content: "What changed most since last week? Give me 2-3 bullets.",
    },
    {
      id: "dummy-a2",
      role: "assistant",
      status: "sent",
      content: "In the last week:\n• average transfer size increased slightly\n• you had one larger transaction that stands out\n• activity frequency stayed fairly consistent",
    },
    {
      id: "dummy-u3",
      role: "user",
      content: "Flag any unusual transactions and explain why they might be unusual.",
    },
    {
      id: "dummy-a3",
      role: "assistant",
      status: "sent",
      content:
        "I flagged a couple of transactions that deviate from your typical size/timing. These can be unusual due to one-off payments, batch transfers, or different recipient patterns. If you share what you were expecting, I can label them more accurately.",
    },
    {
      id: "dummy-u4",
      role: "user",
      content: "Can you estimate my spending on cards for the last 30 days?",
    },
    {
      id: "dummy-a4",
      role: "assistant",
      status: "sent",
      content:
        "Yes. I can estimate card spending by aggregating transaction totals and normalizing for any refunds. For best accuracy, I’ll treat refunds as negative outflows and split by merchant group.",
    },
    {
      id: "dummy-u5",
      role: "user",
      content: "I want recommendations: 1) reduce fees 2) increase yield. Keep it actionable.",
    },
    {
      id: "dummy-a5",
      role: "assistant",
      status: "sent",
      content:
        "Action plan:\n• reduce fees by batching transfers and avoiding unnecessary conversions\n• increase yield by rotating into higher-performing strategies while monitoring risk limits\n• set alerts for when rates change",
    },
    {
      id: "dummy-u6",
      role: "user",
      content: "Longer test message to force scroll behavior. Tell me about everything you can do with my wallet and transactions, and be specific about what information you need from me.",
    },
    {
      id: "dummy-a6",
      role: "assistant",
      status: "sent",
      content:
        "I can:\n• summarize spending\n• categorize transactions\n• detect outliers\n• suggest optimizations\n• draft step-by-step plans\nTo be specific, I’d need your preferred categories, any known one-off events, and your risk tolerance for yield strategies.",
    },
    {
      id: "dummy-u7",
      role: "user",
      content: "Last one: show me a quick recap again, and then stop.",
    },
    {
      id: "dummy-a7",
      role: "assistant",
      status: "sent",
      content:
        "Recap: steady recent inflows, a small number of notable transactions, and opportunities to optimize fees and improve yield. If you want, ask for a category split and I’ll generate it.",
    },
  ]);
  const assistantTimeoutsRef = useRef<Record<string, number>>({});

  const uid = () => {
 // Next/modern browsers generally have crypto; fallback for safety
    return globalThis.crypto?.randomUUID?.() ?? String(Math.random()).slice(2);
  };

  const scheduleAssistant = (assistantId: string, originalText: string, attempt: number) => {
    const willTimeout = attempt === 1;
    const delayMs = willTimeout ? 2500 : 900;

    const timeoutId = window.setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== assistantId) return m;
          if (willTimeout) {
            return {
              ...m,
              status: "timed_out",
              content: "",
            };
          }
          return {
            ...m,
            status: "sent",
            content: `Response (attempt ${attempt}): Thanks — here's what I can help with about “${originalText}”.`,
          };
        })
      );
    }, delayMs);

    assistantTimeoutsRef.current[assistantId] = timeoutId;
  };

  const resendAssistant = (assistantId: string) => {
 // Find the original message + attempt so we can re-run
    let nextAttempt = 2;
    let originalText = "";

    setMessages((prev) => {
      const target = prev.find((m) => m.id === assistantId);
      if (!target) return prev;
      originalText = target.originalText ?? "";
      nextAttempt = (target.attempt ?? 1) + 1;
      return prev.map((m) =>
        m.id === assistantId
          ? {
            ...m,
            status: "pending",
            content: "",
            originalText,
            attempt: nextAttempt,
          }
          : m
      );
    });

 // Clear old timeout if present
    const old = assistantTimeoutsRef.current[assistantId];
    if (old) window.clearTimeout(old);

    scheduleAssistant(assistantId, originalText, nextAttempt);
  };

  const handleSend = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const userId = uid();
    const assistantId = uid();

    const userMsg: ChatMessage = {
      id: userId,
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    };

    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      status: "pending",
      originalText: trimmed,
      attempt: 1,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    scheduleAssistant(assistantId, trimmed, 1);
  };

  const isStreaming = messages.some((m) => m.status === "pending");

  const handleStop = () => {
 // Clear all pending timers and mark those messages as stopped
    setMessages((prev) =>
      prev.map((m) => {
        if (m.status !== "pending") return m;
        const timerId = assistantTimeoutsRef.current[m.id];
        if (timerId) {
          window.clearTimeout(timerId);
          delete assistantTimeoutsRef.current[m.id];
        }
        return { ...m, status: "sent", content: "[Stopped]" };
      })
    );
  };

  return (
    <div 
      className="relative flex h-full flex-col isolate rounded-[24px] pointer-events-auto !backdrop-blur-none overflow-hidden"
      style={{ backgroundColor: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)' }}
    >
      {/* Header */}
      <div
        ref={headerRef}
        className="absolute top-4 left-4 right-4 z-[60] rounded-[var(--radius-lg)] border-0 bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-glass)] glass-card-inner shadow-[0_4px_30px_var(--color-shadow-primary)] px-4 py-3 will-change-transform"
        style={{ backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)' }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-[var(--color-primary)]">
              Nuro Intelligence
            </span>
            <span className="text-xs tracking-[0.08em] text-[var(--color-text-muted)]">
              Finance Agent
            </span>
          </div>

          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 w-9 rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-text-primary)]/2"
              onClick={onClose}
              aria-label="Close assistant panel"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        onScroll={handleScroll}
        className="scroll-fade-mask opacity-[0.99] transform-gpu will-change-transform scrollbar-autohide scroll-gutter-stable flex-1 overscroll-contain overflow-y-auto px-8 pt-[90px] pb-40 text-xs text-[var(--color-text-muted)]"
        style={{
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, transparent 16px, var(--color-text-primary) 64px, var(--color-text-primary) calc(100% - 3.5rem), transparent calc(100% - 1.5rem))',
          maskImage: 'linear-gradient(to bottom, transparent 0, transparent 16px, var(--color-text-primary) 64px, var(--color-text-primary) calc(100% - 3.5rem), transparent calc(100% - 1.5rem))'
        }}
      >
        <div className="scroll-fade-pad space-y-3">


          {messages.length > 0 && (
            <div>
              {messages.map((m) => {
                if (m.role === "user") {
                  return (
                    <div key={m.id} className="flex flex-col items-end group">
                      <div className="max-w-[85%] rounded-[var(--radius-xl)] bg-[var(--color-brand-primary)]/30 px-[18px] py-[14px] text-[var(--color-text-primary)]">
                        <div className="text-sm">{m.content}</div>
                      </div>
                      <div className="flex items-center gap-2 mt-1 bg-transparent">
                        <span className="text-[10px] text-[var(--color-text-muted)] opacity-60 relative top-[3px]">{formatTime(m.timestamp)}</span>
                        <MessageActions onCopy={() => navigator.clipboard.writeText(m.content)} />
                      </div>
                    </div>
                  );
                }

                const status = m.status ?? "pending";
                return (
                  <div key={m.id} className="flex flex-col items-start group w-full mb-4">
                    <div className="flex items-center gap-2 mb-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-pulse" />
                      <span className="text-[10px] uppercase font-bold tracking-[0.12em] text-[var(--color-primary)] opacity-80">Nuro</span>
                    </div>

                    <div className="w-full max-w-[85%] px-0 text-[var(--color-text-primary)]">
                      {status === "pending" && (
                        <div className="text-sm text-[var(--color-text-muted)] animate-pulse italic px-4">Thinking…</div>
                      )}
                      {status === "timed_out" && (
                        <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-error)]/20 bg-[var(--color-error)]/5 p-3 mx-4">
                          <div className="text-sm text-[var(--color-error)]">
                            Request timed out.
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => resendAssistant(m.id)}
                            className="w-fit px-3 h-8 text-xs hover:bg-[var(--color-error)]/10"
                          >
                            Resend
                          </Button>
                        </div>
                      )}
                      {status === "sent" && (
                        <div className="text-sm leading-relaxed space-y-2 text-[var(--color-text-primary)]/80">
                          {m.content.split(/\r?\n/).map((line, i) => {
                            const trimmedLine = line.trim();
                            const isBullet = /^([*|-]|•|\(\d+\))\s+/.test(trimmedLine);
                            const isHeader = /^#{3}\s+/.test(trimmedLine);

                            const formatBold = (text: string) => {
                              return text.split(/(\*\*.*?\*\*)/g).map((part, j) => {
                                if (part.startsWith('**') && part.endsWith('**')) {
                                  return <strong key={j} className="text-[var(--color-text-primary)] font-bold">{part.slice(2, -2)}</strong>;
                                }
                                if (part.includes(':')) {
                                  const segments = part.split(/(\w[\w\s]*:)/g);
                                  return segments.map((seg, k) => {
                                    if (seg.endsWith(':')) {
                                      return <strong key={k} className="text-[var(--color-text-primary)] font-bold">{seg}</strong>;
                                    }
                                    return seg;
                                  });
                                }
                                return part;
                              });
                            };

                            if (isHeader) {
                              return (
                                <h3 key={i} className="text-base font-bold text-[var(--color-text-primary)] mb-4">
                                  {trimmedLine.replace(/^#{3}\s+/, "")}
                                </h3>
                              );
                            }

                            if (isBullet) {
                              return (
                                <div key={i} className="flex gap-3 ml-2 my-1">
                                  <span className="flex-1">{formatBold(trimmedLine)}</span>
                                </div>
                              );
                            }

                            return <p key={i} className={line.trim() === "" ? "h-2" : ""}>{formatBold(line)}</p>;
                          })}
                        </div>
                      )}
                    </div>
                    {status === "sent" && (
                      <div className="flex items-center gap-2 mt-1 px-0 bg-transparent">
                        <MessageActions
                          isAssistant
                          onCopy={() => navigator.clipboard.writeText(m.content)}
                          onRegenerate={() => resendAssistant(m.id)}
                        />
                        <span className="text-[10px] text-[var(--color-text-muted)] opacity-60 relative top-[3px]">{formatTime(m.timestamp)}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer card */}
      <div
        className="absolute bottom-3 left-3 right-3 z-[60] rounded-[var(--radius-xl)] border border-white/5 bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-glass)] glass-card-inner shadow-[0_4px_30px_var(--color-shadow-primary)] px-3 py-3 flex flex-col gap-2"
        style={{ backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)' }}
      >
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(message);
            setMessage("");
          }}
        >
          {/* Input row (top) */}
          <div className="px-1 flex items-center">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                e.target.style.height = '40px';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 100)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (message.trim()) {
                    handleSend(message);
                    setMessage("");
                  }
                }
              }}
              rows={1}
              placeholder="Ask anything…"
              className="scrollbar-autohide w-full resize-none bg-transparent px-0 pb-[10px] pt-[10px] text-[14px] leading-5 text-[var(--color-text-primary)] placeholder:text-white/30 outline-none border-0 shadow-none overflow-y-auto block"
              style={{ minHeight: '40px', maxHeight: '100px' }}
            />
          </div>

          {/* Bottom row: photo + model + speaker + send */}
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-1.5">
              <label className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-[var(--color-border-secondary)] dark:border-[var(--color-border-glass)] bg-transparent hover:bg-[var(--color-bg-hover)] dark:hover:bg-[var(--color-bg-input-hover)] dark:hover:border-[var(--color-border-input-hover)] transition-colors active:scale-[0.98]">
                <input type="file" accept="image/*" className="hidden" />
                <ImageIcon className="h-4 w-4 text-[var(--color-text-muted)]" />
              </label>

              {/* Model selector */}
              <Select
                value={model}
                open={modelMenuOpen}
                onOpenChange={(nextOpen) => {
                  if (!nextOpen && keepOpenOnSelectRef.current) {
                    keepOpenOnSelectRef.current = false;
                    setModelMenuOpen(true);
                    return;
                  }
                  setModelMenuOpen(nextOpen);
                }}
                onValueChange={(v) => setModel(v as typeof model)}
              >
                <SelectTrigger className="!w-fit h-10 !px-3 rounded-full border border-[var(--color-border-secondary)] dark:border-[var(--color-border-glass)] bg-transparent dark:bg-transparent dark:backdrop-blur-none !justify-center gap-1.5 hover:bg-[var(--color-bg-hover)] dark:hover:bg-[var(--color-bg-input-hover)] dark:hover:border-[var(--color-border-input-hover)] transition-colors active:scale-[0.98]">
                  <span className="inline-flex items-center text-center text-[11px] font-normal text-[var(--color-text-muted)] leading-none whitespace-nowrap">
                    {modelLabel}
                  </span>
                </SelectTrigger>

                {/* Small popup: compact + switch pushed to the right */}
                <SelectContent className="w-[170px] p-1">
                  <SelectItem
                    value="auto"
                    textValue="Auto"
                    className="h-8 !py-1 !pl-3 !ps-0 !pe-0 rounded-[var(--radius-sm)] [&>span.absolute]:hidden"
                    onSelect={(e) => {
                      e.preventDefault();
                      keepOpenOnSelectRef.current = true;
                      setModel("auto");
                      setModelMenuOpen(true);
                    }}
                    onPointerDown={() => {
                      keepOpenOnSelectRef.current = true;
                      setModelMenuOpen(true);
                    }}
                  >
                    <span className="block pr-10 text-sm font-normal text-[var(--color-text-primary)] text-left truncate">Auto</span>
                    <span className="absolute right-2 top-[55%] -translate-y-1/2">
                      <Switch
                        size="sm"
                        checked={model === "auto"}
                        onChange={() => setModel("auto")}
                      />
                    </span>
                  </SelectItem>

                  <SelectItem
                    value="fast"
                    textValue="Fast"
                    className="h-8 !py-1 !pl-3 !ps-0 !pe-0 rounded-[var(--radius-sm)] [&>span.absolute]:hidden"
                    onSelect={(e) => {
                      e.preventDefault();
                      keepOpenOnSelectRef.current = true;
                      setModel("fast");
                      setModelMenuOpen(true);
                    }}
                    onPointerDown={() => {
                      keepOpenOnSelectRef.current = true;
                      setModelMenuOpen(true);
                    }}
                  >
                    <span className="block pr-10 text-sm font-normal text-[var(--color-text-primary)] text-left truncate">Fast</span>
                    <span className="absolute right-2 top-[55%] -translate-y-1/2">
                      <Switch
                        size="sm"
                        checked={model === "fast"}
                        onChange={() => setModel("fast")}
                      />
                    </span>
                  </SelectItem>

                  <SelectItem
                    value="thinking"
                    textValue="Thinking"
                    className="h-8 !py-1 !pl-3 !ps-0 !pe-0 rounded-[var(--radius-sm)] [&>span.absolute]:hidden"
                    onSelect={(e) => {
                      e.preventDefault();
                      keepOpenOnSelectRef.current = true;
                      setModel("thinking");
                      setModelMenuOpen(true);
                    }}
                    onPointerDown={() => {
                      keepOpenOnSelectRef.current = true;
                      setModelMenuOpen(true);
                    }}
                  >
                    <span className="block pr-10 text-sm font-normal text-[var(--color-text-primary)] text-left truncate">Thinking</span>
                    <span className="absolute right-2 top-[55%] -translate-y-1/2">
                      <Switch
                        size="sm"
                        checked={model === "thinking"}
                        onChange={() => setModel("thinking")}
                      />
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              {/* Speaker (no outline; only hover/active) */}
              <label className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-[var(--radius-md)] border-0 bg-transparent hover:bg-[var(--color-bg-hover)] active:bg-[var(--color-bg-hover)] active:scale-[0.98] transition-colors">
                <input type="file" accept="audio/*" className="hidden" />
                <Mic className="h-4 w-4 text-[var(--color-text-muted)]" />
              </label>

              {/* Send / Stop */}
              <Button
                type={isStreaming ? "button" : "submit"}
                size="sm"
                onClick={isStreaming ? handleStop : undefined}
                disabled={!isStreaming && !message.trim()}
                className="relative h-10 w-10 rounded-[var(--radius-md)] active:scale-[0.98] overflow-hidden"
                variant="default"
              >
                {/* Send icon — fades out when streaming */}
                <span
                  className="absolute inset-0 flex items-center justify-center transition-all duration-200"
                  style={{ opacity: isStreaming ? 0 : 1, transform: isStreaming ? 'scale(0.6)' : 'scale(1)' }}
                >
                  <Send className="h-4 w-4 text-white" />
                </span>
                {/* Stop icon — fades in when streaming */}
                <span
                  className="absolute inset-0 flex items-center justify-center transition-all duration-200"
                  style={{ opacity: isStreaming ? 1 : 0, transform: isStreaming ? 'scale(1)' : 'scale(0.6)' }}
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </span>
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AssistantChatPanel;
