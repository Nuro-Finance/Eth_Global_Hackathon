"use client";

import { CategoryTabs, StockList } from "./components";
import type { StockData } from "../../config/smartInvest.config";

interface TabConfig {
  id: string;
  label: string;
}

interface StockSectionProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  tabs: TabConfig[];
  stocks?: StockData[];
  isLoading?: boolean;
}

export function StockSection({
  activeTab,
  onTabChange,
  tabs,
  stocks,
  isLoading,
}: StockSectionProps) {
  return (
    <>
      <CategoryTabs
        activeTab={activeTab}
        onTabChange={onTabChange}
        tabs={tabs}
      />
      {isLoading ? (
        <div className="mt-3 mb-4 sm:mb-6 min-h-[180px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="w-5 h-5 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-[var(--color-text-muted)]">Loading markets...</span>
          </div>
        </div>
      ) : stocks && stocks.length > 0 ? (
        <StockList activeTab={activeTab} stocks={stocks} />
      ) : (
        <div className="mt-3 mb-4 sm:mb-6 min-h-[180px] flex items-center justify-center">
          <span className="text-sm text-[var(--color-text-muted)]">No markets available</span>
        </div>
      )}
    </>
  );
}
