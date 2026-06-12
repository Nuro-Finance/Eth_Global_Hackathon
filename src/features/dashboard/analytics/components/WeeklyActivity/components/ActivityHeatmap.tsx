"use client";

import { useTranslations } from "next-intl";
import {
  weeklyActivityData,
  getIntensityLevel,
  type DayActivity,
} from "../config/weeklyActivity.config";

interface ActivityHeatmapProps {
  data?: DayActivity[];
}

/**
 * Activity heatmap visualization - Shows daily activity intensity
 */
export function ActivityHeatmap({
  data = weeklyActivityData,
}: ActivityHeatmapProps) {
  const t = useTranslations("Analytics");

 // Calculate totals
  const totalTransactions = data.reduce((sum, d) => sum + d.transactions, 0);
  const totalAmount = data.reduce((sum, d) => sum + d.amount, 0);
  const avgDaily = Math.round(totalTransactions / data.length);

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 py-5">
        <div className="text-center">
          <p className="text-2xl font-bold text-[var(--color-text-primary)]">
            {totalTransactions}
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {t("totalTransactions")}
          </p>
        </div>
        <div className="text-center border-x border-[var(--color-border-primary)]">
          <p className="text-2xl font-bold text-[var(--color-text-primary)]">
            ${(totalAmount / 1000).toFixed(1)}k
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {t("totalSpent")}
          </p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-[var(--color-text-primary)]">
            {avgDaily}
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {t("dailyAvg")}
          </p>
        </div>
      </div>

      {/* Heatmap Grid */}
      <div className="grid grid-cols-7 gap-2">
        {data.map((day) => {
          const intensity = getIntensityLevel(day.transactions, data);
          const opacityMap: Record<number, string> = {
            1: "0.2",
            2: "0.4",
            3: "0.6",
            4: "0.8",
            5: "1",
          };

          return (
            <div key={day.day} className="flex flex-col items-center gap-2">
              <div
                className="w-full aspect-square rounded-xl flex items-center justify-center transition-all hover:scale-105 cursor-pointer group relative"
                style={{
                  backgroundColor: `color-mix(in srgb, var(--color-brand-primary) ${
                    Number(opacityMap[intensity]) * 100
                  }%, transparent)`,
                }}
              >
                <span className="text-[var(--color-text-primary)] font-semibold text-sm">
                  {day.transactions}
                </span>

                {/* Tooltip */}
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[var(--color-bg-card)] dark:bg-[var(--color-bg-glass-strong)] dark:backdrop-blur-[var(--glass-blur)] border border-[var(--color-border-primary)] dark:border-[var(--color-border-glass-strong)] rounded-lg p-2 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                  <p className="text-xs font-medium text-[var(--color-text-primary)]">
                    ${day.amount.toLocaleString()}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {day.transactions} transactions
                  </p>
                </div>
              </div>
              <span className="text-xs text-[var(--color-text-muted)] uppercase">
                {t(
                  day.dayShort as
                    | "mon"
                    | "tue"
                    | "wed"
                    | "thu"
                    | "fri"
                    | "sat"
                    | "sun"
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
