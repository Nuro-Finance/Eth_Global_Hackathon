"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useCreateWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { Check, CheckCircle2, Copy, Eye, EyeOff, Globe, RefreshCw, Wallet } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import {
  walletModalFlowLayerVariants,
  walletModalItemCascadeVariants,
} from "@/components/createWalletModalMotion";
import { DataStatusPill, InlineAlert, PageHeader, PageTitle } from "@/components";
import { CreateWalletModal } from "@/components/CreateWalletModal";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import * as WalletQuitDialog from "@radix-ui/react-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { usePrivyRuntime } from "@/providers/PrivyRuntimeContext";
import type { DataState } from "@/lib/dataState";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { DESIGN_MODE } from "@/config/design-mode";
import { writeDevPopulatedPreview } from "@/lib/devPreviewMode";
import { useDevPreviewMode } from "@/providers/DevPreviewModeProvider";
import {
  ConnectedWalletDashboard,
  DEMO_CONNECTED_WALLET_ADDRESS,
  type SendTransactionToolbarEvent,
} from "./ConnectedWalletDashboard";

const privyConfigured = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
const IS_DEV = process.env.NODE_ENV === "development";
const SUPPORTED_NETWORKS = [
  { id: "ethereum", label: "Ethereum", iconSrc: "/Eth Coin.svg", glow: "rgba(180, 135, 255, 1.0)" }, // brighter purple (no size change)
  { id: "base", label: "Base", iconSrc: "/Base Coin.svg", glow: "rgba(120, 190, 255, 1.0)" }, // light blue (not white) for dark bg
  { id: "solana", label: "Solana", iconSrc: "/SOL Coin.svg", glow: "rgba(255, 255, 255, 0.70)" }, // white
  { id: "bnb", label: "BNB", iconSrc: "/BNB Coin.svg", glow: "rgba(243, 186, 47, 0.92)" }, // yellow
] as const;

const RECOVERY_WORDS_FALLBACK = [
  "atom",
  "balance",
  "canvas",
  "drift",
  "ember",
  "fable",
  "glide",
  "harbor",
  "impact",
  "jungle",
  "kernel",
  "lumen",
  "motion",
  "native",
  "orbit",
  "pulse",
  "quantum",
  "river",
  "signal",
  "timber",
  "unify",
  "velvet",
  "wander",
  "zenith",
] as const;

const CONFETTI_PALETTE = [
  "rgba(251, 191, 36, 0.95)",
  "rgba(236, 72, 153, 0.92)",
  "rgba(56, 189, 248, 0.9)",
  "rgba(167, 139, 250, 0.92)",
  "rgba(255, 255, 255, 0.9)",
  "rgba(52, 211, 153, 0.88)",
  "rgba(251, 113, 133, 0.9)",
  "rgba(253, 224, 71, 0.88)",
] as const;

function seeded01(i: number, salt: number) {
  const x = Math.sin(i * 12.9898 + salt * 78.233 + 42) * 43758.5453;
  return x - Math.floor(x);
}

type CreateWalletModalStep =
  | "start"
  | "terms"
  | "networks"
  | "password"
  | "creating"
  | "recovery"
  | "quiz"
  | "success";

function shouldWarnBeforeLeavingCreateWallet(step: CreateWalletModalStep): boolean {
  return (
    step === "terms" ||
    step === "networks" ||
    step === "password" ||
    step === "creating"
  );
}

function CreateWalletQuitConfirmDialog({
  open,
  onStay,
  onLeave,
}: {
  open: boolean;
  onStay: () => void;
  onLeave: () => void;
}) {
  return (
    <WalletQuitDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onStay();
      }}
    >
      <WalletQuitDialog.Portal>
        <WalletQuitDialog.Overlay className="fixed inset-0 z-[115] bg-[var(--color-bg-modal-overlay)] animate-in fade-in duration-300" />
        <WalletQuitDialog.Content
          className="fixed left-1/2 top-1/2 z-[120] w-full max-w-[368px] -translate-x-1/2 -translate-y-1/2 rounded-[20px] border border-[var(--color-border-glass)] bg-[var(--color-bg-glass)] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.4)] animate-in zoom-in-95 fade-in duration-300 backdrop-blur-xl focus:outline-none"
          style={{ WebkitBackdropFilter: "blur(25px)", backdropFilter: "blur(25px)" }}
        >
          <div className="flex w-full flex-col text-left">
            <WalletQuitDialog.Title className="text-lg font-semibold leading-none tracking-tight text-[var(--color-text-primary)]">
              Leave wallet setup?
            </WalletQuitDialog.Title>
            <WalletQuitDialog.Description className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">
              If you leave now your progress will be lost
            </WalletQuitDialog.Description>
            <div className="mt-8 flex w-full items-center gap-3">
              <button
                type="button"
                onClick={onLeave}
                className="flex-1 rounded-[12px] border border-white/20 bg-transparent px-4 py-2.5 text-[14px] font-medium text-[var(--color-text-primary)] transition-all hover:bg-white/5"
              >
                Leave
              </button>
              <button
                type="button"
                onClick={onStay}
                className="flex-1 rounded-[12px] border border-white/10 bg-white/10 px-4 py-2.5 text-[14px] font-semibold text-[var(--color-text-primary)] transition-all hover:bg-white/[0.14]"
              >
                Stay
              </button>
            </div>
          </div>
        </WalletQuitDialog.Content>
      </WalletQuitDialog.Portal>
    </WalletQuitDialog.Root>
  );
}

type ConfettiPieceConfig = {
  id: number;
  size: number;
  color: string;
  shape: "rect" | "round" | "star";
  x: number;
  y: number;
  rotate: number;
  floatDuration: number;
};

/** Slower, calmer burst; shared ease for position so motion stays smooth (no snappy overshoot). */
const BURST_DURATION = 1.12;
const BURST_EASE: [number, number, number, number] = [0.34, 0.02, 0.2, 1];

function ConfettiPiece({ p }: { p: ConfettiPieceConfig }) {
  const [resting, setResting] = useState(false);

  return (
    <motion.div
      className="absolute -translate-x-1/2 -translate-y-1/2 will-change-transform"
      style={{
        width: p.shape === "rect" ? p.size * 1.25 : p.size,
        height: p.shape === "rect" ? p.size * 0.42 : p.size,
        zIndex: 5,
      }}
      initial={{
        left: "50%",
        top: "50%",
        scale: 0,
        opacity: 0,
        rotate: 0,
        y: 0,
      }}
      animate={
        resting
          ? {
              left: `${p.x}%`,
              top: `${p.y}%`,
              scale: 1,
              opacity: 1,
              rotate: p.rotate,
              y: [0, -2, 0],
            }
          : {
              left: `${p.x}%`,
              top: `${p.y}%`,
              scale: 1,
              opacity: 1,
              rotate: p.rotate,
              y: 0,
            }
      }
      transition={
        resting
          ? {
              left: { duration: 0 },
              top: { duration: 0 },
              scale: { duration: 0 },
              opacity: { duration: 0 },
              rotate: { duration: 0 },
              y: {
                repeat: Infinity,
                duration: p.floatDuration,
                ease: [0.42, 0, 0.58, 1],
              },
            }
          : {
              left: { duration: BURST_DURATION, ease: BURST_EASE },
              top: { duration: BURST_DURATION, ease: BURST_EASE },
              scale: { duration: BURST_DURATION * 0.55, ease: [0.33, 0, 0.2, 1] },
              opacity: { duration: BURST_DURATION * 0.45, ease: "easeOut" },
              rotate: { duration: BURST_DURATION * 1.08, ease: [0.4, 0, 0.2, 1] },
              y: { duration: 0 },
            }
      }
      onAnimationComplete={() => {
        if (!resting) setResting(true);
      }}
    >
      {p.shape === "star" ? (
        <svg viewBox="0 0 24 24" className="h-full w-full drop-shadow-[0_0_4px_rgba(255,255,255,0.35)]" fill="none">
          <path
            d="M12 2.8l2.25 6.1 6.45.25-5.05 3.85 1.7 6.25L12 15.9 6.65 19.25l1.7-6.25L3.3 9.15l6.45-.25L12 2.8Z"
            fill={p.color}
          />
        </svg>
      ) : p.shape === "rect" ? (
        <div
          className="h-full w-full rounded-[2px] shadow-[0_0_8px_rgba(255,255,255,0.12)]"
          style={{ backgroundColor: p.color }}
        />
      ) : (
        <div
          className="h-full w-full rounded-full shadow-[0_0_6px_rgba(255,255,255,0.1)]"
          style={{ backgroundColor: p.color }}
        />
      )}
    </motion.div>
  );
}

/** Radial burst from center — single simultaneous pop, then subtle idle float. */
function SuccessConfetti() {
  const particles = useMemo((): ConfettiPieceConfig[] => {
    const n = 20;
    const shapes = ["rect", "round", "star"] as const;
    return Array.from({ length: n }, (_, i) => {
      const baseAngle = (i / n) * Math.PI * 2;
      const angle = baseAngle + (seeded01(i, 1) - 0.5) * 0.85;
      const dist = 30 + seeded01(i, 2) * 28;
      const x = Math.min(96, Math.max(4, 50 + Math.cos(angle) * dist * 0.92));
      const y = Math.min(94, Math.max(6, 50 + Math.sin(angle) * dist));
      return {
        id: i,
        size: 3 + seeded01(i, 3) * 5,
        color: CONFETTI_PALETTE[i % CONFETTI_PALETTE.length],
        shape: shapes[i % 3],
        x,
        y,
        rotate: seeded01(i, 4) * 200 - 100,
        floatDuration: 2.45 + seeded01(i, 5) * 1.2,
      };
    });
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-visible">
      {particles.map((p) => (
        <ConfettiPiece key={p.id} p={p} />
      ))}
    </div>
  );
}

function makeSeedPhrase12(): string[] {
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    out.push(RECOVERY_WORDS_FALLBACK[Math.floor(Math.random() * RECOVERY_WORDS_FALLBACK.length)]);
  }
  return out;
}

function pickDistinctPositions(count: number, maxExclusive: number): number[] {
  const set = new Set<number>();
  while (set.size < count) {
    set.add(Math.floor(Math.random() * maxExclusive));
  }
  return Array.from(set);
}

function randomEvmAddress(): string {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
  }
  return "0x0000000000000000000000000000000000000001";
}

