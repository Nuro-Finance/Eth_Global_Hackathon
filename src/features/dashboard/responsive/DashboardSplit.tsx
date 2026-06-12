"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DASHBOARD_PASS_B_GUTTER_CLASS } from "./constants";

type DashboardSplitProps = {
  children: ReactNode;
  className?: string;
};

/** Wide tier (xl+): primary / secondary columns (e.g. My Wallet). */
export function DashboardSplit({ children, className }: DashboardSplitProps) {
  return (
    <div
      className={cn(
        "grid min-h-0 w-full min-w-0 grid-cols-1",
        DASHBOARD_PASS_B_GUTTER_CLASS,
        "xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start",
        className,
      )}
    >
      {children}
    </div>
  );
}
