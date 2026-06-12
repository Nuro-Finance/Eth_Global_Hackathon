"use client";

import {
  ArrowUpRight,
  ArrowDownLeft,
  ArrowUpDown,
  Download,
  Eye,
  MoreHorizontal,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  WALLET_GLASS_MENU_CONTENT,
  WALLET_GLASS_MENU_ITEM_ROW_BASE,
  WALLET_GLASS_MENU_ITEM_ROW_NEUTRAL,
  walletGlassMenuItemRowSpacing,
} from "@/lib/walletGlassMenu";
import { Transaction } from "../types";
import { formatDate } from "../utils";
import {
  downloadTransactionsCsv,
  resolveTransactionsExportUserName,
} from "../../../utils/exportTransactionsCsv";

interface UseTableColumnsProps {
  onTransactionSelect?: (transaction: Transaction) => void;
  variant?: "default" | "modal";
  /** md2 slot: smaller status label, no colored dot */
  statusCompact?: boolean;
}

const SORTABLE_HEADER_CLASS =
  "inline-flex h-auto w-full items-center justify-start gap-0 border-none bg-transparent p-0 font-medium text-inherit shadow-none hover:bg-transparent hover:text-inherit focus-visible:outline-none focus-visible:ring-0";

/**
 * Hook for generating table columns configuration
 */
