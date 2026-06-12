"use client";

import { useTranslations } from "next-intl";
import { SummaryStatItem } from "@/components/charts";
import {
  type PerformanceItem,
  calculateTotalValue,
  calculateAvgGrowth,
  countPositive,
} from "../config/barChart.config";

interface PerformanceSummaryProps {
  data: PerformanceItem[];
}

/**
 * Summary statistics for the portfolio performance
 */
export function PerformanceSummary({ data }: PerformanceSummaryProps) {
  const t = useTranslations();

  const totalValue = calculateTotalValue(data);
  const avgGrowth = calculateAvgGrowth(data);
  const positiveCount = countPositive(data);

  return (
    <div className="mt-3 sm:mt-4 grid grid-cols-3 gap-2 sm:gap-4">
      <SummaryStatItem
        value={`$${totalValue.toLocaleString()}`}
        label={t("Dashboard.totalValue") || "Total Value"}
      />
      <SummaryStatItem
        value={`+${avgGrowth.toFixed(1)}%`}
        label={t("Dashboard.avgGrowth") || "Avg Growth"}
        valueDir="ltr"
      />
      <SummaryStatItem
        value={`${positiveCount}/${data.length}`}
        label={t("Dashboard.positive") || "Positive"}
      />
    </div>
  );
}
