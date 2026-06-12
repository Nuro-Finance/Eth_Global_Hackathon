"use client";

import { cn } from "@/lib/utils";

export function SkeletonBlock({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[10px] bg-[var(--color-bg-input)]",
        className
      )}
      aria-hidden="true"
    />
  );
}

export default SkeletonBlock;

