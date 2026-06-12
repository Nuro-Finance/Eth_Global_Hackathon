"use client";

import { SimpleAreaChart, ChartTooltip } from "@/components/charts";
import {
  statisticsData,
  statisticsChartConfig,
  type StatisticsDataPoint,
} from "../config/statistics.config";

interface StatisticsAreaChartProps {
  data?: StatisticsDataPoint[];
  textColor: string;
}

/**
 * Statistics area chart using shared SimpleAreaChart component
 */
export function StatisticsAreaChart({
  data = statisticsData,
  textColor,
}: StatisticsAreaChartProps) {
  const { gradient, stroke, yAxis, dot, activeDot } = statisticsChartConfig;

  return (
    <SimpleAreaChart
      data={data}
      xAxisKey="date"
      dataKey="value"
      strokeColor={stroke.color}
      strokeWidth={stroke.width}
      textColor={textColor}
      minHeight={150}
      yAxisFormatter={(value) => `${value / 1000}k`}
      yAxisDomain={yAxis.domain}
      yAxisTicks={yAxis.ticks}
      gradient={{
        id: "statisticsGradient",
        start: gradient.start,
        middle: gradient.middle,
        end: gradient.end,
      }}
      showDots={true}
      dotConfig={dot}
      activeDotConfig={activeDot}
      margin={{ top: 10, right: 2, left: -10, bottom: 10 }}
      renderTooltip={({ active, payload }) => {
        if (active && payload && payload.length) {
          return (
            <ChartTooltip
              active={active}
              rows={[
                {
                  value: "+$40",
                  color: "text-[var(--color-card-accent)]",
                },
                {
                  value: `$${payload[0].value?.toLocaleString()}.000`,
                },
              ]}
            />
          );
        }
        return null;
      }}
      className="sm:min-h-[200px]"
    />
  );
}
