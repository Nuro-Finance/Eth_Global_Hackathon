"use client";

import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { DataStatusPill, InlineAlert, PageHeader, PageTitle } from "@/components";
import { useTransactionsState, useTransactionsStats } from "./hooks";
import {
  TransactionsStats,
  TransactionsPreviewWidgets,
  TransactionsContent,
  TransactionDetailModal,
} from "./components";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  RefreshJustNowPill,
  useRefreshJustNowPill,
} from "@/features/dashboard/cards/layouts/CardsGrid/refreshJustNow";
/**
 * TransactionsGrid - Main layout component for the transactions page
 */
export function TransactionsGrid() {
  const t = useTranslations("Transactions");

  const {
    transactions,
    isLoading,
    isRefreshing,
    dataState,
    refresh,
    handleTransactionSelect,
    selectedTransaction,
    closeTransactionDetail,
    isTransactionDetailOpen,
    handleDateRangeSelect,
    handleFiltersApply,
    handleExportComplete,
    handleAddTransaction,
  } = useTransactionsState({ t });

  const stats = useTransactionsStats(transactions, t);
  const { justNowVisible, runRefresh } = useRefreshJustNowPill();
  const dataBusy = isLoading || isRefreshing;

  return (
    <div className="space-y-3 md:space-y-4">
      {/* Page Header */}
      <PageHeader
        leftSection={<PageTitle title={t("title")} subtitle={t("subtitle")} />}
        rightSection={
          <TooltipProvider delayDuration={0} skipDelayDuration={0}>
            <div className="flex items-center gap-2">
              <RefreshJustNowPill visible={justNowVisible} />
              <DataStatusPill state={dataState} variant="toolbar" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => void runRefresh(refresh)}
                    disabled={
                      dataState.status === "loading" || dataState.status === "refreshing"
                    }
                    className={cn(
                      "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--color-bg-chrome-on-canvas)] border-none text-white/70 transition-all hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
                      (dataState.status === "loading" || dataState.status === "refreshing") &&
                        "cursor-default opacity-60",
                    )}
                    aria-label="Refresh"
                  >
                    <RefreshCw
                      className={cn(
                        "h-4 w-4 shrink-0 origin-center opacity-90",
                        (dataState.status === "loading" ||
                          dataState.status === "refreshing") &&
                          "animate-spin",
                      )}
                      strokeWidth={2}
                      aria-hidden
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="end">
                  Refresh
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        }
      />

      {dataState.status === "offline" && (
        <InlineAlert
          tone="offline"
          title="You’re offline"
          description="Reconnect to refresh transactions."
          action={
            <Button
              type="button"
              variant="outline"
              className="h-8 px-3 text-[12px]"
              onClick={() => void refresh()}
            >
              Retry
            </Button>
          }
        />
      )}

      {/* Stats Grid */}
      <TransactionsStats stats={stats} isLoading={dataBusy} />

      <TransactionsPreviewWidgets
        transactions={transactions}
        onTransactionSelect={handleTransactionSelect}
        isDataLoading={dataBusy}
      />

      {/* Transactions Content */}
      <TransactionsContent
        transactions={transactions}
        isLoading={isLoading}
        isRefreshing={isRefreshing}
        onTransactionSelect={handleTransactionSelect}
        onDateRangeSelect={handleDateRangeSelect}
        onFiltersApply={handleFiltersApply}
        onExportComplete={handleExportComplete}
        onAddTransaction={handleAddTransaction}
      />

      <TransactionDetailModal
        open={isTransactionDetailOpen}
        onOpenChange={(open) => {
          if (!open) closeTransactionDetail();
        }}
        tx={selectedTransaction}
      />
    </div>
  );
}
