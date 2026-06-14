"use client";

import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAccount, useBalance, useReadContract, useSendTransaction, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { erc20Abi, parseUnits } from "viem";
import {
  ArrowDown,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  Globe,
  GripVertical,
  Maximize2,
  Pencil,
  Repeat,
  Search,
  Settings2,
  Star,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  DragOverlay,
  type DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  SortableContext,
  defaultAnimateLayoutChanges,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AnimatePresence, motion } from "framer-motion";
import { useDragSensors } from "@/components/DraggableStatCards";
import { shouldUseDevPopulatedData } from "@/lib/devPreviewMode";
import { usePersistedIdOrder } from "./usePersistedIdOrder";
import {
  WALLET_BALANCE_AMOUNT_MIN_H,
  WalletSkeletonText,
} from "./WalletDataSkeletons";
import { WalletAssetsModal } from "@/features/dashboard/cards/components/WalletAssetsModal";
import {
  WalletRecentActivityModal,
  type WalletRecentActivityModalRow,
} from "@/features/dashboard/cards/components/WalletRecentActivityModal";

// Session 25 Phase 2 + Phase 3 - real data wiring
import { useWalletPortfolio, type WalletPortfolio, type WalletToken } from "./useWalletPortfolio";
import { useWalletActivity, type WalletActivityEntry } from "./useWalletActivity";
import {
  WalletSendReceivePanel,
  type SendTransactionToolbarEvent,
} from "./WalletSendReceivePanel";
import { type WalletRightShell, walletSwapShellMotion } from "./WalletSendReceive5426";
import {
  SwapAssetPickerOverlay,
  type SwapPickerAsset,
  type SwapPickerKind,
} from "./SwapAssetPickerOverlay";
import { ChainIcon } from "@/lib/chainIcons";
import {
  WALLET_GLASS_MENU_CONTENT,
  walletGlassMenuItemRowSpacing,
} from "@/lib/walletGlassMenu";
import { useTokenWhitelist, isWhitelistedToken, type TokenWhitelist } from "./useTokenWhitelist";

export type { SendTransactionToolbarEvent };

type TradeTab = "Swap" | "Limit" | "Buy" | "Sell";

const ASSET_ROW_OVERFLOW_MENU: { label: string; Icon: LucideIcon }[] = [
  { label: "Send", Icon: ArrowUpRight },
  { label: "Receive", Icon: ArrowDownLeft },
  { label: "Swap", Icon: Repeat },
  { label: "Scanner", Icon: Globe },
];

// Polish pass - block explorer URLs for the supported chains. Native tokens
// drop to the chain homepage; ERC-20s link to the token page.
function explorerUrlForAsset(chainId: number, contract: string | null): string | null {
  const base = ((): string | null => {
    switch (chainId) {
      case 1:
        return "https://etherscan.io";
      case 8453:
        return "https://basescan.org";
      case 42161:
        return "https://arbiscan.io";
      case 137:
        return "https://polygonscan.com";
      case 10:
        return "https://optimistic.etherscan.io";
      default:
        return null;
    }
  })();
  if (!base) return null;
  if (!contract) return base;
  return `${base}/token/${contract}`;
}

const SEGMENTS = 40;

/** Overview / dashboard cards use `gap-4` between widgets - keep that as the only vertical rhythm between blocks here. */
const BLOCK_GAP = "gap-4";

function SegmentedBarSparkline({
  fillRatio,
  activeColor,
  className,
}: {
  fillRatio: number;
  activeColor: string;
  className?: string;
}) {
  const filled = Math.round(Math.min(1, Math.max(0, fillRatio)) * SEGMENTS);
  return (
    <div
      className={cn("flex w-full items-end justify-between gap-[2px]", className)}
      aria-hidden
    >
      {Array.from({ length: SEGMENTS }, (_, i) => {
        const on = i < filled;
        return (
          <span
            key={i}
            className="h-[10px] min-w-0 flex-1 rounded-[3px]"
            style={{
              backgroundColor: on ? activeColor : "rgba(255,255,255,0.08)",
            }}
          />
        );
      })}
    </div>
  );
}

/** Demo holdings: table balances sum to this total (matches banner). */
const PORTFOLIO_TOTAL_USD = 128_492.04;

type WalletBalancePerfWindow = "24h" | "7d";

const WALLET_BALANCE_RANGE_META: Record<
  WalletBalancePerfWindow,
  { changePct: number; rangeLabel: string }
> = {
  "24h": { changePct: 2.5, rangeLabel: "24hr" },
  "7d": { changePct: -0.8, rangeLabel: "7d" },
};

function formatSignedPctOneDecimal(value: number): string {
  const abs = Math.abs(value).toFixed(1);
  const sign = value >= 0 ? "+" : "−";
  return `${sign}${abs}%`;
}

/** Jagged sparkline (viewBox 0 0 100 40) - separate shapes for 24h vs 7d. */
function buildWalletBalanceSparklinePaths(window: WalletBalancePerfWindow): { lineD: string; areaD: string } {
  const w = 100;
  const h = 40;
  const n = 64;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    xs.push(t * w);
    if (window === "24h") {
      const noise =
        Math.sin(t * Math.PI * 5 + 0.35) * 4.6 +
        Math.sin(t * Math.PI * 11 + 0.2) * 3.1 +
        Math.sin(t * Math.PI * 19) * 1.75;
      const surge = Math.max(0, (t - 0.58) / 0.42);
      const surgeY = surge * surge * 11.5;
      const base = 30 - t * 10.2 - surgeY;
      ys.push(Math.min(h - 1.5, Math.max(3.2, base + noise * (0.26 + t * 0.4))));
    } else {
      const drift = 11.5 + t * 14.5;
      const ripples =
        Math.sin(t * Math.PI * 6.1 + 0.5) * 3.4 +
        Math.sin(t * Math.PI * 13 + 0.2) * 2.1 +
        Math.sin(t * Math.PI * 21) * 1.2;
      const relief = Math.exp(-0.5 * Math.pow((t - 0.55) / 0.2, 2)) * 4.8;
      ys.push(Math.min(h - 1.5, Math.max(3.4, drift + ripples * 0.42 - relief * 0.35)));
    }
  }
  let lineD = `M ${xs[0].toFixed(2)} ${ys[0].toFixed(2)}`;
  for (let j = 1; j < n; j++) {
    lineD += ` L ${xs[j].toFixed(2)} ${ys[j].toFixed(2)}`;
  }
  const areaD = `${lineD} L ${w} ${h} L 0 ${h} Z`;
  return { lineD, areaD };
}

const WALLET_BALANCE_SPARKLINE_24H = buildWalletBalanceSparklinePaths("24h");
const WALLET_BALANCE_SPARKLINE_7D = buildWalletBalanceSparklinePaths("7d");

