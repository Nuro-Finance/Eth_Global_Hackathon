"use client";

/**
 * useCashFlowData - aggregates real card_transactions into 11-bucket arrays
 * for the HeroCashFlowPanel chart. Replaces Chris's hardcoded CHART_DATA_INCOME
 * / CHART_DATA_EXPENSE constants with real data driven by the existing
 * useTransactionsState hook (which fetches /api/transactions with auth).
 *
 * Output shape matches what HeroCashFlowPanel expects:
 * {
 * income: { Daily: number[11], Weekly: number[11], Monthly: number[11] },
 * expense: { Daily: number[11], Weekly: number[11], Monthly: number[11] },
 * isLoading: boolean,
 * }
 *
 * Buckets are anchored at "now" -- index 10 = current period, index 0 = 10
 * periods ago. Empty / missing periods => 0. Status filter: only "completed"
 * transactions count toward income / expense.
 */

import { useMemo } from "react";
import type { DateRange } from "react-day-picker";
import { useTransactionsState } from "@/features/dashboard/transactions/layouts/TransactionsGrid/hooks";

export const CHART_BUCKET_COUNT = 11;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

const ZERO_BUCKETS: readonly number[] = Array(CHART_BUCKET_COUNT).fill(0);
const FALLBACK_RANGES: Record<"Daily" | "Weekly" | "Monthly", readonly number[]> = {
  Daily: ZERO_BUCKETS,
  Weekly: ZERO_BUCKETS,
  Monthly: ZERO_BUCKETS,
};

type BucketSize = "day" | "week" | "month";
type TxLike = { date: string; amount: number; isIncoming: boolean; status?: string };

/** Floor a Date to the start of its day / week (Sunday) / month. */
function startOfBucket(d: Date, size: BucketSize): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  if (size === "week") {
    out.setDate(out.getDate() - out.getDay()); // Sunday
  } else if (size === "month") {
    out.setDate(1);
  }
  return out;
}

/**
 * HeroCashFlowPanel renders bars at indices 1..9 (skipping 0 and 10 as
 * leading/trailing phantom slots). For the chart's "current period" bar
 * (rightmost visible, default-selected) to map to today's bucket, we put
 * today at index 9 and 8-periods-ago at index 1. Indices 0 and 10 stay 0.
 *
 * Index 9 = today. Index 1 = 8 periods ago. diff > 8 -> dropped.
 */
function bucketIndex(txStart: Date, currentStart: Date, size: BucketSize): number {
  let diff: number;
  if (size === "day") {
    diff = Math.round((currentStart.getTime() - txStart.getTime()) / MS_PER_DAY);
  } else if (size === "week") {
    diff = Math.round((currentStart.getTime() - txStart.getTime()) / MS_PER_WEEK);
  } else {
    const yrDiff = currentStart.getFullYear() - txStart.getFullYear();
    const moDiff = currentStart.getMonth() - txStart.getMonth();
    diff = yrDiff * 12 + moDiff;
  }
  return CHART_BUCKET_COUNT - 2 - diff;
}

function bucketTransactions(
  transactions: readonly TxLike[],
  matches: (tx: TxLike) => boolean,
  size: BucketSize,
): readonly number[] {
  const now = new Date();
  const currentStart = startOfBucket(now, size);
  const buckets = Array<number>(CHART_BUCKET_COUNT).fill(0);

  for (const tx of transactions) {
    if (!matches(tx)) continue;
 // Status filter: only "completed" counts. Pending / failed shouldn't move
 // the chart (matches ops tools funnel logic).
    if (tx.status && tx.status !== "completed") continue;

    const txDate = new Date(tx.date);
    if (Number.isNaN(txDate.getTime())) continue;

    const txStart = startOfBucket(txDate, size);
    const idx = bucketIndex(txStart, currentStart, size);
    if (idx < 0 || idx >= CHART_BUCKET_COUNT) continue;

    buckets[idx] += tx.amount;
  }

  return buckets;
}

interface UseCashFlowDataOptions {
 /** Optional translation function (passed through to useTransactionsState). */
  t?: (key: string) => string;
 /** Optional external date range passed to useTransactionsState. */
  externalDateRange?: DateRange;
}

export interface CashFlowData {
  income: Record<"Daily" | "Weekly" | "Monthly", readonly number[]>;
  expense: Record<"Daily" | "Weekly" | "Monthly", readonly number[]>;
  isLoading: boolean;
  isRefreshing: boolean;
}

export function useCashFlowData(options: UseCashFlowDataOptions = {}): CashFlowData {
  const t = options.t ?? ((key: string) => key);
  const { transactions, isLoading, isRefreshing } = useTransactionsState({
    t,
    externalDateRange: options.externalDateRange,
  });

  return useMemo<CashFlowData>(() => {
    if (!transactions || transactions.length === 0) {
      return {
        income: FALLBACK_RANGES,
        expense: FALLBACK_RANGES,
        isLoading,
        isRefreshing,
      };
    }

    const isIncome = (tx: TxLike) => tx.isIncoming === true;
    const isExpense = (tx: TxLike) => tx.isIncoming === false;

    return {
      income: {
        Daily: bucketTransactions(transactions, isIncome, "day"),
        Weekly: bucketTransactions(transactions, isIncome, "week"),
        Monthly: bucketTransactions(transactions, isIncome, "month"),
      },
      expense: {
        Daily: bucketTransactions(transactions, isExpense, "day"),
        Weekly: bucketTransactions(transactions, isExpense, "week"),
        Monthly: bucketTransactions(transactions, isExpense, "month"),
      },
      isLoading,
      isRefreshing,
    };
  }, [transactions, isLoading, isRefreshing]);
}
