"use client";

import type { Dispatch, SetStateAction } from "react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { FULL_MODAL_OVERLAY_CLASS } from "@/components/ui/modalPresets";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  WALLET_GLASS_MENU_CONTENT,
  walletGlassMenuItemRowSpacing,
} from "@/lib/walletGlassMenu";
import { motion } from "framer-motion";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  Globe,
  RefreshCw,
  Repeat,
  Search,
  Star,
  X,
} from "lucide-react";

export type WalletAssetModalRow = {
  key: string;
  asset: string;
  sym: string;
  balance: string;
  price: string;
  d24: string;
  cap: string;
 /** When true, row is treated as a scam token and can be hidden via Hide → Scams. */
  isScam?: boolean;
};

interface WalletAssetsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  rows: readonly WalletAssetModalRow[];
  walletAddress?: string;
  onRefresh?: () => void | Promise<void>;
 /** Shared with inline `AssetsTable` so pin / “pinned only” stay in sync. */
  pinnedKeys: Set<string>;
  setPinnedKeys: Dispatch<SetStateAction<Set<string>>>;
  pinnedOnly: boolean;
  setPinnedOnly: Dispatch<SetStateAction<boolean>>;
  hideDust: boolean;
  setHideDust: Dispatch<SetStateAction<boolean>>;
  hideScams: boolean;
  setHideScams: Dispatch<SetStateAction<boolean>>;
}

const PAGINATION = {
  noResults: "No results found.",
  showing: "Showing",
  to: "to",
  of: "of",
  previous: "Previous",
  next: "Next",
} as const;

const ASSET_ROW_OVERFLOW_MENU: { label: string; Icon: LucideIcon }[] = [
  { label: "Send", Icon: ArrowUpRight },
  { label: "Receive", Icon: ArrowDownLeft },
  { label: "Swap", Icon: Repeat },
  { label: "Scanner", Icon: Globe },
];

function openInNewTab(url?: string) {
  const target = (url ?? "").trim() || "about:blank";
  window.open(target, "_blank", "noopener,noreferrer");
}

function truncateAddressMiddle(address: string, headChars = 6, tailChars = 4) {
  const a = address.trim();
  if (!a) return "";
  if (a.length <= headChars + tailChars + 1) return a;
  return `${a.slice(0, headChars)}…${a.slice(-tailChars)}`;
}

type AssetsSortKey = "value_desc" | "value_asc" | "change_desc" | "change_asc";

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

const layerVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const cascadeVariants = {
  initial: { opacity: 0, y: -12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.33, 1, 0.68, 1],
    },
  },
};

const DUST_THRESHOLD_USD = 10;

