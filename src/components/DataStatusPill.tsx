"use client";

import { cn } from "@/lib/utils";
import type { DataState } from "@/lib/dataState";
import { formatRelativeTimeFromNow } from "@/lib/dataState";

type Size = "sm" | "md";
type Variant = "pill" | "toolbar";

const STATUS_LABEL: Record<DataState["status"], string> = {
  idle: "Idle",
  loading: "Loading",
  refreshing: "Syncing",
  success: "Live",
  stale: "Stale",
  error: "Error",
  offline: "Offline",
};

export function DataStatusPill({
  state,
  size = "sm",
  variant = "pill",
  className,
  showTime = true,
  showStatusLabel = true,
}: {
  state: DataState;
  size?: Size;
  variant?: Variant;
  className?: string;
  showTime?: boolean;
  showStatusLabel?: boolean;
}) {
  const time =
    showTime && (state.status === "success" || state.status === "stale")
      ? formatRelativeTimeFromNow(state.meta?.lastUpdatedAt)
      : null;

  /** Live • just now — label and time: white @ 80%; success separator dot: green @ 80%. */
  const timedSegmentTone = time ? "opacity-80" : "";
  const timedSeparatorTone =
    time && state.status === "success" ? "text-[var(--color-success)] opacity-80" : timedSegmentTone;

  const base =
    variant === "pill"
      ? "inline-flex items-center rounded-full border text-[var(--color-text-muted)]"
      : "inline-flex items-center rounded-[10px] border text-[var(--color-text-muted)]";
  const sizes =
    variant === "toolbar"
      ? "h-10 px-3 text-[12px]"
      : size === "sm"
        ? "h-6 px-2.5 text-[11px]"
        : "h-7 px-3 text-[12px]";

  const toolbarTextTone =
    state.status === "error"
      ? "text-[var(--color-error)]"
      : state.status === "stale"
        ? "text-[var(--color-warning)]"
        : state.status === "success"
          ? "text-[var(--color-text-primary)]"
          : "text-[var(--color-text-muted)]";

  const tone =
    variant === "toolbar"
      ? cn("border-none bg-[var(--color-bg-secondary)]", toolbarTextTone)
      : state.status === "error"
        ? "border-[var(--color-error)]/25 text-[var(--color-error)] bg-[var(--color-error)]/8"
        : state.status === "offline"
          ? "border-[var(--color-border-tertiary)] text-[var(--color-text-muted)] bg-[var(--color-bg-input)]"
          : state.status === "stale"
            ? "border-[var(--color-warning)]/25 text-[var(--color-warning)] bg-[var(--color-warning)]/8"
            : state.status === "success"
              ? "border-0 text-[var(--color-text-primary)] bg-white/[0.04]"
              : state.status === "loading" || state.status === "refreshing"
                ? "border-[var(--color-primary)]/18 text-[var(--color-text-muted)] bg-[var(--color-primary)]/5"
                : "border-[var(--color-border-input)] bg-[var(--color-bg-input)]";

  return (
    <span className={cn(base, sizes, tone, className)} aria-live="polite">
      {showStatusLabel && (
        <span className={cn("font-medium", timedSegmentTone)}>{STATUS_LABEL[state.status]}</span>
      )}
      {showStatusLabel && time && <span className={cn("ms-1.5", timedSeparatorTone)}>•</span>}
      {time && <span className={cn(showStatusLabel && "ms-1.5", timedSegmentTone)}>{time}</span>}
    </span>
  );
}

export default DataStatusPill;