/** Same interaction + chrome as withdraw “signup address” row (`WithdrawFlow.tsx`). */
function EvmAddressCopyBar({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCopied(false);
  }, [address]);

  const copyToClipboard = useCallback((blurAfter: boolean) => {
    if (!address) return;
    void navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
    if (blurAfter) {
      queueMicrotask(() => rowRef.current?.blur());
    }
  }, [address]);

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    copyToClipboard(true);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      copyToClipboard(false);
    }
  };

  return (
    <div className="flex w-full max-w-[420px] flex-col gap-1.5 text-left">
      <span className="text-xs font-semibold text-[var(--color-text-muted)]">Your address</span>
      <div className="h-14 w-full shrink-0 box-border">
        <div
          ref={rowRef}
          role="button"
          tabIndex={0}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          className="group relative flex h-14 w-full cursor-pointer items-center justify-between overflow-hidden rounded-[12px] border border-[var(--color-border-deposit-input)] bg-[var(--color-bg-deposit-input)] px-5 outline-none transition-all hover:border-[var(--color-border-input-hover)] hover:bg-[var(--color-bg-input-hover)] hover:shadow-lg focus-visible:ring-2 focus-visible:ring-[var(--color-border-input-hover)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-primary)]"
        >
          <div
            className="relative z-0 flex h-full min-w-0 flex-1 items-center justify-center"
            style={{ containerType: "inline-size" }}
          >
            <span
              className="select-all whitespace-nowrap font-mono tracking-wide text-[var(--color-text-muted)]"
              style={{
                fontSize: `clamp(10px, calc(100cqi / ${Math.max(address.length, 1)} * 1.62), 17px)`,
              }}
            >
              {address}
            </span>
          </div>
          <div
            className={cn(
              "pointer-events-none absolute right-2 top-1/2 z-10 flex -translate-y-1/2 items-center justify-center transition-opacity duration-150",
              copied
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
            )}
          >
            <div
              className="group/icon pointer-events-auto flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border-0 text-white transition-colors"
              style={{ backgroundColor: "var(--color-bg-address-copy-chip)" }}
            >
              <AnimatePresence mode="wait">
                {copied ? (
                  <motion.div
                    key="check"
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Check className="h-4 w-4 text-white" strokeWidth={2.5} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="copy"
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Copy
                      className="h-4 w-4 text-white/55 transition-colors group-hover/icon:text-white"
                      strokeWidth={2.5}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const myWalletHeaderIconButtonHoverSync =
  "hover:bg-white/[0.055] hover:text-white data-[state=delayed-open]:bg-white/[0.055] data-[state=delayed-open]:text-white data-[state=instant-open]:bg-white/[0.055] data-[state=instant-open]:text-white";

const myWalletHeaderIconButtonBase =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-transparent bg-white/[0.04] text-white/70 transition-[background-color,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent";

function openInNewTab(url?: string) {
  const target = (url ?? "").trim() || "about:blank";
  window.open(target, "_blank", "noopener,noreferrer");
}

/** In-place portfolio/activity refetch — never remount the wallet shell. */
function dispatchWalletPortfolioRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("wallet-portfolio-refresh"));
}

function toolbarPillIconClass(iconSrc?: string) {
  if (!iconSrc) return "rounded-full";
  if (iconSrc.includes("Base%20Eth.svg") || iconSrc.includes("Base Eth.svg")) return "object-contain";
  return "rounded-full object-cover";
}

function MyWalletHeaderMiddleActions({
  walletAddress,
  onRefresh,
  refreshing,
  showJustNow,
  sendTransactionPill,
}: {
  walletAddress?: string;
  onRefresh?: () => void | Promise<void>;
  refreshing: boolean;
  showJustNow: boolean;
  sendTransactionPill: null | {
    id: number;
    amount: string;
    symbol: string;
    usd: string;
    to: string;
    iconSrc?: string;
  };
}) {
  const fullAddress = (walletAddress ?? "").trim();
  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <div className="flex w-full min-w-0 max-w-full items-center justify-end gap-2 sm:pl-1">
        <div className="min-w-0 shrink overflow-visible pr-0.5">
          <div className="flex justify-end">
            <AnimatePresence initial={false} mode="popLayout">
              {sendTransactionPill ? (
                <motion.div
                  key={sendTransactionPill.id}
                  role="status"
                  layout
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.3, ease: [0.33, 1, 0.68, 1] }}
                  className="inline-flex w-auto max-w-[min(28rem,calc(100vw-6rem))] shrink-0 items-center gap-2 rounded-[var(--radius-sm)] bg-white/[0.04] py-1.5 pl-3.5 pr-3.5"
                >
                  {sendTransactionPill.iconSrc ? (
                    <img
                      src={sendTransactionPill.iconSrc}
                      alt=""
                      className={cn("h-7 w-7 shrink-0", toolbarPillIconClass(sendTransactionPill.iconSrc))}
                      width={28}
                      height={28}
                    />
                  ) : (
                    <span
                      className="h-7 w-7 shrink-0 rounded-full bg-white/10"
                      aria-hidden
                    />
                  )}
                  <div className="min-w-0 text-left">
                    <p className="text-[10px] font-medium text-white/50">Sending</p>
                    <p className="whitespace-nowrap text-[11px] font-semibold leading-tight text-[var(--color-text-primary)] sm:text-xs">
                      {sendTransactionPill.amount} {sendTransactionPill.symbol} to {sendTransactionPill.to}
                    </p>
                  </div>
                  <div
                    className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-[var(--color-primary)]/20 border-t-[var(--color-primary)] animate-spin"
                    aria-hidden
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
        <AnimatePresence>
          {showJustNow ? (
            <motion.span
              className="inline-flex h-6 shrink-0 items-center rounded-full bg-white/[0.04] px-2.5 text-[11px] font-semibold text-[var(--color-success)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.33, 1, 0.68, 1] }}
            >
              Just now
            </motion.span>
          ) : null}
        </AnimatePresence>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={cn(myWalletHeaderIconButtonBase, myWalletHeaderIconButtonHoverSync)}
              aria-label="Block Scanner"
              onClick={() => {
                const base = (process.env.NEXT_PUBLIC_BLOCK_SCANNER_ADDRESS_BASE_URL ?? "").trim();
                openInNewTab(base && fullAddress ? `${base}${fullAddress}` : undefined);
              }}
            >
              <Globe className="h-4 w-4 shrink-0 opacity-90" strokeWidth={2} aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="end">
            Block Scanner
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={cn(myWalletHeaderIconButtonBase, myWalletHeaderIconButtonHoverSync)}
              aria-label="Refresh"
              disabled={refreshing}
              onClick={async () => {
                if (refreshing) return;
                if (!onRefresh) return;
                await onRefresh();
              }}
            >
              <RefreshCw
                className={cn("h-4 w-4 shrink-0 opacity-90", refreshing ? "animate-spin" : "")}
                style={refreshing ? { animation: "spin 0.9s linear infinite" } : undefined}
                strokeWidth={2}
                aria-hidden
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="end">
            Refresh
          </TooltipContent>
        </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}

interface Wallet1ContentProps {
  dataState: DataState;
  onConnectWallet: () => void;
  onCreateWallet: () => void;
  isCreating: boolean;
  canInteract: boolean;
  showPill?: boolean;
}

function Wallet1Content({
  dataState,
  onConnectWallet,
  onCreateWallet,
  isCreating,
  canInteract,
  showPill,
}: Wallet1ContentProps) {
  return (
    <div className="relative flex min-h-[calc(100dvh-12rem)] w-full flex-col">
      <PageHeader
        leftSection={
          <PageTitle
            title="My Wallet"
            subtitle="Connect an existing wallet or create a new one."
          />
        }
        rightSection={showPill ? <DataStatusPill state={dataState} showStatusLabel={false} /> : null}
      />

      {dataState.status === "offline" && (
        <InlineAlert
          tone="offline"
          title="You’re offline"
          description="Reconnect to continue."
        />
      )}

      {dataState.status === "error" && (
        <InlineAlert
          tone="error"
          title="Wallet unavailable"
          description="Wallet services aren’t available right now."
        />
      )}

      <div
        className="flex w-full flex-1 flex-col items-center justify-center gap-6 py-8 sm:gap-8 sm:py-10"
        aria-labelledby="my-wallet-heading"
      >
        <div className="flex w-full max-w-[560px] flex-col items-center justify-center gap-4 sm:gap-5 md:gap-6">
          <div className="relative w-full max-w-[220px] shrink-0">
            <Image
              src="/Nuro Wallet Update.svg"
              alt="Wallet illustration"
              width={220}
              height={220}
              className="mx-auto block h-auto w-full object-contain"
              priority
            />
          </div>

          <div className="flex w-full flex-col items-center gap-2 px-0 text-center sm:px-2">
            <h1
              id="my-wallet-heading"
              className="w-full text-center text-xl font-semibold tracking-tight text-[var(--color-text-primary)] min-[380px]:text-2xl sm:text-3xl"
            >
              Set Up Your Wallet
            </h1>
            <h2 className="w-full max-w-md text-center text-sm font-normal leading-relaxed text-[var(--color-text-muted)] sm:text-base mx-auto">
              Link a wallet you use, or create a new one
            </h2>
          </div>

          <div className="mx-auto grid w-full max-w-[560px] grid-cols-1 justify-items-center gap-3 sm:w-max sm:grid-cols-2 sm:gap-3">
            <Button
              type="button"
              variant="default"
              className="h-11 min-h-11 flex w-full max-w-[320px] transform-gpu items-center justify-center gap-2 rounded-[10px] px-6 text-white transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[2px] sm:h-10 sm:min-h-10 sm:w-[186px] sm:max-w-none sm:shrink-0"
              onClick={onConnectWallet}
              disabled={!canInteract || isCreating}
            >
              <Wallet className="h-4 w-4 shrink-0 transition-none" />
              <span>Connect wallet</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 min-h-11 flex w-full max-w-[320px] items-center justify-center gap-2 rounded-[10px] border-[1px] border-solid border-[var(--color-primary)] bg-transparent px-6 text-[var(--color-text-primary)] transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[2px] hover:bg-transparent hover:shadow-[inset_0_0_16px_2px_rgba(13,144,255,0.85)] dark:border-[var(--color-primary)] dark:bg-transparent dark:hover:bg-transparent sm:h-10 sm:min-h-10 sm:w-[186px] sm:max-w-none sm:shrink-0"
              disabled={!canInteract || isCreating}
              onClick={onCreateWallet}
            >
              <span>Create wallet</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Wallet1ConnectedContent({
  dataState,
  showPill,
  walletAddress,
  swapCtaMode = "swap",
  onSwapPanelConnectWallet,
  onHeaderRefresh,
  headerRefreshing,
  showJustNowPill,
}: {
  dataState: DataState;
  showPill?: boolean;
  walletAddress?: string;
  swapCtaMode?: "swap" | "connect";
  onSwapPanelConnectWallet?: () => void;
  onHeaderRefresh: () => void | Promise<void>;
  headerRefreshing: boolean;
  showJustNowPill: boolean;
}) {
  /**
   * `true` — dismiss the header tx bar when the send flow reaches success (mined/approved).
   * `false` (current) — QA: bar stays for the full 10s from `pending` so it’s visible; flip when shipping the “clear on success” behavior.
   */
  const DISMISS_SEND_TX_PILL_ON_CHAIN_SUCCESS = false;

  const [sendTxPill, setSendTxPill] = useState<null | {
    id: number;
    amount: string;
    symbol: string;
    usd: string;
    to: string;
    iconSrc?: string;
  }>(null);
  const sendTxPillTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSendTxPillTimeout = useCallback(() => {
    if (sendTxPillTimeoutRef.current != null) {
      clearTimeout(sendTxPillTimeoutRef.current);
      sendTxPillTimeoutRef.current = null;
    }
  }, []);

  const onSendTransactionToolbarChange = useCallback(
    (ev: SendTransactionToolbarEvent) => {
      if (ev == null) {
        clearSendTxPillTimeout();
        setSendTxPill(null);
        return;
      }
      if (ev.phase === "success") {
        if (DISMISS_SEND_TX_PILL_ON_CHAIN_SUCCESS) {
          clearSendTxPillTimeout();
          setSendTxPill(null);
        }
        return;
      }
      clearSendTxPillTimeout();
      setSendTxPill({
        id: Date.now(),
        amount: ev.amount,
        symbol: ev.symbol,
        usd: ev.usd,
        to: ev.toLabel,
        iconSrc: ev.iconSrc,
      });
      sendTxPillTimeoutRef.current = setTimeout(() => {
        setSendTxPill(null);
        sendTxPillTimeoutRef.current = null;
      }, 10_000);
    },
    [clearSendTxPillTimeout]
  );

  useEffect(() => () => clearSendTxPillTimeout(), [clearSendTxPillTimeout]);

  return (
    <div className="relative">
      <PageHeader
          leftSection={<PageTitle title="My Wallet" subtitle="Manage your connected wallet." />}
          middleSection={
            <MyWalletHeaderMiddleActions
              walletAddress={walletAddress}
              onRefresh={onHeaderRefresh}
              refreshing={headerRefreshing}
              showJustNow={showJustNowPill}
              sendTransactionPill={sendTxPill}
            />
          }
          rightSection={showPill ? <DataStatusPill state={dataState} showStatusLabel={false} /> : null}
      />

      {dataState.status === "offline" && (
        <InlineAlert tone="offline" title="You’re offline" description="Reconnect to continue." />
      )}

      {dataState.status === "error" && (
        <InlineAlert
          tone="error"
          title="Wallet unavailable"
          description="Wallet services aren’t available right now."
        />
      )}

      <ConnectedWalletDashboard
        walletAddress={walletAddress}
        swapCtaMode={swapCtaMode}
        onSwapPanelConnectWallet={onSwapPanelConnectWallet}
        onSendTransactionToolbarChange={onSendTransactionToolbarChange}
      />
    </div>
  );
}

function Wallet1FeatureWithPrivy() {
  const { privyEnabled } = usePrivyRuntime();
  const { ready, authenticated, login, user, linkWallet } = usePrivy();
  const { wallets } = useWallets();
  const [isCreating, setIsCreating] = useState(false);
  const { online } = useOnlineStatus();
  const router = useRouter();
  const pathname = usePathname();
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>(() => Date.now());
  const { populated: devPopulatedPreview } = useDevPreviewMode();
  const [headerRefreshing, setHeaderRefreshing] = useState(false);
  const [headerJustNowVisible, setHeaderJustNowVisible] = useState(false);
  const headerJustNowTimerRef = useRef<number | null>(null);

  const runHeaderRefresh = useCallback(async () => {
    if (headerRefreshing) return;
    setHeaderRefreshing(true);
    try {
      dispatchWalletPortfolioRefresh();
      await new Promise((r) => window.setTimeout(r, 450));
      setHeaderJustNowVisible(true);
      if (headerJustNowTimerRef.current != null) {
        window.clearTimeout(headerJustNowTimerRef.current);
      }
      headerJustNowTimerRef.current = window.setTimeout(() => {
        setHeaderJustNowVisible(false);
      }, 30_000);
    } finally {
      setHeaderRefreshing(false);
    }
  }, [headerRefreshing]);

  useEffect(() => {
    if (!online) return;
    if (!privyEnabled) return;
    if (!ready) return;
    setLastUpdatedAt(Date.now());
  }, [online, privyEnabled, ready]);

  const dataState = useMemo<DataState>(() => {
    const meta = { lastUpdatedAt, source: "privy" };
    if (!online) return { status: "offline", meta };
    if (!privyEnabled) return { status: "error", error: "Wallet services are unavailable.", meta };
    if (!ready) return { status: "loading", meta };
    return { status: "success", meta };
  }, [lastUpdatedAt, online, privyEnabled, ready]);

  useEffect(() => {
    return () => {
      if (headerJustNowTimerRef.current != null) {
        window.clearTimeout(headerJustNowTimerRef.current);
        headerJustNowTimerRef.current = null;
      }
    };
  }, []);

  const { createWallet } = useCreateWallet({
    onError: (error) => {
      if (process.env.NODE_ENV === "development") {
        console.error("[Wallet 1] createWallet", error, { message: String(error) });
      }
    },
  });

  const handleConnectWallet = useCallback(() => {
    if (!privyEnabled || !ready) return;

    const walletList = [
      "detected_ethereum_wallets",
      "metamask",
      "coinbase_wallet",
      "wallet_connect",
    ] as const;

    if (!authenticated) {
      void login({
        loginMethods: ["wallet"],
        walletList: [...walletList],
      } as Parameters<typeof login>[0]);
      return;
    }

    linkWallet({
      description: "Connect a wallet to use with your Nuro account.",
      walletList: [...walletList],
    });
  }, [authenticated, linkWallet, login, privyEnabled, ready]);

  const connectedWalletAddress = useMemo(() => {
    if (!authenticated || !ready) return "";
    const linkedWalletAddress = user?.linkedAccounts
      ?.filter((a) => a.type === "wallet" || a.type === "smart_wallet")
      .map((a) => ("address" in a ? a.address : ""))
      .find((addr) => typeof addr === "string" && addr.length > 0);
    const primaryWallet = wallets[0];
    const fromLinked = user?.linkedAccounts?.find(
      (a) => (a.type === "wallet" || a.type === "smart_wallet") && "address" in a
    ) as { address?: string } | undefined;
    const anyWalletAddress = fromLinked?.address ?? "";
    return (primaryWallet?.address ?? anyWalletAddress ?? linkedWalletAddress ?? "").trim();
  }, [authenticated, ready, user?.linkedAccounts, wallets]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [createFlowStep, setCreateFlowStep] = useState<
    "start" | "terms" | "networks" | "password" | "creating" | "recovery" | "quiz" | "success"
  >("start");
  const [ackSelfCustody, setAckSelfCustody] = useState(false);
  const [ackTerms, setAckTerms] = useState(false);
  const [selectedNetworks, setSelectedNetworks] = useState<Set<string>>(
    () => new Set(SUPPORTED_NETWORKS.map((n) => n.id))
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [seedWords, setSeedWords] = useState<string[]>(() => makeSeedPhrase12());
  const [recoveryRevealed, setRecoveryRevealed] = useState(false);
  const [copiedRecovery, setCopiedRecovery] = useState(false);
  const [seedHover, setSeedHover] = useState(false);
  const [quizPositions, setQuizPositions] = useState<number[]>([]);
  const [quizStep, setQuizStep] = useState(0);
  const [quizAnswer, setQuizAnswer] = useState("");
  const [createdEvmAddress, setCreatedEvmAddress] = useState("");
  const [createWalletQuitConfirmOpen, setCreateWalletQuitConfirmOpen] = useState(false);

  const resetCreateWalletFlow = useCallback(() => {
    setCreateWalletQuitConfirmOpen(false);
    setCreateFlowStep("start");
    setAckSelfCustody(false);
    setAckTerms(false);
    setSelectedNetworks(new Set(SUPPORTED_NETWORKS.map((n) => n.id)));
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setSeedWords(makeSeedPhrase12());
    setRecoveryRevealed(false);
    setCopiedRecovery(false);
    setSeedHover(false);
    setQuizPositions([]);
    setQuizStep(0);
    setQuizAnswer("");
    setCreatedEvmAddress("");
  }, []);

  const handleCreateWallet = useCallback(async () => {
    if (isCreating) return;
    if (!privyEnabled || !ready) return;
    resetCreateWalletFlow();
    setIsModalOpen(true);
  }, [isCreating, privyEnabled, ready, resetCreateWalletFlow]);

  const handleConfirmCreate = async () => {
    setIsCreating(true);
    try {
      await createWallet();
      setIsModalOpen(false);
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[Wallet 1] createWallet (throw)", error, { message: String(error) });
      }
    } finally {
      setIsCreating(false);
    }
  };

  const effectiveWalletAddress = useMemo(() => {
    const fromPrivy = connectedWalletAddress.trim();
    if (fromPrivy) return fromPrivy;
    const fromCreateFlow = createdEvmAddress.trim();
    if (fromCreateFlow) return fromCreateFlow;
    return "";
  }, [connectedWalletAddress, createdEvmAddress]);

  const shouldShowConnectedDashboard = useMemo(() => {
    if (effectiveWalletAddress) return true;
    return devPopulatedPreview;
  }, [devPopulatedPreview, effectiveWalletAddress]);

  return (
    <>
      {shouldShowConnectedDashboard ? (
        <Wallet1ConnectedContent
          dataState={dataState}
          showPill={authenticated}
          walletAddress={effectiveWalletAddress || undefined}
          swapCtaMode={
            effectiveWalletAddress
              ? "swap"
              : "connect"
          }
          onSwapPanelConnectWallet={handleConnectWallet}
          headerRefreshing={headerRefreshing}
          showJustNowPill={headerJustNowVisible}
          onHeaderRefresh={runHeaderRefresh}
        />
      ) : (
        <Wallet1Content
          dataState={dataState}
          onConnectWallet={handleConnectWallet}
          onCreateWallet={handleCreateWallet}
          isCreating={isCreating}
          canInteract={online && ready}
          showPill={authenticated}
        />
      )}
      <CreateWalletModal
        open={isModalOpen}
        hideTitle={createFlowStep === "success"}
        motionKey={createFlowStep}
        contentFadeMask={createFlowStep !== "success"}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            if (shouldWarnBeforeLeavingCreateWallet(createFlowStep)) {
              setCreateWalletQuitConfirmOpen(true);
              return;
            }
            setIsModalOpen(false);
            resetCreateWalletFlow();
          } else {
            setIsModalOpen(true);
          }
        }}
        onBack={
          createFlowStep === "terms"
            ? () => setCreateFlowStep("start")
            : createFlowStep === "networks"
              ? () => setCreateFlowStep("terms")
              : createFlowStep === "password"
                ? () => setCreateFlowStep("networks")
                : createFlowStep === "recovery"
                  ? () => setCreateFlowStep("password")
                  : createFlowStep === "quiz"
                    ? () => setCreateFlowStep("recovery")
              : undefined
        }
      >
        {createFlowStep === "start" ? (
          <motion.div
            className="flex flex-col items-center justify-center py-10 text-center"
            variants={walletModalFlowLayerVariants}
            initial="initial"
            animate="animate"
          >
            <motion.div className="relative w-full max-w-[80px] mb-8" variants={walletModalItemCascadeVariants}>
              <Image
                src="/Nuro Wallet Update.svg"
                alt="Wallet illustration"
                width={80}
                height={80}
                className="mx-auto block h-auto w-full object-contain"
                priority
              />
            </motion.div>
            <motion.h3
              className="text-2xl font-semibold text-[var(--color-text-primary)] mb-3"
              variants={walletModalItemCascadeVariants}
            >
              Create New Nuro Wallet
            </motion.h3>
            <motion.p
              className="text-[var(--color-text-muted)] text-base max-w-[400px]"
              variants={walletModalItemCascadeVariants}
            >
              We'll create a secure, multi-chain, non-custodial wallet linked to your account.
            </motion.p>
            <motion.div variants={walletModalItemCascadeVariants}>
              <Button
                onClick={() => setCreateFlowStep("terms")}
                disabled={isCreating}
                className="mt-10 h-11 px-10 rounded-[10px] bg-[#0D90FF] text-white hover:bg-[#0D90FF]/90 transition-all font-semibold"
              >
                {isCreating ? "Creating..." : "Lets begin"}
              </Button>
            </motion.div>
          </motion.div>
        ) : createFlowStep === "terms" ? (
          <motion.div
            className="h-full px-3 pt-6 flex flex-col"
            variants={walletModalFlowLayerVariants}
            initial="initial"
            animate="animate"
          >
            <motion.h1
              className="text-2xl font-semibold text-[var(--color-text-primary)] text-center"
              variants={walletModalItemCascadeVariants}
            >
              Before we begin
            </motion.h1>
            <motion.h2
              className="mt-3 text-[var(--color-text-muted)] text-base max-w-[520px] mx-auto text-center"
              variants={walletModalItemCascadeVariants}
            >
              We require that you acknowledge the items below
            </motion.h2>

            <motion.div
              className="mt-10 mx-auto w-full max-w-[560px] space-y-7"
              variants={walletModalItemCascadeVariants}
            >
              <div className="flex items-start gap-4">
                <Checkbox
                  checked={ackSelfCustody}
                  onCheckedChange={(v) => setAckSelfCustody(Boolean(v))}
                  className="mt-1.5"
                  aria-label="Acknowledge self-custody"
                />
                <p className="text-[15px] leading-7 text-[var(--color-text-primary)]/90">
                  I understand this is a self-custody wallet, and I am solely responsible for my funds. I understand Nuro cannot access my wallet or reverse any transactions. My recovery phrase is the ONLY way to regain access in the event of a lost password. I will secure, protect, and back up my wallet.
                </p>
              </div>

              <div className="flex items-start gap-4">
                <Checkbox
                  checked={ackTerms}
                  onCheckedChange={(v) => setAckTerms(Boolean(v))}
                  className="mt-1.5"
                  aria-label="Agree to terms of use"
                />
                <p className="text-[15px] leading-7 text-[var(--color-text-primary)]/90">
                  I have read and agree to the{" "}
                  <a
                    href="#"
                    className="text-[var(--color-primary)] hover:underline underline-offset-4"
                  >
                    Terms of use
                  </a>
                </p>
              </div>
            </motion.div>

            <div className="flex-1" />
            <motion.div className="pb-6 pt-6 flex justify-center" variants={walletModalItemCascadeVariants}>
              <Button
                type="button"
                disabled={!ackSelfCustody || !ackTerms}
                onClick={() => setCreateFlowStep("networks")}
                className="h-11 px-10 rounded-[12px] bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 transition-all font-semibold"
              >
                Next
              </Button>
            </motion.div>
          </motion.div>
        ) : createFlowStep === "networks" ? (
          <motion.div
            className="min-h-full px-3 pt-6 flex flex-col"
            variants={walletModalFlowLayerVariants}
            initial="initial"
            animate="animate"
          >
            <motion.h1
              className="text-2xl font-semibold text-[var(--color-text-primary)] text-center"
              variants={walletModalItemCascadeVariants}
            >
              Supported networks
            </motion.h1>
            <motion.h2
              className="mt-3 text-[var(--color-text-muted)] text-base max-w-[520px] mx-auto text-center"
              variants={walletModalItemCascadeVariants}
            >
              Choose which blockchains to use in your wallet.
            </motion.h2>

            <motion.div className="flex-1 flex items-center" variants={walletModalItemCascadeVariants}>
              <div className="mx-auto w-full max-w-[560px]">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {SUPPORTED_NETWORKS.map((n) => {
                    const checked = selectedNetworks.has(n.id);
                    const toggleNetwork = () => {
                      setSelectedNetworks((prev) => {
                        const next = new Set(prev);
                        if (next.has(n.id)) next.delete(n.id);
                        else next.add(n.id);
                        return next;
                      });
                    };
                    return (
                      <div
                        key={n.id}
                        role="button"
                        tabIndex={0}
                        onClick={toggleNetwork}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleNetwork();
                          }
                        }}
                        className={cn(
                          "group relative flex w-full cursor-pointer flex-col items-center justify-center rounded-[16px] border p-4 text-center outline-none transition-colors aspect-square overflow-hidden",
                          "bg-white/[0.02] hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25",
                          checked ? "border-white/20" : "border-white/10"
                        )}
                      >
                        <div
                          className="absolute right-3 top-2 z-10"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              setSelectedNetworks((prev) => {
                                const next = new Set(prev);
                                if (v === true) next.add(n.id);
                                else next.delete(n.id);
                                return next;
                              });
                            }}
                            aria-label={`${n.label} selected`}
                            className="border-transparent data-[state=checked]:border-transparent"
                          />
                        </div>

                        <div className="relative mb-4 h-12 w-12">
                          <div
                            className={cn(
                              // Glow must never clip into a square: avoid filter blur, use a circular shadow.
                              "pointer-events-none absolute inset-0 rounded-full transition-opacity duration-200 ease-out",
                              checked ? "opacity-50" : "opacity-0 group-hover:opacity-50"
                            )}
                            style={{
                              boxShadow: `0 0 28px 10px ${n.glow}`,
                            }}
                          />
                          <div className="relative h-12 w-12 overflow-hidden rounded-full">
                            <Image
                              src={n.iconSrc}
                              alt={`${n.label} icon`}
                              width={48}
                              height={48}
                              className="h-12 w-12"
                            />
                          </div>
                        </div>
                        <div className="text-[15px] font-semibold leading-tight text-[var(--color-text-primary)]">
                          {n.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
            <motion.div className="pb-6 pt-6 flex justify-center" variants={walletModalItemCascadeVariants}>
              <div className="flex flex-col items-center gap-3">
                <div className="relative -top-2 text-xs text-[var(--color-text-muted)] text-center">
                  You can add networks anytime in Settings.
                </div>
              <Button
                type="button"
                disabled={selectedNetworks.size === 0}
                onClick={() => setCreateFlowStep("password")}
                className="h-11 w-[280px] rounded-[12px] bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 transition-all font-semibold"
              >
                Continue with {selectedNetworks.size} {selectedNetworks.size === 1 ? "Network" : "Networks"}
              </Button>
              </div>
            </motion.div>
          </motion.div>
        ) : createFlowStep === "password" ? (
          <motion.div
            className="min-h-full px-3 pt-6 flex flex-col"
            variants={walletModalFlowLayerVariants}
            initial="initial"
            animate="animate"
          >
            <motion.h1
              className="text-2xl font-semibold text-[var(--color-text-primary)] text-center"
              variants={walletModalItemCascadeVariants}
            >
              Create a new password
            </motion.h1>
            <motion.h2
              className="mt-3 text-[var(--color-text-muted)] text-base max-w-[520px] mx-auto text-center"
              variants={walletModalItemCascadeVariants}
            >
              You'll use this password each time you access your wallet.
            </motion.h2>

            {(() => {
              const hasLower = /[a-z]/.test(password);
              const hasUpper = /[A-Z]/.test(password);
              const hasNum = /[0-9]/.test(password);
              const hasSym = /[^A-Za-z0-9]/.test(password);
              const score =
                (password.length >= 6 ? 1 : 0) +
                (password.length >= 10 ? 1 : 0) +
                (hasLower ? 1 : 0) +
                (hasUpper ? 1 : 0) +
                (hasNum ? 1 : 0) +
                (hasSym ? 1 : 0);
              const pct = Math.min(100, Math.round((score / 6) * 100));
              const strong = pct >= 83;
              const matches = Boolean(confirmPassword) && password === confirmPassword;
              const meetsMinLen = password.length >= 6;
              const hasPassword = password.trim().length > 0;
              const showStrength = hasPassword && meetsMinLen;
              const isStrong = strong && showStrength;

              return (
                <>
                  <motion.div className="flex-1 flex items-center" variants={walletModalItemCascadeVariants}>
                    <div className="mx-auto w-full max-w-[440px] space-y-5">
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                            Enter new password <span className="text-[var(--color-error)]">*</span>
                          </div>
                          {!meetsMinLen && (
                            <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--color-success)]">
                              atleast 6 characters
                            </span>
                          )}
                        </div>
                        <div className="relative mt-2">
                          <Input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="h-10 rounded-[10px] bg-white/[0.04] border-white/10 pr-12"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/55 hover:text-white/80 transition-colors"
                            aria-label={showPassword ? "Hide password" : "Show password"}
                          >
                            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                          </button>
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                          <div className="h-[6px] flex-1 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[var(--color-primary)] transition-[width] duration-300"
                              style={{ width: `${showStrength ? pct : 0}%` }}
                            />
                          </div>
                          <div
                            className={cn(
                              "text-sm font-semibold w-[56px] text-right",
                              isStrong ? "text-[var(--color-primary)]" : "text-white/45"
                            )}
                          >
                            Strong!
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                          Re-enter password <span className="text-[var(--color-error)]">*</span>
                        </div>
                        <div className="relative mt-2">
                          <Input
                            type={showConfirmPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="h-10 rounded-[10px] bg-white/[0.04] border-white/10 pr-12"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/55 hover:text-white/80 transition-colors"
                            aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                          >
                            {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                          </button>
                        </div>

                        <div className="mt-3 flex items-center gap-2 text-[15px]">
                          <CheckCircle2 className={cn("h-4 w-4", matches ? "text-[var(--color-primary)]" : "text-white/25")} />
                          <span className={cn(matches ? "text-[var(--color-primary)]" : "text-white/45")}>
                            Passwords match
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>

                  <motion.div className="pb-6 pt-6 flex justify-center" variants={walletModalItemCascadeVariants}>
                    <Button
                      type="button"
                      disabled={!meetsMinLen || password !== confirmPassword}
                      onClick={() => {
                        setRecoveryRevealed(false);
                        setCreateFlowStep("creating");
                        window.setTimeout(() => {
                          setSeedWords(makeSeedPhrase12());
                          setCreateFlowStep("recovery");
                        }, 900);
                      }}
                      className="h-11 px-10 rounded-[12px] bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 transition-all font-semibold"
                    >
                      Continue
                    </Button>
                  </motion.div>
                </>
              );
            })()}
          </motion.div>
        ) : createFlowStep === "creating" ? (
          <motion.div
            className="min-h-full px-3 pt-6 flex flex-col"
            variants={walletModalFlowLayerVariants}
            initial="initial"
            animate="animate"
          >
            <motion.div className="flex-1 flex items-center justify-center" variants={walletModalItemCascadeVariants}>
              <div className="flex flex-col items-center gap-4">
                <div className="h-10 w-10 rounded-full border-2 border-white/15 border-t-[var(--color-primary)] animate-spin" />
                <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Creating Wallet...
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : createFlowStep === "recovery" ? (
          <motion.div
            className="min-h-full px-3 pt-6 flex flex-col"
            variants={walletModalFlowLayerVariants}
            initial="initial"
            animate="animate"
          >
            <motion.h1
              className="text-2xl font-semibold text-[var(--color-primary)] text-center"
              variants={walletModalItemCascadeVariants}
            >
              Save your recovery phrase
            </motion.h1>
            <motion.p
              className="mt-4 text-[var(--color-text-muted)] text-base max-w-[520px] mx-auto text-center leading-relaxed"
              variants={walletModalItemCascadeVariants}
            >
              The 12-24 word recovery phrase is a private key
              <br />
              you can use to regain access to your wallet.
            </motion.p>

            <motion.div className="flex-1 flex items-center" variants={walletModalItemCascadeVariants}>
              <div className="relative top-1 mx-auto w-full max-w-[520px]">
                <div
                  className="relative rounded-[12px] border border-white/10 bg-white/[0.02] p-3"
                  onMouseEnter={() => setSeedHover(true)}
                  onMouseLeave={() => setSeedHover(false)}
                >
                  <div
                    className={cn(
                      "grid grid-cols-3 gap-2 transition-[filter,opacity] duration-200",
                      recoveryRevealed
                        ? seedHover || copiedRecovery
                          ? "opacity-40 blur-[10px]"
                          : "opacity-100 blur-0"
                        : "opacity-60 blur-[10px]"
                    )}
                  >
                    {seedWords.map((w, idx) => (
                      <div
                        key={`${w}-${idx}`}
                        className="rounded-[9px] border border-white/10 bg-black/10 px-2.5 py-1.5 text-[12px] text-white/80 font-medium"
                      >
                        <span className="mr-2 text-white/35">{idx + 1}.</span>
                        {w}
                      </div>
                    ))}
                  </div>

                  {/* Hover copy overlay (only after reveal) */}
                  {recoveryRevealed && (
                    <div
                      className={cn(
                        "absolute inset-0 flex items-center justify-center transition-opacity duration-200",
                        seedHover || copiedRecovery ? "opacity-100" : "opacity-0 pointer-events-none"
                      )}
                    >
                      <button
                        type="button"
                        onClick={async () => {
                          const phrase = seedWords.join(" ");
                          try {
                            await navigator.clipboard.writeText(phrase);
                          } catch {
                            const ta = document.createElement("textarea");
                            ta.value = phrase;
                            ta.style.position = "fixed";
                            ta.style.opacity = "0";
                            document.body.appendChild(ta);
                            ta.select();
                            try { document.execCommand("copy"); } finally { document.body.removeChild(ta); }
                          }
                          setCopiedRecovery(true);
                          window.setTimeout(() => setCopiedRecovery(false), 1200);
                        }}
                        className={cn(
                          "h-10 px-5 rounded-[12px] font-semibold text-sm transition-all",
                          "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90"
                        )}
                      >
                        {copiedRecovery ? (
                          <span className="inline-flex items-center gap-2">
                            <Check className="h-4 w-4 text-white" />
                            Copied
                          </span>
                        ) : (
                          "Copy"
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>

            <motion.div className="pb-4 pt-3 flex justify-center" variants={walletModalItemCascadeVariants}>
              <div className="flex flex-col items-center gap-3">
                <Button
                  type="button"
                  onClick={() => {
                    if (!recoveryRevealed) {
                      setRecoveryRevealed(true);
                      return;
                    }
                    // Start quiz with 3 random distinct positions (0-11)
                    setQuizPositions(pickDistinctPositions(3, seedWords.length));
                    setQuizStep(0);
                    setQuizAnswer("");
                    setCreateFlowStep("quiz");
                  }}
                  className="h-11 px-10 rounded-[12px] bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 transition-all font-semibold"
                >
                  {recoveryRevealed ? "Next" : "Show my recovery phrase"}
                </Button>
                <button
                  type="button"
                  onClick={async () => {
                    const phrase = seedWords.join(" ");
                    try {
                      await navigator.clipboard.writeText(phrase);
                    } catch {
                      const ta = document.createElement("textarea");
                      ta.value = phrase;
                      ta.style.position = "fixed";
                      ta.style.opacity = "0";
                      document.body.appendChild(ta);
                      ta.select();
                      try { document.execCommand("copy"); } finally { document.body.removeChild(ta); }
                    }
                    setCopiedRecovery(true);
                    window.setTimeout(() => setCopiedRecovery(false), 1200);
                  }}
                  className="text-xs text-[var(--color-text-muted)] hover:text-white/70 transition-colors inline-flex items-center gap-1.5"
                >
                  {copiedRecovery ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-[var(--color-success)]" />
                      <span className="text-[var(--color-success)]">Copied</span>
                    </>
                  ) : (
                    "Copy"
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : createFlowStep === "quiz" ? (
          <motion.div
            className="min-h-full px-3 pt-6 flex flex-col"
            variants={walletModalFlowLayerVariants}
            initial="initial"
            animate="animate"
          >
            {(() => {
              const pos = quizPositions[quizStep] ?? 0;
              const target = (seedWords[pos] ?? "").trim().toLowerCase();
              const input = quizAnswer.trim().toLowerCase();
              const canContinue = Boolean(target) && input === target;
              return (
                <>
                  <motion.div
                    className="flex-1 flex flex-col items-center justify-center"
                    variants={walletModalItemCascadeVariants}
                  >
                    <div className="w-full max-w-[360px]">
                      <motion.div
                        className="flex items-center justify-center gap-3"
                        variants={walletModalItemCascadeVariants}
                      >
                        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] text-center">
                          Lets Double Check
                        </h1>
                      </motion.div>

                      <motion.p
                        className="mt-8 text-[var(--color-text-muted)] text-[13px] text-center"
                        variants={walletModalItemCascadeVariants}
                      >
                        Enter the word in{" "}
                        <span className="text-white">position {pos + 1}</span>{" "}
                        from
                        <br />
                        your recovery phrase.
                      </motion.p>

                      <motion.div
                        className="mt-6 mx-auto w-full max-w-[180px]"
                        variants={walletModalItemCascadeVariants}
                      >
                        <Input
                          value={quizAnswer}
                          onChange={(e) => setQuizAnswer(e.target.value)}
                          className="h-10 rounded-[10px] bg-white/[0.04] border-white/10 text-center"
                        />
                      </motion.div>

                      <motion.div className="mt-5 flex justify-center" variants={walletModalItemCascadeVariants}>
                        <button
                          type="button"
                          onClick={() => setCreateFlowStep("recovery")}
                          className="text-[13px] text-[var(--color-text-muted)] hover:text-white transition-colors"
                        >
                          Forgot to save? Go back
                        </button>
                      </motion.div>
                    </div>
                  </motion.div>

                  <motion.div className="pb-6 pt-6 flex justify-center" variants={walletModalItemCascadeVariants}>
                    <div className="flex flex-col items-center gap-4">
                      <div className="flex items-center gap-2">
                        {[0, 1, 2].map((i) =>
                          i === quizStep ? (
                            <motion.div
                              key={i}
                              layoutId="quiz-progress-pill"
                              className="h-2 w-7 rounded-full bg-[var(--color-primary)]/70"
                              transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.6 }}
                            />
                          ) : (
                            <div key={i} className="h-2 w-2 rounded-full bg-white/20" />
                          )
                        )}
                      </div>
                      <Button
                        type="button"
                        disabled={!canContinue}
                        onClick={() => {
                          if (!canContinue) return;
                          if (quizStep >= 2) {
                            // Completed 3/3
                            setCreatedEvmAddress(randomEvmAddress());
                            setCreateFlowStep("success");
                            return;
                          }
                          setQuizStep((s) => s + 1);
                          setQuizAnswer("");
                        }}
                        className="h-11 px-10 rounded-[12px] bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 transition-all font-semibold"
                      >
                        Continue
                      </Button>
                    </div>
                  </motion.div>
                </>
              );
            })()}
          </motion.div>
        ) : createFlowStep === "success" ? (
          <motion.div
            className="flex min-h-0 w-full flex-1 flex-col gap-3 px-3 pb-2 pt-0 sm:gap-4"
            variants={walletModalFlowLayerVariants}
            initial="initial"
            animate="animate"
          >
            <motion.div
              variants={walletModalItemCascadeVariants}
              className="relative mx-auto w-full max-w-[156px] shrink-0 overflow-visible pt-1 sm:max-w-[176px] sm:pt-2"
            >
              <Image
                src="/Nuro Wallet Success Message.svg"
                alt="Wallet created successfully"
                width={520}
                height={520}
                className="relative z-10 mx-auto block h-auto max-h-[22vh] w-full object-contain sm:max-h-[26vh]"
                priority
              />
              <SuccessConfetti />
            </motion.div>
            <motion.div variants={walletModalItemCascadeVariants} className="w-full max-w-[480px] mx-auto text-center">
              <h1 className="text-xl font-semibold text-[var(--color-text-primary)] text-center sm:text-2xl">
                You&apos;re all set!
              </h1>
            </motion.div>
            <motion.div variants={walletModalItemCascadeVariants} className="w-full max-w-[520px] mx-auto text-center">
              <p className="text-sm text-[var(--color-text-muted)] text-center sm:text-base">
                Your wallet is now ready to use.
              </p>
            </motion.div>
            {createdEvmAddress ? (
              <motion.div
                variants={walletModalItemCascadeVariants}
                className="flex w-full min-w-0 shrink-0 justify-center px-0.5"
              >
                <EvmAddressCopyBar address={createdEvmAddress} />
              </motion.div>
            ) : null}
            <motion.div
              variants={walletModalItemCascadeVariants}
              className="mt-auto flex w-full shrink-0 justify-center px-1 pb-4 pt-3"
            >
              <div className="relative inline-flex">
                <span
                  aria-hidden
                  className="pointer-events-none absolute -inset-x-4 -inset-y-3 -z-10 rounded-[14px] bg-[rgba(56,189,248,0.26)] blur-2xl"
                />
                <Button
                  type="button"
                  onClick={() => {
                    if (IS_DEV) {
                      try {
                        writeDevPopulatedPreview(true);
                      } catch {
                        // ignore
                      }
                    }
                    router.replace(`${pathname}#wallet-view`);
                    setIsModalOpen(false);
                  }}
                  className="relative z-[1] h-11 px-10 rounded-[12px] bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 transition-all font-semibold"
                >
                  Go to wallet
                </Button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </CreateWalletModal>
      <CreateWalletQuitConfirmDialog
        open={createWalletQuitConfirmOpen}
        onStay={() => setCreateWalletQuitConfirmOpen(false)}
        onLeave={() => {
          setIsModalOpen(false);
          resetCreateWalletFlow();
        }}
      />
    </>
  );
}

export default function Wallet1Feature() {
  if (DESIGN_MODE || !privyConfigured) return <Wallet1FeatureStub />;
  return <Wallet1FeatureWithPrivy />;
}

function Wallet1FeatureStub() {
  const { online } = useOnlineStatus();
  const router = useRouter();
  const pathname = usePathname();
  const { populated: devPopulatedPreview } = useDevPreviewMode();
  const [headerRefreshing, setHeaderRefreshing] = useState(false);
  const [headerJustNowVisible, setHeaderJustNowVisible] = useState(false);
  const headerJustNowTimerRef = useRef<number | null>(null);

  const runHeaderRefresh = useCallback(async () => {
    if (headerRefreshing) return;
    setHeaderRefreshing(true);
    try {
      dispatchWalletPortfolioRefresh();
      await new Promise((r) => window.setTimeout(r, 450));
      setHeaderJustNowVisible(true);
      if (headerJustNowTimerRef.current != null) {
        window.clearTimeout(headerJustNowTimerRef.current);
      }
      headerJustNowTimerRef.current = window.setTimeout(() => {
        setHeaderJustNowVisible(false);
      }, 30_000);
    } finally {
      setHeaderRefreshing(false);
    }
  }, [headerRefreshing]);

  useEffect(() => {
    return () => {
      if (headerJustNowTimerRef.current != null) {
        window.clearTimeout(headerJustNowTimerRef.current);
        headerJustNowTimerRef.current = null;
      }
    };
  }, []);

  // Fallback / Stub experience for when Privy is not configured (e.g. Design Mode)
  const stubState: DataState = {
    status: "success",
    meta: { lastUpdatedAt: Date.now(), source: "stub" }
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [createFlowStep, setCreateFlowStep] = useState<
    "start" | "terms" | "networks" | "password" | "creating" | "recovery" | "quiz" | "success"
  >("start");
  const [ackSelfCustody, setAckSelfCustody] = useState(false);
  const [ackTerms, setAckTerms] = useState(false);
  const [selectedNetworks, setSelectedNetworks] = useState<Set<string>>(
    () => new Set(SUPPORTED_NETWORKS.map((n) => n.id))
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [seedWords, setSeedWords] = useState<string[]>(() => makeSeedPhrase12());
  const [recoveryRevealed, setRecoveryRevealed] = useState(false);
  const [copiedRecovery, setCopiedRecovery] = useState(false);
  const [seedHover, setSeedHover] = useState(false);
  const [quizPositions, setQuizPositions] = useState<number[]>([]);
  const [quizStep, setQuizStep] = useState(0);
  const [quizAnswer, setQuizAnswer] = useState("");
  const [createdEvmAddress, setCreatedEvmAddress] = useState("");
  const [createWalletQuitConfirmOpen, setCreateWalletQuitConfirmOpen] = useState(false);

  const resetCreateWalletFlow = useCallback(() => {
    setCreateWalletQuitConfirmOpen(false);
    setCreateFlowStep("start");
    setAckSelfCustody(false);
    setAckTerms(false);
    setSelectedNetworks(new Set(SUPPORTED_NETWORKS.map((n) => n.id)));
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setSeedWords(makeSeedPhrase12());
    setRecoveryRevealed(false);
    setCopiedRecovery(false);
    setSeedHover(false);
    setQuizPositions([]);
    setQuizStep(0);
    setQuizAnswer("");
    setCreatedEvmAddress("");
  }, []);

  return (
    <>
      {devPopulatedPreview ? (
        <Wallet1ConnectedContent
          dataState={stubState}
          showPill={false}
          walletAddress={DEMO_CONNECTED_WALLET_ADDRESS}
          headerRefreshing={headerRefreshing}
          showJustNowPill={headerJustNowVisible}
          onHeaderRefresh={runHeaderRefresh}
        />
      ) : (
        <Wallet1Content
          dataState={stubState}
          onConnectWallet={() => {
            if (process.env.NODE_ENV === "development") {
              console.warn("[Wallet 1] Set NEXT_PUBLIC_PRIVY_APP_ID to enable wallet connection.");
            }
          }}
          onCreateWallet={() => {
            resetCreateWalletFlow();
            setIsModalOpen(true);
          }}
          isCreating={false}
          canInteract={online}
        />
      )}
      <CreateWalletModal
        open={isModalOpen}
        hideTitle={createFlowStep === "success"}
        motionKey={createFlowStep}
        contentFadeMask={createFlowStep !== "success"}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            if (shouldWarnBeforeLeavingCreateWallet(createFlowStep)) {
              setCreateWalletQuitConfirmOpen(true);
              return;
            }
            setIsModalOpen(false);
            resetCreateWalletFlow();
          } else {
            setIsModalOpen(true);
          }
        }}
        onBack={
          createFlowStep === "terms"
            ? () => setCreateFlowStep("start")
            : createFlowStep === "networks"
              ? () => setCreateFlowStep("terms")
              : createFlowStep === "password"
                ? () => setCreateFlowStep("networks")
                : createFlowStep === "recovery"
                  ? () => setCreateFlowStep("password")
                  : createFlowStep === "quiz"
                    ? () => setCreateFlowStep("recovery")
              : undefined
        }
      >
        {createFlowStep === "start" ? (
          <motion.div
            className="flex flex-col items-center justify-center py-10 text-center"
            variants={walletModalFlowLayerVariants}
            initial="initial"
            animate="animate"
          >
            <motion.div className="relative w-full max-w-[80px] mb-8" variants={walletModalItemCascadeVariants}>
              <Image
                src="/Nuro Wallet Update.svg"
                alt="Wallet illustration"
                width={80}
                height={80}
                className="mx-auto block h-auto w-full object-contain"
                priority
              />
            </motion.div>
            <motion.h3
              className="text-2xl font-semibold text-[var(--color-text-primary)] mb-3"
              variants={walletModalItemCascadeVariants}
            >
              Create New Nuro Wallet
            </motion.h3>
            <motion.p
              className="text-[var(--color-text-muted)] text-base max-w-[400px]"
              variants={walletModalItemCascadeVariants}
            >
              We'll create a secure, multi-chain, non-custodial wallet linked to your account.
            </motion.p>
            <motion.div variants={walletModalItemCascadeVariants}>
              <Button
                onClick={() => setCreateFlowStep("terms")}
                className="mt-10 h-11 px-10 rounded-[10px] bg-[#0D90FF] text-white hover:bg-[#0D90FF]/90 transition-all font-semibold"
              >
                Lets begin
              </Button>
            </motion.div>
          </motion.div>
        ) : createFlowStep === "terms" ? (
          <motion.div
            className="h-full px-3 pt-6 flex flex-col"
            variants={walletModalFlowLayerVariants}
            initial="initial"
            animate="animate"
          >
            <motion.h1
              className="text-2xl font-semibold text-[var(--color-text-primary)] text-center"
              variants={walletModalItemCascadeVariants}
            >
              Before we begin
            </motion.h1>
            <motion.h2
              className="mt-3 text-[var(--color-text-muted)] text-base max-w-[520px] mx-auto text-center"
              variants={walletModalItemCascadeVariants}
            >
              We require that you acknowledge the items below
            </motion.h2>

            <motion.div
              className="mt-10 mx-auto w-full max-w-[560px] space-y-7"
              variants={walletModalItemCascadeVariants}
            >
              <div className="flex items-start gap-4">
                <Checkbox
                  checked={ackSelfCustody}
                  onCheckedChange={(v) => setAckSelfCustody(Boolean(v))}
                  className="mt-1.5"
                  aria-label="Acknowledge self-custody"
                />
                <p className="text-[15px] leading-7 text-[var(--color-text-primary)]/90">
                  I understand this is a self-custody wallet, and I am solely responsible for my funds. I understand Nuro cannot access my wallet or reverse any transactions. My recovery phrase is the ONLY way to regain access in the event of a lost password. I will secure, protect, and back up my wallet.
                </p>
              </div>

              <div className="flex items-start gap-4">
                <Checkbox
                  checked={ackTerms}
                  onCheckedChange={(v) => setAckTerms(Boolean(v))}
                  className="mt-1.5"
                  aria-label="Agree to terms of use"
                />
                <p className="text-[15px] leading-7 text-[var(--color-text-primary)]/90">
                  I have read and agree to the{" "}
                  <a
                    href="#"
                    className="text-[var(--color-primary)] hover:underline underline-offset-4"
                  >
                    Terms of use
                  </a>
                </p>
              </div>
            </motion.div>

            <div className="flex-1" />
            <motion.div className="pb-6 pt-6 flex justify-center" variants={walletModalItemCascadeVariants}>
              <Button
                type="button"
                disabled={!ackSelfCustody || !ackTerms}
                onClick={() => setCreateFlowStep("networks")}
                className="h-11 px-10 rounded-[12px] bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 transition-all font-semibold"
              >
                Next
              </Button>
            </motion.div>
          </motion.div>
        ) : createFlowStep === "networks" ? (
          <motion.div
            className="min-h-full px-3 pt-6 flex flex-col"
            variants={walletModalFlowLayerVariants}
            initial="initial"
            animate="animate"
          >
            <motion.h1
              className="text-2xl font-semibold text-[var(--color-text-primary)] text-center"
              variants={walletModalItemCascadeVariants}
            >
              Supported networks
            </motion.h1>
            <motion.h2
              className="mt-3 text-[var(--color-text-muted)] text-base max-w-[520px] mx-auto text-center"
              variants={walletModalItemCascadeVariants}
            >
              Choose which blockchains to use in your wallet.
            </motion.h2>

            <motion.div className="flex-1 flex items-center" variants={walletModalItemCascadeVariants}>
              <div className="mx-auto w-full max-w-[560px]">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {SUPPORTED_NETWORKS.map((n) => {
                    const checked = selectedNetworks.has(n.id);
                    const toggleNetwork = () => {
                      setSelectedNetworks((prev) => {
                        const next = new Set(prev);
                        if (next.has(n.id)) next.delete(n.id);
                        else next.add(n.id);
                        return next;
                      });
                    };
                    return (
                      <div
                        key={n.id}
                        role="button"
                        tabIndex={0}
                        onClick={toggleNetwork}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleNetwork();
                          }
                        }}
                        className={cn(
                          "group relative flex aspect-square w-full cursor-pointer flex-col items-center justify-center rounded-[16px] border p-4 text-center outline-none transition-colors overflow-hidden",
                          "bg-white/[0.02] hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25",
                          checked ? "border-white/20" : "border-white/10"
                        )}
                      >
                        <div
                          className="absolute right-3 top-2 z-10"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              setSelectedNetworks((prev) => {
                                const next = new Set(prev);
                                if (v === true) next.add(n.id);
                                else next.delete(n.id);
                                return next;
                              });
                            }}
                            aria-label={`${n.label} selected`}
                            className="border-transparent data-[state=checked]:border-transparent"
                          />
                        </div>

                        <div className="relative mb-4 h-12 w-12">
                          <div
                            className={cn(
                              // Glow must never clip into a square: avoid filter blur, use a circular shadow.
                              "pointer-events-none absolute inset-0 rounded-full transition-opacity duration-200 ease-out",
                              checked ? "opacity-50" : "opacity-0 group-hover:opacity-50"
                            )}
                            style={{
                              boxShadow: `0 0 28px 10px ${n.glow}`,
                            }}
                          />
                          <div className="relative h-12 w-12 overflow-hidden rounded-full">
                            <Image
                              src={n.iconSrc}
                              alt={`${n.label} icon`}
                              width={48}
                              height={48}
                              className="h-12 w-12"
                            />
                          </div>
                        </div>
                        <div className="text-[15px] font-semibold leading-tight text-[var(--color-text-primary)]">
                          {n.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
            <motion.div className="pb-6 pt-6 flex justify-center" variants={walletModalItemCascadeVariants}>
              <div className="flex flex-col items-center gap-3">
                <div className="relative -top-2 text-xs text-[var(--color-text-muted)] text-center">
                  You can add networks anytime in Settings.
                </div>
                <Button
                  type="button"
                  disabled={selectedNetworks.size === 0}
                  onClick={() => setCreateFlowStep("password")}
                  className="h-11 w-[280px] rounded-[12px] bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 transition-all font-semibold"
                >
                  Continue with {selectedNetworks.size} {selectedNetworks.size === 1 ? "Network" : "Networks"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        ) : createFlowStep === "password" ? (
          <motion.div
            className="min-h-full px-3 pt-6 flex flex-col"
            variants={walletModalFlowLayerVariants}
            initial="initial"
            animate="animate"
          >
            <motion.h1
              className="text-2xl font-semibold text-[var(--color-text-primary)] text-center"
              variants={walletModalItemCascadeVariants}
            >
              Create a new password
            </motion.h1>
            <motion.h2
              className="mt-3 text-[var(--color-text-muted)] text-base max-w-[520px] mx-auto text-center"
              variants={walletModalItemCascadeVariants}
            >
              You'll use this password each time you access your wallet.
            </motion.h2>

            {(() => {
              const hasLower = /[a-z]/.test(password);
              const hasUpper = /[A-Z]/.test(password);
              const hasNum = /[0-9]/.test(password);
              const hasSym = /[^A-Za-z0-9]/.test(password);
              const score =
                (password.length >= 6 ? 1 : 0) +
                (password.length >= 10 ? 1 : 0) +
                (hasLower ? 1 : 0) +
                (hasUpper ? 1 : 0) +
                (hasNum ? 1 : 0) +
                (hasSym ? 1 : 0);
              const pct = Math.min(100, Math.round((score / 6) * 100));
              const strong = pct >= 83;
              const matches = Boolean(confirmPassword) && password === confirmPassword;
              const meetsMinLen = password.length >= 6;
              const hasPassword = password.trim().length > 0;
              const showStrength = hasPassword && meetsMinLen;
              const isStrong = strong && showStrength;

              return (
                <>
                  <motion.div className="flex-1 flex items-center" variants={walletModalItemCascadeVariants}>
                    <div className="mx-auto w-full max-w-[440px] space-y-5">
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                            Enter new password <span className="text-[var(--color-error)]">*</span>
                          </div>
                          {!meetsMinLen && (
                            <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--color-success)]">
                              atleast 6 characters
                            </span>
                          )}
                        </div>
                        <div className="relative mt-2">
                          <Input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="h-10 rounded-[10px] bg-white/[0.04] border-white/10 pr-12"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/55 hover:text-white/80 transition-colors"
                            aria-label={showPassword ? "Hide password" : "Show password"}
                          >
                            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                          </button>
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                          <div className="h-[6px] flex-1 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[var(--color-primary)] transition-[width] duration-300"
                              style={{ width: `${showStrength ? pct : 0}%` }}
                            />
                          </div>
                          <div
                            className={cn(
                              "text-sm font-semibold w-[56px] text-right",
                              isStrong ? "text-[var(--color-primary)]" : "text-white/45"
                            )}
                          >
                            Strong!
                          </div>
                        </div>
                      </div>

                      <div>
                        <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                          Re-enter password <span className="text-[var(--color-error)]">*</span>
                        </div>
                        <div className="relative mt-2">
                          <Input
                            type={showConfirmPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="h-10 rounded-[10px] bg-white/[0.04] border-white/10 pr-12"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/55 hover:text-white/80 transition-colors"
                            aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                          >
                            {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                          </button>
                        </div>

                        <div className="mt-3 flex items-center gap-2 text-[15px]">
                          <CheckCircle2 className={cn("h-4 w-4", matches ? "text-[var(--color-primary)]" : "text-white/25")} />
                          <span className={cn(matches ? "text-[var(--color-primary)]" : "text-white/45")}>
                            Passwords match
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>

                  <motion.div className="pb-6 pt-6 flex justify-center" variants={walletModalItemCascadeVariants}>
                    <Button
                      type="button"
                      disabled={!meetsMinLen || password !== confirmPassword}
                      onClick={() => {
                        setRecoveryRevealed(false);
                        setCreateFlowStep("creating");
                        window.setTimeout(() => {
                          setSeedWords(makeSeedPhrase12());
                          setCreateFlowStep("recovery");
                        }, 900);
                      }}
                      className="h-11 px-10 rounded-[12px] bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 transition-all font-semibold"
                    >
                      Continue
                    </Button>
                  </motion.div>
                </>
              );
            })()}
          </motion.div>
        ) : createFlowStep === "creating" ? (
          <motion.div
            className="min-h-full px-3 pt-6 flex flex-col"
            variants={walletModalFlowLayerVariants}
            initial="initial"
            animate="animate"
          >
            <motion.div className="flex-1 flex items-center justify-center" variants={walletModalItemCascadeVariants}>
              <div className="flex flex-col items-center gap-4">
                <div className="h-10 w-10 rounded-full border-2 border-white/15 border-t-[var(--color-primary)] animate-spin" />
                <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Creating Wallet...
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : createFlowStep === "recovery" ? (
          <motion.div
            className="min-h-full px-3 pt-6 flex flex-col"
            variants={walletModalFlowLayerVariants}
            initial="initial"
            animate="animate"
          >
            <motion.h1
              className="text-2xl font-semibold text-[var(--color-primary)] text-center"
              variants={walletModalItemCascadeVariants}
            >
              Save your recovery phrase
            </motion.h1>
            <motion.p
              className="mt-4 text-[var(--color-text-muted)] text-base max-w-[520px] mx-auto text-center leading-relaxed"
              variants={walletModalItemCascadeVariants}
            >
              The 12-24 word recovery phrase is a private key
              <br />
              you can use to regain access to your wallet.
            </motion.p>

            <motion.div className="flex-1 flex items-center" variants={walletModalItemCascadeVariants}>
              <div className="relative top-1 mx-auto w-full max-w-[520px]">
                <div
                  className="relative rounded-[12px] border border-white/10 bg-white/[0.02] p-3"
                  onMouseEnter={() => setSeedHover(true)}
                  onMouseLeave={() => setSeedHover(false)}
                >
                  <div
                    className={cn(
                      "grid grid-cols-3 gap-2 transition-[filter,opacity] duration-200",
                      recoveryRevealed
                        ? seedHover || copiedRecovery
                          ? "opacity-40 blur-[10px]"
                          : "opacity-100 blur-0"
                        : "opacity-60 blur-[10px]"
                    )}
                  >
                    {seedWords.map((w, idx) => (
                      <div
                        key={`${w}-${idx}`}
                        className="rounded-[9px] border border-white/10 bg-black/10 px-2.5 py-1.5 text-[12px] text-white/80 font-medium"
                      >
                        <span className="mr-2 text-white/35">{idx + 1}.</span>
                        {w}
                      </div>
                    ))}
                  </div>

                  {/* Hover copy overlay (only after reveal) */}
                  {recoveryRevealed && (
                    <div
                      className={cn(
                        "absolute inset-0 flex items-center justify-center transition-opacity duration-200",
                        seedHover || copiedRecovery ? "opacity-100" : "opacity-0 pointer-events-none"
                      )}
                    >
                      <button
                        type="button"
                        onClick={async () => {
                          const phrase = seedWords.join(" ");
                          try {
                            await navigator.clipboard.writeText(phrase);
                          } catch {
                            const ta = document.createElement("textarea");
                            ta.value = phrase;
                            ta.style.position = "fixed";
                            ta.style.opacity = "0";
                            document.body.appendChild(ta);
                            ta.select();
                            try { document.execCommand("copy"); } finally { document.body.removeChild(ta); }
                          }
                          setCopiedRecovery(true);
                          window.setTimeout(() => setCopiedRecovery(false), 1200);
                        }}
                        className={cn(
                          "h-10 px-5 rounded-[12px] font-semibold text-sm transition-all",
                          "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90"
                        )}
                      >
                        {copiedRecovery ? (
                          <span className="inline-flex items-center gap-2">
                            <Check className="h-4 w-4 text-white" />
                            Copied
                          </span>
                        ) : (
                          "Copy"
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>

            <motion.div className="pb-4 pt-3 flex justify-center" variants={walletModalItemCascadeVariants}>
              <div className="flex flex-col items-center gap-3">
                <Button
                  type="button"
                  onClick={() => {
                    if (!recoveryRevealed) {
                      setRecoveryRevealed(true);
                      return;
                    }
                    setQuizPositions(pickDistinctPositions(3, seedWords.length));
                    setQuizStep(0);
                    setQuizAnswer("");
                    setCreateFlowStep("quiz");
                  }}
                  className="h-11 px-10 rounded-[12px] bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 transition-all font-semibold"
                >
                  {recoveryRevealed ? "Next" : "Show my recovery phrase"}
                </Button>
                <button
                  type="button"
                  onClick={async () => {
                    const phrase = seedWords.join(" ");
                    try {
                      await navigator.clipboard.writeText(phrase);
                    } catch {
                      const ta = document.createElement("textarea");
                      ta.value = phrase;
                      ta.style.position = "fixed";
                      ta.style.opacity = "0";
                      document.body.appendChild(ta);
                      ta.select();
                      try { document.execCommand("copy"); } finally { document.body.removeChild(ta); }
                    }
                    setCopiedRecovery(true);
                    window.setTimeout(() => setCopiedRecovery(false), 1200);
                  }}
                  className="text-xs text-[var(--color-text-muted)] hover:text-white/70 transition-colors inline-flex items-center gap-1.5"
                >
                  {copiedRecovery ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-[var(--color-success)]" />
                      <span className="text-[var(--color-success)]">Copied</span>
                    </>
                  ) : (
                    "Copy"
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : createFlowStep === "quiz" ? (
          <motion.div
            className="min-h-full px-3 pt-6 flex flex-col"
            variants={walletModalFlowLayerVariants}
            initial="initial"
            animate="animate"
          >
            {(() => {
              const pos = quizPositions[quizStep] ?? 0;
              const target = (seedWords[pos] ?? "").trim().toLowerCase();
              const input = quizAnswer.trim().toLowerCase();
              const canContinue = Boolean(target) && input === target;
              return (
                <>
                  <motion.div
                    className="flex-1 flex flex-col items-center justify-center"
                    variants={walletModalItemCascadeVariants}
                  >
                    <div className="w-full max-w-[360px]">
                      <motion.div
                        className="flex items-center justify-center gap-3"
                        variants={walletModalItemCascadeVariants}
                      >
                        <h1 className="text-2xl font-semibold text-[var(--color-text-primary)] text-center">
                          Lets Double Check
                        </h1>
                      </motion.div>

                      <motion.p
                        className="mt-8 text-[var(--color-text-muted)] text-[13px] text-center"
                        variants={walletModalItemCascadeVariants}
                      >
                        Enter the word in{" "}
                        <span className="text-white">position {pos + 1}</span>{" "}
                        from
                        <br />
                        your recovery phrase.
                      </motion.p>

                      <motion.div
                        className="mt-6 mx-auto w-full max-w-[180px]"
                        variants={walletModalItemCascadeVariants}
                      >
                        <Input
                          value={quizAnswer}
                          onChange={(e) => setQuizAnswer(e.target.value)}
                          className="h-10 rounded-[10px] bg-white/[0.04] border-white/10 text-center"
                        />
                      </motion.div>

                      <motion.div className="mt-5 flex justify-center" variants={walletModalItemCascadeVariants}>
                        <button
                          type="button"
                          onClick={() => setCreateFlowStep("recovery")}
                          className="text-[13px] text-[var(--color-text-muted)] hover:text-white transition-colors"
                        >
                          Forgot to save? Go back
                        </button>
                      </motion.div>
                    </div>
                  </motion.div>

                  <motion.div className="pb-6 pt-6 flex justify-center" variants={walletModalItemCascadeVariants}>
                    <div className="flex flex-col items-center gap-4">
                      <div className="flex items-center gap-2">
                        {[0, 1, 2].map((i) =>
                          i === quizStep ? (
                            <motion.div
                              key={i}
                              layoutId="quiz-progress-pill"
                              className="h-2 w-7 rounded-full bg-[var(--color-primary)]/70"
                              transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.6 }}
                            />
                          ) : (
                            <div key={i} className="h-2 w-2 rounded-full bg-white/20" />
                          )
                        )}
                      </div>
                      <Button
                        type="button"
                        disabled={!canContinue}
                        onClick={() => {
                          if (!canContinue) return;
                          if (quizStep >= 2) {
                            setCreatedEvmAddress(randomEvmAddress());
                            setCreateFlowStep("success");
                            return;
                          }
                          setQuizStep((s) => s + 1);
                          setQuizAnswer("");
                        }}
                        className="h-11 px-10 rounded-[12px] bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 transition-all font-semibold"
                      >
                        Continue
                      </Button>
                    </div>
                  </motion.div>
                </>
              );
            })()}
          </motion.div>
        ) : createFlowStep === "success" ? (
          <motion.div
            className="flex min-h-0 w-full flex-1 flex-col gap-3 px-3 pb-2 pt-0 sm:gap-4"
            variants={walletModalFlowLayerVariants}
            initial="initial"
            animate="animate"
          >
            <motion.div
              variants={walletModalItemCascadeVariants}
              className="relative mx-auto w-full max-w-[156px] shrink-0 overflow-visible pt-1 sm:max-w-[176px] sm:pt-2"
            >
              <Image
                src="/Nuro Wallet Success Message.svg"
                alt="Wallet created successfully"
                width={520}
                height={520}
                className="relative z-10 mx-auto block h-auto max-h-[22vh] w-full object-contain sm:max-h-[26vh]"
                priority
              />
              <SuccessConfetti />
            </motion.div>
            <motion.div variants={walletModalItemCascadeVariants} className="w-full max-w-[480px] mx-auto text-center">
              <h1 className="text-xl font-semibold text-[var(--color-text-primary)] text-center sm:text-2xl">
                You&apos;re all set!
              </h1>
            </motion.div>
            <motion.div variants={walletModalItemCascadeVariants} className="w-full max-w-[520px] mx-auto text-center">
              <p className="text-sm text-[var(--color-text-muted)] text-center sm:text-base">
                Your wallet is now ready to use.
              </p>
            </motion.div>
            {createdEvmAddress ? (
              <motion.div
                variants={walletModalItemCascadeVariants}
                className="flex w-full min-w-0 shrink-0 justify-center px-0.5"
              >
                <EvmAddressCopyBar address={createdEvmAddress} />
              </motion.div>
            ) : null}
            <motion.div
              variants={walletModalItemCascadeVariants}
              className="mt-auto flex w-full shrink-0 justify-center px-1 pb-4 pt-3"
            >
              <div className="relative inline-flex">
                <span
                  aria-hidden
                  className="pointer-events-none absolute -inset-x-4 -inset-y-3 -z-10 rounded-[14px] bg-[rgba(56,189,248,0.26)] blur-2xl"
                />
                <Button
                  type="button"
                  onClick={() => {
                    if (IS_DEV) {
                      try {
                        writeDevPopulatedPreview(true);
                      } catch {
                        // ignore
                      }
                    }
                    router.replace(`${pathname}#wallet-view`);
                    setIsModalOpen(false);
                  }}
                  className="relative z-[1] h-11 px-10 rounded-[12px] bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 transition-all font-semibold"
                >
                  Go to wallet
                </Button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </CreateWalletModal>
      <CreateWalletQuitConfirmDialog
        open={createWalletQuitConfirmOpen}
        onStay={() => setCreateWalletQuitConfirmOpen(false)}
        onLeave={() => {
          setIsModalOpen(false);
          resetCreateWalletFlow();
        }}
      />
    </>
  );
}
