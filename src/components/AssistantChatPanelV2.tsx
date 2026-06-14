"use client";

import {
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { Image as ImageIcon, Mic, Send, Square, X, Copy, ThumbsUp, ThumbsDown, RefreshCw, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/Input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { revealScrollbarWhileScrolling } from "@/lib/scrollbarReveal";
import { ChatThreadAtmospherePlates } from "@/components/chat/ChatThreadAtmospherePlates";
import {
  AssistantChatPanelNavRail,
  ASSISTANT_CHAT_NAV_CHROME_GAP_PX,
  ASSISTANT_CHAT_SHELL_RADIUS_CLASS,
  ASSISTANT_CHAT_SHELL_STYLE,
} from "@/components/chat/AssistantChatPanelNavRail";
import {
  ASSISTANT_CHAT_GENERAL_ID,
  buildCardThreadIntroMessages,
  isGeneralChatDestination,
  parseCardIdFromDestination,
} from "@/components/chat/assistantChatDestinations";
import { useCardsState } from "@/features/dashboard/cards/layouts/CardsGrid/hooks";
import { buildCardChatRequestBody } from "@/lib/chatByok";
import {
  fetchCardChatHistory,
  mapCardApiMessagesToThread,
} from "@/components/chat/assistantChatThreadPersistence";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import * as ChatConfirmRadix from "@radix-ui/react-dialog";

// Format timestamp to small time string (e.g., "1:51 PM")
const formatTime = (timestamp?: number) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
};
/** Icon row: no `opacity-*` / `transition-opacity` on buttons - Chromium + blur stacks often “stick” :hover on opacity layers. Use color alpha + hover:text only; hover gated to real hover devices. */
const messageActionBtn =
  "p-1 rounded touch-manipulation outline-none transition-[color] duration-150 [-webkit-tap-highlight-color:transparent] " +
  "text-[color-mix(in_srgb,var(--color-text-muted)_45%,transparent)] " +
  "[@media(hover:hover)]:hover:text-[var(--color-text-primary)] " +
  "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/40 focus-visible:ring-offset-0";

/** Timestamp + actions: hidden until hover (fine pointer) or tap-to-toggle (`openMessageMetaId`). Visibility on wrapper only - no opacity transitions (avoids blur-stack glitches). */
const messageMetaRevealBase =
  "flex items-center gap-2 invisible pointer-events-none " +
  "[@media(hover:hover)]:group-hover/msg:visible [@media(hover:hover)]:group-hover/msg:pointer-events-auto " +
  "focus-within:visible focus-within:pointer-events-auto";

/** Same timing as header live dot - keeps thread label indicator in phase with subtitle pulse. */
const NURO_ASSISTANT_DOT_LIVE =
  "h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-success)] [animation:var(--animate-live-breathe)]";
const NURO_ASSISTANT_DOT_DEMO =
  "h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)] animate-pulse";

const MessageActions = ({
  onCopy,
  onRefresh,
  showRating,
}: {
  onCopy?: () => void;
  onRefresh?: () => void;
  showRating: boolean;
}) => {
  const [copied, setCopied] = useState(false);
  const [rating, setRating] = useState<'up' | 'down' | null>(null);

  const handleCopy = (e: MouseEvent<HTMLButtonElement>) => {
    onCopy?.();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
 // Pointer clicks only: blur so :focus doesn’t stack with stuck :hover near glass layers; keep focus for keyboard activation (detail 0).
    if (e.detail > 0) {
      queueMicrotask(() => e.currentTarget.blur());
    }
  };

  return (
    <div className="flex items-center gap-1 bg-transparent">
      <button
        onClick={handleCopy}
        type="button"
        className={cn(
          messageActionBtn,
          copied && "text-[var(--color-success)] [@media(hover:hover)]:hover:text-[var(--color-success)]"
        )}
        aria-label="Copy message"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5" strokeWidth={2} />
        ) : (
          <Copy className="w-3.5 h-3.5" strokeWidth={2} />
        )}
      </button>
      {showRating ? (
        <>
          <button
            onClick={() => setRating(rating === 'up' ? null : 'up')}
            type="button"
            className={cn(messageActionBtn, rating === 'up' && "text-[var(--color-primary)] [@media(hover:hover)]:hover:text-[var(--color-primary)]")}
            aria-label="Thumbs up"
          >
            <ThumbsUp
              className="w-3.5 h-3.5"
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
            type="button"
            className={cn(messageActionBtn, rating === 'down' && "text-[var(--color-primary)] [@media(hover:hover)]:hover:text-[var(--color-primary)]")}
            aria-label="Thumbs down"
          >
            <ThumbsDown
              className="w-3.5 h-3.5"
              style={{
                stroke: rating === 'down' ? "var(--color-primary)" : "currentColor",
                strokeOpacity: rating === 'down' ? 0.5 : 1,
                fill: rating === 'down' ? "var(--color-primary)" : "none",
                fillOpacity: rating === 'down' ? 0.5 : 0
              }}
            />
          </button>
        </>
      ) : null}
      {onRefresh ? (
        <button
          onClick={onRefresh}
          type="button"
          className={messageActionBtn}
          aria-label="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
};

interface AssistantChatPanelProps {
  onClose?: () => void;
}

type ChatRole = "user" | "assistant";
type ChatStatus = "pending" | "timed_out" | "sent";
type ProviderMode = "demo" | "openai" | "anthropic" | "gemini";
type ByokProvider = "openai" | "anthropic" | "gemini";
type ModelTier = "fast" | "smart";
type KeyHealth = "not_set" | "connected" | "invalid" | "rate_limited";

function byokVendorLabel(provider: ByokProvider): string {
  if (provider === "openai") return "OpenAI";
  if (provider === "anthropic") return "Anthropic";
  return "Gemini";
}

/** Runs before first paint when BYOK intro should show - same rules as post-hydration gate. */
function sanitizeByokLocalStorage() {
  if (typeof window === "undefined") return;
  const oa = window.localStorage.getItem("nuro.chat.key.openai")?.trim() ?? "";
  if (oa && !oa.startsWith("sk-") && oa !== "1234") {
    window.localStorage.removeItem("nuro.chat.key.openai");
    window.localStorage.removeItem("nuro.chat.byok.commit.openai");
  }
  const ant = window.localStorage.getItem("nuro.chat.key.anthropic")?.trim() ?? "";
  if (ant && !ant.startsWith("sk-ant")) {
    window.localStorage.removeItem("nuro.chat.key.anthropic");
    window.localStorage.removeItem("nuro.chat.byok.commit.anthropic");
  }
  const gm = window.localStorage.getItem("nuro.chat.key.gemini")?.trim() ?? "";
  if (gm === "1234" || /^\d{3,12}$/.test(gm)) {
    window.localStorage.removeItem("nuro.chat.key.gemini");
    window.localStorage.removeItem("nuro.chat.byok.commit.gemini");
  }
  const committed = (p: ByokProvider) =>
    window.localStorage.getItem(`nuro.chat.byok.commit.${p}`) === "1";
  if (!committed("openai")) window.localStorage.removeItem("nuro.chat.key.openai");
  if (!committed("anthropic")) window.localStorage.removeItem("nuro.chat.key.anthropic");
  if (!committed("gemini")) window.localStorage.removeItem("nuro.chat.key.gemini");
}

function readInitialByokIntroMount(): { keysModalOpen: boolean; byokEntryCascadeKey: number } {
  if (typeof window === "undefined") return { keysModalOpen: false, byokEntryCascadeKey: 0 };
  sanitizeByokLocalStorage();
  let introDismissedThisVisit = false;
  try {
    introDismissedThisVisit =
      sessionStorage.getItem("nuro.chat.byok.dismissedThisLayoutVisit") === "1";
  } catch {
    introDismissedThisVisit = false;
  }
  const hasCommittedByokKey =
    (!!window.localStorage.getItem("nuro.chat.key.openai") &&
      window.localStorage.getItem("nuro.chat.byok.commit.openai") === "1") ||
    (!!window.localStorage.getItem("nuro.chat.key.anthropic") &&
      window.localStorage.getItem("nuro.chat.byok.commit.anthropic") === "1") ||
    (!!window.localStorage.getItem("nuro.chat.key.gemini") &&
      window.localStorage.getItem("nuro.chat.byok.commit.gemini") === "1");
  if (!introDismissedThisVisit && !hasCommittedByokKey) {
    return { keysModalOpen: true, byokEntryCascadeKey: 1 };
  }
  return { keysModalOpen: false, byokEntryCascadeKey: 0 };
}

/** Shared easing - BYOK overlay scrim */
const BYOK_MODAL_EASE = [0.33, 1, 0.68, 1] as const;

/**
 * Shell max-width/height - CSS only when stepping entry → keys (no Framer `layout` on card).
 */
const BYOK_CARD_LAYOUT_TWEEN = {
  type: "tween" as const,
  duration: 0.48,
  ease: [0.22, 0.9, 0.28, 1] as const,
};
const BYOK_SHELL_TRANSITION_MS = Math.round(BYOK_CARD_LAYOUT_TWEEN.duration * 1000);
const BYOK_SHELL_TRANSITION_CSS = `${BYOK_SHELL_TRANSITION_MS}ms cubic-bezier(0.22, 0.9, 0.28, 1)`;

const BYOK_OVERLAY_OPEN_DURATION = 0.38;

/** Keys sheet: ~1.25s total; intro/success reuse same stagger + row duration (fewer rows = shorter total). */
const BYOK_CASCADE_TOTAL_S = 1.25;
const BYOK_CASCADE_ROW_DURATION = 0.3;
/** Title, subtitle, three provider blocks (icon+row+field each), Continue - one stagger slot per block. */
const BYOK_CASCADE_KEYS_ROW_COUNT = 6;
const BYOK_CASCADE_STAGGER =
  (BYOK_CASCADE_TOTAL_S - BYOK_CASCADE_ROW_DURATION) / (BYOK_CASCADE_KEYS_ROW_COUNT - 1);

const BYOK_MODAL_CONTAINER_VARIANTS = {
  hidden: { clipPath: "inset(0% 0% 100% 0%)" },
  visible: {
    clipPath: "inset(0% 0% 0% 0%)",
    transition: {
      clipPath: { duration: BYOK_OVERLAY_OPEN_DURATION, ease: BYOK_MODAL_EASE },
      delayChildren: 0,
      staggerChildren: BYOK_CASCADE_STAGGER,
    },
  },
};

const BYOK_MODAL_LAYER_VARIANTS = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: 0,
      staggerChildren: BYOK_CASCADE_STAGGER,
    },
  },
};

const BYOK_MODAL_CASCADE_VARIANTS = {
  hidden: { opacity: 0, y: -10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: BYOK_CASCADE_ROW_DURATION, ease: BYOK_MODAL_EASE },
  },
};

/** Blur must not sit under an opacity tween - Chromium composites backdrop-filter late. */
const BYOK_GLASS_SURFACE_STYLE: CSSProperties = {
  WebkitBackdropFilter: "blur(var(--glass-blur-modal))",
  backdropFilter: "blur(var(--glass-blur-modal))",
 /** Own compositor layer so blur is not gated on a parent's opacity tween. */
  transform: "translateZ(0)",
};

const OPENAI_FAST_LABEL = "GPT-5.5 Fast";
const OPENAI_SMART_LABEL = "GPT-5.5 Smarter";
const ANTHROPIC_FAST_LABEL = "Haiku 4.5";
const ANTHROPIC_SMART_LABEL = "Opus 4.7";
const GEMINI_FAST_LABEL = "Gemini Flash 3";
const GEMINI_SMART_LABEL = "Gemini Pro 3.1";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  status?: ChatStatus; // assistant only
  originalText?: string; // assistant only
  attempt?: number; // assistant only
  timestamp?: number; // unix timestamp
};

const COPILOT_INTRO =
  "This is your copilot chat. Ask anything about your cards, transactions, yield strategies and more.";

/** Single assistant line shown after BYOK is committed (or on load with keys). */
function buildCopilotIntroOnlyMessages(): ChatMessage[] {
  return [
    {
      id: "intro-a1",
      role: "assistant",
      status: "sent",
      content: COPILOT_INTRO,
      timestamp: Date.now(),
    },
  ];
}

