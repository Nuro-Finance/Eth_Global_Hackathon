"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDownLeft, ChevronRight, Clock3 } from "lucide-react";
import DashboardHeader from "../DashboardGrid/components/DashboardHeader";
import { PrimaryDeckStackProvider } from "../DashboardGrid/context/PrimaryDeckStackContext";
import { DashboardDateRangeProvider } from "../DashboardGrid/context/DashboardDateRangeContext";
import { WidgetCard } from "../../shared";
import { useTransactionsState } from "@/features/dashboard/transactions/layouts/TransactionsGrid/hooks";
import {
  TransactionDetailModal,
  ExportTransactionsButton,
  TransactionsSearchInput,
} from "@/features/dashboard/transactions";
import { useDashboardDateRange } from "../DashboardGrid/context/DashboardDateRangeContext";
import { OverviewTopThreeHeroRow } from "./overviewHeroShared";
import { formatUsd } from "./overviewVariantUtils";

const EmbeddedTransactionsTable = dynamic(
  () => import("@/features/dashboard/transactions").then((m) => ({ default: m.TransactionsTable })),
  { ssr: false },
);

/**
 * Date range + transactions must read the same provider as `DashboardHeader` / `QuickActions`.
 * Hooks run above JSX in the parent, so `OverviewVariant2` only mounts the provider and defers logic here.
 */
