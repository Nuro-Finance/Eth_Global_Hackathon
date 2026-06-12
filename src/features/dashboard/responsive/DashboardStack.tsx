"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DASHBOARD_PASS_B_GUTTER_CLASS } from "./constants";

type DashboardStackProps = {
  children: ReactNode;
  className?: string;
};

/** sm tier (below Tailwind `md`): single column, fixed slot order in JSX. */
export function DashboardStack({ children, className }: DashboardStackProps) {
  return (
    <div
      className={cn(
        "flex min-h-0 w-full min-w-0 flex-col",
        DASHBOARD_PASS_B_GUTTER_CLASS,
        className,
      )}
    >
      {children}
    </div>
  );
}