export function useTableColumns({
  onTransactionSelect,
  variant = "default",
  statusCompact = false,
}: UseTableColumnsProps) {
  const t = useTranslations("Transactions");
  const { data: session } = useSession();
  const exportUserName = resolveTransactionsExportUserName(
    (session?.user as { name?: string } | undefined)?.name,
  );

  const formatAmount = (amount: number, isIncoming: boolean) => {
    const sign = isIncoming ? "+" : "-";
    return (
      <span dir="ltr" className="font-medium text-[var(--color-text-primary)]">
        {sign}${amount.toFixed(2)}
      </span>
    );
  };

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase();

    let variant: "default" | "success" | "warning" | "error" = "default";
    let displayStatus = status;
    
    if (
      statusLower === "completed" ||
      statusLower === t("completed").toLowerCase()
    ) {
      variant = "success";
      displayStatus = "Complete";
    } else if (
      statusLower === "pending" ||
      statusLower === t("pending").toLowerCase()
    ) {
      variant = "warning";
      displayStatus = "Pending";
    } else if (
      statusLower === "failed" ||
      statusLower === t("failed").toLowerCase()
    ) {
      variant = "error";
      displayStatus = "Failed";
    }

    return (
      <Badge
        variant="plain"
        size="sm"
        className={cn(
          "text-white/70 !border-transparent !hover:border-transparent gap-2",
          statusCompact && "gap-0 !px-1.5 !py-0.5 !text-[10px]",
        )}
        style={{ backgroundColor: "rgba(255, 255, 255, 0.05)" }}
      >
        {!statusCompact && displayStatus === "Complete" && (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-success)]" />
        )}
        {!statusCompact && displayStatus === "Pending" && (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-warning)]" />
        )}
        {displayStatus}
      </Badge>
    );
  };

  const getCategoryBadge = (category: string) => {
    const capitalizedCategory = category.charAt(0).toUpperCase() + category.slice(1);
    return (
      <Badge 
        variant="plain" 
        size="sm" 
        className="text-white/70" 
        style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
      >
        {capitalizedCategory}
      </Badge>
    );
  };

  const columns: ColumnDef<Transaction>[] = [
    {
      id: "transaction",
      header: ({ column }) => (
        <button
          type="button"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className={SORTABLE_HEADER_CLASS}
        >
          {t("description")}
          <ArrowUpDown className="ml-2 h-4 w-4 shrink-0 opacity-70" />
        </button>
      ),
      accessorFn: (row) => `${row.name} ${row.type}`,
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px]",
              variant === "modal" ? "bg-white/5" : "bg-[var(--color-bg-input)]"
            )}
          >
            {row.original.isIncoming ? (
              <ArrowDownLeft className="w-4 h-4 text-[var(--color-success)]" />
            ) : (
              <ArrowUpRight className="w-4 h-4 text-[var(--color-error)]" />
            )}
          </div>
          <div style={{ minWidth: 0, overflow: "hidden" }}>
            <div
              className="text-[var(--color-text-primary)] font-medium"
              style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {row.original.name.replace(/^From\s+/i, "")}
            </div>
            <div
              className="text-[var(--color-text-muted)] text-sm"
              style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {row.original.type}
            </div>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "amount",
      header: ({ column }) => (
        <button
          type="button"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className={SORTABLE_HEADER_CLASS}
        >
          {t("amount")}
          <ArrowUpDown className="ml-2 h-4 w-4 shrink-0 opacity-70" />
        </button>
      ),
      cell: ({ row }) =>
        formatAmount(row.original.amount, row.original.isIncoming),
      sortingFn: (rowA, rowB) => {
        return rowA.original.amount - rowB.original.amount;
      },
    },
    {
      accessorKey: "category",
      header: () => <div className="text-left w-full">{t("category")}</div>,
      cell: ({ row }) => (
        <div className="flex justify-start w-full">
          {getCategoryBadge(row.original.category)}
        </div>
      ),
      filterFn: (row, id, value) => {
        const filterValues = (value as string[]).map((v: string) => v.toLowerCase());
        return filterValues.includes((row.getValue(id) as string).toLowerCase());
      },
    },
    {
      accessorKey: "type",
      id: "type",
      enableHiding: true,
      header: () => null,
      cell: () => null,
      filterFn: (row, id, value) => {
        const v = value as string[] | undefined;
        if (!v?.length) return true;
        const filterValues = v.map((s: string) => s.toLowerCase());
        return filterValues.includes((row.getValue(id) as string).toLowerCase());
      },
    },
    {
      accessorKey: "status",
      header: t("status"),
      cell: ({ row }) => getStatusBadge(row.original.status),
      filterFn: (row, id, value) => {
        const filterValues = (value as string[]).map((v: string) => v.toLowerCase());
        return filterValues.includes((row.getValue(id) as string).toLowerCase());
      },
    },
    {
      accessorKey: "date",
      header: ({ column }) => (
        <button
          type="button"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className={SORTABLE_HEADER_CLASS}
        >
          {t("date")}
          <ArrowUpDown className="ml-2 h-4 w-4 shrink-0 opacity-70" />
        </button>
      ),
      cell: ({ row }) => (
        <span className="text-white/70 whitespace-nowrap">
          {formatDate(row.original.date)}
        </span>
      ),
      sortingFn: (rowA, rowB) => {
        const dateA = new Date(rowA.original.date);
        const dateB = new Date(rowB.original.date);
        return dateA.getTime() - dateB.getTime();
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row, table }) => {
        const displayed = table.getRowModel().rows;
        const isLastRow = displayed.length > 0 && row.index === displayed.length - 1;

        const rowLabel = row.original.name || row.original.id;
        const actionRows: {
          label: string;
          Icon: typeof Eye;
          onSelect: () => void;
        }[] = [
          {
            label: t("viewDetails"),
            Icon: Eye,
            onSelect: () => {
              onTransactionSelect?.(row.original);
            },
          },
          {
            label: t("export"),
            Icon: Download,
            onSelect: () => {
              downloadTransactionsCsv([row.original], exportUserName);
            },
          },
        ];

        return (
          <div className="flex w-full items-center justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)]",
                    "text-white/50 transition-colors",
                    "hover:bg-white/[0.03] hover:text-white/65",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
                    "data-[state=open]:bg-white/[0.03] data-[state=open]:text-white/65"
                  )}
                  aria-label={`More options for ${rowLabel}`}
                >
                  <MoreHorizontal
                    className="pointer-events-none size-4 shrink-0 opacity-90"
                    strokeWidth={2.25}
                    aria-hidden
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                side={isLastRow ? "top" : "bottom"}
                sideOffset={6}
                className={WALLET_GLASS_MENU_CONTENT}
              >
                {actionRows.map(({ label, Icon, onSelect }, index) => {
                  const rowSpacing = walletGlassMenuItemRowSpacing(index, actionRows.length);
                  return (
                    <DropdownMenuItem
                      key={label}
                      textValue={label}
                      className={cn(
                        WALLET_GLASS_MENU_ITEM_ROW_BASE,
                        "!flex min-w-0 items-center gap-2",
                        rowSpacing,
                        WALLET_GLASS_MENU_ITEM_ROW_NEUTRAL
                      )}
                      onSelect={onSelect}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 opacity-90" strokeWidth={2.25} aria-hidden />
                      <span className="min-w-0 flex-1 text-left">{label}</span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  return columns;
}
