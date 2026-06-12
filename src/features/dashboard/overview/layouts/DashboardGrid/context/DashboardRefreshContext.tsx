"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** Dispatched on header reload — hooks refetch without importing this context. */
export const NURO_DASHBOARD_REFRESH_EVENT = "nuro:dashboard-refresh";

const REFRESH_MIN_MS = 400;

type DashboardRefreshContextValue = {
  isRefreshing: boolean;
  refresh: () => Promise<void>;
};

const DashboardRefreshContext = createContext<DashboardRefreshContextValue | null>(null);

export function DashboardRefreshProvider({ children }: { children: ReactNode }) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    const started = Date.now();
    try {
      window.dispatchEvent(new CustomEvent(NURO_DASHBOARD_REFRESH_EVENT));
      const remaining = Math.max(0, REFRESH_MIN_MS - (Date.now() - started));
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing]);

  const value = useMemo(
    () => ({
      isRefreshing,
      refresh,
    }),
    [isRefreshing, refresh],
  );

  return (
    <DashboardRefreshContext.Provider value={value}>{children}</DashboardRefreshContext.Provider>
  );
}

export function useDashboardRefresh() {
  const ctx = useContext(DashboardRefreshContext);
  if (!ctx) {
    throw new Error("useDashboardRefresh must be used within DashboardRefreshProvider");
  }
  return ctx;
}

export function useDashboardRefreshOptional() {
  return useContext(DashboardRefreshContext);
}
