"use client";

import { useTranslations } from "next-intl";
import { BarChart, ChartTooltip } from "@/components/charts";
import {
  type PerformanceItem,
  BAR_CHART_COLOR,
} from "../config/barChart.config";

interface PerformanceBarChartProps {
  data: PerformanceItem[];
  textColor: string;
}

/**
 * Performance bar chart using shared BarChart component
 */
export function PerformanceBarChart({
  data,
  textColor,
}: PerformanceBarChartProps) {
  const t = useTranslations();

 // Handle SSR - use default values
  const isBrowser = typeof window !== "undefined";
  const isSmallScreen = isBrowser ? window.innerWidth < 640 : false;
  const isMediumScreen = isBrowser ? window.innerWidth < 768 : false;

  return (
    <BarChart
      data={data}
      xAxisKey="category"
      dataKey="value"
      barColor={BAR_CHART_COLOR}
      textColor={textColor}
      minHeight={isSmallScreen ? 200 : 220}
      yAxisFormatter={(value) => `$${value / 1000}k`}
      xAxisAngle={isSmallScreen ? -90 : -45}
      margin={{
        top: 10,
        right: 10,
        left: -10,
        bottom: isMediumScreen ? 20 : 40,
      }}
      renderTooltip={({ active, payload, label }) => {
        if (active && payload && payload.length) {
          const itemData = payload[0].payload as PerformanceItem;
          const growthColor =
            itemData.growth >= 0
              ? "text-[var(--color-success)]"
              : "text-[var(--color-error)]";
          return (
            <ChartTooltip
              active={active}
              title={label as string}
              rows={[
                {
                  label: t("Dashboard.value") || "Value",
                  value: `$${itemData.value.toLocaleString()}`,
                },
                {
                  label: t("Dashboard.growth") || "Growth",
                  value: `${itemData.growth >= 0 ? "+" : ""}${
                    itemData.growth
                  }%`,
                  color: growthColor,
                },
              ]}
            />
          );
        }
        return null;
      }}
    />
  );
}
