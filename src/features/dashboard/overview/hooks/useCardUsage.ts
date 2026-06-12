"use client";

/**
 * useCardUsage — computes the Card Usage panel's data from real card_transactions.
 *
 * Replaces the EMPTY_CARD_USAGE production fallback (which left the panel
 * showing $0 used / $0 limit / no categories — visually empty in the
 * demo). Now derives:
 *
 * - dailyUsed: today's outgoing transactions, summed
 * - dailyCap: 0 for now -- real card-level spending caps need a backend
 * aggregation (post-pitch)
 * - categories: top 4 categories from the last 30 days, sorted by share
 *
 * Output shape matches CardUsageLimitsPanel's expected `data` prop:
 * { dailyUsed: number, dailyCap: number,
 * categories: { key: string; share: number; label: string }[] }
 */

import { useMemo } from "react";
import { useTransactionsState } from "@/features/dashboard/transactions/layouts/TransactionsGrid/hooks";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface CardUsageData {
  dailyUsed: number;
  dailyCap: number;
  categories: { key: string; share: number; label: string }[];
}

const EMPTY: CardUsageData = {
  dailyUsed: 0,
  dailyCap: 0,
  categories: [],
};

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface UseCardUsageOptions {
 /** Optional cardId to filter transactions to one specific card. */
  cardId?: string;
}

export function useCardUsage(options: UseCardUsageOptions = {}): CardUsageData {
  const { transactions, isLoading } = useTransactionsState({
    t: (k: string) => k,
  });

  return useMemo<CardUsageData>(() => {
    if (isLoading || !transactions || transactions.length === 0) {
      return EMPTY;
    }

 // Filter to a specific card if requested
    const tx = options.cardId
      ? transactions.filter((t) => (t as { cardId?: string }).cardId === options.cardId)
      : transactions;

    if (tx.length === 0) return EMPTY;

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const thirtyAgo = new Date(now.getTime() - 30 * MS_PER_DAY);

    let dailyUsed = 0;
    const byCategory: Record<string, number> = {};
    let categoryTotal = 0;

    for (const t of tx) {
      if (t.isIncoming) continue;
      if (t.status && t.status !== "completed") continue;

      const txDate = new Date(t.date);
      if (Number.isNaN(txDate.getTime())) continue;

 // Today's spending -> dailyUsed
      if (txDate >= todayStart) {
        dailyUsed += t.amount;
      }

 // Last 30 days -> category breakdown
      if (txDate >= thirtyAgo) {
        const cat = (t.category || "other").toLowerCase();
        byCategory[cat] = (byCategory[cat] || 0) + t.amount;
        categoryTotal += t.amount;
      }
    }

    const categories = Object.entries(byCategory)
      .map(([key, amount]) => {
        const share = categoryTotal > 0
          ? Math.round((amount / categoryTotal) * 100)
          : 0;
        return {
          key,
          share,
          label: `${capitalize(key)} (${share}%)`,
        };
      })
      .sort((a, b) => b.share - a.share)
      .slice(0, 4);

    return {
      dailyUsed,
 // dailyCap stays 0 until /api/cards/{id}/usage exposes real spending
 // caps -- post-May-14 backend work.
      dailyCap: 0,
      categories,
    };
  }, [transactions, isLoading, options.cardId]);
}
