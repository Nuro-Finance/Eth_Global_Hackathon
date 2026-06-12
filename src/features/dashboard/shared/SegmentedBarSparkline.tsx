"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Matches My Wallet top-asset pills (narrow strip): fixed pillar footprint + minimal gutter,
 * not `flex-1` (which blows up segment width on wide cards).
 */
const SEGMENT_COLUMN_PX = 3;
const SEGMENT_GAP_PX = 1;
const STEP_PX = SEGMENT_COLUMN_PX + SEGMENT_GAP_PX;

const SEGMENT_MIN_COUNT = 12;
const SEGMENT_MAX_COUNT = 180;

/** Card share band — primary token @ 75% */
const SEGMENT_DUAL_CARD = "color-mix(in srgb, var(--color-primary) 75%, transparent)";
/** Unfilled track — neutral (not primary-tinted). */
const SEGMENT_TRACK = "rgba(255,255,255,0.08)";

/** My Wallet chips: accent + neutral track. `dualPrimary`: filled band + gray remainder. `gradientPrimary`: filled pillars blend primary → white. */
export type SegmentedBarVariant = "accent" | "dualPrimary" | "gradientPrimary";

/**
 * Segmented strip used by My Wallet `TopAssetCard` — fixed pillar footprint (3×1 step); pillar height defaults to 10px (`pillarHeightPx`).
 * pillar count scales with measured width (`ResizeObserver`) so wide cards get more pillars, not wider pillars.
 */
export function SegmentedBarSparkline({
  fillRatio,
  activeColor,
  variant = "accent",
  className,
  /** Default 10px pillars; use 8 for tighter hero tiles. */
  pillarHeightPx = 10,
}: {
  fillRatio: number;
  activeColor?: string;
  variant?: SegmentedBarVariant;
  className?: string;
  pillarHeightPx?: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [segmentCount, setSegmentCount] = useState(SEGMENT_MIN_COUNT);

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const update = () => {
      const w = el.getBoundingClientRect().width;
      if (w <= 2) return;
      const n = Math.floor((w + SEGMENT_GAP_PX) / STEP_PX);
      setSegmentCount(Math.max(SEGMENT_MIN_COUNT, Math.min(SEGMENT_MAX_COUNT, n)));
    };

    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const filled = Math.round(Math.min(1, Math.max(0, fillRatio)) * segmentCount);

  const gapCls = SEGMENT_GAP_PX === 1 ? "gap-px" : `gap-[${SEGMENT_GAP_PX}px]`;

  return (
    <div ref={hostRef} className={cn("flex w-full min-w-0 items-end overflow-hidden", gapCls, className)} aria-hidden>
      {Array.from({ length: segmentCount }, (_, i) => {
        const on = i < filled;
        let backgroundColor: string;
        if (variant === "dualPrimary") {
          backgroundColor = on ? SEGMENT_DUAL_CARD : SEGMENT_TRACK;
        } else if (variant === "gradientPrimary") {
          if (!on) {
            backgroundColor = SEGMENT_TRACK;
          } else if (filled <= 1) {
            backgroundColor = "var(--color-primary)";
          } else {
            const t = i / (filled - 1);
            const primaryPct = Math.round((1 - t) * 100);
            backgroundColor = `color-mix(in oklab, var(--color-primary) ${primaryPct}%, white ${100 - primaryPct}%)`;
          }
        } else {
          backgroundColor = on ? (activeColor ?? "var(--color-primary)") : SEGMENT_TRACK;
        }
        return (
          <span
            key={i}
            className="shrink-0 rounded-[3px]"
            style={{
              height: pillarHeightPx,
              minHeight: pillarHeightPx,
              width: SEGMENT_COLUMN_PX,
              minWidth: SEGMENT_COLUMN_PX,
              backgroundColor,
            }}
          />
        );
      })}
    </div>
  );
}