function WalletBalanceBannerSparkline({
  paths,
  fillGradientId,
}: {
  paths: { lineD: string; areaD: string };
  fillGradientId: string;
}) {
  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className="h-full w-full"
      aria-hidden
    >
      <defs>
        <linearGradient id={fillGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.14} />
          <stop offset="50%" stopColor="var(--color-primary)" stopOpacity={0.045} />
          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={paths.areaD} fill={`url(#${fillGradientId})`} />
      <path
        d={paths.lineD}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth={0.85}
        strokeOpacity={0.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function formatUsd(value: number) {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** `public/Gas Icon.svg` (URL-encoded for the space in the filename).
 * Ported from Chris 4.23 drop - reusable on any panel toolbar where we
 * want to surface an estimated network fee alongside an action CTA. */
const WALLET_GAS_ICON_SRC = "/Gas%20Icon.svg";

/**
 * Muted "gas + USD" chip for swap / send toolbars. Presentational only -
 * caller is responsible for computing the USD value from a live quote or
 * placeholder. Port from Chris 4.23; consumers added when gas-quote hook
 * lands.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function WalletPanelGasInline({ usd, className }: { usd: number; className?: string }) {
  return (
    <div
      className={cn("inline-flex min-w-0 max-w-full shrink-0 items-center gap-1.5 pr-3.5", className)}
      title="Estimated network fee (gas)"
    >
      <img
        src={WALLET_GAS_ICON_SRC}
        alt=""
        width={14}
        height={14}
        className="h-3.5 w-3.5 shrink-0 object-contain opacity-70"
        aria-hidden
        loading="eager"
        decoding="async"
      />
      <span className="whitespace-nowrap text-[11px] font-medium tabular-nums text-white/50 sm:text-xs">
        {formatUsd(usd)}
      </span>
    </div>
  );
}

/** Demo / fallback address (matches header mock `0x742d…f44e`). */
export const DEMO_CONNECTED_WALLET_ADDRESS =
  "0x742d35Cc6634C0532925a3b844Bc9e7590f44e" as const;

function truncateAddressMiddle(address: string, headChars = 6, tailChars = 4) {
  const a = address.trim();
  if (!a) return "";
  if (a.length <= headChars + tailChars + 1) return a;
  return `${a.slice(0, headChars)}…${a.slice(-tailChars)}`;
}

/** Compact relative time for “last synced” copy (ticks every second in the banner). */
function formatBalanceSyncedAge(elapsedMs: number) {
  const s = Math.max(0, Math.floor(elapsedMs / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const DEFAULT_WALLET_DISPLAY_NAME = "My wallet";

function walletLabelStorageKey(address: string) {
  return `nuro:wallet-label:${address.toLowerCase()}`;
}

function readStoredWalletLabel(address: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(walletLabelStorageKey(address))?.trim();
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Name sits in the top identity row beside the copy-address chip. */
const BANNER_NAME_ROW = "min-w-0 w-full";

/** Fade duration for name ↔ input crossfade (matches close delay). */
const NAME_EDIT_FADE_MS = 200;

function WalletBannerNameEditor({ fullAddress }: { fullAddress: string }) {
  const [name, setName] = useState(DEFAULT_WALLET_DISPLAY_NAME);
  const [draft, setDraft] = useState(DEFAULT_WALLET_DISPLAY_NAME);
  const [editing, setEditing] = useState(false);
 /** When `editing`, drives opacity crossfade (false until next frame so both layers can transition). */
  const [fadedIn, setFadedIn] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const closingRef = useRef(false);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current != null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  useEffect(() => {
    const next = readStoredWalletLabel(fullAddress) ?? DEFAULT_WALLET_DISPLAY_NAME;
    clearCloseTimer();
    closingRef.current = false;
    setName(next);
    setDraft(next);
    setEditing(false);
    setFadedIn(false);
  }, [clearCloseTimer, fullAddress]);

  useEffect(() => {
    if (!editing) {
      setFadedIn(false);
      return;
    }
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce) {
      setFadedIn(true);
      return;
    }
    setFadedIn(false);
    const id = requestAnimationFrame(() => setFadedIn(true));
    return () => cancelAnimationFrame(id);
  }, [editing]);

  useEffect(() => {
    if (editing && fadedIn) inputRef.current?.focus();
  }, [editing, fadedIn]);

  const finishClose = useCallback(
    (save: boolean) => {
      if (!editing || closingRef.current) return;
      const reduce =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      const delay = reduce ? 0 : NAME_EDIT_FADE_MS;
      const next = draft.trim() || DEFAULT_WALLET_DISPLAY_NAME;

      closingRef.current = true;
      inputRef.current?.blur();
      setFadedIn(false);

      clearCloseTimer();
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        closingRef.current = false;
        if (save) {
          setName(next);
          setDraft(next);
          try {
            localStorage.setItem(walletLabelStorageKey(fullAddress), next);
          } catch {
 /* ignore quota / private mode */
          }
        } else {
          setDraft(name);
        }
        setEditing(false);
      }, delay);
    },
    [clearCloseTimer, draft, editing, fullAddress, name]
  );

  const commit = useCallback(() => finishClose(true), [finishClose]);

  const startEdit = useCallback(() => {
    clearCloseTimer();
    closingRef.current = false;
    setDraft(name);
    setEditing(true);
  }, [clearCloseTimer, name]);

  const showInput = editing && fadedIn;

  return (
    <div className={cn("relative h-8 min-h-8 w-full min-w-0 overflow-hidden", BANNER_NAME_ROW)}>
      {/* Display name + pencil - fades out while editing */}
      <div
        className={cn(
          "absolute inset-y-0 left-0 flex w-full min-w-0 max-w-full flex-nowrap items-center gap-1 transition-opacity ease-in-out motion-reduce:transition-none",
          showInput ? "pointer-events-none opacity-0" : "opacity-100"
        )}
        style={{ transitionDuration: `${NAME_EDIT_FADE_MS}ms` }}
        aria-hidden={showInput}
      >
        <p
          className="min-w-0 max-w-[calc(100%-1.75rem)] shrink truncate text-lg font-semibold leading-none tracking-tight text-[var(--color-text-primary)] sm:text-xl"
          title={name}
        >
          {name}
        </p>
        <button
          type="button"
          onClick={startEdit}
          title="Edit wallet name"
          aria-label="Edit wallet name"
          className="shrink-0 rounded-md p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        >
          <Pencil className="h-3 w-3" strokeWidth={1.5} aria-hidden />
        </button>
      </div>

      {/* Input + save - fades in while editing */}
      <div
        className={cn(
          "absolute inset-y-0 left-0 flex h-8 min-w-0 max-w-[16rem] flex-nowrap items-center gap-1 transition-opacity ease-in-out motion-reduce:transition-none",
          showInput ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        style={{ transitionDuration: `${NAME_EDIT_FADE_MS}ms` }}
        aria-hidden={!showInput}
      >
        <input
          ref={inputRef}
          value={draft}
          maxLength={80}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              finishClose(false);
            }
          }}
          aria-label="Wallet name"
          className="h-8 min-w-0 w-[10.5rem] shrink-0 rounded-[10px] border-0 bg-white/[0.04] px-2.5 text-sm font-medium text-[var(--color-text-primary)] shadow-none outline-none ring-0 transition-colors placeholder:text-[var(--color-text-muted)] focus:bg-white/[0.09] focus:ring-0 sm:w-[11.25rem]"
          placeholder={DEFAULT_WALLET_DISPLAY_NAME}
        />
        <button
          type="button"
          onClick={commit}
          title="Save name"
          aria-label="Save wallet name"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border-0 bg-white/[0.05] text-white/70 transition-colors hover:bg-white/[0.09] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-0"
        >
          <Check className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** One row in the wallet; `balanceUsdNumber` drives sort order and bar fill vs total wallet USD. */
export type WalletHolding = {
  id: string;
  name: string;
  symbol: string;
  balanceUsdNumber: number;
  holdings: string;
  color: string;
};

export type TopAssetCardModel = {
  id: string;
  name: string;
  symbol: string;
  balanceUsd: string;
  holdings: string;
  fill: number;
  color: string;
};

/** Demo wallet: can include many assets; only the top 3 by USD are shown as cards. */
const DEMO_WALLET_HOLDINGS: WalletHolding[] = [
  {
    id: "eth-mainnet",
    name: "Ethereum",
    symbol: "ETH",
    balanceUsdNumber: 54_920,
    holdings: "15.77 ETH",
    color: "rgba(59, 130, 246, 0.95)",
  },
  {
    id: "sol",
    name: "Solana",
    symbol: "SOL",
    balanceUsdNumber: 44_610,
    holdings: "313.8 SOL",
    color: "rgba(167, 139, 250, 0.95)",
  },
  {
    id: "btc",
    name: "Bitcoin",
    symbol: "BTC",
    balanceUsdNumber: 15_200,
    holdings: "0.146 BTC",
    color: "rgba(247, 147, 26, 0.95)",
  },
  {
    id: "qnt",
    name: "Quant",
    symbol: "QNT",
    balanceUsdNumber: 12_390,
    holdings: "114.3 QNT",
    color: "rgba(251, 146, 60, 0.95)",
  },
  {
    id: "eth-base",
    name: "Base ETH",
    symbol: "ETH",
    balanceUsdNumber: 1372.04,
    holdings: "0.39 ETH",
    color: "rgba(96, 165, 250, 0.92)",
  },
];

/** Dev preview - sendable portfolio rows when `/api/wallet-portfolio` is empty (5.4.26 demo balances). */
const DEMO_SENDABLE_TOKENS: WalletToken[] = [
  {
    chainId: 1,
    chainName: "Ethereum",
    contract: null,
    symbol: "ETH",
    name: "Ethereum",
    decimals: 18,
    logo: null,
    balance: "15.77",
    balanceRaw: "0",
    usdPrice: 3482.9,
    usdValue: 54_920,
    delta24h: 1.2,
    isNative: true,
  },
  {
    chainId: 8453,
    chainName: "Base",
    contract: null,
    symbol: "ETH",
    name: "Ethereum",
    decimals: 18,
    logo: null,
    balance: "0.39",
    balanceRaw: "0",
    usdPrice: 3482.9,
    usdValue: 1372.04,
    delta24h: null,
    isNative: true,
  },
];

function pickTopAssetCards(holdings: WalletHolding[], maxCards = 3): TopAssetCardModel[] {
  if (holdings.length === 0) return [];
  const walletTotalUsd = holdings.reduce((s, h) => s + Math.max(0, Number(h.balanceUsdNumber) || 0), 0);
  const sorted = [...holdings].sort(
    (a, b) => (Number(b.balanceUsdNumber) || 0) - (Number(a.balanceUsdNumber) || 0)
  );
  const picked = sorted.slice(0, Math.min(maxCards, sorted.length));
  return picked.map((h) => {
    const v = Math.max(0, Number(h.balanceUsdNumber) || 0);
    return {
      id: h.id,
      name: h.name,
      symbol: h.symbol,
      balanceUsd: formatUsd(v),
      holdings: h.holdings,
      fill: walletTotalUsd > 0 ? v / walletTotalUsd : 0,
      color: h.color,
    };
  });
}

/** Dev-preview / design parity only - not used when live portfolio tokens exist. */
const WALLET_ASSET_TABLE_MOCK_ROWS = [
  {
    key: "eth-mainnet",
    asset: "Ethereum",
    sym: "ETH",
    balance: formatUsd(54_920),
    price: "$3,482.90",
    d24: "+1.2%",
    cap: "$418B",
  },
  {
    key: "sol",
    asset: "Solana",
    sym: "SOL",
    balance: formatUsd(44_610),
    price: "$142.18",
    d24: "+0.8%",
    cap: "$68B",
  },
  {
    key: "btc",
    asset: "Bitcoin",
    sym: "BTC",
    balance: formatUsd(15_200),
    price: "$104,120.00",
    d24: "-0.4%",
    cap: "$2.0T",
  },
  {
    key: "qnt",
    asset: "Quant",
    sym: "QNT",
    balance: formatUsd(12_390),
    price: "$108.40",
    d24: "+0.1%",
    cap: "$1.3B",
  },
  {
    key: "eth-base",
    asset: "Base ETH",
    sym: "ETH",
    balance: formatUsd(1372.04),
    price: "$3,479.10",
    d24: "+1.1%",
    cap: "-",
    isScam: true,
  },
] as const;

const WALLET_RECENT_ACTIVITY_ROWS: WalletRecentActivityModalRow[] = [
  {
    key: "act-1",
    title: "Swapped ETH → USDC",
    meta: "Today · 9:41 AM",
    txid: "0x7f4e8d1c2b9a6f5e4d3c2b1a0987654321fedcba0123456789abcdef01234567",
    amount: "-0.42 ETH",
    amountUsd: "-$1,470.00",
    kind: "swap",
    status: "completed",
    eventDate: "2026-04-19",
  },
  {
    key: "act-2",
    title: "Received USDC",
    meta: "Yesterday · 4:12 PM",
    txid: "0x91a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f80",
    amount: "+$2,400.00",
    kind: "received",
    status: "completed",
    eventDate: "2026-04-18",
  },
  {
    key: "act-3",
    title: "Bridge to Base",
    meta: "Apr 15 · 1:03 PM",
    txid: "0x3c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9",
    amount: "-0.10 ETH",
    amountUsd: "-$350.00",
    kind: "other",
    status: "pending",
    eventDate: "2026-04-15",
  },
  {
    key: "act-4",
    title: "Card spend settled",
    meta: "Apr 14 · 6:22 PM",
    txid: "0xdeadbeefcafebabe0123456789abcdef0123456789abcdef0123456789abcdef",
    amount: "-$182.14",
    kind: "sent",
    status: "completed",
    eventDate: "2026-04-14",
  },
  {
    key: "act-5",
    title: "Sent SOL",
    meta: "Apr 13 · 2:10 PM",
    txid: "0x111122223333444455556666777788889999aaaabbbbccccddddeeeeffff0000",
    amount: "-12.5 SOL",
    kind: "sent",
    status: "completed",
    eventDate: "2026-04-13",
  },
  {
    key: "act-6",
    title: "Staking reward",
    meta: "Apr 12 · 8:00 AM",
    txid: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    amount: "+0.04 ETH",
    kind: "received",
    status: "completed",
    eventDate: "2026-04-12",
  },
  {
    key: "act-7",
    title: "NFT mint",
    meta: "Apr 11 · 5:44 PM",
    txid: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    amount: "-0.08 ETH",
    kind: "sent",
    status: "pending",
    eventDate: "2026-04-11",
  },
  {
    key: "act-8",
    title: "Approved USDC",
    meta: "Apr 10 · 11:02 AM",
    txid: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    amount: "-",
    kind: "other",
    status: "pending",
    eventDate: "2026-04-10",
  },
  {
    key: "act-9",
    title: "Deposited to vault",
    meta: "Apr 9 · 9:15 AM",
    txid: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    amount: "-$500.00",
    kind: "other",
    status: "completed",
    eventDate: "2026-04-09",
  },
  {
    key: "act-10",
    title: "Withdrawal completed",
    meta: "Apr 8 · 4:30 PM",
    txid: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    amount: "+$1,200.00",
    kind: "received",
    status: "completed",
    eventDate: "2026-04-08",
  },
  {
    key: "act-11",
    title: "Swap failed (reverted)",
    meta: "Apr 7 · 6:18 PM",
    txid: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    amount: "-",
    kind: "swap",
    status: "cancelled",
    eventDate: "2026-04-07",
  },
  {
    key: "act-12",
    title: "Received airdrop",
    meta: "Apr 6 · 10:00 AM",
    txid: "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    amount: "+1,000 ARB",
    kind: "received",
    status: "completed",
    eventDate: "2026-04-06",
  },
];

/** Widget shell: matches overview `WidgetCard` (radii + card surface). No outer stroke. */
function surfaceCard(className?: string) {
  return cn(
    "bg-[var(--color-bg-card)] dark:bg-[var(--color-bg-card)] dark:backdrop-blur-[var(--widget-blur)] glass-card-inner rounded-[var(--radius-card)] sm:rounded-[var(--radius-xl)]",
    className
  );
}

const CARD_RADIUS = "rounded-[var(--radius-card)] sm:rounded-[var(--radius-xl)]";

/** Rim border stroke alpha (2px hooks); stem SVG stops scaled to same peak. Margin glows keep their own alphas. */
const WALLET_BANNER_RIM_STROKE_ALPHA = 0.2;

/** Solana sparkline purple (`DEMO_WALLET_HOLDINGS` Solana `color`), rim stroke. */
const WALLET_BANNER_SOLANA_SPARKLINE_PURPLE = `rgba(167, 139, 250, ${WALLET_BANNER_RIM_STROKE_ALPHA})`;
const WALLET_BANNER_INFO_BLUE_STROKE = `rgba(59, 130, 246, ${WALLET_BANNER_RIM_STROKE_ALPHA})`;

/** Left stem + BL hook + left margin glow: `"blue"` | `"purple"` - flip one line to restore purple. */
const WALLET_BANNER_EDGE_ACCENT: "blue" | "purple" = "blue";

const WALLET_BANNER_EDGE_RGB =
  WALLET_BANNER_EDGE_ACCENT === "blue" ? "59, 130, 246" : "167, 139, 250";

const WALLET_BANNER_EDGE_STROKE =
  WALLET_BANNER_EDGE_ACCENT === "blue"
    ? WALLET_BANNER_INFO_BLUE_STROKE
    : WALLET_BANNER_SOLANA_SPARKLINE_PURPLE;

const WALLET_BANNER_EDGE_BL_BOX_SHADOW =
  WALLET_BANNER_EDGE_ACCENT === "blue"
    ? "0 5px 14px rgba(59,130,246,0.17), -3px 0 12px rgba(59,130,246,0.08)"
    : "0 5px 14px rgba(167,139,250,0.17), -3px 0 12px rgba(167,139,250,0.08)";

const RIM_HOOK = "h-14 w-14 sm:h-16 sm:w-16";

/**
 * Blue TR column (hook + stem): one shared `translateX` so border + SVG rasterize as one layer (no seam).
 * px, negative = left. Purple unchanged.
 */
const WALLET_BANNER_TR_COLUMN_SHIFT_PX = -1;

/**
 * Rim outside the overflow-hidden shell.
 * Corner hooks: border + horizontal mask (keeps vertical leg solid).
 * Vertical stems: SVG `<rect>` + `<linearGradient>` - avoids CSS mask + 2px div + box-shadow “step” artifacts.
 * TR hook + blue stem share one column wrapper; `WALLET_BANNER_TR_COLUMN_SHIFT_PX` is applied on that wrapper only.
 */
function WalletBalanceBannerRimDecor() {
  const uid = useId().replace(/:/g, "");
  const leftStemGradId = `${uid}-wallet-rim-l`;
  const rightStemGradId = `${uid}-wallet-rim-r`;

  return (
    <div className="pointer-events-none absolute inset-0 z-[2] overflow-visible">
      <div
        aria-hidden
        className="absolute bottom-14 left-0 top-[20%] w-[2px] overflow-visible sm:bottom-16"
      >
        <svg className="block h-full w-full" width={2} preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient
              id={leftStemGradId}
              x1={0}
              y1={0}
              x2={0}
              y2={1}
              gradientUnits="objectBoundingBox"
            >
              <stop offset="0%" stopColor={`rgb(${WALLET_BANNER_EDGE_RGB})`} stopOpacity={0} />
              <stop offset="3.6%" stopColor={`rgb(${WALLET_BANNER_EDGE_RGB})`} stopOpacity={0.006} />
              <stop offset="7.1%" stopColor={`rgb(${WALLET_BANNER_EDGE_RGB})`} stopOpacity={0.013} />
              <stop offset="11.9%" stopColor={`rgb(${WALLET_BANNER_EDGE_RGB})`} stopOpacity={0.023} />
              <stop offset="16.7%" stopColor={`rgb(${WALLET_BANNER_EDGE_RGB})`} stopOpacity={0.035} />
              <stop offset="21.4%" stopColor={`rgb(${WALLET_BANNER_EDGE_RGB})`} stopOpacity={0.047} />
              <stop offset="26.2%" stopColor={`rgb(${WALLET_BANNER_EDGE_RGB})`} stopOpacity={0.062} />
              <stop offset="30.9%" stopColor={`rgb(${WALLET_BANNER_EDGE_RGB})`} stopOpacity={0.077} />
              <stop offset="35.7%" stopColor={`rgb(${WALLET_BANNER_EDGE_RGB})`} stopOpacity={0.095} />
              <stop offset="40.4%" stopColor={`rgb(${WALLET_BANNER_EDGE_RGB})`} stopOpacity={0.112} />
              <stop offset="45.2%" stopColor={`rgb(${WALLET_BANNER_EDGE_RGB})`} stopOpacity={0.127} />
              <stop offset="50%" stopColor={`rgb(${WALLET_BANNER_EDGE_RGB})`} stopOpacity={0.142} />
              <stop offset="54.7%" stopColor={`rgb(${WALLET_BANNER_EDGE_RGB})`} stopOpacity={0.155} />
              <stop offset="59.5%" stopColor={`rgb(${WALLET_BANNER_EDGE_RGB})`} stopOpacity={0.166} />
              <stop offset="64.2%" stopColor={`rgb(${WALLET_BANNER_EDGE_RGB})`} stopOpacity={0.176} />
              <stop offset="69%" stopColor={`rgb(${WALLET_BANNER_EDGE_RGB})`} stopOpacity={0.185} />
              <stop offset="73.7%" stopColor={`rgb(${WALLET_BANNER_EDGE_RGB})`} stopOpacity={0.192} />
              <stop offset="78.5%" stopColor={`rgb(${WALLET_BANNER_EDGE_RGB})`} stopOpacity={0.196} />
              <stop offset="83.2%" stopColor={`rgb(${WALLET_BANNER_EDGE_RGB})`} stopOpacity={0.199} />
              <stop offset="88%" stopColor={`rgb(${WALLET_BANNER_EDGE_RGB})`} stopOpacity={0.2} />
              <stop offset="100%" stopColor={`rgb(${WALLET_BANNER_EDGE_RGB})`} stopOpacity={0.2} />
            </linearGradient>
          </defs>
          <rect x={0} y={0} width="100%" height="100%" fill={`url(#${leftStemGradId})`} />
        </svg>
      </div>
      <div
        aria-hidden
        className={cn(
          "absolute bottom-0 left-0 box-border",
          RIM_HOOK,
          "rounded-bl-[var(--radius-card)] sm:rounded-bl-[var(--radius-xl)]",
          "border-b-2 border-l-2"
        )}
        style={{
          borderBottomColor: WALLET_BANNER_EDGE_STROKE,
          borderLeftColor: WALLET_BANNER_EDGE_STROKE,
          WebkitMaskImage: "linear-gradient(90deg,#000 0%,#000 44%,transparent 99%)",
          maskImage: "linear-gradient(90deg,#000 0%,#000 44%,transparent 99%)",
          boxShadow: WALLET_BANNER_EDGE_BL_BOX_SHADOW,
        }}
      />

      <div
        aria-hidden
        className="absolute right-0 top-0 bottom-[20%] w-14 overflow-visible sm:w-16"
        style={{ transform: `translateX(${WALLET_BANNER_TR_COLUMN_SHIFT_PX}px)` }}
      >
        <div
          className={cn(
            "absolute right-0 top-0 box-border",
            RIM_HOOK,
            "rounded-tr-[var(--radius-card)] sm:rounded-tr-[var(--radius-xl)]",
            "border-r-2 border-t-2"
          )}
          style={{
            borderTopColor: WALLET_BANNER_INFO_BLUE_STROKE,
            borderRightColor: WALLET_BANNER_INFO_BLUE_STROKE,
            WebkitMaskImage: "linear-gradient(90deg,transparent 1%,#000 38%,#000 100%)",
            maskImage: "linear-gradient(90deg,transparent 1%,#000 38%,#000 100%)",
            boxShadow: "0 -5px 14px rgba(59,130,246,0.16), 0 0 12px rgba(59,130,246,0.069)",
          }}
        />
        <div
          className="absolute bottom-0 right-0 top-14 w-[2px] overflow-visible sm:top-16"
        >
          <svg className="block h-full w-full" width={2} preserveAspectRatio="none" aria-hidden>
            <defs>
              <linearGradient
                id={rightStemGradId}
                x1={0}
                y1={0}
                x2={0}
                y2={1}
                gradientUnits="objectBoundingBox"
              >
                <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity={0.2} />
                <stop offset="15%" stopColor="rgb(59, 130, 246)" stopOpacity={0.2} />
                <stop offset="19.6%" stopColor="rgb(59, 130, 246)" stopOpacity={0.199} />
                <stop offset="24.2%" stopColor="rgb(59, 130, 246)" stopOpacity={0.196} />
                <stop offset="28.8%" stopColor="rgb(59, 130, 246)" stopOpacity={0.192} />
                <stop offset="33.4%" stopColor="rgb(59, 130, 246)" stopOpacity={0.185} />
                <stop offset="38%" stopColor="rgb(59, 130, 246)" stopOpacity={0.176} />
                <stop offset="42.6%" stopColor="rgb(59, 130, 246)" stopOpacity={0.166} />
                <stop offset="47.2%" stopColor="rgb(59, 130, 246)" stopOpacity={0.155} />
                <stop offset="51.8%" stopColor="rgb(59, 130, 246)" stopOpacity={0.142} />
                <stop offset="56.4%" stopColor="rgb(59, 130, 246)" stopOpacity={0.127} />
                <stop offset="60.9%" stopColor="rgb(59, 130, 246)" stopOpacity={0.112} />
                <stop offset="65.5%" stopColor="rgb(59, 130, 246)" stopOpacity={0.095} />
                <stop offset="70.1%" stopColor="rgb(59, 130, 246)" stopOpacity={0.077} />
                <stop offset="74.7%" stopColor="rgb(59, 130, 246)" stopOpacity={0.062} />
                <stop offset="79.3%" stopColor="rgb(59, 130, 246)" stopOpacity={0.047} />
                <stop offset="83.9%" stopColor="rgb(59, 130, 246)" stopOpacity={0.035} />
                <stop offset="88.5%" stopColor="rgb(59, 130, 246)" stopOpacity={0.023} />
                <stop offset="93.1%" stopColor="rgb(59, 130, 246)" stopOpacity={0.013} />
                <stop offset="96.7%" stopColor="rgb(59, 130, 246)" stopOpacity={0.006} />
                <stop offset="100%" stopColor="rgb(59, 130, 246)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <rect x={0} y={0} width="100%" height="100%" fill={`url(#${rightStemGradId})`} />
          </svg>
        </div>
      </div>
    </div>
  );
}

type WalletBalanceBannerProps = {
  address: string;
  portfolio?: WalletPortfolio;
 /** User reload or first fetch - skeleton on balance amount only. */
  showSkeleton?: boolean;
  onSend?: () => void;
  onReceive?: () => void;
 /** 5.4.26 - opens send/receive inside the swap panel shell. */
  onTransferAction?: (tab: "send" | "receive") => void;
  onRefresh?: () => void;
};

function WalletBalanceBanner(props: WalletBalanceBannerProps) {
  const { address, portfolio, onSend, onReceive, onTransferAction, onRefresh } = props;
  const balanceShowSkeleton = props.showSkeleton === true;
  const balanceSparkFillId = useId().replace(/:/g, "");
  const fullAddress = address.trim() || DEMO_CONNECTED_WALLET_ADDRESS;
  const shortAddress = truncateAddressMiddle(fullAddress);
  const [copied, setCopied] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(() => Date.now());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [perfWindow, setPerfWindow] = useState<WalletBalancePerfWindow>("24h");

  const rangeMeta = WALLET_BALANCE_RANGE_META[perfWindow];
  const sparkPaths = perfWindow === "24h" ? WALLET_BALANCE_SPARKLINE_24H : WALLET_BALANCE_SPARKLINE_7D;

  useEffect(() => {
    setCopied(false);
    setLastSyncedAt(Date.now());
  }, [fullAddress]);

  useEffect(() => {
    if (!balanceShowSkeleton) return;
    setLastSyncedAt(Date.now());
  }, [balanceShowSkeleton]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const syncedAgeLabel = useMemo(
    () => formatBalanceSyncedAge(nowMs - lastSyncedAt),
    [nowMs, lastSyncedAt]
  );

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyAddress = useCallback(() => {
    void navigator.clipboard.writeText(fullAddress);
    setCopied(true);
  }, [fullAddress]);

  return (
    <div className="relative isolate w-full">
      {/* Left margin glow - geometry mirrors right; color follows WALLET_BANNER_EDGE_ACCENT */}
      <div
        aria-hidden
        className="pointer-events-none absolute z-0 block opacity-0 dark:opacity-90"
        style={{
          left: 0,
          top: "7.5%",
          bottom: "7.5%",
          width: "30px",
          transform: "translate(calc(-100% + 10px), 20px) translateX(2px)",
          background: `radial-gradient(ellipse 74% 98% at 92% 58%, rgba(${WALLET_BANNER_EDGE_RGB},0.5) 0%, rgba(${WALLET_BANNER_EDGE_RGB},0.14) 44%, rgba(${WALLET_BANNER_EDGE_RGB},0) 62%)`,
          filter: "blur(9px)",
          WebkitMaskImage:
            "linear-gradient(180deg, transparent 0%, black 7%, black 82%, rgba(0,0,0,0.5) 89%, rgba(0,0,0,0.14) 95%, transparent 100%)",
          maskImage:
            "linear-gradient(180deg, transparent 0%, black 7%, black 82%, rgba(0,0,0,0.5) 89%, rgba(0,0,0,0.14) 95%, transparent 100%)",
        }}
      />
      {/* Right margin: blue - vertical mirror of left mask (heavy toward top-right corner); 20px higher than left */}
      <div
        aria-hidden
        className="pointer-events-none absolute z-0 block opacity-0 dark:opacity-90"
        style={{
          right: 0,
          top: "7.5%",
          bottom: "7.5%",
          width: "30px",
          transform: "translate(calc(100% - 10px), 0px) translateX(-2px)",
          background:
            "radial-gradient(ellipse 74% 98% at 8% 30%, rgba(59,130,246,0.5) 0%, rgba(59,130,246,0.14) 44%, rgba(59,130,246,0) 62%)",
          filter: "blur(9px)",
          WebkitMaskImage:
            "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.14) 5%, rgba(0,0,0,0.5) 11%, black 18%, black 93%, rgba(0,0,0,0.5) 96%, rgba(0,0,0,0.14) 98%, transparent 100%)",
          maskImage:
            "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.14) 5%, rgba(0,0,0,0.5) 11%, black 18%, black 93%, rgba(0,0,0,0.5) 96%, rgba(0,0,0,0.14) 98%, transparent 100%)",
        }}
      />

      <div
        className={cn(
          "relative isolate z-[1] flex min-h-[168px] flex-col overflow-hidden p-6 sm:min-h-[184px] sm:p-8",
          "xl:min-h-0 xl:h-auto xl:shrink-0",
          CARD_RADIUS
        )}
      >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-0 overflow-hidden",
          CARD_RADIUS,
          "bg-[var(--color-bg-card)] dark:bg-[var(--color-bg-card)] dark:backdrop-blur-[var(--widget-blur)] glass-card-inner [transform:translateZ(0)]"
        )}
      />
      <div
        aria-hidden
        className={cn("pointer-events-none absolute inset-0 z-[1] overflow-hidden", CARD_RADIUS)}
      >
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[var(--color-primary)]/10 blur-3xl" />
      </div>

      {/* Faint cyan sparkline + fill - right-weighted, fades into the balance column (no dots). */}
      <div
        aria-hidden
        className={cn("pointer-events-none absolute inset-0 z-[5] overflow-hidden", CARD_RADIUS)}
      >
        <div
          className="pointer-events-none absolute bottom-[3.35rem] right-0 top-[3.75rem] w-[min(60%,26rem)] min-w-[10.5rem] sm:bottom-[3.6rem] sm:top-[3.85rem]"
          style={{
            transform: "translateX(-2px)",
            maskImage:
              "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.28) 12%, rgba(0,0,0,0.75) 28%, black 45%)",
            WebkitMaskImage:
              "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.28) 12%, rgba(0,0,0,0.75) 28%, black 45%)",
            opacity: 0.88,
          }}
        >
          <WalletBalanceBannerSparkline
            key={perfWindow}
            paths={sparkPaths}
            fillGradientId={balanceSparkFillId}
          />
        </div>
      </div>

      <div className="relative z-10 flex min-h-0 flex-col">
        <div className="flex min-h-0 flex-col justify-start">
          <div className="flex min-w-0 flex-col gap-3">
            {/* ① Identity header */}
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <WalletBannerNameEditor fullAddress={fullAddress} />
              </div>
              <div className="flex shrink-0 items-center gap-3 sm:gap-4">
                <div className="flex h-8 items-center gap-3 sm:gap-4" role="group" aria-label="Performance range">
                  {(["24h", "7d"] as const).map((w) => {
                    const label = w === "24h" ? "24hr" : "7d";
                    const active = perfWindow === w;
                    return (
                      <button
                        key={w}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setPerfWindow(w)}
                        className={cn(
                          "border-0 bg-transparent p-0 text-[11px] font-semibold tabular-nums transition-colors duration-150",
                          "min-h-8 min-w-0 rounded-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
                          active ? "text-white" : "text-white/45 hover:text-white"
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <TooltipProvider delayDuration={200} skipDelayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={copied ? "Address copied" : "Copy wallet address"}
                        onClick={copyAddress}
                        className={cn(
                          "group z-20 flex h-8 w-fit max-w-[min(100%,18rem)] shrink-0 items-center gap-1 rounded-[var(--radius-sm)] bg-white/[0.04] py-0 pl-3 pr-2 font-mono text-[13px] font-medium tabular-nums text-[var(--color-text-primary)] transition-[background-color,color] duration-150",
                          "hover:bg-white/[0.1] active:bg-white/[0.12]",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                        )}
                      >
                      <span className="pointer-events-none min-w-0 max-w-[12.5rem] truncate text-left">
                        {shortAddress}
                      </span>
                      <span className="pointer-events-none inline-flex h-6 w-4 shrink-0 items-center justify-center">
                        {copied ? (
                          <Check
                            className="pointer-events-none h-3.5 w-3.5 shrink-0 text-[var(--color-success)]"
                            strokeWidth={2.5}
                            aria-hidden
                          />
                        ) : (
                          <Copy
                            className="pointer-events-none h-3.5 w-3.5 shrink-0 text-white/55 transition-colors duration-150 group-hover:text-white"
                            strokeWidth={2}
                            aria-hidden
                          />
                        )}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    align="end"
                    className="pointer-events-none font-mono"
                  >
                    {fullAddress}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              </div>
            </div>

            {/* ②–③ Statement + meta: tight stack under the headline, extra air above Send/Receive; net height ~unchanged vs prior gap-3 siblings */}
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex min-w-0 flex-col gap-2">
                <div
                  className={cn(
                    "flex items-end text-3xl font-semibold leading-[1.05] tracking-tighter text-[var(--color-text-primary)] sm:text-4xl md:text-5xl",
                    WALLET_BALANCE_AMOUNT_MIN_H
                  )}
                  aria-live="polite"
                >
                  {(() => {
                    const balanceLabel = formatUsd(
                      portfolio?.status === "success" ? portfolio.totalUsd : PORTFOLIO_TOTAL_USD
                    );
                    return balanceShowSkeleton ? (
                      <WalletSkeletonText className="block text-3xl font-semibold leading-[1.05] tracking-tighter sm:text-4xl md:text-5xl">
                        {balanceLabel}
                      </WalletSkeletonText>
                    ) : (
                      balanceLabel
                    );
                  })()}
                </div>
                <div className="h-1 w-16 shrink-0" aria-hidden />
              </div>
              <p className="mb-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-[var(--color-text-muted)]">
                <span className="text-[var(--color-text-secondary)]">Total Assets</span>
                <span className="text-white/25" aria-hidden>
                  /
                </span>
                {portfolio && portfolio.status === "success" && portfolio.delta24h != null ? (
                  <span
                    className={cn(
                      "tabular-nums",
                      portfolio.delta24h >= 0
                        ? "text-[var(--color-success)]"
                        : "text-[var(--color-error)]"
                    )}
                  >
                    {formatSignedPctOneDecimal(portfolio.delta24h)} 24h
                  </span>
                ) : (
                  <span
                    className={cn(
                      "tabular-nums",
                      rangeMeta.changePct >= 0
                        ? "text-[var(--color-success)]"
                        : "text-[var(--color-error)]"
                    )}
                  >
                    {formatSignedPctOneDecimal(rangeMeta.changePct)} {rangeMeta.rangeLabel}
                  </span>
                )}
                <span className="text-white/25" aria-hidden>
                  /
                </span>
                <span className="tabular-nums text-white/55">
                  {syncedAgeLabel.length > 0
                    ? syncedAgeLabel.charAt(0).toUpperCase() + syncedAgeLabel.slice(1)
                    : syncedAgeLabel}
                </span>
              </p>
            </div>

            {/* ④ Detached transfer actions (two independent controls) */}
            <div className="flex min-w-0 flex-wrap items-stretch gap-2 sm:gap-2.5">
              <Button
                type="button"
                variant="ghost"
                onClick={() => (onTransferAction ? onTransferAction("send") : onSend?.())}
                className={cn(
                  "h-9 min-w-0 flex-1 rounded-[var(--radius-sm)] border-none px-3 text-xs font-semibold transition-colors",
                  "flex items-center justify-center gap-1.5 bg-blue-500/15 text-blue-500",
                  "hover:bg-blue-500/25 hover:text-blue-500",
                  "active:bg-blue-500/35 active:text-blue-500",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/35 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                )}
                aria-label="Send"
              >
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                Send
              </Button>
              <button
                type="button"
                onClick={() => (onTransferAction ? onTransferAction("receive") : onReceive?.())}
                className={cn(
                  "flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border-none bg-white/[0.05] px-3 text-xs font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-white/[0.09]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                )}
                aria-label="Receive"
              >
                <ArrowDownLeft className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                Receive
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>
      <WalletBalanceBannerRimDecor />
    </div>
  );
}

const topAssetCardAnimateLayoutChanges = (
  args: Parameters<typeof defaultAnimateLayoutChanges>[0]
) => {
  if (args.wasDragging) return false;
  return defaultAnimateLayoutChanges(args);
};

function TopAssetCard({
  name,
  symbol,
  balanceUsd,
  holdings,
  fill,
  color,
  dragListeners,
  showSkeleton = false,
  className,
}: {
  name: string;
  symbol: string;
  balanceUsd: string;
  holdings: string;
  fill: number;
  color: string;
  showSkeleton?: boolean;
 /** When set, shows a grip handle (same interaction model as dashboard stat cards). */
  dragListeners?: DraggableSyntheticListeners;
  className?: string;
}) {
  return (
    <div className={cn(surfaceCard(), "flex flex-col gap-3 px-4 py-3 sm:px-5 sm:py-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
            {showSkeleton ? (
              <>
                <WalletSkeletonText>{name} </WalletSkeletonText>
                <WalletSkeletonText className="font-medium text-[var(--color-text-muted)]">
                  ({symbol})
                </WalletSkeletonText>
              </>
            ) : (
              <>
                {name}{" "}
                <span className="font-medium text-[var(--color-text-muted)]">({symbol})</span>
              </>
            )}
          </p>
        </div>
        {dragListeners ? (
          <button
            type="button"
            aria-label="Reorder asset card"
            className="shrink-0 !cursor-grab rounded-md p-1 text-white/35 touch-none transition-colors hover:text-white/60 active:!cursor-grabbing"
            {...dragListeners}
          >
            <GripVertical className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </button>
        ) : (
          <span className="text-[10px] font-medium text-white/35" aria-hidden>
            ↗
          </span>
        )}
      </div>
      <div className="space-y-0.5">
        <p className="text-xl font-semibold tracking-tight text-[var(--color-text-primary)]">
          {showSkeleton ? (
            <WalletSkeletonText className="text-xl font-semibold tracking-tight">{balanceUsd}</WalletSkeletonText>
          ) : (
            balanceUsd
          )}
        </p>
        <p className="text-xs text-[var(--color-text-muted)]">
          {showSkeleton ? (
            <WalletSkeletonText className="text-xs">{holdings}</WalletSkeletonText>
          ) : (
            holdings
          )}
        </p>
      </div>
      <SegmentedBarSparkline
        fillRatio={fill}
        activeColor={color}
        className={cn("mt-0", showSkeleton && "animate-pulse opacity-40")}
      />
    </div>
  );
}

function SortableTopAssetCard({
  model,
  showSkeleton = false,
}: {
  model: TopAssetCardModel;
  showSkeleton?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: model.id,
    animateLayoutChanges: topAssetCardAnimateLayoutChanges,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const shellClass = "min-w-0 w-full self-stretch";

  if (isDragging) {
 // Invisible footprint identical to the real card - avoids stretched dashed slots blowing row height.
    return (
      <div ref={setNodeRef} style={style} {...attributes} className={shellClass} aria-hidden>
        <div className="pointer-events-none select-none opacity-0">
          <TopAssetCard
            name={model.name}
            symbol={model.symbol}
            balanceUsd={model.balanceUsd}
            holdings={model.holdings}
            fill={model.fill}
            color={model.color}
          />
        </div>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} className={shellClass}>
      <TopAssetCard
        name={model.name}
        symbol={model.symbol}
        balanceUsd={model.balanceUsd}
        holdings={model.holdings}
        fill={model.fill}
        color={model.color}
        showSkeleton={showSkeleton}
        dragListeners={listeners}
      />
    </div>
  );
}

function TopAssetCardsStrip(props: {
  cards: TopAssetCardModel[];
  orderStorageKey: string;
  portfolio?: WalletPortfolio;
  showSkeleton?: boolean;
}) {
  const { cards, orderStorageKey, portfolio } = props;
  const stripShowSkeleton = props.showSkeleton === true;
 // When the portfolio fetch has resolved (success), we trust the live data
 // unconditionally - even if it's empty. Falling back to the demo cards on
 // an empty live wallet was producing the cardinal sin of this dashboard:
 // showing $128K of fake "ETH/SOL/BTC" holdings under a "$0.00" banner for
 // every freshly-connected user, who would (correctly) call it bullshit.
 // Demo cards are only used while the fetch is still in flight (idle /
 // loading) so the UI doesn't pop blank → cards.
  const lastLiveCardsRef = useRef<TopAssetCardModel[]>([]);
  const livecards = useMemo<TopAssetCardModel[]>(() => {
    if (!portfolio || portfolio.status !== "success") return [];
    const totalUsd = portfolio.totalUsd;
    const ETH_COLOR = "rgba(59, 130, 246, 0.95)";
    const BASE_COLOR = "rgba(96, 165, 250, 0.92)";
    const ARB_COLOR = "rgba(45, 166, 255, 0.92)";
    const POLY_COLOR = "rgba(167, 139, 250, 0.95)";
    const COLOR_BY_ID: Record<number, string> = { 1: ETH_COLOR, 8453: BASE_COLOR, 42161: ARB_COLOR, 137: POLY_COLOR };
    const sorted = [...portfolio.chains]
      .filter((c) => c.usd > 0 || c.native > 0)
      .sort((a, b) => b.usd - a.usd);
    const top = sorted.slice(0, 3);
    return top.map<TopAssetCardModel>((c) => ({
      id: `chain-${c.chainId}`,
      name: c.chainName,
      symbol: c.symbol,
      balanceUsd: formatUsd(c.usd),
      holdings: `${c.native.toFixed(c.native < 1 ? 4 : 2)} ${c.symbol}`,
      fill: totalUsd > 0 ? c.usd / totalUsd : 0,
      color: COLOR_BY_ID[c.chainId] ?? ETH_COLOR,
    }));
  }, [portfolio]);

  useEffect(() => {
    if (livecards.length > 0) lastLiveCardsRef.current = livecards;
  }, [livecards]);

  useEffect(() => {
    lastLiveCardsRef.current = [];
  }, [orderStorageKey]);

 // Keep last successful cards mounted during reload (avoid demo-card swap + layout jump).
  const effectiveCards =
    livecards.length > 0
      ? livecards
      : lastLiveCardsRef.current.length > 0
        ? lastLiveCardsRef.current
        : cards;
  const sensors = useDragSensors();
  const { orderedItems, itemIds, activeItem, handleDragStart, handleDragEnd, handleDragCancel } =
    usePersistedIdOrder<TopAssetCardModel>({ storageKey: orderStorageKey, items: effectiveCards });

  const gridClass = cn(
    "grid shrink-0 grid-cols-1 items-stretch",
    BLOCK_GAP,
    orderedItems.length === 1 && "sm:grid-cols-1",
    orderedItems.length === 2 && "sm:grid-cols-2",
    orderedItems.length >= 3 && "sm:grid-cols-3"
  );

  if (orderedItems.length === 0) {
    if (!stripShowSkeleton) return null;
    const placeholderCount = Math.min(Math.max(cards.length, 1), 3);
    return (
      <div
        className={cn(
          "grid shrink-0 grid-cols-1 items-stretch",
          BLOCK_GAP,
          placeholderCount === 1 && "sm:grid-cols-1",
          placeholderCount === 2 && "sm:grid-cols-2",
          placeholderCount >= 3 && "sm:grid-cols-3"
        )}
      >
        {cards.slice(0, placeholderCount).map((c) => (
          <TopAssetCard
            key={c.id}
            name={c.name}
            symbol={c.symbol}
            balanceUsd={c.balanceUsd}
            holdings={c.holdings}
            fill={c.fill}
            color={c.color}
            showSkeleton
          />
        ))}
      </div>
    );
  }

  if (orderedItems.length === 1) {
    const a = orderedItems[0]!;
    return (
      <div className={gridClass}>
        <TopAssetCard
          name={a.name}
          symbol={a.symbol}
          balanceUsd={a.balanceUsd}
          holdings={a.holdings}
          fill={a.fill}
          color={a.color}
          showSkeleton={stripShowSkeleton}
        />
      </div>
    );
  }

  return (
    <div className="relative w-full min-w-0 shrink-0">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext items={itemIds} strategy={rectSortingStrategy}>
          <div className={gridClass}>
            {orderedItems.map((a) => (
              <SortableTopAssetCard key={a.id} model={a} showSkeleton={stripShowSkeleton} />
            ))}
          </div>
        </SortableContext>
        {typeof document !== "undefined" &&
          createPortal(
            <DragOverlay dropAnimation={null} zIndex={9999}>
              {activeItem ? (
                <div className="scale-[1.02] shadow-2xl">
                  <TopAssetCard
                    name={activeItem.name}
                    symbol={activeItem.symbol}
                    balanceUsd={activeItem.balanceUsd}
                    holdings={activeItem.holdings}
                    fill={activeItem.fill}
                    color={activeItem.color}
                  />
                </div>
              ) : null}
            </DragOverlay>,
            document.body
          )}
      </DndContext>
    </div>
  );
}

type AssetsSortKey = "value_desc" | "value_asc" | "change_desc" | "change_asc";

/** All assets toolbar - glass sort menu pilot (see `docs/glass-ui-playbook.md`). */
const ASSETS_SORT_MENU: { key: AssetsSortKey; label: string; dir: "down" | "up" }[] = [
  { key: "value_desc", label: "Filter", dir: "down" },
  { key: "value_asc", label: "Filter", dir: "up" },
  { key: "change_desc", label: "24h", dir: "down" },
  { key: "change_asc", label: "24h", dir: "up" },
];

function assetsSortAriaLabel(sort: AssetsSortKey): string {
  switch (sort) {
    case "value_desc":
      return "Filter: sort by value, descending. Open menu.";
    case "value_asc":
      return "Filter: sort by value, ascending. Open menu.";
    case "change_desc":
      return "Filter: sort by 24h change, descending. Open menu.";
    case "change_asc":
      return "Filter: sort by 24h change, ascending. Open menu.";
    default:
      return "Filter. Open menu.";
  }
}

const ASSETS_GLASS_MENU_CONTENT = cn(
  "z-[200] w-max min-w-0 overflow-hidden rounded-[var(--radius-md)] border border-white/15 p-0.5 text-[var(--color-text-primary)]",
  "bg-white/[0.04]",
  "supports-[backdrop-filter]:bg-white/[0.02] supports-[backdrop-filter]:backdrop-blur-[7px]",
  "glass-card-inner shadow-md",
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
);

// Phishing / spam heuristics for Phase 3.5 - catches the classic airdrop
// attacks where malicious tokens stuff telegram links, unicode stars, or
// instructions into the name/symbol fields.
const SPAM_REGEXES: RegExp[] = [
  /t\.me\//i, // embedded Telegram link
  /visit\s+(?:to\s+)?claim/i,
  /claim\s+(?:at|on|via)/i,
  /✅|⭐|🎁|💰|🚀|⚡/, // common airdrop-phishing emoji
  /airdrop\s*!/i,
  /\.com|\.io|\.xyz|\.net|\.org/i, // any TLD embedded in a token name is a red flag
  /https?:\/\//i,
];

function looksLikeScam(token: WalletToken, whitelist?: TokenWhitelist): boolean {
  if (token.isNative) return false;
 // Session 26 - positive whitelist override. A token on our erc20_allowlist
 // is DEFINITIVELY legit (we audited it for the swap pipeline) and MUST
 // never be flagged as scam, even if CoinGecko hasn't priced it yet.
  if (
    whitelist &&
    isWhitelistedToken(whitelist, {
      chainId: token.chainId,
      contract: token.contract,
      symbol: token.symbol,
    })
  ) {
    return false;
  }
  const haystack = `${token.name} ${token.symbol}`.trim();
  if (SPAM_REGEXES.some((r) => r.test(haystack))) return true;
 // Obvious zero-price + long unicode garble case
  if (token.usdPrice === 0 && haystack.length > 40) return true;
 // Zero price alone is suggestive but not conclusive - keep the existing
 // soft flag so "Hide Scams" hides the noise by default
  if (token.usdPrice === 0) return true;
  return false;
}

function AssetsTable(props: {
  tokens?: WalletToken[];
  showSkeleton?: boolean;
}) {
  const { tokens } = props;
  const tableShowSkeleton = props.showSkeleton === true;
 // Session 26 - positive allowlist override for the scam filter
  const whitelist = useTokenWhitelist();
  const [query, setQuery] = useState("");
  const [hideDust, setHideDust] = useState(false);
  const [hideScams, setHideScams] = useState(false);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [pinnedKeys, setPinnedKeys] = useState<Set<string>>(() => new Set());
  const [sort, setSort] = useState<AssetsSortKey>("value_desc");
  const [allAssetsModalOpen, setAllAssetsModalOpen] = useState(false);

  const DUST_THRESHOLD_USD = 10;

 // Session 25 Phase 3 + polish - convert real portfolio tokens into the
 // row shape the existing filter/sort/table logic already understands.
 // Extended to carry logo + explorer URL so the polish pass can render
 // them without re-walking the tokens array.
  const liveRows = useMemo(() => {
    if (!tokens || tokens.length === 0) return null;
    return tokens
      .filter((t) => t.usdValue >= 0 || t.isNative) // keep zero-priced natives so user sees them
      .map((t) => ({
        key: `${t.chainId}-${t.contract ?? "native"}`,
        asset: t.isNative ? `${t.name} Native` : t.name,
        sym: t.symbol,
        balance: formatUsd(t.usdValue),
        price: t.usdPrice > 0 ? `$${t.usdPrice.toFixed(t.usdPrice < 1 ? 6 : 2)}` : "-",
        d24: t.delta24h != null ? `${t.delta24h >= 0 ? "+" : ""}${t.delta24h.toFixed(1)}%` : "-",
        cap: "-",
        isScam: looksLikeScam(t, whitelist),
        logo: t.logo,
        chainId: t.chainId,
        contract: t.contract,
        isNative: t.isNative,
      }));
  }, [tokens, whitelist]);

  const rowSource =
    liveRows ?? (shouldUseDevPopulatedData() ? [...WALLET_ASSET_TABLE_MOCK_ROWS] : []);

  const modalAssetRows = useMemo(() => {
    const parseUsd = (s: string) => {
      const n = Number(String(s).replace(/[^0-9.+-]/g, ""));
      return Number.isFinite(n) ? n : 0;
    };
    return [...rowSource].sort((a, b) => parseUsd(b.balance) - parseUsd(a.balance));
  }, [rowSource]);

  const rows = useMemo(() => {
    const parseUsd = (s: string) => {
      const n = Number(String(s).replace(/[^0-9.+-]/g, ""));
      return Number.isFinite(n) ? n : 0;
    };
    const parsePct = (s: string) => {
      const n = Number(String(s).replace(/[^0-9.+-]/g, ""));
      return Number.isFinite(n) ? n : 0;
    };

    const q = query.trim().toLowerCase();
    const filtered = rowSource.filter((r) => {
      const valueUsd = parseUsd(r.balance);
      const matchesQuery =
        q.length === 0 ||
        r.asset.toLowerCase().includes(q) ||
        r.sym.toLowerCase().includes(q);
      const passesDust = !hideDust || valueUsd >= DUST_THRESHOLD_USD;
      const isScam = Boolean((r as { isScam?: boolean }).isScam);
      const passesScams = !hideScams || !isScam;
      const isPinned = pinnedKeys.has(r.key);
      const passesPinned = !pinnedOnly || isPinned;
      return matchesQuery && passesDust && passesScams && passesPinned;
    });

    const sorted = [...filtered].sort((a, b) => {
      const aPinned = pinnedKeys.has(a.key);
      const bPinned = pinnedKeys.has(b.key);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;

      const aValue = parseUsd(a.balance);
      const bValue = parseUsd(b.balance);
      const aChg = parsePct(a.d24);
      const bChg = parsePct(b.d24);

      switch (sort) {
        case "value_asc":
          return aValue - bValue;
        case "change_desc":
          return bChg - aChg;
        case "change_asc":
          return aChg - bChg;
        case "value_desc":
        default:
          return bValue - aValue;
      }
    });

    return sorted;
  }, [hideDust, hideScams, pinnedKeys, pinnedOnly, query, sort, rowSource]);

  const displayRows =
    rows.length > 0
      ? rows
      : tableShowSkeleton
        ? [...WALLET_ASSET_TABLE_MOCK_ROWS]
        : [];

  return (
    <div className={cn(surfaceCard(), "flex min-h-0 flex-1 flex-col overflow-hidden")}>
      <div className="shrink-0 px-5 py-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">All assets</h3>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">Manage your token holdings</p>
          </div>

          <div className="flex h-8 shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setPinnedOnly((v) => !v)}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-[10px] border transition-[background-color,color,border-color] duration-200",
                pinnedOnly
                  ? "border-white/15 bg-white/[0.08] text-[var(--color-text-primary)]"
                  : "border-transparent bg-white/[0.04] text-white/65 hover:!bg-white/[0.055] hover:!text-white [&_svg]:transition-none"
              )}
              aria-label={pinnedOnly ? "Show all assets" : "Show pinned assets only"}
            >
              <Star
                className={cn("h-4 w-4", pinnedOnly ? "fill-white/70 text-white/70" : "")}
                aria-hidden
              />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-8 items-center gap-1 rounded-[10px] border px-2.5 text-[11px] font-semibold transition-[background-color,color,border-color] duration-200 sm:px-3 sm:text-xs [&_svg]:transition-none",
                    hideDust || hideScams
                      ? "border-white/15 bg-white/[0.08] text-[var(--color-text-primary)]"
                      : "border-transparent bg-white/[0.04] text-white/65 hover:!bg-white/[0.055] hover:!text-white"
                  )}
                  aria-label="Hide assets"
                >
                  <span className="whitespace-nowrap">Hide</span>
                  <ChevronDown className="h-4 w-4 shrink-0 sm:h-[15px] sm:w-[15px]" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={6} className={ASSETS_GLASS_MENU_CONTENT}>
                <DropdownMenuItem
                  role="menuitemcheckbox"
                  aria-checked={hideDust}
                  textValue="Dust"
                  onSelect={(e) => {
                    e.preventDefault();
                    setHideDust((v) => !v);
                  }}
                  className={cn(
                    "!grid cursor-pointer grid-cols-[14px_auto_minmax(0,1fr)] items-center gap-1 rounded-[var(--radius-sm)] !px-1.5 !py-1.5 text-[11px] font-semibold outline-none sm:text-xs",
                    "mx-1 mt-1 mb-0.5",
                    hideDust
                      ? "bg-[var(--color-primary)] text-white hover:!bg-[var(--color-primary)] hover:!text-white focus:!bg-[var(--color-primary)] focus:!text-white dark:hover:!bg-[var(--color-primary)] dark:focus:!bg-[var(--color-primary)] dark:focus:!text-white data-[highlighted]:!bg-[var(--color-primary)] data-[highlighted]:!text-white"
                      : "text-[var(--color-text-primary)] hover:!bg-white/[0.055] hover:!text-white focus:!bg-white/[0.055] focus:!text-white dark:hover:!bg-white/[0.055] dark:focus:!bg-white/[0.055] data-[highlighted]:!bg-white/[0.055] data-[highlighted]:!text-white"
                  )}
                >
                  <span className="flex h-3.5 w-3.5 items-center justify-center">
                    {hideDust ? <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden /> : null}
                  </span>
                  <span className="whitespace-nowrap text-left">Dust</span>
                  <span className="min-w-0" aria-hidden />
                </DropdownMenuItem>
                <DropdownMenuItem
                  role="menuitemcheckbox"
                  aria-checked={hideScams}
                  textValue="Scams"
                  onSelect={(e) => {
                    e.preventDefault();
                    setHideScams((v) => !v);
                  }}
                  className={cn(
                    "!grid cursor-pointer grid-cols-[14px_auto_minmax(0,1fr)] items-center gap-1 rounded-[var(--radius-sm)] !px-1.5 !py-1.5 text-[11px] font-semibold outline-none sm:text-xs",
                    "mx-1 mt-0.5 mb-1",
                    hideScams
                      ? "bg-[var(--color-primary)] text-white hover:!bg-[var(--color-primary)] hover:!text-white focus:!bg-[var(--color-primary)] focus:!text-white dark:hover:!bg-[var(--color-primary)] dark:focus:!bg-[var(--color-primary)] dark:focus:!text-white data-[highlighted]:!bg-[var(--color-primary)] data-[highlighted]:!text-white"
                      : "text-[var(--color-text-primary)] hover:!bg-white/[0.055] hover:!text-white focus:!bg-white/[0.055] focus:!text-white dark:hover:!bg-white/[0.055] dark:focus:!bg-white/[0.055] data-[highlighted]:!bg-white/[0.055] data-[highlighted]:!text-white"
                  )}
                >
                  <span className="flex h-3.5 w-3.5 items-center justify-center">
                    {hideScams ? <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden /> : null}
                  </span>
                  <span className="whitespace-nowrap text-left">Scams</span>
                  <span className="min-w-0" aria-hidden />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="relative">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "inline-flex h-8 w-auto items-center gap-1 rounded-[10px] border border-transparent bg-white/[0.04] pl-2.5 pr-2 text-[11px] font-semibold text-white/65 transition-[background-color,color,border-color] duration-200 hover:!bg-white/[0.055] hover:!text-white sm:pl-3 sm:pr-2.5 sm:text-xs [&_svg]:transition-none",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
                      "data-[state=open]:border-transparent data-[state=open]:!bg-white/[0.07] data-[state=open]:!text-white"
                    )}
                    aria-label={assetsSortAriaLabel(sort)}
                  >
                    <span className="whitespace-nowrap">Filter</span>
                    <ChevronDown
                      className="h-4 w-4 shrink-0 sm:h-[15px] sm:w-[15px]"
                      aria-hidden
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={6} className={ASSETS_GLASS_MENU_CONTENT}>
                  {ASSETS_SORT_MENU.map((opt, index) => {
                    const selected = sort === opt.key;
                    const arrow = opt.dir === "down" ? "↓" : "↑";
                    const isFirst = index === 0;
                    const isLast = index === ASSETS_SORT_MENU.length - 1;
                    const rowSpacing =
                      ASSETS_SORT_MENU.length === 1
                        ? "my-1"
                        : isFirst
                          ? "mt-1 mb-0.5"
                          : isLast
                            ? "mt-0.5 mb-1"
                            : "my-0.5";
                    return (
                      <DropdownMenuItem
                        key={opt.key}
                        textValue={`${opt.label} ${opt.dir === "down" ? "descending" : "ascending"}`}
                        onSelect={() => setSort(opt.key)}
                        className={cn(
                          "!grid mx-1 cursor-pointer grid-cols-[14px_1fr_12px] items-center gap-1 rounded-[var(--radius-sm)] !px-1.5 !py-1.5 text-[11px] font-semibold outline-none sm:text-xs",
                          rowSpacing,
                          selected
                            ? "bg-[var(--color-primary)] text-white hover:!bg-[var(--color-primary)] hover:!text-white focus:!bg-[var(--color-primary)] focus:!text-white dark:hover:!bg-[var(--color-primary)] dark:focus:!bg-[var(--color-primary)] dark:focus:!text-white data-[highlighted]:!bg-[var(--color-primary)] data-[highlighted]:!text-white"
                            : "text-[var(--color-text-primary)] hover:!bg-white/[0.055] hover:!text-white focus:!bg-white/[0.055] focus:!text-white dark:hover:!bg-white/[0.055] dark:focus:!bg-white/[0.055] data-[highlighted]:!bg-white/[0.055] data-[highlighted]:!text-white"
                        )}
                      >
                        <span className="flex h-3.5 w-3.5 items-center justify-center">
                          {selected ? <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden /> : null}
                        </span>
                        <span className="min-w-0 truncate text-left">{opt.label}</span>
                        <span
                          className="justify-self-end text-right font-normal tabular-nums leading-none text-[12px] opacity-[0.88] sm:text-[13px]"
                          aria-hidden
                        >
                          {arrow}
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="relative w-[120px] sm:w-[140px]">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45"
                aria-hidden
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className={cn(
                  "h-8 w-full rounded-[10px] border border-transparent bg-white/[0.04] pl-9 pr-2.5 text-xs text-[var(--color-text-primary)] placeholder:text-white/35 sm:pr-3 sm:text-sm",
                  "focus-visible:outline-none focus-visible:border-white/40"
                )}
              />
            </div>
            <button
              type="button"
              onClick={() => setAllAssetsModalOpen(true)}
              className={cn(
                "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border transition-[background-color,color,border-color] duration-200",
                "border-transparent bg-white/[0.04] text-white/65 hover:!bg-white/[0.055] hover:!text-white [&_svg]:transition-none"
              )}
              aria-label="Expand all assets"
            >
              <Maximize2 className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          </div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-2">
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-md)] px-0 pb-0 pt-0",
            "bg-white/[0.04] dark:bg-white/[0.02]"
          )}
        >
          <div className="h-full min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto">
            <table className="w-full min-w-[580px] table-fixed border-collapse text-left text-sm">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[20%]" />
                <col className="w-[19%]" />
                <col className="w-[13%]" />
                <col className="w-[12%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead>
                <tr className="bg-white/[0.02] text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  <th className="py-3.5 pl-6 pr-5 sm:pl-7 sm:pr-6">Asset</th>
                  <th className="px-4 py-3.5 sm:px-5">Balance</th>
                  <th className="px-4 py-3.5 sm:px-5">Price</th>
                  <th className="whitespace-nowrap px-3 py-3.5 text-left sm:px-4">24h</th>
                  <th className="px-4 py-3.5 pl-4 pr-2 sm:pl-5 sm:pr-2.5">MC</th>
                  <th scope="col" className="px-0 py-3.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="text-[var(--color-text-primary)]">
                {displayRows.map((row, index) => (
                  <tr
                    key={row.key}
                    className={cn(
                      index % 2 === 1
                        ? "bg-white/[0.02] hover:bg-white/[0.03]"
                        : "hover:bg-white/[0.01]"
                    )}
                  >
                    <td className="py-3.5 pl-6 pr-5 font-medium sm:pl-7 sm:pr-6">
                      <div className="flex min-w-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setPinnedKeys((prev) => {
                              const next = new Set(prev);
                              next.has(row.key) ? next.delete(row.key) : next.add(row.key);
                              return next;
                            })
                          }
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-start rounded-md pl-0 text-white/45 transition-colors hover:text-white/80"
                          aria-label={pinnedKeys.has(row.key) ? "Unpin asset" : "Pin asset"}
                        >
                          <Star
                            className={cn(
                              "h-4 w-4",
                              pinnedKeys.has(row.key) ? "fill-white/70 text-white/70" : ""
                            )}
                            aria-hidden
                          />
                        </button>
                        <span className="min-w-0 flex-1 truncate">
                          {tableShowSkeleton ? (
                            <WalletSkeletonText className="truncate">{row.asset}</WalletSkeletonText>
                          ) : (
                            row.asset
                          )}
                        </span>
                        <span className="shrink-0 font-normal text-[var(--color-text-muted)]">
                          {tableShowSkeleton ? (
                            <WalletSkeletonText>({row.sym})</WalletSkeletonText>
                          ) : (
                            `(${row.sym})`
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="truncate px-4 py-3.5 font-medium tabular-nums text-[var(--color-text-primary)] sm:px-5">
                      {tableShowSkeleton ? (
                        <WalletSkeletonText className="tabular-nums">{row.balance}</WalletSkeletonText>
                      ) : (
                        row.balance
                      )}
                    </td>
                    <td className="truncate px-4 py-3.5 tabular-nums sm:px-5">
                      {tableShowSkeleton ? (
                        <WalletSkeletonText className="tabular-nums">{row.price}</WalletSkeletonText>
                      ) : (
                        row.price
                      )}
                    </td>
                    <td
                      className={cn(
                        "whitespace-nowrap px-3 py-3.5 tabular-nums sm:px-4",
                        !tableShowSkeleton &&
                          (row.d24.startsWith("-")
                            ? "text-[var(--color-error)]"
                            : "text-[var(--color-success)]")
                      )}
                    >
                      {tableShowSkeleton ? (
                        <WalletSkeletonText className="tabular-nums">{row.d24}</WalletSkeletonText>
                      ) : (
                        row.d24
                      )}
                    </td>
                    <td className="truncate px-4 py-3.5 pl-4 pr-2 tabular-nums text-[var(--color-text-muted)] sm:pl-5 sm:pr-2.5">
                      {tableShowSkeleton ? (
                        <WalletSkeletonText className="tabular-nums">{row.cap}</WalletSkeletonText>
                      ) : (
                        row.cap
                      )}
                    </td>
                    <td className="py-3.5 pl-1 pr-4 sm:pr-5">
                      <div className="flex w-full items-center justify-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                "relative inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] leading-none",
                                "text-[15px] font-semibold text-white/50 transition-colors",
                                "hover:bg-white/[0.03] hover:text-white/65",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
                                "data-[state=open]:bg-white/[0.03] data-[state=open]:text-white/65"
                              )}
                              aria-label={`More options for ${row.asset}`}
                            >
                              <span
                                className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[calc(50%+4px)] select-none leading-none"
                                aria-hidden
                              >
                                ...
                              </span>
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" sideOffset={6} className={ASSETS_GLASS_MENU_CONTENT}>
                            {ASSET_ROW_OVERFLOW_MENU.map(({ label, Icon }, index) => {
                              const isFirst = index === 0;
                              const isLast = index === ASSET_ROW_OVERFLOW_MENU.length - 1;
                              const rowSpacing = isFirst
                                ? "mt-1 mb-0.5"
                                : isLast
                                  ? "mt-0.5 mb-1"
                                  : "my-0.5";
 // Polish pass - wire the menu actions. Scanner
 // always opens a new tab to the block explorer;
 // Send/Receive/Swap scroll to the relevant panel
 // (full wiring into those panels is Phase 6).
                              const rowChainId = "chainId" in row ? (row as { chainId?: number }).chainId : undefined;
                              const rowContract = "contract" in row ? (row as { contract?: string | null }).contract ?? null : null;
                              const explorerUrl = rowChainId ? explorerUrlForAsset(rowChainId, rowContract) : null;
                              const handleClick = () => {
                                if (label === "Scanner") {
                                  if (explorerUrl) window.open(explorerUrl, "_blank", "noopener,noreferrer");
                                  return;
                                }
                                if (label === "Send" || label === "Receive" || label === "Swap") {
                                  const targetId = label === "Swap" ? "wallet-swap-panel" : "wallet-balance-banner";
                                  const node = document.getElementById(targetId);
                                  if (node) node.scrollIntoView({ behavior: "smooth", block: "start" });
                                }
                              };
                              return (
                                <DropdownMenuItem
                                  key={label}
                                  textValue={label}
                                  onSelect={handleClick}
                                  disabled={label === "Scanner" && !explorerUrl}
                                  className={cn(
                                    "!flex min-w-0 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] !px-1.5 !py-1.5 text-[11px] font-semibold outline-none sm:text-xs",
                                    "mx-1",
                                    rowSpacing,
                                    "text-[var(--color-text-primary)] hover:!bg-white/[0.055] hover:!text-white focus:!bg-white/[0.055] focus:!text-white dark:hover:!bg-white/[0.055] dark:focus:!bg-white/[0.055] data-[highlighted]:!bg-white/[0.055] data-[highlighted]:!text-white"
                                  )}
                                >
                                  <Icon className="h-3.5 w-3.5 shrink-0 opacity-90" strokeWidth={2.25} aria-hidden />
                                  <span className="min-w-0 flex-1 text-left">{label}</span>
                                </DropdownMenuItem>
                              );
                            })}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <WalletAssetsModal
        open={allAssetsModalOpen}
        onOpenChange={setAllAssetsModalOpen}
        title="All assets"
        rows={modalAssetRows}
        pinnedKeys={pinnedKeys}
        setPinnedKeys={setPinnedKeys}
        pinnedOnly={pinnedOnly}
        setPinnedOnly={setPinnedOnly}
        hideDust={hideDust}
        setHideDust={setHideDust}
        hideScams={hideScams}
        setHideScams={setHideScams}
      />
    </div>
  );
}

function parsePositiveDecimalInput(raw: string): number {
  const normalized = raw.replace(/,/g, "").trim();
  if (!normalized) return 0;
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 5.4.26 swap discs - under /public/assets/images/icons (no spaced filenames). */
const SWAP_TOKEN_ICON_SRC: Record<string, string> = {
  eth: "/assets/images/icons/eth.svg",
  weth: "/assets/images/icons/eth.svg",
  usdc: "/assets/images/icons/usdc.svg",
  usdt: "/assets/images/icons/tether.svg",
  dai: "/assets/images/icons/dai.svg",
  wbtc: "/wrapped-bitcoin-wbtc-icon.svg",
  sol: "/assets/images/icons/sol.svg",
  bnb: "/assets/images/icons/bnb.svg",
};

function resolveSwapTokenIconSrc(symbol: string, logo?: string | null): string | undefined {
  const local = SWAP_TOKEN_ICON_SRC[symbol.trim().toLowerCase()];
  if (local) return local;
  const trimmedLogo = logo?.trim();
  if (trimmedLogo && /^https?:\/\//i.test(trimmedLogo)) return trimmedLogo;
  return undefined;
}

function SwapTokenIcon({
  src,
  className,
  fallbackBg = "bg-blue-500/25",
}: {
  src?: string;
  className?: string;
  fallbackBg?: string;
}) {
  if (!src) {
    return <span className={cn("block shrink-0 rounded-full", className, fallbackBg)} aria-hidden />;
  }
  return (
    <img
      src={src}
      alt=""
      decoding="async"
      className={cn("shrink-0 rounded-full object-cover", className)}
    />
  );
}

function SwapWidgetPanel({
  swapCtaMode = "swap",
  onConnectWallet,
  activeTab = "Swap",
  onTabChange,
  portfolioTokens,
  shell = { kind: "swap" },
  onShellChange,
  panelWalletAddress,
  onSendTransactionToolbarChange,
}: {
 /** `"swap"` when the user has a linked wallet (or mock connected dashboard); `"connect"` when they need to connect first. */
  swapCtaMode?: "swap" | "connect";
  onConnectWallet?: () => void;
  activeTab?: TradeTab;
  onTabChange?: (tab: TradeTab) => void;
 /** Phase 5 - real portfolio tokens for the sell-side dropdown. */
  portfolioTokens?: WalletToken[];
  shell?: WalletRightShell;
  onShellChange?: (next: WalletRightShell) => void;
  panelWalletAddress?: string;
  onSendTransactionToolbarChange?: (event: SendTransactionToolbarEvent) => void;
}) {
  const [sendPanelAsset, setSendPanelAsset] = useState<SwapPickerAsset>({
    symbol: "ETH",
    iconSrc: "/Eth%20Coin.svg",
    fallbackBg: "bg-blue-500/25",
  });
  const [sellAmount, setSellAmount] = useState("");
  const [buyAmount, setBuyAmount] = useState("");
  const sellHasAmount = parsePositiveDecimalInput(sellAmount) > 0;
  const showSwapCta = swapCtaMode === "swap";
  const isComingSoonTab = activeTab !== "Swap";
  const [selectedSellKey, setSelectedSellKey] = useState<string | null>(null);
  const [assetPickerPanelOpen, setAssetPickerPanelOpen] = useState<SwapPickerKind | null>(null);
  const [assetPickerQuery, setAssetPickerQuery] = useState("");
 /** Icons chosen in the 5.4.26-style in-panel picker (overrides portfolio logos on the sell pill). */
  const [sellPickerIcon, setSellPickerIcon] = useState<Pick<SwapPickerAsset, "iconSrc" | "fallbackBg"> | null>(
    null
  );
  const [walletDisplayCurrency, setWalletDisplayCurrency] = useState<WalletDisplayCurrency>("USD");

  type SwapBuyAssetSel = { symbol: string; iconSrc?: string; fallbackBg: string };
  const [swapToAsset, setSwapToAsset] = useState<SwapBuyAssetSel | null>(null);
 // Real assets that exist in /public. Missing symbols fall through to the
 // colored-bg fallback below. Previous version referenced /assets/images/
 // icons/ether.svg and similar paths that don't exist - browsers then show
 // the broken-image placeholder inside the token picker rows.
  const iconSrcForSymbol = useCallback(
    (sym: string, logo?: string | null) => resolveSwapTokenIconSrc(sym, logo),
    []
  );

 // --- Session 25 Phase 2 + 5: live swap-quote preview ---
 // Fetches a real 0x quote via the backend /quote/swap endpoint as the user
 // types. Phase 5 extended this to support any sellable token from the
 // portfolio - native uses 'native' sentinel, ERC-20 passes the symbol.
  const { chain: connectedChain } = useAccount();
  const [quoteBuyUsd, setQuoteBuyUsd] = useState<number | null>(null);
  const [quoteMinUsd, setQuoteMinUsd] = useState<number | null>(null);
  const [quoteStatus, setQuoteStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

 // Phase 5 sell-token selection (declared early so the quote effect can
 // read the selected token for the API call).
 //
 // Session 26 - multi-chain sell: dropped the "connected chain only"
 // filter. Users can now pick any non-scam, non-zero balance token from
 // their portfolio regardless of current chain. If the picked token is
 // on a different chain than the wallet, the execution flow calls
 // switchChainAsync BEFORE fetching the firm quote.
  const sellableTokens = useMemo<WalletToken[]>(() => {
    if (!portfolioTokens) return [];
    return portfolioTokens
      .filter((t) => {
        if (t.isNative) return true;
        if (t.usdPrice === 0) return false;
        return Number(t.balance) > 0;
      })
      .sort((a, b) => b.usdValue - a.usdValue);
  }, [portfolioTokens]);

  const applySellAssetFromPicker = useCallback(
    (asset: SwapPickerAsset) => {
      setSellPickerIcon({ iconSrc: asset.iconSrc, fallbackBg: asset.fallbackBg });
      const match =
        sellableTokens.find(
          (t) => t.symbol === asset.symbol && (asset.symbol === "ETH" ? t.isNative : true)
        ) ?? sellableTokens.find((t) => t.symbol === asset.symbol);
      if (match) {
        setSelectedSellKey(`${match.chainId}-${match.contract ?? "native"}`);
      }
      setSellAmount("");
      setSwapError(null);
    },
    [sellableTokens]
  );

  const selectedSellToken = useMemo<WalletToken | null>(() => {
    if (selectedSellKey) {
      return sellableTokens.find((t) => `${t.chainId}-${t.contract ?? "native"}` === selectedSellKey) ?? null;
    }
    return sellableTokens.find((t) => t.isNative) ?? sellableTokens[0] ?? null;
  }, [selectedSellKey, sellableTokens]);

  const isNativeSell = selectedSellToken?.isNative ?? true;
  const sellSymbol = selectedSellToken?.symbol ?? "ETH";
  const sellBalanceNum = selectedSellToken ? Number(selectedSellToken.balance) : 0;

  useEffect(() => {
    const amt = parsePositiveDecimalInput(sellAmount);
    if (!amt || !connectedChain || !selectedSellToken) {
      setQuoteStatus("idle");
      setQuoteBuyUsd(null);
      setQuoteMinUsd(null);
      return;
    }
 // Session 26 - multi-chain sell: quote uses the SELECTED TOKEN's
 // chain, not the connected wallet's chain. Lets the user preview a
 // swap before committing to the chain switch at execution time.
 //
 // S31 H1: pass the buy-side asset symbol (default USDC) so the backend
 // can quote arbitrary destination tokens, not just the card-credit
 // USDC pipeline. When the user picks a memecoin / bluechip / native
 // destination, buyAmountUsd may be NaN; we fall back to displaying
 // "-" until the FE price-feed integration lands.
    const chainId = selectedSellToken.chainId;
    const sellTokenParam = isNativeSell ? "native" : selectedSellToken.symbol;
    const buyTokenParam = swapToAsset?.symbol || "USDC";
    const timer = window.setTimeout(() => {
      let cancelled = false;
      setQuoteStatus("loading");
      const qs = new URLSearchParams({
        chainId: String(chainId),
        sellToken: sellTokenParam,
        amount: String(amt),
        buyToken: buyTokenParam,
      }).toString();
      fetch(`/api/quote/swap?${qs}`)
        .then(async (res) => {
          const data = (await res.json().catch(() => ({}))) as {
            buyAmountUsd?: number;
            minBuyAmountUsd?: number;
            degraded?: boolean;
          };
          if (cancelled) return;
          if (!res.ok || data.degraded) {
            setQuoteStatus("error");
            setQuoteBuyUsd(null);
            setQuoteMinUsd(null);
            return;
          }
 // For non-USDC buys without a backend price hint, buyAmountUsd
 // arrives as null/NaN; treat as quote-success with no USD value
 // so the CTA stays enabled (the FE can still execute the swap).
          const buyUsd = typeof data.buyAmountUsd === "number" && Number.isFinite(data.buyAmountUsd)
            ? data.buyAmountUsd
            : null;
          const minUsd = typeof data.minBuyAmountUsd === "number" && Number.isFinite(data.minBuyAmountUsd)
            ? data.minBuyAmountUsd
            : null;
          setQuoteBuyUsd(buyUsd);
          setQuoteMinUsd(minUsd);
          setQuoteStatus("success");
        })
        .catch(() => {
          if (cancelled) return;
          setQuoteStatus("error");
        });
      return () => {
        cancelled = true;
      };
    }, 500);
    return () => window.clearTimeout(timer);
  }, [sellAmount, connectedChain, isNativeSell, selectedSellToken?.symbol, selectedSellToken?.chainId, swapToAsset?.symbol]);

  const onSellInputChange = (value: string) => {
    const next = value.replace(/,/g, "");
    if (next === "" || /^[0-9]*\.?[0-9]*$/.test(next)) setSellAmount(next);
  };

  const onBuyInputChange = (value: string) => {
    const next = value.replace(/,/g, "");
    if (next === "" || /^[0-9]*\.?[0-9]*$/.test(next)) setBuyAmount(next);
  };

  const getSwapMockUsdPrice = useCallback((symbol: string) => {
    switch (symbol) {
      case "ETH":
        return 3482.9;
      case "USDC":
      case "USDT":
      case "DAI":
        return 1;
      case "WBTC":
        return 66123;
      default:
        return 1;
    }
  }, []);

  const swapDemoAvailableAmount = useMemo(() => {
    switch (sellSymbol) {
      case "ETH":
        return 0.0009;
      case "BNB":
        return 0.004;
      default:
        return 0;
    }
  }, [sellSymbol]);

 // --- Session 25 Phase 4 + 5 - Firm swap execution with ERC-20 approval ---
 // Handles two paths from the sell-token dropdown:
 // - Native token (ETH/MATIC): single tx via useSendTransaction
 // - Allowlisted ERC-20: check allowance → ERC20.approve if short →
 // wait → fetch firm quote → swap tx
  const { address: takerAddress } = useAccount();
  const { data: nativeBalance } = useBalance({ address: takerAddress });
 // Session 26 - multi-chain sell support: wallet-initiated switch before
 // firm quote + tx signing when picked token lives on a different chain.
  const { switchChainAsync } = useSwitchChain();

 // Reserve native gas buffer only when selling native. ERC-20 sells use
 // native for gas but can spend 100% of the token.
  const GAS_BUFFER_NATIVE = 0.0005;
  const sellAmountNum = parsePositiveDecimalInput(sellAmount);
  const maxSpendable = isNativeSell
    ? Math.max(0, sellBalanceNum - GAS_BUFFER_NATIVE)
    : sellBalanceNum;
  const insufficientBalance =
    showSwapCta && sellAmountNum > 0 && selectedSellToken != null && sellAmountNum > maxSpendable;
  const { sendTransaction: sendSwapTx, data: swapTxHash, isPending: isSwapSigning, reset: resetSwap } =
    useSendTransaction({
      mutation: {
        onError: (err) => setSwapError(err.message.split("\n")[0].slice(0, 220)),
      },
    });
  const { isLoading: isSwapConfirming, isSuccess: isSwapConfirmed } = useWaitForTransactionReceipt({
    hash: swapTxHash,
    chainId: connectedChain?.id,
  });
  const [swapError, setSwapError] = useState<string | null>(null);
  const [isFetchingFirm, setIsFetchingFirm] = useState(false);

 // Phase 5 polish - dispatch activity-bump when a swap confirms so the
 // dashboard re-fetches portfolio + activity after ~5s.
  useEffect(() => {
    if (isSwapConfirmed) {
      window.dispatchEvent(new CustomEvent("wallet-activity-bump"));
    }
  }, [isSwapConfirmed]);

 // Phase 5 - ERC-20 approval state
  const { writeContractAsync: writeApproval } = useWriteContract();
  const [approvalHash, setApprovalHash] = useState<`0x${string}` | undefined>(undefined);
  const [isApproving, setIsApproving] = useState(false);
  const { isLoading: isApprovalConfirming, isSuccess: isApprovalConfirmed } =
    useWaitForTransactionReceipt({ hash: approvalHash, chainId: connectedChain?.id });

  const swapStatus:
    | "idle"
    | "fetching"
    | "approving"
    | "approved"
    | "signing"
    | "confirming"
    | "confirmed"
    | "error" = isSwapConfirmed
    ? "confirmed"
    : isSwapConfirming
      ? "confirming"
      : isSwapSigning
        ? "signing"
        : isApprovalConfirming || isApproving
          ? "approving"
          : isFetchingFirm
            ? "fetching"
            : swapError
              ? "error"
              : "idle";

  async function fetchFirmQuote(
    chainId: number,
    sellToken: string,
    amount: string,
    taker: string,
    buyToken?: string,
  ): Promise<{
    to: `0x${string}`;
    data: `0x${string}`;
    value: string;
    gas?: string;
    allowanceTarget: string | null;
    sellIsNative: boolean;
    sellTokenAddress: string;
    sellDecimals: number;
    buyTokenAddress?: string;
    buyTokenSymbol?: string;
    buyTokenDecimals?: number;
  }> {
    const params = new URLSearchParams({
      chainId: String(chainId),
      sellToken,
      amount,
      taker,
    });
 // S31 H1 - multi-token execution. When buyToken is omitted backend
 // defaults to USDC (card-credit pipeline unchanged).
    if (buyToken && buyToken.toUpperCase() !== "USDC") params.set("buyToken", buyToken);
    const url = `/api/quote/swap-firm?${params.toString()}`;
    const res = await fetch(url, { cache: "no-store" });
    const firm = await res.json();
    if (!res.ok || !firm.to || !firm.data) {
      throw new Error(firm.error ?? "Firm quote unavailable");
    }
    return firm;
  }

  const handleExecuteSwap = async () => {
    if (!takerAddress || !connectedChain || !sellHasAmount || !selectedSellToken) return;
    setSwapError(null);
    setIsFetchingFirm(true);
    try {
 // Session 26 - multi-chain sell: if the selected token's chain
 // differs from the wallet's connected chain, request the wallet
 // to switch first. Must happen BEFORE fetching the firm quote so
 // taker + chainId match up, and BEFORE submitting the tx so the
 // wallet signs on the right network.
      const chainId = selectedSellToken.chainId;
      if (connectedChain.id !== chainId) {
        try {
          await switchChainAsync({ chainId });
        } catch (err) {
          setIsFetchingFirm(false);
          setSwapError(
            err instanceof Error
              ? `Chain switch declined: ${err.message.split("\n")[0].slice(0, 180)}`
              : "Chain switch failed"
          );
          return;
        }
      }
      const sellTokenParam = isNativeSell ? "native" : selectedSellToken.symbol;
 // S31 H1 - pass through the user's selected buy-side asset so the
 // backend produces an executable quote for any allowlisted target,
 // not just USDC. Defaults to USDC when no asset is selected.
      const buyTokenParam = swapToAsset?.symbol || "USDC";
      const firm = await fetchFirmQuote(chainId, sellTokenParam, sellAmount, takerAddress, buyTokenParam);

 // Phase 5: ERC-20 path needs an allowance check + approve tx before
 // submitting the swap. AllowanceHolder is the spender (it's at
 // firm.allowanceTarget or the quote's `to` address for ERC-20 sells).
      if (!firm.sellIsNative) {
        const spender = firm.allowanceTarget ?? firm.to;
        const sellRaw = parseUnits(sellAmount, firm.sellDecimals);

        setIsFetchingFirm(false);
        setIsApproving(true);
        try {
          const hash = await writeApproval({
            abi: erc20Abi,
            address: firm.sellTokenAddress as `0x${string}`,
            functionName: "approve",
            args: [spender as `0x${string}`, sellRaw],
            chainId,
          });
          setApprovalHash(hash as `0x${string}`);
 // Wait for approval to confirm (via useWaitForTransactionReceipt) -
 // we then re-fetch the firm quote since gas prices + 0x routes
 // may have moved, and submit the swap in a follow-up effect.
 // See: "approval confirmation effect" below.
          setPendingSwapContext({ chainId, sellTokenParam, sellAmount, takerAddress });
        } catch (err) {
          setIsApproving(false);
          throw err;
        }
        return;
      }

 // Native path - single tx, no approval needed
      sendSwapTx({
        to: firm.to,
        data: firm.data,
        value: firm.value ? BigInt(firm.value) : BigInt(0),
        gas: firm.gas ? BigInt(firm.gas) : undefined,
        chainId,
      });
    } catch (err) {
      setSwapError(err instanceof Error ? err.message.split("\n")[0].slice(0, 220) : "Swap failed");
    } finally {
      setIsFetchingFirm(false);
    }
  };

 // --- Approval confirmation → auto-submit swap ---
 // When an ERC-20 approval lands on-chain, we re-fetch a fresh firm quote
 // (market may have moved while approval was mining) and submit the swap.
  const [pendingSwapContext, setPendingSwapContext] = useState<
    { chainId: number; sellTokenParam: string; sellAmount: string; takerAddress: string } | null
  >(null);

  useEffect(() => {
    if (!isApprovalConfirmed || !pendingSwapContext) return;
    setIsApproving(false);
    (async () => {
      try {
        const { chainId, sellTokenParam, sellAmount: amt, takerAddress: taker } = pendingSwapContext;
        const fresh = await fetchFirmQuote(chainId, sellTokenParam, amt, taker);
        sendSwapTx({
          to: fresh.to,
          data: fresh.data,
          value: fresh.value ? BigInt(fresh.value) : BigInt(0),
          gas: fresh.gas ? BigInt(fresh.gas) : undefined,
          chainId,
        });
        setPendingSwapContext(null);
      } catch (err) {
        setSwapError(err instanceof Error ? err.message.split("\n")[0].slice(0, 220) : "Post-approval swap failed");
        setPendingSwapContext(null);
      }
    })();
  }, [isApprovalConfirmed, pendingSwapContext, sendSwapTx]);

 // Button disabled when: no wallet, no amount, no live quote yet, a tx is
 // in flight, approval in flight, or the user is trying to spend more
 // than they have.
  const swapPanelDemoMode = shouldUseDevPopulatedData();

  useEffect(() => {
    if (!swapPanelDemoMode || !swapToAsset || !sellHasAmount) return;
    const from = parsePositiveDecimalInput(sellAmount);
    if (!from) return;
    const toUsd = getSwapMockUsdPrice(swapToAsset.symbol);
    const fromUsd = getSwapMockUsdPrice(sellSymbol);
    if (!toUsd || !fromUsd) return;
    const next = (from * fromUsd) / toUsd;
    const fixed = next.toFixed(6).replace(/\.?0+$/, "");
    setBuyAmount(fixed || "");
  }, [swapPanelDemoMode, sellAmount, sellHasAmount, sellSymbol, swapToAsset, getSwapMockUsdPrice]);

  const ctaDisabled =
    !showSwapCta ||
    !swapToAsset ||
    !sellHasAmount ||
    (!swapPanelDemoMode && quoteStatus !== "success") ||
    isFetchingFirm ||
    isSwapSigning ||
    isSwapConfirming ||
    isApproving ||
    isApprovalConfirming ||
    insufficientBalance;

  const swapCtaLabel = (() => {
    if (!showSwapCta) return "Connect wallet";
    if (swapStatus === "fetching") return "Fetching firm quote…";
    if (swapStatus === "approving") return `Approving ${sellSymbol}…`;
    if (swapStatus === "signing") return "Confirm in wallet";
    if (swapStatus === "confirming") return "Waiting for confirmation…";
    if (swapStatus === "confirmed") return "Swap another";
    if (insufficientBalance) return "Insufficient balance";
    if (!swapToAsset || !sellHasAmount) return "Swap";
    if (!swapPanelDemoMode && quoteStatus === "loading") return "Fetching quote…";
    if (!swapPanelDemoMode && quoteStatus !== "success") return "Quote unavailable";
    const needsSwitch =
      selectedSellToken && connectedChain && selectedSellToken.chainId !== connectedChain.id;
    if (needsSwitch && selectedSellToken) {
      return isNativeSell
        ? `Switch to ${selectedSellToken.chainName} + Swap`
        : `Switch to ${selectedSellToken.chainName} + Approve + Swap ${sellSymbol}`;
    }
    return isNativeSell ? "Swap" : `Approve + Swap ${sellSymbol}`;
  })();

  const sellPillIconSrc =
    sellPickerIcon?.iconSrc ?? iconSrcForSymbol(sellSymbol, selectedSellToken?.logo);
  const sellPillFallbackBg =
    sellPickerIcon?.fallbackBg ?? (isNativeSell ? "bg-blue-500/25" : "bg-[var(--color-primary)]/25");

  return (
    <div
      id="wallet-swap-panel"
      className={cn(
        surfaceCard(),
        "relative flex min-h-0 shrink-0 scroll-mt-4 flex-col overflow-hidden",
        "xl:h-full xl:min-h-0 xl:flex-1"
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        {shell.kind === "swap" ? (
          <motion.div
            key="swap-shell"
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
            initial={walletSwapShellMotion.initial}
            animate={walletSwapShellMotion.animate}
            exit={walletSwapShellMotion.exit}
          >
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-3 pt-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold sm:text-xs">
          {/* Day-7 Chris-zip integration: collapse to 2 visible tabs (Swap + Buy). */}
          {/* Limit/Sell still type-supported and rendered below if `activeTab` is */}
          {/* set programmatically - we just don't expose the buttons until those */}
          {/* flows are fully wired. */}
          {(["Swap", "Buy"] as const).map((t) => {
            const isActive = activeTab === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => onTabChange?.(t)}
                className={cn(
                  "rounded-full px-3 py-1.5 transition-colors",
                  isActive
                    ? "bg-white/[0.08] text-[var(--color-text-primary)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer"
                )}
              >
                {t}
              </button>
            );
          })}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-white/50 transition-colors",
                "hover:bg-white/[0.06] hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25"
              )}
              aria-label="Display currency"
            >
              <Settings2 className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={6} className={WALLET_GLASS_MENU_CONTENT}>
            {WALLET_DISPLAY_CURRENCIES.map((code, index) => {
              const selected = walletDisplayCurrency === code;
              const rowSpacing = walletGlassMenuItemRowSpacing(
                index,
                WALLET_DISPLAY_CURRENCIES.length
              );
              return (
                <DropdownMenuItem
                  key={code}
                  textValue={code}
                  onSelect={() => setWalletDisplayCurrency(code)}
                  className={cn(
                    "!grid cursor-pointer grid-cols-[14px_auto_minmax(0,1fr)] items-center gap-1 rounded-[var(--radius-sm)] !px-1.5 !py-1.5 text-[11px] font-semibold outline-none sm:text-xs",
                    "mx-1",
                    rowSpacing,
                    selected
                      ? "bg-[var(--color-primary)] text-white hover:!bg-[var(--color-primary)] hover:!text-white focus:!bg-[var(--color-primary)] focus:!text-white data-[highlighted]:!bg-[var(--color-primary)] data-[highlighted]:!text-white"
                      : "text-[var(--color-text-primary)] hover:!bg-white/[0.055] hover:!text-white focus:!bg-white/[0.055] focus:!text-white data-[highlighted]:!bg-white/[0.055] data-[highlighted]:!text-white"
                  )}
                >
                  <span className="flex h-3.5 w-3.5 items-center justify-center">
                    {selected ? <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden /> : null}
                  </span>
                  <span className="min-w-0 truncate text-left">{code}</span>
                  <span className="sr-only">{selected ? " selected" : ""}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {activeTab === "Buy" && (
        <BuyPanel
          walletAddress={takerAddress}
          chainId={connectedChain?.id}
          onConnectWallet={onConnectWallet}
        />
      )}
      {activeTab === "Sell" && (
        <SellPanel walletAddress={takerAddress} chainId={connectedChain?.id} />
      )}
      {activeTab === "Limit" && (
        <LimitOrderPanel
          walletAddress={takerAddress}
          chainId={connectedChain?.id}
          sellableTokens={sellableTokens}
        />
      )}

      {activeTab === "Swap" && (
      <div className="relative flex min-h-0 flex-1 flex-col gap-5 px-4 pb-4 pt-1 sm:px-5 sm:pb-5">
        <>
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col rounded-[var(--radius-lg)] bg-[var(--color-bg-swap-panel)] px-4 py-6 relative">
            <div className="flex min-h-0 flex-1 items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                  Sell
                </p>
                <label className="mt-2 block min-w-0">
                  <span className="sr-only">Sell amount</span>
                  <input
                    value={sellAmount}
                    onChange={(e) => onSellInputChange(e.target.value)}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    aria-label="Sell amount"
                    className={cn(
                      "w-full min-w-0 border-0 bg-transparent p-0 text-3xl font-semibold tabular-nums outline-none ring-0 focus:ring-0",
                      insufficientBalance
                        ? "text-[var(--color-error)]"
                        : "text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
                    )}
                  />
                </label>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {formatUsd(sellAmountNum * getSwapMockUsdPrice(sellSymbol))}
                </p>
              </div>
              <div className="relative flex shrink-0 flex-col items-end justify-center self-center">
                <button
                  type="button"
                  onClick={() => setAssetPickerPanelOpen("sell")}
                  disabled={swapStatus === "signing" || swapStatus === "confirming" || swapStatus === "approving"}
                  className="inline-flex h-8 shrink-0 items-center gap-1 overflow-visible rounded-full border border-transparent bg-white/[0.05] px-[5px] py-0 text-[11px] font-semibold text-[var(--color-text-primary)] sm:h-9 sm:px-[6px] sm:text-xs disabled:opacity-50"
                  aria-label={`Asset: ${sellSymbol}`}
                >
                  <span className="relative inline-flex h-6 w-6 shrink-0">
                    <SwapTokenIcon src={sellPillIconSrc} className="h-6 w-6" fallbackBg={sellPillFallbackBg} />
                  </span>
                  {sellSymbol}
                </button>
                <p
                  className={cn(
                    "mt-1 font-mono text-xs font-semibold tabular-nums",
                    insufficientBalance ? "text-[var(--color-error)]" : "text-white/45"
                  )}
                >
                  {swapPanelDemoMode
                    ? `${swapDemoAvailableAmount > 0 && swapDemoAvailableAmount < 0.001 ? "<0.001" : swapDemoAvailableAmount} ${sellSymbol}`
                    : selectedSellToken
                      ? `${Number(selectedSellToken.balance).toFixed(Number(selectedSellToken.balance) < 1 ? 6 : 4)} ${sellSymbol}`
                      : `0 ${sellSymbol}`}
                </p>
              </div>
            </div>
          </div>

          <div className="relative z-10 -mt-5 flex shrink-0 justify-center">
            <div className="rounded-[14px]">
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-[14px] border-[3px] border-[var(--color-border-swap-center)] bg-[var(--color-bg-swap-center-inner)] text-white/90"
                aria-label="Flip sell and buy"
              >
                <ArrowDown className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="-mt-5 flex min-h-0 flex-1 flex-col rounded-[var(--radius-lg)] bg-white/[0.04] px-4 py-6 relative">
            <div className="flex min-h-0 flex-1 items-center justify-between gap-3">
              <div>
                {swapToAsset ? (
                  <>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                      Buy
                    </p>
                    <label className="mt-2 block min-w-0">
                      <span className="sr-only">Buy amount</span>
                      <input
                        value={buyAmount}
                        onChange={(e) => onBuyInputChange(e.target.value)}
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0"
                        aria-label="Buy amount"
                        className={cn(
                          "w-full min-w-0 border-0 bg-transparent p-0 text-3xl font-semibold tabular-nums outline-none ring-0 focus:ring-0",
                          buyAmount
                            ? "text-[var(--color-text-primary)]"
                            : "text-white/35 placeholder:text-white/35"
                        )}
                      />
                    </label>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {quoteBuyUsd != null
                        ? formatUsd(quoteBuyUsd)
                        : formatUsd(
                            parsePositiveDecimalInput(buyAmount) * getSwapMockUsdPrice(swapToAsset.symbol)
                          )}
                    </p>
                  </>
                ) : (
                  <div className="h-[1px] w-[1px]" aria-hidden />
                )}
              </div>
              <div className="flex flex-1 items-center justify-between self-center px-1">
                {swapToAsset ? (
                  <div className="flex w-full items-center justify-end">
                    <div className="flex shrink-0 flex-col items-end justify-center self-center">
                      <button
                        type="button"
                        onClick={() => {
                          setSwapToAsset(null);
                          setBuyAmount("");
                        }}
                        className="inline-flex h-8 shrink-0 items-center gap-1 overflow-visible rounded-full border border-transparent bg-white/[0.05] px-[5px] py-0 text-[11px] font-semibold text-[var(--color-text-primary)] sm:h-9 sm:px-[6px] sm:text-xs"
                        aria-label={`Asset: ${swapToAsset.symbol}`}
                      >
                        {swapToAsset.iconSrc ? (
                          <img
                            src={swapToAsset.iconSrc}
                            alt=""
                            className="h-5 w-5 shrink-0 rounded-full object-cover sm:h-6 sm:w-6"
                            width={24}
                            height={24}
                          />
                        ) : (
                          <span className={cn("h-5 w-5 shrink-0 rounded-full sm:h-6 sm:w-6", swapToAsset.fallbackBg)} aria-hidden />
                        )}
                        {swapToAsset.symbol}
                      </button>
                      <p className="mt-1 text-xs font-semibold text-white/45 tabular-nums">
                        {"<0.001"} {swapToAsset.symbol}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setSwapToAsset({
                            symbol: "USDC",
                            iconSrc: "/assets/images/icons/usdc.svg",
                            fallbackBg: "bg-blue-400/30",
                          });
                          setAssetPickerPanelOpen(null);
                        }}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05]"
                        aria-label="Quick select USDC"
                      >
                        <img
                          src="/assets/images/icons/usdc.svg"
                          alt=""
                          className="h-7 w-7 rounded-full object-cover"
                          width={28}
                          height={28}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setSwapToAsset({
                            symbol: "USDT",
                            iconSrc: "/assets/images/icons/tether.svg",
                            fallbackBg: "bg-emerald-400/30",
                          });
                          setAssetPickerPanelOpen(null);
                        }}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05]"
                        aria-label="Quick select USDT"
                      >
                        <img
                          src="/assets/images/icons/tether.svg"
                          alt=""
                          className="h-7 w-7 rounded-full object-cover"
                          width={28}
                          height={28}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setSwapToAsset({
                            symbol: "WBTC",
                            iconSrc: "/wrapped-bitcoin-wbtc-icon.svg?v=1",
                            fallbackBg: "bg-orange-400/30",
                          });
                          setAssetPickerPanelOpen(null);
                        }}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.05]"
                        aria-label="Quick select WBTC"
                      >
                        <img
                          src="/wrapped-bitcoin-wbtc-icon.svg?v=1"
                          alt=""
                          className="h-7 w-7 rounded-full object-cover"
                          width={28}
                          height={28}
                        />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAssetPickerPanelOpen("buy")}
                      className="inline-flex h-8 shrink-0 items-center gap-1 overflow-hidden rounded-full border border-transparent bg-[var(--color-primary)] px-[10px] py-0 text-[11px] font-semibold text-white sm:h-9 sm:px-3 sm:text-xs"
                      aria-label="Select token"
                    >
                      Select token
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {swapStatus === "confirmed" && swapTxHash && (
          <div className="shrink-0 rounded-[10px] border border-[var(--color-success)]/30 bg-[var(--color-success)]/[0.07] px-3 py-2.5 text-[11px]">
            <div className="font-semibold text-[var(--color-success)]">Swap confirmed ✓</div>
            <a
              href={
                connectedChain?.id === 1
                  ? `https://etherscan.io/tx/${swapTxHash}`
                  : connectedChain?.id === 8453
                    ? `https://basescan.org/tx/${swapTxHash}`
                    : connectedChain?.id === 42161
                      ? `https://arbiscan.io/tx/${swapTxHash}`
                      : connectedChain?.id === 137
                        ? `https://polygonscan.com/tx/${swapTxHash}`
                        : "#"
              }
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-block text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:underline"
            >
              View transaction →
            </a>
          </div>
        )}

        {insufficientBalance && swapStatus === "idle" && (
          <div className="shrink-0 rounded-[10px] border border-amber-500/30 bg-amber-500/[0.05] px-3 py-2 text-[11px] text-amber-400">
            <span className="font-semibold">Insufficient balance.</span>{" "}
            {nativeBalance ? (
              <>
                You have {Number(nativeBalance.formatted).toFixed(6)} {nativeBalance.symbol}; leave ≈{GAS_BUFFER_NATIVE} for gas. Max swappable: {maxSpendable.toFixed(6)} {nativeBalance.symbol}.
              </>
            ) : (
              "Wallet balance still loading."
            )}
          </div>
        )}

        {selectedSellToken && connectedChain && selectedSellToken.chainId !== connectedChain.id && swapStatus === "idle" && !insufficientBalance && (
          <div className="shrink-0 rounded-[10px] border border-[var(--color-primary)]/25 bg-[var(--color-primary)]/[0.05] px-3 py-2 text-[11px] text-[var(--color-text-muted)]">
            <span className="font-semibold text-[var(--color-primary)]">Cross-chain swap.</span>{" "}
            Your wallet is on {connectedChain.name}; this {selectedSellToken.symbol} lives on {selectedSellToken.chainName}. We'll ask your wallet to switch when you hit Swap.
          </div>
        )}

        {swapError && (
          <div className="shrink-0 rounded-[10px] border border-red-500/30 bg-red-500/[0.05] px-3 py-2 text-[11px] text-red-400">
            {swapError}
          </div>
        )}

        <Button
          type="button"
          disabled={ctaDisabled}
          onClick={() => {
            if (!showSwapCta) {
              onConnectWallet?.();
            } else if (swapStatus === "confirmed") {
              resetSwap();
              setSwapError(null);
              setSellAmount("");
              setBuyAmount("");
              setQuoteBuyUsd(null);
              setQuoteMinUsd(null);
              setQuoteStatus("idle");
              setApprovalHash(undefined);
              setIsApproving(false);
              setPendingSwapContext(null);
            } else if (swapPanelDemoMode) {
              setSwapError(null);
            } else {
              void handleExecuteSwap();
            }
          }}
          className="h-11 w-full shrink-0 rounded-[14px] bg-[var(--color-primary)] text-sm font-semibold text-white hover:bg-[var(--color-primary)]/90 disabled:opacity-40 disabled:pointer-events-none"
        >
          {swapCtaLabel}
        </Button>
        </>

      </div>
      )}
          </motion.div>
        ) : shell.kind === "sendReceive" && onShellChange && panelWalletAddress ? (
          <WalletSendReceivePanel
            shell={shell}
            onShellChange={onShellChange}
            walletAddress={panelWalletAddress}
            onSendTransactionToolbarChange={onSendTransactionToolbarChange}
            onOpenSendAssetPicker={() => setAssetPickerPanelOpen("send")}
            sendPanelAsset={sendPanelAsset}
            assetPickerOpen={assetPickerPanelOpen === "send"}
          />
        ) : null}
      </AnimatePresence>

      <SwapAssetPickerOverlay
        open={Boolean(assetPickerPanelOpen)}
        pickerKind={assetPickerPanelOpen === "send" ? "buy" : (assetPickerPanelOpen ?? "buy")}
        query={assetPickerQuery}
        onQueryChange={setAssetPickerQuery}
        onClose={() => {
          setAssetPickerPanelOpen(null);
          setAssetPickerQuery("");
        }}
        onSelect={(asset) => {
          if (assetPickerPanelOpen === "sell") {
            applySellAssetFromPicker(asset);
          } else if (assetPickerPanelOpen === "send") {
            setSendPanelAsset(asset);
          } else {
            setSwapToAsset(asset);
          }
        }}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Session 25 Phase 6 - Limit / Buy / Sell tab panels
// ──────────────────────────────────────────────────────────────────────────

/**
 * BuyPanel - in-house Buy tab with dual CTA (Session 26 Phase 8 scaffold).
 *
 * Per "In-House Buy Sell Ramp Design.md" Phase 8 directive: ship Buy 1
 * (card-balance → crypto wallet) and Buy 2 (bank-direct → crypto wallet)
 * SIDE BY SIDE, not sequentially. This component renders both CTAs
 * behind feature flags:
 *
 * BUY_1_ENABLED - gates the card-balance path (blocked on Issuer card-debit API)
 * BUY_2_ENABLED - gates the bank-direct path (blocked on Plaid + Dwolla)
 *
 * When both flags are false (today), we show the dual layout with
 * disabled CTAs + "Coming soon - <reason>" hints so the UX intent is
 * already baked in. Flipping a flag ships the backing flow without a
 * new UI commit.
 *
 * Moonpay fallback stays as the tertiary for users who need it
 * today - gets removed in full once both in-house paths are live.
 */

const WALLET_DISPLAY_CURRENCIES = ["USD", "EUR", "JPY", "AUD", "CAD"] as const;
type WalletDisplayCurrency = (typeof WALLET_DISPLAY_CURRENCIES)[number];

/** 5.4.26 BUY_ONRAMP_PROVIDERS - icon sizes unchanged from reference. */
const BUY_ONRAMP_PROVIDERS = [
  {
    id: "moonpay",
    name: "MoonPay",
    sub: "Venmo, Paypal, Debit",
    iconSrc: "/Moonpay%20Logo.svg",
    iconWrapperClass: "bg-[#7D00FF]",
    imgClass: "h-[18px] w-[18px] shrink-0 object-contain p-0.5",
    enabled: true,
  },
  {
    id: "robinhood",
    name: "Robinhood",
    sub: "Debit, Balance or ACH",
    iconSrc: "/Robinhood%20Feather%20Icon.svg",
    iconWrapperClass: "bg-[#CCFF00]",
    imgClass: "h-4 w-4 object-contain",
    enabled: false,
  },
  {
    id: "coinbase",
    name: "Coinbase",
    sub: "Debit, Balance or ACH",
    iconSrc: "/Coinbase%20C%20Icon.svg",
    iconWrapperClass: "bg-[#0052FF]",
    imgClass: "h-[18px] w-[18px] object-contain",
    enabled: false,
  },
] as const;

function BuyPanel({
  walletAddress,
  chainId,
  onConnectWallet,
}: {
  walletAddress?: string;
  chainId?: number;
  onConnectWallet?: () => void;
}) {
 // Feature flags retained for the post-pitch ramp launch, but the
 // "Coming soon · Phase 8a/8b" cards are hidden until the underlying
 // Issuer card-debit + Plaid/Dwolla flows ship. Showing them on the demo
 // confused investors - they looked like dead CTAs. The third-party
 // onramp list below (Moonpay live, Robinhood + Coinbase queued) is
 // the only Buy surface investors see today.
  const buy1Enabled = process.env.NEXT_PUBLIC_BUY_1_ENABLED === "true";
  const buy2Enabled = process.env.NEXT_PUBLIC_BUY_2_ENABLED === "true";

  const moonpayUrl = walletAddress
    ? `https://buy.moonpay.com/?walletAddress=${encodeURIComponent(walletAddress)}`
    : "https://buy.moonpay.com";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-3 pt-1 sm:px-5">
      {/* In-house Buy 1 (card balance) + Buy 2 (bank direct) cards
          hidden for the demo. They re-appear automatically once either
          NEXT_PUBLIC_BUY_1_ENABLED or NEXT_PUBLIC_BUY_2_ENABLED is set
          to "true" - Phase 8a/8b ship gate. */}
      {(buy1Enabled || buy2Enabled) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {buy1Enabled && (
            <div className="relative flex flex-col rounded-[var(--radius-lg)] border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/[0.04] p-4">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--color-primary)]">Primary · In-house</p>
              <h3 className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
                <span aria-hidden>💳</span><span>From card balance</span>
              </h3>
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                Pay with USD already on your Nuro Visa card. Debits card, credits USDC to your wallet on the chain of your choice.
              </p>
              <div className="mt-auto pt-4">
                <Button type="button" disabled={!walletAddress} className="h-11 w-full rounded-[10px] bg-[var(--color-primary)] text-sm font-semibold text-white hover:bg-[var(--color-primary)]/90 disabled:opacity-40">
                  {walletAddress ? "Buy from card →" : "Connect wallet"}
                </Button>
              </div>
            </div>
          )}
          {buy2Enabled && (
            <div className="relative flex flex-col rounded-[var(--radius-lg)] border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/[0.04] p-4">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--color-primary)]">Primary · In-house</p>
              <h3 className="flex items-center gap-2 text-base font-semibold text-[var(--color-text-primary)]">
                <span aria-hidden>🏦</span><span>From bank direct</span>
              </h3>
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                Link your bank via Plaid, pull USD via ACH, land USDC in your wallet.
              </p>
              <div className="mt-auto pt-4">
                <Button type="button" disabled={!walletAddress} className="h-11 w-full rounded-[10px] bg-[var(--color-primary)] text-sm font-semibold text-white hover:bg-[var(--color-primary)]/90 disabled:opacity-40">
                  {walletAddress ? "Link bank →" : "Connect wallet"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Third-party onramps - Moonpay live, Robinhood + Coinbase queued.
          MoonPay is live (opens hosted URL). Robinhood + Coinbase are visual-only
          placeholders until we wire their respective onramp flows in the
          batch wiring phase. The target UX shows all three
          as equal-weight options - we follow that, but label coming-soon ones
          distinctly to avoid false promises. */}
      <div className="rounded-[var(--radius-lg)] bg-black/20 p-4">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
          Buy USDC with USD
        </p>
        <div className="flex flex-col gap-2">
          {BUY_ONRAMP_PROVIDERS.map((p) => {
            const isComingSoon = !p.enabled;
            const needsConnect = p.enabled && !walletAddress;
            const actionLabel = p.enabled
              ? walletAddress
                ? "Open →"
                : "Connect wallet"
              : "Coming soon";

            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  if (isComingSoon) return;
                  if (needsConnect) {
                    onConnectWallet?.();
                    return;
                  }
                  if (p.id === "moonpay" && walletAddress) {
                    window.open(moonpayUrl, "_blank", "noopener,noreferrer");
                  }
                }}
                disabled={isComingSoon}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-[14px] bg-white/[0.04] px-3 py-3 text-left transition-colors",
                  isComingSoon
                    ? "cursor-not-allowed opacity-50"
                    : "hover:bg-white/[0.06]"
                )}
                aria-label={`${p.name}${isComingSoon ? " (coming soon)" : ""}`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[8px]",
                      p.iconWrapperClass
                    )}
                    style={
                      p.id === "moonpay"
                        ? {
                            backgroundColor: "var(--color-moonpay-app, #7D00FF)",
                            borderRadius: 8,
                          }
                        : undefined
                    }
                    aria-hidden
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.iconSrc}
                      alt=""
                      className={p.imgClass}
                      width={20}
                      height={20}
                      loading="lazy"
                      decoding="async"
                    />
                  </span>
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "text-sm font-semibold",
                        isComingSoon ? "text-white/50" : "text-white"
                      )}
                    >
                      {p.name}
                    </p>
                    <p
                      className={cn(
                        "mt-0.5 truncate text-[11px]",
                        isComingSoon ? "text-white/35" : "text-[var(--color-text-muted)]"
                      )}
                    >
                      {p.sub}
                    </p>
                  </div>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-[11px] font-semibold",
                    isComingSoon && "text-white/40",
                    needsConnect && "text-[var(--color-primary)]",
                    p.enabled && walletAddress && "text-white/55"
                  )}
                >
                  {actionLabel}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-center text-[11px] text-[var(--color-text-muted)]">
          You'll continue to the provider's portal to see the details associated with your transaction.
        </p>
      </div>
    </div>
  );
}

