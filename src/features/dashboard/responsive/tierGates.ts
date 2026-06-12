import { cn } from "@/lib/utils";

/** Visibility gates for each tier branch in `DashboardResponsivePage`. */
export const DASHBOARD_TIER_GATE_CLASS = {
  sm: "block md:hidden",
  md1: "hidden min-[768px]:block min-[960px]:hidden",
  md2: "hidden min-[960px]:block min-[1024px]:hidden",
  md3: "hidden min-[1024px]:block xl:hidden",
  xl: "hidden min-h-0 w-full min-w-0 xl:block",
} as const;

export function tierGateClass(tier: keyof typeof DASHBOARD_TIER_GATE_CLASS, className?: string) {
  return cn(DASHBOARD_TIER_GATE_CLASS[tier], className);
}
