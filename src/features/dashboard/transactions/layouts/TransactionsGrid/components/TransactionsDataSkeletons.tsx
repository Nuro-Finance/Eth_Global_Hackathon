"use client";

import { cn } from "@/lib/utils";
import { WalletSkeletonText } from "@/features/dashboard/my-wallet/WalletDataSkeletons";

const WIDGET_SHELL =
  "bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] glass-card-inner rounded-[20px] border-none overflow-hidden";

const SKEL_BAR = "animate-pulse rounded-[6px] bg-white/[0.08]";

/** Matches `PreviewRow` (`py-2.5`, `h-10` icon, two text lines, amount). */
function PreviewRowSkeleton() {
  return (
    <div className="flex w-full items-center gap-3 px-2 py-2.5" aria-hidden>
      <span className={cn(SKEL_BAR, "h-10 w-10 shrink-0 rounded-[12px]")} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <span className={cn(SKEL_BAR, "block h-[14px] w-[62%] max-w-[9.5rem]")} />
        <span className={cn(SKEL_BAR, "block h-[12px] w-16")} />
      </div>
      <span className={cn(SKEL_BAR, "h-[14px] w-14 shrink-0")} />
    </div>
  );
}

/** In-place refresh veil — same row count as live data (no extra skeleton rows). */
export function TransactionsPreviewColumnBusyVeil({
  title,
  rowCount,
}: {
  title: string;
  rowCount: number;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[1] flex flex-col rounded-[inherit] bg-[var(--color-bg-secondary)]/85 p-4 dark:bg-[var(--color-bg-glass)]/90 sm:p-5"
      aria-busy="true"
      aria-hidden
    >
      <WalletSkeletonText className="mb-3 block text-[15px] font-semibold sm:text-[16px]">
        {title}
      </WalletSkeletonText>
      <div className="flex flex-1 flex-col gap-0.5">
        {rowCount > 0 ? (
          Array.from({ length: rowCount }, (_, i) => <PreviewRowSkeleton key={i} />)
        ) : (
          <span className={cn(SKEL_BAR, "mx-auto my-6 block h-4 w-36")} />
        )}
      </div>
    </div>
  );
}

/** Flat veil over the table block — no extra borders (avoids faux outer stroke). */
export function TransactionsTableBusyOverlay() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[2] animate-pulse rounded-[inherit] bg-[var(--color-bg-card)]/70 dark:bg-[var(--color-bg-secondary)]/75"
      aria-hidden
    />
  );
}