function Variant2Inner() {
  const tTx = useTranslations("Transactions");
  const { dateRange } = useDashboardDateRange();
  const {
    transactions: ledgerTransactions,
    isLoading: ledgerTransactionsLoading,
    handleTransactionSelect,
    selectedTransaction,
    closeTransactionDetail,
    isTransactionDetailOpen,
  } = useTransactionsState({
    t: tTx,
    externalDateRange: dateRange,
  });
  const [transactionsSearch, setTransactionsSearch] = useState("");

  const income = 17843.33;
  const outcome = 15420.91;
  const expense = 14256.55;

  const budgetMonths = ["JUN", "JUL", "AUG", "SEP", "OCT", "NOV"] as const;
  const budgetBars = [
    { inc: 0.62, exp: 0.54 },
    { inc: 0.71, exp: 0.48 },
    { inc: 0.56, exp: 0.59 },
    { inc: 0.68, exp: 0.52 },
    { inc: 0.75, exp: 0.61 },
    { inc: 0.65, exp: 0.57 },
  ];

  const upcoming = [
    { id: "u1", label: "Netflix", sub: "Scheduled • May 6", amt: "-$15.99", tone: "out" as const },
    { id: "u2", label: "Spotify Premium", sub: "Scheduled • May 6", amt: "-$10.99", tone: "out" as const },
    { id: "u3", label: "Adobe Creative Cloud", sub: "Scheduled • May 7", amt: "-$59.99", tone: "out" as const },
    { id: "u4", label: "Electric utility", sub: "Scheduled • May 8", amt: "-$138.42", tone: "out" as const },
  ];

  return (
    <div className="relative">
      <DashboardHeader />

      <OverviewTopThreeHeroRow overviewLayout="2" />

      <div className="mt-4 grid w-full grid-cols-1 gap-4 xl:grid-cols-12 xl:items-stretch">
        <div className="min-w-0 xl:col-span-8">
          <WidgetCard
            title="Cashflow"
            subtitle="Income, outcome & expense"
            action={{ type: "dropdown", label: "6 months" }}
            fullHeight={false}
          >
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-[14px] bg-white/[0.04] px-3 py-3">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-white/60">Income</div>
                  <div className="mt-2">
                    <div className="text-[22px] font-semibold tracking-tight text-white">{formatUsd(income)}</div>
                  </div>
                </div>
                <div className="rounded-[14px] bg-white/[0.04] px-3 py-3">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-white/60">Outcome</div>
                  <div className="mt-2 text-[22px] font-semibold tracking-tight text-white">{formatUsd(outcome)}</div>
                </div>
                <div className="rounded-[14px] bg-white/[0.04] px-3 py-3">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-white/60">Expense</div>
                  <div className="mt-2">
                    <div className="text-[22px] font-semibold tracking-tight text-white">{formatUsd(expense)}</div>
                  </div>
                </div>
              </div>

              <div className="rounded-[14px] bg-white/[0.04] px-3 pb-3 pt-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">Income vs expense</span>
                  <div className="flex items-center gap-4 text-[10px] text-[var(--color-text-muted)]">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-[2px] bg-[var(--color-primary)]/85" aria-hidden /> Income
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-[2px] bg-white/30" aria-hidden /> Expense
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex items-end justify-between gap-2">
                  {budgetMonths.map((m, idx) => {
                    const pair = budgetBars[idx]!;
                    const max = 100;
                    return (
                      <div key={m} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                        <div className="flex h-[100px] w-full items-end justify-center gap-[3px]">
                          <div
                            className="w-[42%] max-w-[16px] rounded-t-[6px] bg-[var(--color-primary)]/70"
                            style={{ height: `${pair.inc * max}%` }}
                          />
                          <div
                            className="w-[42%] max-w-[16px] rounded-t-[6px] bg-white/18"
                            style={{ height: `${pair.exp * max}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-semibold text-[var(--color-text-muted)]">{m}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </WidgetCard>
        </div>

        <div className="min-h-0 min-w-0 xl:col-span-4 xl:flex xl:min-h-0 xl:flex-1 xl:flex-col xl:h-full">
          <WidgetCard
            title="Upcoming"
            subtitle="Next transfers & settlements"
            action={{ type: "link", label: "More" }}
            fullHeight={true}
            className="min-h-0 xl:flex-1"
          >
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              {upcoming.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className="flex min-h-0 flex-1 basis-0 cursor-pointer items-center gap-3 rounded-[14px] bg-white/[0.04] px-3 py-3 text-left transition-colors hover:bg-white/[0.04]"
                >
                  <UpcomingEventKindBadge tone={u.tone} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold leading-tight text-[var(--color-text-primary)]">{u.label}</div>
                    <div className="mt-1 truncate text-[11px] leading-snug text-[var(--color-text-muted)]">{u.sub}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                    <div className="text-[12px] font-semibold tabular-nums text-[var(--color-text-muted)]">{u.amt}</div>
                    <ChevronRight className="h-3.5 w-3.5 text-[var(--color-text-muted)]" aria-hidden />
                  </div>
                </button>
              ))}
            </div>
          </WidgetCard>
        </div>
      </div>

      <div className="mt-4">
        <WidgetCard
          title={tTx("title")}
          subtitle={tTx("subtitle")}
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
          <EmbeddedTransactionsTable
            variant="embedded"
            embeddedMaxRows={5}
            transactions={ledgerTransactions}
            isLoading={ledgerTransactionsLoading}
            onTransactionSelect={handleTransactionSelect}
            globalFilter={transactionsSearch}
            onGlobalFilterChange={setTransactionsSearch}
          />
        </WidgetCard>
      </div>

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

/** Inbound credit vs scheduled outgoing - no debit arrow; scheduled uses clock. */
function UpcomingEventKindBadge({ tone }: { tone: "in" | "out" }) {
  const shell = "flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-white/[0.04]";
  if (tone === "in") {
    return (
      <span className={shell} aria-hidden>
        <ArrowDownLeft className="h-4 w-4 text-[var(--color-success)] rtl:scale-x-[-1]" strokeWidth={2} aria-hidden />
      </span>
    );
  }
  return (
    <span className={shell} aria-hidden>
      <Clock3 className="h-4 w-4 text-[var(--color-text-muted)]" strokeWidth={2} aria-hidden />
    </span>
  );
}

export default function OverviewVariant2() {
  return (
    <DashboardDateRangeProvider>
      <PrimaryDeckStackProvider>
        <Variant2Inner />
      </PrimaryDeckStackProvider>
    </DashboardDateRangeProvider>
  );
}
