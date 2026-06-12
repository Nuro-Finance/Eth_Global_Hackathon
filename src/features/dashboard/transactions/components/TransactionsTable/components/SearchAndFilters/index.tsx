"use client";
import { useState } from "react";

import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import { ColumnFiltersState, ColumnFilter } from "@tanstack/react-table";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/Input";
import { QuickFilter } from "../../types";

interface SearchAndFiltersProps {
  globalFilter: string;
  setGlobalFilter: (value: string) => void;
  columnFilters: ColumnFiltersState;
  setColumnFilters: (filters: ColumnFiltersState) => void;
  clearAllFilters: () => void;
}

/**
 * SearchAndFilters - Search bar and quick filter badges
 */
export function SearchAndFilters({
  globalFilter,
  setGlobalFilter,
  columnFilters,
  setColumnFilters,
  clearAllFilters,
}: SearchAndFiltersProps) {
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const t = useTranslations("Transactions");

 // Quick filter options — match actual DB transaction types
  const quickFilters: QuickFilter[] = [
    { label: "Income", key: "income", transactionType: "deposit" },
    { label: "Debits", key: "debits", transactionType: "purchase" },
    { label: "Withdraw", key: "withdraw", transactionType: "withdrawal" },
    { label: "Complete", key: "completed", status: t("completed") },
  ];

 // Toggle category filter
  const toggleFilter = (filter: QuickFilter) => {
    if (filter.category) {
      const currentFilters =
        (columnFilters.find((f: ColumnFilter) => f.id === "category")
          ?.value as string[]) || [];
      const newFilters = currentFilters.includes(filter.category)
        ? currentFilters.filter((c) => c !== filter.category)
        : [...currentFilters, filter.category];

      setColumnFilters([
        ...columnFilters.filter((f: ColumnFilter) => f.id !== "category"),
        ...(newFilters.length > 0
          ? [{ id: "category", value: newFilters }]
          : []),
      ]);
    } else if (filter.status) {
      const currentFilters =
        (columnFilters.find((f: ColumnFilter) => f.id === "status")
          ?.value as string[]) || [];
      const newFilters = currentFilters.includes(filter.status)
        ? currentFilters.filter((s) => s !== filter.status)
        : [...currentFilters, filter.status];

      setColumnFilters([
        ...columnFilters.filter((f: ColumnFilter) => f.id !== "status"),
        ...(newFilters.length > 0 ? [{ id: "status", value: newFilters }] : []),
      ]);
    } else if (filter.transactionType) {
      const currentFilters =
        (columnFilters.find((f: ColumnFilter) => f.id === "type")
          ?.value as string[]) || [];
      const newFilters = currentFilters.includes(filter.transactionType)
        ? currentFilters.filter((s) => s !== filter.transactionType)
        : [...currentFilters, filter.transactionType];

      setColumnFilters([
        ...columnFilters.filter((f: ColumnFilter) => f.id !== "type"),
        ...(newFilters.length > 0 ? [{ id: "type", value: newFilters }] : []),
      ]);
    }
  };

 // Check if filter is active
  const isFilterActive = (filter: QuickFilter) => {
    if (filter.category) {
      const categoryFilters =
        (columnFilters.find((f: ColumnFilter) => f.id === "category")
          ?.value as string[]) || [];
      return categoryFilters.includes(filter.category);
    }
    if (filter.status) {
      const statusFilters =
        (columnFilters.find((f: ColumnFilter) => f.id === "status")
          ?.value as string[]) || [];
      return statusFilters.includes(filter.status);
    }
    if (filter.transactionType) {
      const typeFilters =
        (columnFilters.find((f: ColumnFilter) => f.id === "type")
          ?.value as string[]) || [];
      return typeFilters.includes(filter.transactionType);
    }
    return false;
  };

  const showClear = Boolean(globalFilter || columnFilters.length > 0);

  return (
    <div className="space-y-4 [overflow-anchor:none] lg:space-y-5 pl-3 pt-0">
      <div className="grid grid-cols-1 gap-y-3 lg:grid-cols-[auto_1fr] lg:gap-x-3 lg:gap-y-4 lg:items-start">
        <span
          className="block text-sm text-white/70 font-medium lg:row-start-1 lg:col-start-1"
        >
          {t("quickFilters") || "Quick filters"}
        </span>

        <div className="relative flex min-h-[40px] flex-wrap items-center justify-between gap-3 lg:row-start-2 lg:col-span-2 lg:col-start-1">
          {/* Default left-side filters (hidden when mobile search is expanded) */}
          <div className={cn("flex flex-wrap items-center gap-1.5 lg:gap-2", isSearchExpanded ? "hidden sm:flex" : "flex")}>
            {quickFilters.map((filter) => (
              <Badge
                key={filter.key}
                variant="plain"
                className={cn(
                  "cursor-pointer text-xs lg:text-sm transition-all duration-200 px-3 backdrop-blur-none",
                  isFilterActive(filter)
                    ? "bg-[var(--filter-active-bg)] border-transparent text-[var(--filter-active-text)] hover:bg-[var(--filter-active-bg-hover)]"
                    : "bg-[var(--filter-bg)] border-[var(--filter-border)] text-[var(--filter-text)] hover:bg-[var(--filter-hover-bg)] hover:text-[var(--filter-hover-text)]",
                )}
                style={{ height: '32px' }}
                onClick={() => toggleFilter(filter)}
              >
                {filter.label}
              </Badge>
            ))}
          </div>

          <div className={cn("flex items-center gap-2 ml-auto", isSearchExpanded ? "w-full sm:w-auto" : "w-auto")}>
            {/* Mobile Expanded Search Bar */}
            {isSearchExpanded && (
              <div className="relative flex w-full items-center gap-2 sm:hidden">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--color-text-muted)] w-4 h-4" />
                  <input
                    autoFocus
                    type="text"
                    placeholder={t("search") || "Search..."}
                    value={globalFilter ?? ""}
                    onChange={(e) => setGlobalFilter(e.target.value)}
                    className="h-9 w-full rounded-[var(--radius-sm)] border border-transparent bg-[var(--color-bg-input)] pl-10 pr-4 text-sm text-[var(--color-text-primary)] backdrop-blur-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-border-input-focus)] focus:outline-none"
                  />
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setIsSearchExpanded(false); setGlobalFilter(""); }} className="px-2">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            )}

            {/* Desktop / Desktop + Tablet Standard UI (hidden on mobile if expanded) */}
            <div className={cn("flex items-center gap-2", isSearchExpanded ? "hidden sm:flex" : "flex")}>
              <div className="flex h-8 shrink-0 items-center justify-end">
                <button
                  type="button"
                  tabIndex={showClear ? 0 : -1}
                  aria-hidden={!showClear}
                  onClick={() => {
                    if (showClear) clearAllFilters();
                  }}
                  className={cn(
                    "flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--filter-border)] bg-[var(--filter-bg)] px-3 py-1.5 text-sm text-[var(--filter-text)] backdrop-blur-none transition-all duration-200 hover:bg-[var(--filter-hover-bg)] hover:text-[var(--filter-hover-text)]",
                    !showClear && "invisible pointer-events-none",
                  )}
                  style={{ height: "32px" }}
                >
                  <span className="hidden sm:inline">{t("clearAll") || "Clear all"}</span>
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Mobile Search Icon (toggles expanded state) */}
              <div className="flex h-8 w-auto items-center justify-end sm:hidden">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsSearchExpanded(true)}
                  className="h-8 w-8 text-[var(--color-text-muted)]"
                >
                  <Search className="w-5 h-5" />
                </Button>
              </div>

              {/* Tablet/Desktop Search Input */}
              <div className="relative hidden sm:block sm:w-36 lg:w-48 xl:w-56">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--color-text-muted)] w-4 h-4 z-10" />
                <input
                  type="text"
                  placeholder={t("search") || "Search..."}
                  value={globalFilter ?? ""}
                  onChange={(e) => setGlobalFilter(e.target.value)}
                  className="h-8 w-full rounded-[var(--radius-sm)] border border-transparent bg-[var(--color-bg-input)] pl-10 pr-4 text-sm text-[var(--color-text-primary)] backdrop-blur-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-border-input-focus)] focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SearchAndFilters;
