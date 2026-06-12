import { useState } from "react";
import { DateRange } from "react-day-picker";

interface FilterData {
  category: string;
  status: string;
  type: string;
}

interface TransactionFormData {
  name: string;
  amount: string;
  type: string;
  category: string;
  isIncoming: boolean;
}

interface UseTransactionActionsProps {
  onDateRangeSelect?: (dateRange: DateRange | undefined) => void;
  onFiltersApply?: (filters: FilterData) => void;
  onExportComplete?: () => void;
  onAddTransaction?: (transaction: TransactionFormData) => void;
}

export function useTransactionActions({
  onDateRangeSelect,
  onFiltersApply,
  onExportComplete,
  onAddTransaction,
}: UseTransactionActionsProps) {
  const [selectedDateRange, setSelectedDateRange] = useState<DateRange | undefined>();
  const [appliedFilters, setAppliedFilters] = useState<FilterData>({
    category: "",
    status: "",
    type: "",
  });

  const handleDateRangeSelect = (dateRange: DateRange | undefined) => {
    console.log("Date range selected:", dateRange);
    setSelectedDateRange(dateRange);
    onDateRangeSelect?.(dateRange);
  };

  const handleFiltersApply = (filters: FilterData) => {
    console.log("Filters applied:", filters);
    setAppliedFilters(filters);
    onFiltersApply?.(filters);
  };

  const handleAddTransaction = (transactionData: TransactionFormData) => {
    console.log("Transaction added:", {
      name: transactionData.name,
      amount: parseFloat(transactionData.amount),
      type: transactionData.type,
      category: transactionData.category,
      isIncoming: transactionData.isIncoming,
    });
    onAddTransaction?.(transactionData);
  };

  const handleExportComplete = () => {
    console.log("Export completed");
    onExportComplete?.();
  };

  const clearDateRange = () => {
    setSelectedDateRange(undefined);
    onDateRangeSelect?.(undefined);
  };

  const clearFilters = () => {
    const emptyFilters = {
      category: "",
      status: "",
      type: "",
    };
    setAppliedFilters(emptyFilters);
    onFiltersApply?.(emptyFilters);
  };

  const hasActiveFilters = () => {
    return (
      selectedDateRange !== undefined ||
      appliedFilters.category !== "" ||
      appliedFilters.status !== "" ||
      appliedFilters.type !== ""
    );
  };

  return {
    // State
    selectedDateRange,
    appliedFilters,
    
    // Actions
    handleDateRangeSelect,
    handleFiltersApply,
    handleAddTransaction,
    handleExportComplete,
    
    // Utilities
    clearDateRange,
    clearFilters,
    hasActiveFilters,
  };
}
