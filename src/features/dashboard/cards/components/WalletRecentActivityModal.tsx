"use client";

import {
  cloneElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { FULL_MODAL_OVERLAY_CLASS } from "@/components/ui/modalPresets";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  WALLET_GLASS_MENU_CONTENT,
  walletGlassMenuItemRowSpacing,
} from "@/lib/walletGlassMenu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { LucideIcon } from "lucide-react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  Copy,
  Globe,
  RefreshCw,
  Search,
  X,
} from "lucide-react";

/** Pill filters map to these kinds; `other` is only visible when no pill is selected. */
export type WalletRecentActivityKind = "swap" | "sent" | "received" | "other";

/** Matches transactions table status pills ({@link useTableColumns} `getStatusBadge`). */
export type WalletRecentActivityStatus = "completed" | "pending" | "cancelled";

export type WalletRecentActivityModalRow = {
  key: string;
  title: string;
  meta: string;
 /** Full `0x…` hash; shown truncated in the table. */
  txid: string;
  amount: string;
 /** When set (e.g. native ETH/SOL), shown under `amount` using the same typography as `meta`. */
  amountUsd?: string;
  kind: WalletRecentActivityKind;
  status: WalletRecentActivityStatus;
 /** Local calendar day `YYYY-MM-DD` (reserved for future filtering). */
  eventDate: string;
};

const PAGINATION = {
  noResults: "No results found.",
  showing: "Showing",
  to: "to",
  of: "of",
  previous: "Previous",
  next: "Next",
} as const;

const RECENT_ACTIVITY_ROW_OVERFLOW_MENU: {
  label: string;
  Icon: LucideIcon;
  action: "copy" | "scanner";
}[] = [
  { label: "Transaction ID", Icon: Copy, action: "copy" },
  { label: "Block Scanner", Icon: Globe, action: "scanner" },
];

