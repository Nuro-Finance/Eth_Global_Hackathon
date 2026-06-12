"use client";

import { ReactNode } from "react";

export interface ChartTooltipRowProps {
  /** Label text */
  label?: string;
  /** Value to display */
  value: string | number;
  /** Text color class or style */
  color?: string;
  /** Whether this is the title row */
  isTitle?: boolean;
}

export interface ChartTooltipProps {
  /** Whether the tooltip is active/visible */
  active?: boolean;
  /** Title text (usually the label/category) */
  title?: string;
  /** Array of rows to display in the tooltip */
  rows?: ChartTooltipRowProps[];
  /** Custom children to render inside tooltip */
  children?: ReactNode;
  /** Additional className for the container */
  className?: string;
}

/**
 * Tooltip row component for displaying label-value pairs
 */
export function ChartTooltipRow({
  label,
  value,
  color = "text-[var(--color-text-primary)]",
  isTitle = false,
}: ChartTooltipRowProps) {
  const textSize = isTitle ? "text-[13px] font-medium" : "text-[12px]";

  return (
    <div className={`${color} ${textSize} ${isTitle ? "mb-8" : ""}`}>
      {label ? `${label}: ${value}` : value}
    </div>
  );
}

/**
 * Shared Chart Tooltip component for consistent styling across all charts
 */
export function ChartTooltip({
  active,
  title,
  rows,
  children,
  className = "",
}: ChartTooltipProps) {
  if (!active) return null;

  return (
    <div
      className={`bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded-lg px-3 py-2 shadow-lg ${className}`}
    >
      {title && <ChartTooltipRow value={title} isTitle />}
      {rows?.map((row, index) => (
        <ChartTooltipRow key={index} {...row} />
      ))}
      {children}
    </div>
  );
}

export default ChartTooltip;