/** Demo scroll thread when no persisted BYOK keys. */
function buildAssistantDemoMessages(): ChatMessage[] {
  const t = Date.now();
  return [
    {
      id: "intro-a1",
      role: "assistant",
      status: "sent",
      content: COPILOT_INTRO,
      timestamp: t,
    },
    {
      id: "dummy-u1",
      role: "user",
      content: "Show me a summary of my recent activity. Keep it concise.",
      timestamp: t,
    },
    {
      id: "dummy-a1",
      role: "assistant",
      status: "sent",
      content:
        "Sure. Your recent activity shows steady inflows and a few recurring transfers. If you want, I can highlight any anomalies and summarize totals by category.",
      timestamp: t,
    },
    {
      id: "dummy-u2",
      role: "user",
      content: "What changed most since last week? Give me 2-3 bullets.",
      timestamp: t,
    },
    {
      id: "dummy-a2",
      role: "assistant",
      status: "sent",
      content:
        "In the last week:\n• average transfer size increased slightly\n• you had one larger transaction that stands out\n• activity frequency stayed fairly consistent",
      timestamp: t,
    },
    {
      id: "dummy-u3",
      role: "user",
      content: "Flag any unusual transactions and explain why they might be unusual.",
      timestamp: t,
    },
    {
      id: "dummy-a3",
      role: "assistant",
      status: "sent",
      content:
        "I flagged a couple of transactions that deviate from your typical size/timing. These can be unusual due to one-off payments, batch transfers, or different recipient patterns. If you share what you were expecting, I can label them more accurately.",
      timestamp: t,
    },
    {
      id: "dummy-u4",
      role: "user",
      content: "Can you estimate my spending on cards for the last 30 days?",
      timestamp: t,
    },
    {
      id: "dummy-a4",
      role: "assistant",
      status: "sent",
      content:
        "Yes. I can estimate card spending by aggregating transaction totals and normalizing for any refunds. For best accuracy, I’ll treat refunds as negative outflows and split by merchant group.",
      timestamp: t,
    },
    {
      id: "dummy-u5",
      role: "user",
      content: "I want recommendations: 1) reduce fees 2) increase yield. Keep it actionable.",
      timestamp: t,
    },
    {
      id: "dummy-a5",
      role: "assistant",
      status: "sent",
      content:
        "Action plan:\n• reduce fees by batching transfers and avoiding unnecessary conversions\n• increase yield by rotating into higher-performing strategies while monitoring risk limits\n• set alerts for when rates change",
      timestamp: t,
    },
    {
      id: "dummy-u6",
      role: "user",
      content:
        "Longer test message to force scroll behavior. Tell me about everything you can do with my wallet and transactions, and be specific about what information you need from me.",
      timestamp: t,
    },
    {
      id: "dummy-a6",
      role: "assistant",
      status: "sent",
      content:
        "I can:\n• summarize spending\n• categorize transactions\n• detect outliers\n• suggest optimizations\n• draft step-by-step plans\nTo be specific, I’d need your preferred categories, any known one-off events, and your risk tolerance for yield strategies.",
      timestamp: t,
    },
    {
      id: "dummy-u7",
      role: "user",
      content: "Last one: show me a quick recap again, and then stop.",
      timestamp: t,
    },
    {
      id: "dummy-a7",
      role: "assistant",
      status: "sent",
      content:
        "Recap: steady recent inflows, a small number of notable transactions, and opportunities to optimize fees and improve yield. If you want, ask for a category split and I’ll generate it.",
      timestamp: t,
    },
  ];
}

type ProviderKeyState = {
  key: string;
  health: KeyHealth;
 /** Server message when verification fails */
  verifyMessage?: string;
};

const BYOK_ICON_GPT = "/GPT%20App%20Icon.svg";
const BYOK_ICON_CLAUDE = "/Claude%20App%20Icon.svg";
/** Official Gemini icon asset (Wikimedia Commons: Google Gemini icon 2025), wrapped to 34×34 tile to match other BYOK icons. */
const BYOK_ICON_GEMINI = "/Gemini%20App%20Icon.svg";

/** Left of Test: “Verifying…”, then valid / invalid - never duplicates the Test control. */
function ByokVerifyStatusSlot({
  provider,
  verifyBusy,
  feedback,
}: {
  provider: ByokProvider;
  verifyBusy: ByokProvider | null;
  feedback: "valid" | "invalid" | undefined;
}) {
  const busy = verifyBusy === provider;
  const visible = busy || feedback !== undefined;
  if (!visible) return null;

  return (
    <div
      className="pointer-events-none flex min-h-[14px] min-w-[6.75rem] max-w-[min(48%,9.5rem)] shrink-0 flex-col items-end justify-center"
      aria-live="polite"
    >
      <AnimatePresence mode="wait" initial={false}>
        {busy ? (
          <motion.span
            key={`${provider}-testing`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.33, 1, 0.68, 1] }}
            className="text-right text-[10px] font-medium leading-none text-[var(--color-text-muted)]"
          >
            Verifying…
          </motion.span>
        ) : feedback === "invalid" ? (
          <motion.span
            key={`${provider}-invalid`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.33, 1, 0.68, 1] }}
            className="min-w-0 text-right text-[10px] font-medium leading-none text-[var(--color-error)]"
          >
            API key not valid.
          </motion.span>
        ) : (
          <motion.span
            key={`${provider}-valid`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.33, 1, 0.68, 1] }}
            className="min-w-0 text-right text-[10px] font-medium leading-none text-[var(--color-success)]"
          >
            API key valid
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

type ChatPanelConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
 /** Portals into this node so overlay/content stay inside the chat panel (must be `position: relative`). */
  portalContainer: HTMLElement | null;
  title: string;
  description: string;
  onConfirm: () => void;
  cancelLabel?: string;
  confirmLabel?: string;
};

/** In-panel confirm: absolute positioning + Portal container = clipped to chat panel, not full viewport. */
function ChatPanelConfirmDialog({
  open,
  onOpenChange,
  portalContainer,
  title,
  description,
  onConfirm,
  cancelLabel = "No",
  confirmLabel = "Yes",
}: ChatPanelConfirmDialogProps) {
  if (!portalContainer) return null;

  return (
    <ChatConfirmRadix.Root open={open} onOpenChange={onOpenChange}>
      <ChatConfirmRadix.Portal container={portalContainer}>
        <ChatConfirmRadix.Overlay className="chat-panel-confirm-overlay absolute inset-0 z-[90] bg-black/45" />
        <ChatConfirmRadix.Content
          className="chat-panel-confirm-content absolute left-1/2 top-1/2 z-[91] w-[min(260px,calc(100%-2rem))] max-w-full rounded-[16px] border border-[var(--color-border-glass)] bg-[var(--color-bg-glass)] px-5 py-5 shadow-[0_16px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl focus:outline-none"
          style={{ WebkitBackdropFilter: "blur(25px)", backdropFilter: "blur(25px)" }}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex w-full flex-col text-left">
            <ChatConfirmRadix.Title className="text-[17px] font-semibold leading-snug tracking-tight text-[var(--color-text-primary)]">
              {title}
            </ChatConfirmRadix.Title>
            <ChatConfirmRadix.Description className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-text-muted)]">
              {description}
            </ChatConfirmRadix.Description>
            <div className="mt-5 flex w-full items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex-1 rounded-[10px] border border-white/20 bg-transparent px-3 py-2 text-[13px] font-medium text-[var(--color-text-primary)] transition-all hover:bg-white/5"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => {
                  onConfirm();
                  onOpenChange(false);
                }}
                className="flex-1 rounded-[10px] border border-white/10 bg-white/10 px-3 py-2 text-[13px] font-semibold text-[var(--color-text-primary)] transition-all hover:bg-white/[0.14]"
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </ChatConfirmRadix.Content>
      </ChatConfirmRadix.Portal>
    </ChatConfirmRadix.Root>
  );
}

/**
 * Chat panel v2 - scroll region has NO CSS mask (avoids Chromium mask+hover glitches).
 * Top/bottom fade uses gradient plates (pointer-events none). Composer is clipped with overflow-hidden.
 */
