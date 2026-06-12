"use client";

import { TransactionItem } from "./TransactionItem";
import { type TransactionData } from "../config/transactions.config";

interface TransactionGroupProps {
  label: string;
  transactions: TransactionData[];
  translateType: (type: string) => string;
  hideOnMobile?: boolean;
}

/**
 * Group of transactions with a date/label header
 */
export function TransactionGroup({
  label,
  transactions,
  translateType,
  hideOnMobile = false,
}: TransactionGroupProps) {
  const containerClass = hideOnMobile ? "hidden sm:block" : "";
  const marginClass = hideOnMobile ? "mt-4 sm:mt-5" : "";

  return (
    <div className={`${containerClass} ${marginClass}`}>
      <div className="text-[var(--color-text-muted)] text-[11px] sm:text-[12px] font-medium uppercase tracking-wide mb-2 sm:mb-3">
        {label}
      </div>
      <div className="space-y-0">
        {transactions.map((transaction, index) => (
          <TransactionItem
            key={index}
            {...transaction}
            type={translateType(transaction.type)}
          />
        ))}
      </div>
    </div>
  );
}
