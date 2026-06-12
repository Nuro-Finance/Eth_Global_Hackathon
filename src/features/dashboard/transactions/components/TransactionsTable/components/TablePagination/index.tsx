"use client";

import { useTranslations } from "next-intl";
import { Table as TableType } from "@tanstack/react-table";
import { Pagination } from "@/components/ui/pagination";
import { Transaction } from "../../types";

interface TablePaginationProps {
  table: TableType<Transaction>;
  pageSizes?: number[];
  showItemsInfo?: boolean;
}

/**
 * TablePagination - Pagination controls for the transactions table
 * Uses the reusable Pagination component from @/components/ui
 */
export function TablePagination({
  table,
  pageSizes = [10, 20, 50],
  showItemsInfo = true,
}: TablePaginationProps) {
  const t = useTranslations("Transactions");

  const pagination = {
    pageIndex: table.getState().pagination.pageIndex,
    pageSize: table.getState().pagination.pageSize,
    totalItems: table.getFilteredRowModel().rows.length,
  };

  const handlePageChange = (pageIndex: number) => {
    table.setPageIndex(pageIndex);
  };

  const handlePageSizeChange = (pageSize: number) => {
    table.setPageSize(pageSize);
    table.setPageIndex(0);
  };

  return (
    <Pagination
      pagination={pagination}
      onPageChange={handlePageChange}
      onPageSizeChange={handlePageSizeChange}
      pageSizes={pageSizes}
      showPageNumbers={true}
      showItemsInfo={showItemsInfo}
      visiblePageCount={5}
      showingLabel={t("showing")}
      toLabel={t("to")}
      ofLabel={t("of")}
      itemsLabel={t("transactions")}
      previousLabel={t("previous")}
      nextLabel={t("next")}
    />
  );
}

export default TablePagination;
