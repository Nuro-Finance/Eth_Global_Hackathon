"use client";

import { useTranslations } from "next-intl";
import { IconTrendingUp } from "@tabler/icons-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import {
  weeklyActivityData,
  type DayActivity,
} from "../config/weeklyActivity.config";
import { useThemeColor } from "@/Demo/ThemeColorSwitcher/ThemeColorProvider";

interface ActivityTrendChartProps {
  data?: DayActivity[];
}

/**
 * Activity trend mini chart - Shows transaction volume trend
 */
export function ActivityTrendChart({
  data = weeklyActivityData,
}: ActivityTrendChartProps) {
  const t = useTranslations("Analytics");
  const { currentTheme } = useThemeColor();

 // Get primary color from theme
  const primaryColor = currentTheme?.brandPrimary || "#846FFF";

 // Build a smooth WAVY UP trend for chart by linearly interpolating then adding a small sine perturbation
  const transactions = data.map((d) => d.transactions);
  const totalTransactions = transactions.reduce((s, v) => s + v, 0);
  const minTx = Math.min(...transactions);
  const maxTx = Math.max(...transactions);
  const n = data.length;

 // amplitude is a small portion of the range so waves are subtle
  const amplitude = Math.max(1, Math.round((maxTx - minTx) * 0.12));
  const frequency = (Math.PI * 2) / Math.max(1, n - 1);
  const phase = Math.PI / 6;

  const chartData = data.map((d, i) => {
    const base = minTx + (maxTx - minTx) * (i / (n - 1));
    const noise = amplitude * Math.sin(frequency * i + phase);
    return {
      day: d.dayShort.toUpperCase(),
      value: Math.max(0, Math.round(base + noise)),
    };
  });

 // Percent change from first to last of the synthetic trend
  const start = chartData[0]?.value || minTx || 1;
  const end = chartData[chartData.length - 1]?.value || maxTx || 1;
  const percentChange =
    start > 0 ? Math.round(((end - start) / start) * 100) : 0;

  return (
    <div className="p-4 rounded-xl bg-[var(--color-bg-tertiary)]/80 dark:bg-[var(--color-bg-glass)] dark:backdrop-blur-[var(--glass-blur)] h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-[var(--color-text-muted)]">
          {t("activityTrend")}
        </span>
        <div className="flex items-center gap-1">
          <IconTrendingUp className="w-4 h-4 text-[var(--color-brand-primary)]" />
          <span className="text-xs font-medium text-[var(--color-brand-primary)]">
            +{percentChange}%
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
              <linearGradient id="activityGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={primaryColor} stopOpacity={0.3} />
                <stop offset="100%" stopColor={primaryColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="natural"
              dataKey="value"
              stroke={primaryColor}
              strokeWidth={2}
              fill="url(#activityGradient)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Stats */}
      <div className="mt-2">
        <p className="text-lg font-bold text-[var(--color-text-primary)]">
          {totalTransactions}
        </p>
        <p className="text-xs text-[var(--color-text-muted)]">
          {t("transactions")}
        </p>
      </div>
    </div>
  );
}
