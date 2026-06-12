"use client";

import { useState, useEffect } from "react";
import { useAppSession } from "@/hooks/useAppSession";
import { useTranslations } from "next-intl";
import { ChartHeader } from "./components/ChartHeader";
import { CategoryDonutChart } from "./components/CategoryDonutChart";
import { useChartDownload } from "@/hooks";

/**
 * CategoryChart - Displays spending breakdown by category
 * Wired to GET /api/analytics/categories, falls back to mock config data
 */
export function CategoryChart() {
  const t = useTranslations("Analytics");
  const { data: session } = useAppSession();
  const { chartRef, downloadAsPNG } = useChartDownload({
    filename: t("spendingByCategory"),
  });
  const [apiData, setApiData] = useState<{ name: string; value: number; color: string }[] | undefined>();
  const [total, setTotal] = useState<number | undefined>();

  useEffect(() => {
    const token = (session as any)?.accessToken;
    if (!token) return;
    fetch("/api/analytics/categories", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: any) => {
        if (data?.categories?.length > 0) {
          setApiData(data.categories);
          setTotal(data.total);
        }
      })
      .catch(() => {});
  }, [session]);

  return (
    <div className="bg-[var(--color-bg-secondary)] rounded-[20px] border border-[var(--color-border-primary)] p-4 xl:p-6">
      <ChartHeader title={t("spendingByCategory")} onDownload={downloadAsPNG} />
      <CategoryDonutChart
        ref={chartRef}
        data={apiData}
        totalLabel={t("totalExpenses")}
      />
    </div>
  );
}

export default CategoryChart;