function parseUsd(s: string) {
  const n = Number(String(s).replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parsePct(s: string) {
  const n = Number(String(s).replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Full-screen assets list - shell + title row match {@link TransactionsModal}; subtitle + toolbar follow
 * {@link TransactionsTable} → {@link SearchAndFilters} layout (then table + pagination).
 */
export function WalletAssetsModal({
  open,
  onOpenChange,
  title,
  rows,
  walletAddress = "",
  onRefresh,
  pinnedKeys,
  setPinnedKeys,
  pinnedOnly,
  setPinnedOnly,
  hideDust,
  setHideDust,
  hideScams,
  setHideScams,
}: WalletAssetsModalProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<AssetsSortKey>("value_desc");
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [refreshCycle, setRefreshCycle] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const fullAddress = walletAddress.trim();
  const shortAddress = truncateAddressMiddle(fullAddress);

  const showClear = Boolean(query.trim() || hideDust || hideScams || pinnedOnly);

  const clearToolbarFilters = () => {
    setQuery("");
    setHideDust(false);
    setHideScams(false);
    setPinnedOnly(false);
    setIsSearchExpanded(false);
  };

  useEffect(() => {
    setPageIndex(0);
  }, [query, hideDust, hideScams, pageSize, pinnedOnly, pinnedKeys, sort, rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filteredRows = [...rows].filter((r) => {
      const valueUsd = parseUsd(r.balance);
      const matchesQuery =
        q.length === 0 ||
        r.asset.toLowerCase().includes(q) ||
        r.sym.toLowerCase().includes(q);
      const passesDust = !hideDust || valueUsd >= DUST_THRESHOLD_USD;
      const isScam = Boolean(r.isScam);
      const passesScams = !hideScams || !isScam;
      const isPinned = pinnedKeys.has(r.key);
      const passesPinned = !pinnedOnly || isPinned;
      return matchesQuery && passesDust && passesScams && passesPinned;
    });

    return [...filteredRows].sort((a, b) => {
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
  }, [hideDust, hideScams, pinnedKeys, pinnedOnly, query, rows, sort]);

  const maxPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
  const safePage = Math.min(pageIndex, maxPage);
  const pageRows = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  useEffect(() => {
    setPageIndex((p) => Math.min(p, maxPage));
  }, [maxPage]);

  useEffect(() => {
    setCopied(false);
  }, [fullAddress]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        overlayClassName={FULL_MODAL_OVERLAY_CLASS}
        className="notifications-full-dialog z-[110] flex min-h-0 flex-col gap-0 !overflow-visible p-[12px] h-[min(85vh,42rem)] w-[calc(100vw-2rem)] max-w-[920px] !rounded-[56px] backdrop-blur-md shadow-xl"
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.02)",
          borderColor: "rgba(255, 255, 255, 0.03)",
          borderWidth: "1px",
          borderStyle: "solid",
        }}
      >
        <div
          className="relative w-full h-full !backdrop-blur-none rounded-[44px] overflow-hidden flex flex-col border"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.04)",
            borderColor: "rgba(255, 255, 255, 0.03)",
            borderWidth: "1px",
            borderStyle: "solid",
          }}
        >
          <motion.div
            className="flex flex-col flex-1 min-h-0"
            variants={layerVariants}
            initial="initial"
            animate="animate"
          >
            <motion.div className="shrink-0 px-4 pt-6 pb-3" variants={cascadeVariants}>
              <div className="flex items-center justify-between gap-3 pl-3 pr-3">
                <DialogTitle className="m-0 flex-1 text-start text-2xl font-semibold leading-none tracking-tight text-[var(--color-text-primary)]">
                  {title}
                </DialogTitle>
                <div className="flex min-w-0 shrink-0 items-center gap-2">
                  <button
                    type="button"
                    className={cn(
                      "inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-transparent bg-[rgba(255,255,255,0.03)] p-0 text-[var(--color-text-muted)] outline-none transition-[background-color,color,border-color] duration-200",
                      "hover:bg-[rgba(255,255,255,0.05)] hover:text-white",
                      "isolate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25"
                    )}
                    aria-label="Block Scanner"
                    onClick={() => {
                      const base = (process.env.NEXT_PUBLIC_BLOCK_SCANNER_ADDRESS_BASE_URL ?? "").trim();
                      openInNewTab(base && fullAddress ? `${base}${fullAddress}` : undefined);
                    }}
                  >
                    <Globe className="pointer-events-none h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                  </button>

                  <button
                    type="button"
                    className={cn(
                      "inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-transparent bg-[rgba(255,255,255,0.03)] p-0 text-[var(--color-text-muted)] outline-none transition-[background-color,color,border-color] duration-200",
                      "hover:bg-[rgba(255,255,255,0.05)] hover:text-white",
                      "isolate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25"
                    )}
                    aria-label="Refresh"
                    disabled={refreshing}
                    onClick={async () => {
                      if (refreshing) return;
                      if (!onRefresh) return;
                      setRefreshing(true);
                      setRefreshCycle((c) => c + 1);
                      try {
                        await Promise.all([onRefresh(), new Promise((r) => window.setTimeout(r, 450))]);
                      } finally {
                        setRefreshing(false);
                      }
                    }}
                  >
                    <RefreshCw
                      className={cn("pointer-events-none h-4 w-4 shrink-0", refreshing ? "animate-spin" : "")}
                      style={refreshing ? { animation: "spin 0.9s linear infinite" } : undefined}
                      strokeWidth={2}
                      aria-hidden
                    />
                  </button>

                  {fullAddress ? (
                    <button
                      type="button"
                      aria-label={copied ? "Address copied" : "Copy wallet address"}
                      onClick={() => {
                        void navigator.clipboard.writeText(fullAddress);
                        setCopied(true);
                      }}
                      className={cn(
                        "group z-20 flex h-8 w-fit max-w-[min(100%,14rem)] shrink-0 items-center gap-1 rounded-[var(--radius-sm)] border border-transparent bg-[rgba(255,255,255,0.03)] py-0 pl-3 pr-2 font-mono text-[13px] font-medium tabular-nums text-[var(--color-text-muted)] outline-none transition-[background-color,color,border-color] duration-200",
                        "hover:bg-[rgba(255,255,255,0.05)] hover:text-white",
                        "isolate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25"
                      )}
                    >
                      <span className="pointer-events-none min-w-0 max-w-[10rem] truncate text-left sm:max-w-[12.5rem]">
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
                            className="pointer-events-none h-3.5 w-3.5 shrink-0 text-current"
                            strokeWidth={2}
                            aria-hidden
                          />
                        )}
                      </span>
                    </button>
                  ) : null}

                  <DialogClose asChild>
                    <button
                      type="button"
                      className={cn(
                        "inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-transparent bg-[rgba(255,255,255,0.03)] p-0 text-[var(--color-text-muted)] outline-none transition-[background-color,color,border-color] duration-200",
                        "hover:bg-[rgba(255,255,255,0.05)] hover:text-white",
                        "isolate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25"
                      )}
                      aria-label="Close"
                    >
                      <X className="pointer-events-none h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                    </button>
                  </DialogClose>
                </div>
              </div>
            </motion.div>

            <motion.div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-0 pb-2 scroll-gutter-stable"
              variants={cascadeVariants}
              style={{
                maskImage:
                  "linear-gradient(to bottom, black 0, black calc(100% - 2.5rem), transparent 100%)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, black 0, black calc(100% - 2.5rem), transparent 100%)",
              }}
            >
              <div className="flex w-full max-w-full flex-col gap-4 [overflow-anchor:none] lg:gap-5">
                <motion.div className="shrink-0 [overflow-anchor:none]" variants={cascadeVariants}>
                  <div className="space-y-4 [overflow-anchor:none] pl-3 pt-0 lg:space-y-5">
                    <div className="grid grid-cols-1 gap-y-3 lg:grid-cols-[auto_1fr] lg:items-start lg:gap-x-3 lg:gap-y-4">
                      <span className="block text-sm text-white/70 font-medium lg:row-start-1 lg:col-start-1">
                        Manage your token holdings
                      </span>

                      <div className="relative flex min-h-[40px] flex-wrap items-center justify-between gap-3 lg:col-span-2 lg:col-start-1 lg:row-start-2">
                        <div
                          className={cn(
                            "flex flex-wrap items-center gap-1.5 lg:gap-2",
                            isSearchExpanded ? "hidden sm:flex" : "flex"
                          )}
                        >
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
                                <ChevronDown className="h-3.5 w-3.5 shrink-0 sm:h-[15px] sm:w-[15px]" aria-hidden />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" sideOffset={6} className={WALLET_GLASS_MENU_CONTENT}>
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
                              <DropdownMenuContent align="end" sideOffset={6} className={WALLET_GLASS_MENU_CONTENT}>
                                {ASSETS_SORT_MENU.map((opt, index) => {
                                  const selected = sort === opt.key;
                                  const arrow = opt.dir === "down" ? "↓" : "↑";
                                  const rowSpacing = walletGlassMenuItemRowSpacing(
                                    index,
                                    ASSETS_SORT_MENU.length
                                  );
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
                                        {selected ? (
                                          <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                                        ) : null}
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
                        </div>

                        <div
                          className={cn(
                            "ml-auto flex items-center gap-2",
                            isSearchExpanded ? "w-full sm:w-auto" : "w-auto"
                          )}
                        >
                          {isSearchExpanded && (
                            <div className="relative flex w-full items-center gap-2 sm:hidden">
                              <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-[var(--color-text-muted)]" />
                                <input
                                  autoFocus
                                  type="text"
                                  placeholder="Search..."
                                  value={query}
                                  onChange={(e) => setQuery(e.target.value)}
                                  className="h-9 w-full rounded-[var(--radius-sm)] border border-transparent pl-10 pr-4 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-border-input-focus)] focus:outline-none"
                                  style={{ backgroundColor: "rgba(255, 255, 255, 0.05)" }}
                                />
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="px-2"
                                onClick={() => {
                                  setIsSearchExpanded(false);
                                  setQuery("");
                                }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          )}

                          <div
                            className={cn(
                              "flex items-center gap-2",
                              isSearchExpanded ? "hidden sm:flex" : "flex"
                            )}
                          >
                            <div className="flex h-8 items-center justify-end">
                              {showClear && (
                                <button
                                  type="button"
                                  onClick={clearToolbarFilters}
                                  className="flex h-8 items-center gap-1 rounded-[var(--radius-sm)] border border-transparent bg-white/[0.04] px-3 py-1.5 text-sm text-white/65 backdrop-blur-[var(--glass-blur)] transition-[background-color,color] duration-200 hover:!bg-white/[0.055] hover:!text-white"
                                >
                                  <span className="hidden sm:inline">Clear all</span>
                                  <X className="h-4 w-4" />
                                </button>
                              )}
                            </div>

                            <div className="flex h-8 w-auto items-center justify-end sm:hidden">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-[var(--color-text-muted)]"
                                onClick={() => setIsSearchExpanded(true)}
                              >
                                <Search className="h-5 w-5" />
                              </Button>
                            </div>

                            <div className="relative hidden sm:block sm:w-36 lg:w-48 xl:w-56">
                              <Search className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 transform text-[var(--color-text-muted)]" />
                              <input
                                type="text"
                                placeholder="Search..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                className="h-8 w-full rounded-[var(--radius-sm)] border border-transparent pl-10 pr-4 text-sm text-[var(--color-text-primary)] backdrop-blur-[var(--glass-blur)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-border-input-focus)] focus:outline-none"
                                style={{ backgroundColor: "rgba(255, 255, 255, 0.05)" }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>

                <motion.div
                  className="w-full min-w-0 shrink-0 [overflow-anchor:none]"
                  variants={cascadeVariants}
                >
                  <div className="min-h-0 min-w-0 overflow-x-auto rounded-[var(--radius-table)] border border-[var(--color-border-table)] backdrop-blur-[var(--glass-blur)] [overflow-anchor:none] scrollbar-gutter-stable">
                    <table className="w-full caption-bottom table-fixed text-sm">
                      <colgroup>
                        <col style={{ width: "24%" }} />
                        <col style={{ width: "22%" }} />
                        <col style={{ width: "19%" }} />
                        <col style={{ width: "13%" }} />
                        <col style={{ width: "14%" }} />
                        <col style={{ width: "8%" }} />
                      </colgroup>
                      <TableHeader className="bg-[var(--table-header-bg)]">
                        <TableRow noHover>
                          <TableHead className="h-12 whitespace-nowrap pl-3 pr-4 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                            <div className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)_3.5rem] items-center gap-x-2">
                              <span className="size-8 shrink-0" aria-hidden />
                              <span className="min-w-0 truncate">Asset</span>
                              <span className="h-4 w-[3.5rem] shrink-0" aria-hidden />
                            </div>
                          </TableHead>
                          <TableHead className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                            Balance
                          </TableHead>
                          <TableHead className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                            Price
                          </TableHead>
                          <TableHead className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                            24h
                          </TableHead>
                          <TableHead className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                            MC
                          </TableHead>
                          <TableHead
                            scope="col"
                            className="whitespace-nowrap px-0 py-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"
                          >
                            <span className="sr-only">Actions</span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pageRows.length > 0 ? (
                          pageRows.map((row, rowIndex) => {
                            const stripe = (safePage * pageSize + rowIndex) % 2 === 1;
                            return (
                            <motion.tr
                              key={`${refreshCycle}-${row.key}`}
                              className="group/row !bg-transparent border-b border-[var(--color-border-table)] last:border-0 hover:bg-[var(--color-bg-hover)]"
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{
                                duration: 0.28,
                                ease: [0.33, 1, 0.68, 1],
                                delay: Math.min(0.28, rowIndex * 0.045),
                              }}
                            >
                              <TableCell
                                className={cn(
                                  "whitespace-nowrap py-4 pl-3 pr-4 align-middle font-medium",
                                  stripe ? "bg-[var(--table-row-alt-bg)]" : "bg-[var(--table-row-bg)]"
                                )}
                              >
                                <div className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)_3.5rem] items-center gap-x-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPinnedKeys((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(row.key)) next.delete(row.key);
                                        else next.add(row.key);
                                        return next;
                                      })
                                    }
                                    className="inline-flex size-8 shrink-0 items-center justify-center justify-self-center rounded-[10px] border border-transparent bg-transparent text-white/65 transition-[background-color,color] duration-200 hover:!bg-white/[0.055] hover:!text-white [&_svg]:transition-none"
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
                                  <span className="min-w-0 truncate font-medium" title={row.asset}>
                                    {row.asset}
                                  </span>
                                  <span
                                    className="shrink-0 truncate text-left text-xs font-normal tabular-nums text-[var(--color-text-muted)]"
                                    title={row.sym}
                                  >
                                    ({row.sym})
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "whitespace-nowrap p-4 align-middle tabular-nums",
                                  stripe ? "bg-[var(--table-row-alt-bg)]" : "bg-[var(--table-row-bg)]"
                                )}
                              >
                                {row.balance}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "whitespace-nowrap p-4 align-middle tabular-nums",
                                  stripe ? "bg-[var(--table-row-alt-bg)]" : "bg-[var(--table-row-bg)]"
                                )}
                              >
                                {row.price}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "whitespace-nowrap p-4 align-middle tabular-nums",
                                  stripe ? "bg-[var(--table-row-alt-bg)]" : "bg-[var(--table-row-bg)]",
                                  row.d24.startsWith("-") ? "text-rose-300/90" : "text-emerald-300/90"
                                )}
                              >
                                {row.d24}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "whitespace-nowrap p-4 align-middle tabular-nums text-[var(--color-text-muted)]",
                                  stripe ? "bg-[var(--table-row-alt-bg)]" : "bg-[var(--table-row-bg)]"
                                )}
                              >
                                {row.cap}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  "py-4 pl-1 pr-3 align-middle sm:pr-4",
                                  stripe ? "bg-[var(--table-row-alt-bg)]" : "bg-[var(--table-row-bg)]"
                                )}
                              >
                                <div className="flex w-full items-center justify-center">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        type="button"
                                        className={cn(
                                          "relative inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] leading-none",
                                          "text-[15px] font-semibold text-white/50 transition-[background-color,color] duration-200",
                                          "hover:!bg-white/[0.055] hover:!text-white [&_svg]:transition-none",
                                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
                                          "data-[state=open]:!bg-white/[0.055] data-[state=open]:!text-white"
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
                                    <DropdownMenuContent align="end" sideOffset={6} className={WALLET_GLASS_MENU_CONTENT}>
                                      {ASSET_ROW_OVERFLOW_MENU.map(({ label, Icon }, index) => {
                                        const rowSpacing = walletGlassMenuItemRowSpacing(
                                          index,
                                          ASSET_ROW_OVERFLOW_MENU.length
                                        );
                                        return (
                                          <DropdownMenuItem
                                            key={label}
                                            textValue={label}
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
                              </TableCell>
                            </motion.tr>
                            );
                          })
                        ) : (
                          <TableRow>
                            <TableCell
                              colSpan={6}
                              className="h-24 text-center text-[var(--color-text-muted)]"
                            >
                              {PAGINATION.noResults}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </table>
                  </div>
                </motion.div>

                <motion.div className="flex shrink-0 flex-col justify-start" variants={cascadeVariants}>
                  <Pagination
                    pagination={{
                      pageIndex: safePage,
                      pageSize,
                      totalItems: filtered.length,
                    }}
                    onPageChange={setPageIndex}
                    onPageSizeChange={(next) => {
                      setPageSize(next);
                      setPageIndex(0);
                    }}
                    pageSizeMenuSide="top"
                    pageSizes={[10, 20, 50, 100]}
                    showPageNumbers
                    visiblePageCount={5}
                    showingLabel={PAGINATION.showing}
                    toLabel={PAGINATION.to}
                    ofLabel={PAGINATION.of}
                    itemsLabel="assets"
                    previousLabel={PAGINATION.previous}
                    nextLabel={PAGINATION.next}
                  />
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