function openInNewTab(url?: string) {
  const target = (url ?? "").trim() || "about:blank";
  window.open(target, "_blank", "noopener,noreferrer");
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

const QUICK_FILTER_KINDS = [
  { key: "swap" as const, label: "Swaps" },
  { key: "sent" as const, label: "Sent" },
  { key: "received" as const, label: "Received" },
];

/**
 * Maps row data to one of three visuals (matches transactions table: swap / inbound / outbound).
 * `other` uses amount sign when present so mixed activity still gets sent vs received arrows.
 */
function recentActivityEventVisual(
  kind: WalletRecentActivityKind,
  amount: string
): "swap" | "sent" | "received" {
  if (kind === "swap") return "swap";
  if (kind === "received") return "received";
  if (kind === "sent") return "sent";
  const t = amount.trim();
  if (t.startsWith("+")) return "received";
  return "sent";
}

/** Circle + icon - same pattern as {@link useTableColumns} transaction description cell (modal). */
function RecentActivityEventKindBadge({
  kind,
  amount,
}: {
  kind: WalletRecentActivityKind;
  amount: string;
}) {
  const visual = recentActivityEventVisual(kind, amount);
  const shell =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-white/5 sm:h-10 sm:w-10";
  const label = visual === "swap" ? "Swap" : visual === "received" ? "Received" : "Sent";
  if (visual === "swap") {
    return (
      <span className={shell} aria-label={label}>
        <ArrowLeftRight
          className="h-4 w-4 text-[var(--color-primary)] rtl:scale-x-[-1]"
          strokeWidth={2}
          aria-hidden
        />
      </span>
    );
  }
  if (visual === "received") {
    return (
      <span className={shell} aria-label={label}>
        <ArrowDownLeft
          className="h-4 w-4 text-[var(--color-success)] rtl:scale-x-[-1]"
          strokeWidth={2}
          aria-hidden
        />
      </span>
    );
  }
  return (
    <span className={shell} aria-label={label}>
      <ArrowUpRight className="h-4 w-4 text-[var(--color-error)] rtl:scale-x-[-1]" strokeWidth={2} aria-hidden />
    </span>
  );
}

function recentActivityStatusLabel(s: WalletRecentActivityStatus): string {
  if (s === "completed") return "Complete";
  if (s === "pending") return "Pending";
  return "Cancelled";
}

/** Status pills: green / yellow / red dots (Complete / Pending / Cancelled). */
function RecentActivityStatusBadge({ status }: { status: WalletRecentActivityStatus }) {
  const label = recentActivityStatusLabel(status);
  const dotClass = "h-1.5 w-1.5 shrink-0 rounded-full";
  const dot =
    status === "completed" ? (
      <span className={cn(dotClass, "bg-[var(--color-success)]")} aria-hidden />
    ) : status === "pending" ? (
      <span className={cn(dotClass, "bg-[var(--color-warning)]")} aria-hidden />
    ) : (
      <span className={cn(dotClass, "bg-[var(--color-error)]")} aria-hidden />
    );
  return (
    <Badge
      variant="plain"
      size="sm"
      className="inline-flex shrink-0 items-center justify-start gap-2 text-white/70 !border-transparent !hover:border-transparent"
      style={{ backgroundColor: "rgba(255, 255, 255, 0.05)" }}
    >
      {dot}
      {label}
    </Badge>
  );
}

/** Radix outside events are dispatched on `detail.originalEvent.target`; `event.target` is unreliable. */
function radixOutsideEventTarget(event: Event): Element | null {
  if ("detail" in event && event.detail && typeof event.detail === "object") {
    const original = (event.detail as { originalEvent?: Event }).originalEvent;
    const t = original?.target;
    if (t instanceof Element) return t;
  }
  const t = (event as Event).target;
  return t instanceof Element ? t : null;
}

function shouldIgnoreWalletRecentActivityDialogOutside(el: Element | null): boolean {
  if (!el) return false;
  return Boolean(
    el.closest("[data-radix-popper-content-wrapper]") ||
      el.closest("[data-radix-select-content]") ||
      el.closest("[data-radix-select-viewport]") ||
      el.closest('[role="listbox"]') ||
      el.closest("[data-radix-collection-item]")
  );
}

function truncateAddressMiddle(address: string, headChars = 6, tailChars = 4) {
  const a = address.trim();
  if (!a) return "";
  if (a.length <= headChars + tailChars + 1) return a;
  return `${a.slice(0, headChars)}…${a.slice(-tailChars)}`;
}

function truncateTxid(hash: string) {
  const h = hash.trim();
  if (!h) return "";
  if (h.length <= 14) return h;
  return `${h.slice(0, 8)}…${h.slice(-4)}`;
}

/** Ellipsis overflow control - same trigger + cell padding as {@link WalletAssetsModal} asset rows. */
function RecentActivityRowOverflowMenu({ row }: { row: WalletRecentActivityModalRow }) {
  return (
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
            aria-label={`More options for ${row.title}`}
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
          {RECENT_ACTIVITY_ROW_OVERFLOW_MENU.map(({ label, Icon, action }, index) => {
            const rowSpacing = walletGlassMenuItemRowSpacing(
              index,
              RECENT_ACTIVITY_ROW_OVERFLOW_MENU.length
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
                onSelect={() => {
                  if (action === "copy") void navigator.clipboard.writeText(row.txid);
                  if (action === "scanner") {
                    const base = (process.env.NEXT_PUBLIC_BLOCK_SCANNER_TX_BASE_URL ?? "").trim();
                    openInNewTab(base ? `${base}${row.txid}` : undefined);
                  }
                }}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-90" strokeWidth={2.25} aria-hidden />
                <span className="min-w-0 flex-1 text-left">{label}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * Radix Tooltip opens on focus; dialog autofocus lands on the first header control, so the label
 * flashes with no hover. Only honor `onOpenChange(true)` after pointer enter (capture).
 */
function HeaderActionTooltip({
  label,
  children,
  contentClassName,
}: {
  label: string;
  children: ReactElement<
    Record<string, unknown> & {
      onPointerEnter?: (e: ReactPointerEvent<HTMLElement>) => void;
      onPointerLeave?: (e: ReactPointerEvent<HTMLElement>) => void;
    }
  >;
  contentClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const pointerInsideRef = useRef(false);

  return (
    <Tooltip
      open={open}
      onOpenChange={(next) => {
        if (next && !pointerInsideRef.current) return;
        setOpen(next);
      }}
    >
      <TooltipTrigger asChild>
        {cloneElement(children, {
          onPointerEnter: (e: ReactPointerEvent<HTMLElement>) => {
            pointerInsideRef.current = true;
            children.props.onPointerEnter?.(e);
          },
          onPointerLeave: (e: ReactPointerEvent<HTMLElement>) => {
            pointerInsideRef.current = false;
            setOpen(false);
            children.props.onPointerLeave?.(e);
          },
        })}
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end" className={cn("z-[130]", contentClassName)}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Modal title row only (globe / refresh / wallet / x).
 * Toolbar Date, Search, Clear, and filter pills stay on their own styles - do not reuse this here.
 */
function RecentActivityModalHeaderActions({
  walletAddress,
  onRefresh,
}: {
  walletAddress: string;
  onRefresh?: () => void | Promise<void>;
}) {
  const fullAddress = walletAddress.trim();
  const shortAddress = truncateAddressMiddle(fullAddress);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

 /** Title row only: default `rgba(255,255,255,0.03)`, hover `rgba(255,255,255,0.05)`; dimmed text → white on hover. */
  const headerSquareBtn = cn(
    "inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-transparent bg-[rgba(255,255,255,0.03)] p-0 text-[var(--color-text-muted)] outline-none transition-[background-color,color,border-color] duration-200",
    "hover:bg-[rgba(255,255,255,0.05)] hover:text-white",
    "isolate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25"
  );

  useEffect(() => {
    setCopied(false);
  }, [fullAddress]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyAddress = useCallback(() => {
    if (!fullAddress) return;
    void navigator.clipboard.writeText(fullAddress);
    setCopied(true);
  }, [fullAddress]);

  return (
    <TooltipProvider delayDuration={400} skipDelayDuration={200}>
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <HeaderActionTooltip label="Block Scanner">
          <button
            type="button"
            className={headerSquareBtn}
            aria-label="Block Scanner"
            onClick={() => {
              const base = (process.env.NEXT_PUBLIC_BLOCK_SCANNER_ADDRESS_BASE_URL ?? "").trim();
              openInNewTab(base && fullAddress ? `${base}${fullAddress}` : undefined);
            }}
          >
            <Globe className="pointer-events-none h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          </button>
        </HeaderActionTooltip>
        <HeaderActionTooltip label="Refresh">
          <button
            type="button"
            className={headerSquareBtn}
            aria-label="Refresh"
            disabled={refreshing}
            onClick={async () => {
              if (refreshing) return;
              if (!onRefresh) return;
              setRefreshing(true);
              try {
 // Make the spinner perceptible, even if refresh resolves instantly.
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
        </HeaderActionTooltip>
        {fullAddress ? (
          <button
            type="button"
            aria-label={copied ? "Address copied" : "Copy wallet address"}
            onClick={copyAddress}
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
          <button type="button" className={headerSquareBtn} aria-label="Close">
            <X className="pointer-events-none h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          </button>
        </DialogClose>
      </div>
    </TooltipProvider>
  );
}

export interface WalletRecentActivityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle: string;
  rows: readonly WalletRecentActivityModalRow[];
 /** Shown in header: globe → refresh → copy chip → close (chip omitted if empty). */
  walletAddress?: string;
 /** Refreshes rows without closing the modal or reloading the page. */
  onRefresh?: () => void | Promise<void>;
}

/**
 * Full-screen recent activity list - same glass dialog shell, motion, toolbar, bordered table,
 * and pagination patterns as {@link WalletAssetsModal}.
 */
export function WalletRecentActivityModal({
  open,
  onOpenChange,
  title,
  subtitle,
  rows,
  walletAddress = "",
  onRefresh,
}: WalletRecentActivityModalProps) {
  const [refreshCycle, setRefreshCycle] = useState(0);
  const [query, setQuery] = useState("");
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [selectedKinds, setSelectedKinds] = useState<Set<"swap" | "sent" | "received">>(new Set());
  const showClear = Boolean(query.trim() || selectedKinds.size > 0);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setPageIndex(0);
      setIsSearchExpanded(false);
      setSelectedKinds(new Set());
    }
  }, [open]);

  useEffect(() => {
    setPageIndex(0);
  }, [query, pageSize, rows, selectedKinds]);

  const toggleKind = (key: "swap" | "sent" | "received") => {
    setSelectedKinds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filtered = useMemo(() => {
    let list = [...rows];
    if (selectedKinds.size > 0) {
      list = list.filter(
        (r) => r.kind !== "other" && selectedKinds.has(r.kind)
      );
    }
    const q = query.trim().toLowerCase();
    if (!q.length) return list;
    return list.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.meta.toLowerCase().includes(q) ||
        r.amount.toLowerCase().includes(q) ||
        (r.amountUsd?.toLowerCase().includes(q) ?? false) ||
        r.txid.toLowerCase().includes(q) ||
        recentActivityStatusLabel(r.status).toLowerCase().includes(q)
    );
  }, [query, rows, selectedKinds]);

  const maxPage = Math.max(0, Math.ceil(filtered.length / pageSize) - 1);
  const safePage = Math.min(pageIndex, maxPage);
  const pageRows = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  useEffect(() => {
    setPageIndex((p) => Math.min(p, maxPage));
  }, [maxPage]);

  const handleRefresh = useCallback(async () => {
    setRefreshCycle((c) => c + 1);
    await onRefresh?.();
  }, [onRefresh]);

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
        onInteractOutside={(e) => {
          if (shouldIgnoreWalletRecentActivityDialogOutside(radixOutsideEventTarget(e))) {
            e.preventDefault();
          }
        }}
        onPointerDownOutside={(e) => {
          if (shouldIgnoreWalletRecentActivityDialogOutside(radixOutsideEventTarget(e))) {
            e.preventDefault();
          }
        }}
      >
        <div
          className="relative flex h-full w-full flex-col overflow-hidden !backdrop-blur-none rounded-[44px] border"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.04)",
            borderColor: "rgba(255, 255, 255, 0.03)",
            borderWidth: "1px",
            borderStyle: "solid",
          }}
        >
          <motion.div
            className="flex min-h-0 flex-1 flex-col"
            variants={layerVariants}
            initial="initial"
            animate="animate"
          >
            <motion.div className="shrink-0 px-4 pb-3 pt-6" variants={cascadeVariants}>
              <div className="flex min-w-0 items-center justify-between gap-3 pl-3 pr-3">
                <DialogTitle className="m-0 min-w-0 flex-1 truncate text-start text-2xl font-semibold leading-none tracking-tight text-[var(--color-text-primary)]">
                  {title}
                </DialogTitle>
            <RecentActivityModalHeaderActions walletAddress={walletAddress} onRefresh={handleRefresh} />
              </div>
            </motion.div>

            <motion.div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-0 scroll-gutter-stable"
              variants={cascadeVariants}
            >
              <div className="flex w-full max-w-full flex-col gap-4 [overflow-anchor:none] lg:gap-5">
                <motion.div className="shrink-0 [overflow-anchor:none]" variants={cascadeVariants}>
                  <div className="space-y-4 [overflow-anchor:none] pl-3 pr-3 pt-0 lg:space-y-5">
                    <div className="grid grid-cols-1 gap-y-3 lg:grid-cols-[auto_1fr] lg:items-start lg:gap-x-3 lg:gap-y-4">
                      <span className="block text-sm font-medium text-white/70 lg:col-start-1 lg:row-start-1">
                        {subtitle}
                      </span>

                      <div className="relative flex min-h-[40px] flex-wrap items-center justify-between gap-3 lg:col-span-2 lg:col-start-1 lg:row-start-2">
                        <div
                          className={cn(
                            "flex flex-wrap items-center gap-1.5 lg:gap-2",
                            isSearchExpanded ? "hidden sm:flex" : "flex"
                          )}
                        >
                          {QUICK_FILTER_KINDS.map((f) => {
                            const active = selectedKinds.has(f.key);
                            return (
                              <Badge
                                key={f.key}
                                variant="plain"
                                className={cn(
                                  "cursor-pointer text-xs px-3 lg:text-sm",
                                  active
                                    ? "border-transparent bg-[var(--filter-active-bg)] text-[var(--filter-active-text)] backdrop-blur-[var(--glass-blur)] transition-all duration-200 hover:bg-[var(--filter-active-bg-hover)]"
                                    : "isolate border-transparent bg-[rgba(255,255,255,0.03)] text-[var(--filter-text)] transition-[background-color,color] duration-200 hover:bg-[rgba(255,255,255,0.05)] hover:text-white"
                                )}
                                style={{ height: "32px" }}
                                onClick={() => toggleKind(f.key)}
                              >
                                {f.label}
                              </Badge>
                            );
                          })}
                        </div>

                        <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 sm:w-max sm:shrink-0 sm:gap-3">
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
                                  setSelectedKinds(new Set());
                                }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          )}

                          <div
                            className={cn(
                              "flex flex-wrap items-center justify-end gap-2",
                              isSearchExpanded ? "hidden sm:flex" : "flex"
                            )}
                          >
                            <div className="flex h-8 items-center justify-end">
                              {showClear && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setQuery("");
                                    setIsSearchExpanded(false);
                                    setSelectedKinds(new Set());
                                  }}
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
                  <div className="min-h-0 min-w-0 overflow-x-auto rounded-[var(--radius-table)] border border-[var(--color-border-table)] px-0 py-0 [overflow-anchor:none] scrollbar-gutter-stable">
                    <table className="w-full table-fixed caption-bottom text-sm">
                      <colgroup>
                        <col style={{ width: "34%" }} />
                        <col style={{ width: "26%" }} />
                        <col style={{ width: "14%" }} />
                        <col style={{ width: "18%" }} />
                        <col style={{ width: "8%" }} />
                      </colgroup>
                      <TableHeader className="bg-[var(--table-header-bg)]">
                        <TableRow noHover>
                          <TableHead className="h-12 min-w-0 whitespace-nowrap py-3 pl-4 pr-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] sm:pl-5 sm:pr-3">
                            Event
                          </TableHead>
                          <TableHead className="h-12 min-w-0 whitespace-nowrap py-3 pl-2 pr-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] sm:pl-3 sm:pr-3">
                            TXID
                          </TableHead>
                          <TableHead className="h-12 min-w-0 whitespace-nowrap py-3 pl-2 pr-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] sm:pl-3 sm:pr-3">
                            Status
                          </TableHead>
                          <TableHead className="h-12 min-w-0 whitespace-nowrap py-3 pl-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)] sm:pl-3 sm:pr-5">
                            Amount
                          </TableHead>
                          <TableHead
                            scope="col"
                            className="h-12 min-w-[2.75rem] whitespace-nowrap px-0 py-3 text-center text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]"
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
                                    "min-w-0 py-4 pl-4 pr-2 align-middle sm:pl-5 sm:pr-3",
                                    stripe ? "bg-[var(--table-row-alt-bg)]" : "bg-[var(--table-row-bg)]"
                                  )}
                                >
                                  <div className="flex min-w-0 items-center gap-3">
                                    <RecentActivityEventKindBadge kind={row.kind} amount={row.amount} />
                                    <div className="min-w-0 flex-1">
                                      <p
                                        className="truncate font-medium text-[var(--color-text-primary)]"
                                        title={row.title}
                                      >
                                        {row.title}
                                      </p>
                                      <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{row.meta}</p>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    "min-w-0 py-4 pl-2 pr-2 align-middle sm:pl-3 sm:pr-3",
                                    stripe ? "bg-[var(--table-row-alt-bg)]" : "bg-[var(--table-row-bg)]"
                                  )}
                                >
                                  <span
                                    className="block min-w-0 truncate font-mono text-xs tabular-nums text-[var(--color-text-muted)]"
                                    title={row.txid}
                                  >
                                    {truncateTxid(row.txid)}
                                  </span>
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    "min-w-0 whitespace-nowrap px-2 py-4 text-left align-middle sm:px-3",
                                    stripe ? "bg-[var(--table-row-alt-bg)]" : "bg-[var(--table-row-bg)]"
                                  )}
                                >
                                  <RecentActivityStatusBadge status={row.status} />
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    "min-w-0 py-4 pl-2 pr-4 text-right sm:pl-3 sm:pr-5",
                                    row.amountUsd ? "align-top" : "align-middle",
                                    stripe ? "bg-[var(--table-row-alt-bg)]" : "bg-[var(--table-row-bg)]"
                                  )}
                                >
                                  <div className="min-w-0 whitespace-nowrap text-xs font-semibold tabular-nums text-[var(--color-text-primary)]">
                                    {row.amount}
                                  </div>
                                  {row.amountUsd ? (
                                    <p className="mt-0.5 text-xs font-normal tabular-nums text-[var(--color-text-muted)]">
                                      {row.amountUsd}
                                    </p>
                                  ) : null}
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    "min-w-[2.75rem] py-4 pl-1 pr-3 align-middle sm:pr-4",
                                    stripe ? "bg-[var(--table-row-alt-bg)]" : "bg-[var(--table-row-bg)]"
                                  )}
                                >
                                  <RecentActivityRowOverflowMenu row={row} />
                                </TableCell>
                              </motion.tr>
                            );
                          })
                        ) : (
                          <TableRow>
                            <TableCell
                              colSpan={5}
                              className="h-24 px-4 py-6 text-center text-[var(--color-text-muted)] sm:px-5"
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
                    pageSizes={[10, 20, 50, 100]}
                    showPageNumbers
                    visiblePageCount={5}
                    showingLabel={PAGINATION.showing}
                    toLabel={PAGINATION.to}
                    ofLabel={PAGINATION.of}
                    itemsLabel="events"
                    previousLabel={PAGINATION.previous}
                    nextLabel={PAGINATION.next}
                  />
                </motion.div>
                {/* Extra scroll extent below pagination (not table styling) so the footer clears the fade mask */}
                <div className="pointer-events-none min-h-[5.5rem] shrink-0" aria-hidden />
              </div>
            </motion.div>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
