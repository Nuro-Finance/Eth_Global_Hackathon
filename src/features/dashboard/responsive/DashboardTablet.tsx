"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DASHBOARD_PASS_B_GUTTER_CLASS } from "./constants";

type DashboardTabletProps = {
  children: ReactNode;
  className?: string;
};

/** md tier (768–1279px): single column; slot internals may differ from sm. */
export function DashboardTablet({ children, className }: DashboardTabletProps) {
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
