"use client";

import { Table as TableType } from "@tanstack/react-table";
import { Transaction } from "../../types";
import { DesktopTable } from "./DesktopTable";

interface DataTableProps {
  table: TableType<Transaction>;
  columnsLength: number;
}

/**
 * DataTable - Responsive table component
 * Table is horizontally scrollable on mobile
 */
export function DataTable({ table, columnsLength }: DataTableProps) {
  return <DesktopTable table={table} columnsLength={columnsLength} />;
}

export default DataTable;
