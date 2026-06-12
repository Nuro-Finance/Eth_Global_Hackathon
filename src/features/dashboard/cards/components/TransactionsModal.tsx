"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { FULL_MODAL_OVERLAY_CLASS } from "@/components/ui/modalPresets";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { TransactionsTable } from "@/features/dashboard/transactions";
import type { Transaction } from "@/features/dashboard/transactions/shared";

interface TransactionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  transactions: Transaction[];
  isLoading?: boolean;
  onTransactionSelect?: (transaction: Transaction) => void;
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

const SCROLL_BOTTOM_MASK_STYLE = {
  maskImage:
    "linear-gradient(to bottom, black 0, black calc(100% - 2.5rem), transparent 100%)",
  WebkitMaskImage:
    "linear-gradient(to bottom, black 0, black calc(100% - 2.5rem), transparent 100%)",
} as const;

/**
 * **Official transactions modal** for the dashboard.
 *
 * This is the canonical UI for card-scoped (or equivalent) transaction lists.
 * Other features must not introduce a parallel “transactions dialog” with its
 * own shell, spacing, or table chrome: reuse this component, or extract shared
 * pieces from here and keep them in lockstep.
 *
 * **Contract for parity elsewhere**
 * - Same glass shell, overlay preset, title row, and inner scroll region behavior
 * (including per-open shell height lock so the frame does not resize when
 * filters or search change).
 * - Render transactions via `TransactionsTable` with `variant="modal"` only, so
 * filters, search, pagination, and `DesktopTable` layout stay consistent.
 * - Follow the same design tokens and motion as implemented here; do not
 * one-off duplicate styling in alternate entry points.
 *
 * Current call sites import this module directly; new surfaces should do the same.
 */
export function TransactionsModal({
  open,
  onOpenChange,
  title,
  transactions,
  isLoading = false,
  onTransactionSelect,
}: TransactionsModalProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const scrollRegionRef = useRef<HTMLDivElement>(null);
  const scrollInnerMeasureRef = useRef<HTMLDivElement>(null);
  const [showBottomScrollFade, setShowBottomScrollFade] = useState(false);
 /** Once per open: freeze outer shell height so filters/search cannot shrink or grow the frame. */
  const [lockedShellHeightPx, setLockedShellHeightPx] = useState<number | null>(null);

  const syncScrollFade = useCallback(() => {
    const el = scrollRegionRef.current;
    if (!el) return;
    const needsScroll = el.scrollHeight > el.clientHeight + 1;
    setShowBottomScrollFade(needsScroll);
  }, []);

  useEffect(() => {
    if (!open) setLockedShellHeightPx(null);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || isLoading || lockedShellHeightPx !== null) return;
    let raf1 = 0;
    let raf2 = 0;
    let cancelled = false;

    const measure = () => {
      if (cancelled) return;
      const shell = shellRef.current;
      if (!shell) return;
      const h = Math.round(shell.getBoundingClientRect().height);
      if (h > 0) setLockedShellHeightPx(h);
    };

    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(measure);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [open, isLoading, lockedShellHeightPx]);

  useLayoutEffect(() => {
    if (!open) return;
    syncScrollFade();
  }, [open, transactions, isLoading, title, syncScrollFade]);

  useEffect(() => {
    if (!open) return;
    const outer = scrollRegionRef.current;
    const inner = scrollInnerMeasureRef.current;
    if (!outer || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => syncScrollFade());
    ro.observe(outer);
    if (inner) ro.observe(inner);
    window.addEventListener("resize", syncScrollFade);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncScrollFade);
    };
  }, [open, syncScrollFade]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={shellRef}
        hideClose
        overlayClassName={FULL_MODAL_OVERLAY_CLASS}
        className={cn(
          "notifications-full-dialog z-[110] flex min-h-0 flex-col gap-0 overflow-hidden p-[12px] w-[calc(100vw-2rem)] max-w-[920px] !rounded-[56px] backdrop-blur-md shadow-xl",
          lockedShellHeightPx == null
            ? "h-fit max-h-[min(85vh,40rem)]"
            : "min-h-0",
        )}
        style={{
          backgroundColor: "rgba(255, 255, 255, 0.02)",
          borderColor: "rgba(255, 255, 255, 0.03)",
          borderWidth: "1px",
          borderStyle: "solid",
          ...(lockedShellHeightPx != null
            ? {
                height: lockedShellHeightPx,
                minHeight: lockedShellHeightPx,
                maxHeight: lockedShellHeightPx,
              }
            : {}),
        }}
      >
        <div
          ref={scrollRegionRef}
          className={cn(
            "relative flex w-full min-w-0 flex-col overflow-y-auto overscroll-contain scroll-gutter-stable rounded-[44px] border !backdrop-blur-none",
            lockedShellHeightPx == null
              ? "max-h-[min(85vh,40rem)]"
              : "min-h-0 flex-1",
          )}
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.04)",
            borderColor: "rgba(255, 255, 255, 0.03)",
            borderWidth: "1px",
            borderStyle: "solid",
            ...(showBottomScrollFade ? SCROLL_BOTTOM_MASK_STYLE : {}),
          }}
        >
          <motion.div
            className="flex w-full min-w-0 shrink-0 flex-col"
            variants={layerVariants}
            initial="initial"
            animate="animate"
          >
            <motion.div className="shrink-0 px-4 pt-6 pb-3" variants={cascadeVariants}>
              <div className="flex items-center justify-between gap-3 pl-3 pr-3">
                <DialogTitle className="m-0 flex-1 text-start text-2xl font-semibold leading-none tracking-tight text-[var(--color-text-primary)]">
                  {title}
                </DialogTitle>
                <DialogClose asChild>
                  <button
                    type="button"
                    className={cn(
                      "shrink-0 w-8 h-8 p-1.5 flex items-center justify-center rounded-[10px] text-[var(--color-text-muted)] outline-none transition-all",
                      "hover:bg-white/5 hover:text-[var(--color-text-primary)]",
                      "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/25"
                    )}
                    aria-label="Close"
                  >
                    <X className="h-full w-full" strokeWidth={2} />
                  </button>
                </DialogClose>
              </div>
            </motion.div>

            <motion.div
              className="flex w-full min-w-0 shrink-0 flex-col px-4 pb-6 pt-0"
              variants={cascadeVariants}
            >
              <div ref={scrollInnerMeasureRef} className="min-w-0">
                <TransactionsTable
                  transactions={transactions}
                  isLoading={isLoading}
                  onTransactionSelect={onTransactionSelect}
                  variant="modal"
                />
              </div>
            </motion.div>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
