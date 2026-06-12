"use client";

import { DateRange } from "react-day-picker";
import { useTranslations } from "next-intl";
import { Calendar } from "lucide-react";
import { CardsSelector } from "./CardsSelector";
import { TransactionFilterDialog } from "./TransactionFilterDialog";
import { ExportTransactionsButton } from "./ExportTransactionsButton";
import { useTransactionActions } from "./hooks/useTransactionActions";
import type { Transaction, TransactionFormData, FilterData } from "../shared";

interface TransactionActionsProps {
  /** Array of transactions for export functionality */
  transactions?: Transaction[];
  /** Callback for date range selection */
  onDateRangeSelect?: (dateRange: DateRange | undefined) => void;
  /** Callback for filter action */
  onFiltersApply?: (filters: FilterData) => void;
  /** Callback for export action */
  onExportComplete?: () => void;
  /** Callback for add transaction action */
  onAddTransaction?: (transaction: TransactionFormData) => void;
  /** Cards for filter dropdown (All cards), shown to the left of date selector */
  cards?: { id: string; label: string }[];
  selectedCardIds?: string[];
  onSelectedCardIdsChange?: (ids: string[]) => void;
}

export default function TransactionActions({
  transactions = [],
  onDateRangeSelect,
  onFiltersApply,
  onExportComplete,
  onAddTransaction,
  cards = [],
  selectedCardIds = [],
  onSelectedCardIdsChange,
}: TransactionActionsProps) {
  const t = useTranslations("Transactions");

  const {
    handleFiltersApply,
    handleExportComplete,
  } = useTransactionActions({
    onDateRangeSelect,
    onFiltersApply,
    onExportComplete,
    onAddTransaction,
  });

  // Day-7 demo polish: replace the "May 01 — May 14, 2026" range picker
  // with a simple "Today, <date>" pill. Two reasons:
  //   1. Investors don't need a range picker on a freshly-signed-up demo
  //      account that has no historical data — the default range was
  //      confusing visual noise.
  //   2. Stating "Today, <date>" anchors the demo in real time without
  //      requiring user interaction.
  // The list itself still renders ALL transactions (no client-side date
  // filter applied) — we just don't show the picker. Post-pitch we can
  // bring the picker back as an OPTIONAL control behind a Filter button.
  const todayLabel = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="w-full mt-5 md:mt-0 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
      {cards.length > 0 && onSelectedCardIdsChange && (
        <CardsSelector
          cards={cards}
          selectedCardIds={selectedCardIds}
          onSelectedCardIdsChange={onSelectedCardIdsChange}
        />
      )}

      <div
        className="inline-flex h-8 items-center gap-2 rounded-[10px] border border-transparent bg-white/[0.04] px-3 text-[12px] text-[var(--color-text-primary)] whitespace-nowrap"
        aria-label={`Today, ${todayLabel}`}
      >
        <Calendar className="h-3.5 w-3.5 text-[var(--color-text-muted)]" aria-hidden />
        <span className="text-[var(--color-text-muted)]">Today,</span>
        <span className="font-medium">{todayLabel}</span>
      </div>

      <TransactionFilterDialog onApplyFilters={handleFiltersApply} />

      <ExportTransactionsButton
        transactions={transactions}
        onExportComplete={handleExportComplete}
      />
    </div>
  );
}
