"use client";

import React, { forwardRef } from "react";
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
  TooltipProps,
} from "recharts";
import { ChartTooltip } from "./chartTooltip";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BarChartDataItem = Record<string, any>;

export interface BarChartProps {
 /** Chart data array */
  data: BarChartDataItem[];
 /** Data key for x-axis categories */
  xAxisKey: string;
 /** Data key for bar values */
  dataKey: string;
 /** Bar fill color */
  barColor?: string;
 /** Text color for axis labels */
  textColor?: string;
 /** Minimum height for the chart container */
  minHeight?: number;
 /** Custom Y-axis tick formatter */
  yAxisFormatter?: (value: number) => string;
 /** X-axis label rotation angle */
  xAxisAngle?: number;
 /** Bar corner radius */
  barRadius?: number | [number, number, number, number];
 /** Whether to show grid lines */
  showGrid?: boolean;
 /** Grid stroke color */
  gridColor?: string;
 /** Chart margins */
  margin?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
 /** Custom tooltip content renderer */
  renderTooltip?: TooltipProps<number, string>["content"];
 /** Additional className for container */
  className?: string;
}

/**
 * Reusable Bar Chart component with customizable styling
 */
const BarChart = forwardRef<HTMLDivElement, BarChartProps>(
  (
    {
      data,
      xAxisKey,
      dataKey,
      barColor = "var(--color-primary)",
      textColor = "var(--color-text-muted)",
      minHeight = 200,
      yAxisFormatter = (value) => `${value}`,
      xAxisAngle = 0,
      barRadius = [4, 4, 0, 0],
      showGrid = false,
      gridColor = "var(--color-border-primary)",
      margin = { top: 10, right: 10, left: -10, bottom: 20 },
      renderTooltip,
      className = "",
    },
    ref
  ) => {
 // Handle SSR - use default values
    const isBrowser = typeof window !== "undefined";
    const isSmallScreen = isBrowser ? window.innerWidth < 640 : false;

    const defaultTooltip: TooltipProps<number, string>["content"] = ({
      active,
      payload,
      label,
    }) => {
      if (active && payload && payload.length) {
        return (
          <ChartTooltip
            active={active}
            title={label as string}
            rows={[
              {
                value: yAxisFormatter(payload[0].value as number),
              },
            ]}
          />
        );
      }
      return null;
    };

    return (
      <div
        ref={ref}
        className={`flex-1 w-full [&_svg]:outline-none [&_svg]:border-none [&_*]:outline-none [&_*]:border-none ${className}`}
        style={{ minHeight }}
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          style={{ outline: "none" }}
        >
          <RechartsBarChart
            data={data}
            margin={margin}
            style={{
              direction: "ltr",
              outline: "none",
              border: "none",
            }}
          >
            {showGrid && (
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={gridColor}
                vertical={false}
              />
            )}
            <XAxis
              dataKey={xAxisKey}
              axisLine={false}
              tickLine={false}
              tick={{
                fill: textColor,
                fontSize: isSmallScreen ? 8 : 10,
              }}
              angle={xAxisAngle}
              textAnchor={xAxisAngle !== 0 ? "end" : "middle"}
              height={xAxisAngle !== 0 ? 60 : 30}
              interval={0}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{
                fill: textColor,
                fontSize: isSmallScreen ? 8 : 10,
              }}
              tickFormatter={yAxisFormatter}
              width={45}
            />
            <Tooltip content={renderTooltip || defaultTooltip} />
            <Bar dataKey={dataKey} radius={barRadius} fill={barColor} />
          </RechartsBarChart>
        </ResponsiveContainer>
      </div>
    );
  }
);

BarChart.displayName = "BarChart";

export default BarChart;
