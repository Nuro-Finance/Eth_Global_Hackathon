"use client";

import { cn } from "@/lib/utils";

const walletWidgetSurface = cn(
  "bg-[var(--color-bg-card)] dark:bg-[var(--color-bg-card)] dark:backdrop-blur-[var(--widget-blur)] glass-card-inner rounded-[var(--radius-card)] sm:rounded-[var(--radius-xl)]"
);

const walletSkeletonBar = "animate-pulse rounded-[10px] bg-white/[0.08]";

/** Matches `text-3xl sm:text-4xl md:text-5xl` + `leading-[1.05]` on the balance headline. */
export const WALLET_BALANCE_AMOUNT_MIN_H =
  "min-h-[1.96875rem] sm:min-h-[2.3625rem] md:min-h-[3.15rem]";

/** Matches asset table body rows (`py-3.5` + single `text-sm` line / `h-7` star control). */
export const WALLET_ASSET_TABLE_ROW_MIN_H = "min-h-[3.5rem]";

/** Matches recent-activity rows (`py-3.5` + `text-sm` title + `text-xs` meta). */
export const WALLET_ACTIVITY_ROW_MIN_H = "min-h-[4.125rem]";

const SPARKLINE_SEGMENTS = 40;

function Skel({ className }: { className?: string }) {
  return <span className={cn(walletSkeletonBar, "block", className)} aria-hidden />;
}

/**
 * Pulse overlay that keeps the exact glyph box of the underlying text — zero layout shift.
 */
export function WalletSkeletonText({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={cn(
        "animate-pulse rounded-[10px] bg-white/[0.08] text-transparent",
        className,
        "!text-transparent",
      )}
      style={style}
    >
      {children}
    </span>
  );
}

function WalletSparklineSkeleton() {
  return (
    <div className="mt-0 flex w-full items-end justify-between gap-[2px]" aria-hidden>
      {Array.from({ length: SPARKLINE_SEGMENTS }, (_, i) => (
        <span key={i} className={cn(walletSkeletonBar, "h-[10px] min-w-0 flex-1 rounded-[3px]")} />
      ))}
    </div>
  );
}

/** Balance headline placeholder — same slot height as formatted USD. */
export function WalletBalanceAmountSkeleton({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading balance"
      className={cn("block w-full max-w-[14rem] sm:max-w-[16rem] md:max-w-[18rem]", WALLET_BALANCE_AMOUNT_MIN_H, className)}
    >
      <Skel className="h-[1.96875rem] w-[11rem] sm:h-[2.3625rem] sm:w-[13rem] md:h-[3.15rem] md:w-[15rem]" />
    </span>
  );
}

/** Top asset card — mirrors `TopAssetCard` spacing (`gap-3`, `space-y-0.5`, sparkline). */
export function WalletTopAssetCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn(walletWidgetSurface, "flex flex-col gap-3 px-4 py-3 sm:px-5 sm:py-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Skel className="h-5 w-[72%] max-w-[9.5rem]" />
        </div>
        <span className="inline-flex h-[1.375rem] w-[1.375rem] shrink-0 items-center justify-center" aria-hidden>
          <Skel className="h-3.5 w-3.5 rounded-md" />
        </span>
      </div>
      <div className="space-y-0.5">
        <Skel className="h-7 w-24" />
        <Skel className="h-4 w-20" />
      </div>
      <WalletSparklineSkeleton />
    </div>
  );
}

function WalletAssetsTableSkeletonRow({ index }: { index: number }) {
  return (
    <tr className={index % 2 === 1 ? "bg-white/[0.02]" : undefined}>
      <td className="py-3.5 pl-6 pr-5 font-medium sm:pl-7 sm:pr-6">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="inline-flex h-7 w-7 shrink-0 items-center justify-start rounded-md pl-0"
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate">
            <Skel className="inline-block h-[1.25rem] w-[5.5rem] max-w-full align-middle" />
          </span>
          <span className="shrink-0 font-normal text-[var(--color-text-muted)]">
            <Skel className="inline-block h-[1.25rem] w-10 align-middle" />
          </span>
        </div>
      </td>
      <td className="truncate px-4 py-3.5 font-medium tabular-nums text-[var(--color-text-primary)] sm:px-5">
        <Skel className="inline-block h-[1.25rem] w-16 align-middle" />
      </td>
      <td className="truncate px-4 py-3.5 tabular-nums sm:px-5">
        <Skel className="inline-block h-[1.25rem] w-14 align-middle" />
      </td>
      <td className="whitespace-nowrap px-3 py-3.5 tabular-nums sm:px-4">
        <Skel className="inline-block h-[1.25rem] w-10 align-middle" />
      </td>
      <td className="truncate px-4 py-3.5 pl-4 pr-2 tabular-nums text-[var(--color-text-muted)] sm:pl-5 sm:pr-2.5">
        <Skel className="inline-block h-[1.25rem] w-12 align-middle" />
      </td>
      <td className="py-3.5 pl-1 pr-4 sm:pr-5">
        <div className="flex w-full items-center justify-center">
          <span
            className="relative inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)]"
            aria-hidden
          />
        </div>
      </td>
    </tr>
  );
}

export function WalletAssetsTableSkeletonBody({ rowCount }: { rowCount: number }) {
  const n = Math.max(1, rowCount);
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <WalletAssetsTableSkeletonRow key={i} index={i} />
      ))}
    </>
  );
}

function WalletRecentActivitySkeletonRow({ index }: { index: number }) {
  return (
    <tr className={index % 2 === 1 ? "bg-white/[0.02]" : undefined}>
      <td className="py-3.5 pl-6 pr-4 align-top sm:pl-7">
        <p className="truncate font-medium">
          <Skel className="inline-block h-[1.25rem] w-[10rem] max-w-full align-middle" />
        </p>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
          <Skel className="inline-block h-4 w-28 align-middle" />
        </p>
      </td>
      <td className="py-3.5 pl-2 pr-6 text-right align-top sm:pr-7">
        <p className="text-xs font-semibold tabular-nums text-[var(--color-text-primary)]">
          <Skel className="ml-auto inline-block h-4 w-16 align-middle" />
        </p>
        <p className="mt-0.5 text-xs tabular-nums text-[var(--color-text-muted)]">
          <Skel className="ml-auto inline-block h-4 w-12 align-middle" />
        </p>
      </td>
    </tr>
  );
}

export function WalletRecentActivitySkeletonBody({ rowCount }: { rowCount: number }) {
  const n = Math.max(1, rowCount);
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <WalletRecentActivitySkeletonRow key={i} index={i} />
      ))}
    </>
  );
}