export function AssistantChatPanelV2({ onClose }: AssistantChatPanelProps) {
  const { data: session } = useSession();
  const accessToken = (session as { accessToken?: string } | null)?.accessToken ?? null;
  const [chatPanelRootEl, setChatPanelRootEl] = useState<HTMLDivElement | null>(null);
  const [message, setMessage] = useState("");
 /** Tap-to-show meta on touch / coarse pointer (hover alone is unreliable). */
  const [openMessageMetaId, setOpenMessageMetaId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const [composerHeight, setComposerHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '40px';
      if (message) {
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 100)}px`;
      }
    }
  }, [message]);

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;

    const measure = () => setComposerHeight(el.getBoundingClientRect().height);
    measure();

 // Keep scroll padding in sync with textarea growth and responsive layout.
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => setHeaderHeight(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const [model, setModel] = useState<ProviderMode>("demo");
  const [openAi, setOpenAi] = useState<ProviderKeyState>({ key: "", health: "not_set" });
  const [anthropic, setAnthropic] = useState<ProviderKeyState>({ key: "", health: "not_set" });
  const [gemini, setGemini] = useState<ProviderKeyState>({ key: "", health: "not_set" });
  const [byokIntroMount] = useState(() => readInitialByokIntroMount());
  const [keysModalOpen, setKeysModalOpen] = useState(byokIntroMount.keysModalOpen);
 /** Bumped when the entry card should replay its stagger (modal session that lands on entry). */
  const [byokEntryCascadeKey, setByokEntryCascadeKey] = useState(byokIntroMount.byokEntryCascadeKey);
 /** Bumped when the keys form should replay its stagger (Connect API open, entry → keys). */
  const [byokKeysCascadeKey, setByokKeysCascadeKey] = useState(0);
 /** Remount shell reveal + cascade when overlay opens from closed or keys sheet replays. */
  const [byokShellSessionKey, setByokShellSessionKey] = useState(0);
  const prevKeysModalOpenRef = useRef(false);

  useLayoutEffect(() => {
    if (keysModalOpen) {
      if (!prevKeysModalOpenRef.current) {
        setByokShellSessionKey((k) => k + 1);
      }
      prevKeysModalOpenRef.current = true;
    } else {
      prevKeysModalOpenRef.current = false;
    }
  }, [keysModalOpen]);

 /** When true, `setKeysPage("entry")` / success reset wait until BYOK overlay exit finishes - keeps scrim + card one surface while fading. */
  const byokOverlayClosePendingRef = useRef(false);
  const [disconnectAllConfirmOpen, setDisconnectAllConfirmOpen] = useState(false);
 /** Turning off the active live tier switch → demo; confirm before `setModel("demo")`. */
  const [switchToDemoConfirmOpen, setSwitchToDemoConfirmOpen] = useState(false);
  const [keysPage, setKeysPage] = useState<"entry" | "keys" | "keys-success">("entry");
 /** Shown on the post-commit success pane (same modal shell). */
  const [byokSuccessContext, setByokSuccessContext] = useState<{
    provider: ByokProvider;
  } | null>(null);
 /** First-ever BYOK commit: apply live intro when the success sheet closes (Start chatting or backdrop). */
  const byokNeedsIntroAfterSuccessRef = useRef(false);
  const [fallbackToDemo, setFallbackToDemo] = useState(true);
  const [verifyBusy, setVerifyBusy] = useState<ByokProvider | null>(null);
 /** Blocks overlapping Test clicks; avoids disabling all BYOK rows (ghost `disabled:opacity-50` would flash every row). */
  const byokVerifyInFlightRef = useRef(false);
 /** Increment on disconnect / modal close so late verify responses never repopulate feedback or fight empty inputs. */
  const byokVerifySessionRef = useRef(0);

 /** Ephemeral row message beside Test; cleared after `BYOK_VERIFY_FEEDBACK_MS` so the modal height stays stable. */
  const BYOK_VERIFY_FEEDBACK_MS = 10_000;
  const [byokVerifyFeedback, setByokVerifyFeedback] = useState<
    Partial<Record<ByokProvider, "valid" | "invalid">>
  >({});
 // window.setTimeout returns `number` in browsers; the ref is typed to that
 // (not Node's Timeout) since this component is "use client" only.
  const byokVerifyFeedbackTimersRef = useRef<
    Partial<Record<ByokProvider, number>>
  >({});

  const clearByokVerifyFeedbackTimer = (provider: ByokProvider) => {
    const t = byokVerifyFeedbackTimersRef.current[provider];
    if (t) {
      window.clearTimeout(t);
      delete byokVerifyFeedbackTimersRef.current[provider];
    }
  };

  const clearByokVerifyFeedbackRow = (provider: ByokProvider) => {
    clearByokVerifyFeedbackTimer(provider);
    setByokVerifyFeedback((prev) => {
      if (prev[provider] === undefined) return prev;
      const next = { ...prev };
      delete next[provider];
      return next;
    });
  };

  const clearAllByokVerifyFeedback = () => {
    (["openai", "anthropic", "gemini"] as const).forEach((p) => clearByokVerifyFeedbackTimer(p));
    setByokVerifyFeedback({});
  };

  const clearByokVerifyFeedbackForOthers = (except: ByokProvider) => {
    (["openai", "anthropic", "gemini"] as const).forEach((p) => {
      if (p === except) return;
      clearByokVerifyFeedbackTimer(p);
    });
    setByokVerifyFeedback((prev) => {
      const v = prev[except];
      return v !== undefined ? { [except]: v } : {};
    });
  };

  const scheduleByokVerifyFeedback = (provider: ByokProvider, kind: "valid" | "invalid") => {
    clearByokVerifyFeedbackTimer(provider);
    setByokVerifyFeedback((prev) => ({ ...prev, [provider]: kind }));
    byokVerifyFeedbackTimersRef.current[provider] = window.setTimeout(() => {
      clearByokVerifyFeedbackTimer(provider);
      setByokVerifyFeedback((prev) => {
        if (prev[provider] !== kind) return prev;
        const next = { ...prev };
        delete next[provider];
        return next;
      });
      if (kind === "invalid") {
        if (provider === "openai") {
          setOpenAi((p) => (p.health === "invalid" ? { ...p, health: "not_set", verifyMessage: undefined } : p));
        } else if (provider === "anthropic") {
          setAnthropic((p) => (p.health === "invalid" ? { ...p, health: "not_set", verifyMessage: undefined } : p));
        } else {
          setGemini((p) => (p.health === "invalid" ? { ...p, health: "not_set", verifyMessage: undefined } : p));
        }
      }
    }, BYOK_VERIFY_FEEDBACK_MS);
  };

  useEffect(() => {
    return () => {
      (["openai", "anthropic", "gemini"] as const).forEach((p) => {
        const t = byokVerifyFeedbackTimersRef.current[p];
        if (t) window.clearTimeout(t);
      });
    };
  }, []);

 // Native 1:1 Header Scroll Tracking
  const headerRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const HEADER_TOP_PX = 16; // `top-4`
  const HEADER_HIDE_EXTRA_PX = 24; // ensure no peeking due to blur/radius

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    revealScrollbarWhileScrolling(e.currentTarget);
    const currentScrollY = e.currentTarget.scrollTop;
    const maxOffset = Math.max(0, headerHeight + HEADER_TOP_PX + HEADER_HIDE_EXTRA_PX);
 // Drive header position directly from scrollTop to avoid drift/peeking.
    const newOffset = Math.max(0, Math.min(currentScrollY, maxOffset));

    if (newOffset !== offsetRef.current) {
      offsetRef.current = newOffset;
      if (headerRef.current) {
        headerRef.current.style.transform = `translateY(-${newOffset}px)`;
        const denom = Math.max(1, maxOffset * 0.85);
        headerRef.current.style.opacity = `${Math.max(0, 1 - newOffset / denom)}`;
      }
    }
  };
 /** Key material in LS; `byokCommitSaved` is set only on Save/Continue - Test never sets it. */
  const lsByokKey = (storageKey: string) =>
    typeof window !== "undefined" ? window.localStorage.getItem(storageKey)?.trim() ?? "" : "";

  const byokCommitSaved = (p: ByokProvider) =>
    typeof window !== "undefined" && window.localStorage.getItem(`nuro.chat.byok.commit.${p}`) === "1";

  const hasPersistedOpenAi =
    openAi.health === "connected" &&
    !!openAi.key.trim() &&
    openAi.key.trim() === lsByokKey("nuro.chat.key.openai") &&
    byokCommitSaved("openai");
  const hasPersistedAnthropic =
    anthropic.health === "connected" &&
    !!anthropic.key.trim() &&
    anthropic.key.trim() === lsByokKey("nuro.chat.key.anthropic") &&
    byokCommitSaved("anthropic");
  const hasPersistedGemini =
    gemini.health === "connected" &&
    !!gemini.key.trim() &&
    gemini.key.trim() === lsByokKey("nuro.chat.key.gemini") &&
    byokCommitSaved("gemini");

  const hasConnectedProvider = hasPersistedOpenAi || hasPersistedAnthropic || hasPersistedGemini;

 /** BYOK keys sheet - same rule as hasPersisted*: LS key match + commit flag. */
  const lsPersistedOpenAiKey = lsByokKey("nuro.chat.key.openai");
  const lsPersistedAnthropicKey = lsByokKey("nuro.chat.key.anthropic");
  const lsPersistedGeminiKey = lsByokKey("nuro.chat.key.gemini");
 /** Committed LS key matches this row’s input - show Clear (removes persisted key + drops live model to demo when it was active). */
  const showByokModalClearOpenAi =
    lsPersistedOpenAiKey.length > 0 &&
    openAi.key.trim() === lsPersistedOpenAiKey &&
    byokCommitSaved("openai");
  const showByokModalClearAnthropic =
    lsPersistedAnthropicKey.length > 0 &&
    anthropic.key.trim() === lsPersistedAnthropicKey &&
    byokCommitSaved("anthropic");
  const showByokModalClearGemini =
    lsPersistedGeminiKey.length > 0 &&
    gemini.key.trim() === lsPersistedGeminiKey &&
    byokCommitSaved("gemini");
 /** Persisted keys + user picked a live provider - drives tier menu, header “Live”, etc. Demo mode always uses the demo shell even if keys remain in storage. */
  const isLiveByokMode = hasConnectedProvider && model !== "demo";
 /** Single stored BYOK key - which vendor is connected (persisted). */
  const connectedByokVendor: ByokProvider | null = hasPersistedOpenAi
    ? "openai"
    : hasPersistedAnthropic
      ? "anthropic"
      : hasPersistedGemini
        ? "gemini"
        : null;

  const [openaiModelTier, setOpenaiModelTier] = useState<ModelTier>("fast");
  const [anthropicModelTier, setAnthropicModelTier] = useState<ModelTier>("fast");
  const [geminiModelTier, setGeminiModelTier] = useState<ModelTier>("fast");

  const composerModelDetailLabel = useMemo(() => {
    if (model === "demo") return "Demo";
    if (model === "openai") return openaiModelTier === "fast" ? OPENAI_FAST_LABEL : OPENAI_SMART_LABEL;
    if (model === "anthropic") return anthropicModelTier === "fast" ? ANTHROPIC_FAST_LABEL : ANTHROPIC_SMART_LABEL;
    return geminiModelTier === "fast" ? GEMINI_FAST_LABEL : GEMINI_SMART_LABEL;
  }, [model, openaiModelTier, anthropicModelTier, geminiModelTier]);

  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  const byokHasUncommittedVerified =
    (openAi.health === "connected" && !hasPersistedOpenAi) ||
    (anthropic.health === "connected" && !hasPersistedAnthropic) ||
    (gemini.health === "connected" && !hasPersistedGemini);

  const byokKeysPrimaryIsContinue = useMemo(() => {
    if (typeof window === "undefined" || !keysModalOpen || keysPage !== "keys") return false;
    const hadAnyPersistedKey =
      !!window.localStorage.getItem("nuro.chat.key.openai") ||
      !!window.localStorage.getItem("nuro.chat.key.anthropic") ||
      !!window.localStorage.getItem("nuro.chat.key.gemini");
    return hadAnyPersistedKey && !byokHasUncommittedVerified;
  }, [
    keysModalOpen,
    keysPage,
    byokHasUncommittedVerified,
    hasPersistedOpenAi,
    hasPersistedAnthropic,
    hasPersistedGemini,
  ]);

  useLayoutEffect(() => {
    sanitizeByokLocalStorage();

 // Legacy "auto" mode was deprecated; cast through string lets us match it
 // for migration without widening the ProviderMode type.
    const savedMode = window.localStorage.getItem("nuro.chat.mode") as string | null;
    const savedOpenAi = window.localStorage.getItem("nuro.chat.key.openai");
    const savedAnthropic = window.localStorage.getItem("nuro.chat.key.anthropic");
    const savedGemini = window.localStorage.getItem("nuro.chat.key.gemini");

    if (savedMode === "auto") {
      setModel("demo");
      window.localStorage.setItem("nuro.chat.mode", "demo");
    } else if (savedMode && ["demo", "openai", "anthropic", "gemini"].includes(savedMode)) {
      if (
        (savedMode === "openai" && !savedOpenAi) ||
        (savedMode === "anthropic" && !savedAnthropic) ||
        (savedMode === "gemini" && !savedGemini)
      ) {
        setModel("demo");
        window.localStorage.setItem("nuro.chat.mode", "demo");
      } else if (
        savedMode === "demo" &&
        (savedOpenAi || savedAnthropic || savedGemini)
      ) {
 /** Mode left on demo after BYOK commit - align with committed vendor so live UI shows. */
        const oaC = !!savedOpenAi && window.localStorage.getItem("nuro.chat.byok.commit.openai") === "1";
        const antC = !!savedAnthropic && window.localStorage.getItem("nuro.chat.byok.commit.anthropic") === "1";
        const gemC = !!savedGemini && window.localStorage.getItem("nuro.chat.byok.commit.gemini") === "1";
        const next: ProviderMode = oaC ? "openai" : antC ? "anthropic" : gemC ? "gemini" : "demo";
        setModel(next);
        if (next !== "demo") window.localStorage.setItem("nuro.chat.mode", next);
      } else {
 // savedMode is narrowed by the .includes() guard above; the cast
 // re-asserts that to satisfy TS after we widened the load to string.
        setModel(savedMode as ProviderMode);
      }
    }

 /** After stripUncommittedByokKeysFromLs, any remaining key has a matching commit flag. */
    if (savedOpenAi) {
      if (savedAnthropic) window.localStorage.removeItem("nuro.chat.key.anthropic");
      if (savedGemini) window.localStorage.removeItem("nuro.chat.key.gemini");
      setOpenAi({ key: savedOpenAi, health: "connected" });
    } else if (savedAnthropic) {
      if (savedGemini) window.localStorage.removeItem("nuro.chat.key.gemini");
      setAnthropic({ key: savedAnthropic, health: "connected" });
    } else if (savedGemini) {
      setGemini({ key: savedGemini, health: "connected" });
    }

 /** `nuro.chat.mode` missing or still demo while a committed key exists (e.g. legacy state). */
    {
      const m = window.localStorage.getItem("nuro.chat.mode") as ProviderMode | null;
      const oaC = !!savedOpenAi && window.localStorage.getItem("nuro.chat.byok.commit.openai") === "1";
      const antC = !!savedAnthropic && window.localStorage.getItem("nuro.chat.byok.commit.anthropic") === "1";
      const gemC = !!savedGemini && window.localStorage.getItem("nuro.chat.byok.commit.gemini") === "1";
      if ((m === "demo" || m === null) && (oaC || antC || gemC)) {
        const next: ProviderMode = oaC ? "openai" : antC ? "anthropic" : "gemini";
        setModel(next);
        window.localStorage.setItem("nuro.chat.mode", next);
      }
    }

    const tierOpenai = window.localStorage.getItem("nuro.chat.tier.openai");
    const tierAnthropic = window.localStorage.getItem("nuro.chat.tier.anthropic");
    const tierGemini = window.localStorage.getItem("nuro.chat.tier.gemini");
    if (tierOpenai === "fast" || tierOpenai === "smart") setOpenaiModelTier(tierOpenai);
    if (tierAnthropic === "fast" || tierAnthropic === "smart") setAnthropicModelTier(tierAnthropic);
    if (tierGemini === "fast" || tierGemini === "smart") setGeminiModelTier(tierGemini);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("nuro.chat.mode", model);
  }, [model]);

  useEffect(() => {
    window.localStorage.setItem("nuro.chat.tier.openai", openaiModelTier);
  }, [openaiModelTier]);
  useEffect(() => {
    window.localStorage.setItem("nuro.chat.tier.anthropic", anthropicModelTier);
  }, [anthropicModelTier]);
  useEffect(() => {
    window.localStorage.setItem("nuro.chat.tier.gemini", geminiModelTier);
  }, [geminiModelTier]);

  const { cards: dashboardCards } = useCardsState();
  const [activeDestinationId, setActiveDestinationId] = useState(ASSISTANT_CHAT_GENERAL_ID);
  const activeDestinationIdRef = useRef(ASSISTANT_CHAT_GENERAL_ID);
  const threadsByDestinationRef = useRef<Record<string, ChatMessage[]>>({});
  const cardHistoryFetchGenRef = useRef(0);

  const [messages, setMessages] = useState<ChatMessage[]>(() => buildAssistantDemoMessages());
  const assistantTimeoutsRef = useRef<Record<string, number>>({});
 // Per-message AbortController for live streaming so the Stop button cancels
 // the in-flight fetch instead of just hiding the pending bubble.
  const assistantAbortRef = useRef<Record<string, AbortController>>({});
 /** Tracks live-intro vs demo scroll transcript; kept aligned with `restoreDemoChatTranscript` / `applyLiveIntroChatTranscript`. */
  const liveTranscriptSyncedRef = useRef<boolean | null>(null);
  const clearAllAssistantTimeouts = () => {
    for (const id of Object.keys(assistantTimeoutsRef.current)) {
      window.clearTimeout(assistantTimeoutsRef.current[id]);
      delete assistantTimeoutsRef.current[id];
    }
  };

  const resolveDefaultThreadForDestination = (
    destinationId: string,
    live: boolean
  ): ChatMessage[] => {
    if (isGeneralChatDestination(destinationId)) {
      return live ? buildCopilotIntroOnlyMessages() : buildAssistantDemoMessages();
    }
    const cardId = parseCardIdFromDestination(destinationId);
    const card = dashboardCards.find((c) => c.id === cardId);
    return buildCardThreadIntroMessages(card?.id ?? cardId ?? "card", card?.cardName ?? "Card", live);
  };

  useEffect(() => {
    threadsByDestinationRef.current[activeDestinationIdRef.current] = messages;
  }, [messages]);

  const hydrateCardDestinationFromApi = async (destinationId: string, cardId: string) => {
    if (!accessToken) return;
    const gen = ++cardHistoryFetchGenRef.current;
    try {
      const rows = await fetchCardChatHistory(cardId, accessToken);
      if (cardHistoryFetchGenRef.current !== gen) return;
      if (activeDestinationIdRef.current !== destinationId) return;
      const thread =
        rows.length > 0
          ? mapCardApiMessagesToThread(rows)
          : resolveDefaultThreadForDestination(destinationId, true);
      threadsByDestinationRef.current[destinationId] = thread;
      setMessages(thread);
    } catch {
      if (activeDestinationIdRef.current !== destinationId) return;
      const fallback = resolveDefaultThreadForDestination(destinationId, true);
      threadsByDestinationRef.current[destinationId] = fallback;
      setMessages(fallback);
    }
  };

  const selectChatDestination = (destinationId: string) => {
    if (destinationId === activeDestinationId) return;
    clearAllAssistantTimeouts();
    setOpenMessageMetaId(null);
    threadsByDestinationRef.current[activeDestinationId] = messages;
    activeDestinationIdRef.current = destinationId;
    setActiveDestinationId(destinationId);

    const cardId = parseCardIdFromDestination(destinationId);
    if (cardId && accessToken) {
      const placeholder = resolveDefaultThreadForDestination(destinationId, true);
      threadsByDestinationRef.current[destinationId] = placeholder;
      setMessages(placeholder);
      void hydrateCardDestinationFromApi(destinationId, cardId);
      return;
    }

    const existing = threadsByDestinationRef.current[destinationId];
    if (existing) {
      setMessages(existing);
      return;
    }
    const initial = resolveDefaultThreadForDestination(destinationId, isLiveByokMode);
    threadsByDestinationRef.current[destinationId] = initial;
    setMessages(initial);
  };

  const activeChatHeader = useMemo(() => {
    if (isGeneralChatDestination(activeDestinationId)) {
      return {
        primary: "Nuro Intelligence",
        secondary: "Finance Agent · v2",
      };
    }
    const cardId = parseCardIdFromDestination(activeDestinationId);
    const card = dashboardCards.find((c) => c.id === cardId);
    const last4 = card?.cardNumber.replace(/\s/g, "").slice(-4);
    return {
      primary: card?.cardName ?? "Card",
      secondary: last4 ? `Card agent · •••• ${last4}` : "Card agent",
    };
  }, [activeDestinationId, dashboardCards]);

 /** Call only after the user commits keys (Save and continue), not on load or Continue dismiss. */
  const applyLiveIntroChatTranscript = () => {
    clearAllAssistantTimeouts();
    liveTranscriptSyncedRef.current = true;
    const intro = resolveDefaultThreadForDestination(activeDestinationId, true);
    threadsByDestinationRef.current[activeDestinationId] = intro;
    setMessages(intro);
  };

 /**
 * Full demo scroll thread - use only when explicitly requested (e.g. dev reset).
 * Never run on disconnect: users keep their real chat after connecting once.
 */
  const restoreDemoChatTranscript = () => {
    clearAllAssistantTimeouts();
    liveTranscriptSyncedRef.current = false;
    const demo = resolveDefaultThreadForDestination(activeDestinationId, false);
    threadsByDestinationRef.current[activeDestinationId] = demo;
    setMessages(demo);
  };

 /** Live connected UI uses single intro line on load / when entering live. Leaving live (disconnect) does not wipe messages. */
  useEffect(() => {
    if (isLiveByokMode) {
      if (liveTranscriptSyncedRef.current !== true) {
        clearAllAssistantTimeouts();
        const intro = buildCopilotIntroOnlyMessages();
        threadsByDestinationRef.current[ASSISTANT_CHAT_GENERAL_ID] = intro;
        if (isGeneralChatDestination(activeDestinationId)) {
          setMessages(intro);
        }
      }
      liveTranscriptSyncedRef.current = true;
    } else {
      liveTranscriptSyncedRef.current = false;
    }
  }, [isLiveByokMode, activeDestinationId]);

  const uid = () => {
 // Next/modern browsers generally have crypto; fallback for safety
    return globalThis.crypto?.randomUUID?.() ?? String(Math.random()).slice(2);
  };

  const resolveProviderForTurn = (): "demo" | "openai" | "anthropic" | "gemini" => {
    if (model === "demo") return "demo";
    if (model === "openai") return hasPersistedOpenAi ? "openai" : "demo";
    if (model === "anthropic") return hasPersistedAnthropic ? "anthropic" : "demo";
    if (model === "gemini") return hasPersistedGemini ? "gemini" : "demo";
    return "demo";
  };

 /**
 * Queue an assistant reply for `assistantId`. Two paths:
 *
 * - DEMO mode (`providerForTurn === "demo"`): canned response after 900ms.
 * Chris's original simulator preserved for the no-key experience.
 *
 * - LIVE mode (openai / anthropic / gemini): real streaming call to
 * `/api/chat` with the user's BYOK key + selected tier. Text deltas
 * accumulate into the message content as they arrive (true SSE
 * streaming). On error or no-key, optionally falls back to demo
 * when `fallbackToDemo` is on.
 *
 * `priorMessages` is the conversation history INCLUDING the just-added user
 * turn but EXCLUDING the pending assistant placeholder - caller computes it
 * before calling setMessages, since reading state from inside the callback
 * is racy.
 */
  const scheduleAssistant = (
    assistantId: string,
    originalText: string,
    attempt: number,
    providerForTurn: "demo" | "openai" | "anthropic" | "gemini",
    liveDisplayLabel: string,
    priorMessages: ChatMessage[] = []
  ) => {
 // === Demo path - unchanged from Chris's original ===
    if (providerForTurn === "demo") {
      const timeoutId = window.setTimeout(() => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  status: "sent",
                  content: `Demo response: I can help with “${originalText}” using your mock activity data.`,
                }
              : m
          )
        );
      }, 900);
      assistantTimeoutsRef.current[assistantId] = timeoutId;
      return;
    }

 // === Live path - real LLM streaming via /api/chat ===
    const apiKey =
      typeof window !== "undefined"
        ? window.localStorage.getItem(`nuro.chat.key.${providerForTurn}`)?.trim() ?? ""
        : "";
    const tier =
      providerForTurn === "openai"
        ? openaiModelTier
        : providerForTurn === "anthropic"
          ? anthropicModelTier
          : geminiModelTier;

    if (!apiKey) {
 // Key disappeared between turn-start and now - fallback to demo if allowed.
      const fallbackContent = fallbackToDemo
        ? `Demo fallback: ${liveDisplayLabel} key is no longer connected. Continuing in Demo Mode for this reply.`
        : "Live provider not connected. Add an API key in the keys panel.";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, status: "sent", content: fallbackContent } : m
        )
      );
      return;
    }

 // Build the API-shape message thread (only role + content). Skip system
 // turns and the pending assistant placeholder.
    const apiMessages = priorMessages
      .filter(
        (m) =>
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.length > 0
      )
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    if (apiMessages.length === 0) {
 // Defensive: nothing to send; surface a friendly "send something" hint.
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, status: "sent", content: "(no message to send)" } : m
        )
      );
      return;
    }

    const controller = new AbortController();
    assistantAbortRef.current[assistantId] = controller;

    void (async () => {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: apiMessages,
            provider: providerForTurn,
            apiKey,
            tier,
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

 // SSE framing: events delimited by `\n\n`, each line `data: <json>`.
          let idx;
          while ((idx = buffer.indexOf("\n\n")) >= 0) {
            const eventBlock = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            for (const line of eventBlock.split("\n")) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data) as { text?: string; error?: string };
                if (parsed.error) {
                  throw new Error(parsed.error);
                }
                if (typeof parsed.text === "string" && parsed.text) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, content: m.content + parsed.text, status: "pending" }
                        : m
                    )
                  );
                }
              } catch (e: any) {
 // re-throw to outer catch for unified error handling
                throw e;
              }
            }
          }
        }

 // Mark complete
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, status: "sent" } : m))
        );
      } catch (err: any) {
 // Aborted = user clicked Stop; the handler already sets [Stopped].
        if (err?.name === "AbortError") return;

        const errMsg = err?.message ?? "stream failed";
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantId) return m;
            if (fallbackToDemo) {
              return {
                ...m,
                status: "sent",
                content:
                  m.content && m.content.length > 0
                    ? m.content // partial response received - keep what we have
                    : `Demo fallback: live provider error (${errMsg.slice(0, 80)}). Try again, or check your key.`,
              };
            }
            return { ...m, status: "timed_out", content: "" };
          })
        );
      } finally {
        delete assistantAbortRef.current[assistantId];
      }
    })();
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

 // Clear old timeout if present + abort any in-flight stream
    const old = assistantTimeoutsRef.current[assistantId];
    if (old) window.clearTimeout(old);
    const oldAbort = assistantAbortRef.current[assistantId];
    if (oldAbort) {
      oldAbort.abort();
      delete assistantAbortRef.current[assistantId];
    }

 // Build conversation history up to (but excluding) the assistant being
 // retried - i.e. all messages with id !== assistantId, in their current
 // order. Filter to those with content so we don't poison the thread with
 // pending placeholders.
    const priorMessagesForApi = messages.filter(
      (m) => m.id !== assistantId && typeof m.content === "string" && m.content.length > 0
    );

    scheduleAssistant(
      assistantId,
      originalText,
      nextAttempt,
      resolveProviderForTurn(),
      composerModelDetailLabel,
      priorMessagesForApi
    );
  };

  const handleSend = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const cardId = parseCardIdFromDestination(activeDestinationId);
    if (cardId && accessToken) {
      const payload = buildCardChatRequestBody(trimmed);
      if (!("error" in payload)) {
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

        void (async () => {
          try {
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
              const errMsg =
                typeof data.error === "string" ? data.error : `HTTP ${res.status}`;
              throw new Error(errMsg);
            }
            const stateChanges = (data as { stateChanges?: unknown }).stateChanges;
            if (Array.isArray(stateChanges) && stateChanges.length > 0) {
              for (const sc of stateChanges) {
                window.dispatchEvent(new CustomEvent("nuro:state-changed", { detail: sc }));
              }
            }
            const reply = String((data as { message?: string }).message || "(no response)");
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, status: "sent", content: reply, timestamp: Date.now() }
                  : m
              )
            );
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Send failed";
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, status: "sent", content: message } : m
              )
            );
          }
        })();
        return;
      }
    }

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

 // Build the conversation history WITH the new user turn but WITHOUT the
 // pending assistant placeholder - that's what /api/chat needs as context.
    const priorMessagesForApi = [...messages, userMsg];

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    scheduleAssistant(
      assistantId,
      trimmed,
      1,
      resolveProviderForTurn(),
      composerModelDetailLabel,
      priorMessagesForApi
    );
  };

  const isStreaming = messages.some((m) => m.status === "pending");

  const handleStop = () => {
 // Clear all pending timers + abort any in-flight live stream + mark pending
 // messages as stopped. Demo turns just have a setTimeout; live turns have
 // an AbortController on assistantAbortRef.
    setMessages((prev) =>
      prev.map((m) => {
        if (m.status !== "pending") return m;
        const timerId = assistantTimeoutsRef.current[m.id];
        if (timerId) {
          window.clearTimeout(timerId);
          delete assistantTimeoutsRef.current[m.id];
        }
        const abortController = assistantAbortRef.current[m.id];
        if (abortController) {
          abortController.abort();
          delete assistantAbortRef.current[m.id];
        }
 // Preserve any partial streamed content; only show "[Stopped]" if the
 // user hit Stop before any text arrived.
        return {
          ...m,
          status: "sent",
          content: m.content && m.content.length > 0 ? m.content : "[Stopped]",
        };
      })
    );
  };

  const goToByokKeysFromEntry = () => {
    setByokSuccessContext(null);
    byokNeedsIntroAfterSuccessRef.current = false;
    setByokShellSessionKey((k) => k + 1);
    setByokKeysCascadeKey((n) => n + 1);
    setKeysPage("keys");
  };

 /** Opens the key form sheet (not the entry card) from chrome / menus. */
  const openByokKeysSheet = () => {
    byokOverlayClosePendingRef.current = false;
    setByokSuccessContext(null);
    byokNeedsIntroAfterSuccessRef.current = false;
    if (keysModalOpen && keysPage === "entry") {
      setByokShellSessionKey((k) => k + 1);
    }
    setByokKeysCascadeKey((n) => n + 1);
    setKeysPage("keys");
    setKeysModalOpen(true);
  };

 /** Remove key material that was never committed via Save/Continue (drafts must not survive modal close). */
  const purgeUncommittedByokKeysFromLs = () => {
    if (typeof window === "undefined") return;
    const committed = (p: ByokProvider) =>
      window.localStorage.getItem(`nuro.chat.byok.commit.${p}`) === "1";
    if (!committed("openai")) window.localStorage.removeItem("nuro.chat.key.openai");
    if (!committed("anthropic")) window.localStorage.removeItem("nuro.chat.key.anthropic");
    if (!committed("gemini")) window.localStorage.removeItem("nuro.chat.key.gemini");
  };

 /** Discard draft key text when the sheet closes - inputs reflect only Save/Continue–committed LS keys. */
  const syncByokKeyInputsFromPersistence = () => {
    if (typeof window === "undefined") return;
    const oa = window.localStorage.getItem("nuro.chat.key.openai")?.trim() ?? "";
    const ant = window.localStorage.getItem("nuro.chat.key.anthropic")?.trim() ?? "";
    const gm = window.localStorage.getItem("nuro.chat.key.gemini")?.trim() ?? "";
    const empty: ProviderKeyState = { key: "", health: "not_set", verifyMessage: undefined };

    if (oa && window.localStorage.getItem("nuro.chat.byok.commit.openai") === "1") {
      setOpenAi({ key: oa, health: "connected", verifyMessage: undefined });
      setAnthropic(empty);
      setGemini(empty);
    } else if (ant && window.localStorage.getItem("nuro.chat.byok.commit.anthropic") === "1") {
      setOpenAi(empty);
      setAnthropic({ key: ant, health: "connected", verifyMessage: undefined });
      setGemini(empty);
    } else if (gm && window.localStorage.getItem("nuro.chat.byok.commit.gemini") === "1") {
      setOpenAi(empty);
      setAnthropic(empty);
      setGemini({ key: gm, health: "connected", verifyMessage: undefined });
    } else {
      setOpenAi(empty);
      setAnthropic(empty);
      setGemini(empty);
    }
  };

  const finalizeByokOverlayAfterExit = () => {
    if (!byokOverlayClosePendingRef.current) return;
    byokOverlayClosePendingRef.current = false;
    setKeysPage("entry");
    setByokSuccessContext(null);
    syncByokKeyInputsFromPersistence();
  };

  const closeKeysModal = () => {
    if (byokNeedsIntroAfterSuccessRef.current) {
      applyLiveIntroChatTranscript();
      byokNeedsIntroAfterSuccessRef.current = false;
    }
    byokVerifySessionRef.current += 1;
    clearAllByokVerifyFeedback();
    setVerifyBusy(null);
    byokVerifyInFlightRef.current = false;
    setDisconnectAllConfirmOpen(false);
    setSwitchToDemoConfirmOpen(false);
    purgeUncommittedByokKeysFromLs();
    byokOverlayClosePendingRef.current = true;
    setKeysModalOpen(false);
    try {
      sessionStorage.setItem("nuro.chat.byok.dismissedThisLayoutVisit", "1");
    } catch {
 /* private mode */
    }
    const hasAnyStoredKey =
      !!window.localStorage.getItem("nuro.chat.key.openai") ||
      !!window.localStorage.getItem("nuro.chat.key.anthropic") ||
      !!window.localStorage.getItem("nuro.chat.key.gemini");
    if (!hasAnyStoredKey) {
      setModel("demo");
    }
  };

 /** Every time the BYOK sheet opens, drop orphan LS keys and align inputs - survives missed dismiss handlers while panel stays mounted. */
  useEffect(() => {
    if (!keysModalOpen || typeof window === "undefined") return;
    byokVerifySessionRef.current += 1;
    purgeUncommittedByokKeysFromLs();
    syncByokKeyInputsFromPersistence();
    clearAllByokVerifyFeedback();
    setVerifyBusy(null);
    byokVerifyInFlightRef.current = false;
 // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run when sheet visibility toggles; helpers are stable per render
  }, [keysModalOpen]);

 /** Save requires a provider that passed Test (connected). */
  const canSaveByok =
    (openAi.health === "connected" && openAi.key.trim().length > 0) ||
    (anthropic.health === "connected" && anthropic.key.trim().length > 0) ||
    (gemini.health === "connected" && gemini.key.trim().length > 0);

  const connectProvider = async (provider: ByokProvider) => {
    const trimmed =
      provider === "openai"
        ? openAi.key.trim()
        : provider === "anthropic"
          ? anthropic.key.trim()
          : gemini.key.trim();
    if (!trimmed) {
      const empty = { health: "invalid" as const, verifyMessage: "Enter a key to test" };
      if (provider === "openai") setOpenAi((prev) => ({ ...prev, ...empty }));
      else if (provider === "anthropic") setAnthropic((prev) => ({ ...prev, ...empty }));
      else setGemini((prev) => ({ ...prev, ...empty }));
      scheduleByokVerifyFeedback(provider, "invalid");
      return;
    }

    if (byokVerifyInFlightRef.current) return;
    byokVerifyInFlightRef.current = true;
    const verifyToken = byokVerifySessionRef.current;
    setVerifyBusy(provider);
    try {
 /** Dev bypass for recordings (`1234`). Route mirrors this - client skips the round trip. */
      let ok = false;
      let errText: string | undefined;
      if (provider === "openai" && trimmed === "1234") {
        ok = true;
      } else {
        const res = await fetch("/api/assistant/verify-key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, apiKey: trimmed }),
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        ok = res.ok && !!data.ok;
        errText = typeof data.error === "string" && data.error ? data.error : undefined;
      }

      if (verifyToken !== byokVerifySessionRef.current) return;

      if (!ok) {
        const msg = errText && errText.trim() ? errText : "Verification failed";
        if (provider === "openai") setOpenAi((prev) => ({ ...prev, health: "invalid", verifyMessage: msg }));
        else if (provider === "anthropic")
          setAnthropic((prev) => ({ ...prev, health: "invalid", verifyMessage: msg }));
        else setGemini((prev) => ({ ...prev, health: "invalid", verifyMessage: msg }));
        scheduleByokVerifyFeedback(provider, "invalid");
        return;
      }

      if (provider === "openai") {
        setOpenAi((prev) => ({ ...prev, health: "connected", verifyMessage: undefined }));
        setAnthropic({ key: "", health: "not_set", verifyMessage: undefined });
        setGemini({ key: "", health: "not_set", verifyMessage: undefined });
        clearByokVerifyFeedbackForOthers("openai");
        scheduleByokVerifyFeedback("openai", "valid");
      } else if (provider === "anthropic") {
        setAnthropic((prev) => ({ ...prev, health: "connected", verifyMessage: undefined }));
        setOpenAi({ key: "", health: "not_set", verifyMessage: undefined });
        setGemini({ key: "", health: "not_set", verifyMessage: undefined });
        clearByokVerifyFeedbackForOthers("anthropic");
        scheduleByokVerifyFeedback("anthropic", "valid");
      } else {
        setGemini((prev) => ({ ...prev, health: "connected", verifyMessage: undefined }));
        setOpenAi({ key: "", health: "not_set", verifyMessage: undefined });
        setAnthropic({ key: "", health: "not_set", verifyMessage: undefined });
        clearByokVerifyFeedbackForOthers("gemini");
        scheduleByokVerifyFeedback("gemini", "valid");
      }
    } catch {
      if (verifyToken !== byokVerifySessionRef.current) return;
      const msg = "Network error - could not reach verification";
      if (provider === "openai") setOpenAi((prev) => ({ ...prev, health: "invalid", verifyMessage: msg }));
      else if (provider === "anthropic")
        setAnthropic((prev) => ({ ...prev, health: "invalid", verifyMessage: msg }));
      else setGemini((prev) => ({ ...prev, health: "invalid", verifyMessage: msg }));
      scheduleByokVerifyFeedback(provider, "invalid");
    } finally {
      byokVerifyInFlightRef.current = false;
      setVerifyBusy(null);
    }
  };

  const disconnectProvider = (provider: ByokProvider) => {
    byokVerifySessionRef.current += 1;
    clearAllByokVerifyFeedback();
    setVerifyBusy(null);
    byokVerifyInFlightRef.current = false;
    if (provider === "openai") {
      setOpenAi({ key: "", health: "not_set", verifyMessage: undefined });
      window.localStorage.removeItem("nuro.chat.key.openai");
      window.localStorage.removeItem("nuro.chat.byok.commit.openai");
      if (model === "openai") setModel("demo");
    } else if (provider === "anthropic") {
      setAnthropic({ key: "", health: "not_set", verifyMessage: undefined });
      window.localStorage.removeItem("nuro.chat.key.anthropic");
      window.localStorage.removeItem("nuro.chat.byok.commit.anthropic");
      if (model === "anthropic") setModel("demo");
    } else {
      setGemini({ key: "", health: "not_set", verifyMessage: undefined });
      window.localStorage.removeItem("nuro.chat.key.gemini");
      window.localStorage.removeItem("nuro.chat.byok.commit.gemini");
      if (model === "gemini") setModel("demo");
    }
  };

  const disconnectAllByok = () => {
    byokVerifySessionRef.current += 1;
    clearAllByokVerifyFeedback();
    setVerifyBusy(null);
    byokVerifyInFlightRef.current = false;
    setOpenAi({ key: "", health: "not_set", verifyMessage: undefined });
    setAnthropic({ key: "", health: "not_set", verifyMessage: undefined });
    setGemini({ key: "", health: "not_set", verifyMessage: undefined });
    window.localStorage.removeItem("nuro.chat.key.openai");
    window.localStorage.removeItem("nuro.chat.key.anthropic");
    window.localStorage.removeItem("nuro.chat.key.gemini");
    window.localStorage.removeItem("nuro.chat.byok.commit.openai");
    window.localStorage.removeItem("nuro.chat.byok.commit.anthropic");
    window.localStorage.removeItem("nuro.chat.byok.commit.gemini");
    setModel("demo");
    setModelMenuOpen(false);
  };

  const handleByokFormContinue = () => {
    if (!canSaveByok) return;
    const hadAnyCommittedKeyBefore =
      window.localStorage.getItem("nuro.chat.byok.commit.openai") === "1" ||
      window.localStorage.getItem("nuro.chat.byok.commit.anthropic") === "1" ||
      window.localStorage.getItem("nuro.chat.byok.commit.gemini") === "1";

    let committed: { provider: ByokProvider } | null = null;

    if (openAi.health === "connected" && openAi.key.trim()) {
      setOpenAi((prev) => ({ ...prev, health: "connected" }));
      window.localStorage.setItem("nuro.chat.key.openai", openAi.key.trim());
      window.localStorage.setItem("nuro.chat.byok.commit.openai", "1");
      window.localStorage.removeItem("nuro.chat.byok.commit.anthropic");
      window.localStorage.removeItem("nuro.chat.byok.commit.gemini");
      setAnthropic({ key: "", health: "not_set", verifyMessage: undefined });
      setGemini({ key: "", health: "not_set", verifyMessage: undefined });
      window.localStorage.removeItem("nuro.chat.key.anthropic");
      window.localStorage.removeItem("nuro.chat.key.gemini");
      setModel("openai");
      committed = { provider: "openai" };
    } else if (anthropic.health === "connected" && anthropic.key.trim()) {
      setAnthropic((prev) => ({ ...prev, health: "connected" }));
      window.localStorage.setItem("nuro.chat.key.anthropic", anthropic.key.trim());
      window.localStorage.setItem("nuro.chat.byok.commit.anthropic", "1");
      window.localStorage.removeItem("nuro.chat.byok.commit.openai");
      window.localStorage.removeItem("nuro.chat.byok.commit.gemini");
      setOpenAi({ key: "", health: "not_set", verifyMessage: undefined });
      setGemini({ key: "", health: "not_set", verifyMessage: undefined });
      window.localStorage.removeItem("nuro.chat.key.openai");
      window.localStorage.removeItem("nuro.chat.key.gemini");
      setModel("anthropic");
      committed = { provider: "anthropic" };
    } else if (gemini.health === "connected" && gemini.key.trim()) {
      setGemini((prev) => ({ ...prev, health: "connected" }));
      window.localStorage.setItem("nuro.chat.key.gemini", gemini.key.trim());
      window.localStorage.setItem("nuro.chat.byok.commit.gemini", "1");
      window.localStorage.removeItem("nuro.chat.byok.commit.openai");
      window.localStorage.removeItem("nuro.chat.byok.commit.anthropic");
      setOpenAi({ key: "", health: "not_set", verifyMessage: undefined });
      setAnthropic({ key: "", health: "not_set", verifyMessage: undefined });
      window.localStorage.removeItem("nuro.chat.key.openai");
      window.localStorage.removeItem("nuro.chat.key.anthropic");
      setModel("gemini");
      committed = { provider: "gemini" };
    }

    if (!committed) return;

    byokNeedsIntroAfterSuccessRef.current = !hadAnyCommittedKeyBefore;
    setByokSuccessContext(committed);
    setByokShellSessionKey((k) => k + 1);
    setKeysPage("keys-success");
  };

  return (
    <div
      className="flex h-full min-h-0 w-full items-stretch"
      style={{ gap: ASSISTANT_CHAT_NAV_CHROME_GAP_PX }}
    >
      <AssistantChatPanelNavRail
        activeDestinationId={activeDestinationId}
        onSelectDestination={selectChatDestination}
        cards={dashboardCards}
      />
      <div
        ref={setChatPanelRootEl}
        className={cn(
          "relative flex h-full min-w-0 flex-1 flex-col isolate overflow-hidden pointer-events-auto !backdrop-blur-none",
          ASSISTANT_CHAT_SHELL_RADIUS_CLASS
        )}
        style={ASSISTANT_CHAT_SHELL_STYLE}
      >
      {/* Header */}
      <div
        ref={headerRef}
        className="absolute top-4 left-4 right-4 z-[60] rounded-[var(--radius-lg)] border-0 bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-glass)] glass-card-inner px-4 py-3 will-change-transform"
        style={{ backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)' }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col min-w-0 gap-0.5">
            <span className="text-sm font-medium text-[var(--color-primary)]">
              {activeChatHeader.primary}
            </span>
            <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs tracking-[0.08em] text-[var(--color-text-muted)]">
              <span className="whitespace-nowrap">
                {activeChatHeader.secondary}
                {isLiveByokMode ? (
                  <>
                    {" "}
                    · Live
                  </>
                ) : null}
              </span>
              {isLiveByokMode ? (
                <span className="inline-flex shrink-0 items-center" aria-hidden>
                  <span className={NURO_ASSISTANT_DOT_LIVE} />
                </span>
              ) : null}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {model === "demo" ? (
              <Button
                type="button"
                className="h-8 shrink-0 rounded-[10px] bg-[var(--color-brand-primary)] px-3 text-[11px] font-semibold text-white hover:bg-[var(--color-brand-primary)]/90"
                onClick={openByokKeysSheet}
              >
                Connect API
              </Button>
            ) : null}
            {onClose && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 w-9 rounded-[var(--radius-md)] opacity-60 text-[var(--color-text-muted)] hover:opacity-100 hover:text-[var(--color-text-primary)] hover:bg-[var(--color-text-primary)]/2 transition-none"
                onClick={() => {
                  if (disconnectAllConfirmOpen) setDisconnectAllConfirmOpen(false);
                  if (switchToDemoConfirmOpen) setSwitchToDemoConfirmOpen(false);
                  if (keysModalOpen) closeKeysModal();
                  onClose();
                }}
                aria-label="Close assistant panel"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Messages: scroller first in DOM, then fade plates on top (otherwise scroll paints over plates and bubbles peek through). */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          onScroll={handleScroll}
          className="relative z-0 isolate transform-gpu scrollbar-autohide [scrollbar-gutter:auto] flex min-h-0 flex-1 overflow-y-auto overscroll-contain px-8 pt-[90px] text-xs text-[var(--color-text-muted)]"
          style={{
 // Footer composer is absolutely positioned. Pad the scroll region so the last message can scroll
 // above it (even when the textarea grows).
            paddingBottom: Math.max(200, composerHeight + 64),
            scrollPaddingBottom: Math.max(200, composerHeight + 64),
          }}
        >
        <div className="scroll-fade-pad space-y-3">


          {messages.length > 0 && (
            <div>
              {messages.map((m) => {
                if (m.role === "user") {
                  return (
                    <div key={m.id} className="flex flex-col items-end">
                      <div
                        className="inline-flex w-fit flex-col items-end group/msg"
                      >
                        <div
                          role="presentation"
                          className="max-w-[85%] rounded-[var(--radius-xl)] bg-[var(--color-brand-primary)]/30 px-[18px] py-[14px] text-[var(--color-text-primary)] cursor-pointer"
                          onClick={() =>
                            setOpenMessageMetaId((prev) => (prev === m.id ? null : m.id))
                          }
                        >
                          <div className="text-sm">{m.content}</div>
                        </div>
                        <div
                          className="mt-1 flex min-h-[22px] items-center justify-end bg-transparent"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div
                            className={cn(
                              messageMetaRevealBase,
                              openMessageMetaId === m.id && "visible pointer-events-auto"
                            )}
                          >
                            <span className="relative top-[3px] text-[10px] text-[var(--color-text-muted)] opacity-60">
                              {formatTime(m.timestamp)}
                            </span>
                            <MessageActions
                              onCopy={() => navigator.clipboard.writeText(m.content ?? "")}
 // Refresh on user bubble should regenerate the next assistant reply (if present).
                              onRefresh={() => {
                                const idx = messages.findIndex((x) => x.id === m.id);
                                if (idx === -1) return;
                                const nextAssistant = messages
                                  .slice(idx + 1)
                                  .find((x) => x.role === "assistant");
                                if (nextAssistant) resendAssistant(nextAssistant.id);
                              }}
                              showRating={false}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                const status = m.status ?? "pending";
                return (
                  <div key={m.id} className="flex flex-col items-start w-full mb-4">
                    <div
                      className="inline-flex w-fit max-w-[85%] cursor-pointer flex-col items-start group/msg"
                      onClick={() =>
                        setOpenMessageMetaId((prev) => (prev === m.id ? null : m.id))
                      }
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <div className={NURO_ASSISTANT_DOT_DEMO} aria-hidden />
                        <span className="text-[10px] uppercase font-bold tracking-[0.12em] text-[var(--color-primary)] opacity-80">Nuro</span>
                      </div>

                    <div className="w-full px-0 text-[var(--color-text-primary)]">
                      {status === "pending" && (
                        <div className="text-sm text-[var(--color-text-muted)] animate-pulse italic px-4">Thinking…</div>
                      )}
                      {status === "timed_out" && (
                        <div
                          className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-error)]/20 bg-[var(--color-error)]/5 p-3 mx-4"
                          onClick={(e) => e.stopPropagation()}
                        >
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
                          {(m.content ?? "").split(/\r?\n/).map((line, i) => {
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
                        <div
                          className="mt-1 flex min-h-[22px] items-center gap-2 bg-transparent px-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div
                            className={cn(
                              messageMetaRevealBase,
                              openMessageMetaId === m.id && "visible pointer-events-auto"
                            )}
                          >
                            <MessageActions
                              onCopy={() => navigator.clipboard.writeText(m.content ?? "")}
                              showRating={true}
                            />
                            <span className="relative top-[3px] text-[10px] text-[var(--color-text-muted)] opacity-60">
                              {formatTime(m.timestamp)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {/* Spacer ensures the very last message can scroll above the absolute composer. */}
          <div
            aria-hidden
            className="w-full"
            style={{ height: Math.max(200, (composerHeight || 0) + 64) }}
          />
        </div>
        </div>
        <ChatThreadAtmospherePlates />
      </div>

      {/* Footer card - do NOT overflow-hidden the whole card (clips toolbar + bottom radius); clip only the textarea strip */}
      <div
        ref={composerRef}
        className="absolute bottom-3 left-3 right-3 z-[60] rounded-[var(--radius-xl)] border border-white/5 bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-glass)] glass-card-inner px-3 py-3 flex flex-col gap-2"
        style={{ backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)' }}
      >
        <form
          className="flex min-h-0 flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(message);
            setMessage("");
          }}
        >
          {/* Textarea only: overflow-hidden here stops glyphs past the top curve; toolbar row stays fully visible */}
          <div className="min-h-0 max-h-[100px] overflow-hidden rounded-t-[10px] px-1 flex items-start">
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
          <div className="flex shrink-0 items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-1.5">
              <label className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-[var(--color-border-secondary)] dark:border-[var(--color-border-glass)] bg-transparent hover:bg-[var(--color-bg-hover)] dark:hover:bg-[var(--color-bg-input-hover)] dark:hover:border-[var(--color-border-input-hover)] transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-[var(--color-primary)]/30 focus-within:ring-offset-0">
                <input type="file" accept="image/*" className="hidden" />
                <ImageIcon className="h-4 w-4 text-[var(--color-text-muted)]" />
              </label>

              {/* Model + provider picker (popover: per-provider Fast / Smarter + disconnect all) */}
              <Popover open={modelMenuOpen} onOpenChange={setModelMenuOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-10 max-w-[min(220px,42vw)] shrink-0 items-center justify-center gap-1.5 rounded-full border border-[var(--color-border-secondary)] dark:border-[var(--color-border-glass)] bg-transparent px-3 text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] dark:hover:bg-[var(--color-bg-input-hover)] dark:hover:border-[var(--color-border-input-hover)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30 focus-visible:ring-offset-0 dark:backdrop-blur-none data-[state=open]:border-[var(--color-border-input-hover)]"
                  >
                    <span className="truncate text-center text-[11px] font-normal leading-none text-[var(--color-text-primary)]">
                      {composerModelDetailLabel}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" aria-hidden />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  sideOffset={6}
                  className="w-[min(248px,calc(100vw-2rem))] overflow-hidden px-4 py-3"
                >
                  <div className="flex w-full min-w-0 flex-col gap-3">
                    {hasConnectedProvider ? (
                      <>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-muted)]">
                          Manage Models
                        </p>

                        {connectedByokVendor === "openai" ? (
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-semibold text-[var(--color-text-primary)]">OpenAI</span>
                            </div>
                            <div className="flex flex-col gap-2 pl-3">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-xs text-[var(--color-text-primary)]">{OPENAI_FAST_LABEL}</span>
                                <Switch
                                  size="sm"
                                  checked={model === "openai" && openaiModelTier === "fast"}
                                  onChange={() => {
                                    if (model === "openai" && openaiModelTier === "fast") {
                                      setModelMenuOpen(false);
                                      setSwitchToDemoConfirmOpen(true);
                                      return;
                                    }
                                    if (model === "demo") applyLiveIntroChatTranscript();
                                    setModel("openai");
                                    setOpenaiModelTier("fast");
                                  }}
                                />
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-xs text-[var(--color-text-primary)]">{OPENAI_SMART_LABEL}</span>
                                <Switch
                                  size="sm"
                                  checked={model === "openai" && openaiModelTier === "smart"}
                                  onChange={() => {
                                    if (model === "openai" && openaiModelTier === "smart") {
                                      setModelMenuOpen(false);
                                      setSwitchToDemoConfirmOpen(true);
                                      return;
                                    }
                                    if (model === "demo") applyLiveIntroChatTranscript();
                                    setModel("openai");
                                    setOpenaiModelTier("smart");
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {connectedByokVendor === "anthropic" ? (
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-semibold text-[var(--color-text-primary)]">Claude</span>
                            </div>
                            <div className="flex flex-col gap-2 pl-3">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-xs text-[var(--color-text-primary)]">{ANTHROPIC_FAST_LABEL}</span>
                                <Switch
                                  size="sm"
                                  checked={model === "anthropic" && anthropicModelTier === "fast"}
                                  onChange={() => {
                                    if (model === "anthropic" && anthropicModelTier === "fast") {
                                      setModelMenuOpen(false);
                                      setSwitchToDemoConfirmOpen(true);
                                      return;
                                    }
                                    if (model === "demo") applyLiveIntroChatTranscript();
                                    setModel("anthropic");
                                    setAnthropicModelTier("fast");
                                  }}
                                />
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-xs text-[var(--color-text-primary)]">{ANTHROPIC_SMART_LABEL}</span>
                                <Switch
                                  size="sm"
                                  checked={model === "anthropic" && anthropicModelTier === "smart"}
                                  onChange={() => {
                                    if (model === "anthropic" && anthropicModelTier === "smart") {
                                      setModelMenuOpen(false);
                                      setSwitchToDemoConfirmOpen(true);
                                      return;
                                    }
                                    if (model === "demo") applyLiveIntroChatTranscript();
                                    setModel("anthropic");
                                    setAnthropicModelTier("smart");
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {connectedByokVendor === "gemini" ? (
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-semibold text-[var(--color-text-primary)]">Gemini</span>
                            </div>
                            <div className="flex flex-col gap-2 pl-3">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-xs text-[var(--color-text-primary)]">{GEMINI_FAST_LABEL}</span>
                                <Switch
                                  size="sm"
                                  checked={model === "gemini" && geminiModelTier === "fast"}
                                  onChange={() => {
                                    if (model === "gemini" && geminiModelTier === "fast") {
                                      setModelMenuOpen(false);
                                      setSwitchToDemoConfirmOpen(true);
                                      return;
                                    }
                                    if (model === "demo") applyLiveIntroChatTranscript();
                                    setModel("gemini");
                                    setGeminiModelTier("fast");
                                  }}
                                />
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-xs text-[var(--color-text-primary)]">{GEMINI_SMART_LABEL}</span>
                                <Switch
                                  size="sm"
                                  checked={model === "gemini" && geminiModelTier === "smart"}
                                  onChange={() => {
                                    if (model === "gemini" && geminiModelTier === "smart") {
                                      setModelMenuOpen(false);
                                      setSwitchToDemoConfirmOpen(true);
                                      return;
                                    }
                                    if (model === "demo") applyLiveIntroChatTranscript();
                                    setModel("gemini");
                                    setGeminiModelTier("smart");
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        ) : null}

                        <div className="flex flex-col gap-0 border-t border-[var(--color-border-glass)] pt-2">
                          <button
                            type="button"
                            className="w-full rounded-sm py-2 pl-4 pr-3 text-left text-xs font-medium leading-snug text-[var(--color-text-primary)] outline-none transition-colors [@media(hover:hover)]:hover:bg-[var(--color-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/35 focus-visible:ring-offset-0 focus-visible:ring-offset-[var(--color-bg-secondary)]"
                            onClick={() => {
                              setModelMenuOpen(false);
                              openByokKeysSheet();
                            }}
                          >
                            Manage API keys
                          </button>
                          <button
                            type="button"
                            className="w-full rounded-sm py-2 pl-4 pr-3 text-left text-xs font-medium leading-snug text-[var(--color-error)] outline-none transition-colors [@media(hover:hover)]:hover:bg-[color-mix(in_srgb,var(--color-error)_10%,transparent)] focus-visible:ring-2 focus-visible:ring-[var(--color-error)]/35 focus-visible:ring-offset-0 focus-visible:ring-offset-[var(--color-bg-secondary)]"
                            onClick={() => {
                              setModelMenuOpen(false);
                              setDisconnectAllConfirmOpen(true);
                            }}
                          >
                            Disconnect all
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-muted)]">
                          Manage API keys
                        </p>

                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-[var(--color-text-primary)]">Demo</span>
                          <Switch
                            size="sm"
                            checked={model === "demo"}
                            onChange={() => {
                              if (model === "demo") {
                                setModelMenuOpen(false);
                                openByokKeysSheet();
                                return;
                              }
                              setModel("demo");
                            }}
                          />
                        </div>

                        <div className="flex flex-col gap-2 border-t border-[var(--color-border-glass)] pt-4">
                          <Button
                            type="button"
                            className="h-10 w-full rounded-[var(--radius-md)] bg-[var(--color-brand-primary)] px-4 text-xs font-semibold text-white hover:bg-[var(--color-brand-primary)]/90"
                            onClick={() => {
                              setModelMenuOpen(false);
                              openByokKeysSheet();
                            }}
                          >
                            Connect API
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-2">
              {/* Speaker (no outline; only hover/active) */}
              <label className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-[var(--radius-md)] border-0 bg-transparent hover:bg-[var(--color-bg-hover)] transition-colors">
                <input type="file" accept="audio/*" className="hidden" />
                <Mic className="h-4 w-4 text-[var(--color-text-muted)]" />
              </label>

              {/* Send / Stop */}
              <Button
                type={isStreaming ? "button" : "submit"}
                size="sm"
                onClick={isStreaming ? handleStop : undefined}
                disabled={!isStreaming && !message.trim()}
                className="relative h-10 w-10 rounded-[var(--radius-md)] overflow-hidden"
                variant="default"
              >
                {/* Send icon - fades out when streaming */}
                <span
                  className="absolute inset-0 flex items-center justify-center transition-all duration-200"
                  style={{ opacity: isStreaming ? 0 : 1, transform: isStreaming ? 'scale(0.6)' : 'scale(1)' }}
                >
                  <Send className="h-4 w-4 text-white" />
                </span>
                {/* Stop icon - fades in when streaming */}
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

      <AnimatePresence mode="sync" onExitComplete={finalizeByokOverlayAfterExit}>
        {keysModalOpen ? (
              <motion.div
                key="byok-scrim"
                role="button"
                tabIndex={-1}
                aria-label="Dismiss key setup"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: BYOK_OVERLAY_OPEN_DURATION, ease: BYOK_MODAL_EASE }}
                className="pointer-events-auto absolute inset-0 z-[80] cursor-default bg-black/40 dark:bg-black/45"
                onClick={closeKeysModal}
              />
            ) : null}
        {keysModalOpen ? (
              <motion.div
                key="byok-stage"
                className="pointer-events-none absolute inset-0 z-[81] flex h-full min-h-0 w-full items-center justify-center px-8 py-4"
                initial={false}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: BYOK_OVERLAY_OPEN_DURATION, ease: BYOK_MODAL_EASE }}
              >
              <div className="pointer-events-auto flex w-full justify-center">
                    <div
                      className={cn(
                        "relative mx-auto w-full overflow-hidden rounded-[18px] border border-white/20 bg-transparent px-6 py-5 text-[var(--color-text-primary)] shadow-2xl dark:border-white/20",
                        keysPage === "entry" && "max-w-[400px]",
                        keysPage === "keys" && "max-w-[min(480px,100%)]",
                        keysPage === "keys-success" && "max-w-[380px]"
                      )}
                      style={{
                        maxHeight: keysPage === "keys" ? "calc(100% - 3rem)" : undefined,
                        transition: `max-width ${BYOK_SHELL_TRANSITION_CSS}, max-height ${BYOK_SHELL_TRANSITION_CSS}`,
                      }}
                    >
                      {/* Blur + tint: own layer. Enter: scrim fades separately so blur isn’t under a scrubbing ancestor. Exit: stage + scrim share duration so they stay in sync. */}
                      <div
                        aria-hidden
                        className={cn(
                          "pointer-events-none absolute inset-0 rounded-[18px] bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-glass-strong)]"
                        )}
                        style={{ ...BYOK_GLASS_SURFACE_STYLE }}
                      />
                      {keysPage === "entry" || keysPage === "keys" ? (
                        <button
                          type="button"
                          onClick={closeKeysModal}
                          aria-label="Close key setup"
                          className="absolute right-3 top-3 z-[5] flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[var(--color-text-primary)]"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : null}
                      {keysPage === "entry" ? (
                        <motion.div
                          key={`byok-shell-${byokShellSessionKey}-${byokEntryCascadeKey}`}
                          variants={BYOK_MODAL_CONTAINER_VARIANTS}
                          initial="hidden"
                          animate="visible"
                          className="relative z-[1] overflow-hidden"
                        >
                            <motion.div variants={BYOK_MODAL_CASCADE_VARIANTS} className="pr-10">
                              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Bring your own keys</h2>
                            </motion.div>
                            <motion.div variants={BYOK_MODAL_CASCADE_VARIANTS} className="mt-1.5 pr-10">
                              <p className="text-sm text-[var(--color-text-muted)]">
                                Connect your API keys for live responses.
                              </p>
                            </motion.div>
                            <motion.div variants={BYOK_MODAL_CASCADE_VARIANTS} className="mt-6 w-full">
                              <Button
                                type="button"
                                className="h-10 w-full rounded-[var(--radius-md)] bg-[var(--color-brand-primary)] text-white hover:bg-[var(--color-brand-primary)]/90"
                                onClick={goToByokKeysFromEntry}
                              >
                                Connect my keys
                              </Button>
                            </motion.div>
                            <motion.div variants={BYOK_MODAL_CASCADE_VARIANTS} className="mt-2 w-full">
                              <Button
                                type="button"
                                variant="ghost"
                                className="h-9 w-full rounded-[var(--radius-md)] border-0 !bg-transparent text-white/60 hover:text-white hover:!bg-transparent"
                                onClick={() => {
                                  setModel("demo");
                                  closeKeysModal();
                                }}
                              >
                                Explore Demo
                              </Button>
                            </motion.div>
                        </motion.div>
                        ) : keysPage === "keys" ? (
                        <motion.div
                          key={`byok-shell-${byokShellSessionKey}-${byokKeysCascadeKey}`}
                          variants={BYOK_MODAL_CONTAINER_VARIANTS}
                          initial="hidden"
                          animate="visible"
                          className="relative z-[1] w-full min-w-0 max-h-[min(520px,calc(100vh-8rem))] overflow-hidden"
                        >
                          <div className="relative max-h-[min(520px,calc(100vh-8rem))] w-full min-w-0 overflow-y-auto overflow-x-hidden pr-0.5 will-change-[opacity,transform] scroll-gutter-stable">
                      <motion.div variants={BYOK_MODAL_CASCADE_VARIANTS} className="pr-8">
                        <h1 className="text-base font-semibold text-[var(--color-text-primary)]">Nuro Intelligence</h1>
                      </motion.div>
                      <motion.div variants={BYOK_MODAL_CASCADE_VARIANTS} className="mt-1 pr-8">
                        <p className="text-sm text-[var(--color-text-muted)]">
                          Connect your API keys for live responses.
                        </p>
                      </motion.div>
                      <motion.div variants={BYOK_MODAL_CASCADE_VARIANTS} className="mt-4 w-full">
                            <div className="flex min-h-7 w-full items-center gap-2">
                              <div className="flex min-w-0 shrink items-center gap-1.5">
                                <img
                                  src={BYOK_ICON_GPT}
                                  alt=""
                                  width={24}
                                  height={24}
                                  loading="eager"
                                  decoding="sync"
                                  fetchPriority="high"
                                  className="h-6 w-6 shrink-0 object-contain"
                                  aria-hidden
                                />
                                <p className="shrink-0 text-xs font-medium text-[var(--color-text-muted)]">Open AI</p>
                              </div>
                              <div className="flex min-w-0 flex-1 flex-nowrap items-center justify-end gap-2">
                                <ByokVerifyStatusSlot
                                  provider="openai"
                                  verifyBusy={verifyBusy}
                                  feedback={byokVerifyFeedback.openai}
                                />
                                <Button
                                  key={`byok-test-openai-${openAi.key.trim() ? "1" : "0"}`}
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 shrink-0 whitespace-nowrap px-2 text-xs disabled:text-[var(--color-text-muted)]"
                                  disabled={verifyBusy === "openai" || !openAi.key.trim()}
                                  aria-busy={verifyBusy === "openai"}
                                  onClick={() => void connectProvider("openai")}
                                >
                                  Test
                                </Button>
                                {showByokModalClearOpenAi && (
                                  <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={() => disconnectProvider("openai")}>
                                    Clear
                                  </Button>
                                )}
                              </div>
                            </div>
                            <div className="mt-2 w-full">
                              <Input
                                variant="glass"
                                value={openAi.key}
                                onChange={(e) => {
                                  clearByokVerifyFeedbackRow("openai");
                                  setOpenAi({ key: e.target.value, health: "not_set", verifyMessage: undefined });
                                }}
                                placeholder="OpenAI API key"
                              />
                            </div>
                      </motion.div>
                      <motion.div variants={BYOK_MODAL_CASCADE_VARIANTS} className="mt-3 w-full">
                            <div className="flex min-h-7 w-full items-center gap-2">
                              <div className="flex min-w-0 shrink items-center gap-1.5">
                                <img
                                  src={BYOK_ICON_CLAUDE}
                                  alt=""
                                  width={24}
                                  height={24}
                                  loading="eager"
                                  decoding="sync"
                                  fetchPriority="high"
                                  className="h-6 w-6 shrink-0 object-contain"
                                  aria-hidden
                                />
                                <p className="shrink-0 text-xs font-medium text-[var(--color-text-muted)]">Anthropic</p>
                              </div>
                              <div className="flex min-w-0 flex-1 flex-nowrap items-center justify-end gap-2">
                                <ByokVerifyStatusSlot
                                  provider="anthropic"
                                  verifyBusy={verifyBusy}
                                  feedback={byokVerifyFeedback.anthropic}
                                />
                                <Button
                                  key={`byok-test-anthropic-${anthropic.key.trim() ? "1" : "0"}`}
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 shrink-0 whitespace-nowrap px-2 text-xs disabled:text-[var(--color-text-muted)]"
                                  disabled={verifyBusy === "anthropic" || !anthropic.key.trim()}
                                  aria-busy={verifyBusy === "anthropic"}
                                  onClick={() => void connectProvider("anthropic")}
                                >
                                  Test
                                </Button>
                                {showByokModalClearAnthropic && (
                                  <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={() => disconnectProvider("anthropic")}>
                                    Clear
                                  </Button>
                                )}
                              </div>
                            </div>
                            <div className="mt-2 w-full">
                              <Input
                                variant="glass"
                                value={anthropic.key}
                                onChange={(e) => {
                                  clearByokVerifyFeedbackRow("anthropic");
                                  setAnthropic({ key: e.target.value, health: "not_set", verifyMessage: undefined });
                                }}
                                placeholder="Anthropic API key"
                              />
                            </div>
                      </motion.div>
                      <motion.div variants={BYOK_MODAL_CASCADE_VARIANTS} className="mt-3 w-full">
                            <div className="flex min-h-7 w-full items-center gap-2">
                              <div className="flex min-w-0 shrink items-center gap-1.5">
                                <img
                                  src={BYOK_ICON_GEMINI}
                                  alt=""
                                  width={24}
                                  height={24}
                                  loading="eager"
                                  decoding="sync"
                                  fetchPriority="high"
                                  className="h-6 w-6 shrink-0 object-contain"
                                  aria-hidden
                                />
                                <p className="shrink-0 text-xs font-medium text-[var(--color-text-muted)]">Gemini</p>
                              </div>
                              <div className="flex min-w-0 flex-1 flex-nowrap items-center justify-end gap-2">
                                <ByokVerifyStatusSlot
                                  provider="gemini"
                                  verifyBusy={verifyBusy}
                                  feedback={byokVerifyFeedback.gemini}
                                />
                                <Button
                                  key={`byok-test-gemini-${gemini.key.trim() ? "1" : "0"}`}
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 shrink-0 whitespace-nowrap px-2 text-xs disabled:text-[var(--color-text-muted)]"
                                  disabled={verifyBusy === "gemini" || !gemini.key.trim()}
                                  aria-busy={verifyBusy === "gemini"}
                                  onClick={() => void connectProvider("gemini")}
                                >
                                  Test
                                </Button>
                                {showByokModalClearGemini && (
                                  <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-xs" onClick={() => disconnectProvider("gemini")}>
                                    Clear
                                  </Button>
                                )}
                              </div>
                            </div>
                            <div className="mt-2 w-full">
                              <Input
                                variant="glass"
                                value={gemini.key}
                                onChange={(e) => {
                                  clearByokVerifyFeedbackRow("gemini");
                                  setGemini({ key: e.target.value, health: "not_set", verifyMessage: undefined });
                                }}
                                placeholder="Gemini API key"
                              />
                            </div>
                      </motion.div>
                      <motion.div variants={BYOK_MODAL_CASCADE_VARIANTS} className="mt-4 flex flex-col gap-2">
                          <Button
                            type="button"
                            disabled={!canSaveByok}
                            className={cn(
                              "h-10 w-full bg-[var(--color-brand-primary)] text-white hover:bg-[var(--color-brand-primary)]/90",
                              !canSaveByok && "opacity-40"
                            )}
                            onClick={handleByokFormContinue}
                          >
                            Continue
                          </Button>
                      </motion.div>
                          </div>
                        </motion.div>
                        ) : (
                        <motion.div
                                role="status"
                          key={`byok-shell-${byokShellSessionKey}-succ-${byokSuccessContext?.provider ?? "fallback"}`}
                          variants={BYOK_MODAL_LAYER_VARIANTS}
                          initial="hidden"
                          animate="visible"
                          className="relative z-[1] w-full min-w-0 px-1"
                        >
                      {byokSuccessContext ? (
                        <>
                          <motion.div variants={BYOK_MODAL_CASCADE_VARIANTS}>
                            <h2 className="text-lg font-semibold tracking-tight text-[var(--color-text-primary)]">
                              Congratulations!
                            </h2>
                          </motion.div>
                          <motion.div variants={BYOK_MODAL_CASCADE_VARIANTS} className="mt-2">
                            <p className="text-sm leading-snug text-[var(--color-text-muted)]">
                              Your {byokVendorLabel(byokSuccessContext.provider)} API key is connected.
                            </p>
                          </motion.div>
                          <motion.div variants={BYOK_MODAL_CASCADE_VARIANTS} className="mt-5">
                            <p className="text-sm font-semibold text-[var(--color-text-primary)]">Nuro Intelligence</p>
                          </motion.div>
                          <motion.div
                            variants={BYOK_MODAL_CASCADE_VARIANTS}
                            role="presentation"
                            className="ml-5 mt-2 flex gap-2.5 text-sm leading-snug text-[var(--color-text-muted)]"
                          >
                                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--color-primary)]" aria-hidden />
                                Your financial copilot
                          </motion.div>
                          <motion.div
                            variants={BYOK_MODAL_CASCADE_VARIANTS}
                            role="presentation"
                            className="ml-5 mt-2 flex gap-2.5 text-sm leading-snug text-[var(--color-text-muted)]"
                          >
                                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--color-primary)]" aria-hidden />
                                Usage and transactions
                          </motion.div>
                          <motion.div
                            variants={BYOK_MODAL_CASCADE_VARIANTS}
                            role="presentation"
                            className="ml-5 mt-2 flex gap-2.5 text-sm leading-snug text-[var(--color-text-muted)]"
                          >
                                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--color-primary)]" aria-hidden />
                                Yield strategies and more
                          </motion.div>
                          <motion.div variants={BYOK_MODAL_CASCADE_VARIANTS} className="mt-5 w-full">
                            <Button
                              type="button"
                              className="h-10 w-full min-w-0 max-w-none bg-[var(--color-brand-primary)] text-white hover:bg-[var(--color-brand-primary)]/90"
                              onClick={() => closeKeysModal()}
                            >
                              Start chatting
                            </Button>
                          </motion.div>
                        </>
                      ) : (
                        <>
                          <motion.div variants={BYOK_MODAL_CASCADE_VARIANTS}>
                            <p className="text-sm text-[var(--color-text-muted)]">Your key is connected.</p>
                          </motion.div>
                          <motion.div variants={BYOK_MODAL_CASCADE_VARIANTS} className="mt-4 w-full">
                            <Button
                              type="button"
                              className="h-10 w-full min-w-0 max-w-none bg-[var(--color-brand-primary)] text-white hover:bg-[var(--color-brand-primary)]/90"
                              onClick={() => closeKeysModal()}
                            >
                              Start chatting
                            </Button>
                          </motion.div>
                        </>
                      )}
                        </motion.div>
                        )}
                    </div>
              </div>
              </motion.div>
          ) : null}
      </AnimatePresence>

      <ChatPanelConfirmDialog
        open={disconnectAllConfirmOpen}
        onOpenChange={setDisconnectAllConfirmOpen}
        portalContainer={chatPanelRootEl}
        title="Remove API keys?"
        description="You'll stay in demo mode until you connect again."
        onConfirm={() => disconnectAllByok()}
      />

      <ChatPanelConfirmDialog
        open={switchToDemoConfirmOpen}
        onOpenChange={setSwitchToDemoConfirmOpen}
        portalContainer={chatPanelRootEl}
        title="Switch to demo mode?"
        description="You'll stay in demo mode until you connect again."
        onConfirm={() => setModel("demo")}
        cancelLabel="Cancel"
        confirmLabel="Continue"
      />
      </div>
    </div>
  );
}

export default AssistantChatPanelV2;
