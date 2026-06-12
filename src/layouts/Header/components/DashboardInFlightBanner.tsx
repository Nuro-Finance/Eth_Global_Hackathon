"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  subscribeDashboardInFlightOperation,
  type DashboardInFlightOperationKind,
} from "@/lib/dashboardInFlightOperation";

const COPY: Record<DashboardInFlightOperationKind, string> = {
  reload: "Reload in progress",
  withdraw: "Withdraw in progress",
};

const DISPLAY_MS = 10_000;

/**
 * Dashboard row status (QuickActions row): same height and corner radius as the
 * ⋯ / refresh / date controls — not the top wallet toolbar.
 */
export function DashboardInFlightBanner() {
  const [visible, setVisible] = useState(false);
  const [kind, setKind] = useState<DashboardInFlightOperationKind>("reload");
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const arm = useCallback((next: DashboardInFlightOperationKind) => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setKind(next);
    setVisible(true);
    hideTimerRef.current = setTimeout(() => {
      setVisible(false);
      hideTimerRef.current = null;
    }, DISPLAY_MS);
  }, []);

  useEffect(() => subscribeDashboardInFlightOperation(arm), [arm]);

  useEffect(
    () => () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    },
    [],
  );

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex h-10 max-w-[min(260px,calc(100vw-12rem))] shrink-0 items-center justify-center pl-4 pr-4 sm:pl-5 sm:pr-5",
        "rounded-[10px] bg-[var(--color-bg-chrome-on-canvas)] text-[var(--color-text-primary)]",
        "text-[12px] font-semibold leading-none tracking-tight",
        "border-none opacity-95",
      )}
    >
      <span className="truncate">{COPY[kind]}</span>
    </div>
  );
}
