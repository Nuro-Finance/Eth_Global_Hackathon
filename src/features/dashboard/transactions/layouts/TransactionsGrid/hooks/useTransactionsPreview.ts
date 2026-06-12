"use client";

import { useMemo } from "react";
import { MOCK_UPCOMING_TRANSACTIONS } from "@/config/mock-data";
import { shouldUseDevPopulatedData } from "@/lib/devPreviewMode";
import type { Transaction } from "../../../shared";

function byDateDesc(a: Transaction, b: Transaction) {
  return new Date(b.date).getTime() - new Date(a.date).getTime();
}

export function useTransactionsPreview(transactions: Transaction[]) {
  return useMemo(() => {
    const recent = [...transactions].sort(byDateDesc).slice(0, 3);

    const upcoming = shouldUseDevPopulatedData() ? MOCK_UPCOMING_TRANSACTIONS : [];

    return { recent, upcoming };
  }, [transactions]);
}
