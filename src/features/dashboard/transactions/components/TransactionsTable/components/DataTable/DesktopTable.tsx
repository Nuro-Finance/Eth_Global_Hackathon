"use client";

import {
  flexRender,
  Table as TableType,
  HeaderGroup,
  Header,
  Row,
  Cell,
} from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Transaction } from "../../types";

interface DesktopTableProps {
  table: TableType<Transaction>;
  columnsLength: number;
}

const COL_WIDTHS: Record<string, number> = {
  transaction: 28,
  amount: 16,
  category: 18,
  status: 16,
  date: 14,
  actions: 8,
};

const TABLE_SHELL_CLASS = cn(
  "w-full min-w-0 overflow-x-auto overflow-hidden rounded-[var(--radius-table)] border-0 [overflow-anchor:none]",
  "[&_thead_tr:first-child_th:first-child]:rounded-tl-[var(--radius-table)]",
  "[&_thead_tr:first-child_th:last-child]:rounded-tr-[var(--radius-table)]",
  "[&_tbody_tr:last-child_td:first-child]:rounded-bl-[var(--radius-table)]",
  "[&_tbody_tr:last-child_td:last-child]:rounded-br-[var(--radius-table)]"
);

function ColGroup({ table }: { table: TableType<Transaction> }) {
  const visible = table.getVisibleLeafColumns();
  const total = visible.reduce((s, c) => s + (COL_WIDTHS[c.id] ?? 0), 0);
  return (
    <colgroup>
      {visible.map((col) => {
        const w = total > 0 ? ((COL_WIDTHS[col.id] ?? 0) / total) * 100 : 0;
        return <col key={col.id} style={{ width: `${w.toFixed(1)}%` }} />;
      })}
    </colgroup>
  );
}

export function DesktopTable({ table, columnsLength }: DesktopTableProps) {
  const t = useTranslations("Transactions");
  const rows = table.getRowModel().rows;

  return (
    <div className={TABLE_SHELL_CLASS}>
      <table className="w-full min-w-full caption-bottom table-fixed border-separate border-spacing-0 text-sm">
        <ColGroup table={table} />
        <TableHeader className="border-b-0 border-transparent bg-transparent dark:border-b-0 [&_th]:bg-[rgba(255,255,255,0.04)] [&_th]:hover:!bg-[rgba(255,255,255,0.04)] [&_th_button]:bg-transparent [&_th_button]:hover:bg-transparent [&_tr]:border-b-0">
          {table
            .getHeaderGroups()
            .map((headerGroup: HeaderGroup<Transaction>) => (
              <TableRow
                key={headerGroup.id}
                noHover={true}
                className="!border-b-0 !bg-transparent hover:!bg-transparent"
              >
                {headerGroup.headers.map(
                  (header: Header<Transaction, unknown>, headerIndex, headers) => (
                    <TableHead
                      key={header.id}
                      className={cn(
                        "!h-auto whitespace-nowrap py-[11px]",
                        (header.id === "status" || header.id === "date") && "pl-6",
                        headerIndex === 0 && "rounded-tl-[var(--radius-table)]",
                        headerIndex === headers.length - 1 && "rounded-tr-[var(--radius-table)]"
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                    </TableHead>
                  )
                )}
              </TableRow>
            ))}
        </TableHeader>
        <TableBody>
          {rows.length > 0 ? (
            rows.map((row: Row<Transaction>) => (
              <TableRow
                key={row.id}
                noHover={true}
                data-state={row.getIsSelected() && "selected"}
                className={cn(
                  "!border-b-0 !bg-transparent even:!bg-transparent",
                  "[&_td]:transition-colors [&_td]:duration-150",
                  row.index % 2 === 1
                    ? "[&_td]:bg-[rgba(255,255,255,0.04)] hover:[&_td]:!bg-[color-mix(in_srgb,white_1%,rgba(255,255,255,0.04))]"
                    : "[&_td]:bg-[rgba(255,255,255,0.02)] hover:[&_td]:!bg-[color-mix(in_srgb,white_1%,rgba(255,255,255,0.02))]",
                )}
              >
                {row
                  .getVisibleCells()
                  .map((cell: Cell<Transaction, unknown>, cellIndex, cells) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        "whitespace-nowrap px-4 py-[11px] align-middle",
                        (cell.column.id === "status" || cell.column.id === "date") && "pl-6",
                        row.index === rows.length - 1 && cellIndex === 0 && "rounded-bl-[var(--radius-table)]",
                        row.index === rows.length - 1 && cellIndex === cells.length - 1 && "rounded-br-[var(--radius-table)]"
                      )}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
              </TableRow>
            ))
          ) : (
            <TableRow noHover={true} className="!border-b-0">
              <TableCell
                colSpan={columnsLength}
                className="h-24 rounded-b-[var(--radius-table)] bg-[rgba(255,255,255,0.02)] text-center text-[var(--color-text-muted)]"
              >
                {t("noResults") || "No results found."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </table>
    </div>
  );
}

export default DesktopTable;
