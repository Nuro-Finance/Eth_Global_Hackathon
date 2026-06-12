"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DASHBOARD_PASS_B_GUTTER_CLASS } from "./constants";

type DashboardGrid12Props = {
  children: ReactNode;
  className?: string;
};

/** Wide tier (xl+): 12-column page grid. Slots use `xl:col-span-*` / `xl:row-start-*`. */
export function DashboardGrid12({ children, className }: DashboardGrid12Props) {
  return (
    <div
      className={cn(
        "grid min-h-0 w-full min-w-0 grid-cols-1",
        DASHBOARD_PASS_B_GUTTER_CLASS,
        "xl:grid-cols-12 xl:items-start",
        className,
      )}
    >
      {children}
    </div>
  );
}
