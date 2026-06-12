"use client";

import { forwardRef } from "react";
import { DonutChart } from "@/components/charts";
import {
  categoryData,
  categoryChartConfig,
  type CategoryData,
} from "../config/category.config";

interface CategoryDonutChartProps {
  data?: CategoryData[];
  totalLabel: string;
}

/**
 * Category donut chart visualization component
 */
export const CategoryDonutChart = forwardRef<
  HTMLDivElement,
  CategoryDonutChartProps
>(function CategoryDonutChart({ data = categoryData, totalLabel }, ref) {
  const { chart, totalValue, translationNamespace } = categoryChartConfig;

  return (
    <DonutChart
      ref={ref}
      data={data}
      height={chart.height}
      innerRadius={chart.innerRadius}
      outerRadius={chart.outerRadius}
      paddingAngle={chart.paddingAngle}
      showLegend={chart.showLegend}
      translationNamespace={translationNamespace}
      valueFormatter={(value) => `${value}%`}
      totalValue={totalValue}
      totalLabel={totalLabel}
    />
  );
});