/**
 * SellPanel - the in-house Sell flow.
 *
 * Session 25 Phase 7a (per "In-House Buy Sell Ramp Design.md"):
 * Our existing crypto→card flow (Reload Card) IS a sell - user gives us
 * crypto, gets spendable USD balance. Exposing it on the /my-wallet
 * Sell tab as the PRIMARY action lets us drop the Moonpay Sell
 * dependency entirely for this path. Moonpay stays as a fallback for
 * users who want actual fiat-to-bank settlement (Sell 2 / Sell 3
 * deferred per design doc).
 */
function SellPanel({ walletAddress, chainId }: { walletAddress?: string; chainId?: number }) {
  const [reloadOpen, setReloadOpen] = useState(false);
  const Reload = useMemo(() => {
 // Dynamic so the Swap panel doesn't pay the import cost unless the
 // user actually lands on the Sell tab. Also lets the Reload modal
 // defer loading heavy wagmi/ethers code paths.
    return require("@/features/dashboard/my-card-v2/ReloadModal").default as React.ComponentType<{
      open: boolean;
      onClose: () => void;
    }>;
  }, []);

  const moonpayUrl = walletAddress
    ? `https://sell.moonpay.com/?walletAddress=${encodeURIComponent(walletAddress)}`
    : "https://sell.moonpay.com";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-3 pt-1 sm:px-5">
      {/* Primary: in-house crypto → card sell (our existing Reload flow) */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/[0.04] p-4">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--color-primary)]">
          Primary · In-house
        </p>
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Sell to your Nuro card
        </h3>
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">
          Convert any token from any supported chain into spendable USD on your Nuro Visa card. Runs through our own swap + bridge infrastructure - no third-party widget, no 3-5% on-ramp fee, no KYC hand-off.
        </p>
        <ul className="mt-3 space-y-1 text-[11px] text-[var(--color-text-muted)]">
          <li>• 23 source chains supported</li>
          <li>• Settles to card in ~1-25 min depending on chain</li>
          <li>• Spendable via Visa network immediately on credit</li>
          <li>• 5% bridge fee routed to Fee Vault (vs Moonpay's 3-5% + spread)</li>
        </ul>
        <Button
          type="button"
          onClick={() => setReloadOpen(true)}
          disabled={!walletAddress}
          className="mt-4 h-11 w-full rounded-[10px] bg-[var(--color-primary)] text-sm font-semibold text-white hover:bg-[var(--color-primary)]/90 disabled:opacity-40"
        >
          {walletAddress ? "Sell to card →" : "Connect wallet"}
        </Button>
      </div>

      {/* Secondary: Moonpay fallback for users who need fiat to bank */}
      <div className="rounded-[var(--radius-lg)] bg-black/20 p-4">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
          Fallback · Off-ramp to bank (via Moonpay)
        </p>
        <p className="text-xs text-[var(--color-text-muted)]">
          Need cash in your bank account instead of on your card? Moonpay's hosted off-ramp settles to USD/EUR/GBP in 3-5 business days. Direct wallet→bank via our own rails ships in a later phase.
        </p>
        <button
          type="button"
          onClick={() => walletAddress && window.open(moonpayUrl, "_blank", "noopener,noreferrer")}
          disabled={!walletAddress}
          className="mt-3 inline-flex items-center gap-2 rounded-[10px] bg-white/[0.04] px-4 py-2 text-xs font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-white/[0.1] disabled:opacity-40"
        >
          {walletAddress ? "Open Moonpay →" : "Connect wallet"}
        </button>
      </div>

      {reloadOpen && <Reload open={reloadOpen} onClose={() => setReloadOpen(false)} />}
    </div>
  );
}

/**
 * BuySellPanel - on-ramp / off-ramp via Moonpay's hosted widget.
 * We don't proxy the transaction ourselves; we link out with the user's
 * address pre-filled. Moonpay's buy.moonpay.com / sell.moonpay.com pages
 * accept public query params and don't require an API key for the demo
 * flow.
 */
function BuySellPanel({
  mode,
  walletAddress,
  chainId,
}: {
  mode: "buy" | "sell";
  walletAddress?: string;
  chainId?: number;
}) {
  const CHAIN_TO_CURRENCY: Record<number, { buy: string; sell: string; label: string }> = {
    1: { buy: "eth", sell: "eth", label: "Ethereum" },
    8453: { buy: "eth_base", sell: "eth_base", label: "Base" },
    42161: { buy: "eth_arbitrum", sell: "eth_arbitrum", label: "Arbitrum" },
    137: { buy: "matic_polygon", sell: "matic_polygon", label: "Polygon" },
  };
  const info = chainId ? CHAIN_TO_CURRENCY[chainId] : null;
  const currency = info ? (mode === "buy" ? info.buy : info.sell) : "eth";
  const base = mode === "buy" ? "https://buy.moonpay.com" : "https://sell.moonpay.com";
 // walletAddress pre-fills the destination on buy / source on sell
  const url = walletAddress
    ? `${base}/?walletAddress=${encodeURIComponent(walletAddress)}&defaultCurrencyCode=${currency}`
    : base;

  const title = mode === "buy" ? "Buy crypto with fiat" : "Cash out to fiat";
  const subtitle =
    mode === "buy"
      ? "Deposit USD / EUR / GBP via card or bank, receive ETH or native directly to your connected wallet."
      : "Send native tokens from your wallet, receive USD / EUR / GBP in your bank. 3-5 business days for settlement.";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-3 pt-1 sm:px-5">
      <div className="rounded-[var(--radius-lg)] bg-black/20 p-4">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
          {mode === "buy" ? "On-ramp" : "Off-ramp"}
        </p>
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">{title}</h3>
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">{subtitle}</p>
        {info && (
          <p className="mt-3 text-[11px] text-[var(--color-text-muted)]">
            <span className="font-semibold text-[var(--color-primary)]">Target chain: {info.label}</span>
            {walletAddress && (
              <span className="ml-2 font-mono">
                · {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
              </span>
            )}
          </p>
        )}
      </div>

      <div className="rounded-[var(--radius-lg)] bg-black/20 p-4">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
          Partners · powered by Moonpay
        </p>
        <ul className="space-y-1 text-xs text-[var(--color-text-muted)]">
          <li>• No sign-up required for amounts under $150</li>
          <li>• KYC handled by Moonpay, not stored by Nuro</li>
          <li>• Supports Visa, Mastercard, Apple Pay, Google Pay, SEPA, ACH</li>
        </ul>
      </div>

      <Button
        type="button"
        disabled={!walletAddress}
        onClick={() => {
          if (walletAddress) window.open(url, "_blank", "noopener,noreferrer");
        }}
        className="h-11 w-full shrink-0 rounded-[10px] bg-[var(--color-primary)] text-sm font-semibold text-white hover:bg-[var(--color-primary)]/90 disabled:opacity-40"
      >
        {walletAddress ? (mode === "buy" ? "Open Moonpay to Buy →" : "Open Moonpay to Sell →") : "Connect wallet"}
      </Button>

      <p className="text-[10px] text-[var(--color-text-muted)]">
        Nuro doesn't process the fiat transaction - you're redirected to Moonpay's hosted flow. Rates + fees set by Moonpay.
      </p>
    </div>
  );
}

type LimitOrderRecord = {
  id: string;
  createdAt: number;
  sellSymbol: string;
  sellAmount: string;
  buySymbol: string;
  targetPrice: string;
  chainId: number;
  walletAddress: string;
  status: "pending_execution";
};

/**
 * LimitOrderPanel - captures a target-price limit order and persists it
 * to localStorage. Proper execution requires a keeper bot watching prices
 * (Session 26 concern); this MVP records the intent so the UI is usable
 * today.
 */
function LimitOrderPanel({
  walletAddress,
  chainId,
  sellableTokens,
}: {
  walletAddress?: string;
  chainId?: number;
  sellableTokens: WalletToken[];
}) {
  const [sellAmount, setSellAmount] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [sellSymbol, setSellSymbol] = useState<string>("ETH");
  const [buySymbol] = useState<string>("USDC");
  const [submitted, setSubmitted] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<LimitOrderRecord[]>([]);

 // Custom token dropdown - replaces the ugly native <select>. Shows the
 // selected symbol + chevron, opens a styled popover on click, closes on
 // outside-click or Escape.
  const [sellPickerOpen, setSellPickerOpen] = useState(false);
  const sellPickerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sellPickerOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (sellPickerRef.current && !sellPickerRef.current.contains(e.target as Node)) {
        setSellPickerOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSellPickerOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [sellPickerOpen]);

 // Default sell to first sellable token on mount
  useEffect(() => {
    if (sellableTokens.length > 0 && sellSymbol === "ETH") {
      setSellSymbol(sellableTokens[0].symbol);
    }
  }, [sellableTokens, sellSymbol]);

 // Current market price (USDC per 1 sellSymbol) - fetched from the
 // /quote/best aggregator with amount=1. Powers the "Current:
 // $2,318.44" hint under the target input + a "Use market" button
 // that pre-fills the target. Before this fix (S30 overtime), users
 // had to know the current market price themselves before setting a
 // limit order - the target input was a raw field with no context.
  const [marketPrice, setMarketPrice] = useState<number | null>(null);
  const [marketPriceLoading, setMarketPriceLoading] = useState(false);
  useEffect(() => {
    if (!chainId || !sellSymbol) { setMarketPrice(null); return; }
    const ctrl = new AbortController();
    setMarketPriceLoading(true);
 // EVM natives pass as "native" sentinel; Solana symbols + ERC-20
 // symbols go as-is. Matches the same routing used by useLiveSwapQuote.
    const isEvmNative =
      ["ETH", "MATIC", "BNB", "AVAX", "S", "HYPE"].includes(sellSymbol) && chainId !== -1;
    const sellTokenParam = isEvmNative ? "native" : sellSymbol;
    fetch(
      `/api/quote/best?chainId=${chainId}&sellToken=${encodeURIComponent(sellTokenParam)}&amount=1`,
      { signal: ctrl.signal },
    )
      .then((r) => r.json())
      .then((data) => {
        if (ctrl.signal.aborted) return;
        if (data?.buyAmountUsd && !data.error && !data.degraded) {
          setMarketPrice(Number(data.buyAmountUsd));
        } else {
          setMarketPrice(null);
        }
      })
      .catch(() => { if (!ctrl.signal.aborted) setMarketPrice(null); })
      .finally(() => { if (!ctrl.signal.aborted) setMarketPriceLoading(false); });
    return () => ctrl.abort();
  }, [chainId, sellSymbol]);

 // Load + save pending orders in localStorage, scoped per wallet
  const storageKey = walletAddress ? `nuro:limit-orders:${walletAddress.toLowerCase()}` : null;
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setPendingOrders(JSON.parse(raw) as LimitOrderRecord[]);
    } catch {
 /* ignore */
    }
  }, [storageKey]);

  const persistOrders = (orders: LimitOrderRecord[]) => {
    setPendingOrders(orders);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(orders));
      } catch {
 /* ignore quota */
      }
    }
  };

  const handleSubmit = () => {
    if (!walletAddress || !chainId || !sellAmount || !targetPrice) return;
    const order: LimitOrderRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      sellSymbol,
      sellAmount,
      buySymbol,
      targetPrice,
      chainId,
      walletAddress,
      status: "pending_execution",
    };
    persistOrders([order, ...pendingOrders]);
    setSellAmount("");
    setTargetPrice("");
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  const handleCancel = (id: string) => {
    persistOrders(pendingOrders.filter((o) => o.id !== id));
  };

 // Resolve the current token (for balance check). sellableTokens is sorted
 // USD-desc, so the first symbol-match is the one with most balance if the
 // user holds the same asset on multiple chains.
  const activeToken = sellableTokens.find((t) => t.symbol === sellSymbol) ?? null;
  const activeBalanceNum = activeToken ? Number(activeToken.balance) : 0;
  const sellAmountNum = Number(sellAmount) || 0;
  const exceedsBalance =
    activeToken != null && sellAmountNum > 0 && sellAmountNum > activeBalanceNum;

  const canSubmit = Boolean(
    walletAddress &&
    chainId &&
    sellAmount &&
    targetPrice &&
    sellAmountNum > 0 &&
    Number(targetPrice) > 0 &&
    !exceedsBalance
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-3 pt-1 sm:px-5">
      <div className="rounded-[var(--radius-lg)] bg-black/20 p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
            Sell when price hits target
          </p>
          {activeToken && (
            <button
              type="button"
              onClick={() => setSellAmount(activeToken.balance)}
              className="shrink-0 text-[10px] font-semibold tabular-nums text-[var(--color-primary)] hover:underline"
              title={`Max ${activeToken.balance} ${sellSymbol}`}
            >
              Max: {Number(activeToken.balance).toLocaleString("en-US", { maximumFractionDigits: 6 })} {sellSymbol}
            </button>
          )}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <input
            type="text"
            inputMode="decimal"
            value={sellAmount}
            onChange={(e) => {
              const v = e.target.value.replace(",", ".");
              if (v === "" || /^[0-9]*\.?[0-9]*$/.test(v)) setSellAmount(v);
            }}
            placeholder="0"
            className={cn(
              "flex-1 min-w-0 border-0 bg-transparent p-0 text-2xl font-semibold tabular-nums outline-none placeholder:text-[var(--color-text-muted)]",
              exceedsBalance ? "text-red-400" : "text-[var(--color-text-primary)]"
            )}
          />
          <div ref={sellPickerRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => sellableTokens.length > 0 && setSellPickerOpen((v) => !v)}
              disabled={sellableTokens.length === 0}
              className={cn(
                "flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white/[0.04] px-3 text-xs font-semibold text-[var(--color-text-primary)] outline-none transition-colors",
                sellableTokens.length > 0 ? "hover:bg-white/[0.1]" : "opacity-70 cursor-default"
              )}
              aria-haspopup="listbox"
              aria-expanded={sellPickerOpen}
            >
              <span className="tabular-nums">{sellSymbol}</span>
              {sellableTokens.length > 0 && (
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    sellPickerOpen && "rotate-180"
                  )}
                />
              )}
            </button>
            {sellPickerOpen && sellableTokens.length > 0 && (
              <div
                role="listbox"
                className="absolute right-0 top-full z-30 mt-1.5 max-h-64 w-44 overflow-y-auto rounded-[12px] border border-white/10 bg-[#141414]/95 p-1 shadow-2xl backdrop-blur-xl"
              >
                {sellableTokens.map((t) => {
                  const key = `${t.chainId}-${t.contract ?? "native"}`;
                  const active = t.symbol === sellSymbol;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        setSellSymbol(t.symbol);
                        setSellPickerOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-[8px] px-2.5 py-1.5 text-left text-xs font-semibold transition-colors",
                        active
                          ? "bg-[var(--color-primary)]/15 text-[var(--color-text-primary)]"
                          : "text-[var(--color-text-primary)] hover:bg-white/[0.06]"
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">{t.symbol}</span>
                        {t.chainName && (
                          <span className="truncate text-[10px] font-medium text-white/40">
                            · {t.chainName}
                          </span>
                        )}
                      </span>
                      {active && <Check className="h-3 w-3 shrink-0 text-[var(--color-primary)]" strokeWidth={3} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        {exceedsBalance && (
          <p className="mt-2 text-[11px] font-medium text-red-400">
            Insufficient {sellSymbol} balance -
            have {Number(activeToken!.balance).toLocaleString("en-US", { maximumFractionDigits: 6 })},
            trying to sell {sellAmountNum.toLocaleString("en-US", { maximumFractionDigits: 6 })}.
          </p>
        )}
      </div>

      <div className="rounded-[var(--radius-lg)] bg-black/20 p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
            Target price ({buySymbol} per 1 {sellSymbol})
          </p>
          {marketPrice != null && !marketPriceLoading && (
            <button
              type="button"
              onClick={() => setTargetPrice(marketPrice.toFixed(marketPrice >= 1 ? 2 : 6))}
              className="shrink-0 text-[10px] font-semibold tabular-nums text-[var(--color-primary)] hover:underline"
              title={`Use current market price ${marketPrice.toFixed(6)}`}
            >
              Market: ${marketPrice.toLocaleString("en-US", { maximumFractionDigits: marketPrice >= 1 ? 2 : 6 })}
            </button>
          )}
          {marketPriceLoading && (
            <span className="shrink-0 text-[10px] text-[var(--color-text-muted)]/60">Loading…</span>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xl font-semibold text-[var(--color-text-muted)]">$</span>
          <input
            type="text"
            inputMode="decimal"
            value={targetPrice}
            onChange={(e) => {
              const v = e.target.value.replace(",", ".");
              if (v === "" || /^[0-9]*\.?[0-9]*$/.test(v)) setTargetPrice(v);
            }}
            placeholder={marketPrice != null
              ? marketPrice.toFixed(marketPrice >= 1 ? 2 : 6)
              : "0.00"}
            className="flex-1 min-w-0 border-0 bg-transparent p-0 text-2xl font-semibold tabular-nums text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-muted)]/40"
          />
        </div>
        {/* Surface how far target is from current - helps users sanity-check
            their limit order (e.g. target way below market means sell immediately). */}
        {marketPrice != null && targetPrice && Number(targetPrice) > 0 && (() => {
          const tgt = Number(targetPrice);
          const deltaPct = ((tgt - marketPrice) / marketPrice) * 100;
          const direction = deltaPct > 0 ? "above" : "below";
          return (
            <p className={cn(
              "mt-1.5 text-[10.5px] font-medium",
              Math.abs(deltaPct) < 0.5 ? "text-[var(--color-text-muted)]"
                : deltaPct > 0 ? "text-emerald-400"
                : "text-amber-400",
            )}>
              {deltaPct.toFixed(2)}% {direction} market
              {deltaPct < -1 && " - would execute at current price"}
            </p>
          );
        })()}
        <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
          Your order will execute a swap when the market hits {targetPrice ? `$${targetPrice}` : "your target"}. Keeper-bot execution launches Session 26 - for now we persist the intent locally and list it below.
        </p>
      </div>

      {submitted && (
        <div className="rounded-[10px] border border-[var(--color-success)]/30 bg-[var(--color-success)]/[0.05] px-3 py-2 text-[11px] text-[var(--color-success)]">
          ✓ Limit order saved locally. Keeper-bot execution ships Session 26.
        </div>
      )}

      <Button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="h-11 w-full shrink-0 rounded-[10px] bg-[var(--color-primary)] text-sm font-semibold text-white hover:bg-[var(--color-primary)]/90 disabled:opacity-40"
      >
        {!walletAddress
          ? "Connect wallet"
          : exceedsBalance
            ? `Insufficient ${sellSymbol} balance`
            : canSubmit
              ? "Save limit order"
              : "Enter amount + target"}
      </Button>

      {pendingOrders.length > 0 && (
        <div className="rounded-[var(--radius-lg)] bg-black/20 p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            Pending orders · {pendingOrders.length}
          </p>
          <div className="space-y-2">
            {pendingOrders.slice(0, 5).map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between gap-2 rounded-[10px] border border-white/[0.06] bg-white/[0.02] px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-[var(--color-text-primary)]">
                    Sell {o.sellAmount} {o.sellSymbol} @ ${o.targetPrice}
                  </div>
                  <div className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">
                    {new Date(o.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCancel(o.id)}
                  className="shrink-0 rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-white/60 hover:text-white/90"
                >
                  cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatActivityMeta(timestamp: number): string {
  if (!timestamp) return "Recent";
  const now = Date.now();
  const elapsed = now - timestamp;
  const day = 24 * 60 * 60 * 1000;
  const d = new Date(timestamp);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (elapsed < day) return `Today · ${time}`;
  if (elapsed < 2 * day) return `Yesterday · ${time}`;
  const month = d.toLocaleString([], { month: "short" });
  return `${month} ${d.getDate()} · ${time}`;
}

// Human-readable amount formatter - never scientific notation, even for
// tiny values. Uses increasing decimal precision as the number shrinks,
// and collapses anything below 6 decimals to a "<0.000001" label so the
// column stays visually uniform and honest.
function formatActivityAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) return "0";
  const abs = Math.abs(amount);
  if (abs >= 1) return amount.toFixed(2);
  if (abs >= 0.01) return amount.toFixed(4);
  if (abs >= 0.0001) return amount.toFixed(6);
  if (abs >= 0.00000001) return amount.toFixed(8);
 // Genuinely tiny - avoid useless precision noise
  return amount > 0 ? "<0.00000001" : ">-0.00000001";
}

function activityToRows(
  transfers: WalletActivityEntry[],
  ownAddress: string
): WalletRecentActivityModalRow[] {
  const own = ownAddress.toLowerCase();
  return transfers.map((t, i) => {
    const dirLabel = t.direction === "in" ? "Received" : "Sent";
    const kind: "received" | "other" = t.direction === "in" ? "received" : "other";
    const sign = t.direction === "in" ? "+" : "-";
    const amountText =
      t.amount > 0
        ? `${sign}${formatActivityAmount(t.amount)} ${t.asset}`
        : `${sign}${t.asset}`;
    return {
      key: `act-${t.txHash}-${i}`,
 // Phase 6 polish - drop the "· chainName" suffix; chain now rendered
 // as a branded icon leading the row (matches Transactions page UX).
      title: `${dirLabel} ${t.asset}`,
      meta: formatActivityMeta(t.timestamp),
      txid: t.txHash,
      amount: amountText,
      kind,
      status: "completed",
      eventDate: t.timestamp ? new Date(t.timestamp).toISOString().slice(0, 10) : "",
      chainId: t.chainId,
    };
  });
}

// Phase 5 polish - same phishing heuristic as the All Assets table, but
// applied to transfer entries. Airdropped scam tokens are visible on-chain
// which means their receive-transfers surface in Recent Activity. Most
// users want them hidden by default.
const ACTIVITY_SPAM_REGEXES: RegExp[] = [
  /t\.me\//i,
  /visit\s+(?:to\s+)?claim/i,
  /claim\s+(?:at|on|via)/i,
  /✅|⭐|🎁|💰|🚀|⚡/,
  /airdrop\s*!/i,
  /\.com|\.io|\.xyz|\.net|\.org/i,
  /https?:\/\//i,
];
function transferLooksLikeSpam(
  t: WalletActivityEntry,
  scamSymbols?: Set<string>,
  whitelist?: TokenWhitelist
): boolean {
  const asset = t.asset ?? "";
 // Session 26 - whitelist override wins over every other heuristic.
 // If the asset matches an allowlist symbol, it's legit. Period.
  if (whitelist && asset && isWhitelistedToken(whitelist, { symbol: asset })) {
    return false;
  }
  if (asset.length > 24) return true; // obvious phishing name stuffing
  if (ACTIVITY_SPAM_REGEXES.some((r) => r.test(asset))) return true;
 // Cross-reference: if the asset symbol matches a known-scam token in the
 // user's portfolio (zero USD price, non-native), the transfer is spam
 // regardless of whether the NAME itself passes the regex. Catches clean
 // short-name airdrops (OCT / ASTEROID / MOGU pattern).
  if (scamSymbols && scamSymbols.has(asset.toLowerCase())) return true;
  return false;
}

function RecentActivityPanel(props: {
  walletAddress: string;
  activity?: WalletActivityEntry[];
  portfolioTokens?: WalletToken[];
  showSkeleton?: boolean;
}) {
  const { walletAddress, activity, portfolioTokens } = props;
  const activityShowSkeleton = props.showSkeleton === true;
  const MAX_VISIBLE = 5;
  const [showSpam, setShowSpam] = useState(false);
 // Session 26 - positive allowlist override
  const whitelist = useTokenWhitelist();

 // Build a set of "known scam" asset symbols from the portfolio -
 // tokens that are zero-priced or hit our looksLikeScam heuristic.
 // This catches clean short-name scams (OCT / ASTEROID / MOGU pattern)
 // that the regex heuristic alone would miss.
 //
 // Whitelist is passed to looksLikeScam so legit allowlisted tokens
 // (LINK / UNI / SHIB / PEPE / etc.) never land in the scam set.
  const scamSymbols = useMemo<Set<string>>(() => {
    const out = new Set<string>();
    if (!portfolioTokens) return out;
    for (const t of portfolioTokens) {
      if (t.isNative) continue;
 // Don't classify whitelisted tokens as scam no matter the price
      if (isWhitelistedToken(whitelist, { chainId: t.chainId, contract: t.contract, symbol: t.symbol })) continue;
      if (t.usdPrice === 0 || looksLikeScam(t, whitelist)) {
        out.add(t.symbol.toLowerCase());
      }
    }
    return out;
  }, [portfolioTokens, whitelist]);

 // Partition transfers into {legit, spam} so we can count them both
  const partitioned = useMemo(() => {
    if (!activity) return { legit: [] as WalletActivityEntry[], spam: [] as WalletActivityEntry[] };
    const legit: WalletActivityEntry[] = [];
    const spam: WalletActivityEntry[] = [];
    for (const t of activity) {
      if (transferLooksLikeSpam(t, scamSymbols, whitelist)) spam.push(t);
      else legit.push(t);
    }
    return { legit, spam };
  }, [activity, scamSymbols, whitelist]);

  const effectiveTransfers = showSpam
    ? activity ?? []
    : partitioned.legit;

  const liveRows = useMemo(
    () => (effectiveTransfers.length > 0 ? activityToRows(effectiveTransfers, walletAddress) : null),
    [effectiveTransfers, walletAddress]
  );
 // Empty-state decision: if `activity` prop was provided (wallet connected)
 // but the array is empty, show a real empty state rather than bouncing back
 // to the mock rows.
  const walletIsConnectedWithNoActivity = activity != null && effectiveTransfers.length === 0;
  const rowSource =
    liveRows ??
    (walletIsConnectedWithNoActivity && !shouldUseDevPopulatedData()
      ? []
      : WALLET_RECENT_ACTIVITY_ROWS);
  const visible = rowSource.slice(0, MAX_VISIBLE);
  const displayActivity =
    visible.length > 0
      ? visible
      : activityShowSkeleton
        ? WALLET_RECENT_ACTIVITY_ROWS.slice(0, MAX_VISIBLE)
        : [];
  const shouldScroll = displayActivity.length >= MAX_VISIBLE;
  const [recentActivityModalOpen, setRecentActivityModalOpen] = useState(false);

  return (
    <div className={cn(surfaceCard(), "flex min-h-0 flex-col overflow-hidden")}>
      <div className="shrink-0 px-5 py-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Recent activity</h3>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">Latest wallet events</p>
          </div>
          <button
            type="button"
            onClick={() => setRecentActivityModalOpen(true)}
            className={cn(
              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border transition-[background-color,color,border-color] duration-200",
              "border-transparent bg-white/[0.04] text-white/65 hover:!bg-white/[0.055] hover:!text-white [&_svg]:transition-none"
            )}
            aria-label="Expand recent activity"
          >
            <Maximize2 className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-2">
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-md)] px-0 pb-0 pt-0",
            "bg-white/[0.04] dark:bg-white/[0.02]"
          )}
        >
          <div
            className={cn(
              "h-full min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto",
              shouldScroll && "max-h-[380px]"
            )}
          >
            {displayActivity.length === 0 ? (
              <div className="flex h-full min-h-[160px] flex-col items-center justify-center px-6 py-10 text-center">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.04] text-white/50">
                  <ArrowDownLeft className="h-5 w-5" strokeWidth={2} />
                </div>
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">No recent activity</p>
                <p className="mt-1 max-w-[280px] text-xs text-[var(--color-text-muted)]">
                  {activity != null
                    ? "This wallet has no transfers on Ethereum, Base, Arbitrum, or Polygon yet."
                    : "Connect your wallet to load live transfer history."}
                </p>
              </div>
            ) : (
            <table className="w-full min-w-0 table-fixed border-collapse text-left text-sm">
              <colgroup>
                <col className="min-w-0" />
                <col className="w-[42%] sm:w-[40%]" />
              </colgroup>
              <tbody className="text-[var(--color-text-primary)]">
                {displayActivity.map((item, rowIndex) => (
                  <tr
                    key={item.key}
                    className={cn(
                      rowIndex % 2 === 1
                        ? "bg-white/[0.02] hover:bg-white/[0.03]"
                        : "hover:bg-white/[0.01]"
                    )}
                  >
                    <td className="py-3.5 pl-6 pr-4 align-top sm:pl-7">
                      <p className="truncate font-medium">
                        {activityShowSkeleton ? (
                          <WalletSkeletonText className="truncate font-medium">{item.title}</WalletSkeletonText>
                        ) : (
                          item.title
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                        {activityShowSkeleton ? (
                          <WalletSkeletonText className="text-xs">{item.meta}</WalletSkeletonText>
                        ) : (
                          item.meta
                        )}
                      </p>
                    </td>
                    <td
                      className={cn(
                        "py-3.5 pl-2 pr-6 text-right sm:pr-7",
                        item.amountUsd ? "align-top" : "align-middle"
                      )}
                    >
                      <p className="text-xs font-semibold tabular-nums text-[var(--color-text-primary)]">
                        {activityShowSkeleton ? (
                          <WalletSkeletonText className="ml-auto text-xs font-semibold tabular-nums">
                            {item.amount}
                          </WalletSkeletonText>
                        ) : (
                          item.amount
                        )}
                      </p>
                      {item.amountUsd ? (
                        <p className="mt-0.5 text-xs tabular-nums text-[var(--color-text-muted)]">
                          {activityShowSkeleton ? (
                            <WalletSkeletonText className="ml-auto text-xs tabular-nums">
                              {item.amountUsd}
                            </WalletSkeletonText>
                          ) : (
                            item.amountUsd
                          )}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
        </div>
      </div>

      <WalletRecentActivityModal
        open={recentActivityModalOpen}
        onOpenChange={setRecentActivityModalOpen}
        title="Recent activity"
        subtitle="Latest wallet events"
        rows={rowSource}
        walletAddress={walletAddress}
      />
    </div>
  );
}

/**
 * Connected wallet layout (see `.cursor/rules/connected-wallet-dashboard-layout.mdc` - do not regress).
 *
 * Below `xl`: one column, `order-*` → balance → cards → assets → swap → recent.
 * At `xl`: 2×2 grid `2fr / 1fr`, rows `auto` + `minmax(0,1fr)`, `gap-4` only between blocks.
 * Row 2 aligns All assets | Recent activity.
 * Row-1 at `xl`: left stack uses `xl:self-start` (content-sized). Swap column stretches (`xl:h-full`) so the swap
 * card grows to the row-1 track height - only `gap-4` (16px) between swap and Recent activity, no dead band.
 */
export type ConnectedWalletDashboardProps = {
 /** Optional `0x…` for the pill; falls back to demo when omitted. */
  walletAddress?: string;
 /**
 * When provided, top asset cards are the highest-`balanceUsdNumber` holdings (up to 3).
 * Omit to use demo holdings (also supports 1–N assets: only that many cards render).
 */
  walletHoldings?: WalletHolding[];
 /** Swap card primary CTA: `"swap"` when linked / mock-connected; `"connect"` when the user must connect a wallet first. */
  swapCtaMode?: "swap" | "connect";
 /** Invoked when `swapCtaMode` is `"connect"` and the user taps the blue button. */
  onSwapPanelConnectWallet?: () => void;
 /** Send flow toolbar pill (5.4.26). */
  onSendTransactionToolbarChange?: (event: SendTransactionToolbarEvent) => void;
};

export function ConnectedWalletDashboard({
  walletAddress,
  walletHoldings,
  swapCtaMode = "swap",
  onSwapPanelConnectWallet,
  onSendTransactionToolbarChange,
}: ConnectedWalletDashboardProps = {}) {
  const [rightShell, setRightShell] = useState<WalletRightShell>({ kind: "swap" });
  const resolvedAddress = (walletAddress ?? DEMO_CONNECTED_WALLET_ADDRESS).trim();
  const holdingsSource = walletHoldings ?? DEMO_WALLET_HOLDINGS;
  const topAssetCards = useMemo(() => pickTopAssetCards(holdingsSource, 3), [holdingsSource]);

 // --- Session 25 Phase 2 + 3 wiring ---
 // Portfolio (balances + prices) + activity (recent transfers) - both via
 // the backend /wallet-portfolio + /wallet-activity Alchemy proxies.
 // Falls back to mock values when status is idle/error so the UI never
 // shows a blank page.
  const [fetchRefreshKey, setFetchRefreshKey] = useState(0);
  const [userRefreshKey, setUserRefreshKey] = useState(0);
  const [isUserRefreshing, setIsUserRefreshing] = useState(false);
 /** Tracks user reload until hooks enter loading, then settle (avoids 1-frame clear while SWR still shows success). */
  const userRefreshGuard = useRef({ active: false, sawLoading: false });

  const portfolio = useWalletPortfolio(fetchRefreshKey, resolvedAddress, userRefreshKey);
  const activity = useWalletActivity(50, fetchRefreshKey, resolvedAddress, userRefreshKey);
  const lastPortfolioRef = useRef<WalletPortfolio | null>(null);

  useEffect(() => {
    if (portfolio.status === "success") lastPortfolioRef.current = portfolio;
  }, [portfolio]);

  useEffect(() => {
    lastPortfolioRef.current = null;
  }, [resolvedAddress]);

  const portfolioForUi =
    portfolio.status === "success" ? portfolio : lastPortfolioRef.current ?? portfolio;
  const tokensForUi =
    portfolioForUi.status === "success" ? portfolioForUi.tokens : undefined;
  const lastActivityTransfersRef = useRef<WalletActivityEntry[]>([]);

  useEffect(() => {
    if (activity.transfers.length > 0) lastActivityTransfersRef.current = activity.transfers;
  }, [activity.transfers]);

  useEffect(() => {
    lastActivityTransfersRef.current = [];
  }, [resolvedAddress]);

  const activityTransfersForUi =
    activity.transfers.length > 0
      ? activity.transfers
      : lastActivityTransfersRef.current.length > 0
        ? lastActivityTransfersRef.current
        : undefined;

  const requestUserRefresh = useCallback(() => {
    userRefreshGuard.current = { active: true, sawLoading: false };
    setIsUserRefreshing(true);
    setUserRefreshKey((k) => k + 1);
    setFetchRefreshKey((k) => k + 1);
  }, []);

  const bumpFetchOnly = useCallback(() => {
    setFetchRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!isUserRefreshing || !userRefreshGuard.current.active) return;

    if (portfolio.status === "loading" || activity.status === "loading") {
      userRefreshGuard.current.sawLoading = true;
    }

    if (userRefreshGuard.current.sawLoading) {
      if (portfolio.status === "loading" || activity.status === "loading") return;
      if (portfolio.status === "idle" || activity.status === "idle") return;
      userRefreshGuard.current = { active: false, sawLoading: false };
      setIsUserRefreshing(false);
      return;
    }

 // Hooks never reached loading (idle address / instant cache) - still show skeleton briefly.
    const t = window.setTimeout(() => {
      if (!userRefreshGuard.current.active) return;
      userRefreshGuard.current = { active: false, sawLoading: false };
      setIsUserRefreshing(false);
    }, 500);
    return () => window.clearTimeout(t);
  }, [isUserRefreshing, portfolio.status, activity.status]);

  const isInitialPortfolioLoad =
    portfolio.status === "loading" && portfolio.lastFetchedAt == null;
  const isInitialActivityLoad =
    activity.status === "loading" && activity.lastFetchedAt == null;
  const showDataSkeleton =
    isUserRefreshing || isInitialPortfolioLoad || isInitialActivityLoad;

  const [activeTradeTab, setActiveTradeTab] = useState<TradeTab>("Swap");

  useEffect(() => {
    if (rightShell.kind === "swap") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRightShell({ kind: "swap" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rightShell.kind]);

  useEffect(() => {
    const onRefresh = () => requestUserRefresh();
    window.addEventListener("wallet-portfolio-refresh", onRefresh);
    return () => window.removeEventListener("wallet-portfolio-refresh", onRefresh);
  }, [requestUserRefresh]);

  const handleRefreshPortfolio = requestUserRefresh;

 // Phase 5 polish - re-fire the refresh key as soon as a local swap/send
 // tx confirms, so the user sees their own action land in Recent Activity
 // without waiting for the 60s poll. We piggyback on the events
 // bubbled via a custom DOM event (wallet-activity-bump) that the modals +
 // swap panel dispatch when their useWaitForTransactionReceipt flips to
 // isSuccess. 5s delay lets the indexer catch up before we re-query.
  useEffect(() => {
    const onBump = () => {
      window.setTimeout(() => bumpFetchOnly(), 5_000);
    };
    window.addEventListener("wallet-activity-bump", onBump);
    return () => window.removeEventListener("wallet-activity-bump", onBump);
  }, [bumpFetchOnly]);

 // Phase 5 polish - live-refresh every 60s while the page is visible.
 // Pauses when the tab is hidden (document.hidden) to conserve Alchemy CU
 // and CoinGecko rate budget. Also re-fires immediately on becoming
 // visible again so data is fresh when the user returns.
  useEffect(() => {
    let intervalId: number | null = null;
    const kick = () => bumpFetchOnly();
    const start = () => {
      if (intervalId != null) return;
      intervalId = window.setInterval(kick, 60_000);
    };
    const stop = () => {
      if (intervalId != null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        kick();
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div
      className={cn(
        "min-h-0 w-full gap-4",
        "max-xl:flex max-xl:flex-col",
        "xl:grid xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:grid-rows-[auto_minmax(0,1fr)]"
      )}
    >
      <div
        className={cn(
          "order-1 flex min-w-0 flex-col",
          BLOCK_GAP,
          "xl:order-none xl:col-start-1 xl:row-start-1 xl:min-h-0 xl:self-start"
        )}
      >
        <WalletBalanceBanner
          address={resolvedAddress}
          portfolio={portfolioForUi}
          showSkeleton={showDataSkeleton}
          onTransferAction={(tab) => setRightShell({ kind: "sendReceive", tab })}
          onRefresh={handleRefreshPortfolio}
        />
        <TopAssetCardsStrip
          cards={topAssetCards}
          orderStorageKey={resolvedAddress.toLowerCase()}
          portfolio={portfolioForUi}
          showSkeleton={showDataSkeleton}
        />
      </div>

      <div
        className={cn(
          "order-2 flex min-h-0 min-w-0 flex-1 flex-col",
          "xl:order-none xl:col-start-1 xl:row-start-2 xl:h-full xl:min-h-0"
        )}
      >
        <AssetsTable tokens={tokensForUi} showSkeleton={showDataSkeleton} />
      </div>

      <div
        className={cn(
          "order-3 flex min-h-0 min-w-0 flex-col",
          "xl:order-none xl:col-start-2 xl:row-start-1 xl:h-full xl:min-h-0 xl:min-w-[280px]"
        )}
      >
        <SwapWidgetPanel
          swapCtaMode={swapCtaMode}
          onConnectWallet={onSwapPanelConnectWallet}
          activeTab={activeTradeTab}
          onTabChange={setActiveTradeTab}
          portfolioTokens={tokensForUi}
          shell={rightShell}
          onShellChange={setRightShell}
          panelWalletAddress={resolvedAddress}
          onSendTransactionToolbarChange={onSendTransactionToolbarChange}
        />
      </div>

      <div
        className={cn(
          "order-4 flex min-h-0 min-w-0 flex-col",
          "xl:order-none xl:col-start-2 xl:row-start-2 xl:h-full xl:min-h-0 xl:self-start"
        )}
      >
        <RecentActivityPanel
          walletAddress={resolvedAddress}
          activity={activityTransfersForUi}
          portfolioTokens={tokensForUi}
          showSkeleton={showDataSkeleton}
        />
      </div>

    </div>
  );
}
