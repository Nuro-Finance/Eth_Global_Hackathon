"use client";

import { forwardRef } from "react";
import { AreaChart } from "@/components/charts";
import { type RevenueDataPoint } from "../config/revenue.config";

interface RevenueAreaChartProps {
  data: RevenueDataPoint[];
  xAxisLabels: string[];
  yDomain: [number, number];
}

/**
 * Revenue area chart visualization component
 */
export const RevenueAreaChart = forwardRef<
  HTMLDivElement,
  RevenueAreaChartProps
>(function RevenueAreaChart({ data, xAxisLabels, yDomain }, ref) {
  return (
    <AreaChart
      ref={ref}
      data={data}
      height="350px"
      primaryColor="var(--color-primary)"
      strokeColor="var(--color-primary)"
      barColor="var(--color-text-muted)"
      title=""
      xDataKey="period"
      yDataKey="revenue"
      barDataKey="expenses"
      showDots={true}
      animationDuration={1500}
      yDomain={yDomain}
      xAxisLabels={xAxisLabels}
    />
  );
});
