"use client";

import { ReactNode } from "react";

export interface SummaryStatItemProps {
  /** The main value to display */
  value: string | number | ReactNode;
  /** Label text below the value */
  label: string;
  /** Optional direction for the value (for RTL support) */
  valueDir?: "ltr" | "rtl" | "auto";
  /** Additional className for the container */
  className?: string;
  /** Additional className for the value */
  valueClassName?: string;
  /** Additional className for the label */
  labelClassName?: string;
}

/**
 * Reusable summary stat item for displaying a value with a label
 * Used in chart summaries, statistics panels, etc.
 */
export function SummaryStatItem({
  value,
  label,
  valueDir,
  className = "",
  valueClassName = "",
  labelClassName = "",
}: SummaryStatItemProps) {
  return (
    <div className={`text-center ${className}`}>
      <div
        dir={valueDir}
        className={`text-[var(--color-text-primary)] text-[14px] sm:text-[16px] font-medium ${valueClassName}`}
      >
        {value}
      </div>
      <div
        className={`text-[var(--color-text-muted)] text-[10px] sm:text-[11px] ${labelClassName}`}
      >
        {label}
      </div>
    </div>
  );
}

export default SummaryStatItem;
