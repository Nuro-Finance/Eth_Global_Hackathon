"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { WidgetCard } from "../../shared";
import { StatisticsAreaChart } from "./components/StatisticsAreaChart";
import { useThemeTextColor } from "./hooks/useThemeTextColor";
import type { StatisticsDataPoint } from "./config/statistics.config";

/**
 * StatisticsChart - User statistics overview chart
 * Wired to GET /api/analytics/statistics, falls back to mock config data
 */
export default function StatisticsChart() {
  const t = useTranslations();
  const textColor = useThemeTextColor();
  const { data: session } = useSession();
  const [apiData, setApiData] = useState<StatisticsDataPoint[] | undefined>();

  useEffect(() => {
    const token = (session as any)?.accessToken;
    if (!token) return;
    fetch("/api/analytics/statistics", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: any[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setApiData(data.map((d) => ({ date: d.date, value: d.value })));
        }
      })
      .catch(() => {});
  }, [session]);

  return (
    <WidgetCard
      title={t("Dashboard.statistics") || "Your Statistics"}
      action={{
        type: "dropdown",
        label: t("Dashboard.thisWeek") || "This week",
      }}
    >
      <StatisticsAreaChart data={apiData} textColor={textColor} />
    </WidgetCard>
  );
}
