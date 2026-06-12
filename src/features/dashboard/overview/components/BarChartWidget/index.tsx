"use client";

import { useTranslations } from "next-intl";
import { WidgetCard } from "../../shared";
import { PERFORMANCE_DATA } from "./config/barChart.config";
import { useThemeTextColor } from "./hooks/useThemeTextColor";
import { PerformanceBarChart, PerformanceSummary } from "./components";

/**
 * BarChartWidget - Portfolio Performance visualization
 */
export default function BarChartWidget() {
  const t = useTranslations();
  const textColor = useThemeTextColor();

  return (
    <WidgetCard
      title={t("Dashboard.portfolioPerformance") || "Portfolio Performance"}
      action={{
        type: "dropdown",
        label: t("Dashboard.thisMonth") || "This Month",
      }}
    >
      <PerformanceBarChart data={PERFORMANCE_DATA} textColor={textColor} />
      <PerformanceSummary data={PERFORMANCE_DATA} />
    </WidgetCard>
  );
}

export { BarChartWidget };
