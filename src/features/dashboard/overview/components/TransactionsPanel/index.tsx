"use client";
import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { WidgetCard } from "../../shared";
import { DataStatusPill } from "@/components";
import type { DataState } from "@/lib/dataState";
import { TransactionGroup } from "./components/TransactionGroup";
import type { TransactionData } from "./config/transactions.config";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { TransactionsModal } from "@/features/dashboard/cards/components/TransactionsModal";
import { TransactionDetailModal } from "@/features/dashboard/transactions";
import { useTransactionsState } from "@/features/dashboard/transactions/layouts/TransactionsGrid/hooks";
import { useDashboardDateRange } from "../../layouts/DashboardGrid/context/DashboardDateRangeContext";

/**
 * TransactionsPanel - Recent transactions list widget
 * Wired to real DB data via useTransactionsState, respects dashboard date range picker
 */
export default function TransactionsPanel() {
  const t = useTranslations();
  const { online } = useOnlineStatus();
  const [modalOpen, setModalOpen] = useState(false);
  const { dateRange } = useDashboardDateRange();
  const {
    transactions,
    isLoading,
    handleTransactionSelect,
    selectedTransaction,
    closeTransactionDetail,
    isTransactionDetailOpen,
  } = useTransactionsState({
    t: useTranslations("Transactions"),
    externalDateRange: dateRange,
  });

  const state = useMemo<DataState>(() => {
    return {
      status: online ? (isLoading ? "loading" : "success") : "offline",
      meta: { lastUpdatedAt: Date.now(), source: "api" },
    };
  }, [online, isLoading]);

  const recentTxData: TransactionData[] = useMemo(() => {
    return transactions.slice(0, 5).map((tx) => ({
      name: tx.name || tx.merchant || "Transaction",
      type: tx.category || tx.type || "transaction",
      amount: String(Math.abs(tx.amount ?? 0).toFixed(2)),
      isIncoming: tx.isIncoming ?? false,
    }));
  }, [transactions]);

  const todayTx = recentTxData.slice(0, 3);
  const earlierTx = recentTxData.slice(3, 5);

  const translateType = (type: string) => {
    return t(`Dashboard.${type}`) || type;
  };

  return (
    <>
      <WidgetCard
        title={
          <span className="flex items-center gap-2">
            {t("Dashboard.transactions") || "Transactions"}
            <DataStatusPill state={state} showStatusLabel={false} />
          </span>
        }
        action={{
          type: "link",
          label: "More",
          onClick: () => setModalOpen(true),
        }}
        contentClassName="relative overflow-hidden isolation-isolate"
      >
        <div className="pointer-events-none absolute left-32 top-32 -translate-x-1/2 -translate-y-1/2 h-72 w-72 rounded-full bg-[var(--color-primary)] opacity-[0.10] blur-[60px]" />
        {todayTx.length > 0 ? (
          <>
            <TransactionGroup
              label={t("Dashboard.today") || "Recent"}
              transactions={todayTx}
              translateType={translateType}
            />
            {earlierTx.length > 0 && (
              <TransactionGroup
                label={t("Dashboard.earlier") || "Earlier"}
                transactions={earlierTx}
                translateType={translateType}
                hideOnMobile
              />
            )}
          </>
        ) : (
          <div className="text-[var(--color-text-muted)] text-sm py-6 text-center">
            {isLoading ? "Loading transactions..." : "No transactions yet"}
          </div>
        )}
      </WidgetCard>
      <TransactionsModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title="My Card - Transactions"
        transactions={transactions}
        isLoading={isLoading}
        onTransactionSelect={handleTransactionSelect}
      />
      <TransactionDetailModal
        open={isTransactionDetailOpen}
        onOpenChange={(open) => {
          if (!open) closeTransactionDetail();
        }}
        tx={selectedTransaction}
      />
    </>
  );
}
