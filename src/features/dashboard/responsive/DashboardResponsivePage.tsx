"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DashboardStack } from "./DashboardStack";
import { DashboardTablet } from "./DashboardTablet";
import {
  resolveDashboardLayoutTier,
  type DashboardLayoutTier,
} from "./constants";

type DashboardResponsivePageProps = {
 /** xl (≥1280px) */
  xl: ReactNode;
 /** md3 (1024–1279px) */
  md3: ReactNode;
 /** md2 (960–1023px) */
  md2: ReactNode;
 /** md1 (768–959px) */
  md1: ReactNode;
 /** sm (&lt;768px) */
  sm: ReactNode;
  className?: string;
};

function useDashboardLayoutTier(): DashboardLayoutTier {
  const [tier, setTier] = useState<DashboardLayoutTier>("sm");

  useLayoutEffect(() => {
    const sync = () => setTier(resolveDashboardLayoutTier(window.innerWidth));
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  return tier;
}

/**
 * Five-tier page wrapper — mounts exactly one slot (sm / md1 / md2 / md3 / xl).
 */
export function DashboardResponsivePage({
  xl,
  md3,
  md2,
  md1,
  sm,
  className,
}: DashboardResponsivePageProps) {
  const tier = useDashboardLayoutTier();
  const slots: Record<DashboardLayoutTier, ReactNode> = { sm, md1, md2, md3, xl };
  const active = slots[tier];

  return (
    <div className={cn("min-h-0 w-full min-w-0", className)}>
      {tier === "sm" ? (
        <DashboardStack>{active}</DashboardStack>
      ) : tier === "xl" ? (
        active
      ) : (
        <DashboardTablet>{active}</DashboardTablet>
      )}
    </div>
  );
}
