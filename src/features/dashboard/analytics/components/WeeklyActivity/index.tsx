"use client";

import { useState, useEffect } from "react";
import { useAppSession } from "@/hooks/useAppSession";
import { useTranslations } from "next-intl";
import { ChartHeader } from "../CategoryChart/components/ChartHeader";
import { ActivityHeatmap } from "./components/ActivityHeatmap";
import { ActivityTrendChart } from "./components/ActivityTrendChart";
import { SpendingTrendChart } from "./components/SpendingTrendChart";
import { useChartDownload } from "@/hooks";
import { weeklyActivityData, type DayActivity } from "./config/weeklyActivity.config";

// Re-export components for clean imports
export { ActivityHeatmap } from "./components/ActivityHeatmap";
export { ActivityTrendChart } from "./components/ActivityTrendChart";
export { SpendingTrendChart } from "./components/SpendingTrendChart";

/**
 * WeeklyActivity - Premium heatmap showing weekly transaction activity
 * Wired to GET /api/analytics/weekly, falls back to mock config data
 */
export function WeeklyActivity() {
  const t = useTranslations("Analytics");
  const { data: session } = useAppSession();
  const { chartRef, downloadAsPNG } = useChartDownload({
    filename: t("weeklyActivity"),
  });
  const [data, setData] = useState<DayActivity[]>(weeklyActivityData);

  useEffect(() => {
    const token = (session as any)?.accessToken;
    if (!token) return;
    fetch("/api/analytics/weekly", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((apiData: any[]) => {
        if (Array.isArray(apiData) && apiData.length > 0) {
          setData(apiData);
        }
      })
      .catch(() => {});
  }, [session]);

  return (
    <div className="bg-[var(--color-bg-secondary)] dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] glass-card-inner rounded-[20px] border border-[var(--color-border-primary)] dark:border-[var(--color-border-glass-strong)] p-4 xl:p-6">
      <ChartHeader title={t("weeklyActivity")} onDownload={downloadAsPNG} />
      <div ref={chartRef} className="space-y-6 py-5 pb-0">
        {/* Activity Heatmap */}
        <ActivityHeatmap data={data} />

        {/* Mini Trend Charts - 2 Column Layout */}
        <div className="grid grid-cols-2 gap-4 pt-5 border-t border-[var(--color-border-primary)]">
          <ActivityTrendChart data={data} />
          <SpendingTrendChart data={data} />
        </div>
      </div>
    </div>
  );
}

export default WeeklyActivity;
