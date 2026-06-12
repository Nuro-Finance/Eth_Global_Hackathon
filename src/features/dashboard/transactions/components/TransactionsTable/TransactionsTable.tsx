"use client";

import React, { useState, useLayoutEffect, useRef } from "react";
import {
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  SortingState,
  ColumnFiltersState,
  VisibilityState,
} from "@tanstack/react-table";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { TransactionsTableProps } from "./types";
import { useTableColumns } from "./hooks";
import {
  DataTable,
  SearchAndFilters,
  TablePagination,
  LoadingState,
} from "./components";
function buildColumnVisibility(hiddenColumns?: string[]): VisibilityState {
  const vis: VisibilityState = { type: false, category: true, status: true };
  if (hiddenColumns) {
    for (const col of hiddenColumns) vis[col] = false;
  }
  return vis;
}

const cascadeVariants = {
  initial: { opacity: 0, y: -12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.33, 1, 0.68, 1],
    },
  },
};

/**
 * TransactionsTable - Main transactions table component
 * Features: sorting, filtering, pagination, and responsive design
 */
const EMBEDDED_DEFAULT_ROWS = 5;

/**
 * Embedded table is mounted one frame after layout so `useReactTable` does not
 * dispatch internal updates while the host tree is still committing (React 19 /
 * Strict Mode: "Can't perform a React state update on a component that hasn't
 * mounted yet" from @tanstack/table-core).
 */
function TransactionsTableEmbeddedGate(props: TransactionsTableProps) {
  const [tableReady, setTableReady] = useState(false);
  useLayoutEffect(() => {
    setTableReady(true);
  }, []);
  if (!tableReady) {
    return (
      <div
        className="min-h-0 w-full shrink-0 [overflow-anchor:none]"
        aria-busy="true"
      >
        <div className="h-[200px] w-full min-w-0 rounded-[var(--radius-table)] bg-[var(--color-bg-secondary)]" />
      </div>
    );
  }
  return <TransactionsTableCore {...props} />;
}

function TransactionsTableCore({
  transactions,
  onTransactionSelect,
  isLoading = false,
  variant = "default",
  embeddedMaxRows = EMBEDDED_DEFAULT_ROWS,
  hiddenColumns,
  globalFilter: globalFilterProp,
  onGlobalFilterChange,
  statusCompact = false,
  showPaginationItemsInfo = true,
}: TransactionsTableProps) {
 // Table state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() =>
    buildColumnVisibility(hiddenColumns),
  );
  const [internalGlobalFilter, setInternalGlobalFilter] = useState("");
  const globalFilter = globalFilterProp ?? internalGlobalFilter;

 // Guard controlled table callbacks until after mount (layout) so TanStack
 // cannot synchronously bounce updates before this fiber has committed.
  const isMounted = useRef(false);
  useLayoutEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const safeSetSorting = React.useCallback((updater: any) => {
    if (isMounted.current) setSorting(updater);
  }, []);

  const safeSetColumnFilters = React.useCallback((updater: any) => {
    if (isMounted.current) setColumnFilters(updater);
  }, []);

  const safeSetColumnVisibility = React.useCallback((updater: any) => {
    if (isMounted.current) setColumnVisibility(updater);
  }, []);

  useLayoutEffect(() => {
    setColumnVisibility(buildColumnVisibility(hiddenColumns));
  }, [hiddenColumns]);

  const safeSetGlobalFilter = React.useCallback(
    (updater: string | ((prev: string) => string)) => {
      if (!isMounted.current) return;
      const next = typeof updater === "function" ? updater(globalFilter) : updater;
      if (onGlobalFilterChange) onGlobalFilterChange(next);
      else setInternalGlobalFilter(next);
    },
    [globalFilter, onGlobalFilterChange],
  );

 // Get table columns
  const columns = useTableColumns({
    onTransactionSelect,
    variant: variant === "embedded" ? "default" : variant,
    statusCompact,
  });

  const embeddedPageSize = Math.max(1, embeddedMaxRows);
  const tableData = transactions;

 // Clear all filters
  const clearAllFilters = () => {
    safeSetGlobalFilter("");
    setColumnFilters([]);
  };

  const table = useReactTable({
    data: tableData,
    columns,
    onSortingChange: safeSetSorting,
    onColumnFiltersChange: safeSetColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: safeSetColumnVisibility,
    onGlobalFilterChange: safeSetGlobalFilter,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      globalFilter,
    },
    initialState: {
      pagination: {
        pageSize: variant === "embedded" ? embeddedPageSize : 10,
      },
    },
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (isLoading) {
    return <LoadingState />;
  }

  const columnsLength = table.getVisibleLeafColumns().length;
  const dataTableInner = (
    <div className="w-full min-w-0 shrink-0 [overflow-anchor:none]">
      <DataTable
        table={table}
        columnsLength={columnsLength}
      />
    </div>
  );

  if (variant === "embedded") {
    return (
      <div className="flex w-full max-w-full flex-col gap-3 [overflow-anchor:none]">
        <div className="min-h-0 shrink-0 [overflow-anchor:none]">{dataTableInner}</div>
        <div className="flex shrink-0 flex-col justify-start">
          <TablePagination
            table={table}
            pageSizes={[5, 10, 20]}
            showItemsInfo={showPaginationItemsInfo}
          />
        </div>
      </div>
    );
  }

  const tableBlock = (
    <motion.div className="w-full min-w-0" variants={cascadeVariants}>{dataTableInner}</motion.div>
  );

  return (
    <div className="flex w-full max-w-full flex-col gap-4 [overflow-anchor:none] lg:gap-5">
      <motion.div className="shrink-0 [overflow-anchor:none]" variants={cascadeVariants}>
        <SearchAndFilters
          globalFilter={globalFilter}
          setGlobalFilter={safeSetGlobalFilter}
          columnFilters={columnFilters}
          setColumnFilters={setColumnFilters}
          clearAllFilters={clearAllFilters}
        />
      </motion.div>

      {tableBlock}

      <motion.div
        className={cn(
          "flex shrink-0 flex-col justify-start",
          variant === "modal" && "px-[20px]",
        )}
        variants={cascadeVariants}
      >
        <TablePagination table={table} />
      </motion.div>
    </div>
  );
}

export function TransactionsTable(props: TransactionsTableProps) {
  if (props.isLoading) {
    return <LoadingState />;
  }
  if (props.variant === "embedded") {
    return <TransactionsTableEmbeddedGate {...props} />;
  }
  return <TransactionsTableCore {...props} />;
}

export default TransactionsTable;
