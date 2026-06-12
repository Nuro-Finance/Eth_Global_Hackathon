"use client";

import { ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { WalletSkeletonText } from "@/features/dashboard/my-wallet/WalletDataSkeletons";

interface StatCardContentProps {
  title: string;
  value: string | number;
  change?: number;
  isPositive?: boolean;
  icon?: ReactNode;
  showChange?: boolean;
  isDraggable?: boolean;
  isLoading?: boolean;
}

/**
 * StatCardContent - Inner content of a stat card
 * Separated for reuse in both regular and overlay versions
 */
export function StatCardContent({
  title,
  value,
  change,
  isPositive = true,
  icon,
  showChange = true,
  isDraggable = true,
  isLoading = false,
}: StatCardContentProps) {
  return (
    <div className="relative h-full flex flex-col">
      {/* Header with icon, title, and drag handle */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          {/* Icon in rounded box */}
          {icon && (
            <div className="flex shrink-0 items-center justify-center h-8 w-8 rounded-[10px] bg-[var(--color-bg-tertiary)] dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] text-[var(--color-text-muted)]">
              <div className="[&>svg]:w-4 [&>svg]:h-4">{icon}</div>
            </div>
          )}
          <h3 className="text-[var(--color-text-muted)] text-[13px] font-medium leading-tight">
            {title}
          </h3>
        </div>

        {/* Drag handle */}
        {isDraggable && (
          <div className="text-[var(--color-text-muted)]/50">
            <GripVertical className="w-4 h-4" />
          </div>
        )}
      </div>

      {/* Value */}
      <div className="flex-1 flex items-end justify-between">
        {isLoading ? (
          <span role="status" aria-label="Loading" className="min-h-[1.625rem] lg:min-h-[1.75rem]">
            <WalletSkeletonText className="text-[22px] lg:text-[26px] font-semibold leading-tight tabular-nums">
              {value}
            </WalletSkeletonText>
          </span>
        ) : (
          <span className="text-[var(--color-text-primary)] text-[22px] lg:text-[26px] font-semibold leading-tight tabular-nums">
            {value}
          </span>
        )}

        {/* Change indicator */}
        {showChange && change !== undefined && (
          <span
            className={`text-[12px] font-medium ${
              isPositive ? "text-[var(--color-success)]" : "text-[var(--color-error)]"
            }`}
          >
            {isPositive ? "+" : ""}
            {change}%
          </span>
        )}
      </div>

      {/* Large decorative icon: vertically centered, sized to clear the top-right drag handle */}
      {icon && (
        <div className="absolute top-1/2 right-0 -translate-y-1/2 text-[var(--color-text-muted)] opacity-5 dark:opacity-10 pointer-events-none">
          <div className="[&>svg]:w-10 [&>svg]:h-10">{icon}</div>
        </div>
      )}
    </div>
  );
}
