"use client";

import { useState, useCallback } from "react";
import type { Transaction } from "../../../shared";

/**
 * Shared state for opening the canonical transaction detail modal.
 */
export function useTransactionDetailModal() {
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  const handleTransactionSelect = useCallback((transaction: Transaction) => {
    setSelectedTransaction(transaction);
  }, []);

  const closeTransactionDetail = useCallback(() => {
    setSelectedTransaction(null);
  }, []);

  return {
    selectedTransaction,
    handleTransactionSelect,
    closeTransactionDetail,
    isTransactionDetailOpen: selectedTransaction != null,
  };
}
