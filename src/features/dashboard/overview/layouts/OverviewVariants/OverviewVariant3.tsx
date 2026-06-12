"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import DashboardHeader from "../DashboardGrid/components/DashboardHeader";
import { PrimaryDeckStackProvider } from "../DashboardGrid/context/PrimaryDeckStackContext";
import { DashboardDateRangeProvider, useDashboardDateRange } from "../DashboardGrid/context/DashboardDateRangeContext";
import { DashboardRefreshProvider } from "../DashboardGrid/context/DashboardRefreshContext";
import { OverviewTopThreeHeroRow } from "./overviewHeroShared";
import { useNewUserOnboardingActive } from "../../hooks/useNewUserOnboardingActive";
import { DemoSurfaceRoot, DemoSurfaceRegion } from "../../components/DemoSurfaceShell";
import { WidgetCard } from "../../shared";
import { useTransactionsState } from "@/features/dashboard/transactions/layouts/TransactionsGrid/hooks";
import {
  TransactionsTable,
  TransactionDetailModal,
  ExportTransactionsButton,
  TransactionsSearchInput,
} from "@/features/dashboard/transactions";
import { TransactionsTableBusyOverlay } from "@/features/dashboard/transactions/layouts/TransactionsGrid/components/TransactionsDataSkeletons";
import { useDevPreviewMode } from "@/providers/DevPreviewModeProvider";

function Variant3Inner({ homeResponsiveSvgDeck = false }: { homeResponsiveSvgDeck?: boolean }) {
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
        <OverviewTopThreeHeroRow
          overviewLayout="3"
          newUserPrimaryCardCta={newUserEmpty}
          homeResponsiveSvgDeck={homeResponsiveSvgDeck}
        />

        <DemoSurfaceRegion className="mt-4" showActions>
          <WidgetCard
            title={tTx("title")}
            subtitle={tTx("subtitle")}
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

export default function OverviewVariant3({
  homeResponsiveSvgDeck = false,
}: {
  homeResponsiveSvgDeck?: boolean;
} = {}) {
  return (
    <DashboardDateRangeProvider>
      <DashboardRefreshProvider>
        <PrimaryDeckStackProvider>
          <Variant3Inner homeResponsiveSvgDeck={homeResponsiveSvgDeck} />
        </PrimaryDeckStackProvider>
      </DashboardRefreshProvider>
    </DashboardDateRangeProvider>
  );
}
