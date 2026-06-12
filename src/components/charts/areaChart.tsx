import React, { forwardRef } from "react";
import {
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { useTranslations } from "next-intl";

// Default data that matches the original design
const defaultData = [
  { time: "1AM", users: 18.5, bars: 11.5 },
  { time: "1:15AM", users: 19.2, bars: 11.3 },
  { time: "1:30AM", users: 19.7, bars: 11.8 },
  { time: "1:45AM", users: 20.0, bars: 11.2 },
  { time: "2AM", users: 19.7, bars: 11.6 },
  { time: "2:15AM", users: 19.2, bars: 11.4 },
  { time: "2:30AM", users: 18.5, bars: 11.7 },
  { time: "2:45AM", users: 17.5, bars: 11.3 },
  { time: "3AM", users: 17.2, bars: 11.9 },
  { time: "3:15AM", users: 17.8, bars: 11.5 },
  { time: "3:30AM", users: 18.8, bars: 11.8 },
  { time: "3:45AM", users: 19.5, bars: 11.2 },
  { time: "4AM", users: 19.7, bars: 11.6 },
  { time: "4:15AM", users: 19.5, bars: 11.4 },
  { time: "4:30AM", users: 18.8, bars: 11.9 },
  { time: "4:45AM", users: 17.8, bars: 11.7 },
  { time: "5AM", users: 17.2, bars: 11.3 },
  { time: "5:15AM", users: 17.5, bars: 11.8 },
  { time: "5:30AM", users: 18.5, bars: 11.5 },
  { time: "5:45AM", users: 19.2, bars: 11.6 },
  { time: "6AM", users: 19.6, bars: 11.9 },
  { time: "6:15AM", users: 19.7, bars: 11.2 },
  { time: "6:30AM", users: 19.7, bars: 11.7 },
  { time: "6:45AM", users: 19.8, bars: 11.4 },
  { time: "7AM", users: 20.0, bars: 11.8 },
];

interface AreaChartProps {
 /** Chart data array */
  data?: Array<Record<string, string | number>>;
 /** Chart title */
  title?: string;
 /** Primary area color */
  primaryColor?: string;
 /** Stroke color for the area line */
  strokeColor?: string;
 /** Bar fill color */
  barColor?: string;
 /** Height of the chart container */
  height?: string;
 /** X-axis data key */
  xDataKey?: string;
 /** Y-axis data key for area */
  yDataKey?: string;
 /** Y-axis data key for bars */
  barDataKey?: string;
 /** Whether to show data point dots */
  showDots?: boolean;
 /** Animation duration in milliseconds */
  animationDuration?: number;
 /** Y-axis domain [min, max] */
  yDomain?: [number, number];
 /** X-axis labels to display */
  xAxisLabels?: string[];
}

/**
 * Reusable Area Chart component with customizable data and styling
 */
const AreaChart = forwardRef<HTMLDivElement, AreaChartProps>(
  (
    {
      data = defaultData,
      title = "",
      primaryColor = "var(--color-brand-primary)",
      strokeColor = "var(--color-brand-primary)",
      barColor = "var(--color-border-primary)",
      height = "500px",
      xDataKey = "time",
      yDataKey = "users",
      barDataKey = "bars",
      showDots = true,
      yDomain = [8, 24],
      xAxisLabels = ["1AM", "2AM", "3AM", "4AM", "5AM", "6AM", "7AM"],
    },
    ref
  ) => {
    const t = useTranslations("AreaChart");

 // Stable gradient IDs (avoid calling Math.random inline multiple times)
    const areaGradientId = `areaGradient-${Math.random()
      .toString(36)
      .slice(2)}`;
    const barGradientId = `barGradient-${Math.random().toString(36).slice(2)}`;

 // Custom Tooltip Component
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const CustomTooltip = ({ active, payload, label }: any) => {
      if (active && payload && payload.length) {
        return (
          <div className="bg-[var(--color-bg-card)]/95 dark:bg-[var(--color-bg-glass-strong)] dark:backdrop-blur-[var(--glass-blur)] dark:border-[var(--color-border-glass)] backdrop-blur-sm border border-[var(--color-border-primary)] rounded-lg p-3 shadow-xl">
            <p className="text-[var(--color-text-muted)] text-sm font-medium mb-8">
              {label}
            </p>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: primaryColor }}
                ></div>
                <span className="text-[var(--color-text-primary)] text-sm font-semibold">
                  {t(yDataKey)}: {payload[0]?.value}k
                </span>
              </div>
              {payload[1] && barDataKey && (
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-sm"
                    style={{ backgroundColor: barColor }}
                  ></div>
                  <span className="text-[var(--color-text-muted)] text-sm">
                    {t(barDataKey)}: {payload[1]?.value}k
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      }
      return null;
    };

 // Generate Y-axis labels based on domain
    const generateYAxisLabels = () => {
      const [min, max] = yDomain;
      const step = (max - min) / 4;
      return Array.from({ length: 5 }, (_, i) => max - i * step);
    };

    const yAxisLabels = generateYAxisLabels();

    return (
      <div
        className="relative w-full flex flex-col rounded-xl border border-[var(--color-border-primary)] dark:border-[var(--color-border-glass)] p-4 xl:p-6 bg-[var(--color-bg-card)]/60 dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] glass-card-inner"
        ref={ref}
        style={{
          outline: "none",
          height: height,
          maxHeight: "500px",
        }}
        tabIndex={-1}
        onMouseDown={(e) => {
          e.preventDefault();
          if (e.target instanceof HTMLElement) {
            e.target.blur();
          }
        }}
      >
        {/* Title */}
        {title && (
          <div className="mb-8">
            <h3 className="text-[var(--color-text-primary)] text-base xl:text-lg font-normal">
              {title}
            </h3>
          </div>
        )}

        {/* Chart Container - Flex grow to fill remaining space */}
        <div className="relative flex-1 min-h-0">
          {/* Subtle Grid Lines */}
          <div className="absolute inset-0 pointer-events-none opacity-20">
            {yAxisLabels.slice(1, -1).map((value) => (
              <div
                key={value}
                className="absolute w-full border-t"
                style={{
                  borderColor: primaryColor,
                  opacity: 0.16,
                  top: `${
                    100 -
                    ((value - yDomain[0]) / (yDomain[1] - yDomain[0])) * 75 +
                    10
                  }%`,
                }}
              />
            ))}
          </div>

          {/* Y-axis Labels */}
          <div className="absolute left-0.5 xl:left-1 top-0 h-full flex flex-col justify-between text-[var(--color-text-muted)] text-[10px] xl:text-xs py-6 xl:py-8 font-medium">
            {yAxisLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          {/* Main Chart */}
          <div
            className="ml-6 xl:ml-8 mr-2 xl:mr-4 h-full"
            style={{
              outline: "none",
            }}
            tabIndex={-1}
            onMouseDown={(e) => {
              e.preventDefault();
              if (e.target instanceof HTMLElement) {
                e.target.blur();
              }
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={data}
                margin={{ top: 20, right: 5, left: 0, bottom: 30 }}
                barCategoryGap="20%"
                style={{ outline: "none" }}
              >
                <defs>
                  {/* Enhanced Area Gradient */}
                  <linearGradient
                    id={areaGradientId}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={primaryColor}
                      stopOpacity={0.6}
                    />
                    <stop
                      offset="30%"
                      stopColor={primaryColor}
                      stopOpacity={0.4}
                    />
                    <stop
                      offset="70%"
                      stopColor={primaryColor}
                      stopOpacity={0.2}
                    />
                    <stop
                      offset="100%"
                      stopColor={primaryColor}
                      stopOpacity={0.05}
                    />
                  </linearGradient>

                  {/* Bar Gradient */}
                  <linearGradient
                    id={barGradientId}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={barColor} stopOpacity={0.8} />
                    <stop
                      offset="100%"
                      stopColor={barColor}
                      stopOpacity={0.6}
                    />
                  </linearGradient>
                </defs>

                <XAxis
                  dataKey={xDataKey}
                  axisLine={false}
                  tickLine={false}
                  tick={false}
                  height={0}
                />

                <YAxis domain={yDomain} hide={true} />

                <Tooltip
                  content={<CustomTooltip />}
                  cursor={{
                    stroke: primaryColor,
                    strokeWidth: 1,
                    strokeDasharray: "5 5",
                    opacity: 0.7,
                  }}
                  wrapperStyle={{ outline: "none" }}
                />

                {/* Bar Chart - ALWAYS render bars */}
                <Bar
                  dataKey={barDataKey}
                  fill={`url(#${barGradientId})`}
                  radius={[1, 1, 0, 0]}
                  opacity={0.7}
                />

                {/* Area Chart */}
                <Area
                  type="monotone"
                  dataKey={yDataKey}
                  stroke={strokeColor}
                  strokeWidth={2.5}
                  fill={`url(#${areaGradientId})`}
                  dot={
                    showDots
                      ? {
                          fill: primaryColor,
                          strokeWidth: 2,
                          stroke: primaryColor,
                          r: 3,
                        }
                      : false
                  }
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* X-axis Time Labels */}
          <div className="absolute bottom-0.5 xl:bottom-1 left-6 xl:left-8 right-2 xl:right-4 flex justify-between text-[var(--color-text-muted)] text-[10px] xl:text-xs font-medium">
            {xAxisLabels.map((label, index) => (
              <span key={index}>{label}</span>
            ))}
          </div>
        </div>
      </div>
    );
  }
);

AreaChart.displayName = "AreaChart";

export default AreaChart;
