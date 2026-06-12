"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { DateRange } from "react-day-picker";

interface DashboardDateRangeCtx {
  dateRange: DateRange | undefined;
  setDateRange: (range: DateRange | undefined) => void;
}

const Ctx = createContext<DashboardDateRangeCtx>({
  dateRange: undefined,
  setDateRange: () => {},
});

export function DashboardDateRangeProvider({ children }: { children: ReactNode }) {
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  return <Ctx.Provider value={{ dateRange, setDateRange }}>{children}</Ctx.Provider>;
}

export function useDashboardDateRange() {
  return useContext(Ctx);
}
