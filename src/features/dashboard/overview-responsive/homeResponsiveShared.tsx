"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import DashboardHeader from "@/features/dashboard/overview/layouts/DashboardGrid/components/DashboardHeader";
import { PrimaryDeckStackProvider } from "@/features/dashboard/overview/layouts/DashboardGrid/context/PrimaryDeckStackContext";
import {
  DashboardDateRangeProvider,
  useDashboardDateRange,
} from "@/features/dashboard/overview/layouts/DashboardGrid/context/DashboardDateRangeContext";
import { DashboardRefreshProvider } from "@/features/dashboard/overview/layouts/DashboardGrid/context/DashboardRefreshContext";
import { OverviewTopThreeHeroRow } from "@/features/dashboard/overview/layouts/OverviewVariants/overviewHeroShared";
import CardSection from "@/features/dashboard/overview/components/CardSection";
import type { CardSectionLayout } from "@/features/dashboard/overview/components/CardSection/types";
import { useNewUserOnboardingActive } from "@/features/dashboard/overview/hooks/useNewUserOnboardingActive";
import { DemoSurfaceRoot, DemoSurfaceRegion } from "@/features/dashboard/overview/components/DemoSurfaceShell";
import { WidgetCard } from "@/features/dashboard/overview/shared";
import { useTransactionsState } from "@/features/dashboard/transactions/layouts/TransactionsGrid/hooks";
import {
  TransactionsTable,
  TransactionDetailModal,
  ExportTransactionsButton,
  TransactionsSearchInput,
} from "@/features/dashboard/transactions";
import { TransactionsTableBusyOverlay } from "@/features/dashboard/transactions/layouts/TransactionsGrid/components/TransactionsDataSkeletons";
import { useDevPreviewMode } from "@/providers/DevPreviewModeProvider";

export type HomeResponsiveShellProps = {
  cardLayout: CardSectionLayout;
  /** md1: shorter widget subtitle */
  transactionsSubtitleCompact?: boolean;
  /** md1: hide status + category; md2: hide category only */
  transactionsHiddenColumns?: ("status" | "category")[];
  /** md2: status column visible, no dot, 10px label */
  transactionsStatusCompact?: boolean;
};

function HomeResponsiveShellInner({
  cardLayout,
  transactionsSubtitleCompact = false,
  transactionsHiddenColumns,
  transactionsStatusCompact = false,
}: HomeResponsiveShellProps) {
  const tTx = useTranslations("Transactions");
  const { dateRange } = useDashboardDateRange();
  const {
    transactions: ledgerTransactions,
    isLoading: ledgerTransactionsLoading,
    isRefreshing: ledgerTransactionsRefreshing,
    handleTransactionSelect,
    selectedTransaction,
    closeTransactionDetail,
    isTransactionDetailOpen,
  } = useTransactionsState({
    t: tTx,
    externalDateRange: dateRange,
  });
  const { newUserEmpty } = useDevPreviewMode();
  useNewUserOnboardingActive(newUserEmpty);
  const showInitialTableSkeleton = ledgerTransactionsLoading && ledgerTransactions.length === 0;
  const showRefreshOverlay = ledgerTransactionsRefreshing && !showInitialTableSkeleton;
  const [transactionsSearch, setTransactionsSearch] = useState("");

  return (
    <div className="relative">
      <DashboardHeader />
      <DemoSurfaceRoot>
        <div className="mt-4">
          <CardSection layout={cardLayout} useNuroCodeCard />
        </div>
        <div className="mt-4">
          <OverviewTopThreeHeroRow
            overviewLayout="3"
            newUserPrimaryCardCta={newUserEmpty}
            hidePrimaryDeck
          />
        </div>

        <DemoSurfaceRegion className="mt-4" showActions>
          <WidgetCard
            title={tTx("title")}
            subtitle={
              transactionsSubtitleCompact ? tTx("subtitleCompact") : tTx("subtitle")
            }
            headerTitleProps={{ className: "[&_p]:whitespace-nowrap" }}
            sampleDataLabel
            headerAside={
              <div className="flex items-center gap-2">
                <ExportTransactionsButton
                  presentation="menu"
                  transactions={ledgerTransactions}
                  buttonText={tTx("export")}
                />
                <TransactionsSearchInput
                  value={transactionsSearch}
                  onChange={setTransactionsSearch}
                  className="w-[10.5rem] sm:w-44"
                />
              </div>
            }
            fullHeight={false}
          >
            <div className="relative min-h-0">
              <TransactionsTable
                variant="embedded"
                embeddedMaxRows={5}
                transactions={ledgerTransactions}
                isLoading={showInitialTableSkeleton}
                onTransactionSelect={handleTransactionSelect}
                globalFilter={transactionsSearch}
                onGlobalFilterChange={setTransactionsSearch}
                hiddenColumns={transactionsHiddenColumns}
                statusCompact={transactionsStatusCompact}
              />
              {showRefreshOverlay ? <TransactionsTableBusyOverlay /> : null}
            </div>
          </WidgetCard>
        </DemoSurfaceRegion>
      </DemoSurfaceRoot>

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

export function HomeResponsiveShell(props: HomeResponsiveShellProps) {
  return (
    <DashboardDateRangeProvider>
      <DashboardRefreshProvider>
        <PrimaryDeckStackProvider>
          <HomeResponsiveShellInner {...props} />
        </PrimaryDeckStackProvider>
      </DashboardRefreshProvider>
    </DashboardDateRangeProvider>
  );
}
