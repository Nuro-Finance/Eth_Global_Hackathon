"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { RevenueChartHeader } from "./components/RevenueChartHeader";
import { RevenueAreaChart } from "./components/RevenueAreaChart";
import { useRevenueData } from "./hooks/useRevenueData";
import { useChartDownload } from "@/hooks";
import { type TimeFrame } from "./config/revenue.config";

/**
 * RevenueChart - Displays revenue vs expenses comparison
 * Manages its own tab state internally
 */
export function RevenueChart() {
  const t = useTranslations("Analytics");
  const [activeTab, setActiveTab] = useState<TimeFrame>("monthly");

  const { chartRef, downloadAsPNG } = useChartDownload({
    filename: t("revenueVsExpenses"),
  });

  const { chartData, xAxisLabels, yDomain } = useRevenueData({
    activeTab,
    translate: t,
  });

  return (
    <div className="lg:col-span-2 bg-[var(--color-bg-secondary)] rounded-[20px] border border-[var(--color-border-primary)] p-4 xl:p-6">
      <RevenueChartHeader
        title={t("revenueVsExpenses")}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as TimeFrame)}
        onDownload={downloadAsPNG}
        translate={(key) => t(key as "daily" | "weekly" | "monthly" | "yearly")}
      />
      <RevenueAreaChart
        ref={chartRef}
        data={chartData}
        xAxisLabels={xAxisLabels}
        yDomain={yDomain}
      />
    </div>
  );
}

export default RevenueChart;
