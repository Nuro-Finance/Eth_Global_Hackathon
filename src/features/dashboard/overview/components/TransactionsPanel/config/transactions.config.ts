// 2026-05-07: removed `transactionsData` array of fake names
// (Pierre DC / Alessandro VN / Alex VVW / Tiago DMF / Sofia VL).
// Was exported but had no consumer. Real transactions flow through
// /api/transactions per the Pending-Tasks T8 follow-up.

export interface TransactionData {
  name: string;
  type: string;
  amount: string;
  isIncoming: boolean;
  token?: string | null;
  sourceChain?: number | null;
}

// Transaction groups configuration -- kept since UI still references the
// labels (today / dated buckets). Slice indices left unchanged so a future
// real-data wiring can drop in without rewriting the consumer.
export const transactionGroups = {
  today: {
    labelKey: "Dashboard.today",
    defaultLabel: "Today",
    slice: [0, 3] as [number, number],
  },
  dated: {
    label: "19/09/2024",
    slice: [3, 5] as [number, number],
    hideOnMobile: true,
  },
};
