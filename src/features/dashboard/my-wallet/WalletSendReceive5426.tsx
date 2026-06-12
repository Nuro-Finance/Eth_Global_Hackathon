"use client";

/**
 * Send / receive UI from Nuro Front End 5.4.26 — inline swap-panel shell (not standalone modals).
 */

import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal, flushSync } from "react-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUpRight,
  AlertTriangle,
  AtSign,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  CreditCard,
  Info,
  Maximize2,
  QrCode,
  Search,
  Star,
  Wallet,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { WalletQRModal } from "@/components/WalletQRModal";
import { getBlockExplorerAddressUrl } from "@/lib/blockExplorer";
import {
  WALLET_GLASS_MENU_CONTENT,
} from "@/lib/walletGlassMenu";

const WALLET_PICKER_OVERLAY_MOTION = {
  initial: { opacity: 0, y: 6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.26, ease: [0.16, 1, 0.3, 1] as const },
  },
  exit: {
    opacity: 0,
    y: 4,
    transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] as const },
  },
} as const;

const connectedWalletCascadeContainer = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0.065, delayChildren: 0.1 },
  },
};

const connectedWalletCascadeItem = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.33, 1, 0.68, 1] as [number, number, number, number] },
  },
};

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

const DEMO_ETH_USD_PRICE = 3482.9;
const DEMO_SEND_NETWORK_FEE_USD = 0.23;
const DEMO_SEND_TX_EXPLORER_URL =
  "https://etherscan.io/tx/0x9c3a8f2e1b5d4c6a7f8e9d0b1a2c3d4e5f6789abcdef0123456789abcdef0";

const DEMO_RECENT_DESTINATIONS: { label: string; address: string; usedCount: number }[] = [
  { label: "getcashly.eth", address: "0x8335…2913", usedCount: 2 },
  { label: "Coinbase", address: "0x91a2…7f80", usedCount: 1 },
  { label: "Robinhood", address: "0x3c9d…0c9", usedCount: 1 },
];

const DEMO_ADDRESS_BOOK_DESTINATIONS: { label: string; address: string; usedCount?: number }[] = [
  { label: "Chris Brignola", address: "0x749edf…454b56" },
  { label: "Treasury", address: "0x91a2…7f80" },
  { label: "Ops", address: "0x8335…2913" },
];

type DemoCardRow = {
  id: string;
  label: string;
  kind: "card" | "agent";
  depositAddress: string;
  balanceUsd: number;
  tint: string;
};

const DEMO_CARD_DESTINATIONS: DemoCardRow[] = [
  { id: "card-1", label: "Nuro Card", kind: "card", depositAddress: "0x742d…f44e", balanceUsd: 672.14, tint: "rgba(13, 144, 255, 0.28)" },
  { id: "card-2", label: "My Card (Vault)", kind: "card", depositAddress: "0x91a2…7f80", balanceUsd: 113.42, tint: "rgba(132, 111, 255, 0.26)" },
  { id: "agent-1", label: "Agent Card #1", kind: "agent", depositAddress: "0x3c9d…0c9", balanceUsd: 505.81, tint: "rgba(20, 241, 149, 0.20)" },
  { id: "agent-2", label: "Agent Card #2", kind: "agent", depositAddress: "0x8335…2913", balanceUsd: 958.33, tint: "rgba(247, 147, 26, 0.22)" },
];

const CARD_RADIUS = "rounded-[var(--radius-card)] sm:rounded-[var(--radius-xl)]";

function hashStringToHue(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h % 360;
}

function DemoDestinationAvatar({ seed }: { seed: string }) {
  const hue = hashStringToHue(seed);
  const fg = `hsla(${hue}, 90%, 66%, 0.98)`;
  const fg2 = `hsla(${(hue + 32) % 360}, 90%, 62%, 0.92)`;
  const bg = `hsla(${hue}, 55%, 38%, 0.32)`;
  const bits = useMemo(() => {
    let x = 0;
    for (let i = 0; i < seed.length; i++) x = (x * 33 + seed.charCodeAt(i)) >>> 0;
    const out: boolean[] = [];
    for (let i = 0; i < 15; i++) out.push(Boolean((x >> i) & 1));
    return out;
  }, [seed]);

  return (
    <span
      className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{ backgroundColor: bg }}
      aria-hidden
    >
      <span className="grid grid-cols-5 grid-rows-5 gap-[1px]">
        {Array.from({ length: 25 }).map((_, i) => {
          const r = Math.floor(i / 5);
          const c = i % 5;
          const mc = c <= 2 ? c : 4 - c;
          const on = bits[r * 3 + mc];
          const useAlt = ((r + c) & 1) === 1;
          return (
            <span
              key={i}
              className="h-[4px] w-[4px] rounded-[1px]"
              style={{ backgroundColor: on ? (useAlt ? fg2 : fg) : "transparent" }}
            />
          );
        })}
      </span>
    </span>
  );
}

const DEFAULT_WALLET_DISPLAY_NAME = "My Wallet";

function walletLabelStorageKey(address: string) {
  return `nuro:wallet-label:${address.trim().toLowerCase()}`;
}

function readStoredWalletLabel(address: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(walletLabelStorageKey(address));
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

const WALLET_LABEL_CHANGED_EVENT = "nuro:wallet-label-changed";

function useWalletDisplayLabel(address: string): string {
  const trimmed = address.trim();
  const snapshot = useCallback(
    () =>
      typeof window === "undefined"
        ? DEFAULT_WALLET_DISPLAY_NAME
        : (readStoredWalletLabel(trimmed) ?? DEFAULT_WALLET_DISPLAY_NAME),
    [trimmed]
  );

  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {};
      const key = walletLabelStorageKey(trimmed);
      const onStorage = (e: StorageEvent) => {
        if (e.key === key || e.key === null) onStoreChange();
      };
      const onCustom = (e: Event) => {
        const ce = e as CustomEvent<{ address?: string }>;
        const a = ce.detail?.address;
        if (!a || a.trim().toLowerCase() === trimmed.toLowerCase()) onStoreChange();
      };
      window.addEventListener("storage", onStorage);
      window.addEventListener(WALLET_LABEL_CHANGED_EVENT, onCustom);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(WALLET_LABEL_CHANGED_EVENT, onCustom);
      };
    },
    snapshot,
    snapshot
  );
}

function truncateAddressMiddle(address: string, headChars = 6, tailChars = 4) {
  const a = address.trim();
  if (a.length <= headChars + tailChars + 1) return a;
  return `${a.slice(0, headChars)}…${a.slice(-tailChars)}`;
}

function WalletPanelGasInline({ usd, className }: { usd: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold tabular-nums text-white/55 sm:text-xs",
        className
      )}
    >
      <span className="text-white/40">Gas</span>
      {formatUsd(usd)}
    </span>
  );
}

function parsePositiveDecimalInput(raw: string): number {
  const normalized = raw.replace(/,/g, "").trim();
  if (!normalized) return 0;
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function formatSendEthDisplay(raw: string): string {
  const n = parsePositiveDecimalInput(raw);
  if (!n) return "0";
  const fixed = n.toFixed(8).replace(/\.?0+$/, "");
  return fixed || "0";
}

/** Base+ETH is a non-circular composite; `rounded-full` on the <img> clips the chain mark — same h/w, no scaling. */
function isBaseEthCompositeIconSrc(src?: string): boolean {
  if (!src) return false;
  return src.includes("Base%20Eth.svg") || src.includes("Base Eth.svg");
}

export type WalletRightShell = { kind: "swap" } | { kind: "sendReceive"; tab: "send" | "receive" };

/** Same slide rhythm as my-card-1 reload/withdraw panes (`initial` from right, `exit` to left). */
const WALLET_SWAP_SHELL_EASE: [number, number, number, number] = [0.4, 0, 0.2, 1];
const walletSwapShellMotion = {
  initial: { opacity: 0, x: 20 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.3, ease: WALLET_SWAP_SHELL_EASE },
  },
  exit: {
    opacity: 0,
    x: -20,
    transition: { duration: 0.26, ease: WALLET_SWAP_SHELL_EASE },
  },
};

