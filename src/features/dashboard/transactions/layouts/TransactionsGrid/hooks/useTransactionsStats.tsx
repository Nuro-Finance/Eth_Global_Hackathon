"use client";

import { useMemo } from "react";
import { ArrowDownLeft, ArrowUpRight, TrendingUp, Calculator } from "lucide-react";
import type { StatData } from "@/components";
import type { Transaction } from "../../../shared";

/**
 * Hook for calculating transaction statistics
 */
export function useTransactionsStats(
    transactions: Transaction[],
    t: (key: string) => string
) {
    return useMemo(() => {
        const totalIncome = transactions
            .filter((tx) => tx.isIncoming)
            .reduce((sum, tx) => sum + tx.amount, 0);

        const totalExpenses = transactions
            .filter((tx) => !tx.isIncoming)
            .reduce((sum, tx) => sum + tx.amount, 0);

        const netFlow = totalIncome - totalExpenses;

        const avgTransactionAmount =
            transactions.length > 0
                ? transactions.reduce((sum, tx) => sum + tx.amount, 0) / transactions.length
                : 0;

        const stats: StatData[] = [
            {
                id: "totalIncome",
                title: t("totalIncome"),
                value: `$${totalIncome.toFixed(2)}`,
                change: 0,
                isPositive: true,
                showChange: false,
                icon: <ArrowDownLeft className="w-5 h-5 text-[var(--color-success)]" />,
            },
            {
                id: "totalExpenses",
                title: t("totalExpenses"),
                value: `$${totalExpenses.toFixed(2)}`,
                change: 0,
                isPositive: false,
                showChange: false,
                icon: <ArrowUpRight className="w-5 h-5 text-[var(--color-error)]" />,
            },
            {
                id: "netFlow",
                title: t("netFlow"),
                value: `${netFlow >= 0 ? "+" : ""}$${netFlow.toFixed(2)}`,
                change: 0,
                isPositive: netFlow >= 0,
                showChange: false,
                icon: <TrendingUp className="w-5 h-5 text-[var(--color-info)]" />,
            },
            {
                id: "averageAmount",
                title: t("averageAmount"),
                value: `$${avgTransactionAmount.toFixed(2)}`,
                change: 0,
                isPositive: true,
                showChange: false,
                icon: <Calculator className="w-5 h-5 text-[var(--color-nuro-brand)]" />,
            },
        ];

        return stats;
    }, [transactions, t]);
}
