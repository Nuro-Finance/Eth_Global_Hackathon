"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DateRange } from "react-day-picker";
import { Card } from "@/components/ui/card";
import { TransactionsTable, TransactionActions } from "../../../components";
import type {
  Transaction,
  TransactionFormData,
  FilterData,
} from "../../../shared";
import { useSession } from "next-auth/react";
import { TransactionsTableBusyOverlay } from "./TransactionsDataSkeletons";

interface TransactionsContentProps {
  transactions: Transaction[];
  isLoading: boolean;
  isRefreshing?: boolean;
  onTransactionSelect: (transaction: Transaction) => void;
  onDateRangeSelect: (dateRange: DateRange | undefined) => void;
  onFiltersApply: (filters: FilterData) => void;
  onExportComplete: () => void;
  onAddTransaction: (data: TransactionFormData) => void;
}

/**
 * TransactionsContent - Main transactions table with actions
 */
export function TransactionsContent({
  transactions,
  isLoading,
  isRefreshing = false,
  onTransactionSelect,
  onDateRangeSelect,
  onFiltersApply,
  onExportComplete,
  onAddTransaction,
}: TransactionsContentProps) {
  const t = useTranslations("Transactions");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { data: session } = useSession();
  const [cards, setCards] = useState<{id: string; label: string}[]>([]);
  useEffect(() => {
    const token = (session as any)?.accessToken;
    if (!token) return;
    fetch("/api/cards", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then((data: any) => {
        const arr = Array.isArray(data) ? data : data.cards || [];
        setCards(arr.map((c: any) => ({ id: c.id, label: c.cardHolder || c.card_holder || "Card" })));
      })
      .catch(() => {});
  }, [session]);

  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);

 // Initialize from URL (?cards=...) then localStorage
  useEffect(() => {
    const fromUrl = searchParams.get("cards");
    if (fromUrl) {
      const ids = fromUrl
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      setSelectedCardIds(ids);
      return;
    }

    try {
      const raw = window.localStorage.getItem("transactions:selectedCards");
      if (!raw) return;
      const ids = JSON.parse(raw);
      if (Array.isArray(ids)) setSelectedCardIds(ids.filter((x) => typeof x === "string"));
    } catch {
 // ignore
    }
 // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateSelectedCardIds = (ids: string[]) => {
    setSelectedCardIds(ids);
    try {
      window.localStorage.setItem("transactions:selectedCards", JSON.stringify(ids));
    } catch {
 // ignore
    }

    const next = new URLSearchParams(searchParams.toString());
    if (ids.length) next.set("cards", ids.join(","));
    else next.delete("cards");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const filteredTransactions = useMemo(() => {
    if (!selectedCardIds.length) return transactions;
    return transactions.filter((tx) => tx.cardId && selectedCardIds.includes(tx.cardId));
  }, [transactions, selectedCardIds]);

  const showInitialTableSkeleton = isLoading && filteredTransactions.length === 0;
  const showRefreshOverlay = isRefreshing && !showInitialTableSkeleton;

  return (
    <Card
      variant="default"
      size="lg"
      className="overflow-hidden border-none p-3 md:p-6 dark:!bg-[var(--color-bg-secondary)] !backdrop-blur-none dark:!backdrop-blur-none"
    >
      <div className="p-0 md:px-6 md:pt-0 md:pb-6 border-b border-[var(--color-border-primary)]">
        <div className="flex flex-col md:flex-row items-center justify-between">
          <div>
            <h2 className="text-[var(--color-text-primary)] text-xl font-semibold mb-2 whitespace-nowrap">
              {"Transactions"}
            </h2>
            <p className="text-[var(--color-text-muted)] text-sm whitespace-nowrap">
              {"View, search, and filter all your transactions"}
            </p>
          </div>

          <TransactionActions
            transactions={filteredTransactions}
            onDateRangeSelect={onDateRangeSelect}
            onFiltersApply={onFiltersApply}
            onExportComplete={onExportComplete}
            onAddTransaction={onAddTransaction}
            cards={cards}
            selectedCardIds={selectedCardIds}
            onSelectedCardIdsChange={updateSelectedCardIds}
          />
        </div>
      </div>

      <div className="relative p-0 md:p-6">
        <TransactionsTable
          transactions={filteredTransactions}
          onTransactionSelect={onTransactionSelect}
          isLoading={showInitialTableSkeleton}
        />
        {showRefreshOverlay ? <TransactionsTableBusyOverlay /> : null}
      </div>
    </Card>
  );
}