const sendReceiveCascadeContainer = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0.065, delayChildren: 0.1 },
  },
};

const sendReceiveCascadeItem = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.33, 1, 0.68, 1] as [number, number, number, number] },
  },
};

/** “You’re sending” review — top→down cascade (matches send/receive shell ease). */
const SEND_REVIEW_CASCADE: Record<"hidden" | "show", object> = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.1 } },
};
const SEND_REVIEW_CASCADE_ITEM = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.33, 1, 0.68, 1] as [number, number, number, number] },
  },
};

/**
 * Send form ↔ “You’re sending” — same x-slide rhythm as `walletSwapShellMotion` + my-card-1 step panes.
 * `custom` 1: forward (Continue) — new from the right, old exits left.
 * `custom` -1: back — new from the left, old exits right.
 */
const SEND_STEP_SLIDE_EASE: [number, number, number, number] = [0.4, 0, 0.2, 1];
const SEND_STEP_SLIDE_PX = 20;
const SEND_STEP_SLIDE_VARIANTS: Variants = {
  enter: (d: 1 | -1) => ({
    x: d > 0 ? SEND_STEP_SLIDE_PX : -SEND_STEP_SLIDE_PX,
    opacity: 0,
  }),
  center: { x: 0, opacity: 1, transition: { duration: 0.3, ease: SEND_STEP_SLIDE_EASE } },
  exit: (d: 1 | -1) => ({
    x: d > 0 ? -SEND_STEP_SLIDE_PX : SEND_STEP_SLIDE_PX,
    opacity: 0,
  }),
};

const RECENT_ACTIVITY_ROW_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Staggered “chrome” (headers / tabs / fields) in send-destination pickers, aligned with `WALLET_PICKER_OVERLAY_MOTION` ease. */
const SEND_DEST_CHROME_STAGGER = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
} as const;
const SEND_DEST_CHROME_BLOCK = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  },
} as const;

/** Per-row cascade for address and card lists (staggered list items). */
const SEND_DEST_LIST_STAGGER = {
  hidden: { opacity: 0 },
  show: { transition: { staggerChildren: 0.044, delayChildren: 0.1 } },
} as const;
const SEND_DEST_LIST_ROW = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  },
} as const;

