"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IconDownload } from "@tabler/icons-react";
import { timeFrameTabs, type TimeFrame } from "../config/revenue.config";

interface RevenueChartHeaderProps {
  title: string;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onDownload: () => void;
  translate: (key: TimeFrame) => string;
}

/**
 * Revenue chart header with title, tabs, and download button
 */
export function RevenueChartHeader({
  title,
  activeTab,
  onTabChange,
  onDownload,
  translate,
}: RevenueChartHeaderProps) {
  return (
    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-4 xl:mb-6 gap-3">
      <h3 className="text-[var(--color-text-secondary)] text-[16px] xl:text-[18px] font-normal">
        {title}
      </h3>

      <div className="flex items-center gap-2 xl:gap-4 w-full lg:w-auto">
        <Tabs
          value={activeTab}
          onValueChange={onTabChange}
          className="!mb-0 flex-1 lg:flex-initial"
        >
          <TabsList className="w-full lg:w-auto">
            {timeFrameTabs.map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="text-[11px] lg:text-[12px] xl:text-sm px-2 lg:px-2.5 xl:px-3"
              >
                {translate(tab)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Download Icon */}
        <button
          className="cursor-pointer p-1.5 xl:p-2 bg-[var(--color-bg-hover)]/50 rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors focus:outline-none flex-shrink-0"
          onClick={onDownload}
          title="Download chart as PNG"
        >
          <IconDownload className="w-4 h-4 xl:w-5 xl:h-5" />
        </button>
      </div>
    </div>
  );
}
