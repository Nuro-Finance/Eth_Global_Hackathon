"use client";

import { useState } from "react";
import { IconArrowUpRight, IconArrowDownLeft } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

interface TransactionItemProps {
  name: string;
  type: string;
  amount: string;
  isIncoming: boolean;
}

/**
 * Individual transaction item display
 */
export function TransactionItem({
  name,
  type,
  amount,
  isIncoming,
}: TransactionItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div 
      className="flex items-center gap-2 sm:gap-3 py-2.5 sm:py-3 px-2.5 sm:px-3 -mx-2.5 sm:-mx-3 rounded-[13px] cursor-pointer transition-all duration-200 active:scale-[0.98]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ 
        backgroundColor: isHovered ? 'rgba(255, 255, 255, 0.03)' : undefined 
      }}
    >
      <div className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[var(--color-bg-input)] p-1.5 sm:h-10 sm:w-10 sm:p-2",
        isIncoming ? "text-[var(--color-success)]" : "text-[var(--color-error)]"
      )}>
        {isIncoming ? (
          <IconArrowDownLeft
            className="w-4 h-4 sm:w-5 sm:h-5 rtl:scale-x-[-1]"
            stroke={2}
          />
        ) : (
          <IconArrowUpRight
            className="w-4 h-4 sm:w-5 sm:h-5 rtl:scale-x-[-1]"
            stroke={2}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[var(--color-text-primary)] text-[13px] sm:text-[14px] font-medium truncate">
          {name}
        </div>
        <div className="text-[var(--color-text-muted)] text-[11px] sm:text-[12px] font-normal">
          {type}
        </div>
      </div>
      <div
        className={`text-[13px] sm:text-[15px] font-medium whitespace-nowrap ${
          isIncoming
            ? "text-[var(--color-success)]"
            : "text-[var(--color-text-primary)]"
        }`}
      >
        {isIncoming ? "+" : "-"}
        {amount}{" "}
        <span className="text-[10px] sm:text-[11px] opacity-80">USD</span>
      </div>
    </div>
  );
}