function NotEnoughBalanceInfoOverlay({
  open,
  onClose,
  variant = "send",
  swapSellAsset,
  onBuyWithCard,
}: {
  open: boolean;
  onClose: () => void;
 /** Swap: not-enough sheet with CTA (send keeps existing “max balance” explainer). */
  variant?: "send" | "swap";
 /** Sell-side token when `variant="swap"` — drives title, body, and icon. */
  swapSellAsset?: { symbol: string; iconSrc?: string; fallbackBg: string };
  onBuyWithCard?: () => void;
}) {
  const swapSymbol = (swapSellAsset?.symbol ?? "ETH").trim() || "ETH";
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          className="absolute -inset-px z-[255] bg-[var(--color-bg-asset-picker-panel)] p-4 sm:p-5"
          style={{ overscrollBehavior: "contain" }}
          initial={WALLET_PICKER_OVERLAY_MOTION.initial}
          animate={WALLET_PICKER_OVERLAY_MOTION.animate}
          exit={WALLET_PICKER_OVERLAY_MOTION.exit}
          data-not-enough-overlay
        >
          <div
            className={cn(
              WALLET_GLASS_MENU_CONTENT,
              "!p-0",
              "relative h-full w-full min-h-0 overflow-hidden",
              CARD_RADIUS,
              "!bg-[var(--color-bg-asset-picker-panel)]",
              "!border-white/[0.075]",
              variant === "swap" && "flex flex-col"
            )}
          >
            {variant === "swap" ? (
              <motion.div
                variants={connectedWalletCascadeContainer}
                initial="initial"
                animate="animate"
                className="relative flex h-full min-h-0 flex-col"
              >
                <div
                  dir="ltr"
                  className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-end pt-5 pr-5 sm:pt-6 sm:pr-6"
                >
                  <button
                    type="button"
                    onClick={onClose}
                    className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" strokeWidth={2} aria-hidden />
                  </button>
                </div>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col px-6">
                  <div className="min-h-0 min-w-0 flex-1 basis-0" aria-hidden />
                  <motion.div
                    variants={connectedWalletCascadeItem}
                    className="flex w-full min-w-0 max-w-[28rem] shrink-0 flex-col items-center gap-3 self-center text-center"
                  >
                    {swapSellAsset?.iconSrc ? (
                      <img
                        src={swapSellAsset.iconSrc}
                        alt=""
                        className={cn(
                          "h-10 w-10 shrink-0",
                          isBaseEthCompositeIconSrc(swapSellAsset.iconSrc) ? "object-contain" : "rounded-full object-cover"
                        )}
                        width={40}
                        height={40}
                        aria-hidden
                      />
                    ) : (
                      <span
                        className={cn("h-10 w-10 shrink-0 rounded-full", swapSellAsset?.fallbackBg ?? "bg-blue-500/25")}
                        aria-hidden
                      />
                    )}
                    <h1 className="m-0 w-full text-center text-[18px] font-semibold leading-[1.15] tracking-tight text-[var(--color-text-primary)] sm:text-[20px]">
                      {`Not enough ${swapSymbol}`}
                    </h1>
                    <p className="m-0 w-full text-center text-[14px] leading-relaxed text-[var(--color-text-primary)]/85">
                      {`You need more ${swapSymbol}. Swap ${swapSymbol} from another chain or buy with your card.`}
                    </p>
                  </motion.div>
                  <div className="min-h-0 min-w-0 flex-1 basis-0" aria-hidden />
                </div>

                <motion.div variants={connectedWalletCascadeItem} className="shrink-0 px-6 pb-6">
                  <Button
                    type="button"
                    onClick={() => {
                      onClose();
                      onBuyWithCard?.();
                    }}
                    className="h-12 w-full rounded-[14px] bg-white/[0.08] text-base font-semibold text-[var(--color-text-primary)] hover:bg-white/[0.10]"
                  >
                    Buy with card
                  </Button>
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                variants={connectedWalletCascadeContainer}
                initial="initial"
                animate="animate"
                className="flex h-full min-h-0 flex-col px-6 pb-6 pt-8"
              >
                <motion.div
                  variants={connectedWalletCascadeItem}
                  className="flex min-h-0 flex-1 flex-col items-center justify-center"
                >
                  <AlertTriangle className="h-8 w-8 text-white/80" strokeWidth={2} aria-hidden />

                  <div className="mt-6 text-center text-[18px] font-semibold leading-[1.15] tracking-tight text-[var(--color-text-primary)] sm:text-[20px]">
                    Why can&apos;t I use my
                    <br />
                    max balance?
                  </div>

                  <p className="mx-auto mt-4 max-w-[28rem] text-center text-[14px] leading-relaxed text-white/55">
                    A small amount of the network token balance is reserved to cover the network cost of this transaction.
                  </p>
                </motion.div>

                <motion.div variants={connectedWalletCascadeItem} className="shrink-0">
                  <Button
                    type="button"
                    onClick={onClose}
                    className="h-12 w-full rounded-[14px] bg-white/[0.08] text-base font-semibold text-[var(--color-text-primary)] hover:bg-white/[0.10]"
                  >
                    Close
                  </Button>
                </motion.div>
              </motion.div>
            )}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

const receiveShellIconButtonClass = cn(
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-transparent bg-transparent text-white/65 transition-[background-color,color,border-color] duration-200",
  "hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30"
);

const receiveShellBackButtonClass = cn(
 // Keep an 8×8 tap target, but left-align the glyph and avoid the 1×1 hover chip.
  "inline-flex h-8 w-8 shrink-0 items-center justify-start rounded-[10px] border border-transparent bg-transparent pl-0 text-white/55 outline-none",
  "transition-colors hover:bg-transparent hover:text-white focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30"
);

/** First-pass receive body — fits the fixed swap shell content band (no inner scroll). */
function ReceiveCryptoFirstPassBody({
  fullAddress,
  shortAddress,
  onCopyAddress,
  onOpenQrModal,
}: {
  fullAddress: string;
  shortAddress: string;
  onCopyAddress: () => void;
  onOpenQrModal: () => void;
}) {
  const [rowCopied, setRowCopied] = useState(false);
  const walletDisplayName = useWalletDisplayLabel(fullAddress);

  const copyRow = useCallback(() => {
    onCopyAddress();
    setRowCopied(true);
  }, [onCopyAddress]);

  useEffect(() => {
    if (!rowCopied) return;
    const id = window.setTimeout(() => setRowCopied(false), 1200);
    return () => window.clearTimeout(id);
  }, [rowCopied]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h1 className="mb-2 shrink-0 text-left text-base font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-[17px]">
        Receive Crypto
      </h1>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        {/* Match Send's amount shell 1:1 (height/spacing) so tab switching doesn't shift. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-lg)] bg-white/[0.04] py-3 pl-4 pr-3 sm:py-4 sm:pl-5 sm:pr-3.5">
          <div className="flex min-h-0 min-w-0 flex-1 items-center justify-between gap-2">
            <div className="flex min-h-0 min-w-0 flex-1 items-center gap-3 overflow-hidden pl-0 text-left -ml-1">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/18 text-[var(--color-primary)]"
                aria-hidden
              >
                <Wallet className="h-[18px] w-[18px]" strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1 overflow-hidden">
                <p
                  className="truncate text-sm font-semibold leading-tight text-[var(--color-text-primary)]"
                  title={walletDisplayName}
                >
                  {walletDisplayName}
                </p>
                <p
                  className="mt-0.5 truncate font-mono text-[11px] leading-tight text-[var(--color-text-muted)]"
                  title={shortAddress}
                >
                  {shortAddress}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5 self-center">
              <button
                type="button"
                onClick={copyRow}
                className={receiveShellIconButtonClass}
                aria-label={rowCopied ? "Address copied" : "Copy address"}
              >
                {rowCopied ? (
                  <Check className="h-4 w-4 text-[var(--color-success)]" strokeWidth={2.25} aria-hidden />
                ) : (
                  <Copy className="h-4 w-4" strokeWidth={2} aria-hidden />
                )}
              </button>
              <button
                type="button"
                className={receiveShellIconButtonClass}
                aria-label="Show wallet QR code"
                onClick={onOpenQrModal}
              >
                <QrCode className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 px-0.5">
          <div
            className="h-px min-w-0 flex-1 bg-gradient-to-r from-transparent via-white/[0.09] to-white/[0.14]"
            aria-hidden
          />
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            From an account
          </span>
          <div
            className="h-px min-w-0 flex-1 bg-gradient-to-r from-white/[0.14] via-white/[0.09] to-transparent"
            aria-hidden
          />
        </div>

        <div className="flex shrink-0 flex-col gap-1.5">
          <div
            className={receiveFromAccountRowClass}
            tabIndex={-1}
            aria-label="Coinbase (coming soon)"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-[#0052FF]"
                aria-hidden
              >
                <img
                  src="/Coinbase%20C%20Icon.svg"
                  alt=""
                  className="h-[22px] w-[22px] object-contain"
                  width={22}
                  height={22}
                />
              </span>
              <span className="min-w-0 text-sm font-semibold text-[var(--color-text-primary)]">Coinbase</span>
            </div>
            <span className={receiveComingSoonPillClass} aria-hidden>
              Coming soon
            </span>
          </div>
          <div
            className={receiveFromAccountRowClass}
            tabIndex={-1}
            aria-label="Robinhood (coming soon)"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-[#CCFF00]"
                aria-hidden
              >
                <img
                  src="/Robinhood%20Feather%20Icon.svg"
                  alt=""
                  className="h-5 w-5 object-contain"
                  width={20}
                  height={20}
                />
              </span>
              <span className="min-w-0 text-sm font-semibold text-[var(--color-text-primary)]">Robinhood</span>
            </div>
            <span className={receiveComingSoonPillClass} aria-hidden>
              Coming soon
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

const sendDestinationRowButtonClass = cn(
 // Fixed height prevents layout shift when a destination is selected (2-line content),
 // while preserving the original one-line resting layout.
  "flex h-[56px] w-full shrink-0 items-center gap-2.5 rounded-[var(--radius-lg)] border border-white/[0.1] bg-transparent px-2.5 py-0 text-left transition-colors",
  "hover:bg-white/2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25"
);

/** Receive: “From an account” — not interactive; `group-hover` shows inline pill. */
const receiveFromAccountRowClass = cn(
  "group flex h-[56px] w-full max-w-full shrink-0 items-center justify-between gap-2 rounded-[var(--radius-lg)] border border-white/[0.1] bg-transparent px-2.5 py-0",
  "cursor-default select-none transition-colors",
  "hover:bg-white/2"
);

/** Visual match for `@/components/ui/tooltip` `TooltipContent` (in-row pill, no portal). */
const receiveComingSoonPillClass = cn(
  "pointer-events-none shrink-0 overflow-hidden rounded-lg bg-[var(--color-bg-card)]",
  "dark:bg-[var(--color-bg-glass-strong)] dark:backdrop-blur-[var(--glass-blur)] glass-card-inner",
  "border border-[var(--color-border-primary)] dark:border-[var(--color-border-glass-strong)]",
  "px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-primary)]",
  "opacity-0 transition-opacity duration-150",
  "group-hover:opacity-100"
);

/** First-pass send body — same vertical rhythm as receive (wallet row height = amount row). */
function SendCryptoFirstPassBody({
  amount,
  amountUsd,
  onAmountChange,
  overlayMountRef,
  onDestOverlayOpenChange,
  sendFlowStep,
  walletLabel,
  walletAddressFull,
  walletAddressShort,
  onCopyAddress,
  onOpenQrModal,
  onSendDestinationReadyChange,
  sendAsset,
  onOpenSendAssetPicker,
  sendStepTransitionDir,
  onSendDestinationToLabelChange,
  onSendStepExitComplete,
}: {
  amount: string;
  amountUsd: string;
  onAmountChange: (value: string) => void;
  overlayMountRef: RefObject<HTMLDivElement | null>;
  onDestOverlayOpenChange?: (open: boolean) => void;
  sendFlowStep: "form" | "review" | "pending" | "success";
 /** +1 = Continue (in from right), -1 = back (in from left); drives `SEND_STEP_SLIDE_VARIANTS`. */
  sendStepTransitionDir: 1 | -1;
  walletLabel: string;
  walletAddressFull: string;
 /** Truncated wallet address for the review “Funding Wallet” row. */
  walletAddressShort: string;
  onCopyAddress: () => void;
  onOpenQrModal: () => void;
  onSendDestinationReadyChange?: (ready: boolean) => void;
 /** Recipient label for the page header transaction pill. */
  onSendDestinationToLabelChange?: (toLabel: string) => void;
  sendAsset: { symbol: string; iconSrc?: string; fallbackBg: string };
  onOpenSendAssetPicker: () => void;
 /**
 * Fires when a send sub-step (form/review/pending/success) finishes its exit transition.
 * Used to clear form state *after* “Sent” / “Sending” have animated out, avoiding a hard unmount.
 */
  onSendStepExitComplete?: () => void;
}) {
  const [destinationKind, setDestinationKind] = useState<"address" | "card" | null>(null);
  const [addressPickerOpen, setAddressPickerOpen] = useState(false);
  const [cardPickerOpen, setCardPickerOpen] = useState(false);
  const [addressInput, setAddressInput] = useState("");
  const [selectedDestination, setSelectedDestination] = useState<{ label: string; address: string } | null>(null);
  const [selectedRecentKey, setSelectedRecentKey] = useState<string | null>(null);
  const [addressSource, setAddressSource] = useState<"lastUsed" | "addressBook">("lastUsed");
  const [cardQuery, setCardQuery] = useState("");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const sendAddressScrollerRef = useRef<HTMLDivElement | null>(null);
  const sendCardScrollerRef = useRef<HTMLDivElement | null>(null);
  const [rowCopied, setRowCopied] = useState(false);
 /** True only for the render when switching Last Used / Address Book — skip per-row entrance stagger (load-in still cascades on open). */
  const suppressAddressRowCascadeRef = useRef(false);
  const [sendDestAnimNonce, setSendDestAnimNonce] = useState(0);
 /** Top mask only after scroll; at rest = bottom edge only (same rules for address + card lists). */
  const [sendAddressFade, setSendAddressFade] = useState<"flat" | "top" | "mid" | "end">("flat");
  const [sendCardFade, setSendCardFade] = useState<"flat" | "top" | "mid" | "end">("flat");

  const copyRow = useCallback(() => {
    onCopyAddress();
    setRowCopied(true);
  }, [onCopyAddress]);

  useEffect(() => {
    if (!rowCopied) return;
    const id = window.setTimeout(() => setRowCopied(false), 1200);
    return () => window.clearTimeout(id);
  }, [rowCopied]);

  const onInputChange = (value: string) => {
    const next = value.replace(/,/g, "");
    if (next === "" || /^[0-9]*\.?[0-9]*$/.test(next)) onAmountChange(next);
  };

  const availableAmount = useMemo(() => {
 // Demo-only: show a small balance to enable insufficient-funds UI states (match parent `sendAvailableAmount`).
    switch (sendAsset.symbol) {
      case "ETH":
        return 0.0009;
      case "BNB":
        return 0.004;
      case "USDC":
      case "USDT":
        return 0;
      default:
        return 0;
    }
  }, [sendAsset.symbol]);

  const amountNumber = useMemo(() => parsePositiveDecimalInput(amount), [amount]);
  const hasInsufficientFunds = amountNumber > 0 && amountNumber > availableAmount;
  const availableLabel = availableAmount > 0 && availableAmount < 0.001 ? "<0.001" : availableAmount.toLocaleString();

  const openAddressPicker = () => {
    suppressAddressRowCascadeRef.current = false;
    setDestinationKind("address");
    setCardPickerOpen(false);
    setAddressPickerOpen(true);
    setSendDestAnimNonce((n) => n + 1);
  };

  const openCardPicker = () => {
    suppressAddressRowCascadeRef.current = false;
    setDestinationKind("card");
    setAddressPickerOpen(false);
    setCardPickerOpen(true);
    setSendDestAnimNonce((n) => n + 1);
  };

  const orderedCards = useMemo(() => {
    const q = cardQuery.trim().toLowerCase();
    const filtered = DEMO_CARD_DESTINATIONS.filter((row) => {
      if (!q) return true;
      return row.label.toLowerCase().includes(q) || row.depositAddress.toLowerCase().includes(q);
    });
    filtered.sort((a, b) => (a.id === "card-1" ? -1 : b.id === "card-1" ? 1 : 0));
    return filtered;
  }, [cardQuery]);

  const updateSendAddressFade = useCallback(() => {
    const el = sendAddressScrollerRef.current;
    if (!el) return;
    const maxScrollTop = el.scrollHeight - el.clientHeight;
    const atTop = el.scrollTop <= 1;
    const atBottom = el.scrollTop >= maxScrollTop - 1;
    if (maxScrollTop <= 0) {
      setSendAddressFade("flat");
    } else if (atBottom) {
      setSendAddressFade("end");
    } else if (atTop) {
      setSendAddressFade("top");
    } else {
      setSendAddressFade("mid");
    }
  }, []);

  const updateSendCardFade = useCallback(() => {
    const el = sendCardScrollerRef.current;
    if (!el) return;
    const maxScrollTop = el.scrollHeight - el.clientHeight;
    const atTop = el.scrollTop <= 1;
    const atBottom = el.scrollTop >= maxScrollTop - 1;
    if (maxScrollTop <= 0) {
      setSendCardFade("flat");
    } else if (atBottom) {
      setSendCardFade("end");
    } else if (atTop) {
      setSendCardFade("top");
    } else {
      setSendCardFade("mid");
    }
  }, []);

  const addressRows = useMemo(() => {
    return addressSource === "addressBook" ? DEMO_ADDRESS_BOOK_DESTINATIONS : DEMO_RECENT_DESTINATIONS;
  }, [addressSource]);

  const selectedCard = useMemo(() => {
    if (!selectedCardId) return null;
    return DEMO_CARD_DESTINATIONS.find((c) => c.id === selectedCardId) ?? null;
  }, [selectedCardId]);

  const sendDestinationReady = Boolean(
    (destinationKind === "address" && selectedDestination) ||
    (destinationKind === "card" && selectedCard)
  );

  useEffect(() => {
    onSendDestinationReadyChange?.(sendDestinationReady);
  }, [sendDestinationReady, onSendDestinationReadyChange]);

  const sendToDisplay = useMemo(() => {
    if (destinationKind === "address" && selectedDestination) {
      if (selectedDestination.label?.includes(".eth")) return selectedDestination.label;
 // Hex: 0x + 4 … last 4 (headChars=6, tailChars=4)
      return truncateAddressMiddle(selectedDestination.address);
    }
    if (selectedCard) return selectedCard.label;
    return "—";
  }, [destinationKind, selectedDestination, selectedCard]);

 /** Second line under “To” when the headline is a name/ENS and the wallet address should still show. */
  const sendToAddressSubline = useMemo(() => {
    if (destinationKind === "address" && selectedDestination?.address) {
      const t = truncateAddressMiddle(selectedDestination.address);
      const label = selectedDestination.label?.trim() ?? "";
      if (label.toLowerCase().includes(".eth")) return t;
      if (label && label !== t && label !== selectedDestination.address) return t;
      return null;
    }
    if (selectedCard?.depositAddress) return truncateAddressMiddle(selectedCard.depositAddress);
    return null;
  }, [destinationKind, selectedDestination, selectedCard]);

  useEffect(() => {
    onSendDestinationToLabelChange?.(sendToDisplay);
  }, [sendToDisplay, onSendDestinationToLabelChange]);

  const commitManualAddress = useCallback(() => {
    const raw = addressInput.trim();
    if (!raw) return;
    const label = raw.includes(".") ? raw : truncateAddressMiddle(raw);
    setSelectedDestination({ label, address: raw });
    setSelectedRecentKey(null);
    setAddressPickerOpen(false);
  }, [addressInput]);

  const clearDestination = useCallback(() => {
    setSelectedDestination(null);
    setSelectedRecentKey(null);
    setSelectedCardId(null);
    setAddressInput("");
    setDestinationKind(null);
    setAddressPickerOpen(false);
    setCardPickerOpen(false);
  }, []);

  const sendDestOpen = addressPickerOpen || cardPickerOpen;
  const [destOverlayHost, setDestOverlayHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    suppressAddressRowCascadeRef.current = false;
  }, [addressSource]);

  useLayoutEffect(() => {
    setDestOverlayHost(overlayMountRef.current);
  }, [overlayMountRef, sendDestOpen, addressPickerOpen, cardPickerOpen]);

  useEffect(() => {
    onDestOverlayOpenChange?.(sendDestOpen);
  }, [sendDestOpen, onDestOverlayOpenChange]);

  useEffect(() => {
    if (!sendDestOpen) return;

 // Match asset picker: *outside* overlay → do nothing (page/ancestor scrolls). *Inside* → never chain to page.
 // Must use the raw `target` (often a Text node): `if (!(t instanceof Element)) return` broke scroll blocking.
    const inSendDestOverlay = (n: EventTarget | null) => {
      if (!(n instanceof Node)) return false;
      const start = n instanceof Element ? n : n.parentElement;
      return Boolean(start?.closest("[data-send-dest-overlay]"));
    };

    const onWheel = (event: WheelEvent) => {
      const t = event.target;
      if (!inSendDestOverlay(t)) return;

      const addressScroller = sendAddressScrollerRef.current;
      const cardScroller = sendCardScrollerRef.current;
      if (t instanceof Node) {
        if (addressScroller && addressScroller.contains(t)) {
          addressScroller.scrollTop += event.deltaY;
          event.preventDefault();
          return;
        }
        if (cardScroller && cardScroller.contains(t)) {
          cardScroller.scrollTop += event.deltaY;
          event.preventDefault();
          return;
        }
      }

      event.preventDefault();
    };

    const onTouchMove = (event: TouchEvent) => {
      const t = event.target;
      if (!inSendDestOverlay(t)) return;
      if (t instanceof Node) {
        if (sendAddressScrollerRef.current?.contains(t) || sendCardScrollerRef.current?.contains(t)) return;
      }
      event.preventDefault();
    };

    document.addEventListener("wheel", onWheel, { passive: false, capture: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
    return () => {
      document.removeEventListener("wheel", onWheel, true);
      document.removeEventListener("touchmove", onTouchMove, true);
    };
  }, [sendDestOpen]);

  useEffect(() => {
    if (!sendDestOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAddressPickerOpen(false);
        setCardPickerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sendDestOpen]);

 // Same “click outside to dismiss” behavior as the swap asset picker (see asset picker `pointerdown` handler).
  useEffect(() => {
    if (!sendDestOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const t = event.target;
      if (!(t instanceof Element)) return;
      if (t.closest("[data-send-dest-panel]")) return;
      if (t.closest("[data-send-dest-trigger]")) return;
      setAddressPickerOpen(false);
      setCardPickerOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [sendDestOpen]);

  useEffect(() => {
    if (!sendDestOpen) return;
    const id = window.requestAnimationFrame(() => {
      updateSendAddressFade();
      updateSendCardFade();
    });
    return () => window.cancelAnimationFrame(id);
  }, [
    sendDestOpen,
    addressPickerOpen,
    cardPickerOpen,
 // Content height can change (tabs/search/query) without toggling the overlay.
    addressSource,
    addressInput,
    cardQuery,
    addressRows.length,
    updateSendAddressFade,
    updateSendCardFade,
  ]);

  const sendDestOverlayPortal = destOverlayHost
    ? createPortal(
      <AnimatePresence>{/* `initial` must default true or nested address rows skip enter on first open */}
        {sendDestOpen ? (
          <motion.div
            key="send-dest-overlay"
            className="absolute -inset-px z-[260] bg-[var(--color-bg-asset-picker-panel)] p-4 sm:p-5"
            style={{ overscrollBehavior: "contain" }}
            data-send-dest-overlay
            initial={WALLET_PICKER_OVERLAY_MOTION.initial}
            animate={WALLET_PICKER_OVERLAY_MOTION.animate}
            exit={WALLET_PICKER_OVERLAY_MOTION.exit}
            onClick={() => {
              setAddressPickerOpen(false);
              setCardPickerOpen(false);
            }}
          >
            <div
              data-send-dest-panel
              className={cn(
                WALLET_GLASS_MENU_CONTENT,
                "!p-0",
                "h-full w-full min-h-0 flex flex-col overflow-hidden",
                CARD_RADIUS,
                "!bg-[var(--color-bg-asset-picker-panel)]",
                "!border-white/[0.075]"
              )}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              {(() => {
                const EASE = [0.16, 1, 0.3, 1] as const;
                const STEP_DELAY = 0.09;
                const STEP_DURATION = 0.32;
                const CASCADE_START = 0.26;

                if (addressPickerOpen) {
                  return (
                    <div
                      key={`send-dest-address-body-${sendDestAnimNonce}`}
                      className="flex h-full min-h-0 flex-col"
                    >
                      <motion.div
                        className="flex items-center justify-between gap-3 px-4 pb-2 pt-3 transform-gpu"
                        style={{ willChange: "transform, opacity" }}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: CASCADE_START, duration: STEP_DURATION, ease: EASE }}
                      >
                        <p className="text-sm font-semibold text-[var(--color-text-primary)]">Send to</p>
                      </motion.div>

                      <motion.div
                        className="px-4 pb-0 transform-gpu"
                        style={{ willChange: "transform, opacity" }}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: CASCADE_START + STEP_DELAY, duration: STEP_DURATION, ease: EASE }}
                      >
                        <div className="grid grid-cols-2 gap-2 rounded-[14px] bg-white/[0.04] p-1">
                          {(
                            [
                              ["lastUsed", "Last Used"],
                              ["addressBook", "Address Book"],
                            ] as const
                          ).map(([key, label]) => {
                            const active = addressSource === key;
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => {
                                  if (addressSource === key) return;
                                  suppressAddressRowCascadeRef.current = true;
                                  setAddressSource(key);
                                }}
                                className={cn(
                                  "h-9 rounded-[12px] text-[12px] font-semibold transition-colors",
                                  active
                                    ? "bg-white/[0.08] text-white"
                                    : "bg-transparent text-white/55 hover:text-white"
                                )}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>

                      <div className="relative mt-4 flex min-h-0 flex-1 flex-col pb-4 [overflow-anchor:none]">
                        <div
                          ref={sendAddressScrollerRef}
                          data-send-dest-list-scroll="address"
                          onScroll={updateSendAddressFade}
                          className={cn(
 // No transform on the scrollport: it breaks mask compositing in WebKit.
 // Top+feather is relative to the viewport, not the document — fixes hard clip while scrolling.
 // 16px switch→search: mt-4 on scroll parent. No top mask until user scrolls (see sendAddressFade).
                            "relative z-0 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2 pt-0 scrollbar-autohide scroll-gutter-stable",
                            sendAddressFade === "top" &&
                            "[mask-image:linear-gradient(to_bottom,black_0,black_calc(100%-16px),transparent_100%)]",
                            sendAddressFade === "top" &&
                            "[-webkit-mask-image:linear-gradient(to_bottom,black_0,black_calc(100%-16px),transparent_100%)]",
                            sendAddressFade === "mid" &&
                            "[mask-image:linear-gradient(to_bottom,transparent_0,black_12px,black_calc(100%-16px),transparent_100%)]",
                            sendAddressFade === "mid" &&
                            "[-webkit-mask-image:linear-gradient(to_bottom,transparent_0,black_12px,black_calc(100%-16px),transparent_100%)]",
                            sendAddressFade === "end" &&
                            "[mask-image:linear-gradient(to_bottom,transparent_0,black_12px,black_100%)]",
                            sendAddressFade === "end" &&
                            "[-webkit-mask-image:linear-gradient(to_bottom,transparent_0,black_12px,black_100%)]"
                          )}
                        >
                          <motion.div
                            className="pb-3 transform-gpu"
                            style={{ willChange: "transform, opacity" }}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: CASCADE_START + STEP_DELAY * 2, duration: STEP_DURATION, ease: EASE }}
                          >
                            <div className="flex h-11 items-center gap-2 rounded-[14px] bg-white/[0.04] px-3">
                              <input
                                value={addressInput}
                                onChange={(e) => setAddressInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    commitManualAddress();
                                  }
                                }}
                                placeholder="Address or ENS"
                                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] font-medium text-[var(--color-text-primary)] outline-none placeholder:text-white/30"
                              />
                              <button
                                type="button"
                                onClick={async () => {
                                  if (addressInput.trim()) {
                                    commitManualAddress();
                                    return;
                                  }
                                  try {
                                    const text = await navigator.clipboard.readText();
                                    if (text) setAddressInput(text.trim());
                                  } catch {
 // ignore
                                  }
                                }}
                                className={cn(
                                  "inline-flex h-7 items-center justify-center rounded-full px-2.5 text-[11px] font-semibold transition-colors",
                                  addressInput.trim()
                                    ? "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90"
                                    : "bg-white/[0.05] text-white/80 hover:bg-white/[0.07] hover:text-white"
                                )}
                                aria-label={addressInput.trim() ? "Use address" : "Paste"}
                              >
                                {addressInput.trim() ? "Use" : "Paste"}
                              </button>
                            </div>
                          </motion.div>

                          <div className="flex flex-col gap-1.5 pt-0">
                            {addressRows.map((row, i) => {
                              const active = selectedRecentKey === row.label;
                              const usedCount = "usedCount" in row ? row.usedCount : undefined;
                              return (
                                <motion.button
                                  key={row.label}
                                  type="button"
                                  onClick={() => {
                                    setSelectedRecentKey(row.label);
                                    setAddressInput(row.address);
                                    setSelectedDestination({ label: row.label, address: row.address });
                                    setAddressPickerOpen(false);
                                  }}
                                  className={cn(
                                    "flex w-full items-center justify-between gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors",
                                    active ? "bg-white/[0.04]" : "hover:bg-white/[0.04]"
                                  )}
                                  initial={
                                    suppressAddressRowCascadeRef.current ? false : { opacity: 0, y: 3 }
                                  }
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={
                                    suppressAddressRowCascadeRef.current
                                      ? { duration: 0.2, delay: 0, ease: EASE }
                                      : {
                                        delay: CASCADE_START + STEP_DELAY * (3 + i),
                                        duration: STEP_DURATION,
                                        ease: EASE,
                                      }
                                  }
                                >
                                  <div className="flex min-w-0 items-center gap-3">
                                    <DemoDestinationAvatar seed={row.label} />
                                    <div className="min-w-0">
                                      <p className="truncate text-[14px] font-semibold text-[var(--color-text-primary)]">
                                        {row.label}
                                      </p>
                                      <p className="mt-0.5 truncate font-mono text-[13px] font-semibold text-white/70">
                                        {row.address}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-2">
                                    {typeof usedCount === "number" ? (
                                      <span className="text-[11px] font-semibold text-white/40">
                                        Used {usedCount} {usedCount === 1 ? "time" : "times"}
                                      </span>
                                    ) : null}
                                    {active ? <Check className="h-4 w-4 text-white/80" strokeWidth={2.25} /> : null}
                                  </div>
                                </motion.button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

 // Cards
                return (
                  <div
                    key={`send-dest-card-body-${sendDestAnimNonce}`}
                    className="flex h-full min-h-0 flex-col"
                  >
                    <motion.div
                      className="flex min-h-0 items-center justify-between gap-2 px-4 pb-3 pt-3 transform-gpu"
                      style={{ willChange: "transform, opacity" }}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: CASCADE_START, duration: STEP_DURATION, ease: EASE }}
                    >
                      <p className="min-w-0 shrink truncate text-sm font-semibold text-[var(--color-text-primary)]">
                        Select card
                      </p>
                      <div className="h-8 w-[min(9.25rem,38vw)] shrink-0 rounded-[12px] bg-white/[0.04] pl-2 pr-2.5 sm:w-40">
                        <div className="flex h-full min-w-0 items-center gap-1.5">
                          <Search className="h-3.5 w-3.5 shrink-0 text-white/35" strokeWidth={2} aria-hidden />
                          <input
                            value={cardQuery}
                            onChange={(e) => setCardQuery(e.target.value)}
                            placeholder="Search"
                            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[12px] font-medium text-[var(--color-text-primary)] outline-none placeholder:text-white/30"
                            aria-label="Search cards"
                          />
                        </div>
                      </div>
                    </motion.div>

                    <div className="relative flex min-h-0 flex-1 flex-col pb-4 [overflow-anchor:none]">
                      <div
                        ref={sendCardScrollerRef}
                        data-send-dest-list-scroll="card"
                        onScroll={updateSendCardFade}
                        className={cn(
                          "relative z-0 min-h-0 flex-1 overflow-y-auto overscroll-contain pt-0 pb-2 scrollbar-autohide scroll-gutter-stable",
                          sendCardFade === "top" &&
                          "[mask-image:linear-gradient(to_bottom,black_0,black_calc(100%-16px),transparent_100%)]",
                          sendCardFade === "top" &&
                          "[-webkit-mask-image:linear-gradient(to_bottom,black_0,black_calc(100%-16px),transparent_100%)]",
                          sendCardFade === "mid" &&
                          "[mask-image:linear-gradient(to_bottom,transparent_0,black_12px,black_calc(100%-16px),transparent_100%)]",
                          sendCardFade === "mid" &&
                          "[-webkit-mask-image:linear-gradient(to_bottom,transparent_0,black_12px,black_calc(100%-16px),transparent_100%)]",
                          sendCardFade === "end" &&
                          "[mask-image:linear-gradient(to_bottom,transparent_0,black_12px,black_100%)]",
                          sendCardFade === "end" &&
                          "[-webkit-mask-image:linear-gradient(to_bottom,transparent_0,black_12px,black_100%)]"
                        )}
                      >
                        {orderedCards.length === 0 ? (
                          <div className="flex h-full min-h-[140px] flex-col items-center justify-center px-4 text-center">
                            <p className="text-[15px] font-semibold text-[var(--color-text-primary)]">Nothing Here</p>
                            <p className="mt-1 text-[12px] font-semibold text-white/45">Try a different search</p>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1.5 px-4">
                            {orderedCards.map((row, i) => {
                              const active = selectedCardId === row.id;
                              const isPrimary = row.id === "card-1";
                              return (
                                <motion.button
                                  key={row.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedCardId(row.id);
                                    setCardPickerOpen(false);
                                    setDestinationKind("card");
                                  }}
                                  className={cn(
                                    "flex w-full items-center justify-between gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors",
                                    isPrimary
                                      ? "border border-white/[0.06] bg-white/[0.04]"
                                      : "border border-transparent bg-transparent",
                                    active
                                      ? "ring-1 ring-inset ring-[var(--color-primary)]/35"
                                      : "hover:bg-white/[0.04]"
                                  )}
                                  initial={{ opacity: 0, y: 3 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{
                                    delay: CASCADE_START + STEP_DELAY * (1 + i),
                                    duration: STEP_DURATION,
                                    ease: EASE,
                                  }}
                                >
                                  <div className="flex min-w-0 flex-1 items-start gap-3">
                                    <span
                                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                                      style={{ backgroundColor: row.tint }}
                                      aria-hidden
                                    >
                                      <CreditCard className="h-[18px] w-[18px] text-white" strokeWidth={2} />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex min-w-0 items-center gap-2">
                                        <p className="truncate text-[14px] font-semibold text-[var(--color-text-primary)]">
                                          {row.label}
                                        </p>
                                        {isPrimary ? (
                                          <span className="shrink-0 text-[12px] font-semibold text-white/45">(My Card)</span>
                                        ) : null}
                                      </div>
                                      <p className="mt-0.5 truncate font-mono text-[12px] font-semibold text-white/55">
                                        {row.depositAddress}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex shrink-0 items-start gap-3 pt-[2px]">
                                    <p className="text-[12px] font-semibold text-white/60 tabular-nums">
                                      {formatUsd(row.balanceUsd)}
                                    </p>
                                    {active ? <Check className="h-4 w-4 text-white/80" strokeWidth={2.25} /> : null}
                                  </div>
                                </motion.button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>,
      destOverlayHost
    )
    : null;

  return (
    <>
      {sendDestOverlayPortal}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
        <AnimatePresence
          mode="wait"
          initial={false}
          custom={sendStepTransitionDir}
          onExitComplete={onSendStepExitComplete}
        >
          {sendFlowStep === "form" ? (
            <motion.div
              key="send-form"
              className="flex min-h-0 min-w-0 flex-1 flex-col"
              custom={sendStepTransitionDir}
              variants={SEND_STEP_SLIDE_VARIANTS}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: SEND_STEP_SLIDE_EASE }}
            >
              <h1 className="mb-2 shrink-0 text-left text-base font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-[17px]">
                Send Crypto
              </h1>
              <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-lg)] bg-white/[0.04] py-3 pl-4 pr-3 sm:py-4 sm:pl-5 sm:pr-3.5">
                  <div className="flex min-h-0 min-w-0 flex-1 items-center justify-between gap-2">
                    <div className="min-h-0 min-w-0 flex-1 overflow-hidden pl-0 text-left flex flex-col justify-center">
                      <label className="m-0 block min-w-0 p-0">
                        <span className="sr-only">Send amount</span>
                        <input
                          value={amount}
                          onChange={(e) => onInputChange(e.target.value)}
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="0"
                          aria-label="Send amount"
                          className={cn(
                            "m-0 w-full min-w-0 max-w-full border-0 bg-transparent p-0",
                            "truncate text-[22px] font-semibold leading-none tabular-nums sm:text-[26px]",
                            hasInsufficientFunds ? "text-[var(--color-error)]" : "text-[var(--color-text-primary)]",
                            "outline-none ring-0 focus:ring-0 focus:outline-none",
                            "[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [appearance:textfield]",
                            "placeholder:text-[var(--color-text-muted)]"
                          )}
                        />
                      </label>
                      <p className="mt-1 truncate font-mono text-[11px] leading-tight text-[var(--color-text-muted)]" title={amountUsd}>
                        {amountUsd}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5 self-center">
                      <span
                        className={cn(
                          "mr-1 shrink-0 font-mono text-[11px] font-semibold tabular-nums",
                          hasInsufficientFunds ? "text-[var(--color-error)]" : "text-white/45"
                        )}
                        aria-label={`Available balance: ${availableLabel}`}
                      >
                        {availableLabel}
                      </span>
                      <button
                        type="button"
                        onClick={onOpenSendAssetPicker}
                        className="inline-flex h-8 shrink-0 items-center gap-1 overflow-visible rounded-full border border-transparent bg-white/[0.05] px-[5px] py-0 text-[11px] font-semibold text-[var(--color-text-primary)] sm:h-9 sm:px-[6px] sm:text-xs"
                        aria-label={`Asset: ${sendAsset.symbol}`}
                      >
                        {sendAsset.iconSrc ? (
                          <img
                            src={sendAsset.iconSrc}
                            alt=""
                            className={cn(
                              "h-5 w-5 shrink-0 sm:h-6 sm:w-6",
                              isBaseEthCompositeIconSrc(sendAsset.iconSrc) ? "object-contain" : "rounded-full object-cover"
                            )}
                            width={24}
                            height={24}
                          />
                        ) : (
                          <span className={cn("h-5 w-5 shrink-0 rounded-full sm:h-6 sm:w-6", sendAsset.fallbackBg)} aria-hidden />
                        )}
                        {sendAsset.symbol}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2 px-0.5">
                  <div
                    className="h-px min-w-0 flex-1 bg-gradient-to-r from-transparent via-white/[0.09] to-white/[0.14]"
                    aria-hidden
                  />
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    To
                  </span>
                  <div
                    className="h-px min-w-0 flex-1 bg-gradient-to-r from-white/[0.14] via-white/[0.09] to-transparent"
                    aria-hidden
                  />
                </div>

                <div className="flex shrink-0 flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={openAddressPicker}
                    data-send-dest-trigger
                    className={cn(
                      sendDestinationRowButtonClass,
                      destinationKind === "address" && selectedDestination && "bg-white/[0.02] border-[var(--color-primary)]/70"
                    )}
                  >
                    {selectedDestination ? (
                      <>
                        <DemoDestinationAvatar seed={selectedDestination.label} />
                        <span className="min-w-0 flex-1 overflow-hidden text-left">
                          <span className="block truncate text-sm font-semibold text-[var(--color-text-primary)]">
                            {selectedDestination.label}
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-[10px] font-semibold text-white/60">
                            {truncateAddressMiddle(selectedDestination.address)}
                          </span>
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            clearDestination();
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              clearDestination();
                            }
                          }}
                          className="inline-flex h-8 w-8 cursor-pointer shrink-0 items-center justify-center rounded-[10px] text-white/50 hover:text-white"
                          aria-label="Clear destination"
                        >
                          <X className="h-4 w-4" strokeWidth={2} aria-hidden />
                        </span>
                      </>
                    ) : (
                      <>
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-white/[0.05] text-[var(--color-text-primary)]"
                          aria-hidden
                        >
                          <AtSign className="h-5 w-5" strokeWidth={2} />
                        </span>
                        <span className="min-w-0 text-sm font-semibold text-[var(--color-text-primary)]">Address</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={openCardPicker}
                    data-send-dest-trigger
                    className={cn(
                      sendDestinationRowButtonClass,
                      destinationKind === "card" && selectedCard && "bg-white/[0.02] border-[var(--color-primary)]/70"
                    )}
                  >
                    {selectedCard ? (
                      <>
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-white/[0.05] text-[var(--color-text-primary)]"
                          aria-hidden
                        >
                          <CreditCard className="h-5 w-5" strokeWidth={2} />
                        </span>
                        <span className="min-w-0 flex-1 overflow-hidden text-left">
                          <span className="block truncate text-sm font-semibold text-[var(--color-text-primary)]">
                            {selectedCard.label}
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-[10px] font-semibold text-white/60">
                            {truncateAddressMiddle(selectedCard.depositAddress)}
                          </span>
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            clearDestination();
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              clearDestination();
                            }
                          }}
                          className="inline-flex h-8 w-8 cursor-pointer shrink-0 items-center justify-center rounded-[10px] text-white/50 hover:text-white"
                          aria-label="Clear destination"
                        >
                          <X className="h-4 w-4" strokeWidth={2} aria-hidden />
                        </span>
                      </>
                    ) : (
                      <>
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-white/[0.05] text-[var(--color-text-primary)]"
                          aria-hidden
                        >
                          <CreditCard className="h-5 w-5" strokeWidth={2} />
                        </span>
                        <span className="min-w-0 text-sm font-semibold text-[var(--color-text-primary)]">My Cards</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          ) : sendFlowStep === "review" ? (
            <motion.div
              key="send-review"
              className="flex min-h-0 min-w-0 flex-1 flex-col"
              custom={sendStepTransitionDir}
              variants={SEND_STEP_SLIDE_VARIANTS}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: SEND_STEP_SLIDE_EASE }}
            >
              <h1 className="mb-4 shrink-0 text-left text-base font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-[17px]">
                You&apos;re sending
              </h1>
              <motion.div
                className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-hidden pl-4 pr-4"
                variants={SEND_REVIEW_CASCADE as Variants}
                initial="hidden"
                animate="show"
              >
                <motion.div
                  className="flex min-w-0 items-start justify-between gap-4"
                  variants={SEND_REVIEW_CASCADE_ITEM}
                >
                  <div className="min-w-0">
                    <p className="text-lg font-semibold leading-tight text-[var(--color-text-primary)] tabular-nums sm:text-xl">
                      {formatSendEthDisplay(amount)} {sendAsset.symbol}
                    </p>
                    <p className="mt-1.5 font-mono text-[11px] text-[var(--color-text-muted)] tabular-nums">
                      {amountUsd}
                    </p>
                  </div>
                  {sendAsset.iconSrc ? (
                    <img
                      src={sendAsset.iconSrc}
                      alt=""
                      className="h-9 w-9 shrink-0 object-contain"
                      width={36}
                      height={36}
                    />
                  ) : (
                    <span
                      className={cn("h-9 w-9 shrink-0", sendAsset.fallbackBg)}
                      aria-hidden
                    />
                  )}
                </motion.div>
                <motion.div
                  className="mt-2 flex justify-start pl-0.5"
                  variants={SEND_REVIEW_CASCADE_ITEM}
                  aria-hidden
                >
                  <ArrowDown className="h-3.5 w-3.5 text-white/30" strokeWidth={2.25} />
                </motion.div>
                <motion.div
                  className="mt-2 flex min-w-0 items-start justify-between gap-4"
                  variants={SEND_REVIEW_CASCADE_ITEM}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight text-[var(--color-text-primary)]">
                      {destinationKind === "address" && selectedDestination
                        ? selectedDestination.label
                        : selectedCard
                          ? selectedCard.label
                          : "—"}
                    </p>
                    <p className="mt-1.5 font-mono text-[11px] text-[var(--color-text-muted)]">
                      {destinationKind === "address" && selectedDestination
                        ? truncateAddressMiddle(selectedDestination.address)
                        : selectedCard
                          ? truncateAddressMiddle(selectedCard.depositAddress)
                          : "—"}
                    </p>
                  </div>
                  {destinationKind === "address" && selectedDestination ? (
                    <div className="shrink-0">
                      <DemoDestinationAvatar seed={selectedDestination.label} />
                    </div>
                  ) : selectedCard ? (
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: selectedCard.tint }}
                      aria-hidden
                    >
                      <Star className="h-[16px] w-[16px] text-white" fill="currentColor" strokeWidth={0} />
                    </div>
                  ) : null}
                </motion.div>
                <motion.div
                  className="mt-3.5 h-px w-full bg-white/10"
                  variants={SEND_REVIEW_CASCADE_ITEM}
                />
                <motion.div
                  className="mt-3 flex min-w-0 items-center justify-between gap-2 text-[12px]"
                  variants={SEND_REVIEW_CASCADE_ITEM}
                >
                  <span className="flex min-w-0 items-center gap-1 text-[var(--color-text-muted)]">
                    Network cost
                    <Info className="h-3.5 w-3.5 shrink-0 text-white/35" strokeWidth={2} aria-hidden />
                  </span>
                  <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold tabular-nums text-[var(--color-text-primary)]">
                    {sendAsset.iconSrc ? (
                      <img
                        src={sendAsset.iconSrc}
                        alt=""
                        className="h-3.5 w-3.5 object-contain"
                        width={14}
                        height={14}
                      />
                    ) : (
                      <span className={cn("h-3.5 w-3.5", sendAsset.fallbackBg)} aria-hidden />
                    )}
                    {formatUsd(DEMO_SEND_NETWORK_FEE_USD)}
                  </span>
                </motion.div>
                <motion.div
                  className="mt-3 flex min-w-0 items-start justify-between gap-2 text-[12px]"
                  variants={SEND_REVIEW_CASCADE_ITEM}
                >
                  <span className="pt-0.5 text-[var(--color-text-muted)]">Funding Wallet</span>
                  <div className="flex min-w-0 max-w-[75%] flex-col items-end gap-0.5 text-right">
                    <span className="w-full min-w-0 truncate font-medium text-[var(--color-text-primary)]">
                      {walletLabel}
                    </span>
                    {walletAddressShort ? (
                      <p
                        className="w-full max-w-full font-mono text-[10px] text-[var(--color-text-muted)]"
                        title={walletAddressShort}
                      >
                        {walletAddressShort}
                      </p>
                    ) : null}
                  </div>
                </motion.div>
              </motion.div>
            </motion.div>
          ) : sendFlowStep === "pending" ? (
            <motion.div
              key="send-pending"
              className="flex min-h-0 min-w-0 flex-1 flex-col"
              custom={sendStepTransitionDir}
              variants={SEND_STEP_SLIDE_VARIANTS}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: SEND_STEP_SLIDE_EASE }}
            >
              <h1 className="sr-only">Sending</h1>
              <div
                className="flex min-h-0 flex-1 flex-col items-center justify-center px-3 py-6 text-center"
                role="status"
                aria-live="polite"
                aria-label={
                  sendToAddressSubline
                    ? `Sending ${formatSendEthDisplay(amount)} ${sendAsset.symbol} to ${sendToDisplay}, ${sendToAddressSubline}`
                    : `Sending ${formatSendEthDisplay(amount)} ${sendAsset.symbol} to ${sendToDisplay}`
                }
              >
                <div className="flex shrink-0 items-center justify-center">
                  {sendAsset.iconSrc ? (
                    <img
                      src={sendAsset.iconSrc}
                      alt=""
                      className="h-10 w-10 max-h-none max-w-none shrink-0 object-contain sm:h-11 sm:w-11"
                      width={44}
                      height={44}
                    />
                  ) : (
                    <span className={cn("h-10 w-10 shrink-0 rounded-full sm:h-11 sm:w-11", sendAsset.fallbackBg)} aria-hidden />
                  )}
                </div>
                <p className="mt-5 text-xl font-semibold tabular-nums text-[var(--color-text-primary)] sm:text-2xl">
                  {formatSendEthDisplay(amount)} {sendAsset.symbol}
                </p>
                <p className="mt-1.5 font-mono text-sm text-[var(--color-text-muted)] tabular-nums sm:text-[15px]">
                  {amountUsd}
                </p>
                <p className="mt-8 text-[11px] font-medium uppercase tracking-wide text-white/45">To</p>
                <p className="mt-1.5 max-w-full text-[15px] font-semibold leading-snug text-[var(--color-text-primary)] sm:text-base [overflow-wrap:anywhere]">
                  {sendToDisplay}
                </p>
                {sendToAddressSubline ? (
                  <p className="mt-1 max-w-full font-mono text-xs leading-snug text-[var(--color-text-muted)] tabular-nums [overflow-wrap:anywhere]">
                    {sendToAddressSubline}
                  </p>
                ) : null}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="send-success"
              className="flex min-h-0 min-w-0 flex-1 flex-col"
              custom={sendStepTransitionDir}
              variants={SEND_STEP_SLIDE_VARIANTS}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: SEND_STEP_SLIDE_EASE }}
            >
              <h1 className="shrink-0 text-left text-base font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-[17px]">
                Sent
              </h1>
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
                <img
                  src="/Success_Square.svg"
                  alt=""
                  className="h-16 w-auto max-w-full shrink-0 object-contain sm:h-20"
                  width={156}
                  height={168}
                />
                <p className="mt-3 text-[22px] font-semibold leading-tight tabular-nums text-[var(--color-text-primary)] sm:mt-4 sm:text-3xl">
                  {formatSendEthDisplay(amount)} {sendAsset.symbol}
                </p>
                <p className="mt-1.5 font-mono text-sm text-white/50 tabular-nums">{amountUsd}</p>
                <button
                  type="button"
                  onClick={() =>
                    window.open(DEMO_SEND_TX_EXPLORER_URL, "_blank", "noopener,noreferrer")
                  }
                  className="mt-2 border-0 bg-transparent p-0 text-sm font-semibold text-[var(--color-primary)] shadow-none ring-0 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30"
                >
                  View transaction
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

export {
  ReceiveCryptoFirstPassBody,
  SendCryptoFirstPassBody,
  NotEnoughBalanceInfoOverlay,
  receiveShellBackButtonClass,
  receiveShellIconButtonClass,
  sendReceiveCascadeContainer,
  sendReceiveCascadeItem,
  walletSwapShellMotion,
  formatSendEthDisplay,
  truncateAddressMiddle,
  useWalletDisplayLabel,
  WalletPanelGasInline,
  DEMO_SEND_NETWORK_FEE_USD,
};
