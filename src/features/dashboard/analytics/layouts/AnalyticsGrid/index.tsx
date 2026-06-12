"use client";

import React, { useState, useEffect } from "react";
import { useAppSession } from "@/hooks/useAppSession";
import { useTranslations } from "next-intl";

import { PageHeader, PageTitle } from "@/components";
import { ANALYTICS_STATS_DATA, ANALYTICS_ICONS } from "./config";
import { AnalyticsStats, AnalyticsCharts } from "./components";

/**
 * AnalyticsGrid - Main layout component for the analytics page
 * Stats wired to GET /api/analytics/stats, falls back to mock config data
 */
export function AnalyticsGrid() {
  const t = useTranslations("Analytics");
  const { data: session } = useAppSession();
  const [apiStats, setApiStats] = useState<Record<string, { value: number; change: number }> | null>(null);

  useEffect(() => {
    const token = (session as any)?.accessToken;
    if (!token) return;
    fetch("/api/analytics/stats", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: any) => {
        if (data?.revenue) setApiStats(data);
      })
      .catch(() => {});
  }, [session]);

 // Translate stats titles, add icons, and override values from API if available
  const translatedStats = ANALYTICS_STATS_DATA.map((stat) => {
    const IconComponent =
      ANALYTICS_ICONS[stat.iconName as keyof typeof ANALYTICS_ICONS];
    const apiStat = apiStats?.[stat.id];
    return {
      ...stat,
      title: t(stat.title),
      icon: IconComponent ? <IconComponent className="w-5 h-5" /> : undefined,
      ...(apiStat ? {
        value: stat.id === "savings"
          ? `${apiStat.value}%`
          : `$${apiStat.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        change: apiStat.change,
        isPositive: apiStat.change >= 0,
      } : {}),
    };
  });

  return (
    <div className="">
      {/* Page Header */}
      <PageHeader
        leftSection={<PageTitle title={t("title")} subtitle={t("subtitle")} />}
      />

      {/* Stats Grid */}
      <AnalyticsStats stats={translatedStats} />

      {/* Charts Section */}
      <AnalyticsCharts />
    </div>
  );
}
