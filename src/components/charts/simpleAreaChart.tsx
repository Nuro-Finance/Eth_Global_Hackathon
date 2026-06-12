"use client";

import React, { forwardRef } from "react";
import {
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
  TooltipProps,
} from "recharts";
import { ChartTooltip } from "./chartTooltip";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SimpleAreaChartDataItem = Record<string, any>;

export interface GradientConfig {
  id: string;
  start: { color: string; opacity: number };
  middle?: { color: string; opacity: number };
  end: { color: string; opacity: number };
}

export interface SimpleAreaChartProps {
  /** Chart data array */
  data: SimpleAreaChartDataItem[];
  /** Data key for x-axis */
  xAxisKey: string;
  /** Data key for area values */
  dataKey: string;
  /** Stroke color for the area line */
  strokeColor?: string;
  /** Stroke width */
  strokeWidth?: number;
  /** Fill color (solid) or gradient ID reference */
  fillColor?: string;
  /** Text color for axis labels */
  textColor?: string;
  /** Minimum height for the chart container */
  minHeight?: number;
  /** Custom Y-axis tick formatter */
  yAxisFormatter?: (value: number) => string;
  /** Y-axis domain [min, max] */
  yAxisDomain?: [number | string, number | string];
  /** Y-axis tick values */
  yAxisTicks?: number[];
  /** Gradient configuration (optional) */
  gradient?: GradientConfig;
  /** Whether to show dots on data points */
  showDots?: boolean;
  /** Dot configuration */
  dotConfig?: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    r?: number;
  };
  /** Active dot configuration */
  activeDotConfig?: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    r?: number;
  };
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
  /** Curve type */
  curveType?:
    | "basis"
    | "basisClosed"
    | "basisOpen"
    | "linear"
    | "linearClosed"
    | "natural"
    | "monotone"
    | "monotoneX"
    | "monotoneY"
    | "step"
    | "stepBefore"
    | "stepAfter";
  /** Custom tooltip content renderer */
  renderTooltip?: TooltipProps<number, string>["content"];
  /** Additional className for container */
  className?: string;
}

/**
 * Reusable Simple Area Chart component with customizable styling
 */
const SimpleAreaChart = forwardRef<HTMLDivElement, SimpleAreaChartProps>(
  (
    {
      data,
      xAxisKey,
      dataKey,
      strokeColor = "var(--color-primary)",
      strokeWidth = 2,
      fillColor,
      textColor = "var(--color-text-muted)",
      minHeight = 200,
      yAxisFormatter = (value) => `${value}`,
      yAxisDomain,
      yAxisTicks,
      gradient,
      showDots = false,
      dotConfig = { fill: "#fff", stroke: strokeColor, strokeWidth: 2, r: 4 },
      activeDotConfig = {
        fill: "#fff",
        stroke: strokeColor,
        strokeWidth: 2,
        r: 6,
      },
      showGrid = false,
      gridColor = "var(--color-border-primary)",
      margin = { top: 10, right: 10, left: -30, bottom: 10 },
      curveType = "monotone",
      renderTooltip,
      className = "",
    },
    ref
  ) => {
    const gradientId = gradient?.id || "areaGradient";
    const fill = gradient ? `url(#${gradientId})` : fillColor || strokeColor;

    const defaultTooltip: TooltipProps<number, string>["content"] = ({
      active,
      payload,
    }) => {
      if (active && payload && payload.length) {
        return (
          <ChartTooltip
            active={active}
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
          <RechartsAreaChart
            data={data}
            margin={margin}
            style={{
              direction: "ltr",
              outline: "none",
              border: "none",
            }}
          >
            {gradient && (
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={gradient.start.color}
                    stopOpacity={gradient.start.opacity}
                  />
                  {gradient.middle && (
                    <stop
                      offset="50%"
                      stopColor={gradient.middle.color}
                      stopOpacity={gradient.middle.opacity}
                    />
                  )}
                  <stop
                    offset="100%"
                    stopColor={gradient.end.color}
                    stopOpacity={gradient.end.opacity}
                  />
                </linearGradient>
              </defs>
            )}
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
              tick={{ fill: textColor, fontSize: 10 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: textColor, fontSize: 10 }}
              tickFormatter={yAxisFormatter}
              domain={yAxisDomain}
              ticks={yAxisTicks}
              width={45}
            />
            <Tooltip content={renderTooltip || defaultTooltip} />
            <Area
              type={curveType}
              dataKey={dataKey}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              fill={fill}
              dot={showDots ? dotConfig : false}
              activeDot={activeDotConfig}
            />
          </RechartsAreaChart>
        </ResponsiveContainer>
      </div>
    );
  }
);

SimpleAreaChart.displayName = "SimpleAreaChart";

export default SimpleAreaChart;
