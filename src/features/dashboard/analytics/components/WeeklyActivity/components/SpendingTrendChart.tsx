"use client";

import { useTranslations } from "next-intl";
import { IconTrendingDown } from "@tabler/icons-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import {
  weeklyActivityData,
  type DayActivity,
} from "../config/weeklyActivity.config";

// Muted gray color for the down trend (matches --color-text-muted in light mode)
const MUTED_COLOR = "var(--color-chart-muted)";

interface SpendingTrendChartProps {
  data?: DayActivity[];
}

/**
 * Spending trend mini chart - Shows spending trend
 */
export function SpendingTrendChart({
  data = weeklyActivityData,
}: SpendingTrendChartProps) {
  const t = useTranslations("Analytics");

 // Build a smooth WAVY DOWN trend for chart by interpolating and adding small sine perturbation
  const amounts = data.map((d) => d.amount);
  const totalAmount = amounts.reduce((s, v) => s + v, 0);
  const maxAmt = Math.max(...amounts);
  const minAmt = Math.min(...amounts);
  const n = data.length;

 // subtle amplitude relative to range
  const amplitude = Math.max(1, Math.round((maxAmt - minAmt) * 0.08));
  const frequency = (Math.PI * 2) / Math.max(1, n - 1);
  const phase = -Math.PI / 8;

  const chartData = data.map((d, i) => {
    const base = maxAmt - (maxAmt - minAmt) * (i / (n - 1));
    const noise = amplitude * Math.sin(frequency * i + phase);
    return {
      day: d.dayShort.toUpperCase(),
      value: Math.max(0, Math.round(base + noise)),
    };
  });

 // Percent change from start to end in the synthetic trend
  const start = chartData[0]?.value || maxAmt || 1;
  const end = chartData[chartData.length - 1]?.value || minAmt || 1;
  const percentChange =
    start > 0 ? Math.round(((end - start) / start) * 100) : 0;

  return (
    <div className="p-4 rounded-xl bg-[var(--color-bg-tertiary)]/80 dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-[var(--color-text-muted)]">
          {t("spendingTrend")}
        </span>
        <div className="flex items-center gap-1">
          <IconTrendingDown className="w-4 h-4 text-[var(--color-error)]" />
          <span className="text-xs font-medium text-[var(--color-error)]">
            {percentChange}%
          </span>
        </div>
      </div>

      {/* Chart */}
      <div style={{ width: "100%", height: 80 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
          >
            <defs>
              <linearGradient id="spendingGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={MUTED_COLOR} stopOpacity={0.25} />
                <stop offset="100%" stopColor={MUTED_COLOR} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="natural"
              dataKey="value"
              stroke={MUTED_COLOR}
              strokeWidth={2}
              fill="url(#spendingGradient)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Stats */}
      <div className="mt-2">
        <p className="text-lg font-bold text-[var(--color-text-primary)]">
          ${(totalAmount / 1000).toFixed(1)}k
        </p>
        <p className="text-xs text-[var(--color-text-muted)]">
          {t("totalSpent")}
        </p>
      </div>
    </div>
  );
}
