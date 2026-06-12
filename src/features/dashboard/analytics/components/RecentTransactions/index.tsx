"use client";

import { useTranslations } from "next-intl";
import { ChartHeader } from "../CategoryChart/components/ChartHeader";
import { TransactionsTable } from "./components/TransactionsTable";
import { useChartDownload } from "@/hooks";

/**
 * RecentTransactions - Premium transactions table widget
 */
export function RecentTransactions() {
  const t = useTranslations("Analytics");
  const { chartRef, downloadAsPNG } = useChartDownload({
    filename: t("recentTransactions"),
  });

  return (
    <div className="lg:col-span-2 bg-[var(--color-bg-secondary)] rounded-[20px] border border-[var(--color-border-primary)] p-4 xl:p-6">
      <ChartHeader title={t("recentTransactions")} onDownload={downloadAsPNG} />
      <div ref={chartRef}>
        <TransactionsTable />
      </div>
    </div>
  );
}

export default RecentTransactions;
